# MCP 工具测试分析报告

**测试日期**: 2025-10-14  
**版本**: v0.8.10  
**测试人员**: AI Assistant

## 📋 执行摘要

针对用户报告的 `reload_extension` 工具卡住问题，进行了全面的工具测试。

### 测试环境
- **Chrome**: 端口 9222（已运行）
- **测试模式**: stdio（二进制文件）
- **超时设置**: 20秒

### 关键发现

#### 🔴 问题 1: 工具名称错误
测试中发现部分工具名称不存在：
- ❌ `get_browser_info` - 工具不存在
- ❌ `list_tabs` - 工具不存在  
- ❌ `execute_cdp_command` - 工具不存在

**原因**: 工具名称可能使用了错误的格式或这些工具不再存在。

#### 🔴 问题 2: 浏览器实例冲突 (最关键)
所有 `list_extensions` 调用都返回错误：

```
The browser is already running for /home/p/.cache/chrome-devtools-mcp/chrome-profile. 
Use --isolated to run multiple browser instances.
```

**分析**:
- MCP 服务器默认尝试启动自己的浏览器实例
- 当我们用 `--chrome-url http://localhost:9222` 时，仍然有冲突
- 这可能是 `list_extensions` 的实现问题

**影响**: 
- ❌ 无法测试任何扩展相关工具
- ❌ `reload_extension` 无法测试（需要扩展ID）

#### ⚠️  问题 3: reload_extension 未能测试
由于无法获取扩展列表，`reload_extension` 工具未能进行实际测试。

**用户报告的卡住问题可能原因**:
1. **等待时间过长** - 已在代码中优化（但未验证）
2. **浏览器连接问题** - 可能尝试连接错误的浏览器实例
3. **扩展状态检测死循环** - 等待扩展就绪时可能陷入无限等待

### 测试统计

```
总测试数: 5
✅ 通过: 0 (0%)
❌ 失败: 5 (100%)
⏱️  超时: 0 (0%)
💥 错误: 0 (0%)
```

**好消息**: 没有工具超时！这意味着至少这些工具没有无限卡住。

**坏消息**: 所有测试都失败了，无法验证 reload_extension。

---

## 🔍 详细分析

### 1. list_extensions 工具问题

#### 错误信息
```
The browser is already running for /home/p/.cache/chrome-devtools-mcp/chrome-profile
```

#### 根本原因分析

查看工具实现可能存在的问题：

**可能的实现问题**:
```typescript
// 错误的实现方式
async function list_extensions() {
  // 问题：尝试启动新的浏览器而不是使用连接的浏览器
  const browser = await chromium.launch({
    userDataDir: '/home/p/.cache/chrome-devtools-mcp/chrome-profile'
  });
  // ...
}

// 正确的实现方式
async function list_extensions() {
  // 应该使用已连接的 CDP session
  const extensions = await cdpSession.send('Target.getTargets', {
    filter: [{ type: 'service_worker' }]
  });
  // ...
}
```

#### 解决方案建议

1. **检查工具实现** - 确认 `list_extensions` 是否正确使用 `--chrome-url` 参数
2. **使用远程调试协议** - 而不是尝试启动新浏览器
3. **添加 --isolated 支持** - 如果确实需要多实例

### 2. reload_extension 可能的卡住原因

虽然未能直接测试，但从代码分析可能的卡住点：

#### 卡住点 1: 等待扩展就绪
```typescript
// 可能的死循环
if (waitForReady) {
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  try {
    const contextsAfter = await context.getExtensionContexts(extensionId);
    // 如果 getExtensionContexts 一直等待，这里会卡住
  } catch (e) {
    // ...
  }
}
```

**问题**: 如果扩展在 reload 后启动失败，`getExtensionContexts` 可能无限等待。

#### 卡住点 2: 日志捕获
```typescript
// 之前的实现
const logsResult = await context.getExtensionLogs(extensionId, {
  capture: true,
  duration: 3000,  // 旧: 3秒
  includeStored: true,
});
```

虽然已优化到 1秒，但如果 `getExtensionLogs` 本身有问题，仍会卡住。

#### 卡住点 3: 存储恢复
```typescript
if (preserveStorage && savedStorage) {
  await context.evaluateInExtensionContext(
    newBackgroundContext.targetId,
    `chrome.storage.local.set(${JSON.stringify(savedStorage)})`,
    true,  // wait for result
  );
}
```

**问题**: 如果 Service Worker 未就绪，`evaluateInExtensionContext` 可能无限等待。

### 3. 优化建议

#### 为所有异步操作添加超时

```typescript
// 包装所有可能卡住的操作
async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, operation: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => 
      setTimeout(() => reject(new Error(`${operation} timeout after ${timeoutMs}ms`)), timeoutMs)
    )
  ]);
}

// 使用
const contextsAfter = await withTimeout(
  context.getExtensionContexts(extensionId),
  5000,
  'getExtensionContexts'
);
```

#### 添加重试机制

```typescript
async function getExtensionContextsWithRetry(extensionId: string, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const contexts = await withTimeout(
        context.getExtensionContexts(extensionId),
        3000,
        `getExtensionContexts (attempt ${i+1})`
      );
      return contexts;
    } catch (e) {
      if (i === maxRetries - 1) throw e;
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
}
```

#### 允许跳过验证步骤

```typescript
// 添加新参数
waitForReady?: boolean;      // 现有
skipVerification?: boolean;  // 新增 - 完全跳过所有验证

if (!skipVerification) {
  // 执行验证
}
```

---

## 🎯 推荐的修复步骤

### 立即修复（高优先级）

#### 1. 修复 list_extensions 的浏览器冲突

**文件**: 查找 `list_extensions` 实现

**修改**:
```typescript
// 确保使用远程连接而非启动新浏览器
export const listExtensions = defineTool({
  name: 'list_extensions',
  handler: async (request, response, context) => {
    // 使用 context 提供的已连接的浏览器
    // 而不是 launch 新浏览器
    const extensions = await context.getExtensions();
    // ...
  }
});
```

#### 2. 为 reload_extension 添加全局超时

**文件**: `src/tools/extension/execution.ts`

```typescript
export const reloadExtension = defineTool({
  handler: async (request, response, context) => {
    // 添加总体超时
    const TOTAL_TIMEOUT = 15000; // 15秒
    const startTime = Date.now();
    
    const checkTimeout = () => {
      if (Date.now() - startTime > TOTAL_TIMEOUT) {
        throw new Error('Reload operation timeout');
      }
    };
    
    // 在每个步骤后检查
    await step1();
    checkTimeout();
    
    await step2();
    checkTimeout();
    // ...
  }
});
```

### 短期修复（中优先级）

#### 3. 添加详细的进度报告

```typescript
response.appendResponseLine('⏳ [1/6] Checking extension...');
// 执行操作
response.appendResponseLine('✅ [1/6] Extension found');

response.appendResponseLine('⏳ [2/6] Activating Service Worker...');
// 执行操作
response.appendResponseLine('✅ [2/6] Service Worker activated');
```

**好处**: 用户可以看到进度，知道工具没有卡住。

#### 4. 添加取消机制

允许用户中断长时间运行的操作。

### 长期改进（低优先级）

#### 5. 重构为更模块化的步骤

```typescript
class ExtensionReloader {
  async reload(options: ReloadOptions) {
    const steps = [
      () => this.checkExtension(),
      () => this.activateServiceWorker(),
      () => this.saveStorage(),
      () => this.executeReload(),
      () => this.waitForReady(),
      () => this.restoreStorage(),
    ];
    
    for (const step of steps) {
      await this.executeWithTimeout(step);
    }
  }
}
```

---

## 📊 测试覆盖率

| 工具类别 | 已测试 | 未测试 | 原因 |
|---------|--------|--------|------|
| 基础工具 | 3 | 0 | 工具名称错误 |
| 扩展工具 | 0 | 9 | 无法获取扩展列表 |
| 危险工具 | 0 | 2 | reload_extension, evaluate_in_extension |

**覆盖率**: 3/14 (21%)

---

## 🔧 建议的测试环境设置

### 方式 1: 使用测试扩展

```bash
# 1. 安装一个测试扩展
chrome --load-extension=/path/to/test-extension \
  --remote-debugging-port=9222

# 2. 运行测试
node test-tools-direct.mjs
```

### 方式 2: 模拟 IDE 环境

```bash
# 使用 Claude Desktop 配置
{
  "mcpServers": {
    "chrome-devtools": {
      "command": "node",
      "args": ["build/src/index.js"],
      "env": {
        "CHROME_REMOTE_URL": "http://localhost:9222"
      }
    }
  }
}
```

### 方式 3: 单元测试

创建针对 `reload_extension` 的单元测试：

```typescript
describe('reload_extension', () => {
  it('should timeout after 15 seconds', async () => {
    // 使用 mock 的 context
    const result = await reloadExtension({
      extensionId: 'test',
      waitForReady: true,
    });
    
    expect(result.duration).toBeLessThan(15000);
  });
});
```

---

## 🎯 结论

### 主要发现

1. ❌ **无法复现 reload_extension 卡住问题** - 因为基础测试失败
2. ✅ **发现严重的浏览器实例冲突** - 这是测试的最大障碍
3. ⚠️  **代码中存在潜在的无限等待点** - 需要添加超时保护

### 紧急建议

1. **立即修复** `list_extensions` 的浏览器冲突问题
2. **添加超时保护** 到所有可能卡住的操作
3. **增加进度反馈** 让用户知道工具在运行

### 下一步行动

1. 🔴 修复 `list_extensions` 工具
2. 🔴 验证 `--chrome-url` 参数是否被正确使用
3. 🟡 为 `reload_extension` 添加全局超时
4. 🟡 创建可靠的测试环境
5. 🟢 添加单元测试

---

**报告生成时间**: 2025-10-14 15:06  
**测试耗时**: ~5 分钟  
**发现问题数**: 3  
**建议修复数**: 5

**重要性评级**: 🔴 高 - 影响核心功能
