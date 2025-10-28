# 扩展检测失败 - 深度调试分析

## 问题现象

**时间**: 2025-10-25 15:10

**症状**:

- `list_extensions` 返回 "No Extensions Detected"
- chrome://extensions 页面显示扩展存在且已启用
- Enhanced MCP Debug Test Extension (ID: `pjeiljkehgiabmjmfjohffbihlopdabn`)

## 调试过程

### 1. 验证扩展存在

通过 `chrome.developerPrivate.getExtensionsInfo()` 验证：

```javascript
{
  "found": true,
  "name": "Enhanced MCP Debug Test Extension",
  "version": "2.3.0",
  "state": "ENABLED"
}
```

✅ **结论**: 扩展确实存在且已启用

### 2. ExtensionHelper 日志配置

查看 `src/McpContext.ts` 第 127-131 行：

```typescript
this.#extensionHelper = new ExtensionHelper(browser, {
  logging: {
    useConsole: true, // ✅ 已启用详细日志
  },
});
```

✅ **结论**: 日志已启用，应该能看到详细的检测过程

### 3. 扩展检测策略分析

查看 `src/extension/ExtensionHelper.ts` 的 `getExtensions()` 方法（第 586 行）：

**三层回退策略**:

#### 策略 1: chrome.management.getAll() API

```typescript
// 第 617 行
const managementExtensions =
  await this.getExtensionsViaManagementAPI(allTargets);
```

**要求**:

- 需要找到一个活跃的扩展上下文（Service Worker 或页面）
- 在该上下文中执行 `chrome.management.getAll()`

**可能失败的原因**:

1. 没有活跃的 Service Worker target
2. 没有活跃的扩展页面 target
3. MV2 background page 不活跃

#### 策略 2: Target.getTargets 扫描

```typescript
// 第 630 行
for (const target of allTargets) {
  if (target.url?.startsWith('chrome-extension://')) {
    const id = this.extractExtensionId(target.url);
    if (id) {
      extensionIds.add(id);
    }
  }
}
```

**要求**:

- CDP `Target.getTargets` 返回的 targets 中包含 `chrome-extension://` URL

**可能失败的原因**:

1. Service Worker 处于 inactive 状态
2. 没有打开的扩展页面
3. CDP 连接建立时扩展还未加载

#### 策略 3: 已知扩展 ID

```typescript
// 第 651 行
const knownIds = this.options.knownExtensionIds || [];
```

**当前状态**: 未配置已知扩展 ID

### 4. 关键发现

#### 问题 1: Service Worker 生命周期

**MV3 Service Worker 特性**:

- 空闲 30 秒后自动休眠
- 休眠后不会出现在 CDP targets 中
- 需要事件触发才会唤醒

**验证方法**:

```javascript
// 在 chrome://extensions 页面点击 "Service Worker" 链接
// 这会唤醒 SW 并打开 DevTools
```

#### 问题 2: MCP 重启时机

**时序问题**:

```
1. Chrome 启动 → 加载扩展 → Service Worker 启动
2. 30秒后 → Service Worker 休眠
3. MCP 服务器启动 → 连接 Chrome
4. getExtensions() 调用 → 找不到活跃的 SW target
```

**关键**: MCP 启动时，SW 可能已经休眠

#### 问题 3: CDP Target 类型

**CDP Target.getTargets 返回的类型**:

- `service_worker`: MV3 Service Worker（活跃时）
- `background_page`: MV2 Background Page
- `page`: 扩展页面（popup, options 等）
- `other`: 其他类型

**问题**: 如果所有扩展相关的 targets 都不活跃，CDP 不会返回它们

### 5. 根本原因分析

#### 核心问题: 扩展发现依赖活跃的 Target

**ExtensionHelper 的设计假设**:

1. 至少有一个活跃的扩展 target（SW 或页面）
2. 可以在该 target 中执行 `chrome.management.getAll()`
3. 或者能从 CDP targets 中提取扩展 ID

**MCP 重启后的实际情况**:

1. ❌ Service Worker 已休眠（不在 targets 中）
2. ❌ 没有打开的扩展页面
3. ❌ 无法执行 `chrome.management.getAll()`
4. ❌ 无法从 targets 中提取扩展 ID

#### 为什么第一次测试成功？

**第一次测试时**:

- Chrome 刚启动，扩展刚加载
- Service Worker 是活跃的
- 在 CDP targets 中可见
- `getExtensions()` 成功

**MCP 重启后**:

- Chrome 继续运行
- Service Worker 已休眠（超过 30 秒）
- 不在 CDP targets 中
- `getExtensions()` 失败

### 6. 解决方案分析

#### 方案 1: 主动唤醒 Service Worker ✅

**实现**: `getExtensionsViaManagementAPI` 第 322-366 行

```typescript
// 方案D: 主动激活扩展
const anyExtensionTarget = allTargets.find(t =>
  t.url?.startsWith('chrome-extension://'),
);

if (anyExtensionTarget) {
  const extId = this.extractExtensionId(anyExtensionTarget.url);
  // 通过打开 manifest.json 来触发 SW 激活
  const manifestPage = await this.browser.newPage();
  await manifestPage.goto(`chrome-extension://${extId}/manifest.json`);
  await manifestPage.close();

  // 等待 SW 激活
  await new Promise(resolve => setTimeout(resolve, 1500));
}
```

**问题**: 如果没有任何扩展相关的 target，这个方案也会失败

#### 方案 2: 使用 chrome://extensions 页面 ✅

**实现**: `getExtensionsViaVisualInspection` 第 457 行

```typescript
// 导航到 chrome://extensions/ 并解析 DOM
const page = await this.browser.newPage();
await page.goto('chrome://extensions/', {timeout: 5000});
```

**优点**:

- 不依赖活跃的 target
- 可以检测所有扩展（包括禁用的）
- 最可靠的方法

**问题**: 为什么没有被调用？

查看代码第 626-628 行：

```typescript
if (managementExtensions.length > 0) {
  // 返回结果，不会尝试方案 2
  return result;
}
```

**关键**: 只有当方案 1 返回空数组时，才会尝试方案 2

#### 方案 3: 配置已知扩展 ID ✅

**实现**: 第 651-664 行

```typescript
const knownIds = this.options.knownExtensionIds || [];
for (const knownId of knownIds) {
  if (!extensionIds.has(knownId)) {
    extensionIds.add(knownId);
  }
}
```

**优点**:

- 不依赖 CDP targets
- 可以检测休眠的扩展
- 适合已知扩展的场景

**问题**: 当前未配置

### 7. 为什么方案 1 返回空数组但没有尝试方案 2？

**关键代码** (第 369-372 行):

```typescript
if (!activeExtensionTarget) {
  this.log('[Management API] ❌ 无法找到任何可用的扩展上下文');
  return []; // ← 这里返回空数组
}
```

**问题**: 返回空数组后，主方法认为"方案 1 成功但没有扩展"，不会尝试方案 2

**修复建议**: 应该抛出异常或返回 null，而不是空数组

### 8. 日志缺失问题

**预期**: 应该看到详细的日志输出

**实际**: 没有看到任何日志

**可能原因**:

1. `logger()` 函数没有输出到控制台
2. 日志被过滤或重定向
3. 异步日志还未刷新

**验证方法**: 检查 `src/logger.js` 的实现

## 核心问题总结

### 问题 1: 方案 1 的回退逻辑有缺陷

**当前逻辑**:

```typescript
if (managementExtensions.length > 0) {
  return managementExtensions; // 成功
}
// 否则尝试方案 2
```

**问题**: `getExtensionsViaManagementAPI` 返回空数组时，被认为是"成功但没有扩展"

**修复**:

```typescript
// 方案 1 应该返回 null 表示失败，而不是空数组
if (!activeExtensionTarget) {
  return null; // 表示方案失败
}
```

### 问题 2: 缺少主动唤醒机制

**当前**: 只有在找到任意扩展 target 时才会尝试唤醒

**问题**: 如果所有扩展都休眠，找不到任何 target

**修复**: 应该尝试已知的扩展 ID 或使用其他方法唤醒

### 问题 3: 未配置已知扩展 ID

**当前**: `knownExtensionIds: []`

**建议**: 可以从配置文件或环境变量读取

## 立即可行的解决方案

### 方案 A: 重启 Chrome（推荐）✅

```bash
# 1. 关闭 Chrome
# 2. 重新启动
google-chrome --remote-debugging-port=9222
# 3. 加载扩展
# 4. 启动 MCP 服务器（在 SW 活跃时）
```

**优点**: 简单可靠
**缺点**: 需要手动操作

### 方案 B: 修复代码逻辑 ✅

**修改 1**: `getExtensionsViaManagementAPI` 返回 null 而不是空数组

```typescript
if (!activeExtensionTarget) {
  this.log('[Management API] ❌ 无法找到任何可用的扩展上下文');
  return null; // 改为 null
}
```

**修改 2**: 主方法检查 null

```typescript
const managementExtensions =
  await this.getExtensionsViaManagementAPI(allTargets);

if (managementExtensions !== null && managementExtensions.length > 0) {
  return managementExtensions;
}

// 尝试方案 2
this.log('[ExtensionHelper] 尝试方案 2: 视觉检测');
const visualExtensions =
  await this.getExtensionsViaVisualInspection(allTargets);
```

### 方案 C: 添加强制视觉检测选项 ✅

```typescript
async getExtensions(includeDisabled = false, forceVisualInspection = false): Promise<ExtensionInfo[]> {
  if (forceVisualInspection) {
    // 直接使用视觉检测
    return this.getExtensionsViaVisualInspection(allTargets);
  }
  // ... 现有逻辑
}
```

## 测试计划

### 测试 1: 验证日志输出

```bash
# 启动 MCP 服务器并查看日志
# 应该看到 [ExtensionHelper] 开头的日志
```

### 测试 2: 验证 CDP targets

```javascript
// 在任意页面执行
const cdp = await page.target().createCDPSession();
const {targetInfos} = await cdp.send('Target.getTargets');
console.log(targetInfos.filter(t => t.url?.includes('chrome-extension://')));
```

### 测试 3: 手动唤醒 Service Worker

```bash
# 1. 打开 chrome://extensions
# 2. 点击 "Service Worker" 链接
# 3. 立即调用 list_extensions
# 应该能检测到扩展
```

## 下一步行动

### 立即执行（5分钟）

1. ✅ 创建此诊断文档
2. ⏳ 修复 `getExtensionsViaManagementAPI` 返回值
3. ⏳ 测试修复后的代码

### 短期优化（30分钟）

1. 添加强制视觉检测选项
2. 改进日志输出
3. 添加更多调试信息

### 长期改进（2小时）

1. 实现扩展 ID 持久化
2. 添加主动唤醒机制
3. 优化检测策略

---

**分析完成时间**: 2025-10-25 15:15  
**核心发现**: 方案 1 的回退逻辑有缺陷，导致方案 2 从未被调用  
**建议修复**: 修改返回值逻辑，使用 null 表示失败而不是空数组
