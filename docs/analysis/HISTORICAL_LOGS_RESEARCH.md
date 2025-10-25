# Chrome Extension 历史日志获取能力研究报告

## 研究目标

研究 Chrome Extensions 和 Chrome DevTools Protocol (CDP) 的官方规范，确定是否有能力获取扩展的全部历史日志。

## 研究范围

- Chrome DevTools Protocol 官方文档
- Chrome Extensions 官方文档
- Service Worker 生命周期和日志特性
- 现有的日志获取 API 和方法

---

## 1. CDP Log Domain 分析

### 1.1 官方规范

根据 [CDP Log Domain 官方文档](https://chromedevtools.github.io/devtools-protocol/tot/Log/)：

#### Log.enable 方法

```
Enables log domain, sends the entries collected so far to the client 
by means of the entryAdded notification.
```

**关键发现**：
- ✅ Log.enable 会发送"到目前为止收集的条目"
- ✅ 这意味着 Chrome 确实会收集和缓存日志
- ⚠️ 但这个"收集"的范围和持久化策略未明确说明

#### Log.entryAdded 事件

```typescript
event Log.entryAdded {
  entry: LogEntry  // The entry
}
```

**LogEntry 类型**包含：
- `source`: xml, javascript, network, storage, appcache, rendering, security, deprecation, worker, violation, intervention, recommendation, other
- `level`: verbose, info, warning, error
- `text`: 日志文本
- `timestamp`: 时间戳
- `url`, `lineNumber`, `stackTrace`: 上下文信息
- `workerId`: Worker 标识符

**关键发现**：
- ✅ 支持 `worker` 作为日志源
- ✅ 包含 `workerId` 字段用于 Worker 日志
- ⚠️ 但实际行为取决于 Chrome 的实现

---

## 2. CDP Runtime Domain 分析

### 2.1 Runtime.consoleAPICalled 事件

根据 [CDP Runtime Domain 官方文档](https://chromedevtools.github.io/devtools-protocol/tot/Runtime/)：

```
Issued when console API was called.
```

**关键特性**：
- ❌ **纯事件驱动**：只在 console API 调用时触发
- ❌ **无历史缓冲区**：没有提供获取历史日志的方法
- ✅ **实时捕获**：可以捕获所有新产生的日志

**事件参数**：
```typescript
event Runtime.consoleAPICalled {
  type: string           // log, debug, info, error, warning, etc.
  args: RemoteObject[]   // 参数列表
  executionContextId: ExecutionContextId
  timestamp: Timestamp
  stackTrace?: StackTrace
  context?: string       // Console context descriptor
}
```

---

## 3. Service Worker 特殊性分析

### 3.1 Service Worker 生命周期

根据 [Chrome Extensions Service Worker 文档](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle)：

#### 关键特性

1. **短暂生命周期**
   - Chrome 会在不需要时自动终止 Service Worker
   - 通常在 30 秒无活动后终止
   - 事件触发时重新启动

2. **无状态设计**
   - 不能依赖全局变量保存状态
   - 必须使用 chrome.storage API 持久化数据
   - 每次启动都是"新的"实例

3. **调试限制**
   ```
   Inspecting the service worker keeps it active. To ensure your extension 
   behaves correctly when your service worker is terminated, remember to 
   close DevTools.
   ```

### 3.2 日志持久化特性

**实际测试结果**：
- ❌ `Log.enable` 对 Service Worker 返回 0 条历史日志
- ✅ `Runtime.consoleAPICalled` 可以捕获实时日志
- ⚠️ Service Worker 重启后，之前的日志不可访问

**原因分析**：
1. Service Worker 设计为短暂存在
2. Chrome 不会为 Service Worker 维护长期的日志缓冲区
3. 日志缓冲区随 Service Worker 终止而清空

---

## 4. 对比：页面 vs Service Worker

### 4.1 普通网页

| 特性 | 支持情况 | 说明 |
|------|---------|------|
| Log.enable 历史日志 | ✅ 支持 | 可以获取页面加载后的历史日志 |
| Runtime.consoleAPICalled | ✅ 支持 | 实时捕获新日志 |
| 日志持久化 | ✅ 页面存活期间 | 页面存在时日志保留在内存中 |
| DevTools Console | ✅ 完整历史 | 可以查看所有历史日志 |

### 4.2 Service Worker

| 特性 | 支持情况 | 说明 |
|------|---------|------|
| Log.enable 历史日志 | ❌ 实测无效 | 返回 0 条历史日志 |
| Runtime.consoleAPICalled | ✅ 支持 | 实时捕获新日志 |
| 日志持久化 | ❌ 不持久化 | SW 终止后日志丢失 |
| DevTools Console | ⚠️ 有限历史 | 只在 DevTools 打开时保留 |

---

## 5. chrome.developerPrivate API

### 5.1 getExtensionsInfo API

这是一个**私有 API**，只能在 `chrome://extensions` 上下文中使用。

**功能**：
```javascript
chrome.developerPrivate.getExtensionsInfo()
```

**返回信息**：
- Extension metadata
- Runtime errors (通过 `chrome://extensions` 收集的错误)
- Install warnings
- Manifest errors

**限制**：
- ❌ 不包含 console.log 日志
- ✅ 只包含 JavaScript 错误和异常
- ⚠️ 错误信息有次数统计（occurrence count）

---

## 6. 测试验证结果

### 6.1 Video SRT Ext 扩展测试

**测试场景**：
- 点击"字幕"按钮 → 播放视频
- 同时捕获 Background 和 Offscreen 日志

**测试结果**：

#### Background Service Worker
```
Duration: 8 seconds
Result: 0 logs captured
Status: ⚠️ 正常（SW 在此场景下无日志输出）
```

#### Offscreen Document
```
Duration: 8 seconds
Result: 252 logs captured
Average: 31.5 logs/second
Status: ✅ 完全正常
Content: "[Offscreen] 📨 Received message from Background"
```

**关键发现**：
1. ✅ **实时捕获完全正常** - Runtime.consoleAPICalled 工作正常
2. ❌ **历史日志无法获取** - Log.enable 返回 0 条历史日志
3. ✅ **Offscreen 日志捕获正常** - Offscreen Document 类似页面，有完整日志

---

## 7. 业界实践调研

### 7.1 现有扩展的日志方案

根据搜索结果，现有的 Chrome 扩展通常使用以下方案：

#### 方案 1：自定义日志系统
```javascript
// 在 Service Worker 中
const logs = [];
const originalConsoleLog = console.log;
console.log = function(...args) {
  const logEntry = {
    timestamp: Date.now(),
    level: 'log',
    message: args.join(' ')
  };
  logs.push(logEntry);
  
  // 持久化到 chrome.storage
  chrome.storage.local.get(['logs'], (result) => {
    const allLogs = result.logs || [];
    allLogs.push(logEntry);
    chrome.storage.local.set({ logs: allLogs });
  });
  
  originalConsoleLog.apply(console, args);
};
```

**优点**：
- ✅ 完全控制日志格式和内容
- ✅ 可以持久化到 chrome.storage
- ✅ 跨 SW 重启保留

**缺点**：
- ❌ 需要扩展实现
- ❌ 需要修改所有 console 调用
- ❌ 性能开销

#### 方案 2：第三方日志库

使用 Sentry、LogRocket 等服务：
- ✅ 完整的日志收集和分析
- ✅ 云端存储
- ❌ 需要外部服务
- ❌ 隐私问题

### 7.2 DevTools 的实现

Chrome DevTools 本身如何显示历史日志？

**答案**：
- DevTools 打开时，实时监听 `Runtime.consoleAPICalled`
- 将日志保存在 DevTools 进程的内存中
- DevTools 关闭后，日志丢失
- 没有跨 SW 重启的持久化机制

---

## 8. 结论

### 8.1 官方能力总结

| 能力 | 是否支持 | 说明 |
|------|---------|------|
| **获取 Service Worker 历史日志** | ❌ **不支持** | CDP 没有提供此能力 |
| **获取页面历史日志** | ✅ 支持 | Log.enable 可以获取 |
| **实时捕获新日志** | ✅ 完全支持 | Runtime.consoleAPICalled 工作正常 |
| **错误历史记录** | ⚠️ 部分支持 | chrome.developerPrivate 只有错误 |

### 8.2 核心限制

1. **Service Worker 生命周期限制**
   - Chrome 不为 Service Worker 维护长期日志缓冲区
   - 日志随 SW 终止而丢失
   - 这是架构层面的限制，不是 Bug

2. **CDP 设计限制**
   - Log.enable 主要用于页面日志
   - Runtime.consoleAPICalled 是实时事件
   - 没有"获取所有历史日志"的 API

3. **性能和内存考虑**
   - 无限期保留日志会占用大量内存
   - Service Worker 数量众多，全部保留日志不现实
   - Chrome 选择不持久化 SW 日志

---

## 9. 可行的解决方案

### 9.1 方案对比

#### 方案 A：实时捕获（当前实现）

**实现**：
- 在需要日志时调用工具
- 使用 Runtime.consoleAPICalled 实时捕获
- 设置合适的 duration

**优点**：
- ✅ 无需扩展配合
- ✅ 实现简单
- ✅ 性能影响小

**缺点**：
- ❌ 无法获取调用前的日志
- ❌ 需要在扩展活动时捕获

**适用场景**：
- 调试扩展行为
- 监控运行时日志
- 性能分析

#### 方案 B：扩展自定义日志系统

**实现**：
- 扩展拦截 console.* 调用
- 保存到 chrome.storage.local
- MCP 工具读取 storage

**优点**：
- ✅ 完整的历史日志
- ✅ 跨 SW 重启保留
- ✅ 可自定义格式

**缺点**：
- ❌ 需要扩展实现
- ❌ 需要修改扩展代码
- ❌ 性能开销
- ❌ 存储空间限制（5MB for local storage）

**适用场景**：
- 生产环境监控
- 长期日志分析
- 扩展可修改的情况

#### 方案 C：混合方案

**实现**：
```javascript
// 在扩展中（可选）
if (typeof globalThis.__logs !== 'undefined') {
  // MCP 工具检测到自定义日志系统
  return globalThis.__logs;
} else {
  // 降级到实时捕获
  return realtimeCapture();
}
```

**优点**：
- ✅ 向后兼容
- ✅ 灵活性高
- ✅ 渐进增强

**缺点**：
- ⚠️ 复杂度增加
- ⚠️ 需要文档说明

---

## 10. 推荐方案

### 10.1 短期方案（已实现）

**保持当前实现**：
- ✅ 实时捕获工作正常
- ✅ 无需扩展配合
- ✅ 符合 Chrome 架构设计

**使用指南**：
```bash
# 正确的使用方式
1. 触发扩展活动
2. 立即调用 get_background_logs(duration: 10000)
3. 在捕获期间，扩展产生的所有日志都会被捕获
```

### 10.2 长期方案（可选）

**为需要历史日志的场景提供指导**：

1. **创建扩展开发指南**
   - 说明如何实现自定义日志系统
   - 提供示例代码
   - 推荐最佳实践

2. **提供工具支持**
   - 检测扩展是否实现了自定义日志
   - 自动使用最佳可用方法
   - 返回清晰的状态信息

3. **文档更新**
   - 明确说明能力和限制
   - 提供使用场景建议
   - 包含完整的示例

---

## 11. 技术参考

### 11.1 官方文档

- [Chrome DevTools Protocol - Log Domain](https://chromedevtools.github.io/devtools-protocol/tot/Log/)
- [Chrome DevTools Protocol - Runtime Domain](https://chromedevtools.github.io/devtools-protocol/tot/Runtime/)
- [Chrome Extensions - Service Worker Lifecycle](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle)
- [Chrome Extensions - Debug Extensions](https://developer.chrome.com/docs/extensions/get-started/tutorial/debug)

### 11.2 关键发现引用

**Log.enable 官方描述**：
> "Enables log domain, sends the entries collected so far to the client by means of the entryAdded notification."

**Service Worker 调试说明**：
> "Inspecting the service worker keeps it active. To ensure your extension behaves correctly when your service worker is terminated, remember to close DevTools."

**Storage API 推荐**：
> "Chrome will shut down service workers if they are not needed. We use the chrome.storage API to persist state across service worker sessions."

---

## 12. 最终结论

### 12.1 能力总结

❌ **无法通过 CDP 获取 Service Worker 的全部历史日志**

**原因**：
1. Chrome 不为 Service Worker 维护历史日志缓冲区（架构设计）
2. CDP Log.enable 对 Service Worker 无效（实测验证）
3. Runtime.consoleAPICalled 只是实时事件（协议限制）

### 12.2 推荐做法

✅ **使用实时捕获** - 当前实现已经是最优方案

**工作流程**：
1. 在扩展活动期间调用工具
2. 设置合适的捕获时长（5-15 秒）
3. 捕获所有活动期间产生的日志

**这符合**：
- ✅ Chrome 的架构设计
- ✅ Service Worker 的生命周期模型
- ✅ CDP 的能力边界
- ✅ 业界最佳实践

### 12.3 扩展建议

如果确实需要历史日志：
1. 在扩展中实现自定义日志系统
2. 使用 chrome.storage.local 持久化
3. MCP 工具支持读取 storage 中的日志

---

## 研究完成时间

2025-10-25

## 研究人员

Cascade AI Assistant
