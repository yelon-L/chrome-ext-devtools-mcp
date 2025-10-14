/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import crypto from 'node:crypto';

import {logger} from '../../logger.js';
import type {
  AuthConfig,
  AuthResult,
  AuthToken,
  User,
} from '../types/auth.types.js';
import type {PersistentStore} from '../storage/PersistentStore.js';

/**
 * 认证管理器
 * 
 * 负责用户身份认证和授权
 */
export class AuthManager {
  /** 配置 */
  #config: AuthConfig;
  
  /** Token 存储 */
  #tokens = new Map<string, AuthToken>();
  
  /** 被撤销的 Token 集合 */
  #revokedTokens = new Set<string>();
  
  /** 持久化存储引用 */
  #store?: PersistentStore;

  constructor(config?: Partial<AuthConfig>) {
    this.#config = {
      tokenExpiration: config?.tokenExpiration ?? 86400, // 24 小时
      enabled: config?.enabled ?? true,
      type: config?.type ?? 'token',
      tokens: config?.tokens ?? new Map(),
    };

    // 初始化预定义 Token
    if (this.#config.tokens && this.#config.tokens.size > 0) {
      for (const [token, user] of this.#config.tokens) {
        this.#tokens.set(token, {
          token,
          userId: user.userId,
          permissions: user.permissions,
          expiresAt: new Date(Date.now() + this.#config.tokenExpiration * 1000),
        });
      }
      logger(`[AuthManager] 加载 ${this.#config.tokens.size} 个预定义 Token`);
    }
  }

  /**
   * 从持久化存储初始化 Token
   * 
   * @param store - 持久化存储实例
   */
  async initialize(store: PersistentStore): Promise<void> {
    this.#store = store;
    
    // 从存储加载所有 Token
    const tokens = store.getAllTokens();
    let loadedCount = 0;
    let revokedCount = 0;
    let expiredCount = 0;
    const now = new Date();
    
    for (const tokenRecord of tokens) {
      // 处理已撤销的 Token
      if (tokenRecord.isRevoked) {
        this.#revokedTokens.add(tokenRecord.token);
        revokedCount++;
        continue;
      }
      
      // 检查是否过期
      const expiresAt = tokenRecord.expiresAt 
        ? new Date(tokenRecord.expiresAt) 
        : null;
      
      if (expiresAt && expiresAt < now) {
        expiredCount++;
        continue;
      }
      
      // 加载有效 Token
      this.#tokens.set(tokenRecord.token, {
        token: tokenRecord.token,
        userId: tokenRecord.userId,
        permissions: tokenRecord.permissions,
        expiresAt: expiresAt || new Date(Date.now() + this.#config.tokenExpiration * 1000),
      });
      loadedCount++;
    }
    
    logger(`[AuthManager] 从持久化存储加载 Token:`);
    logger(`[AuthManager]   - 有效: ${loadedCount} 个`);
    if (revokedCount > 0) {
      logger(`[AuthManager]   - 已撤销: ${revokedCount} 个`);
    }
    if (expiredCount > 0) {
      logger(`[AuthManager]   - 已过期: ${expiredCount} 个`);
    }
  }

  /**
   * 认证请求
   * 
   * @param token - 认证 Token
   * @returns 认证结果
   */
  async authenticate(token: string): Promise<AuthResult> {
    // 如果未启用认证，直接返回成功
    if (!this.#config.enabled) {
      return {
        success: true,
        user: {
          userId: 'anonymous',
          permissions: ['*'],
        },
      };
    }

    // 检查 Token 是否为空
    if (!token || typeof token !== 'string') {
      return {
        success: false,
        error: 'Token 不能为空',
      };
    }

    // 检查 Token 是否被撤销
    if (this.#revokedTokens.has(token)) {
      return {
        success: false,
        error: 'Token 已被撤销',
      };
    }

    // 查找 Token
    const authToken = this.#tokens.get(token);
    if (!authToken) {
      return {
        success: false,
        error: 'Token 无效',
      };
    }

    // 检查是否过期
    if (authToken.expiresAt < new Date()) {
      this.#tokens.delete(token);
      return {
        success: false,
        error: 'Token 已过期',
      };
    }

    // 认证成功
    return {
      success: true,
      user: {
        userId: authToken.userId,
        permissions: authToken.permissions,
      },
    };
  }

  /**
   * 授权检查
   * 
   * @param user - 用户信息
   * @param action - 操作名称
   * @returns 是否有权限
   */
  authorize(user: User, action: string): boolean {
    // 拥有 * 权限表示全部权限
    if (user.permissions.includes('*')) {
      return true;
    }

    // 检查是否有具体权限
    return user.permissions.includes(action);
  }

  /**
   * 生成 Token
   * 
   * @param userId - 用户 ID
   * @param permissions - 权限列表
   * @param expiresIn - 过期时间（秒），默认使用配置值
   * @returns Token 字符串
   */
  generateToken(
    userId: string,
    permissions: string[],
    expiresIn?: number
  ): string {
    const token = this.#generateRandomToken();
    const expiration = expiresIn ?? this.#config.tokenExpiration;

    const authToken: AuthToken = {
      token,
      userId,
      permissions,
      expiresAt: new Date(Date.now() + expiration * 1000),
    };

    this.#tokens.set(token, authToken);

    logger(`[AuthManager] Token 已生成: ${userId}`);

    return token;
  }

  /**
   * 撤销 Token
   * 
   * @param token - Token 字符串
   * @returns 是否撤销成功
   */
  revokeToken(token: string): boolean {
    const authToken = this.#tokens.get(token);
    if (!authToken) {
      return false;
    }

    this.#tokens.delete(token);
    this.#revokedTokens.add(token);

    logger(`[AuthManager] Token 已撤销: ${authToken.userId}`);

    return true;
  }

  /**
   * 撤销用户的所有 Token
   * 
   * @param userId - 用户 ID
   * @returns 撤销的 Token 数量
   */
  revokeUserTokens(userId: string): number {
    let count = 0;

    for (const [token, authToken] of this.#tokens) {
      if (authToken.userId === userId) {
        this.#tokens.delete(token);
        this.#revokedTokens.add(token);
        count++;
      }
    }

    if (count > 0) {
      logger(`[AuthManager] 撤销用户 ${userId} 的 ${count} 个 Token`);
    }

    return count;
  }

  /**
   * 清理过期 Token
   */
  cleanupExpiredTokens(): void {
    const now = new Date();
    let count = 0;

    for (const [token, authToken] of this.#tokens) {
      if (authToken.expiresAt < now) {
        this.#tokens.delete(token);
        count++;
      }
    }

    if (count > 0) {
      logger(`[AuthManager] 清理 ${count} 个过期 Token`);
    }
  }

  /**
   * 获取用户的所有 Token
   * 
   * @param userId - 用户 ID
   * @returns Token 列表
   */
  getUserTokens(userId: string): AuthToken[] {
    const tokens: AuthToken[] = [];

    for (const authToken of this.#tokens.values()) {
      if (authToken.userId === userId) {
        tokens.push(authToken);
      }
    }

    return tokens;
  }

  /**
   * 检查 Token 是否存在
   * 
   * @param token - Token 字符串
   * @returns 是否存在
   */
  hasToken(token: string): boolean {
    return this.#tokens.has(token) && !this.#revokedTokens.has(token);
  }

  /**
   * 获取 Token 总数
   * 
   * @returns Token 数量
   */
  getTokenCount(): number {
    return this.#tokens.size;
  }

  /**
   * 是否启用认证
   * 
   * @returns 是否启用
   */
  isEnabled(): boolean {
    return this.#config.enabled;
  }

  /**
   * 生成密码学安全的随机 Token
   * 
   * 使用 crypto.randomBytes 而非 Math.random() 以确保安全性
   * 
   * @returns Token 字符串 (格式: mcp_<base64url>)
   */
  #generateRandomToken(): string {
    // 生成24字节(192位)的随机数据，base64url编码后约32字符
    // base64url 编码安全用于 URL 和 HTTP headers
    const randomBytes = crypto.randomBytes(24);
    const token = randomBytes.toString('base64url');
    
    return `mcp_${token}`;
  }

  /**
   * 从 HTTP 请求头中提取 Token
   * 
   * @param authorization - Authorization 头的值
   * @returns Token 字符串，如果无效则返回 undefined
   */
  static extractTokenFromHeader(authorization?: string): string | undefined {
    if (!authorization) {
      return undefined;
    }

    // 支持 Bearer Token
    const match = authorization.match(/^Bearer\s+(.+)$/i);
    if (match) {
      return match[1];
    }

    // 直接使用整个值作为 Token
    return authorization;
  }
}
