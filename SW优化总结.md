# Service Worker 依赖优化总结

## ✅ 已完成

全面优化所有依赖 Service Worker 的扩展工具,确保友好的错误提示。

---

## 优化的工具 (3个)

### 1. inspect_extension_storage ⭐⭐⭐
**问题**: 错误处理简陋,直接重抛错误  
**优化**: 
- ✅ 智能检测 SW 相关错误(7种关键词)
- ✅ 明确的错误类型标识 `🔴 Service Worker Issue`
- ✅ 3步解决方案(check → activate → retry)
- ✅ 解释原因和区分其他错误

### 2. get_extension_logs ⭐⭐
**问题**: 简单重抛,没说明部分功能仍可用  
**优化**:
- ✅ 使用 `🟡` 表示部分影响
- ✅ 说明 content script 日志仍可用
- ✅ 4步解决方案
- ✅ 区分 SW 错误和其他错误

### 3. evaluate_in_extension ⭐⭐⭐
**问题**: 错误类型混杂,提示不够具体  
**优化**:
- ✅ **多层错误分类**: SW错误/语法错误/其他错误
- ✅ 精确检测 "No background context found"
- ✅ 针对 SyntaxError 的专门提示
- ✅ 3步解决方案,每步有说明

---

## 统一的错误处理模式

```typescript
// 1. 智能检测 SW 相关错误
if (
  message.includes('No background context') ||
  message.includes('Service Worker') ||
  message.includes('inactive') ||
  message.includes('not running') ||
  message.includes('context') ||
  message.toLowerCase().includes('sw')
) {
  // 2. 提供友好的错误信息
  response.appendResponseLine(`## 🔴 Service Worker Issue Detected\n`);
  
  // 3. 给出具体的解决步骤
  response.appendResponseLine(`**Solution**:`);
  response.appendResponseLine(`1. Check SW status: \`list_extensions\``);
  response.appendResponseLine(`2. Activate SW: \`activate_extension_service_worker\` with extensionId="${extensionId}"`);
  response.appendResponseLine(`3. Retry this tool\n`);
  
  // 4. 解释原因
  response.appendResponseLine(`**Why this happens**: MV3 Service Workers become inactive after ~30s of inactivity.`);
}
```

---

## 错误提示示例

### 优化前 ❌
```
Error: Failed to inspect storage: No background context found
```

### 优化后 ✅
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

---

## Emoji 使用规范

- 🔴 必需依赖 - 完全阻塞
- 🟡 部分影响 - 部分功能不可用
- 🟢 自动处理 - 工具自动解决
- ❌ 错误 - 操作失败
- ✅ 成功 - 操作成功
- 🐛 Bug - 代码问题
- 💡 提示 - 有用建议

---

## 关键改进

1. **智能检测** - 自动识别 SW 相关错误
2. **分层处理** - SW错误/语法错误/其他错误
3. **可操作建议** - 具体命令+步骤+参数示例
4. **原因解释** - 说明为什么会发生
5. **一致体验** - 所有工具统一格式

---

## 效果

- ✅ 用户遇到 SW 问题时立即知道原因和解决方法
- ✅ AI 可以轻松理解错误类型
- ✅ 减少用户困惑和反复尝试
- ✅ 提升整体调试体验

---

## 文件修改

1. `src/tools/extension/storage.ts` - inspect_extension_storage
2. `src/tools/extension/logs.ts` - get_extension_logs  
3. `src/tools/extension/execution.ts` - evaluate_in_extension

已编译 ✅
