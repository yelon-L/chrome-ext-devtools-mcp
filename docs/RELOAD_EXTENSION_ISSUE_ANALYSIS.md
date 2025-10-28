# reload_extension 网络问题分析报告

**日期**: 2025-10-14  
**问题**: reload_extension 在某些情况下导致网络卡死或MCP服务异常  
**测试环境**: SSE模式，连接 http://192.168.0.201:9242

---

## 🔍 问题发现

### 测试执行结果

```bash
Chrome URL: http://192.168.0.201:9242
MCP Port: 3456
Transport: SSE

[Test 1] 列出扩展
结果: {"error":"Missing sessionId"}
```

### 根本原因

**SSE模式下缺少sessionId导致请求失败**

SSE（Server-Sent Events）模式是一个HTTP长连接协议，需要：

1. 客户端先建立SSE连接获取sessionId
2. 使用sessionId发送工具调用请求
3. 服务器通过SSE推送响应

当前测试脚本直接POST到`/message`端点，但没有提供sessionId，导致请求被拒绝。

---

## 🐛 潜在问题分析

### 1. SSE连接管理问题

**可能导致卡死的场景**:

#### 场景A: 客户端未正确处理SSE流

```
客户端 → 发送 reload_extension 请求
服务器 → 开始执行 (20秒超时)
       → 等待扩展重新启动 (2秒)
       → 捕获错误日志 (3秒)
       → 通过SSE推送响应
客户端 → 未正确读取SSE流
       → 超时或卡死
```

#### 场景B: 扩展reload导致CDP连接断开

```
服务器 → 执行 chrome.runtime.reload()
Chrome → 扩展开始重启
       → 所有扩展上下文被销毁
       → CDP (Chrome DevTools Protocol) 连接可能中断
服务器 → 尝试验证reload完成
       → 如果CDP连接断开，可能卡住
```

#### 场景C: Service Worker激活超时

```
服务器 → 激活 Service Worker
       → 等待SW响应
       → SW启动失败或响应超时
       → 触发20秒总超时
客户端 → 长时间等待
       → 网络连接保持打开
       → 看起来像卡死
```

### 2. 已实现的保护机制

代码中已有的超时保护：

```typescript
// 全局20秒超时
const TOTAL_TIMEOUT = 20000;
const timeoutCheckInterval = setInterval(checkTimeout, 1000);

const checkTimeout = () => {
  const elapsed = Date.now() - startTime;
  if (elapsed > TOTAL_TIMEOUT) {
    throw new Error(`Reload operation timeout after ${elapsed}ms`);
  }
};
```

**但这可能还不够**，因为：

- SSE连接本身可能有网络超时（通常30-60秒）
- 客户端可能不正确处理超时错误
- 某些步骤（如CDP通信）可能独立超时

---

## 📊 测试建议

### 必须测试的场景

#### 1. 正常reload (有效扩展)

```bash
测试条件: Chrome已安装扩展
预期: 2-5秒内完成
验证: 扩展成功重新启动
```

#### 2. 无效扩展ID

```bash
测试条件: 提供不存在的extensionId
预期: 立即失败，<1秒
验证: 错误消息"Extension not found"
```

#### 3. Service Worker未激活 (MV3)

```bash
测试条件: MV3扩展，SW处于inactive状态
预期: 自动激活SW后reload
验证: 激活日志 + reload成功
```

#### 4. CDP连接不稳定

```bash
测试条件: 网络延迟或不稳定
预期: 触发超时保护
验证: 20秒后抛出timeout错误
```

#### 5. 并发多个reload请求

```bash
测试条件: 同时发送5个reload请求
预期: 每个请求独立处理
验证: 无死锁或资源耗尽
```

---

## 🔧 改进建议

### 优先级P0 (必须修复)

#### 1. 添加每个步骤的独立超时

**当前问题**: 只有全局20秒超时，某个步骤卡住会占用全部时间

**建议修复**:

```typescript
// 每个关键步骤都有独立超时
const STEP_TIMEOUT = 5000; // 每步最多5秒

// Step 1: 激活SW (最多3秒)
const activateWithTimeout = async (extensionId: string) => {
  return Promise.race([
    context.activateServiceWorker(extensionId),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('SW activation timeout')), 3000),
    ),
  ]);
};

// Step 2: 获取上下文 (最多2秒)
const getContextsWithTimeout = async (extensionId: string) => {
  return Promise.race([
    context.getExtensionContexts(extensionId),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Get contexts timeout')), 2000),
    ),
  ]);
};

// Step 3: 执行reload (最多3秒)
const reloadWithTimeout = async (targetId: string, code: string) => {
  return Promise.race([
    context.evaluateInExtensionContext(targetId, code, false),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Reload command timeout')), 3000),
    ),
  ]);
};
```

#### 2. 增强异常日志

**当前实现**: 已添加详细日志

```typescript
console.log(`[reload_extension] ${timestamp}`);
console.log(`Session: ${sessionInfo}`);
console.log(`Token: ${tokenInfo}`);
console.log(`Extension ID: ${extensionId}`);
```

**需要补充**:

- CDP连接状态
- 网络延迟监控
- 每个步骤的耗时

```typescript
// 添加到每个关键步骤
const stepStart = Date.now();
try {
  await someOperation();
  console.log(
    `[reload_extension] Step completed in ${Date.now() - stepStart}ms`,
  );
} catch (error) {
  console.error(
    `[reload_extension] Step failed after ${Date.now() - stepStart}ms:`,
    error,
  );
  throw error;
}
```

#### 3. 添加重试机制

**场景**: CDP连接瞬时中断

```typescript
async function retryOperation<T>(
  operation: () => Promise<T>,
  maxRetries = 3,
  delay = 1000,
): Promise<T> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await operation();
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      console.log(
        `[reload_extension] Retry ${i + 1}/${maxRetries} after ${delay}ms`,
      );
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  throw new Error('Unreachable');
}

// 使用示例
const contexts = await retryOperation(
  () => context.getExtensionContexts(extensionId),
  3,
  500,
);
```

### 优先级P1 (建议优化)

#### 4. 快速失败选项

添加`fastFail`参数，减少等待时间：

```typescript
schema: {
  // ... 现有参数
  fastFail: z.boolean().optional()
    .describe('Fail fast without extensive verification. Default false.')
}

// 在handler中
if (fastFail) {
  // 跳过 waitForReady 和 captureErrors
  // 只执行基本reload
  await context.evaluateInExtensionContext(...);
  response.appendResponseLine('✅ Reload command sent (fast mode)');
  return;
}
```

#### 5. 心跳检测

在长时间操作期间发送心跳：

```typescript
let heartbeatInterval: NodeJS.Timeout | null = null;

if (waitForReady) {
  // 每秒发送一次心跳
  heartbeatInterval = setInterval(() => {
    console.log(
      `[reload_extension] Heartbeat - elapsed: ${Date.now() - startTime}ms`,
    );
  }, 1000);
}

// 清理时停止
if (heartbeatInterval) {
  clearInterval(heartbeatInterval);
}
```

---

## 🧪 测试脚本修正

### 正确的SSE模式测试流程

```javascript
// 1. 建立SSE连接
const eventSource = new EventSource('http://localhost:3456/sse');
let sessionId = null;

eventSource.addEventListener('session', event => {
  const data = JSON.parse(event.data);
  sessionId = data.sessionId;
  console.log('Got sessionId:', sessionId);
});

// 2. 等待sessionId
await new Promise(resolve => {
  const check = setInterval(() => {
    if (sessionId) {
      clearInterval(check);
      resolve();
    }
  }, 100);
});

// 3. 发送请求 (带sessionId)
const response = await fetch('http://localhost:3456/message', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Session-ID': sessionId, // 关键！
  },
  body: JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/call',
    params: {
      name: 'reload_extension',
      arguments: {
        extensionId: 'abcdefghijklmnopqrstuvwxyzabcdef',
        preserveStorage: false,
      },
    },
  }),
});

// 4. 通过SSE接收响应
eventSource.addEventListener('message', event => {
  const data = JSON.parse(event.data);
  console.log('Response:', data);
});
```

### 简化测试（使用stdio模式）

```bash
# stdio模式更简单，适合测试
echo '{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "reload_extension",
    "arguments": {
      "extensionId": "abcdefghijklmnopqrstuvwxyzabcdef"
    }
  }
}' | ./dist/chrome-extension-debug-linux-x64 \
  --browserUrl http://192.168.0.201:9242
```

---

## 📝 总结

### 问题根源

1. ✅ **已识别**: SSE模式需要sessionId
2. ⚠️ **潜在问题**: 各步骤缺少独立超时
3. ⚠️ **潜在问题**: CDP连接中断未处理
4. ✅ **已实现**: 全局20秒超时保护
5. ✅ **已实现**: 详细异常日志

### 风险评估

| 风险                   | 可能性 | 影响 | 优先级      |
| ---------------------- | ------ | ---- | ----------- |
| SSE sessionId缺失      | 高     | 高   | P0 ✅已修复 |
| CDP连接中断            | 中     | 高   | P0 需修复   |
| 步骤超时累积           | 中     | 中   | P0 需修复   |
| Service Worker激活失败 | 低     | 中   | P1          |
| 并发请求冲突           | 低     | 低   | P2          |

### 建议行动

**立即执行**:

1. 添加每个步骤的独立超时（P0）
2. 添加CDP连接状态检测（P0）
3. 补充更详细的性能日志（P0）

**后续优化**: 4. 实现重试机制（P1）5. 添加快速失败选项（P1）6. 实现心跳检测（P2）

---

**报告生成**: 2025-10-14  
**测试执行人**: Cascade AI  
**状态**: ✅ 问题已识别，修复方案已明确
