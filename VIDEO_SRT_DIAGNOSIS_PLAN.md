# Video SRT Ext 错误诊断方案

**问题**：Chrome扩展管理页面显示Video SRT有错误，但MCP工具没有获取到

---

## ✅ 立即执行的步骤

### 步骤1：手动记录Chrome管理页面的错误

1. **打开Chrome扩展管理页面**
   ```
   chrome://extensions
   ```

2. **找到Video SRT Ext MVP 1.1.2**
   - 查看是否有"Errors"按钮
   - 如果有，点击查看

3. **记录以下信息**：
   ```
   错误数量：_______
   错误类型：_______ (JavaScript错误/Manifest错误/CSP错误等)
   错误消息：_______
   文件位置：_______
   行号：_______
   堆栈跟踪：_______
   发生时间：_______
   ```

---

### 步骤2：使用MCP工具重现错误

由于Chrome管理页面的错误是历史记录，我们需要重新触发它们：

#### 2.1 增强错误捕获（在IDE中执行）

```json
{
  "name": "list_extensions",
  "arguments": {}
}
```
（找到Video SRT的扩展ID，假设是`abcd...`）

```json
{
  "name": "activate_extension_service_worker",
  "arguments": {
    "extensionId": "abcd..."
  }
}
```

```json
{
  "name": "enhance_extension_error_capture",
  "arguments": {
    "extensionId": "abcd...",
    "captureStackTraces": true
  }
}
```

#### 2.2 重载扩展

```json
{
  "name": "reload_extension",
  "arguments": {
    "extensionId": "abcd...",
    "captureErrors": true
  }
}
```

**重要**：重载会重新执行启动代码，触发相同的错误

#### 2.3 立即诊断

```json
{
  "name": "diagnose_extension_errors",
  "arguments": {
    "extensionId": "abcd...",
    "timeRange": 1,
    "includeWarnings": true
  }
}
```

#### 2.4 查看详细日志

```json
{
  "name": "get_extension_logs",
  "arguments": {
    "extensionId": "abcd...",
    "level": ["error", "warn"],
    "limit": 50
  }
}
```

---

### 步骤3：检查Manifest配置

```json
{
  "name": "inspect_extension_manifest",
  "arguments": {
    "extensionId": "abcd...",
    "checkBestPractices": true,
    "checkMV3Compatibility": true,
    "checkPermissions": true
  }
}
```

**这能发现**：
- Manifest版本问题
- 权限配置问题
- MV2弃用警告
- 最佳实践违反

---

## 🔍 错误类型分析

### 如果Chrome管理页面显示的是...

#### A. Manifest警告/错误

**示例**：
```
Manifest version 2 is deprecated
```

**MCP工具行为**：
- ❌ 不会出现在 `diagnose_extension_errors`
- ❌ 不会出现在 `get_extension_logs`

**解决**：
- 使用 `inspect_extension_manifest` 检查
- 手动查看manifest.json
- 考虑迁移到MV3

---

#### B. 运行时JavaScript错误

**示例**：
```
Uncaught TypeError: Cannot read property 'xxx' of null
at background.js:42
```

**MCP工具行为**：
- ✅ 重载后会出现在 `diagnose_extension_errors`
- ✅ 会出现在 `get_extension_logs`

**步骤**：
1. 执行上述步骤2（增强+重载）
2. 应该能捕获到

---

#### C. Promise拒绝

**示例**：
```
Unhandled Promise Rejection: Failed to fetch
```

**MCP工具行为**：
- ⚠️ 需要 `enhance_extension_error_capture`
- ✅ 增强后重载会捕获

**特征**：
- 标记为 `[EXTENSION_ERROR]`
- type: `UNHANDLED_REJECTION`

---

#### D. CSP (内容安全策略) 错误

**示例**：
```
Refused to execute inline script because it violates CSP
```

**MCP工具行为**：
- ⚠️ 可能出现在console
- ⚠️ 可能不会被捕获

**建议**：
- 手动记录错误信息
- 检查manifest.json中的CSP配置

---

## 📊 对比表

| 步骤 | Chrome管理页面 | MCP工具 |
|------|---------------|---------|
| **查看历史错误** | ✅ 立即可见 | ❌ 无法访问 |
| **查看Manifest错误** | ✅ 完整显示 | ⚠️ 部分(inspect_manifest) |
| **实时监控** | ❌ 手动刷新 | ✅ 自动诊断 |
| **错误分析** | ❌ 仅显示原始错误 | ✅ 分类+统计+建议 |
| **自动化** | ❌ 手动操作 | ✅ 脚本化 |

---

## 💡 推荐工作流

```
1. Chrome管理页面
   ↓ 发现有错误
   ↓ 记录错误信息
   
2. MCP: enhance_extension_error_capture
   ↓ 注入监听器
   
3. MCP: reload_extension  
   ↓ 重现错误
   
4. MCP: diagnose_extension_errors
   ↓ 获取详细分析
   
5. 对比两边的错误
   ↓ 确认是否一致
   
6. 修复代码
```

---

## 🚨 如果重载后仍然看不到错误

可能的原因：

### 1. 错误是Manifest相关
- 不会输出到console
- 需要手动查看Chrome管理页面

### 2. 错误需要特定触发
- 不是启动时发生
- 需要执行特定操作

**解决**：
```json
// 1. 增强后保持监控
enhance_extension_error_capture({"extensionId":"xxx"})

// 2. 手动触发扩展功能
// (使用扩展的各种功能)

// 3. 再次诊断
diagnose_extension_errors({"extensionId":"xxx","timeRange":5})
```

### 3. 错误发生在content script

**检查**：
```json
{
  "name": "check_content_script_injection",
  "arguments": {
    "extensionId": "xxx",
    "testUrl": "https://www.youtube.com"
  }
}
```

---

## 📝 诊断报告模板

```markdown
# Video SRT Ext 错误诊断报告

## Chrome管理页面显示的错误
- 错误1: _______________
- 错误2: _______________

## MCP工具捕获的错误
- 错误1: _______________
- 错误2: _______________

## 对比结果
- ✅ 一致的错误: _______________
- ❌ 未捕获的错误: _______________
- ℹ️ 额外发现的错误: _______________

## 建议修复方案
1. _______________
2. _______________
```

---

## ⚡ 快速命令序列

```bash
# 复制以下JSON到IDE MCP客户端，逐个执行

# 1. 查找扩展
{"name":"list_extensions","arguments":{}}

# 2. 激活SW (替换extensionId)
{"name":"activate_extension_service_worker","arguments":{"extensionId":"xxx"}}

# 3. 增强捕获
{"name":"enhance_extension_error_capture","arguments":{"extensionId":"xxx","captureStackTraces":true}}

# 4. 重载扩展
{"name":"reload_extension","arguments":{"extensionId":"xxx","captureErrors":true}}

# 5. 诊断
{"name":"diagnose_extension_errors","arguments":{"extensionId":"xxx","timeRange":1,"includeWarnings":true}}

# 6. 查看日志
{"name":"get_extension_logs","arguments":{"extensionId":"xxx","level":["error","warn"]}}

# 7. 检查manifest
{"name":"inspect_extension_manifest","arguments":{"extensionId":"xxx","checkBestPractices":true}}
```

---

**下一步**：请先手动查看Chrome管理页面的错误，然后执行上述MCP命令，对比结果。
