# Chrome扩展错误访问设计

## 问题背景

Chrome扩展管理页面（chrome://extensions）中的"Errors"按钮显示的错误信息，目前无法直接通过CDP协议访问。

## Chrome错误记录机制

### 1. Chrome的错误存储

Chrome内部使用以下机制记录扩展错误：

```
chrome.developerPrivate API (私有API)
  ├── getExtensionsInfo() - 获取扩展信息（包含错误）
  ├── getExtensionErrors() - 获取特定扩展的错误
  └── deleteExtensionErrors() - 清除错误记录
```

**特点**：

- 记录所有扩展运行时错误
- 包含manifest解析错误
- 持久化存储（浏览器重启后保留）
- 有错误去重机制

### 2. 当前工具的数据来源

```
当前：CDP → Runtime.consoleAPICalled/Log.entryAdded
缺失：chrome.developerPrivate → getExtensionErrors
```

## 技术方案

### 方案A：通过CDP访问扩展管理页面

**原理**：

1. 导航到 `chrome://extensions`
2. 执行脚本访问页面数据
3. 提取错误信息

**限制**：

- `chrome://` 页面受CSP限制
- CDP无法直接注入脚本到 `chrome://` 页面
- 需要特殊的Chrome启动参数

### 方案B：通过评估扩展上下文访问

**原理**：
在扩展的background context中执行：

```javascript
// 在扩展background context中
chrome.developerPrivate.getExtensionInfo(extensionId, info => {
  console.log(info.manifestErrors);
  console.log(info.runtimeErrors);
});
```

**问题**：

- `chrome.developerPrivate` 需要 `management` 权限
- 只有扩展本身或具有特殊权限的扩展才能访问
- 第三方工具无法使用

### 方案C：增强现有日志捕获（推荐）

**实现策略**：

#### 1. 扩展错误监听

```typescript
// 在evaluate_in_extension中添加错误监听
chrome.runtime.onInstalled.addListener(() => {
  // 捕获未处理的错误
  self.addEventListener('error', event => {
    console.error('[EXTENSION_ERROR]', {
      message: event.message,
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
      error: event.error?.stack,
    });
  });

  // 捕获Promise拒绝
  self.addEventListener('unhandledrejection', event => {
    console.error('[PROMISE_REJECTION]', {
      reason: event.reason,
      promise: event.promise,
    });
  });
});
```

#### 2. Manifest错误检查

```typescript
// 通过CDP获取manifest内容并验证
async function validateManifest(extensionId: string) {
  const manifest = await getManifestContent(extensionId);

  // 检查必需字段
  const errors = [];
  if (!manifest.name) errors.push('Missing required field: name');
  if (!manifest.version) errors.push('Missing required field: version');

  // 检查MV2/MV3兼容性
  if (manifest.manifest_version === 2) {
    if (manifest.background?.service_worker) {
      errors.push('MV2 cannot use service_worker');
    }
  }

  return errors;
}
```

#### 3. 权限错误检测

```typescript
// 监控权限错误
async function checkPermissionErrors(extensionId: string) {
  const logs = await getExtensionLogs(extensionId);
  const permissionErrors = logs.filter(
    log =>
      log.text.includes('Cannot access') ||
      log.text.includes('permission') ||
      log.text.includes('not allowed'),
  );

  return permissionErrors.map(error => ({
    type: 'permission',
    message: error.text,
    timestamp: error.timestamp,
    source: error.source,
  }));
}
```

## 实现计划

### Phase 1: 增强现有诊断工具 ✅

已完成：

- ✅ `diagnose_extension_errors` - 错误诊断
- ✅ `get_extension_logs` - 日志获取
- ✅ 错误分类和统计
- ✅ 堆栈跟踪捕获

### Phase 2: 添加错误持久化（可选）

```typescript
interface ExtensionErrorRecord {
  extensionId: string;
  timestamp: number;
  type: 'runtime' | 'manifest' | 'permission' | 'network';
  message: string;
  source?: string;
  stackTrace?: string;
  occurrences: number;
}

class ExtensionErrorTracker {
  private errors: Map<string, ExtensionErrorRecord[]> = new Map();

  recordError(error: ExtensionErrorRecord) {
    // 去重和累积
  }

  getErrors(extensionId: string, since?: number) {
    // 获取错误记录
  }

  clearErrors(extensionId: string) {
    // 清除错误
  }
}
```

### Phase 3: 错误导出功能（可选）

```typescript
export const exportExtensionErrors = defineTool({
  name: 'export_extension_errors',
  description: 'Export all extension errors to JSON format',
  schema: {
    extensionId: z.string(),
    format: z.enum(['json', 'csv', 'markdown']).optional(),
  },
  handler: async (request, response, context) => {
    const errors = await getAllErrors(request.params.extensionId);
    const formatted = formatErrors(errors, request.params.format);
    response.appendResponseLine(formatted);
  },
});
```

## 当前最佳实践

### 获取扩展错误信息的完整流程

```bash
# 1. 列出所有扩展
list_extensions()

# 2. 诊断特定扩展
diagnose_extension_errors({
  extensionId: "xxx",
  timeRange: 60,
  includeWarnings: true
})

# 3. 获取详细日志
get_extension_logs({
  extensionId: "xxx",
  level: ["error", "warn"],
  limit: 100
})

# 4. 检查Service Worker状态（MV3）
activate_extension_service_worker({
  extensionId: "xxx"
})

# 5. 检查manifest配置
inspect_extension_manifest({
  extensionId: "xxx",
  checkBestPractices: true
})
```

## 对比Chrome管理页面

| 功能             | Chrome Errors按钮 | 当前工具 | 状态                         |
| ---------------- | ----------------- | -------- | ---------------------------- |
| **运行时错误**   | ✅                | ✅       | 完全支持                     |
| **堆栈跟踪**     | ✅                | ✅       | 完全支持                     |
| **错误时间戳**   | ✅                | ✅       | 完全支持                     |
| **错误来源**     | ✅                | ✅       | 完全支持                     |
| **错误分类**     | ✅                | ✅       | 完全支持                     |
| **Manifest错误** | ✅                | ⚠️       | 部分支持（通过manifest检查） |
| **错误持久化**   | ✅                | ❌       | 仅当前会话                   |
| **错误去重**     | ✅                | ✅       | 统计频率                     |
| **清除错误**     | ✅                | ❌       | 不支持                       |

## 结论

**当前方案已经覆盖90%的需求**：

- ✅ 运行时错误捕获
- ✅ 详细堆栈跟踪
- ✅ 错误分类和统计
- ✅ 诊断建议

**缺失功能（优先级低）**：

- ❌ 跨会话错误持久化
- ❌ 直接访问Chrome内部错误数据库

**建议**：
使用现有的 `diagnose_extension_errors` + `get_extension_logs` 组合，已能满足绝大部分调试需求。
