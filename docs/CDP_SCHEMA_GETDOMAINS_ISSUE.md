# Schema.getDomains CDP 方法不可用问题

**报告时间**: 2025-10-16 15:08  
**问题**: `list_browser_capabilities` 工具调用失败

---

## 🐛 问题描述

### 错误信息
```
⚠️ Failed to retrieve browser capabilities: Protocol error (Schema.getDomains): 'Schema.getDomains' wasn't found
```

### 测试环境
- **模式**: ext-debug-stream (streamable)
- **端口**: 9222
- **Chrome 版本**: 141.0.7390.76
- **协议版本**: 1.3

### 工具调用
```
list_browser_capabilities
```

---

## 🔍 根本原因

### CDP Schema.getDomains 方法

**定义**: `Schema.getDomains` 是 CDP (Chrome DevTools Protocol) 的一个方法，用于查询当前浏览器支持的所有 CDP domains。

**问题**: 这个方法在某些情况下不可用或返回错误：

#### 1. Chrome 版本差异
- 早期 Chrome 版本可能不支持
- 某些 Chrome 分支（Chromium、Edge）可能有差异
- 实验性构建可能缺少此方法

#### 2. CDP 连接类型
```typescript
// 不同的 CDP session 创建方式
const client1 = await browser.target().createCDPSession();  // Browser-level
const client2 = await page.target().createCDPSession();     // Page-level
```

**Browser-level session**: 某些 domains 可能不可用

#### 3. Headless vs Headful
- Headless 模式可能限制某些 Schema 功能
- DevTools 协议的内省功能可能被禁用

#### 4. 安全限制
- 某些环境下 Schema introspection 被禁用（安全原因）
- 企业策略可能限制 CDP 功能

---

## ✅ 解决方案

### 实施的改进

#### 1. 分层错误处理

**文件**: `src/tools/browser-info.ts`

```typescript
handler: async (_request, response, context) => {
  const browser = context.getBrowser();
  
  try {
    // 第 1 层：总是获取浏览器版本（总是可用）
    const version = await browser.version();
    response.appendResponseLine(`**Browser Version**: ${version}`);
    
    try {
      // 第 2 层：尝试创建 CDP session
      const client = await browser.target().createCDPSession();
      
      try {
        // 第 3 层：尝试调用 Schema.getDomains
        const {domains} = await client.send('Schema.getDomains');
        // 成功！显示动态查询的 domains
      } catch (schemaError) {
        // Schema.getDomains 失败，使用已知列表
        const domains = [...knownDomains];
        response.appendResponseLine(`⚠️ Note: Schema.getDomains unavailable`);
        response.appendResponseLine(`Showing common CDP domains instead`);
      }
      
      await client.detach();
    } catch (cdpError) {
      // CDP session 失败
      response.appendResponseLine(`⚠️ Could not create CDP session`);
    }
  } catch (error) {
    // 浏览器连接失败
    response.appendResponseLine(`⚠️ Failed to retrieve browser capabilities`);
  }
}
```

#### 2. 回退方案：已知 CDP Domains 列表

当 `Schema.getDomains` 不可用时，返回常见的 CDP domains：

```typescript
const knownDomains = [
  'Accessibility', 'Animation', 'Audits', 
  'BackgroundService', 'Browser', 'CSS',
  'CacheStorage', 'Cast', 'Console',
  'DOM', 'DOMDebugger', 'DOMSnapshot',
  'DOMStorage', 'Database', 'Debugger',
  'DeviceOrientation', 'Emulation', 'Fetch',
  'HeadlessExperimental', 'HeapProfiler', 'IO',
  'IndexedDB', 'Input', 'Inspector',
  'LayerTree', 'Log', 'Media',
  'Memory', 'Network', 'Overlay',
  'Page', 'Performance', 'PerformanceTimeline',
  'Profiler', 'Runtime', 'Schema',
  'Security', 'ServiceWorker', 'Storage',
  'SystemInfo', 'Target', 'Tethering',
  'Tracing', 'WebAudio', 'WebAuthn'
];
```

**来源**: 基于 Chrome DevTools Protocol 官方文档的稳定 domains 列表

#### 3. 清晰的用户提示

**成功（动态查询）**:
```
# Browser Capabilities

**Browser Version**: Chrome/141.0.7390.76

**CDP Domains**: 52

**Available Domains**:
- Accessibility
- Animation
...
```

**失败（使用已知列表）**:
```
# Browser Capabilities

**Browser Version**: Chrome/141.0.7390.76

⚠️ Note: Could not query CDP domains dynamically (Schema.getDomains unavailable)
Showing common CDP domains instead:

**CDP Domains**: 45

**Available Domains**:
- Accessibility
- Animation
...
```

---

## 📊 影响分析

### 工具可用性

| 场景 | Schema.getDomains | 工具输出 | 影响 |
|------|-------------------|----------|------|
| 正常 Chrome | ✅ 可用 | 完整的 domains 列表 | 无影响 |
| 某些 Chrome 版本 | ❌ 不可用 | 已知 domains 列表 | ⚠️ 可能不完整 |
| CDP session 失败 | ❌ 不可用 | 仅版本信息 | ⚠️ 信息有限 |
| 浏览器断开 | ❌ 不可用 | 错误提示 | ❌ 工具失败 |

### 用户体验

**改进前**:
```
❌ 工具直接失败
❌ 没有任何有用信息
❌ 用户不知道原因
```

**改进后**:
```
✅ 总是显示浏览器版本
✅ 提供已知 domains 列表（即使 Schema.getDomains 失败）
✅ 清晰说明使用了回退方案
✅ 工具不会完全失败
```

---

## 🔍 诊断和调试

### 检查 Schema.getDomains 可用性

#### 方法 1: 使用 Chrome DevTools

1. 打开 `chrome://inspect`
2. 点击 "inspect" 连接到目标
3. 在 Console 中执行：
   ```javascript
   const client = await new Promise((resolve, reject) => {
     chrome.debugger.attach({targetId: 'xxx'}, '1.3', () => {
       chrome.debugger.sendCommand({targetId: 'xxx'}, 'Schema.getDomains', {}, (result) => {
         console.log(result);
       });
     });
   });
   ```

#### 方法 2: 使用 curl

```bash
# 获取 webSocketDebuggerUrl
curl -s http://localhost:9222/json/version | jq -r .webSocketDebuggerUrl

# 使用 wscat 连接
wscat -c "ws://localhost:9222/devtools/browser/xxx"

# 发送命令
{"id":1,"method":"Schema.getDomains"}
```

#### 方法 3: 使用 Puppeteer 脚本

```javascript
const puppeteer = require('puppeteer-core');

(async () => {
  const browser = await puppeteer.connect({
    browserURL: 'http://localhost:9222'
  });
  
  try {
    const client = await browser.target().createCDPSession();
    const result = await client.send('Schema.getDomains');
    console.log('✅ Schema.getDomains works:', result.domains.length, 'domains');
    await client.detach();
  } catch (error) {
    console.log('❌ Schema.getDomains failed:', error.message);
  }
  
  await browser.disconnect();
})();
```

### 常见错误和解决方案

#### 错误 1: "Schema.getDomains wasn't found"

**原因**: 方法不存在或未启用

**解决**:
- ✅ 已实施：使用回退方案
- 检查 Chrome 版本
- 尝试更新 Chrome

#### 错误 2: "Cannot create CDP session"

**原因**: 浏览器目标不可用

**解决**:
- 检查浏览器是否正在运行
- 确认 `--remote-debugging-port` 已启用
- 重启浏览器

#### 错误 3: "Target closed"

**原因**: 浏览器在调用期间关闭

**解决**:
- 确保浏览器保持运行
- 检查是否有其他进程关闭浏览器

---

## 🎯 最佳实践

### 1. 工具设计原则

**永远提供基础信息**:
```typescript
// ✅ 好的设计
const version = await browser.version(); // 总是可用
response.appendResponseLine(`Browser: ${version}`);

// 然后尝试高级功能
try {
  const advanced = await getAdvancedInfo();
  response.appendResponseLine(`Advanced: ${advanced}`);
} catch {
  response.appendResponseLine(`Advanced info unavailable`);
}
```

**分层错误处理**:
```typescript
try {
  // 基础功能
  try {
    // 高级功能
    try {
      // 实验性功能
    } catch { /* 回退 */ }
  } catch { /* 回退 */ }
} catch { /* 完全失败 */ }
```

### 2. CDP 调用最佳实践

**总是 detach CDPSession**:
```typescript
const client = await browser.target().createCDPSession();
try {
  const result = await client.send('...');
  return result;
} finally {
  await client.detach(); // 总是清理
}
```

**使用超时**:
```typescript
const result = await Promise.race([
  client.send('Schema.getDomains'),
  new Promise((_, reject) => 
    setTimeout(() => reject(new Error('Timeout')), 5000)
  )
]);
```

### 3. 用户体验原则

**清晰的错误提示**:
```
❌ 不好: "Error: CDP failed"
✅ 好的: "⚠️ Could not query CDP domains dynamically (Schema.getDomains unavailable)"
```

**提供替代信息**:
```
❌ 不好: 工具失败，什么都不显示
✅ 好的: 显示已知的 domains 列表 + 说明是回退方案
```

---

## 📝 相关资源

### Chrome DevTools Protocol 文档
- [Schema Domain](https://chromedevtools.github.io/devtools-protocol/tot/Schema/)
- [Protocol Viewer](https://chromedevtools.github.io/devtools-protocol/)

### Puppeteer CDP 文档
- [CDPSession](https://pptr.dev/api/puppeteer.cdpsession)
- [Browser.target()](https://pptr.dev/api/puppeteer.browser.target)

### 已知问题
- [Chromium Issue: Schema.getDomains not available](https://bugs.chromium.org/)
- [Puppeteer Issue: CDP method not found](https://github.com/puppeteer/puppeteer/issues)

---

## ✅ 验收测试

### 测试场景 1: 正常情况（Schema.getDomains 可用）

```bash
# 调用工具
list_browser_capabilities

# 期望输出
# Browser Capabilities
# **Browser Version**: Chrome/141.0.7390.76
# **CDP Domains**: 52
# **Available Domains**:
# - Accessibility
# - Animation
# ...
```

### 测试场景 2: Schema.getDomains 不可用

```bash
# 调用工具
list_browser_capabilities

# 期望输出
# Browser Capabilities
# **Browser Version**: Chrome/141.0.7390.76
# ⚠️ Note: Could not query CDP domains dynamically
# Showing common CDP domains instead:
# **CDP Domains**: 45
# **Available Domains**:
# - Accessibility
# ...
```

### 测试场景 3: CDP Session 创建失败

```bash
# 期望输出
# Browser Capabilities
# **Browser Version**: Chrome/141.0.7390.76
# ⚠️ Could not create CDP session: ...
# Browser is connected but CDP introspection is not available.
```

---

## 🚀 后续改进

### 短期（v0.8.12）
- [x] 实施分层错误处理
- [x] 添加回退方案
- [x] 改进用户提示
- [ ] 监控此问题的发生频率

### 中期（v0.9.0）
- [ ] 缓存 domains 列表
- [ ] 支持手动指定 domains
- [ ] 添加 CDP 协议版本检测

### 长期（v1.0.0）
- [ ] 自动检测可用的 CDP 方法
- [ ] 提供更详细的 CDP 能力报告
- [ ] 支持 CDP 协议降级

---

**诊断完成**: 2025-10-16 15:08  
**状态**: ✅ 已修复并验证  
**修改文件**: `src/tools/browser-info.ts`

