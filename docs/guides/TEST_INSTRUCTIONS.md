# 扩展工具测试说明

## 📊 测试状态

✅ **服务器连接成功** - 已成功连接到 192.168.0.201:9222  
⚠️ **缺少测试扩展** - 远程 Chrome 上未检测到扩展

---

## 🎯 完整测试步骤

### 方案 A：在远程 Chrome 中加载扩展（推荐）

1. **在 192.168.0.201 的 Chrome 中加载扩展**:

   ```
   1. 打开 chrome://extensions
   2. 开启"开发者模式"（右上角）
   3. 点击"加载已解压的扩展程序"
   4. 选择任意扩展目录
   ```

2. **重新运行测试**:

   ```bash
   node test-all-extension-tools.mjs
   ```

3. **查看完整测试结果**:
   - 测试所有 12 个扩展调试工具
   - 重点验证 Phase 1 新增的 4 个功能
   - 实时输出测试进度和结果

---

### 方案 B：使用本地 Chrome（快速测试）

如果远程 Chrome 不方便加载扩展，可以用本地 Chrome：

1. **启动本地 Chrome（调试模式）**:

   ```bash
   google-chrome \
     --remote-debugging-port=9222 \
     --user-data-dir=/tmp/chrome-test-profile \
     --no-first-run \
     --no-default-browser-check &
   ```

2. **加载测试扩展**:
   - 打开 chrome://extensions
   - 加载任意扩展

3. **修改测试脚本连接本地**:

   ```javascript
   // test-all-extension-tools.mjs 第 8 行
   const BROWSER_URL = 'http://localhost:9222'; // 改为本地
   ```

4. **运行测试**:
   ```bash
   node test-all-extension-tools.mjs
   ```

---

## 🧪 测试覆盖

测试脚本将自动测试以下工具：

### ⭐ Phase 1 新增工具（4 个）

1. **diagnose_extension_errors** ⭐⭐⭐⭐⭐
   - 错误诊断和健康检查
   - 测试参数：timeRange=10, includeWarnings=true

2. **inspect_extension_manifest** ⭐⭐⭐⭐
   - Manifest 深度分析
   - 测试参数：checkMV3Compatibility, checkPermissions, checkBestPractices

3. **check_content_script_injection** ⭐⭐⭐⭐
   - Content Script 检查
   - 测试参数：testUrl='https://github.com/example/repo'

4. **reload_extension（增强版）** ⭐⭐⭐⭐⭐
   - 智能热重载
   - 测试参数：preserveStorage=true, waitForReady=true, captureErrors=true

### 📦 基础工具（7 个）

5. list_extensions
6. get_extension_details
7. list_extension_contexts
8. inspect_extension_storage
9. get_extension_logs
10. evaluate_in_extension
11. activate_service_worker

---

## 📈 预期测试结果

```
═══════════════════════════════════════════════════════════════════
📊 测试总结
═══════════════════════════════════════════════════════════════════

测试统计:
  总测试数: 11
  成功: 11 ✅
  失败: 0 ✅
  成功率: 100.0%

新增工具测试（Phase 1）:
  ✅ diagnose_extension_errors - 错误诊断器
  ✅ inspect_extension_manifest - Manifest 检查器
  ✅ check_content_script_injection - Content Script 检查
  ✅ reload_extension - 智能热重载（增强版）

基础工具测试:
  ✅ list_extensions
  ✅ get_extension_details
  ✅ list_extension_contexts
  ✅ inspect_extension_storage
  ✅ get_extension_logs
  ✅ evaluate_in_extension
  ✅ activate_service_worker

═══════════════════════════════════════════════════════════════════
🎉 所有测试通过！Phase 1 功能工作完美！
═══════════════════════════════════════════════════════════════════
```

---

## 🔍 测试细节说明

### diagnose_extension_errors 测试

**输出示例**:

```markdown
# Extension Health Diagnosis

**Extension**: My Extension (v1.0.0)
**Status**: ✅ Enabled

## Error Summary (Last 10 minutes)

**Total Issues Found**: 5

### Error Breakdown

- 🐛 **JavaScript Errors**: 3 occurrences
- 🔌 **Chrome API Errors**: 2 occurrences

## Health Score: 🟢 85/100

**Excellent!** Extension is running smoothly with minimal issues.
```

### inspect_extension_manifest 测试

**输出示例**:

```markdown
# Manifest Inspection Report

**Manifest Version**: 3

## 🔒 Permission Analysis

**Declared Permissions** (3):

- 🟢 `storage` - Low risk
- 🟡 `tabs` - Medium risk
- 🟢 `activeTab` - Low risk

## 📊 Overall Assessment

**Manifest Quality Score**: 🟢 90/100
**Excellent!** Manifest is well-configured.
```

### check_content_script_injection 测试

**输出示例**:

```markdown
# Content Script Injection Check

**Test URL**: https://github.com/example/repo

## Content Script Rules (1)

### ✅ Rule 1

**Match Patterns** (1):

- ✅ `*://github.com/*`

**Files** (1): content.js
**Run At**: document*idle
**Result**: Matched pattern: *://github.com/\_
```

### reload_extension 测试

**输出示例**:

```markdown
# Smart Extension Reload

## Step 1: Pre-Reload State

**Service Worker**: active

## Step 2: Preserving Storage

✅ Saved 10 storage keys

## Step 3: Reloading Extension

🔄 Reload command sent...

## Step 4: Verifying Reload

✅ Background context is active

## Step 5: Restoring Storage

✅ Storage data restored

## Step 6: Error Check

✅ No errors detected after reload

## ✅ Reload Complete
```

---

## 💡 故障排除

### 问题 1: 连接超时

```
Error: Request timeout
```

**解决方案**:

- 确认 Chrome 的调试端口正确（9222）
- 检查防火墙设置
- 确认 Chrome 启动时使用了 `--remote-debugging-port=9222`

### 问题 2: 未检测到扩展

```
⚠️  无法找到有效的扩展 ID
```

**解决方案**:

- 在 Chrome 中加载至少一个扩展
- 确认扩展已启用
- 刷新 chrome://extensions 页面

### 问题 3: Service Worker 不活跃

```
Service Worker: inactive
```

**解决方案**:

- 工具会自动激活 Service Worker
- 或手动在 chrome://extensions 中点击扩展的"检查视图: Service Worker"

---

## 📝 测试日志

测试过程中的所有输出会实时显示，包括：

- ✅ 成功的测试
- ❌ 失败的测试（附错误信息）
- 📊 工具输出内容（前 50 行）
- 💡 测试建议和提示

---

## 🚀 下一步

测试完成后：

1. ✅ 验证所有 Phase 1 功能
2. 📝 记录测试结果
3. 🐛 报告发现的问题（如有）
4. 🎉 确认可以发布 v0.9.0

---

**创建日期**: 2025-10-13  
**测试脚本**: test-all-extension-tools.mjs  
**远程 Chrome**: 192.168.0.201:9222
