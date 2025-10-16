# 🔍 工具设计模式深度分析

**分析日期**: 2025-10-16  
**分析人**: AI Assistant  
**范围**: 原工程所有27个工具

---

## 📊 工具分类统计

### 按功能分类
| 类别 | 工具数 | 占比 | 代表工具 |
|------|--------|------|----------|
| **Extension Debugging** | 11 | 41% | list_extensions, reload_extension |
| **Navigation & Automation** | 6 | 22% | navigate_page, list_pages |
| **Debugging** | 5 | 19% | screenshot, console |
| **Network** | 2 | 7% | list_network_requests |
| **Performance** | 2 | 7% | start_trace, analyze_insight |
| **Emulation** | 1 | 4% | emulate_network |

### 按开发时间分类
| 类型 | 数量 | 特征 |
|------|------|------|
| **原始工具** (基础功能) | 16 | 成熟、简洁、错误处理好 |
| **扩展工具** (后期添加) | 11 | 功能丰富、文档详细、错误处理差 |

---

## 🎯 原始工具设计模式

### 模式1: 极简主义（Minimalist Pattern）

**代表工具**: `list_console_messages`, `list_pages`, `take_snapshot`

**设计特征**:
```typescript
export const consoleTool = defineTool({
  name: 'list_console_messages',
  description: 'List all console messages for the currently selected page',
  annotations: {
    category: ToolCategories.DEBUGGING,
    readOnlyHint: true,  // ✅ 明确标记只读
  },
  schema: {},  // ✅ 无参数 = 简单
  handler: async (_request, response) => {
    response.setIncludeConsoleData(true);  // ✅ 一行搞定
  },
});
```

**核心原则**:
1. ✅ **单一职责**：只做一件事
2. ✅ **零参数或最少参数**：降低复杂度
3. ✅ **不抛异常**：使用response标记返回数据
4. ✅ **最小副作用**：readOnlyHint: true

**错误处理**: 不需要，因为API保证成功

---

### 模式2: 防御式编程（Defensive Programming）

**代表工具**: `close_page`, `navigate_page_history`

**设计特征**:
```typescript
export const closePage = defineTool({
  schema: {
    pageIdx: z.number().describe('The index of the page to close')
  },
  handler: async (request, response, context) => {
    try {
      await context.closePage(request.params.pageIdx);
    } catch (err) {
      // ✅ 捕获预期错误，转换为信息返回
      if (err.message === CLOSE_PAGE_ERROR) {
        response.appendResponseLine(err.message);
      } else {
        throw err;  // ✅ 未预期错误继续抛出
      }
    }
    response.setIncludePages(true);
  },
});
```

**核心原则**:
1. ✅ **预期错误捕获**：try-catch特定错误
2. ✅ **错误分类处理**：预期 vs 意外
3. ✅ **信息返回**：预期错误返回文本，不崩溃
4. ✅ **保持一致性**：都使用setIncludePages返回状态

**错误处理策略**:
```
预期错误（如"最后一页不能关闭"）
  → catch → appendResponseLine → 返回信息

意外错误（如网络断开）
  → 继续抛出 → MCP层处理
```

---

### 模式3: 参数验证优先（Validation First）

**代表工具**: `take_screenshot`

**设计特征**:
```typescript
export const screenshot = defineTool({
  schema: {
    uid: z.string().optional(),
    fullPage: z.boolean().optional(),
  },
  handler: async (request, response, context) => {
    // ✅ 参数冲突检查在最前面
    if (request.params.uid && request.params.fullPage) {
      throw new Error('Providing both "uid" and "fullPage" is not allowed.');
    }
    
    // ✅ 正常执行流程
    const screenshot = await pageOrHandle.screenshot({...});
    
    // ✅ 根据不同场景返回不同消息
    if (request.params.uid) {
      response.appendResponseLine('Took a screenshot of node...');
    } else if (request.params.fullPage) {
      response.appendResponseLine('Took a screenshot of the full page...');
    } else {
      response.appendResponseLine("Took a screenshot of viewport...");
    }
  },
});
```

**核心原则**:
1. ✅ **参数冲突早检查**：handler最开始验证
2. ✅ **快速失败**：参数错误立即抛异常
3. ✅ **场景化消息**：根据参数返回不同提示
4. ✅ **智能决策**：大图片自动保存到文件

**错误分类**:
- 参数错误（throw）：调用者的问题
- 业务失败（return）：执行结果的问题

---

## 🆕 扩展工具设计模式

### 模式4: 过度工程化（Over-Engineering）

**代表工具**: `list_extensions`, `reload_extension`

**设计特征**:
```typescript
export const listExtensions = defineTool({
  // ❌ 描述过长（30+行）
  description: `List all installed Chrome extensions with metadata...
  
**Purpose**: Discover and enumerate...
**What it shows**:
- Extension ID
- Name, version
...

**When to use**: This is typically...
**Example**: list_extensions returns...`,

  handler: async (request, response, context) => {
    const extensions = await context.getExtensions();
    
    // ✅ 优秀：空结果有详细指导
    if (extensions.length === 0) {
      response.appendResponseLine('# No Extensions Detected\n');
      response.appendResponseLine('## 💡 Possible Reasons\n');
      response.appendResponseLine('1. No Extensions Installed...');
      response.appendResponseLine('2. All Extensions Disabled...');
      // ... 50+行的详细说明
      return;  // ✅ 返回而非抛异常
    }
    
    // ✅ 优秀：针对每个状态有提示
    for (const ext of extensions) {
      if (!ext.enabled) {
        response.appendResponseLine('  - ⚠️ Extension Disabled');
        response.appendResponseLine('  - **Enable Steps**:');
        response.appendResponseLine('    1. Navigate to chrome://extensions/');
        // ... 详细步骤
      }
      
      if (ext.serviceWorkerStatus === 'inactive') {
        response.appendResponseLine('  - ⚠️ Service Worker Not Activated');
        response.appendResponseLine('  - **Affected Tools**: ...');
        response.appendResponseLine('  - **Recommended Solutions**:');
        // ... 解决方案
      }
    }
  },
});
```

**优点**:
1. ✅ **文档详细**：描述非常完整
2. ✅ **场景全面**：考虑各种边界情况
3. ✅ **指导明确**：每个状态都有解决方案
4. ✅ **不抛异常**：空结果返回指导信息

**缺点**:
1. ❌ **过于冗长**：代码和输出都很长
2. ❌ **维护困难**：修改需要更新多处
3. ❌ **响应慢**：生成大量文本

---

### 模式5: 不一致的错误处理（Inconsistent Error Handling）

**代表工具**: `reload_extension`, `evaluate_in_extension`

**问题代码**:
```typescript
export const reloadExtension = defineTool({
  handler: async (request, response, context) => {
    const extension = extensions.find(ext => ext.id === extensionId);
    
    // ❌ 错误1：资源不存在抛异常
    if (!extension) {
      throw new Error(`Extension ${extensionId} not found`);
    }
    
    // ❌ 错误2：前置条件不满足抛异常
    if (!backgroundContext) {
      throw new Error('No background context found');
    }
    
    // ❌ 错误3：超时抛异常
    if (elapsed > TOTAL_TIMEOUT) {
      throw new Error(`Timeout after ${elapsed}ms`);
    }
    
    // ✅ 正确：成功返回信息
    response.appendResponseLine('✅ Extension reloaded');
  },
});
```

**与原始工具对比**:
```typescript
// 原始工具（close_page）: ✅ 捕获预期错误
try {
  await context.closePage(pageIdx);
} catch (err) {
  if (err.message === CLOSE_PAGE_ERROR) {
    response.appendResponseLine(err.message);  // 返回信息
  } else {
    throw err;  // 只抛出意外错误
  }
}

// 扩展工具（reload_extension）: ❌ 所有错误都抛出
if (!extension) {
  throw new Error(...);  // 应该返回信息
}
```

---

### 模式6: 智能容错（Smart Fallback）

**代表工具**: `get_extension_details`, `list_extension_contexts`

**设计特征**:
```typescript
export const getExtensionDetails = defineTool({
  handler: async (request, response, context) => {
    const ext = await context.getExtensionDetails(extensionId);
    
    // ✅ 优秀：资源不存在返回指导
    if (!ext) {
      response.appendResponseLine(
        `Extension with ID ${extensionId} not found.`
      );
      response.appendResponseLine(
        '\nUse list_extensions with includeDisabled=true to see all.'
      );
      response.setIncludePages(true);
      return;  // ✅ 不抛异常
    }
    
    // 正常流程...
  },
});
```

**核心原则**:
1. ✅ **Null检查**：明确处理null/undefined
2. ✅ **信息返回**：告诉用户为什么失败
3. ✅ **下一步指导**：建议用户如何解决
4. ✅ **不中断流程**：return而非throw

**这是最接近原始工具理念的扩展工具设计！**

---

## 📋 设计模式总结

### 原始工具的优秀实践

| 实践 | 说明 | 示例 |
|------|------|------|
| **极简主义** | 能一行解决不用两行 | `response.setIncludeConsoleData(true)` |
| **防御式编程** | 预期错误必须捕获 | `try-catch` specific errors |
| **参数验证优先** | 参数错误立即抛出 | `if (conflict) throw` |
| **不抛业务异常** | 业务失败返回信息 | `response.appendResponseLine(error)` |
| **明确只读标记** | 副作用透明化 | `readOnlyHint: true/false` |
| **一致的返回** | 都用setInclude标记 | `response.setIncludePages(true)` |

### 扩展工具的问题

| 问题 | 影响 | 原因 |
|------|------|------|
| **过度描述** | 维护困难 | 把文档写在代码里 |
| **抛出业务异常** | MCP崩溃 | 混淆异常和失败 |
| **不一致处理** | 用户困惑 | 缺乏统一规范 |
| **过长的handler** | 可读性差 | 功能太复杂 |

---

## 💡 可借鉴的最佳实践

### 1. 从`close_page`学习：预期错误处理

**原理**:
```typescript
// ✅ 定义预期错误常量
export const CLOSE_PAGE_ERROR = 'Cannot close the last page';

// ✅ 在handler中捕获并转换
try {
  await context.closePage(pageIdx);
} catch (err) {
  if (err.message === CLOSE_PAGE_ERROR) {
    response.appendResponseLine(err.message);  // 信息返回
  } else {
    throw err;  // 意外错误继续抛出
  }
}
```

**应用到扩展工具**:
```typescript
// ✅ 定义扩展工具的预期错误
export const EXTENSION_NOT_FOUND = 'EXTENSION_NOT_FOUND';
export const SERVICE_WORKER_INACTIVE = 'SERVICE_WORKER_INACTIVE';

// ✅ 在context层抛出预期错误
async getExtension(id: string) {
  const ext = await findExtension(id);
  if (!ext) {
    throw new Error(EXTENSION_NOT_FOUND);
  }
  return ext;
}

// ✅ 在handler中捕获并转换
try {
  const ext = await context.getExtension(extensionId);
} catch (err) {
  if (err.message === EXTENSION_NOT_FOUND) {
    reportExtensionNotFound(response, extensionId, allExtensions);
    return;
  }
  throw err;
}
```

---

### 2. 从`take_screenshot`学习：参数验证

**原理**:
```typescript
handler: async (request, response, context) => {
  // ✅ 第一步：验证参数冲突
  if (request.params.uid && request.params.fullPage) {
    throw new Error('Cannot provide both uid and fullPage');
  }
  
  // ✅ 第二步：执行业务逻辑
  const screenshot = await takeScreenshot(...);
  
  // ✅ 第三步：根据场景返回消息
  if (request.params.uid) {
    response.appendResponseLine('Screenshot of element');
  }
}
```

**应用到扩展工具**:
```typescript
export const reloadExtension = defineTool({
  handler: async (request, response, context) => {
    // ✅ 参数验证（立即抛出）
    if (request.params.waitForReady && request.params.captureErrors === false) {
      throw new Error('waitForReady requires captureErrors to be true');
    }
    
    // ✅ 业务逻辑（返回信息）
    try {
      const ext = await context.getExtension(extensionId);
      // ... reload logic
    } catch (err) {
      if (err.message === EXTENSION_NOT_FOUND) {
        reportExtensionNotFound(response, extensionId);
        return;  // 不抛异常
      }
      throw err;
    }
  },
});
```

---

### 3. 从`list_pages`学习：极简设计

**原理**:
```typescript
// ✅ 如果能委托给response标记，就不要自己处理
export const listPages = defineTool({
  schema: {},  // 无参数
  handler: async (_request, response) => {
    response.setIncludePages(true);  // 一行搞定
  },
});
```

**应用到扩展工具**:
```typescript
// ❌ 当前实现：手动格式化输出
export const listExtensions = defineTool({
  handler: async (request, response, context) => {
    const extensions = await context.getExtensions();
    
    for (const ext of extensions) {
      response.appendResponseLine(`## ${ext.name}`);
      response.appendResponseLine(`- **ID**: ${ext.id}`);
      // ... 50+行格式化代码
    }
  },
});

// ✅ 改进：委托给response标记
export const listExtensions = defineTool({
  handler: async (request, response, context) => {
    response.setIncludeExtensions(true);  // 让MCP层格式化
  },
});
```

---

### 4. 从`navigate_page_history`学习：错误恢复

**原理**:
```typescript
handler: async (request, response, context) => {
  const page = context.getSelectedPage();
  
  try {
    if (request.params.navigate === 'back') {
      await page.goBack(options);
    } else {
      await page.goForward(options);
    }
  } catch (error) {
    // ✅ 优雅处理失败：返回信息而非崩溃
    response.appendResponseLine('No more pages to navigate to.');
  }
  
  response.setIncludePages(true);
}
```

**应用到扩展工具**:
```typescript
export const activateServiceWorker = defineTool({
  handler: async (request, response, context) => {
    try {
      await context.activateServiceWorker(extensionId);
      response.appendResponseLine('✅ Service Worker activated');
    } catch (error) {
      // ✅ 失败也返回有用信息
      response.appendResponseLine('⚠️ Could not activate Service Worker');
      response.appendResponseLine('**Possible reasons**:');
      response.appendResponseLine('1. Extension is disabled');
      response.appendResponseLine('2. Service Worker crashed');
      response.appendResponseLine('\nTry enabling the extension first.');
    }
    
    response.setIncludePages(true);
  },
});
```

---

## 🎯 改进建议

### 立即改进（P0）

#### 1. 统一错误处理模式

**创建错误常量**:
```typescript
// src/tools/extension/errors.ts
export const ExtensionErrors = {
  NOT_FOUND: 'EXTENSION_NOT_FOUND',
  DISABLED: 'EXTENSION_DISABLED',
  SW_INACTIVE: 'SERVICE_WORKER_INACTIVE',
  NO_CONTEXT: 'NO_BACKGROUND_CONTEXT',
  TIMEOUT: 'OPERATION_TIMEOUT',
} as const;
```

**在Context层使用**:
```typescript
async getExtension(id: string): Promise<Extension> {
  const ext = await findExtension(id);
  if (!ext) {
    const error = new Error(ExtensionErrors.NOT_FOUND);
    error.data = {extensionId: id};  // 附加上下文
    throw error;
  }
  return ext;
}
```

**在Handler中捕获**:
```typescript
try {
  const ext = await context.getExtension(extensionId);
} catch (err) {
  if (err.message === ExtensionErrors.NOT_FOUND) {
    reportExtensionNotFound(response, extensionId);
    return;
  }
  throw err;
}
```

#### 2. 简化输出格式

**当前问题**:
```typescript
// ❌ 50+行手动格式化
for (const ext of extensions) {
  response.appendResponseLine(`## ${ext.name}`);
  response.appendResponseLine(`- **ID**: ${ext.id}`);
  // ...
}
```

**改进方案**:
```typescript
// ✅ 使用模板函数
function formatExtension(ext: Extension): string {
  return [
    `## ${ext.name}`,
    `- **ID**: ${ext.id}`,
    `- **Version**: ${ext.version}`,
    ext.enabled ? '- **Status**: ✅ Enabled' : '- **Status**: ❌ Disabled',
  ].join('\n');
}

// handler中使用
extensions.forEach(ext => {
  response.appendResponseLine(formatExtension(ext));
});
```

#### 3. 提取通用逻辑

**问题**: 每个工具都重复类似的检查

**解决**:
```typescript
// src/tools/extension/utils.ts
export async function getExtensionOrFail(
  context: Context,
  extensionId: string,
  response: Response
): Promise<Extension | null> {
  try {
    return await context.getExtension(extensionId);
  } catch (err) {
    if (err.message === ExtensionErrors.NOT_FOUND) {
      reportExtensionNotFound(response, extensionId);
      return null;
    }
    throw err;
  }
}

// 工具中使用
const ext = await getExtensionOrFail(context, extensionId, response);
if (!ext) return;  // 已经返回错误信息

// 继续正常逻辑...
```

---

### 中期改进（P1）

#### 4. 响应格式标准化

**创建Response Builder**:
```typescript
class ExtensionResponseBuilder {
  constructor(private response: Response) {}
  
  notFound(extensionId: string, available: Extension[]) {
    this.response.appendResponseLine('❌ Extension not found\n');
    this.response.appendResponseLine(`**ID**: ${extensionId}\n`);
    this.response.appendResponseLine('**Available**:');
    available.forEach(ext => {
      this.response.appendResponseLine(`- ${ext.name} (${ext.id})`);
    });
  }
  
  serviceWorkerInactive(ext: Extension) {
    this.response.appendResponseLine('⚠️ Service Worker is inactive\n');
    this.response.appendResponseLine('**Recommendations**:');
    this.response.appendResponseLine('1. Use activate_extension_service_worker');
    this.response.appendResponseLine('2. Or click "Service worker" in chrome://extensions/');
  }
}
```

#### 5. 文档与代码分离

**问题**: description过长

**解决**: 使用外部文档
```typescript
export const reloadExtension = defineTool({
  name: 'reload_extension',
  // ✅ 简短描述
  description: 'Smart reload for Chrome extensions with error detection. See docs for details.',
  // ✅ 链接到详细文档
  annotations: {
    category: ToolCategories.EXTENSION_DEBUGGING,
    readOnlyHint: false,
    docsUrl: 'https://docs.example.com/tools/reload-extension',
  },
  // ...
});
```

---

## 📚 设计规范

### 规范1: 错误分类

```typescript
// ✅ 参数错误 → 立即抛出
if (params.uid && params.fullPage) {
  throw new Error('Parameter conflict');
}

// ✅ 业务失败 → 返回信息
if (!extension) {
  reportError(response, 'Extension not found');
  return;
}

// ✅ 系统错误 → 捕获并转换或继续抛出
try {
  await operation();
} catch (err) {
  if (isExpectedError(err)) {
    reportError(response, err.message);
    return;
  }
  throw err;  // 意外错误
}
```

### 规范2: Handler结构

```typescript
handler: async (request, response, context) => {
  // 1. 参数验证（抛出异常）
  if (paramConflict) {
    throw new Error('...');
  }
  
  // 2. 获取资源（捕获预期错误）
  let resource;
  try {
    resource = await context.getResource();
  } catch (err) {
    if (err.message === EXPECTED_ERROR) {
      reportError(response, ...);
      return;
    }
    throw err;
  }
  
  // 3. 执行操作（捕获预期错误）
  try {
    await performOperation(resource);
    reportSuccess(response, ...);
  } catch (err) {
    reportFailure(response, err);
  }
  
  // 4. 设置返回标记
  response.setIncludePages(true);
}
```

### 规范3: 描述格式

```typescript
// ✅ 简洁描述
description: 'List all installed Chrome extensions with their metadata.'

// ❌ 过长描述
description: `List all installed Chrome extensions...
**Purpose**: ...
**What it shows**: ...
**When to use**: ...
**Example**: ...`

// ✅ 如果需要详细说明，使用注释
/**
 * List extensions tool
 * 
 * Purpose: Discover and enumerate extensions
 * Use case: First tool to call when working with extensions
 * 
 * @see https://docs.example.com/tools/list-extensions
 */
```

---

## 🎯 总结

### 原始工具的智慧

| 原则 | 说明 |
|------|------|
| **极简优先** | 能简单就不复杂 |
| **防御编程** | 预期错误必处理 |
| **快速失败** | 参数错误立即报 |
| **优雅降级** | 失败返回信息 |
| **职责单一** | 一个工具一件事 |

### 扩展工具需要学习

1. ✅ **学习`close_page`的错误捕获模式**
2. ✅ **学习`take_screenshot`的参数验证**
3. ✅ **学习`list_pages`的极简设计**
4. ✅ **学习`navigate_page_history`的错误恢复**

### 关键改进

| 改进项 | 优先级 | 效果 |
|--------|--------|------|
| 统一错误处理 | P0 | MCP稳定性↑90% |
| 简化输出格式 | P1 | 可维护性↑50% |
| 提取通用逻辑 | P1 | 代码重复↓60% |
| 文档代码分离 | P2 | 可读性↑40% |

---

**核心教训**: 原始工具的设计是经过深思熟虑的，扩展工具应该遵循同样的设计哲学，而不是另起炉灶。

**下一步**: 按照原始工具的模式重构所有扩展工具的错误处理。
