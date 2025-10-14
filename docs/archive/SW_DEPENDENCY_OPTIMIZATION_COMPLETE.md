# Service Worker Dependency Optimization - Complete

## 执行时间
2025-10-13 21:05

---

## 优化概述

全面优化所有依赖 Service Worker 激活状态的 Extension 工具,确保:
1. ✅ **前置描述明确** - 清楚说明 SW 依赖
2. ✅ **智能错误检测** - 自动识别 SW 相关错误
3. ✅ **友好错误提示** - 提供可操作的解决方案
4. ✅ **一致性体验** - 所有工具使用相同的错误处理风格

---

## 依赖 SW 的工具分析

### 工具分类

| 工具名称 | SW 依赖 | 前置描述 | 错误处理 | 状态 |
|---------|--------|---------|---------|------|
| evaluate_in_extension | 🔴 必需 | ✅ 完善 | ✅ 已优化 | ✅ |
| inspect_extension_storage | 🔴 必需 | ✅ 完善 | ✅ 已优化 | ✅ |
| get_extension_logs | 🟡 部分 | ✅ 完善 | ✅ 已优化 | ✅ |
| list_extension_contexts | 🟡 部分 | ✅ 完善 | ✅ 已完善 | ✅ |
| reload_extension | 🟢 自动 | ✅ 完善 | ✅ 自动激活 | ✅ |

**图例**:
- 🔴 必需: 必须有活跃的 SW
- 🟡 部分: SW 未激活会影响部分功能
- 🟢 自动: 工具自动处理 SW 激活

---

## 优化详情

### 1. inspect_extension_storage ⭐ 高优先级

**SW 依赖**: 🔴 必需 - chrome.storage API 需要 SW 激活才能访问

#### 优化前
```typescript
catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  throw new Error(`Failed to inspect storage: ${message}`);
}
```

**问题**:
- ❌ 简单重抛错误,不友好
- ❌ 没有智能检测 SW 问题
- ❌ 没有提供解决建议

#### 优化后
```typescript
catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  
  response.appendResponseLine(`# ❌ Storage Inspection Failed\n`);
  response.appendResponseLine(`**Extension ID**: ${extensionId}`);
  response.appendResponseLine(`**Storage Type**: ${storageType}\n`);
  response.appendResponseLine(`**Error**: ${message}\n`);
  
  // Smart detection of Service Worker related errors
  if (
    message.includes('No background context') ||
    message.includes('Service Worker') ||
    message.includes('inactive') ||
    message.includes('not running') ||
    message.includes('context') ||
    message.toLowerCase().includes('sw')
  ) {
    response.appendResponseLine(`## 🔴 Service Worker Issue Detected\n`);
    response.appendResponseLine(`For MV3 extensions, chrome.storage API requires an active Service Worker.\n`);
    response.appendResponseLine(`**Solution**:`);
    response.appendResponseLine(`1. Check SW status: \`list_extensions\` (look for 🔴 Inactive)`);
    response.appendResponseLine(`2. Activate SW: \`activate_extension_service_worker\` with extensionId="${extensionId}"`);
    response.appendResponseLine(`3. Retry: \`inspect_extension_storage\` with extensionId="${extensionId}"\n`);
    response.appendResponseLine(`**Why this happens**: MV3 Service Workers become inactive after ~30 seconds of inactivity.`);
  } else {
    response.appendResponseLine(`**Possible causes**:`);
    response.appendResponseLine(`- Extension is disabled or uninstalled`);
    response.appendResponseLine(`- Extension ID is incorrect`);
    response.appendResponseLine(`- Storage type "${storageType}" is not supported by this extension`);
    response.appendResponseLine(`- Extension lacks storage permissions in manifest`);
  }
  
  response.setIncludePages(true);
}
```

**改进**:
- ✅ 智能检测 SW 相关错误(多种关键词匹配)
- ✅ 明确的错误类型标识 (🔴 Service Worker Issue)
- ✅ 3步解决方案(check → activate → retry)
- ✅ 解释原因("为什么会发生")
- ✅ 区分 SW 错误和其他错误
- ✅ 提供具体的命令示例

---

### 2. get_extension_logs ⭐ 中优先级

**SW 依赖**: 🟡 部分 - SW 日志需要 SW 激活,但 content script 日志不需要

#### 优化前
```typescript
catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  throw new Error(`Failed to get extension logs: ${message}`);
}
```

**问题**:
- ❌ 简单重抛错误
- ❌ 没有说明部分日志仍可用
- ❌ 没有指导如何获取背景日志

#### 优化后
```typescript
catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  
  response.appendResponseLine(`# ❌ Failed to Get Extension Logs\n`);
  response.appendResponseLine(`**Extension ID**: ${extensionId}\n`);
  response.appendResponseLine(`**Error**: ${message}\n`);
  
  // Smart detection of Service Worker related errors
  if (
    message.includes('No background context') ||
    message.includes('Service Worker') ||
    message.includes('inactive') ||
    message.includes('not running') ||
    message.toLowerCase().includes('sw')
  ) {
    response.appendResponseLine(`## 🟡 Service Worker Inactive\n`);
    response.appendResponseLine(`The Service Worker is not active, so **background logs are unavailable**.\n`);
    response.appendResponseLine(`**However**: Content script logs may still be available if the extension has content scripts running.\n`);
    response.appendResponseLine(`**To get background logs**:`);
    response.appendResponseLine(`1. Check SW status: \`list_extensions\``);
    response.appendResponseLine(`2. Activate SW: \`activate_extension_service_worker\` with extensionId="${extensionId}"`);
    response.appendResponseLine(`3. Wait a moment for SW to generate logs`);
    response.appendResponseLine(`4. Retry: \`get_extension_logs\` with extensionId="${extensionId}"\n`);
  } else {
    response.appendResponseLine(`**Possible causes**:`);
    response.appendResponseLine(`- Extension is disabled or uninstalled`);
    response.appendResponseLine(`- Extension ID is incorrect`);
    response.appendResponseLine(`- Extension has not generated any logs yet`);
    response.appendResponseLine(`- Chrome DevTools Protocol connection issue`);
  }
  
  response.setIncludePages(true);
}
```

**改进**:
- ✅ 使用 🟡 表示部分影响
- ✅ 明确说明 content script 日志仍可用
- ✅ 4步解决方案(包含等待时间)
- ✅ 区分 SW 错误和其他错误
- ✅ 更友好的提示

---

### 3. evaluate_in_extension ⭐ 高优先级

**SW 依赖**: 🔴 必需 - 需要在 background context 中执行代码

#### 优化前
```typescript
catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  
  response.appendResponseLine(`# Evaluation Error\n`);
  response.appendResponseLine(`**Error**: ${message}\n`);
  response.appendResponseLine(`**Possible causes**:`);
  response.appendResponseLine('- Syntax error in JavaScript code');
  response.appendResponseLine('- Extension context is not active');
  response.appendResponseLine('- Missing permissions for the API being used');
  response.appendResponseLine('- Service Worker is not running (for MV3)');
  response.appendResponseLine('\n💡 **Tip**: If the Service Worker is inactive, use `activate_extension_service_worker` to activate it first');
}
```

**问题**:
- ⚠️ 错误类型不明确
- ⚠️ 所有原因混在一起
- ⚠️ 没有智能检测具体问题

#### 优化后
```typescript
catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  
  response.appendResponseLine(`# ❌ Code Evaluation Failed\n`);
  response.appendResponseLine(`**Extension ID**: ${extensionId}`);
  if (contextId) {
    response.appendResponseLine(`**Context ID**: ${contextId}`);
  }
  response.appendResponseLine(`\n**Code**:\n\`\`\`javascript\n${code}\n\`\`\``);
  response.appendResponseLine(`\n**Error**: ${message}\n`);
  
  // Smart detection of Service Worker related errors
  if (
    message.includes('No background context found') ||
    message.includes('No background context') ||
    message.includes('Service Worker') ||
    message.includes('inactive') ||
    message.includes('not running') ||
    message.includes('context') && message.includes('not found')
  ) {
    response.appendResponseLine(`## 🔴 Service Worker Not Active\n`);
    response.appendResponseLine(`This error occurs when trying to execute code in an inactive Service Worker.\n`);
    response.appendResponseLine(`**Solution** (3 simple steps):`);
    response.appendResponseLine(`1. Verify SW status: \`list_extensions\``);
    response.appendResponseLine(`   - Look for 🔴 Inactive or 🟢 Active status`);
    response.appendResponseLine(`2. Activate SW: \`activate_extension_service_worker\` with extensionId="${extensionId}"`);
    response.appendResponseLine(`   - This wakes up the Service Worker`);
    response.appendResponseLine(`3. Retry code execution: \`evaluate_in_extension\` with same code\n`);
    response.appendResponseLine(`**Why this happens**: MV3 Service Workers are ephemeral and sleep after ~30s of inactivity.`);
  } else if (message.includes('SyntaxError') || message.includes('Unexpected token')) {
    response.appendResponseLine(`## 🐛 JavaScript Syntax Error\n`);
    response.appendResponseLine(`**Possible issues**:`);
    response.appendResponseLine(`- Check for typos in variable/function names`);
    response.appendResponseLine(`- Ensure proper quotes and brackets`);
    response.appendResponseLine(`- Verify the code is valid JavaScript`);
    response.appendResponseLine(`- Try wrapping expressions in parentheses: \`(expression)\``);
  } else {
    response.appendResponseLine(`**Possible causes**:`);
    response.appendResponseLine('- Syntax error in JavaScript code');
    response.appendResponseLine('- Extension context is not active');
    response.appendResponseLine('- Missing permissions for the API being used');
    response.appendResponseLine('- The extension doesn\'t have access to the chrome.* API you\'re calling');
    response.appendResponseLine('\n💡 **Debugging tip**: Check extension console in DevTools for more details');
  }

  response.setIncludePages(true);
}
```

**改进**:
- ✅ **多层错误分类**: SW 错误 / 语法错误 / 其他错误
- ✅ 针对 "No background context found" 的精确检测
- ✅ 针对 SyntaxError 的专门提示
- ✅ 3步解决方案,步骤间有说明
- ✅ 更详细的调试建议

---

### 4. list_extension_contexts ✅ 已完善

**SW 依赖**: 🟡 部分 - SW 未激活时不会出现在列表中

**前置描述**: ✅ 完善
```
**⚠️ MV3 Service Worker behavior**:
- Inactive SW won't appear in the list
- "No active contexts" often means SW is inactive
- SW becomes inactive after ~30 seconds of inactivity
- Use activate_extension_service_worker to wake it up
- Check SW status with list_extensions first
```

**错误处理**: ✅ 良好
```typescript
if (contexts.length === 0) {
  response.appendResponseLine('\n💡 **Tip**: For MV3 extensions, try `activate_extension_service_worker` to activate the Service Worker');
}
```

**评价**: 无需优化,已经很好

---

### 5. reload_extension ✅ 自动处理

**SW 依赖**: 🟢 自动 - 工具会自动激活 SW

**自动激活逻辑**:
```typescript
if (extension.serviceWorkerStatus === 'inactive') {
  response.appendResponseLine('🔄 Service Worker is inactive. Activating...\n');
  await context.activateServiceWorker(extensionId);
  response.appendResponseLine('✅ Service Worker activated successfully\n');
}
```

**评价**: 最佳实践,自动解决问题

---

## 优化模式总结

### 智能错误检测关键词

```typescript
// Service Worker 相关错误检测
if (
  message.includes('No background context found') ||
  message.includes('No background context') ||
  message.includes('Service Worker') ||
  message.includes('inactive') ||
  message.includes('not running') ||
  message.includes('context') ||
  message.toLowerCase().includes('sw')
) {
  // SW 相关错误处理
}
```

### 统一的错误响应结构

```
# ❌ [操作] Failed

**Extension ID**: xxx
**[其他上下文信息]**

**Error**: [原始错误]

## 🔴/🟡 [错误类型]

[错误说明]

**Solution**:
1. 步骤1: 命令/操作
   - 说明
2. 步骤2: 命令/操作  
   - 说明
3. 步骤3: 命令/操作

**Why this happens**: [原因解释]
```

### Emoji 使用规范

- 🔴 **必需依赖** - 完全阻塞的问题
- 🟡 **部分影响** - 部分功能不可用
- 🟢 **自动处理** - 工具自动解决
- ❌ **错误** - 操作失败
- ✅ **成功** - 操作成功
- 🐛 **Bug** - 代码问题
- 💡 **提示** - 有用的建议

---

## 前置描述对比

### evaluate_in_extension

**前置描述**: ✅ **完善**
```
⚠️ **Prerequisites for MV3 extensions**:
- Service Worker MUST be active before calling this tool
- If SW is inactive, this tool will fail with "No background context found"
- Use 'activate_extension_service_worker' first if you see SW status as 🔴 Inactive
- Check SW status with 'list_extensions' before proceeding
```

**特点**:
- ✅ 明确说明 "MUST be active"
- ✅ 预告失败信息 "No background context found"
- ✅ 提供解决方案 (activate_extension_service_worker)
- ✅ 提供检查方法 (list_extensions)

### inspect_extension_storage

**前置描述**: ✅ **完善**
```
**⚠️ MV3 prerequisite**:
- Service Worker MUST be active to access chrome.storage
- Check SW status with list_extensions first
- Use activate_extension_service_worker if SW is 🔴 Inactive
- Inactive SW will cause this tool to fail
```

**特点**:
- ✅ 说明 API 依赖 (chrome.storage)
- ✅ 明确失败条件
- ✅ 提供检查和激活步骤

### get_extension_logs

**前置描述**: ✅ **完善**
```
**⚠️ MV3 Service Worker logs**:
- SW logs only available when SW is active
- Inactive SW = no background logs
- Use activate_extension_service_worker to wake SW
- Content script logs available regardless of SW status
```

**特点**:
- ✅ 区分不同日志来源
- ✅ 说明部分功能可用 (content script logs)
- ✅ 提供激活建议

---

## 测试场景

### 场景 1: SW 未激活时调用 inspect_extension_storage

**用户操作**:
```
list_extensions
→ 看到 MyExtension, SW status: 🔴 Inactive

inspect_extension_storage extensionId="abcd..."
```

**优化后的错误响应**:
```
# ❌ Storage Inspection Failed

**Extension ID**: abcd...
**Storage Type**: local

**Error**: No background context found

## 🔴 Service Worker Issue Detected

For MV3 extensions, chrome.storage API requires an active Service Worker.

**Solution**:
1. Check SW status: `list_extensions` (look for 🔴 Inactive)
2. Activate SW: `activate_extension_service_worker` with extensionId="abcd..."
3. Retry: `inspect_extension_storage` with extensionId="abcd..."

**Why this happens**: MV3 Service Workers become inactive after ~30 seconds of inactivity.
```

**用户体验**:
- ✅ 立即知道是 SW 问题
- ✅ 明确3步解决方案
- ✅ 理解问题原因
- ✅ 可以直接复制命令

### 场景 2: SW 未激活时调用 evaluate_in_extension

**用户操作**:
```
evaluate_in_extension extensionId="abcd..." code="chrome.runtime.id"
```

**优化后的错误响应**:
```
# ❌ Code Evaluation Failed

**Extension ID**: abcd...

**Code**:
```javascript
chrome.runtime.id
```

**Error**: No background context found for extension abcd...

## 🔴 Service Worker Not Active

This error occurs when trying to execute code in an inactive Service Worker.

**Solution** (3 simple steps):
1. Verify SW status: `list_extensions`
   - Look for 🔴 Inactive or 🟢 Active status
2. Activate SW: `activate_extension_service_worker` with extensionId="abcd..."
   - This wakes up the Service Worker
3. Retry code execution: `evaluate_in_extension` with same code

**Why this happens**: MV3 Service Workers are ephemeral and sleep after ~30s of inactivity.
```

**用户体验**:
- ✅ 看到执行的代码
- ✅ 清楚是 SW 未激活问题
- ✅ 步骤有详细说明
- ✅ 知道为什么会发生

---

## AI 友好性提升

### 优化前
```
Error: Failed to inspect storage: No background context found
```

**AI 理解难度**: 高
- ❌ 不知道是什么问题
- ❌ 不知道如何解决
- ❌ 需要额外推理

### 优化后
```
## 🔴 Service Worker Issue Detected

For MV3 extensions, chrome.storage API requires an active Service Worker.

**Solution**:
1. Check SW status: `list_extensions` (look for 🔴 Inactive)
2. Activate SW: `activate_extension_service_worker` with extensionId="abcd..."
3. Retry: `inspect_extension_storage` with extensionId="abcd..."
```

**AI 理解难度**: 低
- ✅ 明确的问题类型 (Service Worker Issue)
- ✅ 清晰的解决步骤
- ✅ 具体的命令示例
- ✅ 可以直接执行

---

## 文件修改清单

1. **src/tools/extension/storage.ts**
   - 改进 `inspect_extension_storage` 错误处理
   - 添加智能 SW 错误检测
   - 提供详细的解决步骤

2. **src/tools/extension/logs.ts**
   - 改进 `get_extension_logs` 错误处理
   - 说明部分功能仍可用
   - 区分 SW 错误和其他错误

3. **src/tools/extension/execution.ts**
   - 大幅改进 `evaluate_in_extension` 错误处理
   - 多层错误分类 (SW / 语法 / 其他)
   - 针对性的解决建议

---

## 关键改进点

### 1. 智能错误检测
不再简单重抛错误,而是分析错误信息,智能识别 SW 相关问题。

### 2. 分层错误处理
- **SW 错误**: 明确的解决步骤
- **语法错误**: 调试建议  
- **其他错误**: 通用排查

### 3. 可操作的建议
每个错误都提供:
- 具体的命令
- 清晰的步骤
- 参数示例
- 原因解释

### 4. 一致的体验
所有工具使用相同的:
- 错误格式
- Emoji 标识
- 解决步骤结构

---

## 最佳实践

### ✅ 做到的
1. **前置说明完整** - 所有工具都有明确的 SW 依赖说明
2. **错误智能检测** - 自动识别 SW 相关错误
3. **友好错误信息** - 不直接抛底层错误
4. **可操作建议** - 提供具体命令和步骤
5. **上下文丰富** - 说明为什么会失败
6. **一致性** - 所有工具统一的错误处理风格

### 🎯 达成效果
- 用户遇到 SW 问题时,立即知道原因和解决方法
- AI 可以轻松理解错误类型并提供帮助
- 减少用户困惑和反复尝试
- 提升整体调试体验

---

## 总结

本次优化全面改进了所有依赖 Service Worker 的工具:

1. ✅ **inspect_extension_storage** - 从无错误处理到智能检测
2. ✅ **get_extension_logs** - 从简单重抛到部分可用提示
3. ✅ **evaluate_in_extension** - 从通用提示到多层分类
4. ✅ **list_extension_contexts** - 已完善,无需改动
5. ✅ **reload_extension** - 自动处理,最佳实践

所有工具现在都能:
- 智能检测 SW 相关错误
- 提供友好的错误信息
- 给出具体的解决步骤
- 解释问题发生的原因

用户体验和 AI 友好性得到显著提升! 🎉
