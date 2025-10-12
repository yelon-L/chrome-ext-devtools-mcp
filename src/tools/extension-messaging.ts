/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * 扩展消息追踪工具
 * 
 * 提供两个工具：
 * 1. monitor_extension_messages - 监控消息传递
 * 2. trace_extension_api_calls - 追踪 API 调用（简化版）
 */

import {z} from 'zod';

import {ToolCategories} from './categories.js';
import {defineTool} from './ToolDefinition.js';

/**
 * 消息事件类型定义（匹配 Context 返回类型）
 */
interface ExtensionMessage {
  timestamp: number;
  type: 'sent' | 'received';
  method: string;
  message: unknown;
  sender?: unknown;
  tabId?: number;
}

/**
 * 监控扩展消息传递
 * 捕获 runtime.sendMessage, tabs.sendMessage 和 runtime.onMessage 事件
 */
export const monitorExtensionMessages = defineTool({
  name: 'monitor_extension_messages',
  description: `Monitor extension message passing in real-time.

Captures chrome.runtime.sendMessage, chrome.tabs.sendMessage calls and chrome.runtime.onMessage events.
Useful for debugging communication between different parts of an extension (background, content scripts, popup).

**Monitored events**:
- runtime.sendMessage - Messages sent via runtime API
- tabs.sendMessage - Messages sent to specific tabs
- runtime.onMessage - Messages received by the extension

**Usage tips**:
- Start monitoring before triggering the action you want to debug
- Default duration is 30 seconds
- Messages are captured in chronological order
- Sender information includes tab, URL, and frame details`,
  annotations: {
    category: ToolCategories.EXTENSION_DEBUGGING,
    readOnlyHint: true,
  },
  schema: {
    extensionId: z
      .string()
      .regex(/^[a-z]{32}$/)
      .describe('Extension ID (32 lowercase letters)'),
    duration: z
      .number()
      .positive()
      .optional()
      .describe('Monitoring duration in milliseconds. Default is 30000 (30 seconds).'),
    messageTypes: z
      .array(z.enum(['runtime', 'tabs', 'external']))
      .optional()
      .describe('Types of messages to monitor. Default is ["runtime", "tabs"].'),
  },
  handler: async (request, response, context) => {
    const {
      extensionId,
      duration = 30000,
      messageTypes = ['runtime', 'tabs'],
    } = request.params;

    try {
      response.appendResponseLine(`# Extension Message Monitoring\n`);
      response.appendResponseLine(`**Extension ID**: ${extensionId}`);
      response.appendResponseLine(`**Duration**: ${duration / 1000} seconds`);
      response.appendResponseLine(`**Message Types**: ${messageTypes.join(', ')}\n`);
      response.appendResponseLine(`⏳ Monitoring started... Please trigger actions in the extension.\n`);

      const messages = await context.monitorExtensionMessages(
        extensionId,
        duration,
        messageTypes,
      );

      response.appendResponseLine(`\n## Captured Messages (${messages.length})\n`);

      if (messages.length === 0) {
        response.appendResponseLine('*No messages captured during the monitoring period*\n');
        response.appendResponseLine('**Suggestions**:');
        response.appendResponseLine('- Increase monitoring duration');
        response.appendResponseLine('- Ensure the extension is actively sending/receiving messages');
        response.appendResponseLine('- Check if Service Worker is active');
      } else {
        messages.forEach((msg: ExtensionMessage, index: number) => {
          const time = new Date(msg.timestamp).toLocaleTimeString();
          const icon = msg.type === 'sent' ? '📤' : '📥';
          
          response.appendResponseLine(`### ${icon} Message ${index + 1} - ${msg.method}`);
          response.appendResponseLine(`**Time**: ${time}`);
          response.appendResponseLine(`**Type**: ${msg.type}`);
          
          if (msg.tabId) {
            response.appendResponseLine(`**Tab ID**: ${msg.tabId}`);
          }
          
          if (msg.sender) {
            response.appendResponseLine(`**Sender**: \`\`\`json\n${JSON.stringify(msg.sender, null, 2)}\n\`\`\``);
          }
          
          response.appendResponseLine(`**Message**: \`\`\`json\n${JSON.stringify(msg.message, null, 2)}\n\`\`\``);
          response.appendResponseLine('');
        });

        // 统计信息
        const sentCount = messages.filter((m: ExtensionMessage) => m.type === 'sent').length;
        const receivedCount = messages.filter((m: ExtensionMessage) => m.type === 'received').length;
        
        response.appendResponseLine(`\n## Statistics\n`);
        response.appendResponseLine(`- **Total Messages**: ${messages.length}`);
        response.appendResponseLine(`- **Sent**: ${sentCount}`);
        response.appendResponseLine(`- **Received**: ${receivedCount}`);
      }

      response.setIncludePages(true);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to monitor messages: ${message}`);
    }
  },
});

/**
 * 追踪扩展 API 调用（简化版）
 * 当前实现：通过消息监控推断 API 使用情况
 */
export const traceExtensionApiCalls = defineTool({
  name: 'trace_extension_api_calls',
  description: `Track chrome.* API calls made by an extension.

**Note**: This is a simplified version that primarily tracks message-related APIs.
For full API tracing, use browser DevTools Performance profiler.

**Tracked APIs**:
- chrome.runtime.sendMessage
- chrome.tabs.sendMessage
- chrome.runtime.onMessage

**Use cases**:
- Understand extension's communication patterns
- Debug message flow between components
- Identify excessive API usage`,
  annotations: {
    category: ToolCategories.EXTENSION_DEBUGGING,
    readOnlyHint: true,
  },
  schema: {
    extensionId: z
      .string()
      .regex(/^[a-z]{32}$/)
      .describe('Extension ID (32 lowercase letters)'),
    duration: z
      .number()
      .positive()
      .optional()
      .describe('Monitoring duration in milliseconds. Default is 30000 (30 seconds).'),
    apiFilter: z
      .array(z.string())
      .optional()
      .describe('API categories to track. Currently supports ["runtime", "tabs"].'),
  },
  handler: async (request, response, context) => {
    const {
      extensionId,
      duration = 30000,
      apiFilter = ['runtime', 'tabs'],
    } = request.params;

    try {
      response.appendResponseLine(`# Extension API Call Tracking\n`);
      response.appendResponseLine(`**Extension ID**: ${extensionId}`);
      response.appendResponseLine(`**Duration**: ${duration / 1000} seconds`);
      response.appendResponseLine(`**API Filter**: ${apiFilter.join(', ')}\n`);

      const messageTypes = apiFilter.filter(
        api => api === 'runtime' || api === 'tabs'
      ) as Array<'runtime' | 'tabs'>;

      const messages = await context.monitorExtensionMessages(
        extensionId,
        duration,
        messageTypes.length > 0 ? messageTypes : ['runtime', 'tabs'],
      );

      // 统计 API 调用
      const apiCalls: Record<string, number> = {};
      messages.forEach((msg: ExtensionMessage) => {
        apiCalls[msg.method] = (apiCalls[msg.method] || 0) + 1;
      });

      response.appendResponseLine(`\n## API Call Summary\n`);
      
      if (Object.keys(apiCalls).length === 0) {
        response.appendResponseLine('*No API calls detected during monitoring*');
      } else {
        response.appendResponseLine('| API Method | Call Count |');
        response.appendResponseLine('|------------|------------|');
        
        Object.entries(apiCalls)
          .sort((a, b) => b[1] - a[1])
          .forEach(([method, count]) => {
            response.appendResponseLine(`| ${method} | ${count} |`);
          });

        response.appendResponseLine(`\n**Total API Calls**: ${messages.length}`);
        
        // 分析高频调用
        const highFrequency = Object.entries(apiCalls).filter(([, count]) => count > 10);
        if (highFrequency.length > 0) {
          response.appendResponseLine(`\n⚠️  **High Frequency APIs** (>10 calls):`);
          highFrequency.forEach(([method, count]) => {
            response.appendResponseLine(`- ${method}: ${count} calls`);
          });
          response.appendResponseLine('\n💡 Consider optimizing these API calls to improve performance.');
        }
      }

      response.setIncludePages(true);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to trace API calls: ${message}`);
    }
  },
});
