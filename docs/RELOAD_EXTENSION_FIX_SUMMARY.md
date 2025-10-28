# reload_extension 问题修复总结

**日期**: 2025-10-14  
**问题**: reload_extension 在某些情况下导致网络卡死或无返回  
**状态**: ✅ 已识别 + 部分修复 + 修复方案明确

---

## 🎯 已完成的工作

### 1. 添加详细异常日志 ✅

**修改文件**: `src/tools/extension/execution.ts`

**添加的日志**:

```typescript
// 工具调用开始日志
console.log(`\n${'='.repeat(80)}`);
console.log(`[reload_extension] ${timestamp}`);
console.log(`Session: ${sessionInfo}`);
console.log(`Token: ${tokenInfo}`);
console.log(`Extension ID: ${extensionId}`);
console.log(`Options: preserveStorage=${preserveStorage}, ...`);
console.log(`${'='.repeat(80)}\n`);

// 关键步骤日志
console.log(`[reload_extension] Step 1: Starting reload process...`);
console.log(`[reload_extension] Step 3: Executing reload...`);
console.log(
  `[reload_extension] Background context ID: ${backgroundContext.targetId}`,
);
console.log(`[reload_extension] Reload command sent successfully`);

// 成功日志
console.log(`[reload_extension] SUCCESS in ${elapsed}ms`);

// 异常日志
console.error(`\n${'!'.repeat(80)}`);
console.error(`[reload_extension] ERROR after ${elapsed}ms`);
console.error(`Session: ${sessionInfo}`);
console.error(`Token: ${tokenInfo}`);
console.error(`Extension: ${extensionId}`);
console.error(`Error: ${message}`);
console.error(`Stack trace:\n${stack}`);
console.error(`${'!'.repeat(80)}\n`);
```

**输出示例**:

```
================================================================================
[reload_extension] 2025-10-14T12:34:56.789Z
Session: session-abc123
Token: token-xyz789
Extension ID: abcdefghijklmnopqrstuvwxyzabcdef
Options: preserveStorage=false, waitForReady=true, captureErrors=true
================================================================================

[reload_extension] Step 1: Starting reload process...
[reload_extension] Step 3: Executing reload...
[reload_extension] Background context ID: F4E3D2C1-1234-5678-90AB-CDEF12345678
[reload_extension] Reload command sent successfully
[reload_extension] SUCCESS in 3542ms
  Session: session-abc123
  Token: token-xyz789
  Extension: abcdefghijklmnopqrstuvwxyzabcdef
```

---

## 🔍 发现的问题

### 问题1: SSE模式需要sessionId ✅

**现象**:

```json
{
  "error": "Missing sessionId"
}
```

**原因**: SSE模式下客户端必须先建立SSE连接获取sessionId，然后在HTTP请求中提供sessionId

**解决方案**:

- 文档已更新（参见 `RELOAD_EXTENSION_ISSUE_ANALYSIS.md`）
- 提供正确的SSE客户端示例代码

---

### 问题2: 缺少步骤级超时 ⚠️

**现象**: 某个步骤卡住会占用全部20秒超时时间

**当前保护**:

```typescript
const TOTAL_TIMEOUT = 20000; // 全局20秒
setInterval(checkTimeout, 1000); // 每秒检查
```

**问题**:

- 如果"激活Service Worker"步骤卡住15秒
- 后续步骤只剩5秒
- 可能导致整体超时

**建议修复**: 参见"待修复问题"部分

---

### 问题3: CDP连接中断未处理 ⚠️

**场景**:

```
服务器 → 执行 chrome.runtime.reload()
Chrome → 扩展重启，CDP连接可能中断
服务器 → 尝试获取上下文
       → 如果CDP断开，操作卡住
```

**建议修复**: 参见"待修复问题"部分

---

## ⏳ 待修复问题

### 修复1: 添加步骤级超时 (P0)

**实现**:

```typescript
// 为每个关键步骤添加独立超时
async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  operation: string,
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(
        () => reject(new Error(`${operation} timeout after ${timeoutMs}ms`)),
        timeoutMs,
      ),
    ),
  ]);
}

// 使用示例
// Step 1: 激活SW (最多3秒)
await withTimeout(
  context.activateServiceWorker(extensionId),
  3000,
  'Service Worker activation',
);

// Step 2: 获取上下文 (最多2秒)
const contexts = await withTimeout(
  context.getExtensionContexts(extensionId),
  2000,
  'Get extension contexts',
);

// Step 3: 执行reload (最多3秒)
await withTimeout(
  context.evaluateInExtensionContext(targetId, code, false),
  3000,
  'Execute reload command',
);

// Step 4: 捕获错误 (最多2秒)
const logs = await withTimeout(
  context.getExtensionLogs(extensionId, {duration: 1000}),
  2000,
  'Capture error logs',
);
```

**好处**:

- 每个步骤独立超时
- 总时间可预测：3s + 2s + 3s + 2s = 10秒最大
- 精确定位卡住的步骤

---

### 修复2: CDP连接健康检查 (P0)

**实现**:

```typescript
// 添加CDP连接检查
async function checkCDPConnection(context: any): Promise<boolean> {
  try {
    // 尝试获取浏览器版本（轻量级操作）
    await withTimeout(context.getBrowserVersion(), 1000, 'CDP health check');
    return true;
  } catch (error) {
    console.error('[reload_extension] CDP connection unhealthy:', error);
    return false;
  }
}

// 在关键步骤前检查
if (waitForReady) {
  const isHealthy = await checkCDPConnection(context);
  if (!isHealthy) {
    throw new Error(
      'CDP connection lost after reload. Extension may have crashed.',
    );
  }
}
```

---

### 修复3: 重试机制 (P1)

**实现**:

```typescript
async function retryOperation<T>(
  operation: () => Promise<T>,
  maxRetries = 3,
  delayMs = 500,
  operationName = 'operation',
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(
        `[reload_extension] ${operationName} - attempt ${attempt}/${maxRetries}`,
      );
      return await operation();
    } catch (error) {
      lastError = error as Error;
      if (attempt < maxRetries) {
        console.warn(
          `[reload_extension] ${operationName} failed, retrying in ${delayMs}ms...`,
        );
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }
  }

  throw new Error(
    `${operationName} failed after ${maxRetries} attempts: ${lastError?.message}`,
  );
}

// 使用示例
const contexts = await retryOperation(
  () => context.getExtensionContexts(extensionId),
  3,
  500,
  'Get extension contexts',
);
```

---

### 修复4: 快速模式 (P1)

**添加参数**:

```typescript
schema: {
  // ... 现有参数
  fastMode: z.boolean()
    .optional()
    .describe(
      'Skip verification steps for faster execution. Use when reload reliability is not critical.',
    );
}

// 实现
if (fastMode) {
  console.log('[reload_extension] Fast mode enabled - skipping verification');

  // 只执行基本reload
  await context.evaluateInExtensionContext(
    backgroundContext.targetId,
    'chrome.runtime.reload()',
    false,
  );

  response.appendResponseLine(
    '✅ Reload command sent (fast mode - no verification)',
  );
  return;
}
```

---

## 📊 性能优化建议

### 优化1: 减少默认等待时间

**当前**:

```typescript
await new Promise(resolve => setTimeout(resolve, 2000)); // 等待2秒
```

**建议**:

```typescript
await new Promise(resolve => setTimeout(resolve, 500)); // 减少到500ms
// 然后轮询检查状态，而不是盲目等待
```

### 优化2: 并行执行非依赖操作

**当前**: 串行执行

```typescript
const contexts = await getContexts();
const logs = await getLogs();
```

**建议**: 并行执行

```typescript
const [contexts, logs] = await Promise.all([getContexts(), getLogs()]);
```

---

## 🧪 测试建议

### 测试场景清单

- [ ] 正常reload (有效扩展)
- [ ] 无效extensionId
- [ ] Service Worker未激活
- [ ] CDP连接不稳定
- [ ] 并发多个reload请求
- [ ] 扩展启动失败
- [ ] 网络延迟模拟
- [ ] 超时触发验证

### 自动化测试脚本

创建 `test-reload-stress.sh`:

```bash
#!/bin/bash
# 压力测试 - 连续执行50次reload
for i in {1..50}; do
  echo "Test $i/50"
  # 执行reload并记录结果
  # 检测超时、卡死、异常
done
```

---

## 📝 文档更新

### 已创建文档

1. ✅ `RELOAD_EXTENSION_ISSUE_ANALYSIS.md` - 详细问题分析
2. ✅ `RELOAD_EXTENSION_FIX_SUMMARY.md` - 本文档

### 需要更新的文档

- [ ] `README.md` - 添加SSE模式使用说明
- [ ] API文档 - 更新reload_extension参数说明
- [ ] 故障排查指南 - 添加常见问题

---

## ✅ 总结

### 已完成 ✅

1. ✅ 添加详细的异常日志（Session, Token, Extension ID, 耗时等）
2. ✅ 识别SSE模式sessionId问题
3. ✅ 识别步骤超时和CDP连接问题
4. ✅ 编写详细问题分析报告
5. ✅ 提供完整修复方案

### 待实施 ⏳

1. ⏳ 实现步骤级超时（P0 - 高优先级）
2. ⏳ 添加CDP连接健康检查（P0 - 高优先级）
3. ⏳ 实现重试机制（P1 - 中优先级）
4. ⏳ 添加快速模式选项（P1 - 中优先级）
5. ⏳ 性能优化（减少等待时间）（P2 - 低优先级）

### 风险评估

| 问题          | 严重程度 | 影响         | 缓解措施    |
| ------------- | -------- | ------------ | ----------- |
| SSE sessionId | 高       | 请求失败     | ✅ 已文档化 |
| 步骤超时      | 中       | 卡死体验差   | ⏳ 待修复   |
| CDP断开       | 中       | 部分场景失败 | ⏳ 待修复   |
| 性能慢        | 低       | 用户体验     | ⏳ 可优化   |

### 建议行动

**立即执行**:

1. 实现步骤级超时
2. 添加CDP健康检查
3. 编译测试验证

**后续优化**: 4. 实现重试机制 5. 添加快速模式 6. 性能调优

---

**报告生成**: 2025-10-14  
**下次review**: 修复实施后  
**状态**: ✅ 分析完成，等待实施修复
