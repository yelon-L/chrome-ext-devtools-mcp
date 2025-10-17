# WebSocket 监控工具原型

## 快速实现指南

基于项目现有的 CDP 使用经验，以下是 WebSocket 帧监控的原型实现。

## 完整实现代码

### 1. 创建工具文件

**文件**: `src/tools/websocket-monitor.ts`

```typescript
/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import z from 'zod';
import type {CDPSession} from 'puppeteer-core';

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
 * 帧类型映射
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
        response.appendResponseLine('\n**Tip**: Ensure WebSocket connection is established and active before monitoring.');
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
        
        // 尝试解析 JSON
        if (frame.opcode === 1) { // text frame
          try {
            const parsed = JSON.parse(frame.payloadData);
            response.appendResponseLine('**Payload** (JSON):');
            response.appendResponseLine('```json');
            response.appendResponseLine(JSON.stringify(parsed, null, 2));
            response.appendResponseLine('```');
          } catch {
            response.appendResponseLine(`**Payload** (text): ${payload}`);
          }
        } else if (frame.opcode === 2) { // binary frame
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
```

### 2. 注册工具

**文件**: `src/tools/registry.ts`

```typescript
// 在文件开头导入
import {monitorWebSocketTraffic} from './websocket-monitor.js';

// 在 TOOL_REGISTRY 中添加
export const TOOL_REGISTRY: ToolDefinition<ToolInputSchema>[] = [
  // ... existing tools ...
  
  // Network tools
  listNetworkRequests,
  getNetworkRequest,
  monitorWebSocketTraffic, // 🆕 新增
  
  // ... rest of tools ...
];
```

### 3. 更新工具分类

**文件**: `src/tools/categories.ts`

```typescript
export enum ToolCategories {
  // ... existing categories ...
  NETWORK = 'network',
}
```

## 使用示例

### 示例 1: 监控聊天应用

```javascript
// 1. 打开聊天页面
navigate_page({ url: 'https://chat.example.com' });

// 2. 等待 WebSocket 连接建立
await new Promise(resolve => setTimeout(resolve, 2000));

// 3. 开始监控 30 秒
monitor_websocket_traffic({ 
  duration: 30000 
});

// 4. 在监控期间发送消息（用户手动操作）

// 输出示例:
// # WebSocket Traffic Monitor
// **Total Frames**: 15
// - 📤 Sent: 7
// - 📥 Received: 8
//
// ## Frame Details
// ### 📤 SENT - 10:30:15
// **Type**: text
// **Payload** (JSON):
// {
//   "type": "message",
//   "text": "Hello",
//   "userId": "123"
// }
//
// ### 📥 RECEIVED - 10:30:16
// **Type**: text
// **Payload** (JSON):
// {
//   "type": "ack",
//   "messageId": "msg-456"
// }
```

### 示例 2: 过滤特定 WebSocket

```javascript
// 只监控包含 "api.example.com" 的 WebSocket
monitor_websocket_traffic({ 
  duration: 60000,
  filterUrl: 'api.example.com',
  maxFrames: 50
});
```

### 示例 3: 包含控制帧

```javascript
// 查看 ping/pong 心跳
monitor_websocket_traffic({ 
  duration: 30000,
  includeControlFrames: true
});

// 输出会包含:
// ### 📤 SENT - 10:30:20
// **Type**: ping
// **Payload**: (empty)
//
// ### 📥 RECEIVED - 10:30:20
// **Type**: pong
// **Payload**: (empty)
```

## 测试方法

### 1. 使用公开的 WebSocket 测试服务

```javascript
// 使用 websocket.org 的回显服务
navigate_page({ url: 'https://websocket.org/echo.html' });

// 等待页面加载
await new Promise(resolve => setTimeout(resolve, 3000));

// 开始监控
monitor_websocket_traffic({ duration: 60000 });

// 手动点击 "Connect" 然后发送消息
```

### 2. 创建测试页面

创建 `test-websocket.html`:

```html
<!DOCTYPE html>
<html>
<head>
  <title>WebSocket Test</title>
</head>
<body>
  <h1>WebSocket Test Page</h1>
  <button onclick="connect()">Connect</button>
  <button onclick="send()">Send Message</button>
  <div id="log"></div>
  
  <script>
    let ws;
    
    function connect() {
      ws = new WebSocket('wss://echo.websocket.org');
      
      ws.onopen = () => {
        log('Connected');
      };
      
      ws.onmessage = (event) => {
        log('Received: ' + event.data);
      };
      
      ws.onerror = (error) => {
        log('Error: ' + error);
      };
    }
    
    function send() {
      if (ws && ws.readyState === WebSocket.OPEN) {
        const message = JSON.stringify({
          type: 'test',
          timestamp: Date.now(),
          text: 'Hello WebSocket'
        });
        ws.send(message);
        log('Sent: ' + message);
      }
    }
    
    function log(message) {
      document.getElementById('log').innerHTML += '<p>' + message + '</p>';
    }
  </script>
</body>
</html>
```

## 性能考虑

### 1. 帧数量限制
- 默认限制 100 帧，防止内存溢出
- 高频应用（游戏）可能每秒数百帧

### 2. Payload 大小
- 自动截断超过 200 字符的 payload
- 二进制数据只显示前 50 字节

### 3. Session 清理
- 使用 `finally` 块确保 CDP Session 被正确 detach
- 避免 Session 泄漏导致内存问题

### 4. 时间窗口
- 默认 30 秒，可根据需求调整
- 长时间监控可能捕获大量数据

## 与现有工具的集成

### 配合 list_network_requests 使用

```javascript
// 1. 先查看所有 WebSocket 连接
list_network_requests({ 
  resourceTypes: ['websocket'] 
});

// 2. 针对性监控
monitor_websocket_traffic({ 
  filterUrl: '<从步骤1找到的URL>',
  duration: 60000
});
```

### 在 diagnose_extension_errors 中建议

当扩展使用 WebSocket 时，可以建议使用此工具：

```typescript
// 在 diagnostics.ts 中
if (extensionUsesWebSocket) {
  response.appendResponseLine(
    '💡 **Tip**: Use `monitor_websocket_traffic` to inspect WebSocket communication'
  );
}
```

## 文档更新

### 1. README.md

在 "Network Tools" 部分添加：

```markdown
#### `monitor_websocket_traffic`
Monitor real-time WebSocket frame traffic, capturing sent and received messages with full payload content.
```

### 2. 创建专门文档

`docs/WEBSOCKET_DEBUGGING.md`:
- WebSocket 调试最佳实践
- 常见问题排查
- 与 HTTP 调试的区别
- 实际应用案例

## 总结

这个原型实现：

✅ **完整功能**：捕获发送和接收的 WebSocket 帧
✅ **遵循模式**：使用项目现有的工具定义模式
✅ **性能安全**：限制数量、自动清理、截断大 payload
✅ **用户友好**：清晰的输出格式、有用的提示
✅ **可扩展**：易于添加新功能（统计、导出等）

实现工作量：**4-6 小时**
- 2h: 核心功能实现
- 1h: 测试和调试
- 1h: 文档和示例
- 1h: 集成和优化
