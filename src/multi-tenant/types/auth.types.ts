/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * 认证 Token
 */
export interface AuthToken {
  /** Token 字符串 */
  token: string;
  /** 用户标识 */
  userId: string;
  /** 权限列表 */
  permissions: string[];
  /** 过期时间 */
  expiresAt: Date;
}

/**
 * 用户信息
 */
export interface User {
  /** 用户标识 */
  userId: string;
  /** 用户名 */
  name?: string;
  /** 邮箱 */
  email?: string;
  /** 权限列表 */
  permissions: string[];
}

/**
 * 认证配置
 */
export interface AuthConfig {
  /** Token 过期时间（秒）*/
  tokenExpiration: number;
  /** 是否启用认证 */
  enabled: boolean;
  /** 认证类型 */
  type: 'token' | 'basic' | 'none';
  /** 预定义 Token 列表 */
  tokens?: Map<string, User>;
}

/**
 * 认证结果
 */
export interface AuthResult {
  /** 是否认证成功 */
  success: boolean;
  /** 用户信息 */
  user?: User;
  /** 错误信息 */
  error?: string;
}
