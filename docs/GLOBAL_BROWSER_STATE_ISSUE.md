# 全局浏览器状态问题分析

**报告时间**: 2025-10-16 14:10  
**问题**: Streamable 服务配置的 9222 被意外修改为 9226

---

## 🔍 问题描述

### 用户反馈

1. Streamable 服务启动时配置了 `--browserUrl http://localhost:9222`
2. 中间**没有重启** streamable 服务
3. IDE 配置的 MCP 会手动**重连过几次**
4. 唯一使用 9226 是之前测试**多租户绑定 9226 浏览器**
5. 但现在 streamable 服务连接的是 9226 而不是 9222

### 关键疑问

- 配置是如何被修改的？
- 为什么没有重启服务，浏览器连接却变了？

---

## 🔎 代码分析

### 全局浏览器实例

**文件**: `src/browser.ts`

```typescript
let browser: Browser | undefined; // ❌ 全局变量
let isExternalBrowser = false;
```

**问题**: 浏览器实例是**模块级全局变量**

### 连接逻辑

```typescript
export async function ensureBrowserConnected(options: {
  browserURL: string;
  devtools: boolean;
}) {
  if (browser?.connected) {
    return browser;  // ⚠️ 如果已连接，直接返回现有实例
  }

  // 只有在未连接时才使用新的 browserURL
  browser = await puppeteer.connect({
    browserURL: options.browserURL,
    ...
  });

  return browser;
}
```

**关键点**:

1. 如果 `browser?.connected` 为 `true`，直接返回现有实例
2. **忽略** `options.browserURL` 参数
3. 不会重新连接到新的浏览器

### Streamable 服务启动流程

**文件**: `src/server-http.ts:81-94`

```typescript
const browser = args.browserUrl
  ? await ensureBrowserConnected({
      browserURL: args.browserUrl,  // 启动时: http://localhost:9222
      devtools,
    })
  : await ensureBrowserLaunched({...});
```

**每个新会话**:

```typescript
// 每次 IDE 重连都会执行
const context = await McpContext.from(browser, logger); // 使用全局 browser
```

---

## 🐛 问题根因（推测）

### 可能的场景

#### 场景 1: 浏览器断线重连（最可能）

**时间线**:

1. **09:45** - Streamable 启动，连接到 9222

   ```typescript
   browser = await puppeteer.connect({browserURL: 'http://localhost:9222'});
   ```

2. **10:12** - 多租户测试，绑定 9226
   - 多租户是独立进程，不影响 streamable

3. **某个时刻** - 9222 的 Chrome 断开连接或重启

   ```typescript
   browser?.connected === false; // 连接断开
   ```

4. **IDE 重连** - Streamable 重新初始化
   ```typescript
   // 此时 browser?.connected 为 false
   // 需要重新连接，但连接到哪里？
   ```

**问题**: 如果 9222 不可用，Puppeteer 可能会尝试连接默认端口或其他可用端口

#### 场景 2: 环境变量污染

**检查点**:

- 是否有环境变量 `BROWSER_URL` 或类似的？
- 多租户测试是否设置了环境变量？

#### 场景 3: 配置文件被修改

**检查点**:

- 是否有配置文件会覆盖命令行参数？
- IDE 配置是否影响了服务器配置？

---

## ❌ 设计缺陷

### 1. 全局状态 (Critical)

**问题**:

```typescript
let browser: Browser | undefined; // 全局变量，在模块间共享
```

**影响**:

- 多个服务（虽然是不同进程）如果共享代码，可能产生混乱
- 单个服务内，浏览器连接状态不明确
- 无法同时连接多个浏览器

### 2. 连接缓存逻辑不完善

**问题**:

```typescript
if (browser?.connected) {
  return browser; // 忽略 browserURL 参数
}
```

**风险**:

- 如果浏览器断线重连，可能连接到错误的端口
- 无法验证当前连接的浏览器是否是预期的
- 没有日志记录实际连接的浏览器 URL

### 3. 缺少连接验证

**问题**: 启动时验证了 browserURL，但运行时不验证

**应该**:

- 定期检查浏览器连接
- 断线后重新连接到**正确的** browserURL
- 记录连接变化

---

## ✅ 解决方案

### 短期方案（立即可用）

#### 1. 重启 Streamable 服务

```bash
# 停止服务
kill 30136

# 重新启动（明确指定 9226 如果需要测试）
~/apps/chrome-extension-debug-mcp-server/chrome-extension-debug-linux-x64 \
  --transport streamable \
  --browserUrl http://localhost:9226 &

# 或者继续使用 9222（如果这是预期的）
~/apps/chrome-extension-debug-mcp-server/chrome-extension-debug-linux-x64 \
  --transport streamable \
  --browserUrl http://localhost:9222 &
```

#### 2. 添加日志验证

在启动后检查日志，确认连接的浏览器：

```bash
# 查看 streamable 进程的输出
tail -f /tmp/streamable.log  # 如果有日志文件
```

### 中期方案（代码改进）

#### 改进 1: 保存初始 browserURL

```typescript
// src/browser.ts
let browser: Browser | undefined;
let initialBrowserURL: string | undefined;  // 新增：保存初始 URL

export async function ensureBrowserConnected(options: {
  browserURL: string;
  devtools: boolean;
}) {
  // 验证：如果已连接，确保是同一个浏览器
  if (browser?.connected) {
    if (initialBrowserURL && initialBrowserURL !== options.browserURL) {
      console.warn(`⚠️  Browser already connected to ${initialBrowserURL}, ignoring ${options.browserURL}`);
    }
    return browser;
  }

  console.log('[Browser] 📡 Connecting to: ' + options.browserURL);

  browser = await puppeteer.connect({
    browserURL: options.browserURL,
    ...
  });

  initialBrowserURL = options.browserURL;  // 保存初始 URL
  isExternalBrowser = true;

  return browser;
}
```

#### 改进 2: 添加连接验证

```typescript
export async function verifyBrowserConnection(
  expectedURL: string,
): Promise<boolean> {
  if (!browser?.connected) {
    return false;
  }

  try {
    const version = await browser.version();
    const wsEndpoint = browser.wsEndpoint();

    console.log('[Browser] ✓ Connected:', {
      version,
      endpoint: wsEndpoint,
      expected: expectedURL,
    });

    return true;
  } catch (error) {
    console.error('[Browser] ✗ Connection lost:', error);
    return false;
  }
}
```

#### 改进 3: Streamable 启动时保存配置

```typescript
// src/server-http.ts
const SERVER_CONFIG = {
  browserURL: args.browserUrl, // 保存配置
  port: port,
};

// 每次会话创建前验证
if (browser && SERVER_CONFIG.browserURL) {
  const isConnected = await verifyBrowserConnection(SERVER_CONFIG.browserURL);
  if (!isConnected) {
    console.warn('[HTTP] Browser disconnected, reconnecting...');
    browser = undefined; // 清除旧连接
  }
}
```

### 长期方案（架构改进）

#### 方案 1: 移除全局状态

```typescript
// 不再使用全局变量
export class BrowserManager {
  private browser?: Browser;
  private config: BrowserConfig;

  constructor(config: BrowserConfig) {
    this.config = config;
  }

  async connect(): Promise<Browser> {
    if (this.browser?.connected) {
      return this.browser;
    }

    this.browser = await puppeteer.connect({
      browserURL: this.config.browserURL,
    });

    return this.browser;
  }
}
```

#### 方案 2: 每个服务独立的浏览器实例

```typescript
// server-http.ts
const browserManager = new BrowserManager({
  browserURL: args.browserUrl,
});

const browser = await browserManager.connect();
```

---

## 📋 验证步骤

### 1. 检查当前连接

```bash
# 检查 streamable 进程
ps -p 30136 -o pid,ppid,cmd

# 测试连接
curl http://localhost:32123/

# 使用 MCP 工具验证
mcp2_get_connected_browser
```

### 2. 验证两个 Chrome 实例

```bash
# 9222
curl -s http://localhost:9222/json/version | jq .Browser

# 9226
curl -s http://localhost:9226/json/version | jq .Browser
```

### 3. 重启后验证

```bash
# 重启 streamable
kill 30136
~/apps/.../chrome-extension-debug-linux-x64 --transport streamable --browserUrl http://localhost:9226 &

# 等待启动
sleep 2

# 验证连接
mcp2_get_connected_browser
mcp2_list_extensions
```

---

## 🎯 结论

### 最可能的原因

**浏览器断线重连导致连接到错误的端口**

1. Streamable 启动时连接到 9222
2. 9222 的 Chrome 在某个时刻断开连接（重启或崩溃）
3. Puppeteer 重连时，由于某种原因连接到了 9226
4. 全局状态保留了 9226 的连接
5. 后续 IDE 重连都使用了这个错误的连接

### 根本问题

**全局浏览器状态 + 缺少连接验证 = 不可预测的行为**

### 推荐操作

1. **立即**: 重启 streamable 服务，明确指定正确的 browserURL
2. **短期**: 添加日志，记录实际连接的浏览器
3. **中期**: 改进代码，添加连接验证
4. **长期**: 重构全局状态，使用实例化的 BrowserManager

---

## 附录：调试命令

```bash
# 查看所有 Chrome 进程
ps aux | grep chrome | grep remote-debugging-port | awk '{print $16}'

# 查看 MCP 服务
ps aux | grep "streamable\|multi-tenant" | grep -v grep

# 测试端口连接
curl -s http://localhost:9222/json/version
curl -s http://localhost:9226/json/version

# 查看扩展数量
curl -s http://localhost:9222/json/list | jq '[.[] | select(.type == "service_worker")] | length'
curl -s http://localhost:9226/json/list | jq '[.[] | select(.type == "service_worker")] | length'
```

---

**诊断完成**: 2025-10-16 14:10  
**状态**: ⚠️ 需要重启服务 + 代码改进
