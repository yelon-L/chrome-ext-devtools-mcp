# 远程 MCP 架构设计指南

## 问题分析

当前 MCP 服务器设计存在一个**架构限制**：

```typescript
// server-http.ts 启动时连接 Chrome（服务器级别）
const browser = args.browserUrl
  ? await ensureBrowserConnected({ browserURL: args.browserUrl })
  : await ensureBrowserLaunched({ ... });

// 所有会话共享同一个 browser 实例
const context = await McpContext.from(browser, logger);
```

**核心问题**：
- MCP 服务器在**启动时**连接 Chrome
- 所有客户端**共享同一个** Chrome 实例
- **不支持**每个开发者使用各自的 Chrome

---

## 两种架构方案

### 方案 A：集中式 Chrome（当前实现）❌

```
开发者 A                    MCP 服务器
├─ IDE              ─────→  ├─ MCP HTTP Server
└─ 使用远程 Chrome          ├─ Chrome :9222 (共享)
                            └─ Extensions
开发者 B
├─ IDE              ─────→  (连接同一个 Chrome)
└─ 使用远程 Chrome
```

**问题**：
- ❌ 所有开发者共享同一个 Chrome 实例
- ❌ 互相干扰（打开的标签、扩展状态）
- ❌ 调试冲突（多人同时调试同一个扩展）
- ❌ 安全问题（可以看到别人的浏览器内容）

**结论**：这种架构**不适合**多人使用！

---

### 方案 B：分布式 Chrome（推荐）✅

```
开发者 A 机器                MCP 服务器
├─ IDE              ─────→  ├─ MCP HTTP Server
├─ Chrome :9222     ←─────  │  (无 Chrome)
└─ Extensions               └─ 提供 MCP 工具

开发者 B 机器
├─ IDE              ─────→  (连接同一个 MCP 服务器)
├─ Chrome :9222     ←─────  (但使用各自的 Chrome)
└─ Extensions
```

**优势**：
- ✅ 每个开发者使用自己的 Chrome
- ✅ 完全隔离，互不干扰
- ✅ 调试各自的扩展
- ✅ 安全（看不到别人的浏览器）

**实现需求**：
- MCP 服务器需要支持**会话级别**的 Chrome 连接
- 每个 IDE 连接时提供自己的 Chrome URL
- 每个会话维护独立的 browser 实例

---

## 当前实现的限制

### 问题：服务器级别的 Browser

```typescript
// server-http.ts - 启动时创建 browser（全局）
async function startHTTPServer() {
  const browser = await ensureBrowserConnected({ ... }); // ← 启动时连接
  
  // 创建会话时共享 browser
  const context = await McpContext.from(browser, logger); // ← 所有会话共享
}
```

### 需要的改进：会话级别的 Browser

```typescript
// 理想实现（每个会话独立 browser）
async function handleSession(req, res) {
  const clientBrowserUrl = req.headers['x-chrome-url']; // ← 从客户端获取
  
  const browser = await ensureBrowserConnected({
    browserURL: clientBrowserUrl // ← 每个会话独立
  });
  
  const context = await McpContext.from(browser, logger);
}
```

---

## 解决方案

### 临时方案：每个开发者独立部署

在当前架构限制下，每个开发者需要：

```bash
# 开发者 A 机器
# 1. 启动本地 Chrome
chrome --remote-debugging-port=9222

# 2. 启动本地 MCP（连接本地 Chrome）
PORT=32123 node build/src/server-http.js --browser-url http://localhost:9222

# 3. IDE 配置
{
  "mcpServers": {
    "chrome-extension-debug": {
      "url": "http://localhost:32123/mcp"
    }
  }
}
```

**架构**：
```
开发者 A 机器（独立环境）
├─ IDE
├─ Chrome :9222
└─ MCP Server :32123

开发者 B 机器（独立环境）
├─ IDE
├─ Chrome :9222
└─ MCP Server :32123
```

**优点**：
- ✅ 完全隔离
- ✅ 无需修改代码

**缺点**：
- ❌ 每个开发者需要自己部署
- ❌ 无法集中管理

---

### 长期方案：改进 MCP 支持会话级 Chrome

需要修改 `server-http.ts` 实现：

#### 1. 客户端传递 Chrome URL

**客户端配置**：
```json
{
  "mcpServers": {
    "chrome-extension-debug": {
      "url": "http://mcp-server:3000/mcp",
      "env": {
        "CHROME_URL": "http://192.168.1.100:9222"
      }
    }
  }
}
```

#### 2. 服务器从会话获取 Chrome URL

**修改 server-http.ts**：
```typescript
// 在创建会话时获取 Chrome URL
if (!session) {
  // 从请求头或环境变量获取 Chrome URL
  const chromeBrowserUrl = 
    req.headers['x-chrome-url'] || 
    process.env.CHROME_URL ||
    'http://localhost:9222';
  
  // 为此会话创建独立的 browser 连接
  const browser = await ensureBrowserConnected({
    browserURL: chromeBrowserUrl
  });
  
  const context = await McpContext.from(browser, logger);
  
  // 存储会话特定的 browser
  session = { transport, server: mcpServer, context, browser };
}
```

#### 3. 会话清理时断开 Chrome

```typescript
onsessionclosed: async (sessionId) => {
  const session = sessions.get(sessionId);
  if (session?.browser) {
    await session.browser.close(); // ← 断开此会话的 Chrome
  }
  sessions.delete(sessionId);
}
```

---

## 开发者本地配置（推荐方案）

### 架构

```
开发者 A (192.168.1.100)          MCP 服务器 (192.168.1.50)
├─ IDE                            ├─ Caddy :3000
├─ Chrome :9222 ←─────────────────┤   └─> MCP HTTP :32123
│  └─ Extensions                  └─ 提供工具能力
└─ 配置:
   {
     "url": "http://192.168.1.50:3000/mcp",
     "env": {
       "CHROME_URL": "http://192.168.1.100:9222"
     }
   }

开发者 B (192.168.1.101)
├─ IDE                            (连接同一个 MCP 服务器)
├─ Chrome :9222 ←─────────────────┤ (但使用各自的 Chrome)
│  └─ Extensions
└─ 配置:
   {
     "url": "http://192.168.1.50:3000/mcp",
     "env": {
       "CHROME_URL": "http://192.168.1.101:9222"
     }
   }
```

### 开发者需要做的

#### 1. 启动 Chrome 并开放调试端口

```bash
# 启动 Chrome
google-chrome \
  --remote-debugging-port=9222 \
  --remote-allow-origins=* \
  --user-data-dir=/tmp/chrome-debug

# 开放防火墙（允许 MCP 服务器访问）
sudo ufw allow from 192.168.1.50 to any port 9222
```

#### 2. IDE 配置（指定 Chrome URL）

**Cline / Claude Desktop**：
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

#### 3. 验证连接

```bash
# 测试 Chrome 可访问
curl http://192.168.1.100:9222/json/version

# 从 MCP 服务器测试
ssh user@192.168.1.50
curl http://192.168.1.100:9222/json/version
```

---

## 当前 start-http-mcp.sh 的支持

### 支持的模式

#### 模式 1: 本地模式（自动检测）
```bash
# MCP 服务器和 Chrome 在同一机器
./scripts/start-http-mcp.sh

# 自动检测本地 Chrome (localhost:9222)
# 适合：单人开发、测试
```

#### 模式 2: 指定 Chrome URL
```bash
# MCP 服务器连接到特定 Chrome
BROWSER_URL=http://192.168.1.100:9222 ./scripts/start-http-mcp.sh

# 适合：MCP 服务器连接到开发者的 Chrome
# 问题：只能连接一个 Chrome，不能多人共享
```

#### 模式 3: 远程模式（无预设 Chrome）
```bash
# MCP 服务器启动时不连接 Chrome
# 期望客户端在连接时提供 Chrome URL
BROWSER_URL="" ./scripts/start-http-mcp.sh

# 问题：当前实现不支持从客户端获取 Chrome URL
```

---

## 结论和建议

### 当前最佳实践（无需修改代码）

**每个开发者在自己机器上部署完整环境**：

```bash
# 每个开发者机器上
# 1. 启动 Chrome
chrome --remote-debugging-port=9222

# 2. 启动本地 MCP
PORT=32123 node build/src/server-http.js --browser-url http://localhost:9222

# 3. IDE 配置
{
  "mcpServers": {
    "chrome-extension-debug": {
      "url": "http://localhost:32123/mcp"
    }
  }
}
```

**优点**：
- ✅ 完全隔离，互不干扰
- ✅ 无需网络配置
- ✅ 安全（本地通信）
- ✅ 无需修改代码

**缺点**：
- ❌ 每人需要部署一次
- ❌ 无法集中管理

---

### 未来改进方向

如需真正支持"集中式 MCP + 分布式 Chrome"，需要：

1. **修改 server-http.ts**
   - 支持会话级别的 browser 连接
   - 从客户端获取 Chrome URL
   - 管理多个 browser 实例

2. **修改 MCP SDK**
   - 支持动态 browser 连接
   - 会话隔离

3. **协议扩展**
   - 增加 Chrome URL 传递机制
   - 客户端身份验证

---

## 快速参考

### 单人开发（最简单）
```bash
# 本地运行所有服务
chrome --remote-debugging-port=9222 &
./scripts/start-http-mcp.sh
```

### 多人开发（当前最佳）
```bash
# 每个开发者独立部署
# 开发者 A
./scripts/start-http-mcp.sh

# 开发者 B
./scripts/start-http-mcp.sh
```

### 集中式 MCP（需要代码改进）
```bash
# MCP 服务器
BROWSER_URL="" ./scripts/start-http-mcp.sh

# 开发者客户端配置
{
  "url": "http://mcp-server:3000/mcp",
  "env": {
    "CHROME_URL": "http://开发者IP:9222"
  }
}

# 注意：需要修改 server-http.ts 才能支持
```

---

## 总结

**当前实现**：
- ✅ 支持单人使用（本地或远程）
- ✅ 支持单个 Chrome 实例
- ❌ 不支持多人共享 MCP + 各自 Chrome

**推荐方案**：
- 每个开发者在自己机器上部署完整环境
- 简单、安全、互不干扰

**未来改进**：
- 修改代码支持会话级 browser 连接
- 实现真正的"集中式 MCP + 分布式 Chrome"
