# 🚨 快速修复指南：Service Worker 激活

## 问题现状

你遇到的问题：
- ✅ `list_extensions` - 成功
- ✅ `get_extension_details` - 成功  
- ✅ `list_extension_contexts` - 成功
- ❌ `inspect_extension_storage` - **失败：无法访问 chrome.storage API**
- ❌ `evaluate_in_extension` - **失败：chrome.storage 不可用**

## 根本原因

**MV3 Service Worker 处于 Inactive（休眠）状态**

在此状态下：
- ✅ 可以执行基本 JS 代码（如 `1+1`、`typeof self`）
- ❌ **不能访问任何 `chrome.*` API**（如 `chrome.storage`、`chrome.tabs` 等）

## 🎯 立即解决（3 步）

### Step 1: 激活 Service Worker

**打开 Chrome 浏览器，执行以下操作：**

1. 在地址栏输入：`chrome://extensions/`
2. 找到 "Enhanced MCP Debug Test Extension"
3. 在扩展卡片上，找到并点击 **"Service worker"** 蓝色链接
   - 位置：扩展卡片中间区域，"Inspect views" 标签下
4. 会自动打开 Chrome DevTools，Service Worker 激活

**激活成功的标志：**
- Service Worker 链接旁边会有绿色圆点 🟢
- DevTools 控制台会显示 Service Worker 信息

---

### Step 2: 验证激活

在 MCP 中执行：

```javascript
evaluate_in_extension 
  extensionId=bekcbmopkiajilfliobihjgnghfcbido 
  code="typeof chrome !== 'undefined' && typeof chrome.storage !== 'undefined'"
```

**期望结果：**
- ✅ 返回 `true` - Service Worker 已激活
- ❌ 返回 `false` - 仍未激活，重复 Step 1

---

### Step 3: 测试功能

#### 写入测试数据
```javascript
evaluate_in_extension 
  extensionId=bekcbmopkiajilfliobihjgnghfcbido 
  code="await chrome.storage.local.set({test: 'Hello from MCP', timestamp: Date.now()})"
```

#### 读取 Storage
```javascript
inspect_extension_storage 
  extensionId=bekcbmopkiajilfliobihjgnghfcbido 
  storageType=local
```

**期望结果：**
```json
{
  "test": "Hello from MCP",
  "timestamp": 1234567890
}
```

---

## 📊 完整测试清单

激活 Service Worker 后，按顺序测试：

### ✅ 测试 1：基本代码执行
```javascript
evaluate_in_extension 
  extensionId=bekcbmopkiajilfliobihjgnghfcbido 
  code="1 + 1"
```
期望：`2`

---

### ✅ 测试 2：对象返回
```javascript
evaluate_in_extension 
  extensionId=bekcbmopkiajilfliobihjgnghfcbido 
  code="{name: 'test', value: 123}"
```
期望：`{"name": "test", "value": 123}`

---

### ✅ 测试 3：异步代码
```javascript
evaluate_in_extension 
  extensionId=bekcbmopkiajilfliobihjgnghfcbido 
  code="await Promise.resolve('async works')"
```
期望：`"async works"`

---

### ✅ 测试 4：chrome.tabs API
```javascript
evaluate_in_extension 
  extensionId=bekcbmopkiajilfliobihjgnghfcbido 
  code="await chrome.tabs.query({active: true, currentWindow: true})"
```
期望：返回当前活动标签页数组

---

### ✅ 测试 5：写入 Storage
```javascript
evaluate_in_extension 
  extensionId=bekcbmopkiajilfliobihjgnghfcbido 
  code="await chrome.storage.local.set({user: 'admin', config: {theme: 'dark'}})"
```
期望：成功（返回 `undefined` 或空对象）

---

### ✅ 测试 6：读取 Storage（工具）
```javascript
inspect_extension_storage 
  extensionId=bekcbmopkiajilfliobihjgnghfcbido 
  storageType=local
```
期望：显示所有存储的数据

---

### ✅ 测试 7：读取 Storage（代码）
```javascript
evaluate_in_extension 
  extensionId=bekcbmopkiajilfliobihjgnghfcbido 
  code="await chrome.storage.local.get(null)"
```
期望：返回完整的 Storage 对象

---

## ⚠️ 常见问题

### Q1: 点击 "Service worker" 后没有反应？

**A:** Service Worker 可能已经激活但没有显示。尝试：
- 刷新 `chrome://extensions/` 页面
- 或访问 `chrome-extension://bekcbmopkiajilfliobihjgnghfcbido/popup.html`

---

### Q2: 激活后一段时间又失败了？

**A:** Service Worker 会自动休眠（约 30 秒无活动）。重新执行 Step 1 激活即可。

---

### Q3: 所有测试都失败？

**A:** 检查：
1. Chrome 是否以调试模式启动（`--remote-debugging-port=9222`）
2. 扩展是否已加载（`chrome://extensions/` 可见）
3. MCP 服务器是否已重启（使用最新代码）

---

## 🎬 视觉化步骤

```
1. 打开 chrome://extensions/
   ↓
2. 找到扩展卡片
   ┌────────────────────────────────────────┐
   │ Enhanced MCP Debug Test Extension      │
   │ Version 2.1.0                          │
   │ ID: bekcbmopkiajilfliobihjgnghfcbido   │
   │                                        │
   │ Inspect views:                         │
   │   [Service worker] ← 点击这里           │ 
   └────────────────────────────────────────┘
   ↓
3. DevTools 打开 + Service Worker 激活 ✅
   ↓
4. 执行 MCP 测试
```

---

## 📞 需要帮助？

如果按照上述步骤仍然失败，请提供：

1. **Service Worker 状态截图**（`chrome://extensions/` 页面）
2. **DevTools Console 输出**
3. **MCP 工具的具体错误信息**
4. **Chrome 启动参数**（确认包含 `--remote-debugging-port`）

---

## 🚀 自动化脚本

如果想自动验证，运行：

```bash
node test-extension-debug.js
```

这会自动测试所有功能并告诉你哪些通过、哪些失败。

---

## ✅ 成功标志

当 Service Worker 激活成功后，你应该看到：

```
evaluate_in_extension ... code="typeof chrome.storage"
→ Result: "object" ✅

inspect_extension_storage ...
→ Storage Data: { ... } ✅

evaluate_in_extension ... code="await chrome.storage.local.get(null)"
→ Result: { test: "Hello from MCP", ... } ✅
```

---

**关键点：所有 `chrome.*` API 调用都需要 Service Worker 处于激活状态！**
