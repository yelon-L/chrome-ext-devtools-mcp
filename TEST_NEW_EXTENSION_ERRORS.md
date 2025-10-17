# 测试新扩展的错误获取

**场景**: Chrome中新添加了扩展，管理页面显示有Errors，测试MCP工具能否获取到这些错误。

---

## 🎯 测试目标

验证以下能力：
1. ✅ 能否通过 `diagnose_extension_errors` 直接看到错误
2. ✅ 如果看不到，使用 `enhance_extension_error_capture` 后能否捕获
3. ✅ 对比Chrome管理页面的错误和MCP工具的错误

---

## 📋 在IDE MCP客户端中执行

### 步骤1：查找新扩展

```json
{
  "name": "list_extensions",
  "arguments": {}
}
```

**从输出中找到**：
- 最近添加的扩展
- 记录其扩展ID（32位小写字母）

---

### 步骤2：先尝试直接诊断

```json
{
  "name": "diagnose_extension_errors",
  "arguments": {
    "extensionId": "你的扩展ID",
    "timeRange": 60,
    "includeWarnings": true
  }
}
```

**观察输出**：
- ✅ 如果显示错误 → 成功！（记录错误信息）
- ❌ 如果"No errors detected" → 进入步骤3

---

### 步骤3：增强错误捕获（如果步骤2没有发现错误）

#### 3.1 激活Service Worker（MV3扩展）

```json
{
  "name": "activate_extension_service_worker",
  "arguments": {
    "extensionId": "你的扩展ID"
  }
}
```

#### 3.2 注入错误监听器

```json
{
  "name": "enhance_extension_error_capture",
  "arguments": {
    "extensionId": "你的扩展ID",
    "captureStackTraces": true
  }
}
```

**预期输出**：
```markdown
✅ **Enhancement Complete**

Error listeners have been successfully injected.
**Stack Traces**: Enabled

## What's Captured
- ❌ **Uncaught JavaScript errors**
- 🔴 **Unhandled Promise rejections**
...
```

---

### 步骤4：重载扩展（重现错误）

```json
{
  "name": "reload_extension",
  "arguments": {
    "extensionId": "你的扩展ID",
    "captureErrors": true
  }
}
```

**原理**：
- 重载会重新执行启动代码
- 如果Chrome管理页面的错误是启动时发生的
- 重载会重新触发相同的错误
- 这次会被我们注入的监听器捕获

---

### 步骤5：再次诊断

```json
{
  "name": "diagnose_extension_errors",
  "arguments": {
    "extensionId": "你的扩展ID",
    "timeRange": 1,
    "includeWarnings": true
  }
}
```

**查找标记**：
- `[EXTENSION_ERROR]` - 这是我们注入的监听器捕获的
- `UNCAUGHT_ERROR` - 未捕获的JavaScript错误
- `UNHANDLED_REJECTION` - 未处理的Promise拒绝

---

### 步骤6：查看详细日志

```json
{
  "name": "get_extension_logs",
  "arguments": {
    "extensionId": "你的扩展ID",
    "level": ["error", "warn"],
    "limit": 50
  }
}
```

---

## 🔍 对比分析

### Chrome管理页面的Errors

1. 打开 `chrome://extensions`
2. 找到你的扩展
3. 点击 "Errors" 按钮
4. 记录所有错误信息：
   - 错误类型
   - 错误消息
   - 文件位置
   - 行号
   - 堆栈跟踪

### MCP工具捕获的错误

从步骤5和6的输出中记录：
- 错误数量
- 错误类型
- 错误消息
- 来源（background/content_script）

---

## 📊 可能的测试结果

### 结果A：两者完全一致 ✅

Chrome管理页面显示：
```
Uncaught TypeError: Cannot read property 'value' of null
at background.js:42:15
```

MCP工具捕获：
```json
{
  "type": "UNCAUGHT_ERROR",
  "message": "Cannot read property 'value' of null",
  "filename": "chrome-extension://xxx/background.js",
  "lineno": 42,
  ...
}
```

**结论**：✅ **MCP工具成功捕获了运行时错误！**

---

### 结果B：MCP工具看不到 ❌

Chrome管理页面显示：
```
Manifest version 2 is deprecated
```

MCP工具：
```
No errors detected
```

**原因**：这是Manifest警告，不会输出到console

**解决方案**：
```json
{
  "name": "inspect_extension_manifest",
  "arguments": {
    "extensionId": "你的扩展ID",
    "checkMV3Compatibility": true
  }
}
```

---

### 结果C：部分可见 ⚠️

Chrome管理页面显示3个错误，MCP工具只捕获了2个。

**可能原因**：
1. **Content Script错误**：发生在网页中，不在background
2. **特定触发条件**：需要特定操作才会发生
3. **CSP错误**：可能不会被console捕获

**解决方案**：
- 检查content script注入
- 手动触发扩展功能
- 查看特定网页的console

---

## 🎓 学习要点

### 关键技术限制

| 错误类型 | Chrome管理页面 | MCP工具 | 原因 |
|---------|---------------|---------|------|
| **运行时错误** | ✅ | ✅ (需enhance) | Console可捕获 |
| **Promise拒绝** | ✅ | ✅ (需enhance) | 监听器可捕获 |
| **Manifest错误** | ✅ | ❌ | 不在console |
| **CSP错误** | ✅ | ⚠️ 部分 | 取决于实现 |
| **历史错误** | ✅ | ❌ | CDP无法访问 |

### 数据源差异

```
Chrome管理页面:
└─ chrome.developerPrivate.getExtensionErrors()
   └─ 私有API，持久化存储

MCP工具:
└─ CDP Protocol + Console监听
   └─ 公开协议，临时存储
```

---

## 📝 测试报告模板

```markdown
# 扩展错误获取测试报告

**扩展名称**: _______________
**扩展ID**: _______________
**Manifest版本**: MV2 / MV3

## Chrome管理页面显示的错误

### 错误1
- 类型: _______________
- 消息: _______________
- 位置: _______________

### 错误2
...

## MCP工具测试结果

### 步骤2（直接诊断）
- [ ] 发现错误
- [ ] 未发现错误

### 步骤3-5（增强后重载）
- [ ] 发现错误
- [ ] 仍未发现错误

### 捕获的错误详情
...

## 对比分析

- ✅ 成功捕获: _______________
- ❌ 未能捕获: _______________
- ℹ️ 原因分析: _______________

## 结论

MCP工具能够捕获的错误类型：
- [ ] JavaScript运行时错误
- [ ] Promise拒绝
- [ ] 其他: _______________

无法捕获的错误类型：
- [ ] Manifest错误
- [ ] CSP错误
- [ ] 其他: _______________
```

---

## 🚀 开始测试

1. 打开你的IDE MCP客户端
2. 按照上述步骤执行
3. 记录每一步的输出
4. 对比Chrome管理页面的Errors
5. 填写测试报告

**准备好了吗？开始第一步：`list_extensions()`**
