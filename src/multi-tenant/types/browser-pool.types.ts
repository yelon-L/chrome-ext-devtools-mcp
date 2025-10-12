/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {Browser} from 'puppeteer-core';

/**
 * 浏览器连接状态
 */
export type BrowserConnectionStatus = 
  | 'connected' 
  | 'disconnected' 
  | 'reconnecting' 
  | 'failed';

/**
 * 浏览器连接
 */
export interface BrowserConnection {
  /** 浏览器标识 */
  browserId: string;
  /** 浏览器调试 URL */
  browserURL: string;
  /** Puppeteer 浏览器实例 */
  browser: Browser;
  /** 关联的用户 ID */
  userId: string;
  /** 连接状态 */
  status: BrowserConnectionStatus;
  /** 最后健康检查时间 */
  lastHealthCheck: Date;
  /** 重连尝试次数 */
  reconnectAttempts: number;
  /** 创建时间 */
  createdAt: Date;
}

/**
 * 浏览器连接池配置
 */
export interface BrowserPoolConfig {
  /** 健康检查间隔（毫秒）*/
  healthCheckInterval: number;
  /** 最大重连次数 */
  maxReconnectAttempts: number;
  /** 重连延迟（毫秒）*/
  reconnectDelay: number;
  /** 连接超时（毫秒）*/
  connectionTimeout: number;
}

/**
 * 连接池统计信息
 */
export interface BrowserPoolStats {
  /** 总连接数 */
  total: number;
  /** 已连接数 */
  connected: number;
  /** 断开连接数 */
  disconnected: number;
  /** 重连中数 */
  reconnecting: number;
  /** 失败数 */
  failed: number;
  /** 按用户分组 */
  byUser: Map<string, BrowserConnectionStatus>;
}
