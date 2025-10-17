# enhance_extension_error_capture 使用示例

## 📋 实际使用场景

### 场景1：调试扩展启动错误

```bash
# 1. 重载扩展
reload_extension({
  "extensionId": "obbhgfjghnnodmekfkfffojnkbdbfpbh"
})

# 输出包含提示：
# ✅ No errors detected after reload
# 💡 Tip: For comprehensive error monitoring, use `enhance_extension_error_capture`

# 2. 增强错误捕获
enhance_extension_error_capture({
  "extensionId": "obbhgfjghnnodmekfkfffojnkbdbfpbh",
  "captureStackTraces": true
})

# 输出：
# ✅ Enhancement Complete
# Error listeners have been successfully injected.

# 3. 再次重载触发错误
reload_extension({
  "extensionId": "obbhgfjghnnodmekfkfffojnkbdbfpbh"
})

# 4. 诊断错误
diagnose_extension_errors({
  "extensionId": "obbhgfjghnnodmekfkfffojnkbdbfpbh",
  "timeRange": 5
})
```

---

### 场景2：捕获Promise拒绝

```javascript
// 扩展代码中的Promise拒绝（未处理）
async function fetchData() {
  const response = await fetch('https://api.example.com/data');
  // ❌ 如果请求失败，会抛出Promise拒绝
  return response.json();
}

// 没有try-catch，错误不会被记录
fetchData();
```

**解决方案**：

```bash
# 1. 激活Service Worker
activate_extension_service_worker({
  "extensionId": "obbhgfjghnnodmekfkfffojnkbdbfpbh"
})

# 输出包含提示：
# **Next steps**:
# - Use `enhance_extension_error_capture` to enable comprehensive error monitoring

# 2. 增强错误捕获
enhance_extension_error_capture({
  "extensionId": "obbhgfjghnnodmekfkfffojnkbdbfpbh"
})

# 3. 触发fetchData()操作
# (用户操作扩展)

# 4. 查看捕获的错误
get_extension_logs({
  "extensionId": "obbhgfjghnnodmekfkfffojnkbdbfpbh",
  "level": ["error"]
})

# 输出会包含：
# [EXTENSION_ERROR] {
#   "type": "UNHANDLED_REJECTION",
#   "reason": "Failed to fetch",
#   "timestamp": "...",
#   "stack": "..."
# }
```

---

### 场景3：诊断"无错误"但有问题的情况

```bash
# 1. 先诊断
diagnose_extension_errors({
  "extensionId": "obbhgfjghnnodmekfkfffojnkbdbfpbh",
  "timeRange": 60
})

# 输出：
# ✅ No errors detected!
# 💡 Tip: If issues persist but no errors appear:
# Use `enhance_extension_error_capture` to catch uncaught errors and Promise rejections

# 2. 按照建议增强
enhance_extension_error_capture({
  "extensionId": "obbhgfjghnnodmekfkfffojnkbdbfpbh"
})

# 3. 重现问题
# (用户重复导致问题的操作)

# 4. 再次诊断
diagnose_extension_errors({
  "extensionId": "obbhgfjghnnodmekfkfffojnkbdbfpbh",
  "timeRange": 5
})

# 现在能看到之前未捕获的错误！
```

---

## 🔄 完整工作流示例

### 开发调试流程

```bash
# ========== 准备阶段 ==========

# 1. 列出扩展
list_extensions()

# 2. 激活Service Worker（MV3扩展）
activate_extension_service_worker({
  "extensionId": "xxx"
})

# ========== 增强阶段 ==========

# 3. 增强错误捕获（一次性）
enhance_extension_error_capture({
  "extensionId": "xxx",
  "captureStackTraces": true
})

# ========== 开发循环 ==========

# 4. 修改代码
# (在IDE中修改扩展代码)

# 5. 重载扩展
reload_extension({
  "extensionId": "xxx",
  "preserveStorage": false
})

# 6. 重新增强（reload会清除监听器）
enhance_extension_error_capture({
  "extensionId": "xxx"
})

# 7. 测试功能
# (手动或自动化测试)

# 8. 检查错误
diagnose_extension_errors({
  "extensionId": "xxx",
  "timeRange": 5,
  "includeWarnings": true
})

# 9. 查看详细日志
get_extension_logs({
  "extensionId": "xxx",
  "level": ["error", "warn"],
  "limit": 50
})

# 重复步骤4-9直到完成开发
```

---

## 📊 输出示例

### enhance_extension_error_capture 成功输出

```markdown
# Enhancing Error Capture

**Extension**: My Extension (v1.0.0)
**ID**: obbhgfjghnnodmekfkfffojnkbdbfpbh

✅ **Enhancement Complete**

Error listeners have been successfully injected.
**Stack Traces**: Enabled

## What's Captured

- ❌ **Uncaught JavaScript errors** - All unhandled errors
- 🔴 **Unhandled Promise rejections** - Async errors
- 📍 **File location and line numbers** - Error source tracking
- 📚 **Stack traces** - Full error context

## Next Steps

1. Trigger extension actions that may cause errors
2. Run `diagnose_extension_errors` to analyze captured errors
3. Check `get_extension_logs` for [EXTENSION_ERROR] entries

## Lifecycle

- ✅ Active until extension reload or Service Worker restart
- ✅ Safe to call multiple times (idempotent)
- ✅ No performance impact on extension
```

### 已增强时的输出

```markdown
# Enhancing Error Capture

**Extension**: My Extension (v1.0.0)
**ID**: obbhgfjghnnodmekfkfffojnkbdbfpbh

ℹ️ **Already Enhanced**

Error capture is already active for this extension.
No additional action needed.
```

### 捕获到的错误日志

```json
[EXTENSION_ERROR] {
  "type": "UNCAUGHT_ERROR",
  "message": "Cannot read property 'value' of null",
  "filename": "chrome-extension://xxx/background.js",
  "lineno": 42,
  "colno": 15,
  "timestamp": "2025-10-17T01:23:45.678Z",
  "count": 1,
  "stack": "Error: Cannot read property 'value' of null\n    at Object.onClick (chrome-extension://xxx/background.js:42:15)"
}
```

```json
[EXTENSION_ERROR] {
  "type": "UNHANDLED_REJECTION",
  "reason": "Failed to fetch",
  "timestamp": "2025-10-17T01:24:01.234Z",
  "count": 1,
  "stack": "Error: Failed to fetch\n    at fetchData (chrome-extension://xxx/background.js:15:20)"
}
```

---

## ⚠️ 常见问题

### Q1: Service Worker is inactive

**错误信息**：
```
⚠️ Service Worker is inactive
The Service Worker must be active to inject error listeners.
**Solution**: Run `activate_extension_service_worker` first.
```

**解决方案**：
```bash
activate_extension_service_worker({"extensionId": "xxx"})
enhance_extension_error_capture({"extensionId": "xxx"})
```

---

### Q2: No Background Context Found

**错误信息**：
```
❌ No Background Context Found
The extension has no active background context.
**Solution**: Use `activate_extension_service_worker` to activate it.
```

**原因**：
- 扩展被禁用
- Service Worker未启动
- 扩展崩溃

**解决方案**：
```bash
# 1. 检查扩展状态
list_extensions()

# 2. 激活Service Worker
activate_extension_service_worker({"extensionId": "xxx"})

# 3. 重试增强
enhance_extension_error_capture({"extensionId": "xxx"})
```

---

### Q3: 增强后重载，监听器丢失

**现象**：
```bash
enhance_extension_error_capture({"extensionId": "xxx"})
reload_extension({"extensionId": "xxx"})
# 错误监听器已丢失！
```

**解决方案**：重载后重新增强
```bash
reload_extension({"extensionId": "xxx"})
enhance_extension_error_capture({"extensionId": "xxx"})
```

---

## 💡 最佳实践

### ✅ 推荐

1. **开发开始时增强一次**
   ```bash
   enhance_extension_error_capture({"extensionId": "xxx"})
   ```

2. **每次重载后重新增强**
   ```bash
   reload_extension({"extensionId": "xxx"})
   enhance_extension_error_capture({"extensionId": "xxx"})
   ```

3. **定期诊断**
   ```bash
   diagnose_extension_errors({"extensionId": "xxx"})
   ```

4. **查看原始日志**
   ```bash
   get_extension_logs({
     "extensionId": "xxx",
     "level": ["error"]
   })
   ```

### ❌ 避免

1. **不要在生产环境频繁增强**
   ```bash
   # ❌ 错误
   setInterval(() => {
     enhance_extension_error_capture(...)
   }, 60000)
   ```

2. **不要忘记Service Worker可能休眠**
   ```bash
   # MV3扩展的Service Worker会自动休眠
   # 休眠后监听器丢失
   # 需要重新增强
   ```

---

## 🔗 相关工具

| 工具 | 用途 | 何时使用 |
|------|------|----------|
| `enhance_extension_error_capture` | 注入监听器 | 开发调试、问题排查 |
| `diagnose_extension_errors` | 分析错误 | 定期检查、深度分析 |
| `get_extension_logs` | 查看日志 | 查看详细信息 |
| `reload_extension` | 重载扩展 | 代码修改后 |
| `activate_extension_service_worker` | 激活SW | 增强之前（MV3） |

---

## 📚 更多资源

- **工具对比**: `docs/EXTENSION_ERROR_TOOLS_RELATIONSHIP.md`
- **快速参考**: `docs/ERROR_TOOLS_QUICK_REFERENCE.md`
- **技术设计**: `docs/EXTENSION_ERRORS_ACCESS_DESIGN.md`
