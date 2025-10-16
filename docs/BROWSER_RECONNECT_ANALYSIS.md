# Streamable 模式浏览器重连能力分析

**分析时间**: 2025-10-16 20:50  
**问题**: streamable 启动后，关闭浏览器再重启，是否有持续检测并恢复能力？

---

## 🔍 问题排查

### 当前实现分析

#### 1. 服务启动流程（server-http.ts）

```typescript
// 第 54-108 行
async function startHTTPServer() {
  // 1. 验证浏览器连接（启动时）
  if (args.browserUrl) {
    await validateBrowserURL(args.browserUrl);  // ✅ 验证成功
  }
  
  // 2. 连接浏览器（一次性）
  const browser = args.browserUrl
    ? await ensureBrowserConnected({
        browserURL: args.browserUrl,
        devtools,
      })
    : await ensureBrowserLaunched({...});
  
  // 3. browser 对象保存到闭包中
  // ⚠️ 关键：整个服务生命周期使用同一个 browser 对象
}
```

**问题**：browser 对象在启动时创建，之后不会更新

#### 2. 新会话创建流程（server-http.ts）

```typescript
// 第 214-236 行
if (!session) {
  // 创建新会话
  
  // 验证浏览器连接（如果配置了 browserURL）
  if (SERVER_CONFIG.browserURL) {
    const isConnected = await verifyBrowserConnection(SERVER_CONFIG.browserURL);
    if (!isConnected) {
      console.warn('[HTTP] ⚠️  Browser connection verification failed');
      console.warn('[HTTP] 💡 Tip: Browser may have been restarted or connection lost');
      // ⚠️ 只是警告，不会重连！
    }
  }
  
  // 创建 Context（使用旧的 browser 对象）
  const context = await McpContext.from(browser, logger);
  // ⚠️ 如果 browser 已断开，McpContext 会失败
}
```

**问题**：检测到连接失败后，只警告不重连

#### 3. ensureBrowserConnected 实现（browser.ts）

```typescript
// 第 79-109 行
export async function ensureBrowserConnected(options: {
  browserURL: string;
  devtools: boolean;
}) {
  // 验证：如果已连接，确保是同一个浏览器
  if (browser?.connected) {
    // ⚠️ 问题：只检查 connected，不检查实际连接状态
    if (initialBrowserURL && initialBrowserURL !== options.browserURL) {
      console.warn('[Browser] ⚠️  Already connected to:', initialBrowserURL);
    }
    return browser;  // 直接返回，不重连
  }
  
  // 只有第一次会执行连接
  browser = await puppeteer.connect({
    targetFilter: makeTargetFilter(options.devtools),
    browserURL: options.browserURL,
    defaultViewport: null,
  });
  
  isExternalBrowser = true;
  initialBrowserURL = options.browserURL;
  
  return browser;
}
```

**问题**：
1. `browser?.connected` 检查不够准确
2. 浏览器重启后，browser 对象存在但已失效
3. 不会尝试重连

---

## ❌ 测试场景：失败流程

### 场景：浏览器重启后调用工具

```
1. 启动 MCP 服务
   ↓
   browser = await puppeteer.connect(...)  ✅ 连接成功
   
2. Chrome 浏览器关闭
   ↓
   browser.connected = false  ⚠️ 连接断开
   
3. Chrome 浏览器重启（端口 9222）
   ↓
   浏览器已就绪，等待连接
   
4. 用户调用工具（新会话）
   ↓
   verifyBrowserConnection() → false  ⚠️ 检测到失败
   console.warn('Browser connection verification failed')
   ↓
   const context = await McpContext.from(browser, logger)
   ↓
   ❌ 失败！browser 已断开，无法创建 Context
   
结果：用户无法使用，必须重启服务
```

### 实际失败点

1. **verifyBrowserConnection 失败**
   ```typescript
   // browser.ts:236-266
   export async function verifyBrowserConnection(expectedURL?: string): Promise<boolean> {
     if (!browser?.connected) {
       console.log('[Browser] ✗ Not connected');
       return false;  // ⚠️ 返回 false，但没有重连
     }
     
     try {
       const version = await browser.version();  // ⚠️ 可能抛异常
       // ...
     } catch (error) {
       console.error('[Browser] ✗ Connection lost:', error);
       return false;  // ⚠️ 返回 false，但没有重连
     }
   }
   ```

2. **McpContext.from 失败**
   ```typescript
   // McpContext.ts (推测)
   static async from(browser: Browser, logger: Logger) {
     // 尝试使用 browser 对象
     const pages = await browser.pages();  // ❌ 抛异常：Protocol error
     // ...
   }
   ```

---

## ✅ 应该有的行为

### 理想流程：自动恢复

```
1. 启动 MCP 服务
   ↓
   browser = await puppeteer.connect(...)  ✅ 连接成功
   
2. Chrome 浏览器关闭
   ↓
   browser.connected = false
   
3. Chrome 浏览器重启（端口 9222）
   ↓
   浏览器已就绪
   
4. 用户调用工具（新会话）
   ↓
   verifyBrowserConnection() → false  ⚠️ 检测到失败
   ↓
   ✅ 尝试重连
   browser = await puppeteer.connect({browserURL: ...})
   ↓
   verifyBrowserConnection() → true  ✅ 重连成功
   ↓
   const context = await McpContext.from(browser, logger)
   ↓
   ✅ 成功！用户可以继续使用
   
结果：无需重启服务，自动恢复
```

---

## 🛠️ 修复方案

### 方案 1: 在新会话创建时重连（推荐）

**优点**:
- 最小改动
- 只在需要时重连
- 不影响已有会话

**实现位置**: `server-http.ts` 第 214-236 行

```typescript
// 创建新会话时
if (!session) {
  // 验证浏览器连接
  if (SERVER_CONFIG.browserURL) {
    const isConnected = await verifyBrowserConnection(SERVER_CONFIG.browserURL);
    
    if (!isConnected) {
      console.warn('[HTTP] ⚠️  Browser connection lost, attempting to reconnect...');
      
      try {
        // ✅ 尝试重连
        browser = await ensureBrowserConnected({
          browserURL: SERVER_CONFIG.browserURL,
          devtools,
        });
        
        console.log('[HTTP] ✅ Browser reconnected successfully');
      } catch (error) {
        console.error('[HTTP] ❌ Failed to reconnect to browser:', error);
        
        // 返回错误响应给客户端
        res.writeHead(503, {'Content-Type': 'application/json'});
        res.end(JSON.stringify({
          error: 'Browser connection lost and reconnection failed',
          details: error instanceof Error ? error.message : String(error),
        }));
        return;
      }
    }
  }
  
  // 创建 Context（使用重连后的 browser）
  const context = await McpContext.from(browser, logger);
  // ...
}
```

### 方案 2: 修改 ensureBrowserConnected 支持强制重连

**优点**:
- 更彻底
- 统一处理重连逻辑

**实现位置**: `browser.ts` 第 79-109 行

```typescript
export async function ensureBrowserConnected(options: {
  browserURL: string;
  devtools: boolean;
  forceReconnect?: boolean;  // ✅ 新增参数
}) {
  // 如果强制重连，先断开旧连接
  if (options.forceReconnect && browser) {
    try {
      // 不关闭浏览器，只断开连接
      await browser.disconnect();
      browser = undefined;
    } catch (error) {
      // 忽略断开错误
    }
  }
  
  // 验证现有连接是否有效
  if (browser?.connected) {
    try {
      await browser.version();  // ✅ 测试连接是否真的有效
      
      if (initialBrowserURL && initialBrowserURL !== options.browserURL) {
        console.warn('[Browser] ⚠️  Already connected to:', initialBrowserURL);
      }
      
      return browser;  // 连接有效，直接返回
    } catch (error) {
      // ✅ 连接已失效，需要重连
      console.warn('[Browser] ⚠️  Connection lost, reconnecting...');
      browser = undefined;
    }
  }
  
  // 执行连接（首次或重连）
  console.log('[Browser] 📡 Connecting to browser:', options.browserURL);
  
  browser = await puppeteer.connect({
    targetFilter: makeTargetFilter(options.devtools),
    browserURL: options.browserURL,
    defaultViewport: null,
    handleDevToolsAsPage: options.devtools,
  });
  
  isExternalBrowser = true;
  initialBrowserURL = options.browserURL;
  
  console.log('[Browser] ✅ Connected successfully');
  
  return browser;
}
```

### 方案 3: 添加定期健康检查（可选）

**优点**:
- 主动检测
- 更快发现问题

**实现**:

```typescript
// server-http.ts 启动时
let browserHealthCheckInterval: NodeJS.Timeout | null = null;

async function startBrowserHealthCheck() {
  browserHealthCheckInterval = setInterval(async () => {
    if (SERVER_CONFIG.browserURL) {
      const isConnected = await verifyBrowserConnection(SERVER_CONFIG.browserURL);
      
      if (!isConnected) {
        console.warn('[Health] Browser connection lost, will reconnect on next request');
        // 可选：立即尝试重连
      }
    }
  }, 30000);  // 每 30 秒检查一次
}

// 清理
process.on('SIGINT', async () => {
  if (browserHealthCheckInterval) {
    clearInterval(browserHealthCheckInterval);
  }
  // ...
});
```

---

## 📊 方案对比

| 方案 | 复杂度 | 恢复速度 | 可靠性 | 推荐 |
|------|--------|----------|--------|------|
| 方案1: 会话创建时重连 | ⭐ 低 | ⭐⭐ 快（即时） | ⭐⭐⭐ 高 | ✅ 推荐 |
| 方案2: ensureBrowserConnected 增强 | ⭐⭐ 中 | ⭐⭐⭐ 很快 | ⭐⭐⭐ 高 | ✅ 推荐 |
| 方案3: 定期健康检查 | ⭐⭐⭐ 高 | ⭐⭐⭐ 主动 | ⭐⭐ 中 | ⚠️ 可选 |

**最佳实践**: 结合方案1 + 方案2

---

## 🧪 测试验证

### 测试脚本

已创建：`test-browser-reconnect.sh`

**测试步骤**:
1. 启动 Chrome（端口 9222）
2. 启动 MCP 服务
3. 测试工具调用 → 应该成功
4. 关闭 Chrome
5. 测试工具调用 → 应该失败
6. 重启 Chrome
7. 测试工具调用 → **关键：是否自动恢复？**

### 预期结果

**修复前**:
```
步骤 7: ❌ 失败
原因: 服务使用旧的 browser 对象，无法创建 Context
解决: 必须重启服务
```

**修复后**:
```
步骤 7: ✅ 成功
原因: 检测到连接失败，自动重连
结果: 用户无感知，继续使用
```

---

## 📝 相关代码位置

### 需要修改的文件

1. **server-http.ts**
   - 第 214-236 行：新会话创建逻辑
   - 添加重连处理

2. **browser.ts**
   - 第 79-109 行：ensureBrowserConnected 函数
   - 增强连接验证和重连逻辑

3. **browser.ts**
   - 第 236-266 行：verifyBrowserConnection 函数
   - 可选：添加更详细的错误信息

---

## 🎯 实现优先级

### P0: 必须实现（方案1 或 方案2）

**原因**:
- 当前完全无法恢复，必须重启服务
- 影响 Streamable 模式的可用性
- 用户体验差

**工作量**: 2-3 小时

### P1: 建议实现（方案1 + 方案2）

**原因**:
- 更彻底的解决方案
- 统一处理重连逻辑

**工作量**: 4-5 小时

### P2: 可选实现（方案3）

**原因**:
- 主动检测更健壮
- 但增加复杂度

**工作量**: 2 小时

---

## 🚀 实施建议

### 第一步：快速修复（1小时）

实现方案1：在 server-http.ts 中添加重连逻辑

```typescript
// 只修改一个地方，快速解决问题
if (!isConnected) {
  console.warn('[HTTP] Reconnecting...');
  browser = await ensureBrowserConnected({...});
}
```

### 第二步：完善方案（2小时）

实现方案2：增强 ensureBrowserConnected

```typescript
// 让 ensureBrowserConnected 自动检测并重连
if (browser?.connected) {
  try {
    await browser.version();  // 测试连接
    return browser;
  } catch {
    browser = undefined;  // 触发重连
  }
}
```

### 第三步：测试验证（1小时）

运行 test-browser-reconnect.sh 验证修复效果

---

## 📚 相关文档

- [Streamable 连接生命周期](./STDIO_CONNECTION_LIFECYCLE.md)
- [CDP 混合架构](./CDP_HYBRID_ARCHITECTURE.md)
- [错误处理最佳实践](./TOOL_ERROR_HANDLING_ANALYSIS.md)

---

## 结论

**当前状态**: ❌ **没有**自动恢复能力

**影响**: 
- 浏览器重启后，服务不可用
- 必须手动重启 MCP 服务
- 用户体验差

**修复优先级**: 🔴 **高优先级**

**推荐方案**: 方案1（快速）+ 方案2（完善）

**预期收益**:
- ✅ 浏览器重启后自动恢复
- ✅ 用户无感知
- ✅ 服务可用性提升
- ✅ 运维成本降低

---

**分析完成**: 2025-10-16 20:52  
**状态**: ❌ 需要修复  
**优先级**: 🔴 P0 - 高

