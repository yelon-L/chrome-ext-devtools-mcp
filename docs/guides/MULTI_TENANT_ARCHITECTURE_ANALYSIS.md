# Multi-tenant Architecture Analysis (First Principles)

## 从第一性原理分析 Multi-tenant 模式

### 核心问题：Multi-tenant 的本质是什么？

**答案：一个独立的 HTTP 服务器，支持多用户同时连接，每个用户操作自己的浏览器实例。**

---

## 第一性原理推导

### 1. 需求分析

**需求：**

- 支持多个用户同时使用
- 每个用户有独立的浏览器实例
- 用户之间相互隔离
- 可以远程访问

**结论：** 必须是一个远程可访问的 HTTP 服务，不能使用 stdio。

---

### 2. 传输方式选择

**可选传输方式：**

1. **stdio** - 标准输入输出
   - ❌ 只支持单个进程
   - ❌ 不能远程访问
   - ❌ 不适合多用户

2. **SSE (Server-Sent Events)** - HTTP 流式传输
   - ✅ 支持 HTTP 远程访问
   - ✅ 支持多个客户端连接
   - ✅ 单向推送（服务器 → 客户端）+ POST 请求（客户端 → 服务器）

3. **Streamable HTTP** - HTTP 双向流
   - ✅ 支持 HTTP 远程访问
   - ✅ 支持多个客户端连接
   - ✅ 双向流式通信

**结论：** Multi-tenant **必须使用 SSE 或 Streamable HTTP**，从代码实现看，使用的是 **SSE**。

---

### 3. 架构设计

#### 3.1 服务端架构

```
┌─────────────────────────────────────────────────────────────┐
│                Multi-tenant MCP Server                       │
│                (部署在远程服务器)                              │
│                                                               │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  HTTP Server (Port 32122)                            │   │
│  │                                                       │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌───────────┐ │   │
│  │  │ /health      │  │ /api/register│  │ /sse      │ │   │
│  │  │ /api/users   │  │ /message     │  │ /test     │ │   │
│  │  └──────────────┘  └──────────────┘  └───────────┘ │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                               │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  Core Components                                     │   │
│  │                                                       │   │
│  │  • SessionManager    - 会话管理                      │   │
│  │  • RouterManager     - 路由管理                      │   │
│  │  • AuthManager       - 认证管理                      │   │
│  │  • BrowserPool       - 浏览器连接池                  │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                               │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  User Sessions                                       │   │
│  │                                                       │   │
│  │  User: alice  →  SSEServerTransport  →  McpServer  │   │
│  │  User: bob    →  SSEServerTransport  →  McpServer  │   │
│  │  User: carol  →  SSEServerTransport  →  McpServer  │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

#### 3.2 客户端架构

```
┌──────────────────────┐    ┌──────────────────────┐
│  User: alice         │    │  User: bob           │
│                      │    │                      │
│  ┌────────────────┐ │    │  ┌────────────────┐ │
│  │ Chrome Browser │ │    │  │ Chrome Browser │ │
│  │ :9222          │ │    │  │ :9223          │ │
│  └────────────────┘ │    │  └────────────────┘ │
│          ↑          │    │          ↑          │
│          │          │    │          │          │
│  ┌────────────────┐ │    │  ┌────────────────┐ │
│  │ MCP Client     │ │    │  │ MCP Client     │ │
│  │ (Claude/IDE)   │ │    │  │ (Claude/IDE)   │ │
│  └────────────────┘ │    │  └────────────────┘ │
└──────────────────────┘    └──────────────────────┘
          │                           │
          └─────────── HTTP ──────────┘
                       │
                       ↓
        ┌──────────────────────────┐
        │ Multi-tenant Server      │
        │ http://server.com:32122  │
        └──────────────────────────┘
```

---

### 4. 用户使用流程（正确方式）

#### 步骤 1: 服务器部署

```bash
# 在远程服务器上部署
cd /opt/chrome-extension-debug-mcp

# 方式1: 使用 npm script
npm run server:multi-tenant

# 方式2: 直接运行
PORT=32122 AUTH_ENABLED=true node build/src/multi-tenant/server-multi-tenant.js

# 方式3: 使用环境变量文件
cat > .env <<EOF
PORT=32122
AUTH_ENABLED=true
TOKEN_EXPIRATION=86400000
MAX_SESSIONS=100
SESSION_TIMEOUT=1800000
ALLOWED_ORIGINS=https://app.example.com
EOF

node --env-file=.env build/src/multi-tenant/server-multi-tenant.js
```

**重要：** 服务器必须监听 HTTP 端口，可以通过防火墙/反向代理暴露到公网。

#### 步骤 2: 用户启动浏览器

每个用户在**自己的机器**上启动 Chrome：

```bash
# User alice (本地机器)
google-chrome --remote-debugging-port=9222 \
              --user-data-dir=/tmp/chrome-alice

# User bob (另一台机器)
google-chrome --remote-debugging-port=9222 \
              --user-data-dir=/tmp/chrome-bob
```

**关键点：**

- 每个用户启动自己的 Chrome
- Chrome 必须开启 remote debugging
- 每个用户的端口可以相同（因为在不同机器上）

#### 步骤 3: 用户注册到服务器

```bash
# User alice 注册
curl -X POST http://server.com:32122/api/register \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "alice",
    "browserURL": "http://alice-machine.local:9222"
  }'

# 响应
{
  "success": true,
  "userId": "alice",
  "sseEndpoint": "http://server.com:32122/sse?userId=alice"
}

# User bob 注册
curl -X POST http://server.com:32122/api/register \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "bob",
    "browserURL": "http://bob-machine.local:9222"
  }'
```

**关键点：**

- browserURL 指向用户自己的 Chrome
- 服务器返回专属的 SSE 端点

#### 步骤 4: MCP 客户端连接

用户配置 MCP 客户端（例如 Claude Desktop）：

```json
{
  "mcpServers": {
    "chrome-extension-debug-alice": {
      "transport": {
        "type": "sse",
        "url": "http://server.com:32122/sse?userId=alice"
      }
    }
  }
}
```

---

### 5. 支持的服务端点

#### 5.1 健康检查

```http
GET /health

Response:
{
  "status": "ok",
  "version": "0.8.2",
  "sessions": 3,
  "users": 3
}
```

#### 5.2 用户注册

```http
POST /api/register
Content-Type: application/json

{
  "userId": "alice",
  "browserURL": "http://localhost:9222",
  "metadata": {
    "name": "Alice's Browser",
    "team": "dev"
  }
}

Response:
{
  "success": true,
  "userId": "alice",
  "sseEndpoint": "http://server.com:32122/sse?userId=alice",
  "token": "eyJhbGc..." (如果启用认证)
}
```

#### 5.3 用户列表

```http
GET /api/users

Response:
{
  "users": [
    {
      "userId": "alice",
      "browserURL": "http://localhost:9222",
      "connected": true,
      "lastActivity": "2025-10-13T09:30:00Z"
    },
    {
      "userId": "bob",
      "browserURL": "http://localhost:9223",
      "connected": true,
      "lastActivity": "2025-10-13T09:28:00Z"
    }
  ]
}
```

#### 5.4 SSE 连接（MCP 协议）

```http
GET /sse?userId=alice

Response: (Server-Sent Events)
event: endpoint
data: {"uri":"http://server.com:32122/message?sessionId=xxx"}

event: message
data: {"jsonrpc":"2.0","method":"tools/list",...}
```

#### 5.5 发送消息

```http
POST /message?sessionId=xxx
Content-Type: application/json

{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/list",
  "params": {}
}
```

#### 5.6 测试页面

```http
GET /test

Response: HTML 测试页面，可以在浏览器中测试 SSE 连接
```

---

### 6. 传输模式对比

| 特性         | stdio                            | SSE                       | Streamable                       | Multi-tenant                                         |
| ------------ | -------------------------------- | ------------------------- | -------------------------------- | ---------------------------------------------------- |
| **传输方式** | 标准输入输出                     | HTTP SSE                  | HTTP Stream                      | HTTP SSE                                             |
| **远程访问** | ❌                               | ✅                        | ✅                               | ✅                                                   |
| **多用户**   | ❌                               | ❌ (共享浏览器)           | ❌ (共享浏览器)                  | ✅ (独立浏览器)                                      |
| **用户隔离** | N/A                              | ❌                        | ❌                               | ✅                                                   |
| **部署方式** | 本地                             | 服务器                    | 服务器                           | 服务器                                               |
| **适用场景** | IDE 本地开发                     | 团队共享访问              | 生产 API                         | SaaS 多租户                                          |
| **启动命令** | `npx chrome-extension-debug-mcp` | `npx ... --transport sse` | `npx ... --transport streamable` | `node build/src/multi-tenant/server-multi-tenant.js` |

---

### 7. README 中的错误

#### ❌ 错误的启动命令（第 559-562 行）

```bash
# ❌ 这些命令是错误的，--mode 参数不存在！
npx chrome-extension-debug-mcp@latest --mode multi-tenant
./chrome-extension-debug-mcp --mode multi-tenant
```

#### ✅ 正确的启动命令

```bash
# ✅ 方式1: 使用 npm script
npm run server:multi-tenant

# ✅ 方式2: 直接运行编译后的代码
node build/src/multi-tenant/server-multi-tenant.js

# ✅ 方式3: 带环境变量
PORT=32122 AUTH_ENABLED=true node build/src/multi-tenant/server-multi-tenant.js

# ✅ 方式4: 使用 npm script + 环境变量
PORT=3000 AUTH_ENABLED=false npm run server:multi-tenant
```

---

### 8. 部署到生产环境

#### 8.1 使用 systemd（推荐）

```ini
# /etc/systemd/system/chrome-ext-mcp-multi-tenant.service
[Unit]
Description=Chrome Extension Debug MCP - Multi-tenant Server
After=network.target

[Service]
Type=simple
User=mcp
WorkingDirectory=/opt/chrome-extension-debug-mcp
Environment="PORT=32122"
Environment="AUTH_ENABLED=true"
Environment="NODE_ENV=production"
ExecStart=/usr/bin/node build/src/multi-tenant/server-multi-tenant.js
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

启动服务：

```bash
sudo systemctl daemon-reload
sudo systemctl enable chrome-ext-mcp-multi-tenant
sudo systemctl start chrome-ext-mcp-multi-tenant
```

#### 8.2 使用 Docker

```dockerfile
FROM node:20-slim

# 安装依赖
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

# 复制代码
COPY build ./build

# 环境变量
ENV PORT=32122
ENV AUTH_ENABLED=true

# 暴露端口
EXPOSE 32122

# 启动
CMD ["node", "build/src/multi-tenant/server-multi-tenant.js"]
```

运行：

```bash
docker build -t chrome-ext-mcp-multi-tenant .
docker run -d -p 32122:32122 \
  -e PORT=32122 \
  -e AUTH_ENABLED=true \
  chrome-ext-mcp-multi-tenant
```

#### 8.3 使用 Nginx 反向代理

```nginx
upstream mcp_multi_tenant {
    server 127.0.0.1:32122;
}

server {
    listen 80;
    server_name mcp.example.com;

    location / {
        proxy_pass http://mcp_multi_tenant;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;

        # SSE 需要禁用缓冲
        proxy_buffering off;
        proxy_cache off;
    }
}
```

---

### 9. 安全建议

1. **启用认证**

   ```bash
   AUTH_ENABLED=true node build/src/multi-tenant/server-multi-tenant.js
   ```

2. **限制 CORS**

   ```bash
   ALLOWED_ORIGINS=https://app.example.com node build/src/multi-tenant/server-multi-tenant.js
   ```

3. **使用 HTTPS**
   - 通过 Nginx/Caddy 提供 TLS
   - 或使用 Cloudflare

4. **限制并发用户**

   ```bash
   MAX_SESSIONS=100 node build/src/multi-tenant/server-multi-tenant.js
   ```

5. **设置会话超时**
   ```bash
   SESSION_TIMEOUT=1800000 node build/src/multi-tenant/server-multi-tenant.js
   ```

---

### 10. 总结

#### Multi-tenant 模式的本质

**Multi-tenant 是一个独立的 HTTP 服务器，使用 SSE 传输协议，支持多用户同时连接，每个用户操作自己的浏览器实例。**

#### 关键特征

1. **独立部署** - 不是 stdio 的变体，是完全独立的服务
2. **HTTP 传输** - 使用 SSE (Server-Sent Events)
3. **多用户隔离** - 每个用户有独立的会话和浏览器
4. **远程访问** - 可以部署在远程服务器，通过 HTTP 访问
5. **用户注册** - 用户通过 API 注册自己的浏览器

#### 正确的使用流程

1. **服务器端：** 部署 Multi-tenant 服务器到远程主机
2. **用户端：** 启动自己的 Chrome 实例（开启 remote debugging）
3. **注册：** 用户通过 API 注册到服务器
4. **连接：** MCP 客户端连接到分配的 SSE 端点
5. **使用：** 用户通过 MCP 协议操作自己的浏览器

#### README 需要修正

- ❌ 删除 `--mode multi-tenant` 的错误示例
- ✅ 使用正确的启动命令：`node build/src/multi-tenant/server-multi-tenant.js`
- ✅ 明确说明这是独立的 HTTP 服务，不是传输模式参数

---

## 相关文档

- [Multi-tenant Implementation](./src/multi-tenant/)
- [Mode Messages](./STARTUP_MESSAGES_IMPROVEMENT.md)
- [Configuration Guide](./docs/CONFIG_COMPATIBILITY.md)
