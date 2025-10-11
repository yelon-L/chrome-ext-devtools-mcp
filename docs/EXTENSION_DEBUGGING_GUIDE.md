# Chrome 扩展调试工具指南

## 📋 概述

本 MCP 服务器提供了 **8 个专业的 Chrome 扩展调试工具**，支持 MV3 Service Worker 和 MV2 Background Page。

## 🛠️ 工具列表

### 1. 扩展发现与信息

#### `list_extensions`
列出所有已安装的 Chrome 扩展。

**参数：**
- `includeDisabled` (boolean, 可选): 是否包含已禁用的扩展

**示例：**
```
list_extensions
list_extensions includeDisabled=true
```

**输出：**
- 扩展 ID
- 名称和版本
- Manifest 版本 (MV2/MV3)
- 启用状态
- 权限列表

---

#### `get_extension_details`
获取指定扩展的详细信息。

**参数：**
- `extensionId` (string, 必需): 32 位小写字母的扩展 ID

**示例：**
```
get_extension_details extensionId=bekcbmopkiajilfliobihjgnghfcbido
```

**输出：**
- 完整 manifest 信息
- 权限和 host_permissions
- Background 脚本 URL
- Description 描述

---

### 2. 上下文管理

#### `list_extension_contexts`
列出扩展的所有运行上下文。

**参数：**
- `extensionId` (string, 必需): 扩展 ID

**示例：**
```
list_extension_contexts extensionId=bekcbmopkiajilfliobihjgnghfcbido
```

**输出：**
- Background context (Service Worker/Background Page)
- Popup 窗口
- Options 页面
- DevTools 页面
- 每个上下文的 Target ID

---

#### `switch_extension_context`
切换到指定的扩展上下文。

**参数：**
- `contextId` (string, 必需): Target ID (从 list_extension_contexts 获取)

**示例：**
```
switch_extension_context contextId=C215D7E3D28898B5BB37D3B2CBE47DA4
```

**注意：** Service Worker 没有 Page 对象，应使用 `evaluate_in_extension` 工具。

---

### 3. Storage 调试

#### `inspect_extension_storage`
检查扩展的 Storage 数据。

**参数：**
- `extensionId` (string, 必需): 扩展 ID
- `storageType` (string, 可选): local/sync/session/managed，默认 local

**示例：**
```
inspect_extension_storage extensionId=bekcbmopkiajilfliobihjgnghfcbido storageType=local
```

**输出：**
- Storage 配额和使用量
- 所有存储的键值对 (JSON 格式)

---

### 4. 代码执行

#### `evaluate_in_extension`
在扩展的 background 上下文中执行 JavaScript 代码。

**参数：**
- `extensionId` (string, 必需): 扩展 ID
- `code` (string, 必需): 要执行的 JavaScript 代码
- `awaitPromise` (boolean, 可选): 是否等待 Promise，默认 true

**示例：**
```javascript
// 简单计算
evaluate_in_extension extensionId=xxx code="1 + 1"

// 访问扩展 API (注意：MV3 Service Worker 中部分 API 可能需要激活)
evaluate_in_extension extensionId=xxx code="typeof self"

// 异步代码
evaluate_in_extension extensionId=xxx code="return await fetch('https://api.example.com').then(r => r.json())"
```

**输出：**
- 执行结果 (JSON 格式)
- 如果有错误，显示错误信息

---

### 5. 扩展管理

#### `reload_extension`
重新加载扩展（用于开发时快速重载）。

**参数：**
- `extensionId` (string, 必需): 扩展 ID

**示例：**
```
reload_extension extensionId=bekcbmopkiajilfliobihjgnghfcbido
```

**注意：** 实际重载需要执行 `chrome.runtime.reload()`，可以使用 `evaluate_in_extension` 工具：
```
evaluate_in_extension extensionId=xxx code="chrome.runtime.reload()"
```

---

## 🎯 实用场景

### 场景 1: 调试扩展 Storage
```
1. list_extensions  # 获取扩展 ID
2. inspect_extension_storage extensionId=xxx storageType=local
3. # 如需修改数据
   evaluate_in_extension extensionId=xxx code="await chrome.storage.local.set({key: 'value'})"
```

### 场景 2: 重载扩展
```
1. list_extensions  # 获取扩展 ID
2. evaluate_in_extension extensionId=xxx code="chrome.runtime.reload()"
```

### 场景 3: 查看扩展状态
```
1. list_extensions
2. get_extension_details extensionId=xxx
3. list_extension_contexts extensionId=xxx
```

### 场景 4: 执行扩展 API
```
1. list_extensions
2. evaluate_in_extension extensionId=xxx code="await chrome.tabs.query({active: true})"
```

---

## ⚠️ 重要提示

### MV3 Service Worker 限制

1. **Service Worker 可能处于 inactive 状态**
   - 需要触发扩展事件来激活（如打开 popup、访问匹配的页面）
   - 使用 `list_extension_contexts` 可以看到上下文，但可能无法立即访问

2. **API 可用性**
   - 某些 `chrome.*` API 在 Service Worker 中可能未定义
   - 使用 `evaluate_in_extension` 先检查：`typeof chrome.storage !== 'undefined'`

3. **推荐方式**
   - 优先使用 `evaluate_in_extension` 在 background 中执行代码
   - 避免直接使用 `switch_extension_context`（对 Service Worker 无效）

---

## 🔧 技术架构

### CDP API 使用
所有扩展调试功能都使用 **Chrome DevTools Protocol (CDP)** 实现：

- `Target.getTargets()` - 发现扩展 targets
- `Target.attachToTarget()` - 连接到扩展上下文
- `Runtime.evaluate()` - 执行代码
- Puppeteer `newPage()` + `goto()` - 读取 manifest.json

### 关键类
- `ExtensionHelper` - 扩展操作辅助类
- `McpContext` - MCP 上下文，暴露扩展方法
- `extensions.ts` - 8 个扩展调试工具定义

---

## 📊 测试状态

✅ **已通过自动化测试的工具：**
1. list_extensions
2. get_extension_details  
3. list_extension_contexts
4. switch_extension_context (部分)
5. evaluate_in_extension (CDP 版本)

✅ **编译状态：** 零 TypeScript 错误

---

## 🚀 下一步计划

可以考虑添加的高级功能：
- [ ] `monitor_extension_messages` - 监控扩展消息
- [ ] `watch_extension_storage` - 实时监控 Storage 变化
- [ ] `get_extension_logs` - 收集扩展日志
- [ ] `analyze_extension_performance` - 性能分析

---

## 📚 参考资料

- [Chrome Extensions MV3 文档](https://developer.chrome.com/docs/extensions/mv3/)
- [Chrome DevTools Protocol](https://chromedevtools.github.io/devtools-protocol/)
- [Puppeteer API](https://pptr.dev/)
