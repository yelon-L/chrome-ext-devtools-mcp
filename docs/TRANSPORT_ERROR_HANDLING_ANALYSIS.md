# 传输层错误处理分析

**分析时间**: 2025-11-04  
**目的**: 排查其他运行模式（SSE、HTTP、Multi-tenant）是否存在类似 stdio 的 broken pipe 问题

---

## 📋 传输模式对比

| 模式                | 传输方式              | 客户端断开场景 | 潜在问题                   |
| ------------------- | --------------------- | -------------- | -------------------------- |
| **stdio**           | stdin/stdout 管道     | 管道关闭       | ✅ **已修复** - EPIPE 错误 |
| **SSE**             | HTTP Response Stream  | 连接关闭       | ⚠️ **需要检查**            |
| **Streamable HTTP** | HTTP Request/Response | 连接关闭       | ⚠️ **需要检查**            |
| **Multi-tenant**    | SSE (多会话)          | 连接关闭       | ⚠️ **需要检查**            |

---

## 🔍 问题分析

### 1. Stdio 模式（已修复）

**问题**：

- 客户端断开 → stdout 管道关闭 → write() 触发 EPIPE
- 没有监听 `process.stdout.on('error')`

**修复**：

```typescript
process.stdout.on('error', error => {
  if (error.code === 'EPIPE') {
    logger('[stdio] Client disconnected (EPIPE), shutting down gracefully');
    void cleanup('stdout EPIPE').then(() => process.exit(0));
  }
});
```

### 2. SSE 模式

**当前实现**：

```typescript
// server-sse.ts:186
const transport = new SSEServerTransport('/message', res);

// server-sse.ts:270
transport.onclose = () => {
  console.log(`[SSE] 📴 Session closed: ${sessionId}`);
  sessions.delete(sessionId);
};
```

**潜在问题**：

1. **Response 错误未处理**

   ```typescript
   // ❌ 没有监听 res.on('error')
   res.write('event: error\n');  // 可能触发 EPIPE
   res.write(`data: ${JSON.stringify(...)}\n\n`);
   ```

2. **客户端断开时的写入**
   - SSE 使用 `res.write()` 发送事件
   - 客户端断开后，`res.write()` 可能失败
   - Node.js 默认会触发 'error' 事件

3. **SDK 内部处理**
   - `SSEServerTransport` 可能已处理部分错误
   - 但应用层仍需防御

**风险等级**: 🟡 **中等**

- SSE 连接通常较长，客户端断开是常见场景
- 如果未处理，可能导致服务端崩溃

### 3. Streamable HTTP 模式

**当前实现**：

```typescript
// server-http.ts:316
await session.transport.handleRequest(req, res);
```

**潜在问题**：

1. **Response 错误未处理**

   ```typescript
   // ❌ 没有监听 res.on('error')
   res.writeHead(503, {'Content-Type': 'application/json'});
   res.end(JSON.stringify({...}));  // 可能失败
   ```

2. **Request 错误处理不完整**

   ```typescript
   // ✅ 有部分错误处理
   req.on('error', reject); // multi-tenant/server-multi-tenant.ts:1499

   // ❌ 但 server-http.ts 中没有
   ```

3. **SDK 内部处理**
   - `StreamableHTTPServerTransport` 可能已处理
   - 但应用层仍需防御

**风险等级**: 🟡 **中等**

- HTTP 连接较短，但仍可能在响应时断开
- 特别是大数据传输时

### 4. Multi-tenant 模式

**当前实现**：

```typescript
// multi-tenant/server-multi-tenant.ts:1483-1500
req.on('data', chunk => { ... });
req.on('end', () => resolve(body));
req.on('error', reject);  // ✅ 有错误处理
```

**潜在问题**：

1. **Response 错误未处理**

   ```typescript
   // ❌ 没有监听 res.on('error')
   res.writeHead(errorInfo.statusCode, {...});
   res.end(JSON.stringify(errorResponse, null, 2));
   ```

2. **SSE 连接错误**
   - Multi-tenant 使用 SSE 传输
   - 继承 SSE 模式的所有潜在问题

3. **多会话并发**
   - 多个会话同时断开可能触发多个错误
   - 需要确保错误处理不会相互干扰

**风险等级**: 🟡 **中等**

- 多租户场景下，连接断开更频繁
- 错误处理不当可能影响其他用户

---

## 🎯 第一性原理分析

### HTTP Response Stream 特性

1. **Response 是可写流**
   - `res.write()` 和 `res.end()` 写入数据
   - 客户端断开后，流关闭
   - 写入已关闭的流触发 'error' 事件

2. **错误传播**

   ```
   客户端断开 → TCP 连接关闭 → Response 流关闭
   → res.write() 失败 → 触发 'error' 事件
   → 未捕获 → 进程崩溃（可能）
   ```

3. **Node.js 默认行为**
   - 未监听的 'error' 事件会抛出异常
   - 但 HTTP 服务器可能有默认处理
   - 不同 Node.js 版本行为可能不同

### 与 Stdio 的区别

| 特性     | Stdio       | HTTP Response             |
| -------- | ----------- | ------------------------- |
| 错误类型 | EPIPE       | ECONNRESET, EPIPE         |
| 默认处理 | ❌ 抛出异常 | ⚠️ 可能被 HTTP 服务器吞掉 |
| 影响范围 | 整个进程    | 单个连接                  |
| 恢复能力 | ❌ 进程退出 | ✅ 其他连接不受影响       |

---

## ✅ 推荐修复方案

### 方案 1: 统一错误处理（推荐）

为所有 HTTP Response 添加错误处理：

```typescript
// 通用函数
function setupResponseErrorHandling(res: http.ServerResponse, context: string) {
  res.on('error', (error: NodeJS.ErrnoException) => {
    // 客户端断开是预期的，不记录为错误
    if (error.code === 'ECONNRESET' || error.code === 'EPIPE') {
      logger(`[${context}] Client disconnected during response`);
    } else {
      logger(`[${context}] Response error: ${error.message}`);
    }
  });

  // 防止重复监听
  res.once('finish', () => {
    res.removeAllListeners('error');
  });
}
```

**使用示例**：

```typescript
// SSE 模式
if (url.pathname === '/sse' && req.method === 'GET') {
  setupResponseErrorHandling(res, 'SSE');
  const transport = new SSEServerTransport('/message', res);
  // ...
}

// HTTP 模式
if (url.pathname === '/mcp') {
  setupResponseErrorHandling(res, 'HTTP');
  await session.transport.handleRequest(req, res);
}

// Multi-tenant 模式
if (url.pathname === '/sse') {
  setupResponseErrorHandling(res, 'Multi-tenant');
  // ...
}
```

### 方案 2: SDK 层修复

如果问题在 MCP SDK 内部，应该：

1. **检查 SDK 源码**
   - `SSEServerTransport.send()`
   - `StreamableHTTPServerTransport.handleRequest()`

2. **提交 PR 到 SDK**
   - 添加 Response 错误处理
   - 确保优雅降级

3. **临时 Workaround**
   - 在应用层添加错误处理
   - 等待 SDK 修复后移除

### 方案 3: 全局错误处理

为 HTTP 服务器添加全局错误处理：

```typescript
httpServer.on('clientError', (err, socket) => {
  if (err.code === 'ECONNRESET' || err.code === 'EPIPE') {
    logger('[HTTP] Client connection error (expected)');
  } else {
    logger(`[HTTP] Client error: ${err.message}`);
  }
  socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
});
```

---

## 🧪 测试计划

### 测试场景

1. **SSE 模式**

   ```bash
   # 启动服务器
   node build/src/server-sse.js --browserUrl http://localhost:9222

   # 客户端连接后立即断开
   curl -N http://localhost:32122/sse &
   sleep 0.5
   pkill curl

   # 检查服务器是否崩溃
   curl http://localhost:32122/health
   ```

2. **HTTP 模式**

   ```bash
   # 启动服务器
   node build/src/server-http.js --browserUrl http://localhost:9222

   # 发送请求后立即断开
   timeout 0.5s curl -X POST http://localhost:32123/mcp \
     -H "Content-Type: application/json" \
     -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}'

   # 检查服务器状态
   curl http://localhost:32123/health
   ```

3. **Multi-tenant 模式**

   ```bash
   # 启动服务器
   node build/src/multi-tenant/server-multi-tenant.js

   # 多个客户端同时断开
   for i in {1..5}; do
     (curl -N http://localhost:32122/sse &
      sleep 0.5
      pkill curl) &
   done
   wait

   # 检查服务器状态
   curl http://localhost:32122/health
   ```

### 预期结果

- ✅ 服务器不崩溃
- ✅ 其他连接不受影响
- ✅ 日志中有友好的断开消息
- ✅ 没有未捕获的异常

---

## 📊 风险评估

| 模式         | 风险等级  | 影响范围 | 优先级  |
| ------------ | --------- | -------- | ------- |
| stdio        | 🟢 已修复 | 整个进程 | ✅ 完成 |
| SSE          | 🟡 中等   | 单个会话 | 🔴 高   |
| HTTP         | 🟡 中等   | 单个请求 | 🟡 中   |
| Multi-tenant | 🟡 中等   | 单个用户 | 🔴 高   |

### 优先级说明

1. **Multi-tenant（高）**
   - 生产环境使用
   - 影响多个用户
   - 错误可能级联

2. **SSE（高）**
   - 长连接，断开频繁
   - 测试环境常用
   - 容易复现

3. **HTTP（中）**
   - 短连接，风险较低
   - 测试环境使用
   - 影响范围小

---

## 🎯 行动计划

### Phase 1: 验证问题（1小时）

- [ ] 创建测试脚本
- [ ] 测试 SSE 模式
- [ ] 测试 HTTP 模式
- [ ] 测试 Multi-tenant 模式
- [ ] 记录测试结果

### Phase 2: 实现修复（2小时）

- [ ] 创建通用错误处理函数
- [ ] 修复 SSE 模式
- [ ] 修复 HTTP 模式
- [ ] 修复 Multi-tenant 模式
- [ ] 代码审查

### Phase 3: 测试验证（1小时）

- [ ] 运行所有测试脚本
- [ ] 压力测试
- [ ] 并发测试
- [ ] 回归测试

### Phase 4: 文档更新（30分钟）

- [ ] 更新本文档
- [ ] 创建修复总结
- [ ] 更新 README
- [ ] 提交 PR

---

## 📝 相关文档

- [Broken Pipe 修复（stdio）](./BROKEN_PIPE_FIX.md)
- [错误处理最佳实践](../archive/error-handling/TOOL_ERROR_HANDLING_ANALYSIS.md)
- [Node.js HTTP 错误处理](https://nodejs.org/api/http.html#event-clienterror)
- [Node.js Stream 错误处理](https://nodejs.org/api/stream.html#event-error)

---

**分析完成时间**: 2025-11-04  
**状态**: ⏳ 待验证和修复  
**下一步**: 创建测试脚本，验证问题是否存在
