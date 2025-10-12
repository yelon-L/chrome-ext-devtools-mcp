/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  AuthConfig,
  AuthResult,
  AuthToken,
  User,
} from '../types/auth.types.js';
import {logger} from '../../logger.js';

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
   * 生成随机 Token
   * 
   * @returns Token 字符串
   */
  #generateRandomToken(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const length = 32;
    let token = '';
    
    for (let i = 0; i < length; i++) {
      token += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    
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
