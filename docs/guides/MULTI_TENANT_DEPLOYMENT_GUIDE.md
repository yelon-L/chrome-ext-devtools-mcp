# 多租户模式部署和使用完全指南

**版本**: v0.8.10  
**架构**: V2 API  
**更新日期**: 2025-10-14

## 📋 目录

- [概述](#概述)
- [快速开始](#快速开始)
- [详细部署步骤](#详细部署步骤)
- [Web UI 使用指南](#web-ui-使用指南)
- [V2 API 参考](#v2-api-参考)
- [客户端配置](#客户端配置)
- [生产环境部署](#生产环境部署)
- [监控和维护](#监控和维护)
- [故障排查](#故障排查)

---

## 概述

### 什么是多租户模式？

多租户模式允许多个用户通过同一个 MCP 服务器连接和调试各自的 Chrome 浏览器，每个用户都有独立的：
- ✅ 用户账户（基于邮箱）
- ✅ 浏览器实例（可绑定多个）
- ✅ 访问令牌（独立的 token）
- ✅ 会话管理（互不干扰）

### 架构图

```
┌──────────────┐       ┌──────────────┐       ┌──────────────┐
│  用户 A       │       │  用户 B       │       │  用户 C       │
│  IDE (Claude)│       │  IDE (Cline)  │       │  IDE (Cursor)│
└──────┬───────┘       └──────┬───────┘       └──────┬───────┘
       │                      │                      │
       │  Token: mcp_aaa...   │  Token: mcp_bbb...  │  Token: mcp_ccc...
       │                      │                      │
       └──────────────────────┼──────────────────────┘
                              │
                    ┌─────────▼──────────┐
                    │  MCP 多租户服务器   │
                    │  :32122            │
                    │  - V2 API          │
                    │  - Web UI          │
                    │  - 性能监控         │
                    └─────────┬──────────┘
                              │
       ┌──────────────────────┼──────────────────────┐
       │                      │                      │
┌──────▼───────┐      ┌──────▼───────┐      ┌──────▼───────┐
│ Chrome :9222 │      │ Chrome :9222 │      │ Chrome :9223 │
│ (用户 A)     │      │ (用户 B)     │      │ (用户 C)     │
└──────────────┘      └──────────────┘      └──────────────┘
```

### V2 API 特性

- 🔐 **基于邮箱注册** - 用户使用邮箱注册，系统自动生成 userId
- 🌐 **多浏览器支持** - 每个用户可以绑定多个浏览器
- 🔑 **独立 Token** - 每个浏览器有独立的访问令牌
- 📊 **性能监控** - 内置 PerformanceMonitor 和缓存系统
- 🎨 **Web UI** - 友好的用户管理界面

---

## 快速开始

### 1. 构建项目

```bash
cd chrome-ext-devtools-mcp
npm install
npm run build
```

### 2. 启动服务器

```bash
# 使用默认配置（端口 32122）
node build/src/multi-tenant/server-multi-tenant.js

# 或使用环境变量
PORT=3000 node build/src/multi-tenant/server-multi-tenant.js
```

### 3. 验证服务器

```bash
# 健康检查
curl http://localhost:32122/health

# 应该返回
{
  "status": "ok",
  "version": "0.8.10",
  ...
}
```

### 4. 打开 Web UI

访问: http://localhost:32122

---

## 详细部署步骤

### 步骤 1: 准备浏览器（用户端）

每个用户需要在自己的机器上启动 Chrome 调试端口：

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

**验证浏览器**:
```bash
curl http://localhost:9222/json/version
```

### 步骤 2: 注册用户

#### 方式 A: 使用 Web UI（推荐）

1. 访问 http://localhost:32122
2. 点击"注册"标签
3. 填写邮箱和用户名
4. 点击"注册用户"

#### 方式 B: 使用 curl

```bash
curl -X POST http://localhost:32122/api/v2/users \
  -H "Content-Type: application/json" \
  -d '{
    "email": "alice@example.com",
    "username": "Alice"
  }'
```

**响应**:
```json
{
  "success": true,
  "userId": "alice",
  "email": "alice@example.com",
  "username": "Alice",
  "createdAt": "2025-10-14T06:00:00.000Z"
}
```

### 步骤 3: 绑定浏览器

#### 方式 A: 使用 Web UI（推荐）

1. 在用户列表中点击"🌐 浏览器"按钮
2. 点击"➕ 绑定新浏览器"
3. 填写浏览器地址（如 `http://localhost:9222`）
4. 填写浏览器名称（可选）
5. 点击"✅ 绑定"
6. 复制生成的 Token

#### 方式 B: 使用 curl

```bash
curl -X POST http://localhost:32122/api/v2/users/alice/browsers \
  -H "Content-Type: application/json" \
  -d '{
    "browserURL": "http://localhost:9222",
    "tokenName": "my-chrome",
    "description": "我的开发浏览器"
  }'
```

**响应**:
```json
{
  "success": true,
  "browserId": "550e8400-e29b-41d4-a716-446655440000",
  "token": "mcp_6291881537c923eaa44b27b9381e49ee786244437dc2eb06e40305ff7905d227",
  "tokenName": "my-chrome",
  "browserURL": "http://localhost:9222",
  "browser": {
    "connected": true,
    "info": {
      "browser": "Chrome/141.0.7390.54",
      "protocolVersion": "1.3"
    }
  },
  "createdAt": "2025-10-14T06:01:00.000Z"
}
```

⚠️ **重要**: 保存好这个 Token！它是访问浏览器的唯一凭证。

### 步骤 4: 配置客户端（IDE）

#### Claude Desktop

编辑配置文件:
- **Mac**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
- **Linux**: `~/.config/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "chrome-devtools": {
      "command": "node",
      "args": ["/path/to/chrome-ext-devtools-mcp/build/src/index.js"],
      "env": {
        "CHROME_REMOTE_URL": "http://localhost:32122/api/v2/sse",
        "CHROME_TOKEN": "mcp_6291881537c923eaa44b27b9381e49ee786244437dc2eb06e40305ff7905d227"
      }
    }
  }
}
```

#### Cline (VS Code)

在 VS Code 设置中添加:

```json
{
  "mcp.servers": {
    "chrome-devtools": {
      "command": "node",
      "args": ["/path/to/chrome-ext-devtools-mcp/build/src/index.js"],
      "env": {
        "CHROME_REMOTE_URL": "http://localhost:32122/api/v2/sse",
        "CHROME_TOKEN": "mcp_6291881537c923eaa44b27b9381e49ee786244437dc2eb06e40305ff7905d227"
      }
    }
  }
}
```

#### Cursor

类似 Cline，在 Cursor 设置中配置。

### 步骤 5: 测试连接

重启 IDE，然后在 AI 对话中测试：

```
你：列出我的 Chrome 扩展
AI：[调用 list_extensions 工具...]
```

---

## Web UI 使用指南

### 访问 Web UI

打开浏览器访问: http://localhost:32122

### 功能概览

#### 1. 用户管理

- **查看用户列表** - 显示所有注册用户及其浏览器数量
- **注册新用户** - 使用邮箱和用户名注册
- **更新用户** - 修改用户名
- **删除用户** - 删除用户及其所有浏览器

#### 2. 浏览器管理

- **查看浏览器列表** - 显示用户的所有浏览器
- **绑定新浏览器** - 为用户添加新的浏览器
- **查看 Token** - 显示和复制浏览器的访问令牌
- **解绑浏览器** - 删除浏览器并撤销其 Token

#### 3. 系统监控

- **用户统计** - 显示总用户数和总浏览器数
- **健康状态** - 实时显示服务器健康状态
- **使用指南** - 内置的使用说明和 API 文档

### 使用流程（图文）

#### 注册用户

1. 点击"注册"标签页
2. 输入邮箱（必填）
3. 输入用户名（可选）
4. 点击"✅ 注册用户"

#### 绑定浏览器

1. 在用户列表中找到你的用户
2. 点击"🌐 浏览器"按钮
3. 点击"➕ 绑定新浏览器"
4. 输入浏览器 URL（如 `http://localhost:9222`）
5. 输入浏览器名称（可选，如 "我的 Chrome"）
6. 点击"✅ 绑定"
7. **复制生成的 Token** 并保存

#### 管理浏览器

- **查看 Token**: 点击 Token 旁边的 📋 按钮复制
- **解绑浏览器**: 点击"🗑️ 解绑"按钮
- **添加多个浏览器**: 重复绑定流程

---

## V2 API 参考

### 基础URL

```
http://localhost:32122/api/v2
```

### 端点列表

#### 1. 用户管理

##### 注册用户
```http
POST /api/v2/users
Content-Type: application/json

{
  "email": "user@example.com",
  "username": "User Name"
}
```

##### 获取所有用户
```http
GET /api/v2/users
```

##### 获取单个用户
```http
GET /api/v2/users/:userId
```

##### 更新用户名
```http
PATCH /api/v2/users/:userId
Content-Type: application/json

{
  "username": "New Name"
}
```

##### 删除用户
```http
DELETE /api/v2/users/:userId
```

#### 2. 浏览器管理

##### 绑定浏览器
```http
POST /api/v2/users/:userId/browsers
Content-Type: application/json

{
  "browserURL": "http://localhost:9222",
  "tokenName": "my-browser",
  "description": "描述信息"
}
```

##### 获取用户的所有浏览器
```http
GET /api/v2/users/:userId/browsers
```

##### 获取单个浏览器信息
```http
GET /api/v2/users/:userId/browsers/:browserId
```

##### 更新浏览器
```http
PATCH /api/v2/users/:userId/browsers/:browserId
Content-Type: application/json

{
  "browserURL": "http://localhost:9223",
  "description": "新的描述"
}
```

##### 解绑浏览器
```http
DELETE /api/v2/users/:userId/browsers/:browserId
```

#### 3. 系统端点

##### 健康检查
```http
GET /health
```

##### 性能指标
```http
GET /metrics
```

##### SSE 连接
```http
GET /api/v2/sse?token=mcp_xxx...
```

### 完整示例

查看 `docs/examples/test-v2-api-curl.sh` 获取完整的 API 使用示例。

---

## 客户端配置

### 环境变量

| 变量 | 说明 | 必需 | 示例 |
|------|------|------|------|
| `CHROME_REMOTE_URL` | SSE 连接地址 | 是 | `http://localhost:32122/api/v2/sse` |
| `CHROME_TOKEN` | 浏览器访问令牌 | 是 | `mcp_62918815...` |

### 配置示例

#### 本地开发
```json
{
  "CHROME_REMOTE_URL": "http://localhost:32122/api/v2/sse",
  "CHROME_TOKEN": "mcp_..."
}
```

#### 局域网部署
```json
{
  "CHROME_REMOTE_URL": "http://192.168.1.100:32122/api/v2/sse",
  "CHROME_TOKEN": "mcp_..."
}
```

#### 远程部署（HTTPS）
```json
{
  "CHROME_REMOTE_URL": "https://mcp.yourdomain.com/api/v2/sse",
  "CHROME_TOKEN": "mcp_..."
}
```

---

## 生产环境部署

### 使用 systemd

创建 `/etc/systemd/system/mcp-multi-tenant.service`:

```ini
[Unit]
Description=MCP Multi-Tenant Server v0.8.10
After=network.target

[Service]
Type=simple
User=mcp
WorkingDirectory=/opt/chrome-ext-devtools-mcp
Environment="PORT=32122"
Environment="NODE_ENV=production"
ExecStart=/usr/bin/node build/src/multi-tenant/server-multi-tenant.js
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
```

启动:
```bash
sudo systemctl enable mcp-multi-tenant
sudo systemctl start mcp-multi-tenant
sudo systemctl status mcp-multi-tenant
```

查看日志:
```bash
sudo journalctl -u mcp-multi-tenant -f
```

### 使用 Docker

#### Dockerfile

```dockerfile
FROM node:20-alpine

WORKDIR /app

# 安装依赖
COPY package*.json ./
RUN npm ci --only=production

# 复制源代码
COPY . .
RUN npm run build

# 创建数据目录
RUN mkdir -p /app/.mcp-data

# 暴露端口
EXPOSE 32122

# 环境变量
ENV PORT=32122
ENV NODE_ENV=production

# 启动服务
CMD ["node", "build/src/multi-tenant/server-multi-tenant.js"]
```

#### docker-compose.yml

```yaml
version: '3.8'

services:
  mcp-server:
    build: .
    ports:
      - "32122:32122"
    volumes:
      - ./data:/app/.mcp-data
    environment:
      - PORT=32122
      - NODE_ENV=production
    restart: unless-stopped
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"
```

构建和运行:
```bash
docker-compose up -d
docker-compose logs -f
```

### 使用 PM2

```bash
# 安装 PM2
npm install -g pm2

# 启动
pm2 start build/src/multi-tenant/server-multi-tenant.js \
  --name mcp-multi-tenant \
  --env production

# 保存配置
pm2 save

# 开机自启
pm2 startup

# 查看状态
pm2 status

# 查看日志
pm2 logs mcp-multi-tenant
```

### Nginx 反向代理（HTTPS）

```nginx
upstream mcp_backend {
    server 127.0.0.1:32122;
    keepalive 64;
}

server {
    listen 443 ssl http2;
    server_name mcp.yourdomain.com;
    
    ssl_certificate /path/to/fullchain.pem;
    ssl_certificate_key /path/to/privkey.pem;
    
    # SSL 配置
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;
    
    # 代理设置
    location / {
        proxy_pass http://mcp_backend;
        proxy_http_version 1.1;
        
        # SSE 支持
        proxy_set_header Connection '';
        proxy_buffering off;
        proxy_cache off;
        chunked_transfer_encoding off;
        
        # Headers
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # Timeouts
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 3600s;
    }
}

# HTTP 重定向到 HTTPS
server {
    listen 80;
    server_name mcp.yourdomain.com;
    return 301 https://$server_name$request_uri;
}
```

---

## 监控和维护

### 健康检查

```bash
# 简单检查
curl http://localhost:32122/health

# 详细检查（带格式化）
curl -s http://localhost:32122/health | jq
```

### 性能监控

```bash
# 查看性能指标
curl -s http://localhost:32122/metrics | jq

# 监控热门端点
curl -s http://localhost:32122/metrics | jq '.topEndpoints'

# 监控慢端点
curl -s http://localhost:32122/metrics | jq '.slowestEndpoints'

# 查看缓存状态
curl -s http://localhost:32122/metrics | jq '.cache'
```

### 数据备份

```bash
# 备份数据目录
tar -czf mcp-data-backup-$(date +%Y%m%d).tar.gz .mcp-data/

# 定期备份（添加到 crontab）
0 2 * * * cd /opt/chrome-ext-devtools-mcp && tar -czf backup/mcp-data-$(date +\%Y\%m\%d).tar.gz .mcp-data/
```

### 日志管理

```bash
# systemd 日志
sudo journalctl -u mcp-multi-tenant -f

# PM2 日志
pm2 logs mcp-multi-tenant

# Docker 日志
docker-compose logs -f mcp-server
```

---

## 故障排查

### 问题 1: 无法连接到服务器

**症状**: `curl: (7) Failed to connect to localhost port 32122`

**解决方案**:
1. 检查服务器是否运行: `ps aux | grep server-multi-tenant`
2. 检查端口是否监听: `lsof -i :32122`
3. 查看服务器日志查找错误
4. 检查防火墙规则

### 问题 2: 浏览器绑定失败

**症状**: `Failed to connect to browser`

**解决方案**:
1. 验证浏览器调试端口:
   ```bash
   curl http://localhost:9222/json/version
   ```
2. 确认浏览器启动参数正确
3. 检查防火墙是否阻止连接
4. 尝试使用 IP 地址而非 localhost

### 问题 3: Token 无效

**症状**: `Invalid token` 或 `Token not found`

**解决方案**:
1. 检查 Token 是否正确复制（完整的 64 字符）
2. 验证浏览器是否已解绑
3. 在 Web UI 中重新查看 Token
4. 必要时重新绑定浏览器

### 问题 4: SSE 连接断开

**症状**: IDE 显示 "Connection lost"

**解决方案**:
1. 检查网络连接
2. 查看服务器日志
3. 增加代理服务器的超时时间（如 Nginx）
4. IDE 会自动重连，等待几秒钟

### 问题 5: 性能问题

**症状**: 响应慢或超时

**解决方案**:
1. 查看性能指标: `/metrics`
2. 检查慢端点: `curl -s http://localhost:32122/metrics | jq '.slowestEndpoints'`
3. 增加服务器资源（CPU/内存）
4. 减少并发连接数
5. 检查浏览器网络延迟

---

## 常见问题

### Q: 多个用户可以绑定同一个浏览器吗？

A: 可以，但不推荐。多个用户操作同一浏览器会互相干扰。建议每个用户使用独立的浏览器实例。

### Q: Token 会过期吗？

A: 当前版本的 Token 不会自动过期，但会在浏览器解绑时被撤销。

### Q: 数据存储在哪里？

A: 默认存储在 `.mcp-data/store-v2.jsonl` 文件中。可以通过配置使用 PostgreSQL 数据库。

### Q: 支持 HTTPS 吗？

A: 服务器本身不支持 HTTPS，需要使用 Nginx 等反向代理添加 HTTPS 支持。

### Q: 可以同时连接多少个用户？

A: 理论上无限制。实际取决于服务器资源。建议进行压力测试。

### Q: 如何迁移数据到新服务器？

A: 复制 `.mcp-data/` 目录到新服务器即可。

---

## 获取帮助

- **文档**: [docs/guides/](../README.md)
- **API 文档**: [docs/guides/V2_API_MIGRATION_GUIDE.md](./V2_API_MIGRATION_GUIDE.md)
- **测试脚本**: [docs/examples/test-v2-api-curl.sh](../examples/test-v2-api-curl.sh)
- **GitHub Issues**: https://github.com/ChromeDevTools/chrome-devtools-mcp/issues

---

## 附录

### 环境变量完整列表

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `PORT` | 32122 | 服务器端口 |
| `NODE_ENV` | development | 运行环境 |
| `ALLOWED_IPS` | 无 | IP 白名单（逗号分隔） |
| `ALLOWED_ORIGINS` | * | CORS 允许的来源 |
| `MAX_SESSIONS` | 无限制 | 最大会话数 |
| `SESSION_TIMEOUT` | 3600000 | 会话超时（毫秒） |

### 端口列表

| 端口 | 用途 |
|------|------|
| 32122 | 多租户服务器默认端口 |
| 9222 | Chrome 调试端口（默认） |
| 9223+ | 额外的 Chrome 实例 |

### 文件结构

```
.mcp-data/
├── store-v2.jsonl        # 用户和浏览器数据
└── auth-store.jsonl      # (旧版，已废弃)
```

---

**文档版本**: v1.0  
**最后更新**: 2025-10-14  
**维护者**: Chrome DevTools MCP Team
