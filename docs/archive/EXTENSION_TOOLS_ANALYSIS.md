# Extension 工具深度分析报告

## 📋 目录

1. [工具概览](#工具概览)
2. [架构分析](#架构分析)
3. [工具逐个分析](#工具逐个分析)
4. [核心问题识别](#核心问题识别)
5. [优化建议](#优化建议)

---

## 工具概览

### MCP Tools (8个)

位置: `src/tools/extensions.ts`

1. **listExtensions** - 列出所有扩展
2. **getExtensionDetails** - 获取扩展详情
3. **listExtensionContexts** - 列出扩展上下文
4. **switchExtensionContext** - 切换上下文
5. **inspectExtensionStorage** - 检查Storage
6. **reloadExtension** - 重载扩展
7. **activateServiceWorker** - 激活SW (核心工具)
8. **getExtensionLogs** - 获取日志
9. **evaluateInExtension** - 在扩展中执行代码

### 辅助模块 (4个)

位置: `src/extension/`

1. **ExtensionHelper.ts** (1303行) - 核心实现
2. **HelperExtensionClient.ts** (259行) - Helper客户端
3. **HelperExtensionGenerator.ts** (326行) - 动态生成Helper
4. **types.ts** (173行) - 类型定义

---

## 架构分析

### 整体架构

```
MCP Tools Layer (extensions.ts)
    ↓ 调用
McpContext (McpContext.ts)
    ↓ 委托
ExtensionHelper (ExtensionHelper.ts)
    ↓ 依赖
├── HelperExtensionClient (可选增强)
└── HelperExtensionGenerator (动态生成)
```

### 设计模式

1. **Facade 模式**: McpContext 作为统一入口
2. **Delegation 模式**: 委托给 ExtensionHelper
3. **Strategy 模式**: 多种SW激活策略
4. **Builder 模式**: HelperExtensionGenerator

---

## 🔍 工具逐个分析

### 1️⃣ listExtensions

**位置**: `src/tools/extensions.ts:12-98`

**实现分析**:

```typescript
async getExtensions(includeDisabled = false): Promise<ExtensionInfo[]>
```

**核心逻辑** (ExtensionHelper.ts:234-359):

1. **优先策略**: 使用 `chrome.management.getAll()` API
2. **降级策略**: Target扫描 + Manifest读取
3. **并行优化**: `Promise.all()` 并行获取manifest

**✅ 优点**:

- 优先使用高效的 management API
- 有降级方案保证兼容性
- 并行获取manifest提升性能
- 缓存机制避免重复请求

**❌ 问题**:

1. **硬编码扩展ID**: 第269-272行包含硬编码的 `KNOWN_EXTENSION_IDS`

   ```typescript
   const KNOWN_EXTENSION_IDS = [
     'kppbmoiecmhnnhjnlkojlblanellmonp', // 硬编码!
   ];
   ```

   **违反原则**: 不应在通用库中硬编码特定扩展ID

2. **超时参数不可配置**: manifest获取超时固定2秒

   ```typescript
   timeout: 2000, // 硬编码
   ```

3. **日志噪音**: 大量console.log影响生产环境

**🎯 优化建议**:

1. 移除硬编码ID，改为配置参数
2. 超时时间可配置
3. 使用 logger 替代 console.log
4. manifest缓存策略可改进(TTL机制)

---

### 2️⃣ getExtensionDetails

**位置**: `src/tools/extensions.ts:100-181`

**实现分析**:

```typescript
async getExtensionDetails(extensionId: string): Promise<ExtensionInfo | null>
```

**核心逻辑** (ExtensionHelper.ts:386-442):

- 获取manifest
- 查找background target
- 推断SW状态

**✅ 优点**:

- 简洁清晰
- 错误处理良好(静默失败)

**❌ 问题**:

1. **重复代码**: 与 getExtensions 有大量重复逻辑
2. **状态推断逻辑**: 判断SW状态的代码重复3次
   - getExtensions (L320-328)
   - getExtensionDetails (L406-415)
   - 应抽取为独立方法

**🎯 优化建议**:

```typescript
// 抽取公共方法
private determineServiceWorkerStatus(
  manifest: ManifestV3 | ManifestV2,
  backgroundTarget: CDPTargetInfo | null
): 'active' | 'inactive' | 'not_found' | undefined {
  if (manifest.manifest_version !== 3) return undefined;

  if (backgroundTarget?.type === 'service_worker') return 'active';
  if ((manifest as ManifestV3).background?.service_worker) return 'inactive';
  return 'not_found';
}
```

---

### 3️⃣ listExtensionContexts

**位置**: `src/tools/extensions.ts:183-259`

**实现分析**:

```typescript
async getExtensionContexts(extensionId: string): Promise<ExtensionContext[]>
```

**核心逻辑** (ExtensionHelper.ts:447-480):

- 获取所有targets
- 过滤匹配的扩展ID
- 推断context类型

**✅ 优点**:

- 逻辑清晰
- 分组展示友好

**❌ 问题**:

1. **类型推断过于简单**: `inferContextType` 仅通过URL判断

   ```typescript
   if (url.includes('/popup.html')) return 'popup';
   if (url.includes('/options.html')) return 'options';
   ```

   **问题**: 如果文件名不是标准命名会误判

2. **缺少offscreen类型**: MV3支持offscreen document但未处理

**🎯 优化建议**:

```typescript
private inferContextType(target: CDPTargetInfo, manifest?: ManifestV3): ExtensionContextType {
  if (target.type === 'service_worker') return 'background';
  if (target.type === 'background_page') return 'background';

  // 使用 manifest 精确判断
  if (manifest?.action?.default_popup && target.url.endsWith(manifest.action.default_popup)) {
    return 'popup';
  }
  if (manifest?.options_page && target.url.endsWith(manifest.options_page)) {
    return 'options';
  }

  // 检查 offscreen
  if (target.url.includes('/offscreen')) return 'offscreen';

  return 'content_script';
}
```

---

### 4️⃣ switchExtensionContext

**位置**: `src/tools/extensions.ts:261-297`

**实现分析**:

```typescript
async switchToExtensionContext(contextId: string): Promise<Page | null>
```

**核心逻辑** (ExtensionHelper.ts:540-580):

- Service Worker返回null (正确!)
- 常规Page通过Puppeteer API切换

**✅ 优点**:

- 正确区分SW和Page
- 有清晰的警告信息

**❌ 问题**:

1. **API设计不一致**: 返回 `Page | null` 但工具层抛错

   ```typescript
   // ExtensionHelper.ts
   if (target.type === 'service_worker') {
     console.warn('...Use evaluateInContext() instead.');
     return null; // 返回null
   }

   // McpContext.ts:465-470
   const page = await this.#extensionHelper.switchToExtensionContext(contextId);
   if (!page) {
     throw new Error(`Cannot access context ${contextId}`); // 抛错!
   }
   ```

   **违反原则**: Helper层已有判断，Context层又抛错，逻辑重复

**🎯 优化建议**:

```typescript
// 方案1: Helper层直接抛错，返回Page (非空)
async switchToExtensionContext(contextId: string): Promise<Page> {
  const target = targets.find(t => t.targetId === contextId);
  if (!target) throw new Error(`Context ${contextId} not found`);

  if (target.type === 'service_worker') {
    throw new Error('Service Worker has no Page. Use evaluateInContext()');
  }
  // ...
  return page; // 确保非null
}

// 方案2: 返回 Result 类型
type SwitchResult =
  | { success: true; page: Page }
  | { success: false; error: string; useEvaluate: boolean };
```

---

### 5️⃣ inspectExtensionStorage ⭐核心工具

**位置**: `src/tools/extensions.ts:299-369`

**实现分析**:

```typescript
async getExtensionStorage(extensionId: string, storageType: StorageType): Promise<StorageData>
```

**核心逻辑** (ExtensionHelper.ts:1178-1301):

1. 检查SW是否激活
2. 未激活 → 自动激活
3. 通过CDP执行代码获取storage

**✅ 优点**:

- 自动激活机制优雅
- 错误处理详细
- quota信息完整

**❌ 问题**:

1. **代码注入安全**: 使用字符串模板拼接JS代码

   ```typescript
   const evalResult = await cdp.send('Runtime.evaluate', {
     expression: `
       (async () => {
         const storage = chrome.storage['${storageType}']; // 直接拼接!
         // ...
       })()
     `,
   });
   ```

   **风险**: 如果storageType被污染(虽然有enum限制)

2. **重复代码**: attach/detach逻辑在多个方法中重复

**🎯 优化建议**:

```typescript
// 抽取公共方法
private async withAttachedSession<T>(
  targetId: string,
  callback: (cdp: CDPSession) => Promise<T>
): Promise<T> {
  const cdp = await this.getCDPSession();
  const {sessionId} = await cdp.send('Target.attachToTarget', {
    targetId,
    flatten: true,
  });

  try {
    return await callback(cdp);
  } finally {
    await cdp.send('Target.detachFromTarget', {sessionId}).catch(() => {});
  }
}

// 使用参数化代码而非模板字符串
const STORAGE_ACCESS_FUNCTION = `
  async function accessStorage(type) {
    const storage = chrome.storage[type];
    return await storage.get(null);
  }
`;
```

---

### 6️⃣ activateServiceWorker ⭐⭐⭐ 核心中的核心

**位置**: `src/tools/extensions.ts:423-502`

**实现分析**:

```typescript
async activateServiceWorker(extensionId: string): Promise<ActivationResult>
```

**核心逻辑** (ExtensionHelper.ts:622-690):

```
方法0: Helper Extension (优先级最高) ⭐⭐⭐⭐⭐
  ↓ 失败
方法1: 直接CDP激活 (多种子方法)
  - ServiceWorker.startWorker
  - 执行唤醒代码 (clients.matchAll, skipWaiting, etc.)
  - 触发事件 (activate, install, message)
  ↓ 失败
方法2: 打开扩展页面激活
  - 尝试popup
  - 尝试options
  - 页面内调用chrome API
  ↓ 失败
方法3: 手动激活指南
```

**✅ 优点**:

- **策略丰富**: 3大类 + 多种子策略
- **优先级清晰**: Helper → CDP → Page → Manual
- **错误处理**: 每个策略都有fallback
- **用户指导**: 失败时提供详细的手动指南

**❌ 严重问题**:

#### 问题1: Helper Extension 依赖自动检测 (违反手动原则)

```typescript
// Line 632-653
await this.ensureHelperClient();

if (this.helperClient && this.helperClient.isHelperAvailable()) {
  console.log(`✨ 检测到 Helper Extension，使用增强模式`);
  const helperResult = await this.helperClient.activateExtension(extensionId);
  // ...
}
```

**问题**:

- `ensureHelperClient()` 会自动调用 `detectHelperExtension()`
- 检测过程包含多次网络请求和manifest读取
- **用户要求**: SW激活使用手动方式
- **违反**: 自动检测Helper Extension

#### 问题2: 方法1的多个子策略都在自动执行

```typescript
// Line 714-728: 自动调用 ServiceWorker.startWorker
await cdp.send('ServiceWorker.startWorker', {
  scopeURL: `chrome-extension://${extensionId}/`,
});

// Line 732-758: 自动执行多种唤醒代码
const wakeMethods = [
  'self.clients.matchAll()',
  'self.skipWaiting()',
  'chrome.storage.local.get(null)',
  'chrome.runtime.getManifest()',
];
for (const wakeCode of wakeMethods) {
  await this.evaluateInContext(...); // 自动执行!
}

// Line 764-796: 自动触发事件
await this.evaluateInContext(backgroundTarget.targetId, `
  (async () => {
    const events = [...];
    for (const event of events) {
      try { event(); } catch(e) {}
    }
  })()
`);
```

**问题**: 全部自动执行，没有用户确认

#### 问题3: 方法2自动打开扩展页面

```typescript
// Line 863-880: 自动打开页面
const page = await this.browser.newPage();
await page.goto(targetUrl, {
  waitUntil: 'networkidle0',
  timeout: 5000,
});

await page.evaluate(`
  if (typeof chrome !== 'undefined' && chrome.runtime) {
    chrome.runtime.sendMessage({type: 'activation_ping'}).catch(() => {});
  }
`);
```

**问题**: 自动打开页面并执行代码

#### 问题4: 代码重复且冗长

- 激活相关代码 > 400行
- tryDirectActivation: 107行
- tryPageActivation: 140行
- 大量重复的try-catch结构

**🎯 优化建议 (遵循手动原则)**:

```typescript
// 设计1: 改为策略查询 + 手动执行

interface ActivationStrategy {
  name: string;
  description: string;
  requiresUserAction: boolean;
  execute: () => Promise<boolean>;
}

async getActivationStrategies(extensionId: string): Promise<ActivationStrategy[]> {
  const strategies: ActivationStrategy[] = [];

  // 策略0: Helper Extension (需要用户先安装)
  if (await this.isHelperExtensionAvailable()) {
    strategies.push({
      name: 'Helper Extension',
      description: 'Use installed MCP Helper Extension (most reliable)',
      requiresUserAction: false,
      execute: () => this.activateViaHelper(extensionId),
    });
  }

  // 策略1: CDP ServiceWorker API
  strategies.push({
    name: 'CDP ServiceWorker.startWorker',
    description: 'Direct CDP command to start service worker',
    requiresUserAction: false,
    execute: () => this.activateViaCDP(extensionId),
  });

  // 策略2: Open Extension Page
  const manifest = await this.getExtensionManifest(extensionId);
  if (manifest?.action?.default_popup) {
    strategies.push({
      name: 'Open Popup Page',
      description: `Open ${manifest.action.default_popup}`,
      requiresUserAction: true,
      execute: () => this.activateViaPage(extensionId, 'popup'),
    });
  }

  // 策略3: Manual
  strategies.push({
    name: 'Manual Activation',
    description: 'Open chrome://extensions and click Service Worker link',
    requiresUserAction: true,
    execute: () => Promise.resolve(false),
  });

  return strategies;
}

// 手动执行指定策略
async executeActivationStrategy(
  extensionId: string,
  strategyIndex: number
): Promise<ActivationResult> {
  const strategies = await this.getActivationStrategies(extensionId);
  const strategy = strategies[strategyIndex];

  if (!strategy) {
    throw new Error(`Invalid strategy index: ${strategyIndex}`);
  }

  const success = await strategy.execute();
  return {
    success,
    method: strategy.name,
    error: success ? undefined : 'Strategy execution failed',
  };
}
```

```typescript
// 设计2: 完全手动模式

// 仅提供诊断信息,不执行任何激活操作
async diagnoseServiceWorker(extensionId: string): Promise<{
  isActive: boolean;
  manifest: ManifestV3 | ManifestV2 | null;
  backgroundTarget: CDPTargetInfo | null;
  availablePages: string[];
  recommendations: string[];
}> {
  const isActive = await this.isServiceWorkerActive(extensionId);
  const manifest = await this.getExtensionManifest(extensionId);
  const backgroundTarget = await this.getExtensionBackgroundTarget(extensionId);

  const availablePages = [];
  if (manifest?.action?.default_popup) {
    availablePages.push(`chrome-extension://${extensionId}/${manifest.action.default_popup}`);
  }
  if (manifest?.options_page) {
    availablePages.push(`chrome-extension://${extensionId}/${manifest.options_page}`);
  }

  const recommendations = [];
  if (!isActive) {
    recommendations.push('Service Worker is inactive');
    if (availablePages.length > 0) {
      recommendations.push(`Try opening: ${availablePages[0]}`);
    }
    recommendations.push('Or visit chrome://extensions and click "Service worker"');
  }

  return {
    isActive,
    manifest,
    backgroundTarget,
    availablePages,
    recommendations,
  };
}

// 仅提供激活页面的URL,由用户决定是否打开
async getActivationPageUrl(extensionId: string): Promise<string | null> {
  const manifest = await this.getExtensionManifest(extensionId);
  if (!manifest) return null;

  if (manifest.action?.default_popup) {
    return `chrome-extension://${extensionId}/${manifest.action.default_popup}`;
  }
  if (manifest.options_page) {
    return `chrome-extension://${extensionId}/${manifest.options_page}`;
  }

  return null;
}
```

---

### 7️⃣ getExtensionLogs

**位置**: `src/tools/extensions.ts:504-596`

**实现分析**:

```typescript
async getExtensionLogs(extensionId: string): Promise<LogResult>
```

**核心逻辑** (ExtensionHelper.ts:1095-1172):

- 仅支持获取存储在 `globalThis.__logs` 的日志
- 不支持实时console捕获

**❌ 严重局限**:

1. **依赖扩展自己实现**: 需要扩展主动保存日志到 `globalThis.__logs`
2. **不是真正的日志工具**: 更像是"读取扩展自定义日志"

**🎯 改进方案**:

```typescript
// 真正的日志捕获
async captureExtensionLogs(
  extensionId: string,
  duration: number = 30000
): Promise<ConsoleMessage[]> {
  const backgroundTarget = await this.getExtensionBackgroundTarget(extensionId);
  if (!backgroundTarget) throw new Error('Background not found');

  const cdp = await this.getCDPSession();
  await cdp.send('Console.enable');
  await cdp.send('Log.enable');

  const logs: ConsoleMessage[] = [];

  const listener = (event: any) => {
    logs.push({
      type: event.type,
      text: event.args?.map((arg: any) => arg.value).join(' '),
      timestamp: Date.now(),
      source: 'console',
    });
  };

  cdp.on('Console.messageAdded', listener);

  await new Promise(resolve => setTimeout(resolve, duration));

  cdp.off('Console.messageAdded', listener);

  return logs;
}
```

---

### 8️⃣ evaluateInExtension

**位置**: `src/tools/extensions.ts:598-678`

**实现分析**:

```typescript
async evaluateInExtensionContext(contextId: string, code: string, awaitPromise = true): Promise<unknown>
```

**核心逻辑** (ExtensionHelper.ts:486-534):

- 使用CDP的 `Runtime.evaluate`
- attach → evaluate → detach

**✅ 优点**:

- 正确处理Service Worker (不需要Page对象)
- 支持async/await

**❌ 问题**:

1. **代码包装逻辑混乱**:

   ```typescript
   // extensions.ts:651-653
   const wrappedCode = code.trim().startsWith('return ')
     ? `(async () => { ${code} })()`
     : `(async () => { return ${code} })()`;
   ```

   **问题**:
   - 如果code是 `return 1 + 1;` → `(async () => { return 1 + 1; })()` ✅
   - 如果code是 `const x = 1;` → `(async () => { return const x = 1; })()` ❌语法错误!

2. **错误处理不一致**:

   ```typescript
   // ExtensionHelper.ts:515-520
   if (evalResult.exceptionDetails) {
     throw new Error(
       evalResult.exceptionDetails.exception?.description || 'Evaluation failed',
     );
   }

   // extensions.ts:662-664
   if (result && typeof result === 'object' && 'error' in result) {
     response.appendResponseLine(`**Error**: ${(result as {error: string}).error}`);
   } else {
   ```

   **问题**: 两层错误处理,逻辑混乱

**🎯 优化建议**:

```typescript
// 改进代码包装
function wrapCodeForEvaluation(code: string): string {
  const trimmed = code.trim();

  // 如果已经是表达式(不包含语句关键字)
  const statementKeywords = /^\s*(const|let|var|function|class|if|for|while|return)\s/;

  if (!statementKeywords.test(trimmed)) {
    // 表达式,直接return
    return `(async () => { return (${trimmed}); })()`;
  }

  // 语句,需要wrap
  if (trimmed.startsWith('return ')) {
    return `(async () => { ${trimmed} })()`;
  }

  return `(async () => { ${trimmed} })()`;
}

// 统一错误处理
async evaluateInExtensionContext(
  contextId: string,
  code: string,
  awaitPromise = true
): Promise<{success: boolean; result?: unknown; error?: string}> {
  try {
    const wrappedCode = wrapCodeForEvaluation(code);
    const evalResult = await cdp.send('Runtime.evaluate', {
      expression: wrappedCode,
      returnByValue: true,
      awaitPromise,
    });

    if (evalResult.exceptionDetails) {
      return {
        success: false,
        error: evalResult.exceptionDetails.exception?.description || 'Unknown error',
      };
    }

    return {
      success: true,
      result: evalResult.result?.value,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
```

---

### 9️⃣ reloadExtension

**位置**: `src/tools/extensions.ts:371-421`

**实现分析**:

```typescript
handler: async (request, response, context) => {
  // ...
  response.appendResponseLine(
    `Use \`evaluate_in_extension\` tool to execute: \`chrome.runtime.reload()\``,
  );
};
```

**❌ 致命问题**:

**这不是工具,是提示信息!**

- 没有实际执行reload
- 只是告诉用户去用另一个工具
- 完全可以删除

**🎯 优化**:

```typescript
// 方案1: 真正实现reload
handler: async (request, response, context) => {
  const {extensionId} = request.params;

  const backgroundContext = await context
    .getExtensionContexts(extensionId)
    .then(ctxs => ctxs.find(c => c.isPrimary));

  if (!backgroundContext) {
    throw new Error('No background context found');
  }

  await context.evaluateInExtensionContext(
    backgroundContext.targetId,
    'chrome.runtime.reload()',
    false,
  );

  response.appendResponseLine('✅ Extension reload triggered');
};

// 方案2: 删除这个工具,合并到evaluateInExtension的文档示例
```

---

## 🚨 核心问题识别

### 第一性原理分析

**问题根源**: 设计时没有明确"自动化"与"手动控制"的边界

#### 1. 自动化边界模糊

**现状**:

- `activateServiceWorker` 自动尝试多种激活方法
- `inspectExtensionStorage` 自动激活SW
- `HelperExtensionClient` 自动检测Helper Extension

**违反第一性原理**:

- **控制权**: 工具应该服务用户,而非替用户做决定
- **透明性**: 自动化过程不透明,用户不知道发生了什么
- **可预测性**: 自动尝试多种方法,结果不可预测

#### 2. 代码重复严重

**统计**:

```
- SW状态判断逻辑: 重复3次
- attach/detach模式: 重复5次
- manifest获取逻辑: 重复2次
- 错误处理模式: 每个方法都有类似的try-catch
```

**违反DRY原则**

#### 3. 责任边界不清

```
McpContext → ExtensionHelper → HelperClient
   ↓              ↓                  ↓
  抛错          返回null          返回结果
```

**问题**: 每层都在做判断和转换,逻辑重复

#### 4. 硬编码问题

**问题列表**:

1. 扩展ID硬编码 (L269-272)
2. 超时时间硬编码 (2000ms, 5000ms散落各处)
3. 日志使用console.log而非logger
4. 文件名假设 ('/popup.html', '/options.html')

#### 5. 工具命名和功能不符

| 工具名                | 期望功能        | 实际功能             |
| --------------------- | --------------- | -------------------- |
| reloadExtension       | 重载扩展        | 只是提示信息         |
| getExtensionLogs      | 获取console日志 | 只读取自定义\_\_logs |
| activateServiceWorker | 激活SW          | 自动尝试多种方法     |

---

## 💡 优化建议

### 重构策略

#### 策略1: 明确自动化层级

```typescript
// Level 1: 只读查询 (完全安全)
- listExtensions
- getExtensionDetails
- listExtensionContexts
- isServiceWorkerActive

// Level 2: 状态切换 (需要确认)
- switchExtensionContext
- evaluateInExtensionContext

// Level 3: 需要用户决策
- activateServiceWorker → 改为诊断 + 策略列表
- inspectExtensionStorage → 如SW未激活,抛错并提示
```

#### 策略2: 抽取公共层

```typescript
// 新建 ExtensionCDPHelper.ts
class ExtensionCDPHelper {
  // 统一的 attach/detach 模式
  async withSession<T>(
    targetId: string,
    fn: (cdp: CDPSession) => Promise<T>,
  ): Promise<T>;

  // 统一的错误处理
  wrapWithErrorHandling<T>(fn: () => Promise<T>): Promise<Result<T>>;

  // 统一的SW状态判断
  determineServiceWorkerStatus(manifest, target): ServiceWorkerStatus;
}

// 新建 ExtensionManifestCache.ts
class ExtensionManifestCache {
  private cache = new Map<string, {manifest: Manifest; timestamp: number}>();
  private readonly TTL = 60000; // 60s

  async get(extensionId: string): Promise<Manifest | null>;
  invalidate(extensionId: string): void;
  clear(): void;
}
```

#### 策略3: 改进activateServiceWorker

```typescript
// 新工具: diagnoseServiceWorker
async diagnoseServiceWorker(extensionId: string): Promise<{
  status: 'active' | 'inactive' | 'not_found';
  activationStrategies: Array<{
    id: string;
    name: string;
    description: string;
    automated: boolean;
    estimatedSuccessRate: number;
  }>;
  quickAction?: {
    description: string;
    pageUrl?: string;
  };
}>;

// 新工具: executeActivationStrategy
async executeActivationStrategy(
  extensionId: string,
  strategyId: string,
  options?: {
    confirm?: boolean; // 需要用户确认
  }
): Promise<{
  success: boolean;
  method: string;
  error?: string;
}>;
```

#### 策略4: 改进日志工具

```typescript
// 替换 getExtensionLogs
async startExtensionLogCapture(
  extensionId: string,
  options: {
    duration?: number;
    levels?: ('log' | 'info' | 'warn' | 'error')[];
  }
): Promise<{
  captureId: string;
  message: string;
}>;

async stopExtensionLogCapture(captureId: string): Promise<{
  logs: ConsoleMessage[];
  count: number;
}>;

// 兼容现有方式
async getStoredLogs(extensionId: string): Promise<{
  logs: any[];
  note: string; // "These are custom logs stored by the extension"
}>;
```

#### 策略5: 配置化

```typescript
// 新建 ExtensionHelperConfig.ts
interface ExtensionHelperConfig {
  // 超时配置
  timeouts: {
    manifestLoad: number; // 默认2000
    pageLoad: number; // 默认5000
    activation: number; // 默认10000
  };

  // 缓存配置
  cache: {
    manifestTTL: number; // 默认60000
    enabled: boolean; // 默认true
  };

  // 日志配置
  logging: {
    level: 'debug' | 'info' | 'warn' | 'error';
    useConsole: boolean; // 默认false
  };

  // 自动化配置
  automation: {
    autoActivateSW: boolean; // 默认false
    autoDetectHelper: boolean; // 默认false
  };
}

class ExtensionHelper {
  constructor(
    private browser: Browser,
    private config: Partial<ExtensionHelperConfig> = {},
  ) {
    this.config = {...DEFAULT_CONFIG, ...config};
  }
}
```

---

### 立即可执行的改进 (Top 5)

#### 1. 移除硬编码扩展ID ⚡

```typescript
// ExtensionHelper.ts L269-272
// 删除
const KNOWN_EXTENSION_IDS = [
  'kppbmoiecmhnnhjnlkojlblanellmonp',
];

// 改为配置参数
constructor(
  private browser: Browser,
  private options: {
    knownExtensionIds?: string[];
  } = {}
) {}
```

#### 2. 抽取determineServiceWorkerStatus ⚡

```typescript
// ExtensionHelper.ts 新增方法
private determineServiceWorkerStatus(
  manifest: ManifestV3 | ManifestV2,
  backgroundTarget: CDPTargetInfo | null
): 'active' | 'inactive' | 'not_found' | undefined {
  if (manifest.manifest_version !== 3) return undefined;

  if (backgroundTarget?.type === 'service_worker') {
    return 'active';
  }

  const mv3Manifest = manifest as ManifestV3;
  if (mv3Manifest.background?.service_worker) {
    return 'inactive';
  }

  return 'not_found';
}

// 使用这个方法替换L320-328, L406-415等处的重复代码
```

#### 3. 修复evaluateInExtension代码包装 ⚡

```typescript
// extensions.ts:651-653 替换
const wrappedCode = wrapCodeSafely(code);

// 新增辅助函数
function wrapCodeSafely(code: string): string {
  const trimmed = code.trim();

  // 检查是否是语句
  const isStatement =
    /^\s*(const|let|var|function|class|if|for|while|try)\s/.test(trimmed);

  if (isStatement) {
    // 多个语句,直接包装
    return `(async () => { ${trimmed} })()`;
  }

  // 单个表达式或return语句
  if (trimmed.startsWith('return ')) {
    return `(async () => { ${trimmed} })()`;
  }

  // 表达式,需要return
  return `(async () => { return (${trimmed}); })()`;
}
```

#### 4. 统一日志使用logger ⚡

```typescript
// ExtensionHelper.ts 构造函数添加
constructor(
  private browser: Browser,
  private logger?: Debugger
) {
  this.logger = logger || createDebugLogger('ExtensionHelper');
}

// 全局替换 console.log → this.logger
// 全局替换 console.warn → this.logger
// 全局替换 console.error → this.logger
```

#### 5. reloadExtension真正实现 ⚡

```typescript
// extensions.ts:371-421 替换handler
handler: async (request, response, context) => {
  const {extensionId} = request.params;

  const contexts = await context.getExtensionContexts(extensionId);
  const backgroundContext = contexts.find(c => c.isPrimary);

  if (!backgroundContext) {
    throw new Error(
      `No background context found for extension ${extensionId}. ` +
      `Extension may be disabled or not running.`
    );
  }

  response.appendResponseLine(`# Reloading Extension\n`);
  response.appendResponseLine(`**Extension ID**: ${extensionId}`);
  response.appendResponseLine(`**Background**: ${backgroundContext.type}\n`);

  try {
    await context.evaluateInExtensionContext(
      backgroundContext.targetId,
      'chrome.runtime.reload()',
      false
    );

    response.appendResponseLine(`✅ Reload command sent successfully`);
    response.appendResponseLine(`\n**Note**: The extension will restart in a few seconds.`);
  } catch (error) {
    throw new Error(
      `Failed to reload extension: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  response.setIncludePages(true);
},
```

---

## 📊 重构优先级矩阵

| 问题                      | 影响范围 | 复杂度 | 优先级 | 工作量 |
| ------------------------- | -------- | ------ | ------ | ------ |
| 硬编码扩展ID              | 低       | 低     | P0     | 30min  |
| 抽取SW状态判断            | 中       | 低     | P0     | 1h     |
| 修复代码包装              | 高       | 中     | P0     | 2h     |
| 统一logger                | 低       | 低     | P1     | 1h     |
| 实现reloadExtension       | 中       | 低     | P1     | 1h     |
| activateServiceWorker重构 | 高       | 高     | P1     | 8h     |
| 日志工具重写              | 中       | 中     | P2     | 4h     |
| 配置化                    | 中       | 中     | P2     | 6h     |
| 抽取公共层                | 高       | 高     | P2     | 10h    |

---

## 📝 总结

### 工具质量评分

| 工具                    | 实现 | 文档 | 测试 | 总分 |
| ----------------------- | ---- | ---- | ---- | ---- |
| listExtensions          | 7/10 | 8/10 | ?    | 7.5  |
| getExtensionDetails     | 6/10 | 8/10 | ?    | 7.0  |
| listExtensionContexts   | 7/10 | 9/10 | ?    | 8.0  |
| switchExtensionContext  | 6/10 | 7/10 | ?    | 6.5  |
| inspectExtensionStorage | 8/10 | 9/10 | ?    | 8.5  |
| activateServiceWorker   | 4/10 | 7/10 | ?    | 5.5  |
| getExtensionLogs        | 3/10 | 6/10 | ?    | 4.5  |
| evaluateInExtension     | 6/10 | 8/10 | ?    | 7.0  |
| reloadExtension         | 2/10 | 5/10 | ?    | 3.5  |

**平均分**: 6.4/10

### 关键发现

1. **设计理念混乱**: 自动化与手动控制边界不清
2. **代码质量中等**: 大量重复,缺乏抽象
3. **文档较好**: 大部分工具有清晰的说明
4. **测试未知**: 未评估测试覆盖率

### 最严重的问题

⚠️ **activateServiceWorker**:

- 违反用户要求的"手动原则"
- 代码冗长(>400行)
- 逻辑复杂(3大类+多子策略)
- 自动执行多种激活方法
- 建议完全重构为诊断+策略选择模式

⚠️ **reloadExtension**:

- 名不副实,只是提示信息
- 建议删除或真正实现

⚠️ **getExtensionLogs**:

- 功能严重受限
- 依赖扩展自定义实现
- 建议重写为真正的日志捕获工具

### 推荐行动

**Phase 1 (快速修复 - 1周)**:

1. ✅ 移除硬编码
2. ✅ 抽取重复代码
3. ✅ 修复evaluateInExtension
4. ✅ 统一日志
5. ✅ 实现reloadExtension

**Phase 2 (重构核心 - 2周)**:

1. 🔧 activateServiceWorker → 诊断模式
2. 🔧 getExtensionLogs → 真正的日志捕获
3. 🔧 配置化
4. 🔧 抽取公共层

**Phase 3 (架构优化 - 1周)**:

1. 📐 统一错误处理模式
2. 📐 Result类型替代异常
3. 📐 完善测试覆盖率

---

## 🎯 最佳实践建议

### 1. 遵循单一职责原则

每个工具应该只做一件事:

- ✅ 查询就是查询
- ✅ 执行就是执行
- ❌ 不要在查询中自动执行

### 2. 明确自动化边界

```typescript
// 好的设计
async diagnose() { /* 只诊断 */ }
async execute(strategy) { /* 需要明确策略 */ }

// 坏的设计
async autoFix() { /* 自动尝试各种方法 */ }
```

### 3. 错误处理统一

```typescript
// 使用Result类型
type Result<T> = {success: true; data: T} | {success: false; error: string};

// 而非混用异常和null
```

### 4. 配置优于硬编码

```typescript
// ✅ Good
new ExtensionHelper(browser, {
  timeouts: {manifest: 3000},
  knownIds: ['xxx', 'yyy'],
});

// ❌ Bad
const TIMEOUT = 2000; // 硬编码
const KNOWN_IDS = ['xxx']; // 硬编码
```

### 5. 日志规范

```typescript
// ✅ Good
this.logger.debug('[ExtensionHelper] Starting detection...');

// ❌ Bad
console.log('Starting...');
```

---

**分析完成时间**: 2025-01-12
**分析者**: Cascade AI
**文档版本**: 1.0
