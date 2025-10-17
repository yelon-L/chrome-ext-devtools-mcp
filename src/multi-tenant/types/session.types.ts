/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import type {SSEServerTransport} from '@modelcontextprotocol/sdk/server/sse.js';
import type {Browser} from 'puppeteer-core';

import type {McpContext} from '../../McpContext.js';

/**
 * 会话信息
 */
export interface Session {
  /** 会话唯一标识 */
  sessionId: string;
  /** 用户标识 */
  userId: string;
  /** SSE 传输层 */
  transport: SSEServerTransport;
  /** MCP 服务器实例 */
  server: McpServer;
  /** MCP 上下文 */
  context: McpContext;
  /** 浏览器实例 */
  browser: Browser;
  /** 创建时间 */
  createdAt: Date;
  /** 最后活跃时间 */
  lastActivity: Date;
  /** 是否为持久连接（单客户端模式，永不超时） */
  persistent?: boolean;
}

/**
 * 会话统计信息
 */
export interface SessionStats {
  /** 总会话数 */
  total: number;
  /** 活跃会话数 */
  active: number;
  /** 按用户分组的会话数 */
  byUser: Map<string, number>;
}

/**
 * 会话配置
 */
export interface SessionConfig {
  /** 会话超时时间（毫秒）*/
  timeout: number;
  /** 清理检查间隔（毫秒）*/
  cleanupInterval: number;
  /** 最大会话数 */
  maxSessions?: number;
  /** 持久连接模式（用于单客户端场景，禁用超时断连） */
  persistentMode?: boolean;
}
