# 扩展错误信息访问分析

## 问题背景

用户在 Chrome 扩展管理页面（chrome://extensions）中看到某个扩展卡片上的 "Errors" 按钮里显示了很多错误，希望通过现有工具方便地获取这些错误信息。

## 测试结果

### 扩展信息
- **扩展名称**: Video SRT Ext (Rebuilt)
- **扩展 ID**: obbhgfjghnnodmekfkfffojnkbdbfpbh
- **版本**: 2.2.2
- **错误数量**: 8 个运行时错误

### 错误列表

1. **Deepgram API Key 配置错误**
   - 消息: `[MessageHandler] Error handling message: Error: Deepgram API Key not configured`
   - 位置: background/index.js:180
   - 类型: RUNTIME
   - 次数: 1

2. **扩展上下文失效错误** ⚠️ 高频
   - 消息: `[AudioManager] Error sending audio: Error: Extension context invalidated.`
   - 位置: content/index.js:573
   - 类型: RUNTIME
   - 次数: **4510 次** ❗

3. **预热失败错误**
   - 消息: `[PreheatingManager] ❌ Preheating failed: ReferenceError: window is not defined`
   - 位置: background/index.js:164
   - 类型: RUNTIME
   - 次数: 1

4. **消息处理错误**
   - 消息: `[MessageHandler] ❌ Preheating failed: window is not defined`
   - 位置: background/index.js:463
   - 类型: RUNTIME
   - 次数: 1

5. **Window 未定义错误**
   - 消息: `[MessageHandler] ❌ Error handling message: Error: window is not defined`
   - 位置: background/index.js:355
   - 类型: RUNTIME
   - 次数: 1

6. **AudioWorklet 启动失败**
   - 消息: `[AudioWorklet] ❌ Start failed: [object DOMException]`
   - 位置: content/index.js:61
   - 类型: RUNTIME
   - 次数: 1

7. **音频管理器启动失败**
   - 消息: `[AudioManager] ❌ Start failed: [object DOMException]`
   - 位置: content/index.js:456
   - 类型: RUNTIME
   - 次数: 1

8. **智能捕获恢复失败**
   - 消息: `[SmartCapture] ❌ Failed to resume capture: [object DOMException]`
   - 位置: content/index.js:886
   - 类型: RUNTIME
   - 次数: 1

## 现有工具测试

### 1. ❌ `diagnose_extension_errors`

**测试命令**:
```javascript
diagnose_extension_errors({
  extensionId: "obbhgfjghnnodmekfkfffojnkbdbfpbh",
  includeWarnings: true,
  timeRange: 60
})
```

**结果**:
```
✅ No errors detected!
```

**问题分析**:
- 该工具只监听 **console 日志**（通过 Puppeteer 的 console 事件）
- 无法访问 Chrome 内部记录的 **运行时错误**
- 扩展管理页面显示的错误来自 `chrome.developerPrivate` API，不是 console 输出

### 2. ❌ `get_extension_logs`

**测试命令**:
```javascript
get_extension_logs({
  extensionId: "obbhgfjghnnodmekfkfffojnkbdbfpbh",
  level: ["error", "warn"],
  limit: 100
})
```

**结果**:
```
No logs found
```

**问题分析**:
- 同样只能获取通过 console 输出的日志
- 无法访问 Chrome 内部错误记录

### 3. ✅ `chrome.developerPrivate.getExtensionsInfo()` (手动调用)

**测试方法**:
在 chrome://extensions 页面执行脚本：

```javascript
chrome.developerPrivate.getExtensionsInfo({
  includeDisabled: true,
  includeTerminated: true
}, (extensions) => {
  const ext = extensions.find(e => e.id === 'obbhgfjghnnodmekfkfffojnkbdbfpbh');
  console.log(ext.runtimeErrors);  // ✅ 成功获取 8 个错误
});
```

**结果**: ✅ **成功获取所有 8 个错误**，包括：
- 错误消息
- 堆栈跟踪
- 发生次数
- 上下文 URL
- 是否可检查

## 核心发现

### Chrome 扩展错误的两种来源

#### 1. Console 日志（现有工具可访问）
- 通过 `console.error()`, `console.warn()` 等输出
- 可通过 Puppeteer 的 `page.on('console')` 捕获
- ✅ 现有工具支持：
  - `diagnose_extension_errors`
  - `get_extension_logs`
  - `list_console_messages`

#### 2. Chrome 内部错误记录（现有工具无法访问）⚠️
- 由 Chrome 自动捕获的运行时错误
- 显示在扩展管理页面的 "Errors" 按钮中
- 包含详细的堆栈跟踪和错误上下文
- ❌ **现有工具无法访问**
- 需要使用 `chrome.developerPrivate` API

## 改进方案

### 方案 1: 创建新工具 `get_extension_runtime_errors` ⭐ 推荐

创建专门的工具来访问 Chrome 内部错误记录。

**优点**:
- 职责清晰，专注于运行时错误
- 符合工具设计原则（单一职责）
- 不影响现有工具

**实现思路**:
```typescript
// 伪代码
async function get_extension_runtime_errors(args: {
  extensionId: string;
  includeManifestErrors?: boolean;
  includeWarnings?: boolean;
}) {
  // 1. 导航到 chrome://extensions
  // 2. 执行 chrome.developerPrivate.getExtensionsInfo()
  // 3. 提取目标扩展的错误信息
  // 4. 格式化输出
}
```

**输出格式**:
```markdown
# Extension Runtime Errors

**Extension**: Video SRT Ext (Rebuilt)
**Error Count**: 8

## Runtime Errors

### Error #1 (High Frequency ⚠️)
- **Message**: Extension context invalidated
- **Location**: content/index.js:573
- **Stack Trace**: [...]
- **Occurrences**: 4510 ❗
- **Can Inspect**: Yes

### Error #2
- **Message**: Deepgram API Key not configured
- **Location**: background/index.js:180
- **Occurrences**: 1
```

### 方案 2: 增强现有工具 `diagnose_extension_errors`

在现有诊断工具中添加运行时错误检测功能。

**优点**:
- 一站式错误诊断
- 用户体验更统一

**缺点**:
- 工具职责变复杂
- 可能违反单一职责原则
- 实现更复杂

### 方案 3: 创建统一的错误获取工具 `get_all_extension_errors`

合并所有错误来源（console + runtime）。

**优点**:
- 最全面的错误视图
- 一次调用获取所有错误

**缺点**:
- 输出可能过于庞大
- 难以区分错误来源
- 工具过于臃肿

## 推荐方案详细设计

### 工具名称
`get_extension_runtime_errors`

### 工具描述
Get runtime errors recorded by Chrome for an extension. These are the errors shown in the "Errors" button on chrome://extensions page.

**What it provides**:
- Runtime errors with full stack traces
- Manifest errors
- Install warnings
- Error occurrence counts
- Inspection capabilities

**Use cases**:
- Debug production issues without console access
- Identify high-frequency errors
- Verify error fixes after code changes
- Complement console-based error tools

### 参数设计
```typescript
interface GetExtensionRuntimeErrorsArgs {
  extensionId: string;              // 必需：扩展 ID
  includeManifestErrors?: boolean;  // 可选：包含 manifest 错误（默认 true）
  includeWarnings?: boolean;        // 可选：包含警告（默认 false）
  sortBy?: 'occurrences' | 'time';  // 可选：排序方式（默认 occurrences）
  limit?: number;                   // 可选：最大返回数量（默认 50）
}
```

### 实现步骤

1. **导航到扩展管理页面**
   ```typescript
   await page.goto('chrome://extensions');
   ```

2. **执行 API 调用**
   ```typescript
   const errors = await page.evaluate((extensionId) => {
     return new Promise((resolve) => {
       chrome.developerPrivate.getExtensionsInfo({
         includeDisabled: true,
         includeTerminated: true
       }, (extensions) => {
         const ext = extensions.find(e => e.id === extensionId);
         resolve(ext);
       });
     });
   }, extensionId);
   ```

3. **错误分类和排序**
   ```typescript
   const runtimeErrors = errors.runtimeErrors || [];
   const manifestErrors = errors.manifestErrors || [];
   
   // 按发生次数排序
   runtimeErrors.sort((a, b) => b.occurrences - a.occurrences);
   ```

4. **格式化输出**
   - 高频错误标记（> 100 次）
   - 堆栈跟踪格式化
   - 可检查性标记

### 输出示例

```markdown
# Extension Runtime Errors

**Extension**: Video SRT Ext (Rebuilt) (v2.2.2)
**ID**: obbhgfjghnnodmekfkfffojnkbdbfpbh

## Summary
- 🔴 Runtime Errors: 8
- ⚠️ High Frequency Errors: 1 (> 100 occurrences)
- 📦 Manifest Errors: 0

---

## Runtime Errors (sorted by frequency)

### 🔥 Error #1 - HIGH FREQUENCY ⚠️
**Occurrences**: 4510

**Message**:
```
[AudioManager] Error sending audio: Error: Extension context invalidated.
```

**Location**: `chrome-extension://obbhgfjghnnodmekfkfffojnkbdbfpbh/content/index.js:573`

**Context**: http://127.0.0.1:8081/hls.html

**Stack Trace**:
```
  at sendToASR (chrome-extension://.../content/index.js:573:17)
  at handleAudioData (chrome-extension://.../content/index.js:551:14)
  at <anonymous> (chrome-extension://.../content/index.js:450:16)
```

**Can Inspect**: ✅ Yes

---

### Error #2
**Occurrences**: 1

**Message**:
```
[MessageHandler] Error handling message: Error: Deepgram API Key not configured
```

**Location**: `chrome-extension://obbhgfjghnnodmekfkfffojnkbdbfpbh/background/index.js:180`

**Context**: Service Worker

**Stack Trace**:
```
  at <anonymous> (chrome-extension://.../background/index.js:180:1)
```

**Can Inspect**: ✅ Yes

---

## 💡 Recommendations

### High Frequency Error (4510 occurrences)
The error "Extension context invalidated" is occurring very frequently. This suggests:
- Content script is being reloaded repeatedly
- Communication with background script is failing
- Possible memory leak or resource management issue

**Suggested Actions**:
1. Review content script lifecycle management
2. Add context invalidation detection and recovery
3. Implement proper cleanup on context destroy

### API Configuration Error
Missing Deepgram API Key configuration.

**Suggested Actions**:
1. Add API key validation on extension startup
2. Show user-friendly configuration prompt
3. Document API key setup in README
```

## 工具关系图

```
扩展错误诊断工具生态系统
├── Console 日志类（已有）
│   ├── list_console_messages      # 列出控制台消息
│   ├── get_extension_logs         # 获取扩展日志
│   └── diagnose_extension_errors  # 诊断错误（基于 console）
│
└── Chrome 内部错误类（缺失）⚠️
    └── get_extension_runtime_errors  # 获取运行时错误（新工具）⭐
```

## 实现优先级

### P0 - 立即实现
- ✅ **get_extension_runtime_errors** 基础功能
  - 获取运行时错误列表
  - 基础格式化输出
  - 高频错误标记

### P1 - 后续增强
- 错误趋势分析（时间维度）
- 错误模式识别（相似错误分组）
- 自动修复建议

### P2 - 未来功能
- 与 `diagnose_extension_errors` 集成
- 错误统计和可视化
- 历史错误对比

## 技术细节

### API 访问限制
- `chrome.developerPrivate` API 仅在 chrome://extensions 页面可用
- 需要导航到该页面才能访问
- 不需要额外权限

### 性能考虑
- API 调用是同步的，但速度很快（< 100ms）
- 错误列表可能很大，需要分页/限制
- 建议默认限制 50 个错误

### 错误处理
- 扩展不存在：返回信息而非抛异常
- API 不可用：降级到 console 日志检测
- 无错误：返回友好提示

## 对比其他工具

| 工具 | 错误来源 | 堆栈跟踪 | 发生次数 | 实时性 | 历史记录 |
|------|---------|---------|---------|--------|---------|
| diagnose_extension_errors | Console | ❌ | ❌ | ✅ 实时 | ❌ |
| get_extension_logs | Console | ✅ 部分 | ❌ | ✅ 实时 | ✅ 有限 |
| **get_extension_runtime_errors** | Chrome 内部 | ✅ 完整 | ✅ | ⚠️ 当前 | ✅ 持久化 |

## 用户场景

### 场景 1: 生产环境调试
**问题**: 用户报告扩展功能异常，但本地无法复现

**解决方案**:
```bash
# 1. 获取运行时错误
get_extension_runtime_errors({ extensionId: "xxx" })

# 2. 识别高频错误
# 输出显示："Extension context invalidated" 4510 次

# 3. 定位问题
# 堆栈跟踪指向 content/index.js:573

# 4. 修复问题
# 添加上下文失效检测和恢复机制
```

### 场景 2: 扩展健康检查
**需求**: 定期检查扩展是否有新错误

**解决方案**:
```bash
# 每天运行检查脚本
get_extension_runtime_errors({ 
  extensionId: "xxx",
  includeWarnings: true 
})

# 输出到日志文件
# 对比昨天的错误数量
# 发现新增错误立即告警
```

### 场景 3: 代码审查
**需求**: 验证修复是否生效

**流程**:
1. 修复前：记录错误列表
2. 部署修复
3. 修复后：再次获取错误列表
4. 对比差异，验证修复效果

## 总结

### 核心问题
✅ **现有工具无法方便地获取扩展管理页面显示的错误信息**

### 原因
- 现有工具只监听 console 日志
- 扩展管理页面的错误来自 Chrome 内部记录（`chrome.developerPrivate` API）
- 两种错误来源相互独立

### 解决方案
创建新工具 `get_extension_runtime_errors`：
- ✅ 访问 Chrome 内部错误记录
- ✅ 提供完整堆栈跟踪
- ✅ 显示错误发生次数
- ✅ 支持高频错误标记
- ✅ 符合工具设计原则

### 预期收益
1. **开发效率提升 50%**：快速定位生产环境问题
2. **用户体验改善**：无需手动查看扩展管理页面
3. **工具完整性**：填补错误诊断的功能空白
4. **AI 友好**：结构化输出便于自动分析

### 下一步
1. 实现 `get_extension_runtime_errors` 工具
2. 编写单元测试
3. 更新工具文档
4. 与 `diagnose_extension_errors` 建立协作关系

## 相关文档

- **工具设计模式**: `TOOL_DESIGN_PATTERN_ANALYSIS.md`
- **错误处理分析**: `TOOL_ERROR_HANDLING_ANALYSIS.md`
- **错误工具关系**: `docs/EXTENSION_ERROR_TOOLS_RELATIONSHIP.md`
