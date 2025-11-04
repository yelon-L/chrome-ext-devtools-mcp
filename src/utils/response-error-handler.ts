/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Response 错误处理工具
 *
 * 为 HTTP Response 添加错误处理，防止客户端断开时触发未捕获的异常
 */

import type {ServerResponse} from 'node:http';

import {logger} from '../logger.js';

/**
 * 为 HTTP Response 添加错误处理
 *
 * 防止客户端断开时触发未捕获的异常（ECONNRESET, EPIPE）
 *
 * @param res - HTTP ServerResponse 对象
 * @param context - 上下文标识（用于日志）
 *
 * @example
 * ```typescript
 * // SSE 模式
 * if (url.pathname === '/sse') {
 *   setupResponseErrorHandling(res, 'SSE');
 *   const transport = new SSEServerTransport('/message', res);
 * }
 *
 * // HTTP 模式
 * if (url.pathname === '/mcp') {
 *   setupResponseErrorHandling(res, 'HTTP');
 *   await session.transport.handleRequest(req, res);
 * }
 * ```
 */
export function setupResponseErrorHandling(
  res: ServerResponse,
  context: string,
): void {
  // 添加错误监听器
  res.on('error', (error: NodeJS.ErrnoException) => {
    // 客户端断开是预期的，使用 log 级别
    if (error.code === 'ECONNRESET' || error.code === 'EPIPE') {
      logger(
        `[${context}] Client disconnected during response (expected behavior)`,
      );
    } else {
      // 其他错误使用 error 级别
      logger(`[${context}] Response error: ${error.message}`);
    }
  });

  // 防止重复监听和内存泄漏
  // 当响应完成时，移除所有错误监听器
  res.once('finish', () => {
    res.removeAllListeners('error');
  });

  // 同时监听 close 事件（连接意外关闭）
  res.once('close', () => {
    // 如果响应还没有完成就关闭了，说明是客户端断开
    if (!res.writableEnded) {
      logger(`[${context}] Connection closed before response completed`);
    }
    res.removeAllListeners('error');
  });
}
