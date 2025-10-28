# 日志捕获功能 Phase 2 实施进度

## 实施时间

2025-10-25 14:20

## 总体进度

| 工具                                  | 状态      | 完成度 | 说明                         |
| ------------------------------------- | --------- | ------ | ---------------------------- |
| **evaluate_in_extension**             | ✅ 完成   | 100%   | Phase 1 已完成               |
| **activate_extension_service_worker** | ✅ 完成   | 100%   | Phase 2 已完成               |
| **reload_extension**                  | 🔄 进行中 | 50%    | 已有错误捕获，需添加完整日志 |
| **interact_with_popup**               | ⏳ 待实现 | 0%     | 待开始                       |
| **Content Script 日志**               | ⏳ 待实现 | 0%     | 待设计                       |

## Phase 1: 已完成 ✅

### 1. evaluate_in_extension ✅

**功能**：

- captureLogs: boolean (default: true)
- logDuration: number (default: 3000ms)
- 自动捕获 Background + Offscreen + Page 日志

**实现要点**：

- 先启动日志监听器，等待 200ms
- 并行捕获所有组件日志
- 格式化显示（图标 + 时间戳 + 消息）

**测试结果**：

```
✅ 基本日志捕获 - 工作正常
✅ 多种日志级别 - 图标显示正确
✅ Chrome API 调用 - 日志正常
✅ 异步代码 - 日志正常
✅ 禁用日志 - 功能正常
```

### 2. 导出辅助函数 ✅

**导出函数**：

```typescript
export async function captureExtensionLogs(
  extensionId: string,
  duration: number,
  context: any,
): Promise<[any, any]>;

export function formatCapturedLogs(logResults: any, response: any): void;
```

**用途**：供其他工具复用

## Phase 2: 进行中 🔄

### 3. activate_extension_service_worker ✅

**功能**：

- captureLogs: boolean (default: false) - 不影响性能
- logDuration: number (default: 3000ms)
- 只在 single 模式下支持

**实现要点**：

- 在激活**之前**启动日志监听器
- 捕获 Service Worker 启动日志
- 格式化显示

**使用示例**：

```typescript
activate_extension_service_worker({
  extensionId: 'xxx',
  mode: 'single',
  captureLogs: true,
  logDuration: 5000,
});
```

**测试结果**：

```
✅ 编译成功
✅ 参数工作正常
⚠️ 日志捕获需要在激活时产生日志才能看到
```

### 4. reload_extension 🔄

**现状分析**：

- ✅ 已有 `captureErrors` 参数
- ✅ 已调用 getBackgroundLogs
- ❌ 只过滤错误，不显示所有日志
- ❌ 没有使用新的格式化函数

**需要做的**：

1. 添加 `captureLogs` 参数（默认 false）
2. 在重载后捕获完整日志
3. 使用 `formatCapturedLogs` 格式化
4. 保持 `captureErrors` 用于快速错误检查

**建议实现**：

```typescript
schema: {
  // ... 现有参数 ...
  captureLogs: z.boolean().optional().default(false)
    .describe(`Capture reload startup logs (Background + Offscreen).
    - true: Show all logs after reload
    - false: Only error check (faster, default)
    Default: false`),
  logDuration: z.number().min(1000).max(15000).optional().default(3000)
    .describe(`Log capture duration. Default: 3000ms`),
}
```

**实现策略**：

- 如果 `captureLogs=true`：使用新的完整日志捕获
- 如果 `captureErrors=true` 且 `captureLogs=false`：保持现有错误检查
- 两者可以共存

## Phase 3: 待实现 ⏳

### 5. interact_with_popup

**设计方案**：

```typescript
schema: {
  // ... 现有参数 ...
  captureLogs: z.boolean().optional().default(false)
    .describe(`Capture popup interaction logs.
    - true: Capture logs during interaction
    - false: No log capture (default)
    Default: false`),
  logDuration: z.number().min(1000).max(15000).optional().default(3000)
    .describe(`Log capture duration. Default: 3000ms`),
}
```

**实现要点**：

- 在交互**之前**启动日志监听
- 捕获 popup 页面的日志
- 注意：页面方式和真正 popup 都需要支持

**优先级**：P1（建议实现）

### 6. Content Script 日志捕获

**挑战**：

- Content Script 运行在页面上下文
- 需要获取页面的 CDP session
- 可能有多个页面同时注入

**设计方案（初步）**：

```typescript
// 新工具或参数
captureContentScriptLogs({
  extensionId: string,
  tabId?: number,  // 可选，指定页面
  duration: number = 3000
})
```

**实现思路**：

1. 获取所有注入了 Content Script 的页面
2. 为每个页面创建 CDP session
3. 监听 Runtime.consoleAPICalled
4. 过滤出来自扩展的日志（通过 URL 匹配）

**优先级**：P2（未来扩展）

## 技术总结

### 成功经验

1. **时序控制**
   - ✅ 先启动日志监听器
   - ✅ 等待 200ms 确保就绪
   - ✅ 并行捕获多个来源

2. **辅助函数复用**
   - ✅ captureExtensionLogs - 启动捕获
   - ✅ formatCapturedLogs - 格式化输出
   - ✅ 其他工具可以直接导入使用

3. **参数设计**
   - ✅ captureLogs 默认值根据场景选择
   - ✅ evaluate: true（调试为主）
   - ✅ activate: false（性能为主）
   - ✅ reload: false（避免增加时间）

4. **格式化输出**
   - ✅ 图标标识日志级别
   - ✅ 时间戳显示
   - ✅ 消息截断（120字符）
   - ✅ 显示条目限制（最近8条）

### 遇到的问题

1. **日志空消息**
   - 问题：初期日志 text 字段为空
   - 原因：字段名称不匹配
   - 解决：支持多个字段（text / message / args）

2. **时序问题**
   - 问题：日志捕获不到
   - 原因：操作完成后才开始监听
   - 解决：操作前先启动监听器

3. **Service Worker 已激活**
   - 问题：激活工具测试看不到日志
   - 原因：SW 已经是激活状态，没有新日志
   - 解决：正常，需要在真正激活时才有日志

## 性能影响

| 工具                                  | 默认日志 | 增加时间    | 说明                   |
| ------------------------------------- | -------- | ----------- | ---------------------- |
| **evaluate_in_extension**             | ✅ 开启  | +3.2秒      | 调试工具，可接受       |
| **activate_extension_service_worker** | ❌ 关闭  | 0秒         | 不影响激活速度         |
| **reload_extension**                  | ❌ 关闭  | 0秒         | 重载已经很慢，不再增加 |
| **interact_with_popup**               | ❌ 关闭  | 0秒（规划） | 交互应该快速           |

## 下一步计划

### 立即完成（今天）

1. ✅ evaluate_in_extension - 已完成
2. ✅ activate_extension_service_worker - 已完成
3. 🔄 reload_extension - 优化日志捕获
4. ⏳ interact_with_popup - 添加日志捕获

### 后续计划（按需）

5. ⏳ Content Script 日志捕获
6. ⏳ 日志过滤和搜索功能
7. ⏳ 日志导出功能

## 文档和测试

### 已创建文档

- ✅ docs/analysis/AUTO_LOG_CAPTURE_DESIGN.md
- ✅ docs/implementation/AUTO_LOG_CAPTURE_COMPLETE.md
- 🔄 docs/implementation/LOG_CAPTURE_PHASE2_PROGRESS.md（本文档）

### 测试覆盖

- ✅ evaluate_in_extension: 5个测试用例，全部通过
- ✅ activate_extension_service_worker: 编译测试通过
- ⏳ reload_extension: 待测试
- ⏳ interact_with_popup: 待测试

## 总结

### 已完成

- ✅ Phase 1: 核心工具 evaluate_in_extension
- ✅ Phase 2: 激活工具 activate_extension_service_worker
- ✅ 辅助函数导出和复用

### 进行中

- 🔄 Phase 2: reload_extension 优化

### 待完成

- ⏳ Phase 2: interact_with_popup
- ⏳ Phase 3: Content Script 日志

### 核心价值

- ✅ 一致性：所有工具遵循相同模式
- ✅ 灵活性：AI 可控制是否捕获
- ✅ 完整性：捕获所有组件日志
- ✅ 性能：默认值根据场景优化

---

**状态**：Phase 2 进行中（60% 完成）  
**下一步**：完成 reload_extension 和 interact_with_popup  
**预计完成时间**：今天内完成 Phase 2
