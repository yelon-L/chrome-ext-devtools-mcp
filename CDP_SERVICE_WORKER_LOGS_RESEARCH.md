# CDP Service Worker 日志捕获研究报告

## 🔍 研究目标

如何通过 Chrome DevTools Protocol (CDP) 正确捕获 Chrome Extension Service Worker 的 console 日志。

---

## 📚 关键发现

### 1. CDP 日志捕获的核心 API

根据 [Chrome DevTools Protocol - Runtime domain](https://chromedevtools.github.io/devtools-protocol/tot/Runtime/)：

**Runtime.consoleAPICalled 事件**
- 当 console API 被调用时触发
- 支持的类型：log, debug, info, error, warning, dir, dirxml, table, trace, clear, startGroup, startGroupCollapsed, endGroup, assert, profile, profileEnd, count, timeEnd
- 事件参数：
  - `type`: 调用类型
  - `args`: RemoteObject[] - 调用参数
  - `executionContextId`: 执行上下文 ID
  - `timestamp`: 时间戳
  - `stackTrace`: 堆栈跟踪（对于 assert, error, trace, warning 自动报告）

---

### 2. Target & Session 机制

根据 [Getting Started with CDP](https://github.com/aslushnikov/getting-started-with-cdp)：

**关键概念**:
1. **Target**: Chrome 中的不同部分（pages, serviceworkers, extensions）
2. **Session**: 通过 `Target.attachToTarget` 建立到 target 的协议会话
3. **SessionId**: 每个 session 的唯一标识符

**正确的使用方式**:
```javascript
// 1. 获取 targets
const targetsResponse = await send({
  method: 'Target.getTargets'
});

// 2. Attach 到 target
const sessionId = (await send({
  method: 'Target.attachToTarget',
  params: {
    targetId: pageTarget.targetId,
    flatten: true,  // ⚠️ 重要：使用 flatten 模式
  }
})).result.sessionId;

// 3. 在 session 中发送命令
await send({
  sessionId,  // ⚠️ 关键：包含 sessionId
  method: 'Runtime.enable',
});
```

**关键点**:
- ✅ 必须使用 `flatten: true` 模式
- ✅ 发送到 target 的命令必须包含 `sessionId`
- ✅ 每个 session 有独立的状态（如 Runtime.enable）

---

### 3. Service Worker 特殊性

根据 [Debug Extensions - Chrome for Developers](https://developer.chrome.com/docs/extensions/get-started/tutorial/debug)：

**Service Worker 调试**:
1. Service Worker 有独立的 DevTools 面板
2. 通过 "Inspect views" 链接打开
3. **关键警告**: "Inspecting the service worker keeps it active"
   - 打开 DevTools 会保持 SW 激活
   - 关闭 DevTools 后 SW 会正常休眠

**Service Worker 状态检查**:
1. 访问 `chrome-extension://YOUR_EXTENSION_ID/manifest.json`
2. Inspect 该文件
3. 进入 Application > Service Workers 面板
4. 可以手动 start/stop Service Worker

---

## ❌ 当前实现的问题

### 问题 1: 没有正确使用 sessionId

**错误代码**:
```typescript
// Attach 到 background target
const attachResult = await cdp.send('Target.attachToTarget', {
  targetId: backgroundTarget.targetId,
  flatten: true,
});
sessionId = attachResult.sessionId;

// ❌ 错误：在主 session 上启用 Runtime，而不是在 target session 上
await cdp.send('Runtime.enable');

// ❌ 错误：监听主 session 的事件，而不是 target session 的事件
cdp.on('Runtime.consoleAPICalled', consoleHandler);
```

**问题**:
- Runtime.enable 应该在 target session 上调用
- Runtime.consoleAPICalled 事件应该来自 target session

---

### 问题 2: Puppeteer CDPSession API 的限制

**Puppeteer 的 CDPSession**:
```typescript
// Puppeteer 的 CDPSession.send() 签名
send(method: string, params?: object): Promise<any>

// ⚠️ 问题：没有 sessionId 参数！
```

**原因**:
- Puppeteer 的 CDPSession 已经绑定到特定的 session
- 不需要（也不能）传递 sessionId 参数
- 但是我们需要为 **nested session** (Service Worker) 创建新的 CDPSession

---

### 问题 3: 需要为 Service Worker 创建独立的 CDPSession

**正确的方式**:

根据 Puppeteer 文档，应该：

1. **方案 A: 使用 Puppeteer 的 Target API**
```typescript
// 1. 找到 Service Worker target
const targets = await browser.targets();
const swTarget = targets.find(t => 
  t.type() === 'service_worker' && 
  t.url().includes(extensionId)
);

// 2. 创建 CDPSession
const swSession = await swTarget.createCDPSession();

// 3. 在这个 session 上启用 Runtime
await swSession.send('Runtime.enable');

// 4. 监听这个 session 的事件
swSession.on('Runtime.consoleAPICalled', (event) => {
  console.log('SW console:', event);
});
```

2. **方案 B: 使用底层 WebSocket**
```typescript
// 直接使用 WebSocket 发送带 sessionId 的消息
ws.send(JSON.stringify({
  sessionId: swSessionId,
  id: 1,
  method: 'Runtime.enable'
}));
```

---

## ✅ 正确的实现方案

### 方案 1: 使用 Puppeteer Target API（推荐）

```typescript
async getExtensionLogs(
  extensionId: string,
  options?: { capture?: boolean; duration?: number; includeStored?: boolean }
): Promise<LogResult> {
  const { capture = true, duration = 5000, includeStored = true } = options || {};
  const logs: Array<any> = [];

  try {
    // 1. 找到 Service Worker target
    const targets = await this.browser.targets();
    const swTarget = targets.find(
      t => t.type() === 'service_worker' && t.url().includes(extensionId)
    );

    if (!swTarget) {
      return { logs: [], isActive: false };
    }

    // 2. 创建独立的 CDPSession for Service Worker
    const swSession = await swTarget.createCDPSession();

    // 3. 读取历史日志（如果需要）
    if (includeStored) {
      const evalResult = await swSession.send('Runtime.evaluate', {
        expression: `
          (() => {
            if (typeof globalThis.__logs !== 'undefined') {
              return globalThis.__logs;
            }
            return [];
          })()
        `,
        returnByValue: true,
      });

      const storedLogs = evalResult.result?.value as Array<any> || [];
      storedLogs.forEach(log => {
        logs.push({
          type: log.type,
          text: log.message,
          timestamp: log.timestamp,
          source: 'stored',
        });
      });
    }

    // 4. 实时捕获（如果需要）
    let captureInfo;
    if (capture) {
      const captureStartTime = Date.now();
      const capturedLogs: Array<any> = [];

      // 启用 Runtime domain（在 SW session 上）
      await swSession.send('Runtime.enable');

      // 监听 console API 调用（在 SW session 上）
      const consoleHandler = (event: any) => {
        const args = event.args || [];
        const text = args
          .map((arg: any) => {
            if (arg.value !== undefined) return String(arg.value);
            if (arg.description) return arg.description;
            return '[Object]';
          })
          .join(' ');

        capturedLogs.push({
          type: event.type || 'log',
          text,
          timestamp: event.timestamp || Date.now(),
          source: 'realtime',
          level: event.type,
          stackTrace: event.stackTrace?.callFrames
            ? event.stackTrace.callFrames
                .map((frame: any) => 
                  `  at ${frame.functionName || 'anonymous'} (${frame.url}:${frame.lineNumber})`
                )
                .join('\n')
            : undefined,
          url: event.stackTrace?.callFrames?.[0]?.url,
          lineNumber: event.stackTrace?.callFrames?.[0]?.lineNumber,
        });
      };

      swSession.on('Runtime.consoleAPICalled', consoleHandler);

      // 等待指定时长
      this.log(`[ExtensionHelper] 捕获日志 ${duration}ms...`);
      await new Promise(resolve => setTimeout(resolve, duration));

      // 停止监听
      swSession.off('Runtime.consoleAPICalled', consoleHandler);

      // 禁用 Runtime domain
      await swSession.send('Runtime.disable');

      const captureEndTime = Date.now();
      captureInfo = {
        started: captureStartTime,
        ended: captureEndTime,
        duration: captureEndTime - captureStartTime,
        messageCount: capturedLogs.length,
      };

      logs.push(...capturedLogs);
    }

    // 5. 分离 session
    await swSession.detach();

    // 按时间戳排序
    logs.sort((a, b) => a.timestamp - b.timestamp);

    return {
      logs,
      isActive: true,  // 如果找到 target 就是 active
      captureInfo,
    };
  } catch (error) {
    this.logError(`[ExtensionHelper] getExtensionLogs 失败:`, error);
    return { logs: [], isActive: false };
  }
}
```

---

### 方案 2: 使用现有的 getExtensionBackgroundTarget

```typescript
async getExtensionLogs(...): Promise<LogResult> {
  // ...

  // 找到 background target
  const backgroundTarget = await this.getExtensionBackgroundTarget(extensionId);
  if (!backgroundTarget) {
    return { logs: [], isActive: false };
  }

  // 通过 targetId 找到对应的 Puppeteer Target
  const targets = await this.browser.targets();
  const swTarget = targets.find(
    t => (t as any)._targetId === backgroundTarget.targetId
  );

  if (!swTarget) {
    throw new Error('Failed to find Puppeteer target for Service Worker');
  }

  // 创建 CDPSession
  const swSession = await swTarget.createCDPSession();

  // 后续逻辑同方案 1
  // ...
}
```

---

## 🎯 关键要点总结

1. ✅ **必须为 Service Worker 创建独立的 CDPSession**
   - 使用 `target.createCDPSession()`
   - 不能在主 session 上监听 SW 的事件

2. ✅ **在正确的 session 上启用 Runtime**
   - `await swSession.send('Runtime.enable')`
   - 不是 `await cdp.send('Runtime.enable')`

3. ✅ **在正确的 session 上监听事件**
   - `swSession.on('Runtime.consoleAPICalled', handler)`
   - 不是 `cdp.on('Runtime.consoleAPICalled', handler)`

4. ✅ **Service Worker 的生命周期**
   - 打开 DevTools 会保持 SW 激活
   - 关闭 DevTools 后 SW 会休眠
   - 需要在 SW 激活时捕获日志

5. ✅ **使用 Puppeteer 的 Target API**
   - `browser.targets()` 获取所有 targets
   - `target.type() === 'service_worker'` 识别 SW
   - `target.createCDPSession()` 创建独立 session

---

## 📊 对比：错误 vs 正确

| 操作 | 错误实现 | 正确实现 |
|------|---------|---------|
| **获取 Session** | 使用主 CDP session | 为 SW 创建独立 CDPSession |
| **启用 Runtime** | `cdp.send('Runtime.enable')` | `swSession.send('Runtime.enable')` |
| **监听事件** | `cdp.on('Runtime.consoleAPICalled')` | `swSession.on('Runtime.consoleAPICalled')` |
| **Session 管理** | Attach/Detach 手动管理 | 使用 Puppeteer Target API |
| **结果** | ❌ 捕获不到日志 | ✅ 正确捕获日志 |

---

## 🔧 立即修复

需要修改 `ExtensionHelper.getExtensionLogs` 方法：

1. 移除当前的 `Target.attachToTarget` 方式
2. 使用 `browser.targets()` 找到 Service Worker target
3. 使用 `target.createCDPSession()` 创建独立 session
4. 在新 session 上启用 Runtime 和监听事件
5. 完成后使用 `session.detach()` 清理

这是**关键的修复**，是日志捕获功能能否工作的核心！
