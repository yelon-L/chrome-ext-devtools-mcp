> ⚠️ **文档已废弃** - 本文档已合并到 [Multi-Tenant 完整文档](../MULTI_TENANT_COMPLETE.md)
> 请使用新的统一文档以获取最新信息。

# 多租户 MCP 代理使用指南

## 快速开始

### 1. 构建项目

```bash
cd chrome-ext-devtools-mcp
npm install
npm run build
```

### 2. 启动多租户服务器

```bash
# 默认端口 32122
node build/src/multi-tenant/server-multi-tenant.js

# 或指定端口
PORT=3000 node build/src/multi-tenant/server-multi-tenant.js

# 禁用认证（开发环境）
AUTH_ENABLED=false PORT=3000 node build/src/multi-tenant/server-multi-tenant.js
```

启动后你会看到：

```
╔════════════════════════════════════════════════════════╗
║   Chrome DevTools MCP - Multi-Tenant Server           ║
╚════════════════════════════════════════════════════════╝

[Server] 🌐 服务器已启动
[Server] 📡 端口: 32122
[Server] 🔗 端点:
      - Health:   http://localhost:32122/health
      - Register: http://localhost:32122/api/register
      - SSE:      http://localhost:32122/sse
      - Message:  http://localhost:32122/message
      - Test:     http://localhost:32122/test
      
[Server] 🔐 认证: 已启用
[Server] 传输方式: Server-Sent Events (SSE)
[Server] 按 Ctrl+C 停止
```

## 使用场景

### 场景 1: 开发者各自调试自己的浏览器

```
┌─────────────────┐        ┌─────────────────┐
│  开发者 A        │        │  开发者 B        │
│  Chrome :9222   │        │  Chrome :9223   │
│  IDE (Cline)    │        │  IDE (Claude)   │
└────────┬────────┘        └────────┬────────┘
         │                          │
         └──────────┬───────────────┘
                    │
         ┌──────────▼──────────┐
         │ MCP Multi-Tenant    │
         │ Server :32122       │
         └─────────────────────┘
```

## 完整使用流程

### 步骤 1: 启动本地 Chrome（开发者侧）

每个开发者在自己的机器上启动 Chrome：

**Windows:**
```powershell
"C:\Program Files\Google\Chrome\Application\chrome.exe" `
  --remote-debugging-port=9222 `
  --user-data-dir="C:\tmp\chrome-debug"
```

**Mac:**
```bash
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
  --remote-debugging-port=9222 \
  --user-data-dir=/tmp/chrome-debug
```

**Linux:**
```bash
google-chrome \
  --remote-debugging-port=9222 \
  --user-data-dir=/tmp/chrome-debug
```

### 步骤 2: 注册到多租户服务器

**方式 A: 使用 curl**

```bash
# 开发者 A 注册
curl -X POST http://192.168.1.50:32122/api/register \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "developer-a",
    "browserURL": "http://192.168.1.100:9222",
    "metadata": {
      "name": "Alice",
      "email": "alice@example.com"
    }
  }'

# 开发者 B 注册
curl -X POST http://192.168.1.50:32122/api/register \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "developer-b",
    "browserURL": "http://192.168.1.101:9222",
    "metadata": {
      "name": "Bob",
      "email": "bob@example.com"
    }
  }'
```

**方式 B: 使用测试页面**

访问 `http://192.168.1.50:32122/test`，在页面上填写：
- User ID: `developer-a`
- Browser URL: `http://192.168.1.100:9222`

点击"注册"按钮。

### 步骤 3: 配置 IDE

#### Cline (VS Code)

编辑 VS Code 设置 (`.vscode/settings.json` 或用户设置):

```json
{
  "mcp.servers": {
    "chrome-devtools-multi-tenant": {
      "url": "http://192.168.1.50:32122/sse",
      "headers": {
        "X-User-Id": "developer-a"
      }
    }
  }
}
```

#### Claude Desktop

编辑配置文件:
- **Mac**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "chrome-devtools-multi-tenant": {
      "url": "http://192.168.1.50:32122/sse",
      "headers": {
        "X-User-Id": "developer-a"
      }
    }
  }
}
```

### 步骤 4: 使用 MCP 工具

现在在 IDE 中，AI 助手可以使用所有 Chrome 扩展调试工具：

```
# AI: 让我列出你的 Chrome 扩展
→ 调用 list_extensions

# AI: 我看到你有一个叫 "My Extension" 的扩展
# 让我查看它的上下文
→ 调用 list_extension_contexts

# AI: 我将在 background context 中执行代码
→ 调用 switch_extension_context
→ 调用 evaluate_in_extension
```

## API 参考

### 1. 健康检查

**端点**: `GET /health`

**响应**:
```json
{
  "status": "ok",
  "version": "0.8.1",
  "sessions": {
    "total": 2,
    "active": 2,
    "byUser": {
      "developer-a": 1,
      "developer-b": 1
    }
  },
  "browsers": {
    "total": 2,
    "connected": 2,
    "disconnected": 0,
    "reconnecting": 0,
    "failed": 0
  },
  "users": {
    "totalUsers": 2,
    "users": ["developer-a", "developer-b"]
  },
  "uptime": 3600
}
```

### 2. 用户注册

**端点**: `POST /api/register`

**请求头**:
```
Content-Type: application/json
Authorization: Bearer <token>  (如果启用认证)
```

**请求体**:
```json
{
  "userId": "developer-a",
  "browserURL": "http://192.168.1.100:9222",
  "metadata": {
    "name": "Alice",
    "email": "alice@example.com"
  }
}
```

**响应**:
```json
{
  "success": true,
  "userId": "developer-a",
  "browserURL": "http://192.168.1.100:9222",
  "message": "User registered successfully"
}
```

### 3. 查询用户列表

**端点**: `GET /api/users`

**请求头**:
```
Authorization: Bearer <token>  (如果启用认证)
```

**响应**:
```json
{
  "users": [
    {
      "userId": "developer-a",
      "browserURL": "http://192.168.1.100:9222",
      "registeredAt": "2025-01-12T10:00:00.000Z",
      "metadata": {
        "name": "Alice",
        "email": "alice@example.com"
      }
    }
  ]
}
```

### 4. 查询用户状态

**端点**: `GET /api/users/:userId/status`

**响应**:
```json
{
  "userId": "developer-a",
  "browserURL": "http://192.168.1.100:9222",
  "browserStatus": "connected",
  "activeSessions": 1,
  "registeredAt": "2025-01-12T10:00:00.000Z"
}
```

### 5. SSE 连接

**端点**: `GET /sse`

**请求头**:
```
X-User-Id: developer-a
Authorization: Bearer <token>  (如果启用认证)
```

**响应**: Server-Sent Events 流

### 6. 发送消息

**端点**: `POST /message?sessionId=<sessionId>`

**请求体**: MCP JSON-RPC 消息

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "list_extensions",
    "arguments": {}
  }
}
```

## 认证配置

### 启用/禁用认证

```bash
# 禁用认证（开发环境）
AUTH_ENABLED=false node build/src/multi-tenant/server-multi-tenant.js

# 启用认证（默认）
AUTH_ENABLED=true node build/src/multi-tenant/server-multi-tenant.js
```

### 生成 Token（编程方式）

```typescript
import {AuthManager} from './src/multi-tenant/core/AuthManager.js';

const authManager = new AuthManager({
  enabled: true,
  tokenExpiration: 86400, // 24 小时
});

// 生成 Token
const token = authManager.generateToken('developer-a', ['*']);
console.log(`Token: ${token}`);

// 在请求中使用
// Authorization: Bearer mcp_xxx...
```

### 配置预定义 Token

```typescript
const authManager = new AuthManager({
  enabled: true,
  tokens: new Map([
    ['secret-token-1', {
      userId: 'developer-a',
      permissions: ['*'],
    }],
    ['secret-token-2', {
      userId: 'developer-b',
      permissions: ['read'],
    }],
  ]),
});
```

## 故障排查

### 问题 1: 无法连接到浏览器

**错误**: `Failed to connect to browser`

**解决方案**:
1. 确认 Chrome 已启动且端口正确
2. 检查防火墙是否阻止连接
3. 验证浏览器 URL 可访问:
   ```bash
   curl http://localhost:9222/json/version
   ```

### 问题 2: Session not found

**错误**: `Session not found`

**原因**: 会话已过期或已被清理

**解决方案**:
1. 重新连接 SSE
2. 增加会话超时时间（修改代码）

### 问题 3: User not registered

**错误**: `User not registered`

**解决方案**:
1. 先调用 `/api/register` 注册用户
2. 确认 userId 正确

### 问题 4: Authorization failed

**错误**: `Authorization header is required`

**解决方案**:
1. 在请求头中添加 `Authorization: Bearer <token>`
2. 或禁用认证: `AUTH_ENABLED=false`

## 监控和日志

### 查看服务器状态

```bash
# 健康检查
curl http://localhost:32122/health | jq

# 查看用户列表
curl http://localhost:32122/api/users | jq

# 查看特定用户状态
curl http://localhost:32122/api/users/developer-a/status | jq
```

### 日志输出

服务器会输出以下日志：

```
[Server] 📡 新的 SSE 连接: developer-a
[SessionManager] 会话已创建: sess_xxx (用户: developer-a)
[BrowserConnectionPool] 连接到浏览器: http://localhost:9222
[BrowserConnectionPool] 连接成功: developer-a (browser_xxx)
[Server] ✅ 会话建立: sess_xxx (用户: developer-a)
```

## 性能优化

### 1. 调整会话超时

编辑 `server-multi-tenant.ts`:

```typescript
this.sessionManager = new SessionManager({
  timeout: 7200000, // 2 小时
  cleanupInterval: 60000,
});
```

### 2. 调整浏览器健康检查间隔

```typescript
this.browserPool = new BrowserConnectionPool({
  healthCheckInterval: 60000, // 60 秒
  maxReconnectAttempts: 5,
  reconnectDelay: 10000,
});
```

### 3. 启用连接池

同一用户的多个会话会自动共享浏览器连接。

## 安全最佳实践

### 1. 启用 HTTPS

使用反向代理（Nginx/Caddy）添加 HTTPS:

```nginx
server {
    listen 443 ssl;
    server_name mcp.yourdomain.com;
    
    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;
    
    location / {
        proxy_pass http://localhost:32122;
        proxy_http_version 1.1;
        proxy_set_header Connection '';
        proxy_buffering off;
    }
}
```

### 2. 网络隔离

```bash
# 只允许特定 IP 访问
iptables -A INPUT -p tcp --dport 32122 -s 192.168.1.0/24 -j ACCEPT
iptables -A INPUT -p tcp --dport 32122 -j DROP
```

### 3. 启用认证

始终在生产环境启用认证：

```bash
AUTH_ENABLED=true node build/src/multi-tenant/server-multi-tenant.js
```

### 4. 使用强 Token

生成长度 >= 32 字符的随机 Token。

## 生产部署

### 使用 systemd

创建 `/etc/systemd/system/mcp-multi-tenant.service`:

```ini
[Unit]
Description=MCP Multi-Tenant Server
After=network.target

[Service]
Type=simple
User=mcp
WorkingDirectory=/opt/chrome-ext-devtools-mcp
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
sudo systemctl enable mcp-multi-tenant
sudo systemctl start mcp-multi-tenant
sudo systemctl status mcp-multi-tenant
```

### 使用 Docker

创建 `Dockerfile`:

```dockerfile
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .
RUN npm run build

EXPOSE 32122

ENV PORT=32122
ENV AUTH_ENABLED=true

CMD ["node", "build/src/multi-tenant/server-multi-tenant.js"]
```

构建和运行：

```bash
docker build -t mcp-multi-tenant .
docker run -d -p 32122:32122 --name mcp-server mcp-multi-tenant
```

### 使用 PM2

```bash
npm install -g pm2

# 启动
pm2 start build/src/multi-tenant/server-multi-tenant.js \
  --name mcp-multi-tenant \
  --env production

# 保存配置
pm2 save

# 开机自启
pm2 startup
```

## 常见问题

### Q: 多个用户可以连接到同一个浏览器吗？

A: 可以。多个用户可以注册相同的 `browserURL`。但这样他们会操作同一个浏览器实例，可能互相干扰。推荐每个用户使用独立的浏览器。

### Q: 会话会自动清理吗？

A: 会。超过 1 小时（默认）无活动的会话会被自动清理。可以通过 `SessionManager` 配置调整。

### Q: 浏览器崩溃后会自动重连吗？

A: 会。`BrowserConnectionPool` 会自动检测断开并尝试重连（最多 3 次）。

### Q: 支持多少并发用户？

A: 理论上无限制。实际取决于服务器资源和网络带宽。建议进行压力测试。

### Q: 可以在公网部署吗？

A: 可以，但务必：
1. 启用 HTTPS
2. 启用认证
3. 配置防火墙
4. 使用强 Token
5. 定期更新

## 获取帮助

- **文档**: [docs/MULTI_TENANT_ARCHITECTURE.md](./MULTI_TENANT_ARCHITECTURE.md)
- **测试**: [docs/MULTI_TENANT_TEST_PLAN.md](./MULTI_TENANT_TEST_PLAN.md)
- **开发规范**: [docs/MULTI_TENANT_DEV_STANDARDS.md](./MULTI_TENANT_DEV_STANDARDS.md)
- **GitHub Issues**: https://github.com/ChromeDevTools/chrome-devtools-mcp/issues
