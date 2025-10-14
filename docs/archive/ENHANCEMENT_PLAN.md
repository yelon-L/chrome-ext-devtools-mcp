# Chrome DevTools MCP 扩展调试增强计划

## 📊 项目对比分析

### 项目 #1: chrome-ext-devtools-mcp (Google 官方)

**架构特点：**
- ✅ **高代码质量** - Google 官方维护，Apache 2.0 许可
- ✅ **清晰架构** - 基于 MCP SDK 标准实现
- ✅ **类型安全** - 完整的 TypeScript 类型系统，零 ts-ignore
- ✅ **模块化设计** - tools 按功能分类（console, emulation, input, network, pages, performance, screenshot, script, snapshot）
- ✅ **Mutex 保护** - FIFO 队列防止工具执行冲突
- ✅ **CLI 支持完善** - 16 个配置选项

**工具数量：** 约 30 个
- 输入自动化 (7)
- 导航自动化 (7) 
- 模拟 (3)
- 性能 (3)
- 网络 (2)
- 调试 (4)

**核心优势：**
- Puppeteer Core 集成优秀
- McpResponse 响应构建器统一
- WaitForHelper 智能等待机制
- PageCollector 页面管理
- 文档完善，易于维护

**局限性：**
- ❌ 无扩展调试专业功能
- ❌ 无多上下文管理
- ❌ 无扩展 Storage 检查
- ❌ 无消息追踪能力
- ❌ 仅支持 stdio transport

---

### 项目 #2: chrome-extension-debug-mcp (专业扩展调试)

**架构特点：**
- ✅ **扩展专业化** - 51 个工具专注扩展调试
- ✅ **双传输模式** - stdio + RemoteTransport (HTTP/SSE)
- ✅ **模块化 Handlers** - 11 个专业扩展模块
- ⚠️ **架构复杂** - v4/v6/v6.1 多版本共存
- ⚠️ **代码质量** - 存在 @ts-nocheck
- ⚠️ **依赖混乱** - chrome-remote-interface + puppeteer 双依赖

**工具数量：** 51 个
- 浏览器控制 (5)
- **扩展调试 (10)** ⭐ 核心差异化
- DOM 交互 (12)
- 智能等待 (2)
- 性能分析 (6)
- 网络监控 (5)
- 开发者工具 (3)
- 快速调试 (3)
- Chrome 生命周期 (2)
- 控制台日志 (2)
- 评估 (1)

**核心优势：**
- ExtensionDetector - 扩展发现与元数据
- ExtensionContextManager - 多上下文切换
- ExtensionStorageManager - Storage 检查
- ExtensionMessageTracker - 消息追踪
- ExtensionContentScript - Content Script 管理
- ExtensionPerformanceAnalyzer - 扩展性能分析
- ExtensionNetworkMonitor - 扩展网络监控
- RemoteTransport 支持

**局限性：**
- ❌ 代码质量需提升
- ❌ 架构过度复杂
- ❌ 缺少官方支持
- ❌ 文档不够系统

---

## 🎯 增强策略（基于第一性原理）

### 核心原则
1. **以 chrome-ext-devtools-mcp 为基础** - 架构清晰，代码质量高
2. **引入 chrome-extension-debug-mcp 的扩展能力** - 差异化核心价值
3. **保持简洁** - 避免过度设计
4. **类型安全** - 100% TypeScript，无 @ts-nocheck
5. **向后兼容** - 不破坏现有工具

---

## 📋 增强计划（分三个阶段）

### 🔹 Phase 1: 基础架构准备 (Week 1)

**目标：** 为扩展调试建立基础设施

#### 1.1 创建扩展相关类型定义
```typescript
// src/extension/types.ts
export interface ExtensionInfo {
  id: string;
  name: string;
  version: string;
  manifest: ManifestV3 | ManifestV2;
  enabled: boolean;
  url: string;
}

export interface ExtensionContext {
  type: 'background' | 'popup' | 'content_script' | 'devtools';
  extensionId: string;
  targetId: string;
  url: string;
}

export interface StorageData {
  type: 'local' | 'sync' | 'session';
  data: Record<string, any>;
  bytesUsed?: number;
}
```

#### 1.2 扩展 McpContext
```typescript
// src/McpContext.ts - 增强
export type Context = Readonly<{
  // ... 现有方法
  
  // 新增扩展相关方法
  getExtensions(): Promise<ExtensionInfo[]>;
  getExtensionContexts(extensionId: string): Promise<ExtensionContext[]>;
  switchToExtensionContext(contextId: string): Promise<void>;
  getExtensionStorage(extensionId: string, type: 'local' | 'sync' | 'session'): Promise<StorageData>;
}>;
```

#### 1.3 创建扩展工具类别
```typescript
// src/tools/categories.ts - 扩展
export enum ToolCategories {
  // ... 现有类别
  EXTENSION_DEBUGGING = 'Extension debugging',
  EXTENSION_ANALYSIS = 'Extension analysis',
  EXTENSION_MONITORING = 'Extension monitoring',
}
```

---

### 🔹 Phase 2: 核心扩展工具实现 (Week 2-3)

**目标：** 实现 10 个核心扩展调试工具

#### 2.1 扩展发现与管理 (3 tools)
```typescript
// src/tools/extension-discovery.ts

export const listExtensions = defineTool({
  name: 'list_extensions',
  description: 'List all installed Chrome extensions with metadata',
  annotations: {
    category: ToolCategories.EXTENSION_DEBUGGING,
    readOnlyHint: true,
  },
  schema: {
    includeDisabled: z.boolean().optional().describe('Include disabled extensions'),
  },
  handler: async (request, response, context) => {
    const extensions = await context.getExtensions();
    // 格式化输出
  },
});

export const getExtensionDetails = defineTool({
  name: 'get_extension_details',
  description: 'Get detailed information about a specific extension',
  annotations: {
    category: ToolCategories.EXTENSION_DEBUGGING,
    readOnlyHint: true,
  },
  schema: {
    extensionId: z.string().describe('Extension ID'),
  },
  handler: async (request, response, context) => {
    // 实现细节
  },
});

export const inspectExtensionManifest = defineTool({
  name: 'inspect_extension_manifest',
  description: 'Inspect extension manifest.json with validation',
  annotations: {
    category: ToolCategories.EXTENSION_DEBUGGING,
    readOnlyHint: true,
  },
  schema: {
    extensionId: z.string().describe('Extension ID'),
  },
  handler: async (request, response, context) => {
    // 实现细节
  },
});
```

#### 2.2 上下文管理 (2 tools)
```typescript
// src/tools/extension-contexts.ts

export const listExtensionContexts = defineTool({
  name: 'list_extension_contexts',
  description: 'List all contexts (background, popup, content scripts) for an extension',
  annotations: {
    category: ToolCategories.EXTENSION_DEBUGGING,
    readOnlyHint: true,
  },
  schema: {
    extensionId: z.string().describe('Extension ID'),
  },
  handler: async (request, response, context) => {
    const contexts = await context.getExtensionContexts(request.params.extensionId);
    // 格式化输出
  },
});

export const switchExtensionContext = defineTool({
  name: 'switch_extension_context',
  description: 'Switch to a specific extension context for debugging',
  annotations: {
    category: ToolCategories.EXTENSION_DEBUGGING,
    readOnlyHint: false,
  },
  schema: {
    contextId: z.string().describe('Context ID from list_extension_contexts'),
  },
  handler: async (request, response, context) => {
    await context.switchToExtensionContext(request.params.contextId);
  },
});
```

#### 2.3 Storage 检查 (2 tools)
```typescript
// src/tools/extension-storage.ts

export const inspectExtensionStorage = defineTool({
  name: 'inspect_extension_storage',
  description: 'Inspect extension storage (local, sync, session)',
  annotations: {
    category: ToolCategories.EXTENSION_DEBUGGING,
    readOnlyHint: true,
  },
  schema: {
    extensionId: z.string().describe('Extension ID'),
    storageType: z.enum(['local', 'sync', 'session']).optional(),
  },
  handler: async (request, response, context) => {
    const storage = await context.getExtensionStorage(
      request.params.extensionId,
      request.params.storageType || 'local'
    );
    // 格式化输出
  },
});

export const watchExtensionStorage = defineTool({
  name: 'watch_extension_storage',
  description: 'Monitor extension storage changes in real-time',
  annotations: {
    category: ToolCategories.EXTENSION_MONITORING,
    readOnlyHint: true,
  },
  schema: {
    extensionId: z.string().describe('Extension ID'),
    duration: z.number().optional().describe('Watch duration in seconds'),
  },
  handler: async (request, response, context) => {
    // 实现监听逻辑
  },
});
```

#### 2.4 消息追踪 (2 tools)
```typescript
// src/tools/extension-messaging.ts

export const monitorExtensionMessages = defineTool({
  name: 'monitor_extension_messages',
  description: 'Monitor chrome.runtime messages between extension components',
  annotations: {
    category: ToolCategories.EXTENSION_MONITORING,
    readOnlyHint: true,
  },
  schema: {
    extensionId: z.string().describe('Extension ID'),
    duration: z.number().optional().describe('Monitor duration in seconds'),
  },
  handler: async (request, response, context) => {
    // 实现消息监听
  },
});

export const traceExtensionApiCalls = defineTool({
  name: 'trace_extension_api_calls',
  description: 'Trace chrome.* API calls made by the extension',
  annotations: {
    category: ToolCategories.EXTENSION_ANALYSIS,
    readOnlyHint: true,
  },
  schema: {
    extensionId: z.string().describe('Extension ID'),
    apiFilter: z.array(z.string()).optional().describe('Filter specific APIs'),
  },
  handler: async (request, response, context) => {
    // 实现 API 追踪
  },
});
```

#### 2.5 日志收集 (1 tool)
```typescript
// src/tools/extension-logs.ts

export const getExtensionLogs = defineTool({
  name: 'get_extension_logs',
  description: 'Collect logs from extension contexts (background, content scripts)',
  annotations: {
    category: ToolCategories.EXTENSION_DEBUGGING,
    readOnlyHint: true,
  },
  schema: {
    extensionId: z.string().optional().describe('Filter by extension ID'),
    level: z.enum(['debug', 'info', 'warn', 'error']).optional(),
    limit: z.number().optional().describe('Max number of logs to return'),
  },
  handler: async (request, response, context) => {
    // 扩展现有 list_console_messages 的能力
  },
});
```

---

### 🔹 Phase 3: 高级分析工具 (Week 4)

**目标：** 实现性能分析和批量测试

#### 3.1 性能分析 (2 tools)
```typescript
// src/tools/extension-performance.ts

export const analyzeExtensionPerformance = defineTool({
  name: 'analyze_extension_performance',
  description: 'Analyze extension performance impact on page load',
  annotations: {
    category: ToolCategories.EXTENSION_ANALYSIS,
    readOnlyHint: true,
  },
  schema: {
    extensionId: z.string().describe('Extension ID'),
    testUrl: z.string().describe('URL to test performance on'),
  },
  handler: async (request, response, context) => {
    // 集成现有 performance tools
  },
});

export const detectExtensionConflicts = defineTool({
  name: 'detect_extension_conflicts',
  description: 'Detect conflicts between multiple extensions',
  annotations: {
    category: ToolCategories.EXTENSION_ANALYSIS,
    readOnlyHint: true,
  },
  schema: {
    extensionIds: z.array(z.string()).optional(),
  },
  handler: async (request, response, context) => {
    // 检测冲突
  },
});
```

#### 3.2 批量测试 (1 tool)
```typescript
// src/tools/extension-testing.ts

export const testExtensionCompatibility = defineTool({
  name: 'test_extension_compatibility',
  description: 'Test extension on multiple pages for compatibility',
  annotations: {
    category: ToolCategories.EXTENSION_ANALYSIS,
    readOnlyHint: true,
  },
  schema: {
    extensionId: z.string().describe('Extension ID'),
    testUrls: z.array(z.string()).describe('URLs to test'),
  },
  handler: async (request, response, context) => {
    // 批量测试逻辑
  },
});
```

---

## 🏗️ 实现细节

### 架构设计

```
chrome-ext-devtools-mcp/
├── src/
│   ├── extension/                      # 新增：扩展相关模块
│   │   ├── types.ts                    # 扩展类型定义
│   │   ├── ExtensionDetector.ts        # 扩展发现（精简版）
│   │   ├── ExtensionContextManager.ts  # 上下文管理（精简版）
│   │   ├── ExtensionStorageHelper.ts   # Storage 辅助
│   │   └── ExtensionMessageTracker.ts  # 消息追踪（精简版）
│   ├── tools/
│   │   ├── extension-discovery.ts      # 扩展发现工具
│   │   ├── extension-contexts.ts       # 上下文工具
│   │   ├── extension-storage.ts        # Storage 工具
│   │   ├── extension-messaging.ts      # 消息工具
│   │   ├── extension-logs.ts           # 日志工具
│   │   ├── extension-performance.ts    # 性能工具
│   │   └── extension-testing.ts        # 测试工具
│   ├── McpContext.ts                   # 扩展现有接口
│   └── main.ts                         # 注册新工具
└── docs/
    ├── extension-debugging.md          # 扩展调试文档
    └── tool-reference.md               # 更新工具参考
```

### 关键技术决策

1. **使用 Puppeteer CDP 而非 chrome-remote-interface**
   - 保持单一依赖
   - 与现有架构一致
   - 更好的类型支持

2. **精简化移植**
   - 只移植核心功能
   - 避免过度抽象
   - 保持代码简洁

3. **增量集成**
   - 不破坏现有工具
   - 可选择性启用
   - 向后兼容

4. **统一响应格式**
   - 使用现有 McpResponse
   - 保持一致的输出风格
   - 利用现有格式化器

---

## 📊 预期成果

### 工具数量
- 现有工具: 30 个
- 新增工具: 13 个
- **总计: 43 个工具**

### 新增能力
✅ 扩展发现与元数据检查  
✅ 多上下文调试（background/popup/content）  
✅ Storage 实时检查与监控  
✅ 消息传递追踪  
✅ API 调用追踪  
✅ 扩展性能影响分析  
✅ 扩展冲突检测  
✅ 批量兼容性测试  

### 代码质量
✅ 100% TypeScript  
✅ 零 @ts-nocheck  
✅ 完整类型定义  
✅ 统一架构风格  
✅ 完善的文档  

---

## 🎯 实施时间表

| 阶段 | 任务 | 工作量 | 完成标准 |
|------|------|--------|----------|
| **Phase 1** | 基础架构准备 | 3-5 天 | 类型定义完成，Context 扩展完成 |
| **Phase 2** | 核心工具实现 | 10-14 天 | 10 个核心工具通过测试 |
| **Phase 3** | 高级分析工具 | 5-7 天 | 3 个高级工具通过测试 |
| **Testing** | 集成测试 | 2-3 天 | 所有工具测试覆盖 100% |
| **Documentation** | 文档完善 | 2-3 天 | 文档更新，示例完整 |
| **总计** | | **3-4 周** | 13 个新工具生产就绪 |

---

## 🔧 开发指南

### 启动开发

```bash
# 1. 创建分支
cd chrome-ext-devtools-mcp
git checkout -b feature/extension-debugging

# 2. 创建目录结构
mkdir -p src/extension
mkdir -p src/tools/extension

# 3. 创建基础文件
touch src/extension/types.ts
touch src/extension/ExtensionDetector.ts
touch src/tools/extension-discovery.ts

# 4. 开始开发
npm run build
npm run test
```

### 代码规范

```typescript
// ✅ 好的实践
export const myTool = defineTool({
  name: 'my_tool',
  description: 'Clear, concise description',
  annotations: {
    category: ToolCategories.EXTENSION_DEBUGGING,
    readOnlyHint: true,
  },
  schema: {
    param: z.string().describe('Detailed parameter description'),
  },
  handler: async (request, response, context) => {
    // 实现逻辑
    response.appendResponseLine('Result');
  },
});

// ❌ 避免
// - 使用 any 类型
// - 缺少错误处理
// - 不清晰的描述
// - 硬编码值
```

### 测试要求

```typescript
// tests/extension-tools.test.ts
import {test} from 'node:test';
import assert from 'node:assert';

test('list_extensions returns all extensions', async () => {
  const context = await createTestContext();
  const response = new McpResponse();
  
  await listExtensions.handler({params: {}}, response, context);
  
  const content = await response.handle('list_extensions', context);
  assert(content.length > 0);
});
```

---

## 📈 成功指标

1. **代码质量**
   - TypeScript 编译零错误
   - ESLint 零警告
   - 测试覆盖率 > 80%

2. **功能完整性**
   - 13 个新工具全部实现
   - 所有工具有文档
   - 所有工具有测试

3. **性能**
   - 工具响应时间 < 10s
   - 内存占用增长 < 20%

4. **用户体验**
   - 文档清晰易懂
   - 错误消息友好
   - 与现有工具一致的体验

---

## 🚀 下一步行动

### 立即可开始
1. **创建分支** - `feature/extension-debugging`
2. **实现 Phase 1** - 基础架构
3. **编写第一个工具** - `list_extensions`
4. **添加测试** - 确保质量

### 本周目标
- [ ] Phase 1 完成
- [ ] 前 3 个工具实现
- [ ] 基础测试通过

### 本月目标
- [ ] 全部 13 个工具实现
- [ ] 测试覆盖 100%
- [ ] 文档完善
- [ ] 发布 v1.0-extension-debug

---

## 📚 参考资料

- [Chrome Extensions API](https://developer.chrome.com/docs/extensions/reference/)
- [Chrome DevTools Protocol](https://chromedevtools.github.io/devtools-protocol/)
- [Puppeteer API](https://pptr.dev/)
- [MCP SDK Documentation](https://modelcontextprotocol.ai/docs)

---

**准备状态：** ✅ 已完成分析，可以立即开始实施  
**预期收益：** 扩展调试能力从 0 到完整覆盖，成为市场上最强大的扩展调试 MCP 服务器  
**风险评估：** 低 - 基于成熟架构，增量式开发，不破坏现有功能
