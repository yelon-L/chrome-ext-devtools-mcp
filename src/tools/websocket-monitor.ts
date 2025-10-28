/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * WebSocket traffic monitoring tool
 */

import type {CDPSession} from 'puppeteer-core';
import z from 'zod';

import {ToolCategories} from './categories.js';
import {defineTool} from './ToolDefinition.js';

/**
 * WebSocket 帧数据
 */
interface WebSocketFrame {
  direction: 'sent' | 'received';
  timestamp: number;
  requestId: string;
  payloadData: string;
  opcode: number;
  mask: boolean;
}

/**
 * 帧类型映射（RFC 6455）
 */
const OPCODE_NAMES: Record<number, string> = {
  0: 'continuation',
  1: 'text',
  2: 'binary',
  8: 'close',
  9: 'ping',
  10: 'pong',
};

export const monitorWebSocketTraffic = defineTool({
  name: 'monitor_websocket_traffic',
  description: `Monitor WebSocket frame traffic on the selected page.

**Purpose**: Capture real-time WebSocket message data that flows between client and server.

**What it captures**:
- Sent frames (client → server)
- Received frames (server → client)
- Frame payload content
- Frame type (text/binary/ping/pong/close)
- Timestamps
- Frame size

**Use cases**:
- Debug WebSocket-based applications (chat, gaming, real-time data)
- Inspect message formats and protocols
- Monitor connection health (ping/pong)
- Analyze message frequency and patterns
- Troubleshoot WebSocket communication issues

**How it works**:
Uses Chrome DevTools Protocol (CDP) to listen to Network.webSocketFrame* events,
which provide access to the actual frame data that HTTPRequest API does not expose.

**⚠️ Important**:
- WebSocket connection must be established BEFORE starting monitoring
- Monitoring is time-limited to avoid memory issues
- Large payloads are automatically truncated for display
- Binary frames are shown in base64 encoding

**Tip**: Use \`list_network_requests\` with \`resourceTypes: ["websocket"]\` first to check if WebSocket connections exist.

**Example**: Monitor WebSocket traffic for 30 seconds on a chat application to see message exchanges.`,
  annotations: {
    category: ToolCategories.NETWORK,
    readOnlyHint: true,
  },
  schema: {
    duration: z
      .number()
      .positive()
      .optional()
      .default(30000)
      .describe('Monitoring duration in milliseconds. Default is 30 seconds.'),
    filterUrl: z
      .string()
      .optional()
      .describe('Filter frames by WebSocket URL pattern (case-insensitive substring match).'),
    maxFrames: z
      .number()
      .positive()
      .optional()
      .default(100)
      .describe('Maximum number of frames to capture. Default is 100.'),
    includeControlFrames: z
      .boolean()
      .optional()
      .default(false)
      .describe('Include control frames (ping/pong/close). Default is false.'),
  },
  handler: async (request, response, context) => {
    const {duration, filterUrl, maxFrames, includeControlFrames} = request.params;

    const page = context.getSelectedPage();
    let client: CDPSession | null = null;

    try {
      // 1. 创建 CDP Session
      client = await page.target().createCDPSession();
      
      // 2. 启用 Network 域
      await client.send('Network.enable');

      const frames: WebSocketFrame[] = [];
      const websocketUrls = new Map<string, string>();

      // 3. 监听 WebSocket 创建事件（获取 URL）
      client.on('Network.webSocketCreated', (event: any) => {
        websocketUrls.set(event.requestId, event.url);
      });

      // 4. 监听接收帧事件
      client.on('Network.webSocketFrameReceived', (event: any) => {
        const url = websocketUrls.get(event.requestId);
        
        // URL 过滤
        if (filterUrl && url && !url.toLowerCase().includes(filterUrl.toLowerCase())) {
          return;
        }

        // 控制帧过滤
        const opcode = event.response.opcode;
        if (!includeControlFrames && (opcode === 8 || opcode === 9 || opcode === 10)) {
          return;
        }

        // 限制数量
        if (frames.length >= maxFrames) {
          return;
        }

        frames.push({
          direction: 'received',
          timestamp: event.timestamp,
          requestId: event.requestId,
          payloadData: event.response.payloadData,
          opcode: event.response.opcode,
          mask: event.response.mask,
        });
      });

      // 5. 监听发送帧事件
      client.on('Network.webSocketFrameSent', (event: any) => {
        const url = websocketUrls.get(event.requestId);
        
        // URL 过滤
        if (filterUrl && url && !url.toLowerCase().includes(filterUrl.toLowerCase())) {
          return;
        }

        // 控制帧过滤
        const opcode = event.response.opcode;
        if (!includeControlFrames && (opcode === 8 || opcode === 9 || opcode === 10)) {
          return;
        }

        // 限制数量
        if (frames.length >= maxFrames) {
          return;
        }

        frames.push({
          direction: 'sent',
          timestamp: event.timestamp,
          requestId: event.requestId,
          payloadData: event.response.payloadData,
          opcode: event.response.opcode,
          mask: event.response.mask,
        });
      });

      response.appendResponseLine(`# WebSocket Traffic Monitor\n`);
      response.appendResponseLine(`**Monitoring Duration**: ${duration}ms`);
      if (filterUrl) {
        response.appendResponseLine(`**URL Filter**: ${filterUrl}`);
      }
      response.appendResponseLine(`**Started**: ${new Date().toLocaleString()}\n`);
      response.appendResponseLine('⏳ Capturing frames...\n');

      // 6. 等待指定时间
      await new Promise(resolve => setTimeout(resolve, duration));

      // 7. 格式化输出
      response.appendResponseLine(`\n## Capture Summary\n`);
      response.appendResponseLine(`**Total Frames**: ${frames.length}`);
      
      const sentCount = frames.filter(f => f.direction === 'sent').length;
      const receivedCount = frames.filter(f => f.direction === 'received').length;
      
      response.appendResponseLine(`- 📤 **Sent**: ${sentCount}`);
      response.appendResponseLine(`- 📥 **Received**: ${receivedCount}\n`);

      if (frames.length === 0) {
        response.appendResponseLine('*No WebSocket frames captured during monitoring period.*\n');
        response.appendResponseLine('**Possible reasons**:');
        response.appendResponseLine('- No WebSocket connections are active on this page');
        response.appendResponseLine('- WebSocket traffic did not occur during the monitoring window');
        response.appendResponseLine('- URL filter did not match any WebSocket connections');
        response.appendResponseLine('\n**Tips**:');
        response.appendResponseLine('- Ensure WebSocket connection is established before monitoring');
        response.appendResponseLine('- Use `list_network_requests` with `resourceTypes: ["websocket"]` to check connections');
        response.appendResponseLine('- Try increasing the `duration` parameter');
        response.setIncludePages(true);
        return;
      }

      // 按类型分组统计
      const byType = frames.reduce((acc, f) => {
        const typeName = OPCODE_NAMES[f.opcode] || `unknown(${f.opcode})`;
        acc[typeName] = (acc[typeName] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      response.appendResponseLine('**Frame Types**:');
      for (const [type, count] of Object.entries(byType)) {
        response.appendResponseLine(`- **${type}**: ${count}`);
      }
      response.appendResponseLine('');

      // 8. 显示帧详情
      response.appendResponseLine('## Frame Details\n');

      for (let i = 0; i < Math.min(frames.length, 50); i++) {
        const frame = frames[i];
        const icon = frame.direction === 'sent' ? '📤' : '📥';
        const time = new Date(frame.timestamp * 1000).toLocaleTimeString();
        const typeName = OPCODE_NAMES[frame.opcode] || `opcode ${frame.opcode}`;
        
        response.appendResponseLine(`### ${icon} ${frame.direction.toUpperCase()} - ${time}`);
        response.appendResponseLine(`**Type**: ${typeName}`);
        response.appendResponseLine(`**Masked**: ${frame.mask ? 'Yes' : 'No'}`);
        
        // 限制 payload 显示长度
        let payload = frame.payloadData;
        const isLarge = payload.length > 200;
        if (isLarge) {
          payload = payload.substring(0, 200) + '... (truncated)';
        }
        
        // 尝试解析 JSON (text frame)
        if (frame.opcode === 1) {
          try {
            const parsed = JSON.parse(frame.payloadData);
            response.appendResponseLine('**Payload** (JSON):');
            response.appendResponseLine('```json');
            response.appendResponseLine(JSON.stringify(parsed, null, 2));
            response.appendResponseLine('```');
          } catch {
            response.appendResponseLine(`**Payload** (text): ${payload}`);
          }
        } else if (frame.opcode === 2) {
          // Binary frame
          response.appendResponseLine(`**Payload** (binary, ${frame.payloadData.length} bytes): ${payload.substring(0, 50)}...`);
        } else {
          response.appendResponseLine(`**Payload**: ${payload}`);
        }
        
        response.appendResponseLine('');
      }

      if (frames.length > 50) {
        response.appendResponseLine(`\n*Showing first 50 of ${frames.length} frames*`);
      }

      response.appendResponseLine('\n**Tips**:');
      response.appendResponseLine('- Use `filterUrl` to focus on specific WebSocket connections');
      response.appendResponseLine('- Adjust `duration` based on expected traffic frequency');
      response.appendResponseLine('- Set `includeControlFrames: true` to see ping/pong activity');

    } catch (error) {
      // ✅ Following navigate_page_history pattern: simple error message
      response.appendResponseLine(
        `Unable to monitor WebSocket traffic. ${error instanceof Error ? error.message : String(error)}`
      );
    } finally {
      // 9. 清理 CDP Session
      if (client) {
        try {
          await client.detach();
        } catch {
          // Session 可能已断开，忽略错误
        }
      }
    }

    response.setIncludePages(true);
  },
});
