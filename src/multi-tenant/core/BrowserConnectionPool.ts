/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import puppeteer from 'puppeteer-core';
import type {Browser} from 'puppeteer-core';

import {logger} from '../../logger.js';
import type {
  BrowserConnection,
  BrowserConnectionStatus,
  BrowserPoolConfig,
  BrowserPoolStats,
} from '../types/browser-pool.types.js';

/**
 * 浏览器连接池
 *
 * 负责管理多个浏览器连接的生命周期
 */
export class BrowserConnectionPool {
  /** 浏览器连接存储 */
  #connections = new Map<string, BrowserConnection>();

  /** 用户浏览器索引 */
  #userConnections = new Map<string, string>();

  /** 配置 */
  #config: BrowserPoolConfig;

  /** 健康检查定时器 */
  #healthCheckInterval?: NodeJS.Timeout;

  constructor(config?: Partial<BrowserPoolConfig>) {
    this.#config = {
      healthCheckInterval: config?.healthCheckInterval ?? 30000, // 30 秒
      maxReconnectAttempts: config?.maxReconnectAttempts ?? 3,
      reconnectDelay: config?.reconnectDelay ?? 5000, // 5 秒
      connectionTimeout: config?.connectionTimeout ?? 10000, // 10 秒
    };
  }

  /**
   * 启动连接池
   */
  start(): void {
    logger('[BrowserConnectionPool] 启动连接池');

    // 定期健康检查
    this.#healthCheckInterval = setInterval(
      () => this.healthCheckAll(),
      this.#config.healthCheckInterval,
    );
  }

  /**
   * 停止连接池
   */
  async stop(): Promise<void> {
    logger('[BrowserConnectionPool] 停止连接池');

    if (this.#healthCheckInterval) {
      clearInterval(this.#healthCheckInterval);
      this.#healthCheckInterval = undefined;
    }

    // 断开所有连接
    await this.disconnectAll();
  }

  /**
   * 连接到浏览器
   *
   * @param userId - 用户 ID
   * @param browserURL - 浏览器调试 URL
   * @returns 浏览器实例
   * @throws {Error} 当连接失败时
   */
  async connect(userId: string, browserURL: string): Promise<Browser> {
    // 检查是否已有连接
    const existingBrowserId = this.#userConnections.get(userId);
    if (existingBrowserId) {
      const connection = this.#connections.get(existingBrowserId);
      if (connection && connection.status === 'connected') {
        // 双重检查：验证浏览器实际连接状态（防止TOCTOU竞态）
        if (connection.browser.isConnected()) {
          logger(`[BrowserConnectionPool] 复用现有连接: ${userId}`);
          return connection.browser;
        } else {
          // 状态不一致，标记为断开并创建新连接
          logger(
            `[BrowserConnectionPool] 检测到连接状态不一致，重新连接: ${userId}`,
          );
          connection.status = 'disconnected';
        }
      }
    }

    // 创建新连接
    const browserId = this.#generateBrowserId(userId);

    try {
      logger(`[BrowserConnectionPool] 连接到浏览器: ${browserURL}`);

      const browser = await this.#connectWithTimeout(browserURL);

      const connection: BrowserConnection = {
        browserId,
        browserURL,
        browser,
        userId,
        status: 'connected',
        lastHealthCheck: new Date(),
        reconnectAttempts: 0,
        createdAt: new Date(),
      };

      this.#connections.set(browserId, connection);
      this.#userConnections.set(userId, browserId);

      logger(`[BrowserConnectionPool] 连接成功: ${userId} (${browserId})`);

      // 监听浏览器断开事件（使用 once 避免重复触发）
      browser.once('disconnected', () => {
        this.#handleDisconnect(browserId);
      });

      return browser;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger(`[BrowserConnectionPool] 连接失败: ${userId} - ${message}`);
      throw new Error(`连接到浏览器失败: ${message}`);
    }
  }

  /**
   * 断开浏览器连接
   *
   * @param userId - 用户 ID
   * @returns 是否断开成功
   */
  async disconnect(userId: string): Promise<boolean> {
    const browserId = this.#userConnections.get(userId);
    if (!browserId) {
      return false;
    }

    const connection = this.#connections.get(browserId);
    if (!connection) {
      return false;
    }

    try {
      // 先移除所有事件监听器，防止 disconnect() 触发 disconnected 事件导致重连
      connection.browser.removeAllListeners('disconnected');

      // 断开 CDP 连接，但不关闭用户的 Chrome 进程
      // 注意：使用 disconnect() 而非 close()，这样服务重启不会关闭用户的浏览器
      await connection.browser.disconnect();
    } catch (error) {
      logger(`[BrowserConnectionPool] 断开浏览器连接失败: ${error}`);
    }

    this.#connections.delete(browserId);
    this.#userConnections.delete(userId);

    logger(`[BrowserConnectionPool] 连接已断开: ${userId}`);

    return true;
  }

  /**
   * 获取用户的浏览器实例
   *
   * @param userId - 用户 ID
   * @returns 浏览器实例，如果不存在则返回 undefined
   */
  getBrowser(userId: string): Browser | undefined {
    const browserId = this.#userConnections.get(userId);
    if (!browserId) {
      return undefined;
    }

    const connection = this.#connections.get(browserId);
    return connection?.browser;
  }

  /**
   * 获取连接信息
   *
   * @param userId - 用户 ID
   * @returns 连接信息，如果不存在则返回 undefined
   */
  getConnection(userId: string): BrowserConnection | undefined {
    const browserId = this.#userConnections.get(userId);
    if (!browserId) {
      return undefined;
    }

    return this.#connections.get(browserId);
  }

  /**
   * 检查连接是否存在
   *
   * @param userId - 用户 ID
   * @returns 是否存在
   */
  hasConnection(userId: string): boolean {
    return this.#userConnections.has(userId);
  }

  /**
   * 健康检查
   *
   * @param userId - 用户 ID
   * @returns 连接是否健康
   */
  async healthCheck(userId: string): Promise<boolean> {
    const browserId = this.#userConnections.get(userId);
    if (!browserId) {
      return false;
    }

    const connection = this.#connections.get(browserId);
    if (!connection) {
      return false;
    }

    try {
      // 检查浏览器是否连接
      const isConnected = connection.browser.isConnected();

      connection.lastHealthCheck = new Date();

      if (!isConnected) {
        connection.status = 'disconnected';
        await this.#reconnect(browserId);
        return false;
      }

      connection.status = 'connected';
      return true;
    } catch (error) {
      logger(`[BrowserConnectionPool] 健康检查失败: ${userId} - ${error}`);
      connection.status = 'disconnected';
      return false;
    }
  }

  /**
   * 对所有连接进行健康检查
   */
  async healthCheckAll(): Promise<void> {
    const checkPromises: Array<Promise<boolean>> = [];

    for (const userId of this.#userConnections.keys()) {
      checkPromises.push(this.healthCheck(userId));
    }

    await Promise.all(checkPromises);
  }

  /**
   * 断开所有连接
   */
  async disconnectAll(): Promise<void> {
    logger('[BrowserConnectionPool] 断开所有连接');

    const disconnectPromises: Array<Promise<boolean>> = [];

    for (const userId of this.#userConnections.keys()) {
      disconnectPromises.push(this.disconnect(userId));
    }

    await Promise.all(disconnectPromises);
  }

  /**
   * 获取连接池统计信息
   *
   * @returns 统计信息
   */
  getStats(): BrowserPoolStats {
    let connected = 0;
    let disconnected = 0;
    let reconnecting = 0;
    let failed = 0;

    const byUser = new Map<string, BrowserConnectionStatus>();

    for (const connection of this.#connections.values()) {
      switch (connection.status) {
        case 'connected':
          connected++;
          break;
        case 'disconnected':
          disconnected++;
          break;
        case 'reconnecting':
          reconnecting++;
          break;
        case 'failed':
          failed++;
          break;
      }

      byUser.set(connection.userId, connection.status);
    }

    return {
      total: this.#connections.size,
      connected,
      disconnected,
      reconnecting,
      failed,
      byUser,
    };
  }

  /**
   * 处理浏览器断开事件
   *
   * @param browserId - 浏览器 ID
   */
  #handleDisconnect(browserId: string): void {
    const connection = this.#connections.get(browserId);
    if (!connection) {
      return;
    }

    logger(`[BrowserConnectionPool] 浏览器断开: ${connection.userId}`);

    connection.status = 'disconnected';

    // 尝试重连
    void this.#reconnect(browserId);
  }

  /**
   * 重连到浏览器
   *
   * @param browserId - 浏览器 ID
   */
  async #reconnect(browserId: string): Promise<void> {
    const connection = this.#connections.get(browserId);
    if (!connection) {
      return;
    }

    // 检查重连次数
    if (connection.reconnectAttempts >= this.#config.maxReconnectAttempts) {
      logger(`[BrowserConnectionPool] 达到最大重连次数: ${connection.userId}`);
      connection.status = 'failed';
      return;
    }

    connection.status = 'reconnecting';
    connection.reconnectAttempts++;

    logger(
      `[BrowserConnectionPool] 尝试重连 (${connection.reconnectAttempts}/${this.#config.maxReconnectAttempts}): ${connection.userId}`,
    );

    // 指数退避 + 随机抖动防止雷鸣群效应
    const baseDelay = this.#config.reconnectDelay;
    const exponentialDelay = Math.min(
      baseDelay * Math.pow(2, connection.reconnectAttempts - 1),
      30000, // 最大30秒
    );
    const jitter = Math.random() * 1000; // 0-1000ms随机抖动
    const delay = exponentialDelay + jitter;

    await new Promise(resolve => setTimeout(resolve, delay));

    try {
      const browser = await this.#connectWithTimeout(connection.browserURL);

      // 先移除旧浏览器的监听器（如果存在）
      if (connection.browser) {
        connection.browser.removeAllListeners('disconnected');
      }

      connection.browser = browser;
      connection.status = 'connected';
      connection.reconnectAttempts = 0;
      connection.lastHealthCheck = new Date();

      logger(`[BrowserConnectionPool] 重连成功: ${connection.userId}`);

      // 监听新浏览器的断开事件（使用 once 避免重复）
      browser.once('disconnected', () => {
        this.#handleDisconnect(browserId);
      });
    } catch (error) {
      logger(
        `[BrowserConnectionPool] 重连失败: ${connection.userId} - ${error}`,
      );
      connection.status = 'failed';
    }
  }

  /**
   * 带超时的连接
   *
   * 确保定时器被清理，避免内存泄漏
   *
   * @param browserURL - 浏览器 URL
   * @returns 浏览器实例
   */
  async #connectWithTimeout(browserURL: string): Promise<Browser> {
    let timeoutId: NodeJS.Timeout;

    return Promise.race([
      puppeteer.connect({browserURL}).finally(() => {
        // 连接完成（成功或失败）时清理定时器
        clearTimeout(timeoutId);
      }),
      new Promise<Browser>((_, reject) => {
        timeoutId = setTimeout(
          () => reject(new Error('连接超时')),
          this.#config.connectionTimeout,
        );
      }),
    ]);
  }

  /**
   * 生成浏览器 ID
   *
   * @param userId - 用户 ID
   * @returns 浏览器 ID
   */
  #generateBrowserId(userId: string): string {
    return `browser_${userId}_${Date.now()}`;
  }
}
