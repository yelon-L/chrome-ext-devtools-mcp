# WebSocket 数据访问支持分析

## 问题

用户问："当前所有的工具中，是否支持访问ws传输的数据？"

## 现状分析

### ✅ 当前支持的部分

#### 1. **网络请求工具可以过滤 WebSocket**

**文件**: `src/tools/network.ts` (第25行)

```typescript
const FILTERABLE_RESOURCE_TYPES = [
  'document',
  'stylesheet',
  // ...
  'websocket',  // ✅ 支持过滤
  // ...
];
```

**工具**: `list_network_requests`
```javascript
// 可以过滤显示 WebSocket 连接
list_network_requests({
  resourceTypes: ['websocket']
})
```

#### 2. **可以检测到 WebSocket 连接建立**

通过 Puppeteer 的 `page.on('request')` 事件，可以捕获到：
- WebSocket 连接请求 (ws:// 或 wss://)
- 握手请求的 URL
- 请求头信息
- 连接状态（成功/失败）

### ❌ 当前缺失的部分

#### 1. **无法访问 WebSocket 帧数据**

**问题**：Puppeteer 的 `HTTPRequest` API **不包含** WebSocket 帧内容
- ❌ 接收到的消息（frames received）
- ❌ 发送的消息（frames sent）
- ❌ 消息时间戳
- ❌ 消息大小
- ❌ Ping/Pong 帧

**原因**：
```typescript
// 当前实现 - src/McpContext.ts (第121-123行)
page.on('request', request => {
  collect(request);  // HTTPRequest 只包含初始握手，不包含帧数据
});
```

Puppeteer 的 `page.on('request')` 只触发一次（握手时），之后的帧传输不会触发此事件。

#### 2. **Chrome DevTools 中可见的 WebSocket 数据我们看不到**

Chrome DevTools 的 **Network > WS** 标签可以显示：
- Messages 列表
- 每条消息的内容
- 发送/接收时间
- 数据大小
- Opcode (text/binary/ping/pong)

**但我们的工具无法获取这些信息**，因为没有监听相应的 CDP 事件。

## 技术方案：如何支持 WebSocket 帧监控

### CDP 提供的 WebSocket 事件

Chrome DevTools Protocol 提供了完整的 WebSocket 监控能力：

#### 关键事件

| CDP 事件 | 用途 | 数据内容 |
|---------|------|---------|
| `Network.webSocketCreated` | WebSocket 创建 | RequestId, URL, Initiator |
| `Network.webSocketWillSendHandshakeRequest` | 握手请求 | Headers, URL |
| `Network.webSocketHandshakeResponseReceived` | 握手响应 | Headers, Status |
| `Network.webSocketFrameSent` | **发送帧** | **Payload, Opcode, Mask** |
| `Network.webSocketFrameReceived` | **接收帧** | **Payload, Opcode, Mask** |
| `Network.webSocketFrameError` | 帧错误 | Error message |
| `Network.webSocketClosed` | 连接关闭 | Timestamp |

**文档**: https://chromedevtools.github.io/devtools-protocol/1-3/Network/

### 实现方案

#### 方案 A：创建 WebSocket 监控工具（推荐）

**新增工具**：`monitor_websocket_traffic`

```typescript
// src/tools/websocket-monitor.ts
export const monitorWebSocketTraffic = defineTool({
  name: 'monitor_websocket_traffic',
  description: 'Monitor WebSocket frame traffic on the selected page',
  schema: {
    duration: z.number().optional().default(30000)
      .describe('Monitoring duration in milliseconds'),
    filterUrl: z.string().optional()
      .describe('Filter by WebSocket URL pattern'),
  },
  handler: async (request, response, context) => {
    const page = context.getSelectedPage();
    const client = await page.target().createCDPSession();
    
    // 启用 Network 域
    await client.send('Network.enable');
    
    const frames: WebSocketFrame[] = [];
    
    // 监听帧接收事件
    client.on('Network.webSocketFrameReceived', (event) => {
      frames.push({
        direction: 'received',
        timestamp: event.timestamp,
        requestId: event.requestId,
        payload: event.response.payloadData,
        opcode: event.response.opcode,
        mask: event.response.mask,
      });
    });
    
    // 监听帧发送事件
    client.on('Network.webSocketFrameSent', (event) => {
      frames.push({
        direction: 'sent',
        timestamp: event.timestamp,
        requestId: event.requestId,
        payload: event.response.payloadData,
        opcode: event.response.opcode,
        mask: event.response.mask,
      });
    });
    
    // 等待指定时间
    await new Promise(resolve => 
      setTimeout(resolve, request.params.duration)
    );
    
    // 格式化输出
    response.appendResponseLine(`# WebSocket Traffic\n`);
    response.appendResponseLine(`**Captured**: ${frames.length} frames\n`);
    
    for (const frame of frames) {
      const icon = frame.direction === 'sent' ? '📤' : '📥';
      response.appendResponseLine(
        `${icon} **${frame.direction.toUpperCase()}** - ${new Date(frame.timestamp * 1000).toLocaleTimeString()}`
      );
      response.appendResponseLine(`**Payload**: ${frame.payload}`);
      response.appendResponseLine('');
    }
    
    await client.detach();
    response.setIncludePages(true);
  },
});
```

#### 方案 B：增强现有 network 工具

扩展 `get_network_request` 工具，当请求类型是 `websocket` 时，附加帧数据。

**优点**：
- 与现有工具集成
- 用户体验一致

**缺点**：
- WebSocket 是长连接，帧数据是实时的
- 需要异步监控机制

#### 方案 C：创建 WebSocket 收集器

类似于 `NetworkCollector`，创建 `WebSocketCollector`：

```typescript
// src/PageCollector.ts
export class WebSocketCollector extends PageCollector<WebSocketFrame> {
  async init() {
    const pages = await this.browser.pages();
    for (const page of pages) {
      await this.#initializePage(page);
    }
  }
  
  async #initializePage(page: Page) {
    const client = await page.target().createCDPSession();
    await client.send('Network.enable');
    
    const frames: WebSocketFrame[] = [];
    this.storage.set(page, frames);
    
    client.on('Network.webSocketFrameReceived', (event) => {
      frames.push(this.#parseFrame(event, 'received'));
    });
    
    client.on('Network.webSocketFrameSent', (event) => {
      frames.push(this.#parseFrame(event, 'sent'));
    });
  }
}
```

**在 `McpContext` 中集成**：
```typescript
// src/McpContext.ts
export class McpContext {
  #websocketCollector: WebSocketCollector;
  
  constructor() {
    this.#websocketCollector = new WebSocketCollector(this.browser);
  }
  
  getWebSocketFrames(): WebSocketFrame[] {
    const page = this.getSelectedPage();
    return this.#websocketCollector.getData(page);
  }
}
```

## 对比：HTTP vs WebSocket 监控

| 特性 | HTTP 请求 | WebSocket 帧 |
|-----|----------|-------------|
| **触发频率** | 每个请求一次 | 实时，高频 |
| **数据大小** | 通常较大 | 可能很小（如 ping） |
| **Puppeteer 原生支持** | ✅ `page.on('request')` | ❌ 需要 CDP |
| **当前工具支持** | ✅ 完整 | ❌ 缺失 |
| **实现复杂度** | 简单 | 中等 |
| **性能影响** | 很小 | 需要管理大量事件 |

## 实现优先级建议

### P0: 基础 WebSocket 监控（推荐）
- ✅ 创建 `monitor_websocket_traffic` 工具
- ✅ 支持实时捕获帧数据
- ✅ 支持时间窗口过滤
- ✅ 显示发送/接收方向
- ✅ 显示 payload 内容

**预估工作量**: 4-6 小时
**价值**: 填补功能空白，支持 WebSocket 调试

### P1: 增强功能
- 支持 URL 过滤
- 支持 Opcode 解析（text/binary/ping/pong/close）
- 二进制数据的 hex 显示
- 帧大小统计
- 连接生命周期追踪

**预估工作量**: 3-4 小时

### P2: 集成到现有工具
- `list_network_requests` 显示 WebSocket 连接
- `get_network_request` 对 WebSocket 显示帧历史
- 在页面快照中包含 WebSocket 状态

**预估工作量**: 2-3 小时

## 技术注意事项

### 1. CDP Session 管理
- 每个 Page 需要独立的 CDP Session
- 需要在页面关闭时清理 Session
- 避免 Session 泄漏

### 2. 性能考虑
- WebSocket 可能高频传输（如游戏、实时通讯）
- 需要限制存储的帧数量（环形缓冲区）
- 大 payload 需要截断显示

### 3. 数据格式
- Text 帧：直接显示
- Binary 帧：Base64 或 Hex 编码
- 控制帧（Ping/Pong）：特殊标记

### 4. 时序问题
- WebSocket 可能在监控开始前已建立
- 需要处理监控期间的连接建立/关闭
- 帧的时间戳使用 MonotonicTime

## 示例用例

### 用例 1：调试 WebSocket 聊天应用
```javascript
// 1. 打开聊天页面
navigate_page({ url: 'https://chat.example.com' });

// 2. 开始监控
monitor_websocket_traffic({ duration: 60000 });

// 3. 发送消息（用户手动操作）

// 4. 查看捕获的帧
// 输出:
// 📤 SENT - 10:30:15
// Payload: {"type":"message","text":"Hello"}
//
// 📥 RECEIVED - 10:30:16
// Payload: {"type":"ack","messageId":"123"}
```

### 用例 2：检测 WebSocket 连接问题
```javascript
// 1. 过滤只看 WebSocket
list_network_requests({ 
  resourceTypes: ['websocket'] 
});

// 2. 检查握手状态
get_network_request({ 
  url: 'wss://example.com/socket' 
});
// 输出: [success - 101] (Switching Protocols)

// 3. 监控帧数据
monitor_websocket_traffic({ 
  filterUrl: 'example.com',
  duration: 30000 
});
```

## 现有项目中的 CDP 使用

我们的项目已经在多处使用 CDP Session：

1. **`ExtensionHelper`** - 扩展调试
   - `Target.getTargets` - 获取扩展上下文
   - `Runtime.evaluate` - 在扩展中执行代码

2. **`CdpOperations`** - CDP 高频操作
   - 已有 CDP Session 管理框架

3. **`CdpTargetManager`** - Target 管理
   - 浏览器级别的 CDP Session

**结论**：我们有成熟的 CDP 使用经验，实现 WebSocket 监控是自然的扩展。

## 总结

### 当前状态
- ✅ **可以**：检测 WebSocket 连接建立
- ✅ **可以**：过滤显示 WebSocket 类型的请求
- ❌ **不可以**：访问 WebSocket 帧数据（消息内容）
- ❌ **不可以**：查看实时消息传输
- ❌ **不可以**：统计消息频率和大小

### 推荐方案
**创建新工具 `monitor_websocket_traffic`**：
- 使用 CDP `Network.webSocketFrame*` 事件
- 实时捕获发送/接收的帧
- 支持时间窗口和 URL 过滤
- 遵循现有工具的设计模式

### 实现路径
1. **Phase 1** (4-6h)：基础监控功能
2. **Phase 2** (3-4h)：增强功能（过滤、统计）
3. **Phase 3** (2-3h)：与现有工具集成

### 预期收益
- 完整的 WebSocket 调试能力
- 与 Chrome DevTools 的 WS 标签功能对等
- 支持实时应用（聊天、游戏、金融）的调试
- AI 可以分析 WebSocket 通信模式

## 相关文档

- [Chrome DevTools Protocol - Network Domain](https://chromedevtools.github.io/devtools-protocol/1-3/Network/)
- [Puppeteer CDP Session](https://pptr.dev/api/puppeteer.cdpsession)
- [WebSocket Protocol (RFC 6455)](https://tools.ietf.org/html/rfc6455)

## 下一步行动

1. **用户确认**：是否需要此功能？优先级如何？
2. **原型开发**：创建最小可行的 WebSocket 监控工具
3. **测试验证**：使用真实的 WebSocket 应用测试
4. **文档完善**：添加使用示例和最佳实践
