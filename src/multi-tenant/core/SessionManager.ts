/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {Browser} from 'puppeteer-core';
import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import type {SSEServerTransport} from '@modelcontextprotocol/sdk/server/sse.js';

import type {McpContext} from '../../McpContext.js';
import type {Session, SessionConfig, SessionStats} from '../types/session.types.js';
import {logger} from '../../logger.js';

/**
 * 会话管理器
 * 
 * 负责管理所有客户端 SSE 会话的生命周期
 */
export class SessionManager {
  /** 会话存储 */
  #sessions = new Map<string, Session>();
  
  /** 用户会话索引 */
  #userSessions = new Map<string, Set<string>>();
  
  /** 清理定时器 */
  #cleanupInterval?: NodeJS.Timeout;
  
  /** 配置 */
  #config: SessionConfig;

  constructor(config?: Partial<SessionConfig>) {
    this.#config = {
      timeout: config?.timeout ?? 3600000, // 1 小时
      cleanupInterval: config?.cleanupInterval ?? 60000, // 1 分钟
      maxSessions: config?.maxSessions,
    };
  }

  /**
   * 启动会话管理器
   */
  start(): void {
    logger('[SessionManager] 启动会话管理器');
    
    // 定期清理过期会话
    this.#cleanupInterval = setInterval(
      () => this.cleanupExpiredSessions(),
      this.#config.cleanupInterval
    );
  }

  /**
   * 停止会话管理器
   */
  stop(): void {
    logger('[SessionManager] 停止会话管理器');
    
    if (this.#cleanupInterval) {
      clearInterval(this.#cleanupInterval);
      this.#cleanupInterval = undefined;
    }
  }

  /**
   * 创建新会话
   * 
   * @param sessionId - 会话 ID
   * @param userId - 用户 ID
   * @param transport - SSE 传输层
   * @param server - MCP 服务器实例
   * @param context - MCP 上下文
   * @param browser - 浏览器实例
   * @returns 新创建的会话
   * @throws {Error} 当达到最大会话数限制时
   */
  createSession(
    sessionId: string,
    userId: string,
    transport: SSEServerTransport,
    server: McpServer,
    context: McpContext,
    browser: Browser
  ): Session {
    // 检查会话数限制
    if (this.#config.maxSessions && this.#sessions.size >= this.#config.maxSessions) {
      throw new Error(
        `达到最大会话数限制: ${this.#config.maxSessions}`
      );
    }

    const now = new Date();
    const session: Session = {
      sessionId,
      userId,
      transport,
      server,
      context,
      browser,
      createdAt: now,
      lastActivity: now,
    };

    this.#sessions.set(sessionId, session);

    // 更新用户会话索引
    if (!this.#userSessions.has(userId)) {
      this.#userSessions.set(userId, new Set());
    }
    this.#userSessions.get(userId)!.add(sessionId);

    logger(`[SessionManager] 会话已创建: ${sessionId} (用户: ${userId})`);

    return session;
  }

  /**
   * 获取会话
   * 
   * @param sessionId - 会话 ID
   * @returns 会话对象，如果不存在则返回 undefined
   */
  getSession(sessionId: string): Session | undefined {
    return this.#sessions.get(sessionId);
  }

  /**
   * 更新会话活跃时间
   * 
   * @param sessionId - 会话 ID
   */
  updateActivity(sessionId: string): void {
    const session = this.#sessions.get(sessionId);
    if (session) {
      session.lastActivity = new Date();
    }
  }

  /**
   * 删除会话
   * 
   * @param sessionId - 会话 ID
   * @returns 是否删除成功
   */
  async deleteSession(sessionId: string): Promise<boolean> {
    const session = this.#sessions.get(sessionId);
    if (!session) {
      return false;
    }

    // 先从存储中移除，防止重复删除
    this.#sessions.delete(sessionId);

    // 更新用户会话索引
    const userSessions = this.#userSessions.get(session.userId);
    if (userSessions) {
      userSessions.delete(sessionId);
      if (userSessions.size === 0) {
        this.#userSessions.delete(session.userId);
      }
    }

    try {
      // 解除 onclose 回调，防止循环调用
      session.transport.onclose = undefined;
      // 关闭传输层
      await session.transport.close();
    } catch (error) {
      logger(`[SessionManager] 关闭传输层失败: ${error}`);
    }

    logger(`[SessionManager] 会话已删除: ${sessionId}`);

    return true;
  }

  /**
   * 获取用户的所有会话
   * 
   * @param userId - 用户 ID
   * @returns 会话列表
   */
  getUserSessions(userId: string): Session[] {
    const sessionIds = this.#userSessions.get(userId);
    if (!sessionIds) {
      return [];
    }

    const sessions: Session[] = [];
    for (const sessionId of sessionIds) {
      const session = this.#sessions.get(sessionId);
      if (session) {
        sessions.push(session);
      }
    }

    return sessions;
  }

  /**
   * 清理用户的所有会话
   * 
   * @param userId - 用户 ID
   */
  async cleanupUserSessions(userId: string): Promise<void> {
    const sessionIds = this.#userSessions.get(userId);
    if (!sessionIds) {
      return;
    }

    const deletePromises: Promise<boolean>[] = [];
    for (const sessionId of sessionIds) {
      deletePromises.push(this.deleteSession(sessionId));
    }

    await Promise.all(deletePromises);

    logger(`[SessionManager] 用户会话已清理: ${userId}`);
  }

  /**
   * 清理过期会话
   */
  async cleanupExpiredSessions(): Promise<void> {
    const now = Date.now();
    const expiredSessions: string[] = [];

    for (const [sessionId, session] of this.#sessions) {
      const inactive = now - session.lastActivity.getTime();
      if (inactive > this.#config.timeout) {
        expiredSessions.push(sessionId);
      }
    }

    if (expiredSessions.length === 0) {
      return;
    }

    logger(
      `[SessionManager] 清理 ${expiredSessions.length} 个过期会话`
    );

    const deletePromises = expiredSessions.map(id => this.deleteSession(id));
    await Promise.all(deletePromises);
  }

  /**
   * 清理所有会话
   */
  async cleanupAll(): Promise<void> {
    logger('[SessionManager] 清理所有会话');

    const deletePromises: Promise<boolean>[] = [];
    for (const sessionId of this.#sessions.keys()) {
      deletePromises.push(this.deleteSession(sessionId));
    }

    await Promise.all(deletePromises);
  }

  /**
   * 获取会话统计信息
   * 
   * @returns 统计信息
   */
  getStats(): SessionStats {
    const byUser = new Map<string, number>();
    let active = 0;
    const now = Date.now();

    for (const session of this.#sessions.values()) {
      // 统计活跃会话
      const inactive = now - session.lastActivity.getTime();
      if (inactive < this.#config.timeout) {
        active++;
      }

      // 按用户统计
      const count = byUser.get(session.userId) ?? 0;
      byUser.set(session.userId, count + 1);
    }

    return {
      total: this.#sessions.size,
      active,
      byUser,
    };
  }

  /**
   * 检查会话是否存在
   * 
   * @param sessionId - 会话 ID
   * @returns 是否存在
   */
  hasSession(sessionId: string): boolean {
    return this.#sessions.has(sessionId);
  }

  /**
   * 获取所有会话 ID
   * 
   * @returns 会话 ID 列表
   */
  getAllSessionIds(): string[] {
    return Array.from(this.#sessions.keys());
  }
}
