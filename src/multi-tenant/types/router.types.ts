/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * 用户浏览器映射
 */
export interface UserBrowserMapping {
  /** 用户标识 */
  userId: string;
  /** 浏览器调试 URL */
  browserURL: string;
  /** 注册时间 */
  registeredAt: Date;
  /** 元数据 */
  metadata?: UserMetadata;
}

/**
 * 用户元数据
 */
export interface UserMetadata {
  /** 用户名 */
  name?: string;
  /** 邮箱 */
  email?: string;
  /** IP 地址 */
  ip?: string;
  /** User Agent */
  userAgent?: string;
  /** 自定义数据 */
  custom?: Record<string, unknown>;
}

/**
 * 路由统计信息
 */
export interface RouterStats {
  /** 注册用户总数 */
  totalUsers: number;
  /** 用户列表 */
  users: string[];
}
