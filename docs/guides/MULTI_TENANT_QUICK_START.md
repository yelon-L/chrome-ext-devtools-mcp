> ⚠️ **文档已废弃** - 本文档已合并到 [Multi-Tenant 完整文档](../MULTI_TENANT_COMPLETE.md)
> 请使用新的统一文档以获取最新信息。

# Multi-tenant Mode - Quick Start Guide

## 什么是 Multi-tenant 模式？

**Multi-tenant 是一个独立的 HTTP 服务器**，允许多个用户同时连接，每个用户操作自己的浏览器实例。

### 核心特点

✅ **远程可访问** - 部署在服务器上，通过 HTTP 访问  
✅ **多用户隔离** - 每个用户有独立的会话和浏览器  
✅ **用户自带浏览器** - 用户连接自己机器上的 Chrome  
✅ **SSE 传输** - 使用 Server-Sent Events 协议

---

## 快速开始

### 1. 启动服务器

```bash
# 方式 1: 使用 npm script
npm run server:multi-tenant

# 方式 2: 直接运行
node build/src/multi-tenant/server-multi-tenant.js

# 方式 3: 自定义配置
PORT=32122 AUTH_ENABLED=true node build/src/multi-tenant/server-multi-tenant.js
```

**服务器启动后：**

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🏢 MULTI-TENANT MODE - Enterprise SaaS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✓ Server running on http://localhost:32122
✓ Each user connects to their OWN browser instance

📡 API Endpoints:
   Health:       http://localhost:32122/health
   Register:     POST http://localhost:32122/api/register
   User SSE:     http://localhost:32122/sse?userId=alice
```

---

### 2. 用户启动浏览器

每个用户在自己的机器上启动 Chrome：

```bash
# 用户 alice
google-chrome --remote-debugging-port=9222 \
              --user-data-dir=/tmp/chrome-alice

# 用户 bob（另一台机器）
google-chrome --remote-debugging-port=9222 \
              --user-data-dir=/tmp/chrome-bob
```

---

### 3. 注册用户

```bash
# 注册 alice
curl -X POST http://localhost:32122/api/register \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "alice",
    "browserURL": "http://alice-machine.local:9222"
  }'

# 响应
{
  "success": true,
  "userId": "alice",
  "sseEndpoint": "http://localhost:32122/sse?userId=alice"
}
```

---

### 4. 配置 MCP 客户端

在 Claude Desktop 或其他 MCP 客户端中配置：

```json
{
  "mcpServers": {
    "chrome-extension-debug-alice": {
      "transport": {
        "type": "sse",
        "url": "http://localhost:32122/sse?userId=alice"
      }
    }
  }
}
```

---

## 环境变量配置

| 变量               | 说明                   | 默认值         |
| ------------------ | ---------------------- | -------------- |
| `PORT`             | 服务器端口             | 32122          |
| `AUTH_ENABLED`     | 启用认证               | false          |
| `TOKEN_EXPIRATION` | Token 过期时间（毫秒） | 86400000 (24h) |
| `MAX_SESSIONS`     | 最大并发用户           | 100            |
| `SESSION_TIMEOUT`  | 会话超时（毫秒）       | 1800000 (30m)  |
| `ALLOWED_ORIGINS`  | CORS 允许的来源        | \*             |

**示例：**

```bash
PORT=3000 \
AUTH_ENABLED=true \
MAX_SESSIONS=50 \
node build/src/multi-tenant/server-multi-tenant.js
```

---

## API 端点

### 健康检查

```http
GET /health

{
  "status": "ok",
  "version": "0.8.2",
  "sessions": 2,
  "users": 2
}
```

### 注册用户

```http
POST /api/register
Content-Type: application/json

{
  "userId": "alice",
  "browserURL": "http://localhost:9222"
}
```

### 用户列表

```http
GET /api/users

{
  "users": [
    {"userId": "alice", "connected": true},
    {"userId": "bob", "connected": true}
  ]
}
```

### SSE 连接

```http
GET /sse?userId=alice

# Server-Sent Events 流
```

### 测试页面

```http
GET /test

# 浏览器测试页面
```

---

## 与其他模式的区别

| 模式             | 启动命令                                             | 远程访问 | 多用户 | 独立浏览器 |
| ---------------- | ---------------------------------------------------- | -------- | ------ | ---------- |
| **stdio**        | `npx chrome-extension-debug-mcp`                     | ❌       | ❌     | N/A        |
| **SSE**          | `npx ... --transport sse --port 3000`                | ✅       | ✅     | ❌ (共享)  |
| **Streamable**   | `npx ... --transport streamable --port 3000`         | ✅       | ✅     | ❌ (共享)  |
| **Multi-tenant** | `node build/src/multi-tenant/server-multi-tenant.js` | ✅       | ✅     | ✅ (独立)  |

**关键区别：**

- **stdio/SSE/Streamable**: 所有用户共享同一个浏览器实例
- **Multi-tenant**: 每个用户连接自己的浏览器实例，完全隔离

---

## 部署到生产环境

### 使用 systemd

```ini
# /etc/systemd/system/mcp-multi-tenant.service
[Unit]
Description=Chrome Extension Debug MCP - Multi-tenant
After=network.target

[Service]
Type=simple
User=mcp
WorkingDirectory=/opt/chrome-extension-debug-mcp
Environment="PORT=32122"
Environment="AUTH_ENABLED=true"
ExecStart=/usr/bin/node build/src/multi-tenant/server-multi-tenant.js
Restart=always

[Install]
WantedBy=multi-user.target
```

### 使用 Docker

```dockerfile
FROM node:20-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY build ./build
ENV PORT=32122
EXPOSE 32122
CMD ["node", "build/src/multi-tenant/server-multi-tenant.js"]
```

### 使用 Nginx 反向代理

```nginx
upstream mcp_backend {
    server 127.0.0.1:32122;
}

server {
    listen 80;
    server_name mcp.example.com;

    location / {
        proxy_pass http://mcp_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";

        # SSE 需要禁用缓冲
        proxy_buffering off;
        proxy_cache off;
    }
}
```

---

## 常见问题

### Q: 为什么没有 `--mode multi-tenant` 参数？

**A:** Multi-tenant 是一个独立的服务器程序，不是传输模式参数。正确的启动方式是：

```bash
node build/src/multi-tenant/server-multi-tenant.js
```

### Q: Multi-tenant 使用什么传输协议？

**A:** Multi-tenant 内部使用 **SSE (Server-Sent Events)** 传输协议。这是硬编码的，不需要通过参数指定。

### Q: 可以使用 Streamable HTTP 吗？

**A:** Multi-tenant 当前实现使用 SSE。如果需要 Streamable HTTP，可以修改源码或使用独立的 SSE/Streamable 服务器（但那样所有用户会共享同一个浏览器）。

### Q: 用户的浏览器必须在哪里运行？

**A:** 用户的浏览器在**用户自己的机器**上运行。服务器只是作为 MCP 协议的代理，连接用户的客户端和浏览器。

### Q: 如何保证用户隔离？

**A:** 每个用户有：

- 独立的 `userId`
- 独立的 SSE 连接（`/sse?userId=xxx`）
- 独立的 MCP Server 实例
- 连接到自己的浏览器实例

---

## 架构图

```
┌─────────────┐         ┌─────────────────────────────┐
│ User: alice │         │  Multi-tenant Server        │
│             │         │  (Remote: server.com:32122) │
│ ┌─────────┐ │         │                             │
│ │ Chrome  │◄├─────────┤  Session: alice             │
│ │ :9222   │ │         │  └─ SSE Transport           │
│ └─────────┘ │         │     └─ MCP Server           │
│             │         │                             │
│ ┌─────────┐ │  HTTP   │  Session: bob               │
│ │MCP      │◄├─────────┤  └─ SSE Transport           │
│ │Client   │ │   SSE   │     └─ MCP Server           │
│ └─────────┘ │         │                             │
└─────────────┘         └─────────────────────────────┘
                                      │
┌─────────────┐                       │
│ User: bob   │         HTTP/SSE      │
│             │◄──────────────────────┘
│ ┌─────────┐ │
│ │ Chrome  │◄├─── 连接到自己的浏览器
│ │ :9222   │ │
│ └─────────┘ │
└─────────────┘
```

---

## 相关文档

- [Architecture Analysis](./MULTI_TENANT_ARCHITECTURE_ANALYSIS.md) - 第一性原理分析
- [Mode Messages](./STARTUP_MESSAGES_IMPROVEMENT.md) - 启动信息优化
- [Configuration Guide](./docs/CONFIG_COMPATIBILITY.md) - 配置兼容性

---

**Version:** 0.8.2  
**Last Updated:** 2025-10-13
