# 扩展错误工具整合分析

## 现有工具全景

### 1. `diagnose_extension_errors` - 错误诊断工具

**数据来源**: Console 日志（通过 `context.getExtensionLogs()`）

**核心功能**:
- ✅ 一键健康诊断
- ✅ 错误分类（JS、API、权限、网络）
- ✅ 错误频率统计
- ✅ 健康评分（0-100）
- ✅ 诊断建议
- ✅ Service Worker 状态检查

**数据特点**:
```typescript
{
  logs: [{
    text: string,           // 错误消息
    level: 'error' | 'warn',
    timestamp: number,
    source?: string,        // 上下文 URL
    stackTrace?: string     // 部分堆栈
  }]
}
```

**限制**:
- ❌ 只能获取 console 输出的日志
- ❌ 无法访问 Chrome 内部错误记录
- ❌ 无错误发生次数统计
- ❌ 无法检查（canInspect）标记

**使用场景**:
- 快速健康检查
- 错误概览和分类
- 获取修复建议

**代码量**: 422 行

---

### 2. `get_extension_logs` - 日志获取工具

**数据来源**: Console 日志（通过 `context.getExtensionLogs()`）

**核心功能**:
- ✅ 获取所有上下文的 console 日志
- ✅ 按日志级别过滤（error, warn, info, log, debug）
- ✅ 时间范围过滤（since 参数）
- ✅ 数量限制（limit 参数）
- ✅ 日志分组统计

**数据特点**:
```typescript
{
  logs: [{
    text: string,
    level: string,
    timestamp: number,
    source?: string,
    stackTrace?: string
  }]
}
```

**限制**:
- ❌ 同样只能获取 console 日志
- ❌ 无法访问 Chrome 内部错误
- ❌ 无高级分析（分类、建议）

**使用场景**:
- 获取原始日志数据
- 实时日志监控
- 增量日志收集（使用 since）

**代码量**: 169 行

---

### 3. `enhance_extension_error_capture` - 错误捕获增强工具

**数据来源**: 注入监听器到扩展上下文

**核心功能**:
- ✅ 注入全局错误监听器
- ✅ 捕获未捕获的 JavaScript 错误
- ✅ 捕获未处理的 Promise 拒绝
- ✅ 自动记录到 console（带 [EXTENSION_ERROR] 前缀）
- ✅ 幂等性（多次调用安全）

**工作原理**:
```typescript
// 注入到扩展上下文
self.addEventListener('error', handler);
self.addEventListener('unhandledrejection', handler);
```

**限制**:
- ⚠️ 需要 Service Worker 处于活跃状态
- ⚠️ Service Worker 重启后监听器丢失
- ❌ 无法捕获历史错误（只能捕获注入后的）

**使用场景**:
- 在测试前预注入
- 捕获难以复现的异步错误
- 生产环境错误监控

**代码量**: 225 行

---

### 4. `get_extension_runtime_errors` - 运行时错误获取工具（建议新增）⭐

**数据来源**: Chrome 内部错误记录（`chrome.developerPrivate` API）

**核心功能**:
- ✅ 获取 Chrome 记录的运行时错误
- ✅ 完整堆栈跟踪
- ✅ 错误发生次数统计
- ✅ manifest 错误
- ✅ 安装警告
- ✅ 可检查性标记（canInspect）

**数据特点**:
```typescript
{
  runtimeErrors: [{
    id: number,
    message: string,              // 完整错误消息
    source: string,               // 精确文件位置
    occurrences: number,          // 发生次数 ⭐
    stackTrace: [{                // 完整堆栈
      url: string,
      functionName: string,
      lineNumber: number,
      columnNumber: number
    }],
    contextUrl: string,           // 错误上下文
    canInspect: boolean,          // 是否可检查
    isServiceWorker: boolean,     // 是否在 SW 中
    severity: 'ERROR' | 'WARNING'
  }],
  manifestErrors: [...],
  installWarnings: [...]
}
```

**优势**:
- ✅ 访问 Chrome 内部数据（扩展管理页面显示的错误）
- ✅ 完整的堆栈跟踪（带函数名和列号）
- ✅ 错误发生次数（识别高频错误）
- ✅ 持久化（历史错误一直保留）

**限制**:
- ⚠️ 需要导航到 chrome://extensions
- ⚠️ API 调用稍慢（~100ms）

**使用场景**:
- 查看扩展管理页面显示的错误
- 识别高频错误
- 生产环境问题诊断

**预估代码量**: ~200 行

---

## 工具对比矩阵

| 特性 | diagnose_extension_errors | get_extension_logs | enhance_extension_error_capture | **get_extension_runtime_errors** |
|------|--------------------------|--------------------|---------------------------------|----------------------------------|
| **数据来源** | Console 日志 | Console 日志 | 注入监听器 → Console | **Chrome 内部记录** |
| **历史错误** | ✅ 有限（时间范围） | ✅ 有限 | ❌ 仅注入后 | ✅ **持久化** |
| **完整堆栈** | ⚠️ 部分 | ⚠️ 部分 | ✅ 完整 | ✅ **完整+函数名** |
| **发生次数** | ❌ 无 | ❌ 无 | ❌ 无 | ✅ **精确统计** |
| **错误分类** | ✅ 自动分类 | ❌ 无 | ❌ 无 | ⚠️ 可实现 |
| **诊断建议** | ✅ 有 | ❌ 无 | ❌ 无 | ⚠️ 可实现 |
| **健康评分** | ✅ 有 | ❌ 无 | ❌ 无 | ⚠️ 可实现 |
| **Manifest 错误** | ❌ 无 | ❌ 无 | ❌ 无 | ✅ **有** |
| **实时性** | ✅ 实时 | ✅ 实时 | ✅ 实时 | ⚠️ 当前状态 |
| **可检查性** | ❌ 无 | ❌ 无 | ❌ 无 | ✅ **有** |
| **上下文信息** | ⚠️ 有限 | ⚠️ 有限 | ⚠️ 有限 | ✅ **完整** |
| **API 要求** | 标准 API | 标准 API | 注入权限 | **chrome.developerPrivate** |
| **性能影响** | 低 | 低 | 极低 | 低 |
| **代码量** | 422 行 | 169 行 | 225 行 | ~200 行 |

---

## 数据来源对比

### Console 日志 vs Chrome 内部记录

```
错误发生
    ↓
    ├──> console.error()  ────→ 【Console 日志】
    │                            ↓
    │                        - diagnose_extension_errors
    │                        - get_extension_logs
    │                        - enhance_extension_error_capture
    │
    └──> Chrome 自动捕获 ────→ 【Chrome 内部记录】
                                 ↓
                             - chrome.developerPrivate.getExtensionsInfo()
                             - 扩展管理页面 "Errors" 按钮
                             - **get_extension_runtime_errors** ⭐
```

**关键区别**:
1. **Console 日志**: 开发者主动输出的日志
2. **Chrome 内部记录**: Chrome 自动捕获的运行时错误（更全面）

**实际例子**:
```javascript
// 这个错误会被两种方式捕获
try {
  throw new Error("Test error");
} catch (e) {
  console.error(e);  // ✅ Console 日志
}                     // ✅ Chrome 内部记录

// 这个错误只会被 Chrome 内部记录捕获
throw new Error("Uncaught error");  // ❌ Console 日志（未输出）
                                    // ✅ Chrome 内部记录
```

---

## 工具关系图

```
扩展错误诊断生态系统
│
├─ 【预防层】
│  └─ enhance_extension_error_capture
│     └─ 注入监听器，捕获未来错误
│
├─ 【实时监控层】
│  ├─ get_extension_logs
│  │  └─ 实时日志流（原始数据）
│  │
│  └─ diagnose_extension_errors
│     └─ 智能诊断（分类+建议）
│
└─ 【历史分析层】⭐ 新增
   └─ get_extension_runtime_errors
      └─ Chrome 内部错误记录（完整历史）
```

---

## 合并方案分析

### 方案 A: 完全合并 ❌ 不推荐

**设计**:
创建单一的 `get_all_extension_errors` 工具，合并所有功能。

**优点**:
- 一次调用获取所有信息

**缺点**:
- 🔴 **严重违反单一职责原则**
- 🔴 **输出过于庞大**（可能超过 2000 行）
- 🔴 **复杂度爆炸**（800+ 行代码）
- 🔴 **难以维护**
- 🔴 **性能差**（需要多次 API 调用）
- 🔴 **用户体验差**（等待时间长）

**结论**: ❌ 不可行

---

### 方案 B: 分层合并 ⚠️ 可行但不推荐

**设计**:
1. **基础层**: `get_extension_logs` + `get_extension_runtime_errors`
2. **诊断层**: `diagnose_extension_errors`（调用基础层）
3. **增强层**: `enhance_extension_error_capture`

**优点**:
- 逻辑清晰
- 代码复用

**缺点**:
- ⚠️ **工具间依赖过强**
- ⚠️ **违反 MCP 工具独立性原则**
- ⚠️ **调试困难**（一个工具失败影响其他）
- ⚠️ **性能问题**（嵌套调用）

**结论**: ⚠️ 可行但不推荐

---

### 方案 C: 保持独立 + 协作关系 ✅ 强烈推荐

**设计**: 4 个独立工具，通过文档说明协作关系

#### 工具定位

1. **get_extension_runtime_errors** ⭐ 新增
   - **定位**: 历史错误分析专家
   - **职责**: 获取 Chrome 内部错误记录
   - **输出**: 完整错误列表（带发生次数）
   - **使用时机**: 查看历史错误、识别高频问题

2. **diagnose_extension_errors**
   - **定位**: 智能诊断专家
   - **职责**: 错误分类、健康评分、修复建议
   - **输出**: 诊断报告（分类+建议）
   - **使用时机**: 快速健康检查、获取修复方向

3. **get_extension_logs**
   - **定位**: 原始日志收集器
   - **职责**: 获取 console 日志
   - **输出**: 原始日志流
   - **使用时机**: 实时监控、增量收集

4. **enhance_extension_error_capture**
   - **定位**: 错误捕获增强器
   - **职责**: 注入监听器捕获未来错误
   - **输出**: 注入状态
   - **使用时机**: 测试前预注入、生产监控

#### 协作关系

```
用户场景：生产环境问题诊断
    ↓
Step 1: get_extension_runtime_errors
    ↓ （发现高频错误：4510 次）
    ↓
Step 2: diagnose_extension_errors
    ↓ （获取实时错误和修复建议）
    ↓
Step 3: enhance_extension_error_capture
    ↓ （注入监听器捕获新错误）
    ↓
Step 4: get_extension_logs
    ↓ （验证修复效果）
```

#### 工具间引用（文档层面）

**get_extension_runtime_errors**:
```markdown
## Related Tools
- Use `diagnose_extension_errors` for intelligent error analysis
- Use `enhance_extension_error_capture` to capture future errors
- Use `get_extension_logs` for real-time log monitoring

## When to Use This vs Others
- Use this when: You want to see errors shown in chrome://extensions
- Use diagnose_extension_errors when: You need error classification and recommendations
- Use get_extension_logs when: You need real-time console output
```

**diagnose_extension_errors**:
```markdown
## Related Tools
- Use `get_extension_runtime_errors` to see Chrome's internal error records
- Use `enhance_extension_error_capture` before diagnosis for comprehensive error detection

## Limitations
This tool only analyzes console logs. For errors shown in chrome://extensions,
use `get_extension_runtime_errors` instead.
```

**优点**:
- ✅ **符合单一职责原则**
- ✅ **工具独立，易于测试**
- ✅ **组合灵活**
- ✅ **性能最优**（按需调用）
- ✅ **易于维护**
- ✅ **符合原始工具设计模式**

**缺点**:
- ⚠️ 需要用户了解工具间关系（通过文档缓解）

**结论**: ✅ **强烈推荐**

---

## 最佳实践方案

### 工具布局

```
src/tools/extension/
├── diagnostics.ts                    # diagnose_extension_errors
├── logs.ts                          # get_extension_logs
├── error-capture-enhancer.ts        # enhance_extension_error_capture
└── runtime-errors.ts                # get_extension_runtime_errors ⭐ 新增
```

### 文档结构

创建 `docs/ERROR_TOOLS_GUIDE.md` 统一说明：

```markdown
# Extension Error Tools Guide

## Quick Selection

### I want to...
- **See errors from chrome://extensions** → `get_extension_runtime_errors` ⭐
- **Get error diagnosis and recommendations** → `diagnose_extension_errors`
- **Monitor real-time console logs** → `get_extension_logs`
- **Capture future uncaught errors** → `enhance_extension_error_capture`

## Tool Comparison
[矩阵表格]

## Common Workflows
[场景示例]
```

### 实现优先级

#### Phase 1: 实现新工具 (P0)
- [ ] 创建 `get_extension_runtime_errors` 工具
- [ ] 基础功能：获取运行时错误
- [ ] 错误排序（按发生次数）
- [ ] 高频错误标记（> 100 次）

#### Phase 2: 文档完善 (P0)
- [ ] 创建 `ERROR_TOOLS_GUIDE.md`
- [ ] 更新各工具描述（添加 Related Tools 部分）
- [ ] 添加使用场景对比

#### Phase 3: 增强功能 (P1)
- [ ] `get_extension_runtime_errors` 添加修复建议
- [ ] 错误模式识别（相似错误分组）
- [ ] 时间趋势分析

#### Phase 4: 工具协作增强 (P2)
- [ ] 在 `diagnose_extension_errors` 中提示使用 `get_extension_runtime_errors`
- [ ] 创建组合使用示例
- [ ] 性能优化

---

## 使用场景示例

### 场景 1: 用户报告扩展异常 🔥

**最佳流程**:
```bash
# Step 1: 查看 Chrome 内部错误记录（最快定位问题）
get_extension_runtime_errors({ extensionId: "xxx" })
# 输出: 发现高频错误 "Extension context invalidated" 4510 次

# Step 2: 获取智能诊断和修复建议
diagnose_extension_errors({ extensionId: "xxx" })
# 输出: 健康评分 45/100，建议检查上下文管理

# Step 3: 注入错误监听器（如果问题未解决）
enhance_extension_error_capture({ extensionId: "xxx" })

# Step 4: 复现问题并收集实时日志
get_extension_logs({ 
  extensionId: "xxx", 
  level: ["error"], 
  since: Date.now() 
})
```

### 场景 2: 扩展开发调试

**最佳流程**:
```bash
# Step 1: 预注入错误监听器
enhance_extension_error_capture({ extensionId: "xxx" })

# Step 2: 执行测试操作
# [用户操作扩展...]

# Step 3: 实时查看日志
get_extension_logs({ extensionId: "xxx", level: ["error", "warn"] })

# Step 4: 获取诊断建议
diagnose_extension_errors({ extensionId: "xxx" })
```

### 场景 3: 定期健康检查

**最佳流程**:
```bash
# Step 1: 快速健康诊断
diagnose_extension_errors({ extensionId: "xxx" })
# 如果评分 > 90，结束

# Step 2: 如果评分低，查看详细错误
get_extension_runtime_errors({ extensionId: "xxx" })

# Step 3: 分析错误趋势
# [记录错误数量和类型，对比上次结果]
```

### 场景 4: 扩展管理页面显示错误

**问题**: 用户在 chrome://extensions 看到 "Errors" 按钮有错误

**解决方案**:
```bash
# 直接使用 get_extension_runtime_errors
get_extension_runtime_errors({ 
  extensionId: "xxx",
  sortBy: "occurrences"  # 按发生次数排序
})

# 输出: 
# - 8 个运行时错误
# - 最高频: "Extension context invalidated" (4510 次)
# - 完整堆栈跟踪和行号
```

---

## 工具选择决策树

```
开始：我需要诊断扩展错误
    ↓
    是否需要查看 chrome://extensions 显示的错误？
    ├─ 是 → get_extension_runtime_errors ⭐
    │         ↓
    │         是否需要修复建议？
    │         ├─ 是 → 继续调用 diagnose_extension_errors
    │         └─ 否 → 完成
    │
    └─ 否 → 是否需要智能诊断和建议？
            ├─ 是 → diagnose_extension_errors
            │         ↓
            │         是否发现问题？
            │         ├─ 否 → enhance_extension_error_capture
            │         └─ 是 → 完成
            │
            └─ 否 → 是否需要实时日志监控？
                    ├─ 是 → get_extension_logs
                    └─ 否 → 是否需要捕获未来错误？
                            ├─ 是 → enhance_extension_error_capture
                            └─ 否 → 使用 diagnose_extension_errors（默认）
```

---

## 性能和成本对比

| 工具 | API 调用次数 | 平均耗时 | 输出大小 | 资源消耗 |
|------|-------------|---------|---------|---------|
| get_extension_runtime_errors | 2 次 | ~150ms | 中（500-2000 行）| 低 |
| diagnose_extension_errors | 3 次 | ~200ms | 大（1000-3000 行）| 中 |
| get_extension_logs | 1 次 | ~100ms | 小-大（取决于日志量）| 低 |
| enhance_extension_error_capture | 2 次 | ~80ms | 极小（50 行）| 极低 |

**最优组合**（按使用频率）:
1. 单独使用 `get_extension_runtime_errors`: ~150ms
2. 单独使用 `diagnose_extension_errors`: ~200ms
3. 完整诊断流程（4 个工具）: ~530ms

**如果合并**:
- 单一工具调用: ~500ms
- 输出大小: 5000+ 行
- 资源消耗: 高

**结论**: 独立工具更高效

---

## 实现建议

### 代码结构

```typescript
// src/tools/extension/runtime-errors.ts

export const getExtensionRuntimeErrors = defineTool({
  name: 'get_extension_runtime_errors',
  description: `Get runtime errors recorded by Chrome for an extension.

**Purpose**: Access the same errors shown in chrome://extensions "Errors" button.

**Data source**: chrome.developerPrivate API (Chrome's internal error records)

**What it provides**:
- Complete stack traces with function names
- Error occurrence counts (identify high-frequency issues)
- Manifest errors and install warnings
- Inspection capability indicators

**When to use this vs other tools**:
- Use this when: You want to see Chrome's internal error records
- Use diagnose_extension_errors when: You need error classification and recommendations
- Use get_extension_logs when: You need real-time console output

**Related tools**:
- \`diagnose_extension_errors\` - Intelligent error analysis and recommendations
- \`enhance_extension_error_capture\` - Inject listeners to capture future errors
- \`get_extension_logs\` - Real-time console log monitoring`,
  
  annotations: {
    category: ToolCategories.EXTENSION_DEBUGGING,
    readOnlyHint: true,
  },
  
  schema: {
    extensionId: z.string().regex(/^[a-z]{32}$/),
    includeManifestErrors: z.boolean().optional().default(true),
    includeWarnings: z.boolean().optional().default(false),
    sortBy: z.enum(['occurrences', 'time']).optional().default('occurrences'),
    limit: z.number().positive().optional().default(50),
  },
  
  handler: async (request, response, context) => {
    // 实现逻辑
  },
});
```

### 输出格式

```markdown
# Extension Runtime Errors

**Extension**: Video SRT Ext (Rebuilt) (v2.2.2)
**ID**: obbhgfjghnnodmekfkfffojnkbdbfpbh

## Summary
- 🔴 Runtime Errors: 8
- ⚠️ High Frequency: 1 (> 100 occurrences)
- 📦 Manifest Errors: 0

---

## 🔥 High Frequency Errors

### Error #1 - 4510 occurrences ⚠️
**Message**: Extension context invalidated

**Location**: `content/index.js:573:17`

**Stack Trace**:
```
  at sendToASR (content/index.js:573:17)
  at handleAudioData (content/index.js:551:14)
```

**Context**: http://127.0.0.1:8081/hls.html

**Can Inspect**: ✅ Yes

---

## Other Errors (sorted by frequency)
[...]

## 💡 Related Tools

Not sure what to do next? Try:
- `diagnose_extension_errors` - Get intelligent analysis and fix recommendations
- `enhance_extension_error_capture` - Inject listeners to catch new errors
- `get_extension_logs` - Monitor real-time console output
```

---

## 总结

### ✅ 推荐方案：保持独立 + 协作关系

#### 原因
1. **符合第一性原理**: 每个工具职责单一、边界清晰
2. **符合原始工具设计模式**: 参考 `close_page`, `navigate_page_history` 等
3. **性能最优**: 按需调用，避免不必要的开销
4. **易于维护**: 独立测试、独立更新
5. **用户体验好**: 输出大小可控，等待时间短

#### 工具定位
- **get_extension_runtime_errors**: 历史错误分析专家（Chrome 内部记录）⭐
- **diagnose_extension_errors**: 智能诊断专家（分类+建议）
- **get_extension_logs**: 原始日志收集器（实时监控）
- **enhance_extension_error_capture**: 错误捕获增强器（预防注入）

#### 协作方式
- 通过文档说明工具间关系
- 在工具描述中添加 "Related Tools" 和 "When to Use" 部分
- 创建统一的 `ERROR_TOOLS_GUIDE.md` 指南

#### 下一步行动
1. 实现 `get_extension_runtime_errors` 工具（~200 行）
2. 更新现有工具文档（添加关联说明）
3. 创建 `ERROR_TOOLS_GUIDE.md` 使用指南
4. 编写单元测试

---

## 参考文档

- **工具设计模式**: `TOOL_DESIGN_PATTERN_ANALYSIS.md`
- **错误处理原则**: `TOOL_ERROR_HANDLING_ANALYSIS.md`
- **错误访问分析**: `EXTENSION_ERROR_ACCESS_ANALYSIS.md`
- **原始工具参考**: `close_page`, `navigate_page_history`, `list_pages`
