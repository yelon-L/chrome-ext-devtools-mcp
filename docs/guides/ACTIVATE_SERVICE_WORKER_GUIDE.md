# Service Worker 激活工具使用指南

## 工具概述

`activate_extension_service_worker` 是一个自动化工具，用于激活 Chrome 扩展的 Service Worker。

### 为什么需要这个工具？

- Chrome 扩展的 Service Worker 可能处于 **Inactive** 状态
- 某些扩展功能依赖 SW 激活才能工作（消息监听、后台任务等）
- 手动在 `chrome://extensions` 点击按钮很繁琐
- 自动化测试需要确保 SW 处于激活状态

### 技术优势

- ✅ **高性能**: 使用脚本方式，耗时仅 4ms（比工具链快 233 倍）
- ✅ **灵活模式**: 支持单个、全部、按状态激活
- ✅ **原子操作**: 一次调用完成所有激活
- ✅ **完整反馈**: 详细的激活结果和状态信息

## 使用方法

### 基本用法

#### 1. 激活所有未激活的 Service Worker（推荐）

```javascript
{
  "name": "activate_extension_service_worker",
  "arguments": {
    "mode": "inactive"  // 默认值，可省略
  }
}
```

**返回示例**:

```json
{
  "status": "completed",
  "activated": 3,
  "total": 3,
  "mode": "inactive",
  "results": [
    {
      "id": "nmmhkkegccagdldgiimedpiccmgmieda",
      "name": "Google Wallet",
      "success": true,
      "wasActive": false
    }
  ]
}
```

#### 2. 激活单个扩展的 Service Worker

```javascript
{
  "name": "activate_extension_service_worker",
  "arguments": {
    "extensionId": "nmmhkkegccagdldgiimedpiccmgmieda",
    "mode": "single"
  }
}
```

#### 3. 激活所有扩展的 Service Worker

```javascript
{
  "name": "activate_extension_service_worker",
  "arguments": {
    "mode": "all"
  }
}
```

### 参数说明

| 参数          | 类型   | 必填 | 说明                                     |
| ------------- | ------ | ---- | ---------------------------------------- |
| `extensionId` | string | 否   | 32位小写字母的扩展ID。mode为single时必填 |
| `mode`        | enum   | 否   | 激活模式，默认为 `inactive`              |

#### mode 参数详解

- **`inactive`** (默认): 只激活未激活的 SW
  - 推荐用于日常使用
  - 避免重复点击已激活的 SW
- **`single`**: 只激活指定 extensionId 的 SW
  - 需要配合 extensionId 参数使用
  - 用于精确控制单个扩展
- **`all`**: 激活所有扩展的 SW
  - 包括已激活的（会重新点击）
  - 用于确保所有扩展 SW 都被触发

## 使用场景

### 场景 1: 调试前准备

```javascript
// 1. 列出所有扩展
list_extensions();

// 2. 激活所有未激活的 SW
activate_extension_service_worker({mode: 'inactive'});

// 3. 开始调试
evaluate_in_extension({extensionId: '...', code: '...'});
```

### 场景 2: 自动化测试

```javascript
// 测试流程开始前，确保 SW 激活
async function setupTest() {
  await activate_extension_service_worker({mode: 'all'});
  await new Promise(resolve => setTimeout(resolve, 1000)); // 等待 SW 就绪
  // 继续测试...
}
```

### 场景 3: 批量管理

```javascript
// 激活所有扩展，然后监控它们的行为
activate_extension_service_worker({mode: 'all'});

// 查看各扩展的上下文
list_extension_contexts({extensionId: '...'});

// 监控消息
monitor_extension_messages({extensionId: '...', duration: 5000});
```

## 返回格式

### 成功返回

```json
{
  "status": "completed",
  "activated": 2,
  "total": 3,
  "mode": "inactive",
  "results": [
    {
      "id": "aaa...aaa",
      "name": "Extension A",
      "success": true,
      "wasActive": false,
      "buttonText": "service worker (Inactive)"
    },
    {
      "id": "bbb...bbb",
      "name": "Extension B",
      "success": true,
      "wasActive": false,
      "buttonText": "service worker (Inactive)"
    }
  ]
}
```

### 导航中（自动重试）

```json
{
  "status": "navigating",
  "message": "正在跳转到chrome://extensions...",
  "retry": true
}
```

### 错误返回

```json
{
  "status": "error",
  "message": "未找到指定的扩展",
  "extensionId": "xxx...xxx",
  "hint": "请检查extensionId是否正确"
}
```

### 无需激活

```json
{
  "status": "completed",
  "activated": 0,
  "total": 0,
  "message": "所有扩展的Service Worker都已激活"
}
```

## 常见问题

### Q1: 为什么有时候激活很慢？

**A**: 首次调用可能触发延迟初始化（~41秒），这是正常的。后续调用只需几毫秒。

### Q2: 激活后扩展功能仍不工作？

**A**: SW 激活后可能需要短暂延迟才能完全就绪，建议：

```javascript
activate_extension_service_worker({mode: 'inactive'});
await new Promise(resolve => setTimeout(resolve, 500)); // 等待500ms
// 继续操作
```

### Q3: 提示"未找到任何扩展"？

**A**: 可能原因：

1. Chrome 未安装扩展
2. 页面未完全加载
3. Chrome 版本不兼容（DOM 结构变化）

解决方法：

```javascript
// 先导航到扩展页面
navigate_page({url: 'chrome://extensions'});
// 等待加载
await new Promise(resolve => setTimeout(resolve, 1000));
// 再激活
activate_extension_service_worker({mode: 'inactive'});
```

### Q4: mode=single 但提示参数错误？

**A**: `single` 模式必须提供 `extensionId`：

```javascript
// ❌ 错误
{ mode: "single" }

// ✅ 正确
{ mode: "single", extensionId: "nmmhkkegccagdldgiimedpiccmgmieda" }
```

### Q5: 如何获取 extensionId？

**A**: 使用 `list_extensions` 工具：

```javascript
list_extensions();
// 输出包含所有扩展的 ID 和名称
```

## 最佳实践

### 1. 选择合适的模式

```javascript
// 推荐：日常使用
activate_extension_service_worker({mode: 'inactive'});

// 谨慎：可能重复激活
activate_extension_service_worker({mode: 'all'});

// 精确：指定扩展
activate_extension_service_worker({
  mode: 'single',
  extensionId: 'xxx...xxx',
});
```

### 2. 错误处理

```javascript
try {
  const result = await activate_extension_service_worker({mode: 'inactive'});

  if (result.status === 'error') {
    console.error('激活失败:', result.message);
    // 处理错误
  } else if (result.activated === 0) {
    console.log('无需激活');
  } else {
    console.log(`成功激活 ${result.activated} 个 SW`);
  }
} catch (error) {
  console.error('调用失败:', error);
}
```

### 3. 工作流集成

```javascript
// 完整的扩展调试工作流
async function debugExtension(extensionId) {
  // 1. 激活 SW
  await activate_extension_service_worker({
    mode: 'single',
    extensionId,
  });

  // 2. 等待 SW 就绪
  await new Promise(resolve => setTimeout(resolve, 500));

  // 3. 查看上下文
  const contexts = await list_extension_contexts({extensionId});
  console.log('扩展上下文:', contexts);

  // 4. 执行代码
  const result = await evaluate_in_extension({
    extensionId,
    code: 'chrome.runtime.getManifest()',
  });
  console.log('清单:', result);

  // 5. 查看日志
  const logs = await get_extension_logs({extensionId});
  console.log('日志:', logs);
}
```

## 性能对比

根据 `CHAIN_COMPARISON.md` 的性能测试：

| 方案               | 耗时    | 说明         |
| ------------------ | ------- | ------------ |
| 脚本方式（本工具） | **4ms** | ⚡ 推荐      |
| 工具链方式         | 932ms   | 慢 233 倍 ❌ |

**结论**: 脚本方式性能优异，是自动化场景的最佳选择。

## 相关工具

配合使用可以实现完整的扩展调试流程：

- `list_extensions` - 列出所有扩展
- `get_extension_details` - 获取扩展详情
- `list_extension_contexts` - 查看扩展上下文
- `evaluate_in_extension` - 在扩展中执行代码
- `get_extension_logs` - 获取扩展日志
- `reload_extension` - 重载扩展

## 更新日志

### v0.8.1 (2025-10-12)

- ✨ 新增 `activate_extension_service_worker` 工具
- 🚀 使用高性能脚本方式（4ms）
- 📦 支持 3 种激活模式
- 📊 工具总数: 37 → 38

## 技术细节

### DOM 选择器

工具使用以下选择器查找 Service Worker 按钮：

```javascript
// 主选择器
item.querySelector('#service-worker-button');

// 备用选择器
item.querySelector('[id*="service-worker"]');

// 降级方案：文本匹配
Array.from(item.querySelectorAll('button')).find(btn =>
  btn.textContent.includes('service worker'),
);
```

### 兼容性

- ✅ Chrome 88+
- ⚠️ DOM 结构可能因 Chrome 版本而异
- 📝 工具会尝试多种选择器以提高兼容性

## 反馈与支持

遇到问题？请提供以下信息：

1. Chrome 版本
2. 工具调用参数
3. 错误信息
4. `chrome://extensions` 页面截图

---

**相关文档**:

- [CHAIN_COMPARISON.md](../CHAIN_COMPARISON.md) - 性能对比详情
- [NEXT_SESSION_PROMPT.md](../NEXT_SESSION_PROMPT.md) - 实现详细规格
- [测试脚本](../test-sw-activation.mjs) - 功能测试代码
