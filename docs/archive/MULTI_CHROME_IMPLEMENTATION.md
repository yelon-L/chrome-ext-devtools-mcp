# 集中式 MCP + 分布式 Chrome 实现方案

## 技术可行性分析

✅ **完全可以实现！**

当前限制只是设计问题，不是技术障碍：
- `ensureBrowserConnected()` 函数支持连接任意 Chrome URL
- 每次调用都返回独立的 browser 实例
- 会话系统已经支持多会话管理

---

## 实现方案

### 核心改动

#### 1. 修改会话存储结构

**当前代码**：
```typescript
// server-http.ts line 39-43
const sessions = new Map<string, {
  transport: StreamableHTTPServerTransport;
  server: McpServer;
  context: McpContext;
}>();
```

**改进后**：
```typescript
const sessions = new Map<string, {
  transport: StreamableHTTPServerTransport;
  server: McpServer;
  context: McpContext;
  browser: any;  // ← 新增：存储会话专属的 browser
  chromeUrl: string;  // ← 新增：记录 Chrome URL
}>();
```

#### 2. 从客户端获取 Chrome URL

**方式 A：HTTP 请求头**（推荐）
```typescript
// line 141-145
if (url.pathname === '/mcp') {
  const sessionIdFromHeader = req.headers['mcp-session-id'] as string | undefined;
  const chromeUrlFromHeader = req.headers['x-chrome-url'] as string | undefined;  // ← 新增
  
  console.log(`[HTTP] ${req.method} /mcp, Session: ${sessionIdFromHeader || 'new'}, Chrome: ${chromeUrlFromHeader || 'default'}`);
```

**方式 B：环境变量**（备选）
```typescript
// 从进程环境变量获取（客户端 IDE 配置）
const chromeUrl = process.env.CHROME_URL || 'http://localhost:9222';
```

#### 3. 为每个会话创建独立 browser

**当前代码**（line 172）：
```typescript
// 所有会话共享同一个 browser
const context = await McpContext.from(browser, logger);
```

**改进后**：
```typescript
if (!session) {
  // 获取客户端的 Chrome URL
  const clientChromeUrl = 
    req.headers['x-chrome-url'] as string ||
    process.env.DEFAULT_CHROME_URL ||
    'http://localhost:9222';
  
  console.log(`[HTTP] 🔗 连接客户端 Chrome: ${clientChromeUrl}`);
  
  // 为此会话创建独立的 browser 连接
  const sessionBrowser = await ensureBrowserConnected({
    browserURL: clientChromeUrl,
    devtools: false,
  });
  
  // 使用会话专属的 browser 创建 context
  const context = await McpContext.from(sessionBrowser, logger);
  
  // ... 注册工具 ...
  
  // 存储会话，包含 browser 引用
  session = {
    transport,
    server: mcpServer,
    context,
    browser: sessionBrowser,  // ← 新增
    chromeUrl: clientChromeUrl,  // ← 新增
  };
  
  sessions.set(transport.sessionId, session);
}
```

#### 4. 会话结束时断开 Chrome

**当前代码**（line 156-159）：
```typescript
onsessionclosed: async (sessionId) => {
  console.log(`[HTTP] 📴 会话关闭: ${sessionId}`);
  sessions.delete(sessionId);
},
```

**改进后**：
```typescript
onsessionclosed: async (sessionId) => {
  console.log(`[HTTP] 📴 会话关闭: ${sessionId}`);
  
  const session = sessions.get(sessionId);
  if (session?.browser) {
    try {
      console.log(`[HTTP] 🔌 断开 Chrome: ${session.chromeUrl}`);
      // 注意：不要调用 browser.close()，因为客户端还在使用 Chrome
      // 只是断开连接即可
      await session.browser.disconnect?.();
    } catch (error) {
      console.error(`[HTTP] ⚠️  断开 Chrome 失败:`, error);
    }
  }
  
  sessions.delete(sessionId);
},
```

---

## 完整改进代码

### server-http.ts 修改

```typescript
#!/usr/bin/env node
/**
 * MCP Streamable HTTP Server - 支持多客户端分布式 Chrome
 * 
 * 特性：
 * - 每个客户端连接使用各自的 Chrome
 * - 会话级别的 browser 隔离
 * - 支持多开发者同时使用
 */

import './polyfill.js';

import http from 'node:http';
import {randomUUID} from 'node:crypto';
import {StreamableHTTPServerTransport} from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import type {CallToolResult} from '@modelcontextprotocol/sdk/types.js';

import {parseArguments} from './cli.js';
import {ensureBrowserConnected, ensureBrowserLaunched} from './browser.js';
import type {Channel} from './browser.js';
import {logger} from './logger.js';
import {McpContext} from './McpContext.js';
import {McpResponse} from './McpResponse.js';
import {Mutex} from './Mutex.js';
import type {ToolDefinition} from './tools/ToolDefinition.js';
import * as consoleTools from './tools/console.js';
import * as emulationTools from './tools/emulation.js';
import * as extensionTools from './tools/extensions.js';
import * as inputTools from './tools/input.js';
import * as networkTools from './tools/network.js';
import * as pagesTools from './tools/pages.js';
import * as performanceTools from './tools/performance.js';
import * as screenshotTools from './tools/screenshot.js';
import * as scriptTools from './tools/script.js';
import * as snapshotTools from './tools/snapshot.js';

// 存储所有会话（改进：增加 browser 和 chromeUrl）
const sessions = new Map<string, {
  transport: StreamableHTTPServerTransport;
  server: McpServer;
  context: McpContext;
  browser: any;  // 会话专属的 browser 实例
  chromeUrl: string;  // Chrome URL
  createdAt: number;  // 创建时间
}>();

async function startHTTPServer() {
  const version = '0.8.0';
  const args = parseArguments(version);
  const port = parseInt(process.env.PORT || '32123', 10);

  // 默认 Chrome URL（可选，用于降级）
  const defaultChromeUrl = args.browserUrl || process.env.DEFAULT_CHROME_URL;
  
  console.log('[HTTP] 🚀 启动 MCP HTTP 服务器...');
  console.log('[HTTP] 📋 模式: 分布式 Chrome（会话级隔离）');
  if (defaultChromeUrl) {
    console.log(`[HTTP] 🔧 默认 Chrome: ${defaultChromeUrl}`);
  } else {
    console.log('[HTTP] 🌐 无默认 Chrome，将从客户端获取');
  }

  // 工具注册函数（保持不变）
  const toolMutex = new Mutex();
  function registerTool(mcpServer: McpServer, tool: ToolDefinition, context: McpContext): void {
    mcpServer.registerTool(
      tool.name,
      {
        description: tool.description,
        inputSchema: tool.schema,
        annotations: tool.annotations,
      },
      async (params): Promise<CallToolResult> => {
        const guard = await toolMutex.acquire();
        try {
          const response = new McpResponse();
          await tool.handler(params, response, context);
          return response.getResult();
        } finally {
          guard.dispose();
        }
      },
    );
  }

  // HTTP 服务器
  const httpServer = http.createServer(async (req, res) => {
    const url = new URL(req.url!, `http://${req.headers.host}`);
    
    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Mcp-Session-Id, X-Chrome-Url');

    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }

    // 健康检查
    if (url.pathname === '/health') {
      res.writeHead(200, {'Content-Type': 'application/json'});
      res.end(JSON.stringify({
        status: 'ok',
        sessions: sessions.size,
        mode: 'distributed-chrome',
        activeSessions: Array.from(sessions.entries()).map(([id, s]) => ({
          sessionId: id,
          chromeUrl: s.chromeUrl,
          uptime: Date.now() - s.createdAt,
        })),
      }));
      return;
    }

    // 测试页面
    if (url.pathname === '/test' || url.pathname === '/') {
      res.writeHead(200, {'Content-Type': 'text/html; charset=utf-8'});
      res.end(getTestPage());
      return;
    }

    // MCP 端点（改进版）
    if (url.pathname === '/mcp') {
      const sessionIdFromHeader = req.headers['mcp-session-id'] as string | undefined;
      const chromeUrlFromHeader = req.headers['x-chrome-url'] as string | undefined;
      
      console.log(`[HTTP] ${req.method} /mcp, Session: ${sessionIdFromHeader || 'new'}, Chrome: ${chromeUrlFromHeader || 'default'}`);
      
      // 查找或创建会话
      let session = sessionIdFromHeader ? sessions.get(sessionIdFromHeader) : undefined;
      
      if (!session) {
        // 确定 Chrome URL
        const clientChromeUrl = chromeUrlFromHeader || defaultChromeUrl;
        
        if (!clientChromeUrl) {
          res.writeHead(400, {'Content-Type': 'application/json'});
          res.end(JSON.stringify({
            error: 'No Chrome URL provided',
            message: 'Please provide Chrome URL via X-Chrome-Url header or configure DEFAULT_CHROME_URL',
          }));
          return;
        }
        
        console.log(`[HTTP] 🔗 连接客户端 Chrome: ${clientChromeUrl}`);
        
        try {
          // 为此会话创建独立的 browser 连接
          const sessionBrowser = await ensureBrowserConnected({
            browserURL: clientChromeUrl,
            devtools: false,
          });
          
          console.log(`[HTTP] ✅ Chrome 连接成功: ${clientChromeUrl}`);
          
          // 创建传输层
          const transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: () => randomUUID(),
            onsessioninitialized: async (sessionId) => {
              console.log(`[HTTP] ✅ 会话初始化: ${sessionId} (Chrome: ${clientChromeUrl})`);
            },
            onsessionclosed: async (sessionId) => {
              console.log(`[HTTP] 📴 会话关闭: ${sessionId}`);
              
              const closingSession = sessions.get(sessionId);
              if (closingSession?.browser) {
                try {
                  console.log(`[HTTP] 🔌 断开 Chrome: ${closingSession.chromeUrl}`);
                  // 断开连接（不关闭客户端的 Chrome）
                  if (typeof closingSession.browser.disconnect === 'function') {
                    await closingSession.browser.disconnect();
                  }
                } catch (error) {
                  console.error(`[HTTP] ⚠️  断开 Chrome 失败:`, error);
                }
              }
              
              sessions.delete(sessionId);
            },
          });
          
          // 创建 MCP Server
          const mcpServer = new McpServer(
            {name: 'chrome-extension-debug-mcp', version},
            {capabilities: {tools: {}}},
          );
          
          // 使用会话专属的 browser 创建 Context
          const context = await McpContext.from(sessionBrowser, logger);
          
          // 注册工具
          const tools = [
            ...Object.values(consoleTools),
            ...Object.values(emulationTools),
            ...Object.values(extensionTools),
            ...Object.values(inputTools),
            ...Object.values(networkTools),
            ...Object.values(pagesTools),
            ...Object.values(performanceTools),
            ...Object.values(screenshotTools),
            ...Object.values(scriptTools),
            ...Object.values(snapshotTools),
          ];
          for (const tool of tools) {
            registerTool(mcpServer, tool as unknown as ToolDefinition, context);
          }
          
          await mcpServer.connect(transport);
          
          // 存储会话（包含 browser 引用）
          session = {
            transport,
            server: mcpServer,
            context,
            browser: sessionBrowser,
            chromeUrl: clientChromeUrl,
            createdAt: Date.now(),
          };
          
          // 等待 sessionId 生成
          if (transport.sessionId) {
            sessions.set(transport.sessionId, session);
            console.log(`[HTTP] 📝 会话已存储: ${transport.sessionId}`);
          }
          
        } catch (error) {
          console.error(`[HTTP] ❌ 连接 Chrome 失败: ${clientChromeUrl}`, error);
          res.writeHead(500, {'Content-Type': 'application/json'});
          res.end(JSON.stringify({
            error: 'Failed to connect to Chrome',
            chromeUrl: clientChromeUrl,
            message: error instanceof Error ? error.message : String(error),
          }));
          return;
        }
      }
      
      // 处理请求
      await session.transport.handleRequest(req, res);
      return;
    }

    res.writeHead(404);
    res.end('Not found');
  });

  httpServer.listen(port, () => {
    console.log('\n╔════════════════════════════════════════════════════════╗');
    console.log('║   Chrome Extension Debug MCP - Distributed Mode       ║');
    console.log('╚════════════════════════════════════════════════════════╝\n');
    console.log(`🌐 服务器: http://localhost:${port}`);
    console.log(`❤️  健康检查: http://localhost:${port}/health`);
    console.log(`🧪 测试页面: http://localhost:${port}/test`);
    console.log(`📡 MCP 端点: http://localhost:${port}/mcp`);
    console.log('\n📋 模式: 分布式 Chrome（每个客户端使用各自的 Chrome）');
    console.log('✅ 支持多开发者同时使用');
    console.log('\n按 Ctrl+C 停止\n');
  });
}

function getTestPage(): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>MCP HTTP Server - Distributed Chrome Test</title>
  <style>
    body { font-family: system-ui; max-width: 800px; margin: 40px auto; padding: 20px; }
    .status { padding: 10px; border-radius: 4px; margin: 10px 0; }
    .success { background: #d4edda; color: #155724; }
    .info { background: #d1ecf1; color: #0c5460; }
    pre { background: #f5f5f5; padding: 10px; border-radius: 4px; overflow-x: auto; }
  </style>
</head>
<body>
  <h1>🚀 MCP HTTP Server - Distributed Chrome Mode</h1>
  <div class="status success">
    ✅ 服务器运行正常
  </div>
  <div class="status info">
    📋 模式: 分布式 Chrome（会话级隔离）
  </div>
  <h2>客户端配置</h2>
  <pre>{
  "mcpServers": {
    "chrome-extension-debug": {
      "url": "http://服务器IP:3000/mcp",
      "env": {
        "CHROME_URL": "http://你的IP:9222"
      }
    }
  }
}</pre>
  <p>或使用 HTTP 头：</p>
  <pre>X-Chrome-Url: http://你的IP:9222</pre>
  <h2>健康检查</h2>
  <p><a href="/health">查看服务器状态</a></p>
</body>
</html>`;
}

startHTTPServer().catch(console.error);
```

---

## 客户端配置

### 方式 A：使用环境变量（推荐）

```json
{
  "mcpServers": {
    "chrome-extension-debug": {
      "url": "http://192.168.1.50:3000/mcp",
      "env": {
        "CHROME_URL": "http://192.168.1.100:9222"
      }
    }
  }
}
```

### 方式 B：使用 HTTP 请求头

修改 MCP SDK 或客户端，在请求时添加：
```
X-Chrome-Url: http://192.168.1.100:9222
```

---

## 部署步骤

### 1. 服务器端

```bash
cd /home/p/workspace/chrome-ext-devtools-mcp

# 应用改进代码（见上文）
# 编辑 src/server-http.ts

# 编译
npm run build

# 启动（无需指定 Chrome URL）
PORT=32123 node build/src/server-http.js
```

### 2. 开发者 A

```bash
# 启动 Chrome 并开放调试端口
chrome --remote-debugging-port=9222 --remote-allow-origins=*

# 开放防火墙（允许 MCP 服务器访问）
sudo ufw allow from 192.168.1.50 to any port 9222

# IDE 配置
{
  "mcpServers": {
    "chrome-extension-debug": {
      "url": "http://192.168.1.50:3000/mcp",
      "env": {
        "CHROME_URL": "http://192.168.1.100:9222"
      }
    }
  }
}
```

### 3. 开发者 B

```bash
# 同样的步骤，使用自己的 IP
chrome --remote-debugging-port=9222 --remote-allow-origins=*
sudo ufw allow from 192.168.1.50 to any port 9222

# IDE 配置（不同的 Chrome URL）
{
  "mcpServers": {
    "chrome-extension-debug": {
      "url": "http://192.168.1.50:3000/mcp",
      "env": {
        "CHROME_URL": "http://192.168.1.101:9222"
      }
    }
  }
}
```

---

## 验证

### 健康检查

```bash
curl http://192.168.1.50:3000/health
```

**预期输出**：
```json
{
  "status": "ok",
  "sessions": 2,
  "mode": "distributed-chrome",
  "activeSessions": [
    {
      "sessionId": "uuid-1",
      "chromeUrl": "http://192.168.1.100:9222",
      "uptime": 12345
    },
    {
      "sessionId": "uuid-2",
      "chromeUrl": "http://192.168.1.101:9222",
      "uptime": 6789
    }
  ]
}
```

### 日志

```
[HTTP] 🚀 启动 MCP HTTP 服务器...
[HTTP] 📋 模式: 分布式 Chrome（会话级隔离）
[HTTP] 🌐 无默认 Chrome，将从客户端获取

[HTTP] POST /mcp, Session: new, Chrome: http://192.168.1.100:9222
[HTTP] 🔗 连接客户端 Chrome: http://192.168.1.100:9222
[HTTP] ✅ Chrome 连接成功: http://192.168.1.100:9222
[HTTP] ✅ 会话初始化: abc-123 (Chrome: http://192.168.1.100:9222)

[HTTP] POST /mcp, Session: new, Chrome: http://192.168.1.101:9222
[HTTP] 🔗 连接客户端 Chrome: http://192.168.1.101:9222
[HTTP] ✅ Chrome 连接成功: http://192.168.1.101:9222
[HTTP] ✅ 会话初始化: def-456 (Chrome: http://192.168.1.101:9222)
```

---

## 优势

实现后的优势：

1. ✅ **完全隔离** - 每个开发者使用各自的 Chrome
2. ✅ **集中管理** - 一个 MCP 服务器服务多个开发者
3. ✅ **无干扰** - 标签、扩展、状态完全独立
4. ✅ **安全** - 看不到别人的浏览器内容
5. ✅ **可扩展** - 支持任意数量的客户端

---

## 实现难度评估

| 任务 | 难度 | 工作量 |
|------|------|--------|
| 修改 session 存储结构 | ⭐ 简单 | 10分钟 |
| 从请求获取 Chrome URL | ⭐ 简单 | 15分钟 |
| 会话级 browser 连接 | ⭐⭐ 中等 | 30分钟 |
| 会话关闭时断开 | ⭐ 简单 | 10分钟 |
| 测试和调试 | ⭐⭐ 中等 | 30分钟 |
| **总计** | **⭐⭐ 中等** | **~2 小时** |

---

## 注意事项

### 1. 网络安全

开发者机器需要：
```bash
# 允许 MCP 服务器访问 Chrome 调试端口
sudo ufw allow from 192.168.1.50 to any port 9222
```

### 2. Chrome 启动参数

```bash
chrome \
  --remote-debugging-port=9222 \
  --remote-allow-origins=* \  # 允许跨域访问
  --user-data-dir=/tmp/chrome-debug  # 使用独立的配置目录
```

### 3. 环境变量传递

需要确认 IDE 的 MCP 客户端是否支持 `env` 配置，如不支持，需要使用 HTTP 请求头方式。

---

## 总结

✅ **完全可以实现！**

技术路径清晰：
1. 修改 `server-http.ts`（约 2 小时工作量）
2. 从客户端获取 Chrome URL（环境变量或请求头）
3. 每个会话创建独立 browser
4. 会话结束时断开连接

实现后即可支持：
- 集中式 MCP 服务器
- 每个开发者使用各自的 Chrome
- 完全隔离，互不干扰

**是否现在开始实现？**
