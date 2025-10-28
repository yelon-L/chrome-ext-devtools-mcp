# Video SRT Ext 扩展错误诊断指南

**扩展**: Video SRT Ext MVP  
**版本**: 1.1.2  
**问题**: 扩展有异常信息，但没有被读取到

---

## 🎯 诊断步骤

### 步骤1：查找扩展ID

在你的IDE MCP客户端中执行：

```json
{
  "name": "list_extensions",
  "arguments": {}
}
```

**在输出中查找**：

- 扩展名包含 "Video SRT" 或 "MVP"
- 记录32位小写字母的扩展ID（例如：`obbhgfjghnnodmekfkfffojnkbdbfpbh`）

---

### 步骤2：诊断扩展错误

使用刚才找到的扩展ID：

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

**查看输出**：

- 是否显示"No errors detected"？
- 如果有错误，查看错误分类和频率

---

### 步骤3：如果没有发现错误

这可能意味着错误没有被记录到console。需要增强错误捕获：

#### 3.1 激活Service Worker（MV3扩展）

```json
{
  "name": "activate_extension_service_worker",
  "arguments": {
    "extensionId": "你的扩展ID"
  }
}
```

#### 3.2 增强错误捕获

```json
{
  "name": "enhance_extension_error_capture",
  "arguments": {
    "extensionId": "你的扩展ID",
    "captureStackTraces": true
  }
}
```

**这个工具会做什么**：

- ✅ 注入全局错误监听器
- ✅ 捕获未处理的JavaScript错误
- ✅ 捕获未处理的Promise拒绝
- ✅ 记录完整堆栈跟踪

---

### 步骤4：触发错误

1. 使用扩展的功能（重现导致错误的操作）
2. 等待几秒钟

---

### 步骤5：再次诊断

```json
{
  "name": "diagnose_extension_errors",
  "arguments": {
    "extensionId": "你的扩展ID",
    "timeRange": 5
  }
}
```

**现在应该能看到**：

- [EXTENSION_ERROR] 标记的错误
- 完整的堆栈跟踪
- 错误类型（UNCAUGHT_ERROR 或 UNHANDLED_REJECTION）

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

## 🔍 常见问题排查

### 问题1：Service Worker is inactive

**症状**：

```
⚠️ Service Worker is inactive
```

**解决方案**：

```json
{
  "name": "activate_extension_service_worker",
  "arguments": {"extensionId": "你的扩展ID"}
}
```

---

### 问题2：No Background Context Found

**症状**：

```
❌ No Background Context Found
```

**原因**：

- 扩展被禁用
- 扩展崩溃了
- Service Worker未启动

**解决方案**：

1. 检查扩展是否启用：

   ```json
   {
     "name": "get_extension_details",
     "arguments": {"extensionId": "你的扩展ID"}
   }
   ```

2. 如果禁用，在Chrome中启用它

3. 激活Service Worker：
   ```json
   {
     "name": "activate_extension_service_worker",
     "arguments": {"extensionId": "你的扩展ID"}
   }
   ```

---

### 问题3：错误是Promise拒绝

**症状**：

```json
{
  "type": "UNHANDLED_REJECTION",
  "reason": "..."
}
```

**这是什么**：

- 异步操作失败但没有被catch
- 常见于fetch()、async函数等

**示例代码问题**：

```javascript
// ❌ 错误：没有catch
async function loadData() {
  const response = await fetch('https://api.example.com/data');
  return response.json();
}
loadData(); // 如果失败，Promise拒绝不会被处理

// ✅ 正确：添加catch
loadData().catch(err => console.error('Load failed:', err));
```

---

### 问题4：错误是UNCAUGHT_ERROR

**症状**：

```json
{
  "type": "UNCAUGHT_ERROR",
  "message": "Cannot read property 'xxx' of null"
}
```

**这是什么**：

- 同步代码中的JavaScript运行时错误
- 没有被try-catch捕获

**修复建议**：

- 检查错误的文件名和行号
- 添加空值检查
- 使用可选链操作符（?.）

---

## 📊 诊断输出示例

### 正常情况（无错误）

```markdown
# Extension Health Diagnosis

**Extension**: Video SRT Ext MVP (v1.1.2)
**ID**: xxx
**Status**: ✅ Enabled

## Error Summary (Last 60 minutes)

✅ **No errors detected!**

The extension appears to be running correctly.

💡 **Tip**: If issues persist but no errors appear:
Use `enhance_extension_error_capture` to catch uncaught errors and Promise rejections
```

### 发现错误后

```markdown
# Extension Health Diagnosis

**Extension**: Video SRT Ext MVP (v1.1.2)
**ID**: xxx
**Status**: ✅ Enabled

## Error Summary (Last 5 minutes)

**Total Issues Found**: 3

### Error Breakdown

- 🐛 **JavaScript Errors**: 2 occurrences
- 🔴 **Other Errors**: 1 occurrence

## Most Frequent Errors

### 1. Error (2 times)

**Message**: [EXTENSION_ERROR] {"type":"UNCAUGHT_ERROR","message":"Cannot read property 'querySelector' of null",...}
**Source**: background

### 2. Error (1 time)

**Message**: [EXTENSION_ERROR] {"type":"UNHANDLED_REJECTION","reason":"Failed to fetch",...}
**Source**: background
```

---

## 🛠️ 完整诊断脚本

如果你更喜欢使用脚本，可以创建以下文件：

```bash
#!/bin/bash
# diagnose_video_srt.sh

EXTENSION_ID="你的扩展ID"

echo "1. 激活Service Worker..."
# 在IDE中执行: activate_extension_service_worker

echo "2. 增强错误捕获..."
# 在IDE中执行: enhance_extension_error_capture

echo "3. 请重现错误操作..."
read -p "按Enter继续..."

echo "4. 诊断错误..."
# 在IDE中执行: diagnose_extension_errors

echo "5. 查看详细日志..."
# 在IDE中执行: get_extension_logs
```

---

## 💡 关键点

1. **"没有读取到错误"通常意味着**：
   - 错误没有被console.error()记录
   - 错误是未处理的Promise拒绝
   - 错误是未捕获的JavaScript异常

2. **解决方案**：
   - 使用 `enhance_extension_error_capture` 注入监听器
   - 这会捕获所有未处理的错误
   - 然后用 `diagnose_extension_errors` 分析

3. **MV3扩展特别注意**：
   - Service Worker可能休眠
   - 需要先激活：`activate_extension_service_worker`
   - 重载后需要重新增强

---

## 📞 需要帮助？

如果按照上述步骤仍然无法发现错误，请提供：

1. `list_extensions` 的输出（Video SRT部分）
2. `get_extension_details` 的输出
3. `list_extension_contexts` 的输出
4. 重现问题的具体步骤

---

**快速命令序列**：

```
1. list_extensions()
2. activate_extension_service_worker({"extensionId":"xxx"})
3. enhance_extension_error_capture({"extensionId":"xxx"})
4. (触发错误)
5. diagnose_extension_errors({"extensionId":"xxx","timeRange":5})
6. get_extension_logs({"extensionId":"xxx","level":["error"]})
```
