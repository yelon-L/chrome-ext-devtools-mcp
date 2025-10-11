# 📖 正常工作流程指南

## 🎯 核心概念

### Service Worker (SW) 的两种状态

```
1. Inactive (休眠)
   - 不响应外部请求
   - chrome.storage 等 API 不可用
   - 大多数时候处于这个状态

2. Active (激活)
   - 响应外部请求
   - chrome.storage 等 API 可用
   - 约 30 秒后自动回到 Inactive
```

---

## 🔍 你看到的情况分析

### Helper Extension 状态

```
MCP Service Worker Activator
ID: kppbmoiecmhnnhjnlkojlblanellmonp
状态: service worker (Inactive)  ← 这是正常的！
```

**这是正常的！** ✅

- Helper Extension 的 SW 平时就是 Inactive
- 当 MCP 调用它时，它会自动激活
- 完成任务后再次休眠
- **不影响功能**

---

## 📋 正常工作流程

### 场景 1: 使用 `inspect_extension_storage`

```
步骤 1: 用户调用工具
→ inspect_extension_storage extensionId=xxx

步骤 2: MCP 检测目标扩展 SW 状态
→ 发现目标扩展 SW 是 Inactive

步骤 3: MCP 尝试激活目标扩展 SW
→ 方法 1: 使用 Helper Extension（如果已安装）
   ├─ Helper Extension SW 被唤醒
   ├─ 使用 chrome.debugger API 激活目标扩展
   └─ 成功率 95%+
→ 方法 2: 使用 CDP 直接激活（如果没有 Helper）
   └─ 成功率 0-10%

步骤 4a: 激活成功 ✅
→ 访问 chrome.storage
→ 获取数据
→ 返回结果

步骤 4b: 激活失败 ❌
→ 返回错误提示
→ 包含手动激活指南
→ 包含 Helper Extension 安装指南
```

---

## 🎯 关键问题解答

### Q1: Helper Extension 显示 Inactive 能用吗？

**能用！** ✅

```
Helper Extension (Inactive)
    ↓
MCP 发送消息给 Helper Extension
    ↓ (自动唤醒)
Helper Extension (Active)
    ↓
执行激活任务
    ↓
Helper Extension (Inactive) ← 再次休眠
```

**验证方法：**

```javascript
// 在任意页面的控制台执行
chrome.runtime.sendMessage(
  'kppbmoiecmhnnhjnlkojlblanellmonp',  // 你的 Helper Extension ID
  {action: 'ping'},
  (response) => {
    console.log('Helper Extension 响应:', response);
    // 如果能收到响应，说明 Helper Extension 工作正常
  }
);

// 预期输出：
// Helper Extension 响应: {success: true, helperVersion: "1.0.0", available: true}
```

---

### Q2: 需要打开目标扩展的 SW 控制台吗？

**不需要，但这是一个临时解决方案。**

#### 自动化方式（推荐）✅

```
1. 安装 Helper Extension（你已完成）
2. 运行 MCP 工具
3. MCP 自动激活目标扩展 SW
4. 完成操作
5. 无需手动干预
```

#### 手动方式（临时）⚙️

```
1. 访问 chrome://extensions/
2. 找到目标扩展
3. 点击 "Service worker" 链接  ← 这会打开 DevTools
4. SW 被激活（约 30 秒）
5. 快速运行 MCP 工具
6. 完成操作

缺点：
- 每次都要手动操作
- SW 30 秒后再次休眠
- 效率低
```

---

### Q3: 为什么我的 Helper Extension 不工作？

**可能的原因和解决方案：**

#### 原因 1: MCP 没有正确调用 Helper Extension

**检查：** MCP 启动日志

```bash
# 启动模式应该看到：
[Browser] 🔧 生成临时 Helper Extension...
[Browser] ✨ 自动加载，激活成功率 95%+

# 连接模式应该看到：
[Browser] 🔍 开始检查 Helper Extension 安装状态...
[Browser] ✅ 检测到 Helper Extension 已安装！
```

**如果没看到这些日志：**
- 启动模式：Helper Extension 没有被自动生成/加载
- 连接模式：Helper Extension 没有被检测到

**解决：**
```bash
# 方案 1: 使用启动模式（推荐）
node build/index.js  # 不要 --browser-url

# 方案 2: 确保连接模式能检测到
node build/index.js --browser-url http://localhost:9222
# 启动时应该检测到已安装的 Helper Extension
```

#### 原因 2: Helper Extension ID 不匹配

**检查：** 你的 Helper Extension ID

```
你的 ID: kppbmoiecmhnnhjnlkojlblanellmonp
```

**在 MCP 代码中检查：**

```typescript
// src/extension/HelperExtensionClient.ts
// 检测 Helper Extension 的逻辑
if (manifest.name.includes('MCP Service Worker Activator')) {
  // 找到了
}
```

这应该能匹配你的扩展。

#### 原因 3: 权限问题

**检查：** Helper Extension 的权限

访问 `chrome://extensions/?id=kppbmoiecmhnnhjnlkojlblanellmonp`

应该看到：
```
权限:
- 读取和更改 localhost:*/* 上的所有数据
- 管理您的应用、扩展程序和主题背景
- 调试浏览器和扩展程序
```

如果没有这些权限，说明 manifest.json 有问题。

---

## 🧪 测试 Helper Extension

### 测试 1: Ping 测试

```javascript
// 在任意网页（如 http://localhost:*）的控制台执行
chrome.runtime.sendMessage(
  'kppbmoiecmhnnhjnlkojlblanellmonp',
  {action: 'ping'},
  (response) => {
    if (chrome.runtime.lastError) {
      console.error('错误:', chrome.runtime.lastError.message);
    } else {
      console.log('✅ Helper Extension 响应:', response);
    }
  }
);
```

**预期结果：**
```javascript
✅ Helper Extension 响应: {
  success: true,
  helperVersion: "1.0.0",
  available: true
}
```

**如果看到错误：**
```
错误: Could not establish connection. Receiving end does not exist.
```

**原因：**
- Helper Extension 没有监听外部消息
- 或者你不在 localhost 页面（externally_connectable 限制）

**解决：**
```
1. 确保在 http://localhost:* 或 http://127.0.0.1:* 页面
2. 检查 Helper Extension 的 manifest.json
   externally_connectable: {
     matches: ["http://localhost:*/*", "http://127.0.0.1:*/*"]
   }
```

---

### 测试 2: 激活测试

```javascript
// 在 localhost 页面的控制台执行
chrome.runtime.sendMessage(
  'kppbmoiecmhnnhjnlkojlblanellmonp',
  {
    action: 'activate',
    extensionId: 'bekcbmopkiajilfliobihjgnghfcbido'  // 你的测试扩展
  },
  (response) => {
    if (chrome.runtime.lastError) {
      console.error('错误:', chrome.runtime.lastError.message);
    } else {
      console.log('激活结果:', response);
    }
  }
);
```

**预期结果：**
```javascript
激活结果: {
  success: true,
  method: "debugger",
  message: "Service Worker activated successfully"
}
```

**如果失败：**
```javascript
{
  success: false,
  error: "Extension not found: xxx"
}
```

**可能原因：**
- 目标扩展 ID 错误
- 目标扩展已禁用
- Helper Extension 权限不足

---

## 📊 完整工作流程图

```
用户调用 MCP 工具
    ↓
┌─────────────────────────────────────┐
│ MCP 检测目标扩展 SW 状态             │
└─────────────────────────────────────┘
    ↓
SW 是 Inactive？
    ├─ 是 → 尝试激活
    │         ↓
    │   有 Helper Extension？
    │         ├─ 是 → 使用 Helper 激活（95%+）
    │         │         ↓
    │         │   Helper SW 被唤醒
    │         │         ↓
    │         │   Helper 使用 chrome.debugger
    │         │         ↓
    │         │   目标扩展 SW 被激活
    │         │         ↓
    │         │   Helper SW 休眠
    │         │         ↓
    │         └─────→ 成功 ✅
    │         │
    │         └─ 否 → 使用 CDP 激活（0-10%）
    │                   ↓
    │             大概率失败 ❌
    │                   ↓
    │             返回错误 + 安装指南
    │
    └─ 否 → 直接访问
              ↓
          成功 ✅
```

---

## 🎯 推荐工作流程

### 方案 A: 完全自动化（推荐）⭐⭐⭐⭐⭐

```bash
# 1. 移除 --browser-url 参数
# 配置：
{
  "command": "node",
  "args": ["build/index.js"]  # 不要 --browser-url
}

# 2. MCP 自动启动 Chrome
# 3. MCP 自动生成并注入 Helper Extension
# 4. 使用任意工具，自动激活成功率 95%+
# 5. 零配置，零维护
```

### 方案 B: 连接模式 + Helper Extension ⭐⭐⭐⭐

```bash
# 1. 手动安装 Helper Extension（你已完成）
# 配置：
{
  "command": "node",
  "args": ["build/index.js", "--browser-url", "http://localhost:9222"]
}

# 2. MCP 连接到已有 Chrome
# 3. MCP 检测到已安装的 Helper Extension
# 4. 使用任意工具，自动激活成功率 95%+
```

### 方案 C: 手动激活（不推荐）⭐⭐

```bash
# 每次使用工具前：
1. 访问 chrome://extensions/
2. 找到目标扩展
3. 点击 "Service worker" 链接
4. 快速运行 MCP 工具（30 秒内）
5. 完成操作

# 缺点：
- 每次都要手动操作
- 效率低
- 容易超时
```

---

## 🔍 诊断清单

如果工具不能正常运行，按顺序检查：

### ✅ Helper Extension 检查

- [ ] **已安装**
  ```
  chrome://extensions/ 可以看到
  "MCP Service Worker Activator"
  ```

- [ ] **已启用**
  ```
  开关是"开"（蓝色）
  ```

- [ ] **权限正确**
  ```
  权限包含：
  - 管理应用和扩展
  - 调试浏览器
  ```

- [ ] **能响应 ping**
  ```javascript
  // 在 localhost 页面测试
  chrome.runtime.sendMessage('你的ID', {action: 'ping'}, console.log);
  // 应该有响应
  ```

### ✅ MCP 检查

- [ ] **MCP 检测到 Helper Extension**
  ```
  启动日志包含：
  "检测到 Helper Extension"
  ```

- [ ] **MCP 使用了 Helper Extension**
  ```
  工具执行日志包含：
  "使用 Helper Extension 激活"
  ```

### ✅ 目标扩展检查

- [ ] **扩展已安装**
- [ ] **扩展已启用**
- [ ] **扩展有 background script**
  ```
  chrome://extensions/ 可以看到
  "Service worker" 或 "Background page"
  ```

---

## 🎉 总结

### 你的情况

```
Helper Extension: 已安装 ✅
状态: Inactive ✅ (正常)
ID: kppbmoiecmhnnhjnlkojlblanellmonp
```

**这是正常的！** Helper Extension 的 SW 平时就是 Inactive。

### 正常流程

```
1. 用户调用工具
2. MCP 检测到目标扩展 SW 是 Inactive
3. MCP 调用 Helper Extension
4. Helper Extension 自动激活（从 Inactive → Active）
5. Helper Extension 激活目标扩展 SW
6. MCP 访问目标扩展的 storage
7. 返回结果
8. Helper Extension 再次休眠（Active → Inactive）
```

**无需手动打开 SW 控制台！**

### 如果不工作

**最可能的原因：**
- MCP 没有检测到 Helper Extension
- 或者 MCP 没有正确调用 Helper Extension

**解决：**
1. 检查 MCP 启动日志
2. 确认看到 "检测到 Helper Extension"
3. 如果没有，按照上面的诊断清单排查

---

**现在尝试运行 MCP 工具，应该可以正常工作！** 🚀

如果还有问题，请提供：
1. MCP 启动日志
2. 工具执行的错误信息
3. Helper Extension 的完整信息

我会帮你进一步诊断！
