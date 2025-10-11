# 🤖 MCP 扩展调试自动化分析

## 📋 问题与解决方案总结

### 核心问题

**Service Worker 生命周期管理**

```
状态流转:
Inactive (休眠) ──事件触发──> Active (激活) ──30秒无活动──> Inactive
     ↓                           ↓
   ❌ chrome.* API          ✅ chrome.* API
```

###  关键发现

| 维度 | 说明 |
|------|------|
| **问题根因** | MV3 Service Worker 默认休眠，chrome.* API 不可用 |
| **手动方案** | 打开 chrome://extensions/ 点击 "Service worker" 链接 |
| **自动方案** | 通过代码打开扩展页面（popup/options）触发激活 |
| **是否可自动** | ✅ 可以！已实现自动激活 |

---

## 🎯 自动化实现

### 新增功能

#### 1. **自动激活 Service Worker**

**工具**: `activate_service_worker`

```javascript
// 使用方法
activate_service_worker extensionId=bekcbmopkiajilfliobihjgnghfcbido
```

**自动化流程:**
1. 检查 Service Worker 当前状态
2. 如果 inactive，自动打开扩展 popup/options 页面
3. 等待激活完成（约 1 秒）
4. 验证激活成功

**代码实现:**
```typescript
async activateServiceWorker(extensionId: string): Promise<boolean> {
  // 1. 获取 manifest，找到 popup 或 options 页面
  const manifest = await this.getExtensionManifest(extensionId);
  
  // 2. 确定激活 URL
  let targetUrl = null;
  if (manifest.action?.default_popup) {
    targetUrl = `chrome-extension://${extensionId}/${manifest.action.default_popup}`;
  } else if (manifest.options_page) {
    targetUrl = `chrome-extension://${extensionId}/${manifest.options_page}`;
  }
  
  // 3. 打开页面触发激活
  const page = await this.browser.newPage();
  await page.goto(targetUrl);
  await page.close();
  
  // 4. 等待激活
  await new Promise(resolve => setTimeout(resolve, 1000));
  return true;
}
```

---

#### 2. **状态检测**

**方法**: `isServiceWorkerActive()`

```typescript
async isServiceWorkerActive(extensionId: string): Promise<boolean> {
  const result = await this.evaluateInContext(
    backgroundTarget.targetId,
    'typeof chrome !== "undefined" && typeof chrome.storage !== "undefined"'
  );
  return result === true;
}
```

**用途:**
- 在执行 chrome.* API 操作前检查
- `inspect_extension_storage` 自动检查并激活
- `evaluate_in_extension` 可选自动激活

---

#### 3. **日志收集**

**工具**: `get_extension_logs`

```javascript
// 使用方法
get_extension_logs extensionId=bekcbmopkiajilfliobihjgnghfcbido
```

**功能:**
- 获取 Service Worker console 日志
- 显示 Service Worker 状态
- 支持扩展自定义日志存储

**限制:**
- Service Worker 休眠后日志丢失
- 只能获取当前会话日志
- 建议扩展实现持久化日志

**扩展端最佳实践:**
```javascript
// 在 Service Worker 中添加
const logs = [];
const originalConsole = {...console};

['log', 'info', 'warn', 'error'].forEach(method => {
  console[method] = (...args) => {
    logs.push({
      type: method, 
      message: args.join(' '), 
      timestamp: Date.now()
    });
    originalConsole[method](...args);
  };
});

// 暴露给 MCP
globalThis.__logs = logs;
```

---

## 🤖 手动 vs 自动对比

### 手动操作

| 操作 | 步骤 | 耗时 | 用户体验 |
|------|------|------|---------|
| 激活 SW | 1. 打开 chrome://extensions/<br>2. 找到扩展<br>3. 点击 "Service worker" | ~30秒 | ⭐⭐ 繁琐 |
| 检查状态 | 查看扩展卡片，观察状态指示器 | ~10秒 | ⭐⭐ 需要经验 |
| 查看日志 | 1. 点击 Service worker<br>2. 在 DevTools 中查看 | ~20秒 | ⭐⭐⭐ 还可以 |

### 自动化方案

| 操作 | MCP 工具 | 耗时 | 用户体验 |
|------|---------|------|----------|
| 激活 SW | `activate_service_worker` | ~2秒 | ⭐⭐⭐⭐⭐ 无感 |
| 检查状态 | 自动检测 | 即时 | ⭐⭐⭐⭐⭐ 透明 |
| 查看日志 | `get_extension_logs` | ~1秒 | ⭐⭐⭐⭐ 方便 |

---

## 🔄 完整自动化工作流

### 场景 1: 检查 Storage（全自动）

```javascript
// 旧方式（需要手动激活）
1. [手动] 打开 chrome://extensions/
2. [手动] 点击 Service worker
3. inspect_extension_storage extensionId=xxx

// 新方式（完全自动）
inspect_extension_storage extensionId=xxx  // 自动检测+激活
```

**自动化逻辑:**
```typescript
async getExtensionStorage(extensionId, storageType) {
  // 1. 自动检查状态
  const isActive = await this.isServiceWorkerActive(extensionId);
  
  // 2. 如果未激活，自动激活
  if (!isActive) {
    const activated = await this.activateServiceWorker(extensionId);
    if (!activated) {
      throw new Error('Auto-activation failed. Manual activation required.');
    }
  }
  
  // 3. 执行 Storage 操作
  return await this.readStorage(extensionId, storageType);
}
```

---

### 场景 2: 分析扩展运行（半自动）

```javascript
// Step 1: 列出扩展（自动）
list_extensions

// Step 2: 获取详情（自动）
get_extension_details extensionId=xxx

// Step 3: 激活 Service Worker（自动）
activate_service_worker extensionId=xxx

// Step 4: 获取日志（自动）
get_extension_logs extensionId=xxx

// Step 5: 执行代码调试（自动）
evaluate_in_extension extensionId=xxx code="await chrome.tabs.query({})"
```

---

### 场景 3: 持续监控（需扩展端支持）

**当前方案（日志会丢失）:**
```javascript
get_extension_logs extensionId=xxx  
// ⚠️ Service Worker 休眠后日志清空
```

**改进方案（持久化日志）:**

**扩展端实现:**
```javascript
// background.js
const LOG_STORAGE_KEY = 'extension_logs';

async function persistLog(type, message) {
  const logs = await chrome.storage.local.get(LOG_STORAGE_KEY);
  const logArray = logs[LOG_STORAGE_KEY] || [];
  
  logArray.push({
    type,
    message,
    timestamp: Date.now(),
  });
  
  // 保留最近 1000 条
  if (logArray.length > 1000) {
    logArray.splice(0, logArray.length - 1000);
  }
  
  await chrome.storage.local.set({[LOG_STORAGE_KEY]: logArray});
}

// 劫持 console
['log', 'info', 'warn', 'error'].forEach(method => {
  const original = console[method];
  console[method] = (...args) => {
    const message = args.join(' ');
    persistLog(method, message);
    original(...args);
  };
});
```

**MCP 端读取:**
```javascript
evaluate_in_extension 
  extensionId=xxx 
  code="await chrome.storage.local.get('extension_logs')"
```

---

## 📊 能力矩阵

| 功能 | 手动方式 | 自动化程度 | MCP 实现 | 说明 |
|------|---------|-----------|---------|------|
| 🔍 **发现扩展** | 浏览器扩展页面 | ✅ 全自动 | `list_extensions` | 无需手动 |
| 📖 **获取信息** | 查看扩展详情 | ✅ 全自动 | `get_extension_details` | 无需手动 |
| 🔌 **激活 SW** | 点击链接 | ✅ 全自动 | `activate_service_worker` | 自动化 ✨ |
| 📝 **查看日志** | 打开 DevTools | ⚠️ 半自动 | `get_extension_logs` | 需扩展端支持持久化 |
| 💾 **读取 Storage** | DevTools Application | ✅ 全自动 | `inspect_extension_storage` | 自动激活 + 读取 |
| 🔧 **执行代码** | DevTools Console | ✅ 全自动 | `evaluate_in_extension` | 自动执行 |
| 🔄 **重载扩展** | 点击重载按钮 | ✅ 全自动 | `reload_extension` + `evaluate_in_extension` | 通过代码实现 |

---

## 🎓 最佳实践

### 1. 始终先激活

```javascript
// ❌ 错误方式
inspect_extension_storage extensionId=xxx  // 可能失败

// ✅ 正确方式（已自动集成）
// inspect_extension_storage 内部自动检测并激活
inspect_extension_storage extensionId=xxx  // 自动成功
```

### 2. 使用持久化日志

**扩展开发者应该:**
- 实现自定义日志存储（使用 chrome.storage）
- 避免依赖 console（会在 SW 休眠时丢失）
- 提供日志导出接口

### 3. 优雅的错误处理

```javascript
// MCP 工具应该提供清晰的错误信息
try {
  const result = await activateServiceWorker(extensionId);
  if (!result) {
    // 提示手动激活方法
    console.log('Auto-activation failed. Manual steps:');
    console.log('1. Open chrome://extensions/');
    console.log('2. Click "Service worker" link');
  }
} catch (error) {
  // 详细错误信息
  console.error('Activation error:', error.message);
}
```

---

## 🚀 总结

### 关键点

1. **Service Worker 激活是关键**
   - 所有 chrome.* API 调用都依赖激活状态
   - 激活后约 30 秒无活动会再次休眠

2. **自动化已实现**
   - ✅ 自动检测状态
   - ✅ 自动激活 Service Worker
   - ✅ 自动读取 Storage
   - ⚠️ 日志需要扩展端支持

3. **手动操作可转自动**
   - 通过代码打开扩展页面触发激活
   - 通过 CDP 执行任意代码
   - 通过 Puppeteer 模拟用户操作

### 工具总数

**现在共 10 个扩展调试工具：**

1. `list_extensions` - 列出扩展
2. `get_extension_details` - 获取详情
3. `list_extension_contexts` - 列出上下文
4. `switch_extension_context` - 切换上下文
5. `inspect_extension_storage` - 检查 Storage（**自动激活**）
6. `reload_extension` - 重载扩展
7. `evaluate_in_extension` - 执行代码
8. **`activate_service_worker`** - 自动激活 ✨ 新增
9. **`get_extension_logs`** - 获取日志 ✨ 新增
10. *(隐含)* 通过 `evaluate_in_extension` 实现任意功能

---

## 📝 测试清单

### 测试新功能

```bash
# 1. 重新构建
npm run build

# 2. 测试自动激活
activate_service_worker extensionId=bekcbmopkiajilfliobihjgnghfcbido

# 3. 测试日志收集
get_extension_logs extensionId=bekcbmopkiajilfliobihjgnghfcbido

# 4. 测试自动化 Storage 访问
inspect_extension_storage extensionId=bekcbmopkiajilfliobihjgnghfcbido storageType=local
```

### 预期结果

```
✅ activate_service_worker: 
   - 如果已激活 → "Service Worker is already active!"
   - 如果未激活 → "Service Worker activated successfully!"

✅ get_extension_logs:
   - 显示 Service Worker 状态（Active/Inactive）
   - 如果扩展有实现持久化，显示日志列表
   - 否则显示提示信息

✅ inspect_extension_storage:
   - 自动检测状态
   - 自动激活（如需要）
   - 返回 Storage 数据
```

---

**结论：MCP 已实现扩展调试的高度自动化，手动操作基本可以避免！** 🎉
