# 扩展调试功能实现指南

详细实施步骤，包含完整的代码示例和最佳实践。

## 📁 文件创建清单

### Phase 1: 基础架构
```
src/extension/
├── types.ts                   # 扩展相关类型定义
└── ExtensionHelper.ts         # 扩展辅助工具类
```

### Phase 2: 工具实现
```
src/tools/
├── extension-discovery.ts     # list_extensions, get_extension_details
├── extension-contexts.ts      # list_extension_contexts, switch_extension_context  
├── extension-storage.ts       # inspect_extension_storage, watch_extension_storage
├── extension-messaging.ts     # monitor_extension_messages, trace_extension_api_calls
├── extension-logs.ts          # get_extension_logs
├── extension-performance.ts   # analyze_extension_performance, detect_extension_conflicts
└── extension-testing.ts       # test_extension_compatibility
```

## 🎯 核心实现

### 1. 类型定义 (`src/extension/types.ts`)

```typescript
export interface ExtensionInfo {
  id: string;
  name: string;
  version: string;
  manifestVersion: 2 | 3;
  description?: string;
  enabled: boolean;
  backgroundUrl?: string;
  permissions?: string[];
  hostPermissions?: string[];
}

export type ExtensionContextType = 'background' | 'popup' | 'options' | 'devtools' | 'content_script';

export interface ExtensionContext {
  type: ExtensionContextType;
  extensionId: string;
  targetId: string;
  url: string;
  isPrimary: boolean;
  title?: string;
}

export type StorageType = 'local' | 'sync' | 'session' | 'managed';

export interface StorageData {
  type: StorageType;
  data: Record<string, any>;
  bytesUsed?: number;
  quota?: number;
}
```

### 2. 扩展 Context (`src/McpContext.ts`)

```typescript
export type Context = Readonly<{
  // ... 现有方法
  
  // 新增
  getBrowser(): Browser;
  getExtensions(includeDisabled?: boolean): Promise<ExtensionInfo[]>;
  getExtensionDetails(extensionId: string): Promise<ExtensionInfo | null>;
  getExtensionContexts(extensionId: string): Promise<ExtensionContext[]>;
  switchToExtensionContext(contextId: string): Promise<Page>;
  getExtensionStorage(extensionId: string, storageType: StorageType): Promise<StorageData>;
}>;
```

### 3. 工具示例 (`src/tools/extension-discovery.ts`)

```typescript
export const listExtensions = defineTool({
  name: 'list_extensions',
  description: 'List all installed Chrome extensions with metadata',
  annotations: {
    category: ToolCategories.EXTENSION_DEBUGGING,
    readOnlyHint: true,
  },
  schema: {
    includeDisabled: z.boolean().optional()
      .describe('Include disabled extensions'),
  },
  handler: async (request, response, context) => {
    const extensions = await context.getExtensions(request.params.includeDisabled);
    
    response.appendResponseLine(`# Installed Extensions (${extensions.length})\n`);
    
    for (const ext of extensions) {
      response.appendResponseLine(`## ${ext.name}`);
      response.appendResponseLine(`- ID: ${ext.id}`);
      response.appendResponseLine(`- Version: ${ext.version}`);
      response.appendResponseLine(`- Status: ${ext.enabled ? '✅ Enabled' : '❌ Disabled'}`);
      response.appendResponseLine('');
    }
    
    response.setIncludePages(true);
  },
});
```

## 📋 完整工具列表

### 扩展发现 (3 tools)
- `list_extensions` - 列出所有扩展
- `get_extension_details` - 获取扩展详情
- `inspect_extension_manifest` - 检查 manifest.json

### 上下文管理 (2 tools)
- `list_extension_contexts` - 列出扩展上下文
- `switch_extension_context` - 切换上下文

### Storage 检查 (2 tools)
- `inspect_extension_storage` - 检查 Storage
- `watch_extension_storage` - 监控 Storage 变化

### 消息追踪 (2 tools)
- `monitor_extension_messages` - 监控消息
- `trace_extension_api_calls` - 追踪 API 调用

### 日志收集 (1 tool)
- `get_extension_logs` - 收集扩展日志

### 性能分析 (2 tools)
- `analyze_extension_performance` - 性能分析
- `detect_extension_conflicts` - 冲突检测

### 批量测试 (1 tool)
- `test_extension_compatibility` - 兼容性测试

## 🔧 注册工具

在 `src/main.ts` 中添加：

```typescript
import * as extensionDiscoveryTools from './tools/extension-discovery.js';
import * as extensionContextsTools from './tools/extension-contexts.js';
import * as extensionStorageTools from './tools/extension-storage.js';

const tools = [
  // ... 现有工具
  ...Object.values(extensionDiscoveryTools),
  ...Object.values(extensionContextsTools),
  ...Object.values(extensionStorageTools),
];

for (const tool of tools) {
  registerTool(tool as unknown as ToolDefinition);
}
```

## ✅ 测试清单

- [ ] 类型定义编译通过
- [ ] ExtensionHelper 单元测试
- [ ] 每个工具的集成测试
- [ ] 文档更新完成
- [ ] 示例代码验证

## 📚 相关文档

- [ENHANCEMENT_PLAN.md](./ENHANCEMENT_PLAN.md) - 完整增强计划
- [ARCHITECTURE_COMPARISON.md](./ARCHITECTURE_COMPARISON.md) - 架构对比
- Chrome Extensions API 文档
- Puppeteer CDP 文档
