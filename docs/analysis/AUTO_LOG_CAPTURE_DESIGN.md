# Extension Tools 自动日志捕获设计方案

## 背景

### 现状

**页面工具已实现**：
- `click`, `fill`, `evaluate_script` 等工具已自动包含页面日志
- 使用 `response.setIncludeConsoleData(true)` 自动附加日志

**扩展工具缺失**：
- `evaluate_in_extension` 等扩展工具没有自动日志
- 需要手动调用 `get_background_logs` / `get_offscreen_logs`
- AI 无法在一次调用中获得完整的执行结果 + 日志

### 用户需求

> 是否需要执行这些动作时就附带对应的日志获取能力？应该配置这些工具一个参数：是否立刻获得触发后日志，包括前后端所有组件的日志信息，调用工具的 AI 来判定是否要获得日志。

---

## 设计目标

1. **一致性**：扩展工具与页面工具保持一致的行为
2. **灵活性**：AI 可以选择是否需要日志
3. **完整性**：捕获所有组件日志（Background + Offscreen + Content Scripts）
4. **性能**：默认开启但可关闭
5. **简洁性**：不增加使用复杂度

---

## 核心设计

### 参数设计

```typescript
schema: {
  // ... 原有参数 ...
  
  captureLogs: z.boolean()
    .optional()
    .default(true)
    .describe(`Capture extension logs during/after execution.
    - true: Automatically capture all component logs (Background + Offscreen)
    - false: Skip log capture (for performance-critical operations)
    Default: true (recommended for most operations)`),
    
  logDuration: z.number()
    .optional()
    .default(3000)
    .min(1000)
    .max(15000)
    .describe(`Log capture duration in milliseconds. 
    How long to listen for logs after the operation.
    Default: 3000ms (3 seconds)
    Range: 1000ms - 15000ms`),
}
```

### 默认值选择

**为什么默认 `captureLogs = true`？**

1. **符合使用习惯**：页面工具都默认包含日志
2. **AI 友好**：AI 不需要记住何时需要日志
3. **调试便利**：大多数情况下都需要日志
4. **性能可接受**：3 秒捕获开销很小

**什么时候设置 `captureLogs = false`？**

1. 性能测试场景
2. 批量操作（如循环调用）
3. 只需要返回值，不关心日志

### Handler 实现模式

```typescript
handler: async (request, response, context) => {
  const {
    extensionId, 
    // ... 其他参数 ...
    captureLogs = true, 
    logDuration = 3000
  } = request.params;

  try {
    // 1. 执行主要操作
    const result = await performMainOperation(extensionId, ...);
    
    // 2. 输出结果
    response.appendResponseLine(`# Operation Result\n`);
    response.appendResponseLine(`...result details...`);
    
    // 3. 自动捕获日志（如果启用）
    if (captureLogs) {
      await captureExtensionLogs(
        extensionId, 
        logDuration, 
        response, 
        context
      );
    }
    
  } catch (error) {
    // 错误处理
  }
  
  response.setIncludePages(true);
}
```

---

## 辅助函数实现

### captureExtensionLogs

```typescript
/**
 * 自动捕获扩展所有组件的日志
 * 
 * @param extensionId - 扩展 ID
 * @param duration - 捕获时长（毫秒）
 * @param response - Response 对象
 * @param context - Context 对象
 */
async function captureExtensionLogs(
  extensionId: string,
  duration: number,
  response: any,
  context: any
): Promise<void> {
  response.appendResponseLine(`\n---\n\n## 📋 Extension Logs\n`);
  response.appendResponseLine(`*Capturing logs for ${duration}ms...*\n\n`);
  
  try {
    // 并行捕获所有组件日志
    const [backgroundResult, offscreenResult] = await Promise.allSettled([
      // Background Service Worker
      context.getBackgroundLogs(extensionId, {
        capture: true,
        duration,
        includeStored: false,
      }).catch((err: any) => ({ 
        logs: [], 
        error: err.message 
      })),
      
      // Offscreen Document
      context.getOffscreenLogs(extensionId, {
        capture: true,
        duration,
        includeStored: false,
      }).catch((err: any) => ({ 
        logs: [], 
        error: err.message 
      })),
    ]);
    
    // 提取结果
    const backgroundLogs = backgroundResult.status === 'fulfilled' 
      ? backgroundResult.value 
      : { logs: [], error: 'Failed to capture' };
      
    const offscreenLogs = offscreenResult.status === 'fulfilled'
      ? offscreenResult.value
      : { logs: [], error: 'Failed to capture' };
    
    // 统计总数
    const totalLogs = 
      (backgroundLogs.logs?.length || 0) + 
      (offscreenLogs.logs?.length || 0);
    
    if (totalLogs === 0) {
      response.appendResponseLine(`*No logs captured during this operation*\n\n`);
      response.appendResponseLine(`**Possible reasons**:`);
      response.appendResponseLine(`- Extension didn't log anything`);
      response.appendResponseLine(`- Logs were produced before capture started`);
      response.appendResponseLine(`- Service Worker is inactive\n`);
      return;
    }
    
    response.appendResponseLine(`**Total captured**: ${totalLogs} log entries\n`);
    
    // Background 日志
    formatComponentLogs(
      'Background Service Worker',
      backgroundLogs,
      response,
      10 // 显示最近 10 条
    );
    
    // Offscreen 日志
    formatComponentLogs(
      'Offscreen Document',
      offscreenLogs,
      response,
      10
    );
    
  } catch (error) {
    response.appendResponseLine(
      `\n⚠️  **Log capture failed**: ${error instanceof Error ? error.message : 'Unknown error'}\n`
    );
    response.appendResponseLine(
      `*Tip: Try increasing \`logDuration\` or check if extension is active*\n`
    );
  }
}
```

### formatComponentLogs

```typescript
/**
 * 格式化单个组件的日志
 */
function formatComponentLogs(
  componentName: string,
  logsResult: { logs?: any[]; error?: string },
  response: any,
  maxDisplay: number = 10
): void {
  response.appendResponseLine(`### ${componentName}\n`);
  
  // 检查错误
  if (logsResult.error) {
    response.appendResponseLine(`*Error: ${logsResult.error}*\n`);
    return;
  }
  
  const logs = logsResult.logs || [];
  
  if (logs.length === 0) {
    response.appendResponseLine(`*No logs*\n`);
    return;
  }
  
  response.appendResponseLine(`**Total**: ${logs.length} entries\n`);
  
  // 显示最近的日志
  const displayLogs = logs.slice(-maxDisplay);
  
  for (const log of displayLogs) {
    const timestamp = new Date(log.timestamp).toLocaleTimeString();
    const level = log.level || 'log';
    const icon = getLogIcon(level);
    const message = truncateMessage(log.message, 150);
    
    response.appendResponseLine(`${icon} **[${timestamp}]** ${message}`);
    
    // 如果有 stack trace，显示第一行
    if (log.stackTrace && level === 'error') {
      const firstFrame = log.stackTrace.callFrames?.[0];
      if (firstFrame) {
        response.appendResponseLine(
          `  ↳ at ${firstFrame.functionName} (${firstFrame.url}:${firstFrame.lineNumber})`
        );
      }
    }
  }
  
  if (logs.length > maxDisplay) {
    response.appendResponseLine(
      `\n*...and ${logs.length - maxDisplay} more entries (use \`get_background_logs\` for full history)*\n`
    );
  }
  
  response.appendResponseLine('');
}

/**
 * 获取日志级别图标
 */
function getLogIcon(level: string): string {
  const icons: Record<string, string> = {
    log: '📝',
    info: 'ℹ️',
    warn: '⚠️',
    error: '❌',
    debug: '🔍',
  };
  return icons[level] || '📝';
}

/**
 * 截断长消息
 */
function truncateMessage(message: string, maxLength: number): string {
  if (message.length <= maxLength) {
    return message;
  }
  return message.substring(0, maxLength) + '...';
}
```

---

## 实现优先级

### Phase 1: 核心工具（P0）

**必须实现**：

1. **evaluate_in_extension**
   - 最重要的工具
   - 执行代码后必须看日志
   - 用户最常用

2. **reload_extension**
   - 重新加载后需要看启动日志
   - 验证代码是否正确加载
   - 已有部分实现，需要优化

**实现文件**：
- `src/tools/extension/execution.ts`

### Phase 2: 交互工具（P1）

**建议实现**：

3. **activate_extension_service_worker**
   - SW 激活后的日志
   - 验证激活是否成功

4. **interact_with_popup**
   - Popup 交互日志
   - 验证 UI 操作结果

**实现文件**：
- `src/tools/extension/service-worker-activation.ts`
- `src/tools/extension/popup-lifecycle.ts`

### Phase 3: 其他工具（P2）

**可选实现**：

- 其他诊断工具可以按需添加
- 原则：如果工具会触发扩展代码执行，就应该支持日志捕获

---

## 使用示例

### 示例 1：默认捕获日志

```typescript
// AI 调用（最常见）
evaluate_in_extension({
  extensionId: "obbhgfjghnnodmekfkfffojnkbdbfpbh",
  code: "chrome.storage.local.get(['settings'])"
  // captureLogs 默认 true，自动捕获 3 秒日志
})
```

**输出**：
```
# Evaluation Result

**Extension ID**: obbhgfjghnnodmekfkfffojnkbdbfpbh
**Context**: Background (default)

**Code**:
```javascript
chrome.storage.local.get(['settings'])
```

**Result**:
```json
{
  "settings": {
    "theme": "dark",
    "language": "en"
  }
}
```

---

## 📋 Extension Logs

*Capturing logs for 3000ms...*

**Total captured**: 15 log entries

### Background Service Worker

**Total**: 12 entries

📝 **[13:45:12]** [Storage] Reading settings from local storage
ℹ️ **[13:45:12]** [Storage] Found settings: {"theme":"dark","language":"en"}
📝 **[13:45:13]** [Background] Storage read completed

### Offscreen Document

**Total**: 3 entries

📝 **[13:45:12]** [Offscreen] 📨 Received message from Background
📝 **[13:45:12]** [Offscreen] Processing audio data
📝 **[13:45:13]** [Offscreen] Audio processing complete
```

### 示例 2：自定义捕获时长

```typescript
// 需要更长时间的操作
evaluate_in_extension({
  extensionId: "obbhgfjghnnodmekfkfffojnkbdbfpbh",
  code: "performLongOperation()",
  captureLogs: true,
  logDuration: 10000  // 捕获 10 秒
})
```

### 示例 3：禁用日志（性能优化）

```typescript
// 批量操作，不需要日志
for (let i = 0; i < 100; i++) {
  evaluate_in_extension({
    extensionId: "obbhgfjghnnodmekfkfffojnkbdbfpbh",
    code: `processItem(${i})`,
    captureLogs: false  // 关闭日志提升性能
  })
}
```

---

## 与现有工具对比

### 页面工具（已实现）

```typescript
// click, fill, evaluate_script 等
response.setIncludeConsoleData(true);  // 自动包含页面日志
```

**特点**：
- ✅ 简单：一行代码搞定
- ✅ 自动：无需参数控制
- ❌ 不灵活：无法关闭
- ❌ 单一来源：只有页面日志

### 扩展工具（新设计）

```typescript
// evaluate_in_extension, reload_extension 等
if (captureLogs) {
  await captureExtensionLogs(extensionId, logDuration, response, context);
}
```

**特点**：
- ✅ 灵活：可选是否捕获
- ✅ 可控：可调整捕获时长
- ✅ 完整：包含所有组件日志
- ⚠️ 稍复杂：需要异步捕获

---

## 技术考虑

### 性能影响

**日志捕获开销**：
- 捕获时间：主要是 `duration` 参数（默认 3 秒）
- 内存占用：每条日志约 500 bytes，100 条日志约 50KB
- 网络开销：日志通过 CDP 传输，约 1-2KB/条

**优化措施**：
1. 默认只显示最近 10 条日志
2. 可以通过 `captureLogs: false` 完全禁用
3. 并行捕获 Background 和 Offscreen，不串行等待
4. 使用 `Promise.allSettled` 避免单个失败影响整体

### 错误处理

**失败场景**：
1. Service Worker 未激活 → 捕获 0 条日志
2. Offscreen 不存在 → 只捕获 Background 日志
3. 超时 → 已有超时保护机制

**处理策略**：
- 使用 `Promise.allSettled` 确保部分失败不影响整体
- 每个组件单独 try-catch
- 友好的错误消息和建议

### 向后兼容

**兼容性考虑**：
1. 新增参数都是可选的（`optional()`）
2. 默认值保证旧代码行为不变
3. 不修改现有 API 签名
4. MCP 层需要支持新的日志格式

---

## 测试计划

### 单元测试

```typescript
describe('captureExtensionLogs', () => {
  it('should capture both background and offscreen logs', async () => {
    const result = await captureExtensionLogs(
      'test-extension-id',
      3000,
      mockResponse,
      mockContext
    );
    
    expect(mockContext.getBackgroundLogs).toHaveBeenCalled();
    expect(mockContext.getOffscreenLogs).toHaveBeenCalled();
    expect(mockResponse.appendResponseLine).toHaveBeenCalledWith(
      expect.stringContaining('Extension Logs')
    );
  });
  
  it('should handle when no logs are captured', async () => {
    mockContext.getBackgroundLogs.mockResolvedValue({ logs: [] });
    mockContext.getOffscreenLogs.mockResolvedValue({ logs: [] });
    
    await captureExtensionLogs(...);
    
    expect(mockResponse.appendResponseLine).toHaveBeenCalledWith(
      expect.stringContaining('No logs captured')
    );
  });
  
  it('should handle capture failures gracefully', async () => {
    mockContext.getBackgroundLogs.mockRejectedValue(new Error('Timeout'));
    
    await captureExtensionLogs(...);
    
    // Should not throw, should log error message
    expect(mockResponse.appendResponseLine).toHaveBeenCalledWith(
      expect.stringContaining('Log capture failed')
    );
  });
});
```

### 集成测试

```bash
# 测试脚本
./scripts/test-auto-log-capture.sh
```

**测试场景**：
1. ✅ 默认捕获日志
2. ✅ 禁用日志捕获
3. ✅ 自定义捕获时长
4. ✅ Background 有日志，Offscreen 无日志
5. ✅ Service Worker 未激活
6. ✅ 并发调用多次

---

## 文档更新

### 工具描述更新

```typescript
description: `Execute JavaScript code in extension's background context...

**🎯 Auto-capture logs**: By default, this tool automatically captures extension logs
for 3 seconds after execution. This includes:
- 📝 Background Service Worker logs
- 📝 Offscreen Document logs

To disable log capture (for performance), set \`captureLogs: false\`.

...
`
```

### 使用指南

需要在以下文档中添加说明：
1. `README.md` - 快速开始部分
2. `docs/guides/EXTENSION_DEBUGGING_GUIDE.md` - 详细说明
3. `docs/examples/` - 添加示例代码

---

## 实现时间估算

### Phase 1: 核心工具

**预计时间**: 3-4 小时

- 实现 `captureExtensionLogs` 函数：1 小时
- 实现 `formatComponentLogs` 函数：30 分钟
- 修改 `evaluate_in_extension`：1 小时
- 优化 `reload_extension`：1 小时
- 测试和调试：30-60 分钟

### Phase 2: 文档和测试

**预计时间**: 2-3 小时

- 单元测试：1 小时
- 集成测试：1 小时
- 文档更新：30-60 分钟

### 总计

**完整实现**: 5-7 小时

---

## 总结

### 核心价值

1. **一致性**：扩展工具与页面工具行为一致
2. **便利性**：AI 一次调用获得完整信息
3. **完整性**：捕获所有组件日志
4. **灵活性**：AI 可以根据场景选择

### 实现优势

1. ✅ **向后兼容**：不影响现有代码
2. ✅ **性能可控**：可以禁用日志捕获
3. ✅ **错误健壮**：失败不影响主要操作
4. ✅ **用户友好**：清晰的日志格式

### 下一步

1. 获得用户确认
2. 实现 Phase 1（核心工具）
3. 测试验证
4. 实现 Phase 2（其他工具）
5. 文档完善

---

**创建时间**: 2025-10-25  
**设计者**: Cascade AI Assistant  
**状态**: 待实现
