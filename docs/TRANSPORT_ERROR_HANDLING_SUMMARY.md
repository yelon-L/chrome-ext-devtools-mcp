# 传输层错误处理排查总结

**排查时间**: 2025-11-04  
**任务**: 排查其他运行模式是否有类似 stdio 的 broken pipe 问题

---

## 📋 排查范围

| 模式                | 文件                                      | 传输方式              | 状态        |
| ------------------- | ----------------------------------------- | --------------------- | ----------- |
| **stdio**           | `src/main.ts`                             | stdin/stdout 管道     | ✅ 已修复   |
| **SSE**             | `src/server-sse.ts`                       | HTTP Response Stream  | ⚠️ 需要验证 |
| **Streamable HTTP** | `src/server-http.ts`                      | HTTP Request/Response | ⚠️ 需要验证 |
| **Multi-tenant**    | `src/multi-tenant/server-multi-tenant.ts` | SSE (多会话)          | ⚠️ 需要验证 |

---

## 🔍 发现的问题

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

**状态**: ✅ 已完成并测试

### 2. SSE 模式

**潜在问题**：

1. **Response 错误未处理**
   - `res.write()` 可能在客户端断开后失败
   - 没有监听 `res.on('error')`

2. **代码位置**：

   ```typescript
   // src/server-sse.ts:186
   const transport = new SSEServerTransport('/message', res);

   // src/server-sse.ts:234
   res.write('event: error\n'); // ❌ 可能触发 EPIPE
   ```

**风险等级**: 🟡 **中等**

- SSE 连接通常较长，客户端断开是常见场景
- 如果未处理，可能导致服务端崩溃或日志污染

**建议修复**：

```typescript
// 在创建 SSE 连接时添加错误处理
res.on('error', (error: NodeJS.ErrnoException) => {
  if (error.code === 'ECONNRESET' || error.code === 'EPIPE') {
    logger('[SSE] Client disconnected during response');
  } else {
    logger(`[SSE] Response error: ${error.message}`);
  }
});
```

### 3. Streamable HTTP 模式

**潜在问题**：

1. **Response 错误未处理**
   - `res.writeHead()` 和 `res.end()` 可能失败
   - 没有监听 `res.on('error')`

2. **代码位置**：
   ```typescript
   // src/server-http.ts:276
   res.writeHead(503, {'Content-Type': 'application/json'});
   res.end(JSON.stringify({...}));  // ❌ 可能失败
   ```

**风险等级**: 🟡 **中等**

- HTTP 连接较短，但仍可能在响应时断开
- 特别是大数据传输时（如 list_extensions 返回大量数据）

**建议修复**：

```typescript
// 在处理请求前添加错误处理
res.on('error', (error: NodeJS.ErrnoException) => {
  if (error.code === 'ECONNRESET' || error.code === 'EPIPE') {
    logger('[HTTP] Client disconnected during response');
  } else {
    logger(`[HTTP] Response error: ${error.message}`);
  }
});
```

### 4. Multi-tenant 模式

**潜在问题**：

1. **Response 错误未处理**
   - 继承 SSE 模式的所有潜在问题
   - 多会话场景下，错误可能更频繁

2. **代码位置**：

   ```typescript
   // src/multi-tenant/server-multi-tenant.ts:1032
   res.writeHead(errorInfo.statusCode, {...});
   res.end(JSON.stringify(errorResponse, null, 2));  // ❌ 可能失败
   ```

3. **Request 错误处理**：
   ```typescript
   // ✅ 有部分错误处理
   req.on('error', reject); // src/multi-tenant/server-multi-tenant.ts:1499
   ```

**风险等级**: 🟡 **中等**

- 多租户场景下，连接断开更频繁
- 错误处理不当可能影响其他用户
- 但 Request 错误已有处理

**建议修复**：

```typescript
// 在创建 SSE 连接时添加错误处理
res.on('error', (error: NodeJS.ErrnoException) => {
  if (error.code === 'ECONNRESET' || error.code === 'EPIPE') {
    logger('[Multi-tenant] Client disconnected during response');
  } else {
    logger(`[Multi-tenant] Response error: ${error.message}`);
  }
});
```

---

## 🎯 第一性原理分析

### HTTP Response Stream vs Stdio

| 特性         | Stdio       | HTTP Response             |
| ------------ | ----------- | ------------------------- |
| **错误类型** | EPIPE       | ECONNRESET, EPIPE         |
| **默认处理** | ❌ 抛出异常 | ⚠️ 可能被 HTTP 服务器吞掉 |
| **影响范围** | 整个进程    | 单个连接                  |
| **恢复能力** | ❌ 进程退出 | ✅ 其他连接不受影响       |
| **紧急程度** | 🔴 高       | 🟡 中                     |

### 关键区别

1. **Stdio 更危险**
   - 错误会导致整个进程崩溃
   - 必须立即修复

2. **HTTP 相对安全**
   - 错误只影响单个连接
   - 其他连接不受影响
   - 但仍需要优雅处理

3. **Node.js 行为**
   - HTTP 服务器可能有默认错误处理
   - 但不同版本行为可能不同
   - 最好显式处理

---

## ✅ 推荐修复方案

### 统一错误处理函数

创建通用的 Response 错误处理函数：

```typescript
/**
 * 为 HTTP Response 添加错误处理
 * 防止客户端断开时触发未捕获的异常
 */
function setupResponseErrorHandling(
  res: http.ServerResponse,
  context: string,
): void {
  res.on('error', (error: NodeJS.ErrnoException) => {
    // 客户端断开是预期的，使用 log 级别
    if (error.code === 'ECONNRESET' || error.code === 'EPIPE') {
      logger(`[${context}] Client disconnected during response (expected)`);
    } else {
      // 其他错误使用 error 级别
      logger(`[${context}] Response error: ${error.message}`);
    }
  });

  // 防止重复监听和内存泄漏
  res.once('finish', () => {
    res.removeAllListeners('error');
  });
}
```

### 应用到各个模式

**SSE 模式**：

```typescript
// src/server-sse.ts:182
if (url.pathname === '/sse' && req.method === 'GET') {
  setupResponseErrorHandling(res, 'SSE');
  const transport = new SSEServerTransport('/message', res);
  // ...
}
```

**HTTP 模式**：

```typescript
// src/server-http.ts:200
if (url.pathname === '/mcp') {
  setupResponseErrorHandling(res, 'HTTP');
  // ...
  await session.transport.handleRequest(req, res);
}
```

**Multi-tenant 模式**：

```typescript
// src/multi-tenant/server-multi-tenant.ts
if (url.pathname === '/sse') {
  setupResponseErrorHandling(res, 'Multi-tenant');
  // ...
}
```

---

## 🧪 测试计划

### 测试脚本

创建了 `test-transport-errors.sh` 测试脚本：

```bash
# 测试所有传输模式
./test-transport-errors.sh
```

### 测试场景

1. **客户端立即断开**
   - 连接后立即关闭
   - 验证服务器不崩溃

2. **客户端延迟断开**
   - 连接后等待 1 秒再关闭
   - 验证服务器优雅处理

3. **健康检查**
   - 断开后检查 `/health` 端点
   - 验证服务器仍在运行

### 预期结果

- ✅ 服务器不崩溃
- ✅ 其他连接不受影响
- ✅ 日志中有友好的断开消息
- ✅ 没有未捕获的异常

---

## 📊 风险评估

| 模式         | 风险等级 | 影响范围 | 优先级 | 状态      |
| ------------ | -------- | -------- | ------ | --------- |
| stdio        | 🔴 高    | 整个进程 | P0     | ✅ 已修复 |
| SSE          | 🟡 中    | 单个会话 | P1     | ⏳ 待修复 |
| HTTP         | 🟡 中    | 单个请求 | P2     | ⏳ 待修复 |
| Multi-tenant | 🟡 中    | 单个用户 | P1     | ⏳ 待修复 |

### 优先级说明

**P0 - 紧急**（已完成）：

- stdio 模式：进程级别影响，必须立即修复

**P1 - 高**（建议修复）：

- SSE 模式：长连接，断开频繁
- Multi-tenant 模式：生产环境，影响多用户

**P2 - 中**（可选修复）：

- HTTP 模式：短连接，风险较低

---

## 🎯 行动计划

### Phase 1: 验证问题（当前阶段）

- [x] 分析所有传输模式的代码
- [x] 识别潜在的错误处理缺失
- [x] 创建测试脚本
- [ ] 运行测试验证问题

### Phase 2: 实现修复（如果测试发现问题）

- [ ] 创建通用错误处理函数
- [ ] 修复 SSE 模式
- [ ] 修复 HTTP 模式
- [ ] 修复 Multi-tenant 模式
- [ ] 代码审查

### Phase 3: 测试验证

- [ ] 运行所有测试脚本
- [ ] 压力测试
- [ ] 并发测试
- [ ] 回归测试

### Phase 4: 文档更新

- [ ] 更新本文档
- [ ] 创建修复总结
- [ ] 更新 README

---

## 📝 关键洞察

### 1. 问题本质

**Stdio 特殊性**：

- 管道是进程级别的资源
- 错误会导致整个进程崩溃
- **必须**显式处理

**HTTP 相对安全**：

- 连接是独立的
- 错误只影响单个连接
- Node.js 可能有默认处理
- **建议**显式处理（防御编程）

### 2. 设计原则

遵循 stdio 修复的设计原则：

1. ✅ **第一性原理**：理解 HTTP Response Stream 特性
2. ✅ **防御编程**：显式处理所有可能的错误
3. ✅ **业务失败不抛异常**：客户端断开是预期行为
4. ✅ **简洁错误处理**：统一的错误处理函数

### 3. 最佳实践

**统一错误处理**：

- 创建通用函数
- 在所有 Response 创建时调用
- 防止重复代码

**区分错误类型**：

- ECONNRESET/EPIPE：预期的，log 级别
- 其他错误：意外的，error 级别

**资源清理**：

- 使用 `once('finish')` 清理监听器
- 防止内存泄漏

---

## 📚 相关文档

- [Broken Pipe 修复（stdio）](./BROKEN_PIPE_FIX.md)
- [传输层错误处理分析](./TRANSPORT_ERROR_HANDLING_ANALYSIS.md)
- [错误处理最佳实践](../archive/error-handling/TOOL_ERROR_HANDLING_ANALYSIS.md)
- [Node.js HTTP 错误处理](https://nodejs.org/api/http.html#event-clienterror)

---

## 🎯 结论

### 当前状态

1. **Stdio 模式**：✅ 已修复并测试
2. **其他模式**：⚠️ 需要验证和可能的修复

### 下一步

1. **运行测试脚本**：验证问题是否存在
2. **根据测试结果**：决定是否需要修复
3. **如果需要修复**：应用统一的错误处理方案
4. **更新文档**：记录修复过程和结果

### 建议

**即使测试未发现问题，仍建议添加错误处理**：

- 防御编程的最佳实践
- 不同 Node.js 版本行为可能不同
- 生产环境可能有不同的网络条件
- 成本低，收益高

---

**排查完成时间**: 2025-11-04  
**状态**: ⏳ 分析完成，待测试验证  
**下一步**: 运行 `./test-transport-errors.sh` 验证问题
