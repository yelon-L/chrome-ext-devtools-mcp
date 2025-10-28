# Chrome DevTools MCP 多租户模式指南

**版本**: v0.8.10  
**最后更新**: 2025-10-14

---

## 📋 概述

多租户模式是 Chrome DevTools MCP 的企业级部署方案，支持多用户同时连接，每个用户管理独立的浏览器实例。

### 核心特性

- ✅ **多用户支持**: 支持 100+ 并发用户
- ✅ **会话隔离**: 每个用户独立的浏览器会话
- ✅ **Token 认证**: 基于 Token 的安全认证
- ✅ **双存储后端**: JSONL (文件) / PostgreSQL (数据库)
- ✅ **RESTful API**: 完整的 V2 API 支持
- ✅ **SSE 长连接**: 实时 MCP 通信

---

## 🚀 快速开始

### 前置条件

1. **Node.js**: v20.19.0+ 或 v22.12.0+
2. **Chrome**: 启动远程调试端口
   ```bash
   google-chrome --remote-debugging-port=9222
   ```
3. **可选 - PostgreSQL**: 用于生产环境

### 启动服务器

#### JSONL 模式（推荐用于开发）

```bash
# 使用编译后的文件
node build/src/multi-tenant/server-multi-tenant.js

# 默认端口 32122
```

#### PostgreSQL 模式（推荐用于生产）

```bash
# 设置数据库配置
export STORAGE_TYPE=postgresql
export DB_HOST=localhost
export DB_PORT=5432
export DB_NAME=mcp_devtools
export DB_USER=admin
export DB_PASSWORD=your_password

# 启动服务器
node build/src/multi-tenant/server-multi-tenant.js
```

---

## 📡 V2 API 文档

### 基础信息

**Base URL**: `http://localhost:32122`  
**Content-Type**: `application/json`  
**认证**: Token (用于 SSE 连接)

### 系统端点

#### 1. 健康检查

**端点**: `GET /health`

**响应示例**:

```json
{
  "status": "ok",
  "version": "0.8.10",
  "sessions": {
    "total": 2,
    "active": 2
  },
  "browsers": {
    "total": 3,
    "connected": 2
  },
  "users": {
    "users": 5,
    "browsers": 8
  }
}
```

**测试命令**:

```bash
curl http://localhost:32122/health | jq .
```

#### 2. 性能指标

**端点**: `GET /metrics`

**响应示例**:

```json
{
  "sessions": {"total": 2, "active": 2},
  "browsers": {"total": 3, "connected": 2},
  "performance": {
    "totalConnections": 150,
    "totalRequests": 1523,
    "totalErrors": 3,
    "avgConnectionTime": "125ms",
    "errorRate": "0.20%"
  },
  "uptime": 3600.5
}
```

### 用户管理 API

#### 1. 注册用户

**端点**: `POST /api/v2/users`

**请求体**:

```json
{
  "email": "user@example.com",
  "username": "Alice"
}
```

**响应**:

```json
{
  "success": true,
  "userId": "user",
  "email": "user@example.com",
  "username": "Alice",
  "registeredAt": "2025-10-14T10:00:00.000Z"
}
```

**测试命令**:

```bash
curl -X POST http://localhost:32122/api/v2/users \
  -H "Content-Type: application/json" \
  -d '{
    "email": "alice@example.com",
    "username": "Alice"
  }' | jq .
```

#### 2. 获取用户详情

**端点**: `GET /api/v2/users/:userId`

**响应**:

```json
{
  "userId": "alice",
  "email": "alice@example.com",
  "username": "Alice",
  "browsers": [
    {
      "browserId": "550e8400-e29b-41d4-a716-446655440000",
      "tokenName": "my-chrome",
      "browserURL": "http://localhost:9222"
    }
  ],
  "createdAt": "2025-10-14T10:00:00.000Z"
}
```

**测试命令**:

```bash
curl http://localhost:32122/api/v2/users/alice | jq .
```

#### 3. 列出所有用户

**端点**: `GET /api/v2/users`

**响应**:

```json
{
  "users": [
    {
      "userId": "alice",
      "email": "alice@example.com",
      "username": "Alice",
      "browserCount": 2,
      "createdAt": "2025-10-14T10:00:00.000Z"
    }
  ],
  "total": 1
}
```

**测试命令**:

```bash
curl http://localhost:32122/api/v2/users | jq .
```

#### 4. 更新用户

**端点**: `PUT /api/v2/users/:userId`

**请求体**:

```json
{
  "username": "Alice Updated"
}
```

**响应**:

```json
{
  "success": true,
  "userId": "alice",
  "username": "Alice Updated",
  "updatedAt": "2025-10-14T10:05:00.000Z"
}
```

**测试命令**:

```bash
curl -X PUT http://localhost:32122/api/v2/users/alice \
  -H "Content-Type: application/json" \
  -d '{"username": "Alice Updated"}' | jq .
```

#### 5. 删除用户

**端点**: `DELETE /api/v2/users/:userId`

**响应**:

```json
{
  "success": true,
  "userId": "alice",
  "deletedBrowsers": ["550e8400-e29b-41d4-a716-446655440000"],
  "message": "User and all associated browsers deleted"
}
```

**测试命令**:

```bash
curl -X DELETE http://localhost:32122/api/v2/users/alice | jq .
```

### 浏览器管理 API

#### 1. 绑定浏览器

**端点**: `POST /api/v2/users/:userId/browsers`

**请求体**:

```json
{
  "browserURL": "http://localhost:9222",
  "tokenName": "my-chrome",
  "description": "开发环境浏览器"
}
```

**响应**:

```json
{
  "success": true,
  "browserId": "550e8400-e29b-41d4-a716-446655440000",
  "token": "mcp_1a2b3c4d5e6f...",
  "tokenName": "my-chrome",
  "browserURL": "http://localhost:9222",
  "message": "Browser bound successfully. Use this token for SSE connection."
}
```

**测试命令**:

```bash
curl -X POST http://localhost:32122/api/v2/users/alice/browsers \
  -H "Content-Type: application/json" \
  -d '{
    "browserURL": "http://localhost:9222",
    "tokenName": "my-chrome",
    "description": "开发环境"
  }' | jq .
```

#### 2. 列出用户浏览器

**端点**: `GET /api/v2/users/:userId/browsers`

**响应**:

```json
{
  "browsers": [
    {
      "browserId": "550e8400-e29b-41d4-a716-446655440000",
      "tokenName": "my-chrome",
      "token": "mcp_1a2b3c4d...",
      "browserURL": "http://localhost:9222",
      "connected": true,
      "description": "开发环境",
      "createdAt": "2025-10-14T10:00:00.000Z"
    }
  ],
  "total": 1
}
```

**测试命令**:

```bash
curl http://localhost:32122/api/v2/users/alice/browsers | jq .
```

#### 3. 获取浏览器详情

**端点**: `GET /api/v2/users/:userId/browsers/:browserId`

**响应**:

```json
{
  "browserId": "550e8400-e29b-41d4-a716-446655440000",
  "userId": "alice",
  "tokenName": "my-chrome",
  "browserURL": "http://localhost:9222",
  "connected": true,
  "lastConnected": "2025-10-14T10:30:00.000Z",
  "toolCallCount": 42,
  "description": "开发环境"
}
```

**测试命令**:

```bash
BROWSER_ID="550e8400-e29b-41d4-a716-446655440000"
curl http://localhost:32122/api/v2/users/alice/browsers/$BROWSER_ID | jq .
```

#### 4. 更新浏览器

**端点**: `PUT /api/v2/users/:userId/browsers/:browserId`

**请求体**:

```json
{
  "browserURL": "http://localhost:9223",
  "description": "更新后的浏览器"
}
```

**响应**:

```json
{
  "success": true,
  "browserId": "550e8400-e29b-41d4-a716-446655440000",
  "tokenName": "my-chrome",
  "browserURL": "http://localhost:9223",
  "description": "更新后的浏览器",
  "message": "Browser updated successfully"
}
```

**测试命令**:

```bash
curl -X PUT http://localhost:32122/api/v2/users/alice/browsers/$BROWSER_ID \
  -H "Content-Type: application/json" \
  -d '{"description": "更新后的浏览器"}' | jq .
```

#### 5. 解绑浏览器

**端点**: `DELETE /api/v2/users/:userId/browsers/:browserId`

**响应**:

```json
{
  "success": true,
  "browserId": "550e8400-e29b-41d4-a716-446655440000",
  "message": "Browser unbound successfully"
}
```

**测试命令**:

```bash
curl -X DELETE http://localhost:32122/api/v2/users/alice/browsers/$BROWSER_ID | jq .
```

### SSE 连接

#### 建立 MCP 连接

**端点**: `GET /sse?token=<token>`

**参数**:

- `token`: 浏览器绑定时返回的 token

**示例**:

```bash
# 建立 SSE 连接
curl -N "http://localhost:32122/sse?token=mcp_1a2b3c4d5e6f..."
```

**JavaScript 客户端**:

```javascript
const token = 'mcp_1a2b3c4d5e6f...';
const eventSource = new EventSource(
  `http://localhost:32122/sse?token=${token}`,
);

eventSource.addEventListener('message', event => {
  const response = JSON.parse(event.data);
  console.log('MCP 响应:', response);
});

eventSource.addEventListener('endpoint', event => {
  const data = JSON.parse(event.data);
  console.log('端点:', data.uri);

  // 发送 MCP 请求
  fetch(data.uri, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/list',
    }),
  });
});
```

---

## 🔧 配置选项

### 环境变量

```bash
# 服务器配置
PORT=32122                      # 服务器端口 (默认: 32122)
HOST=0.0.0.0                    # 绑定地址 (默认: 0.0.0.0)

# 存储配置
STORAGE_TYPE=jsonl              # 存储类型: jsonl | postgresql
DATA_DIR=.mcp-data              # JSONL 数据目录

# PostgreSQL 配置
DB_HOST=localhost               # 数据库主机
DB_PORT=5432                    # 数据库端口
DB_NAME=mcp_devtools            # 数据库名称
DB_USER=admin                   # 数据库用户
DB_PASSWORD=password            # 数据库密码

# 安全配置
AUTH_ENABLED=true               # 启用认证 (默认: true)
ALLOWED_IPS=192.168.1.0/24      # IP 白名单 (CIDR 格式)
ALLOWED_ORIGINS=http://localhost:3000  # CORS 域名白名单

# 性能配置
MAX_SESSIONS=100                # 最大并发会话数
SESSION_TIMEOUT=1800000         # 会话超时 (30分钟)
```

### 启动脚本示例

```bash
#!/bin/bash

# 生产环境配置
export STORAGE_TYPE=postgresql
export DB_HOST=db.example.com
export DB_PORT=5432
export DB_NAME=mcp_production
export DB_USER=mcp_user
export DB_PASSWORD=$(cat /etc/secrets/db_password)

export PORT=32122
export AUTH_ENABLED=true
export ALLOWED_IPS="10.0.0.0/8,172.16.0.0/12"
export MAX_SESSIONS=200

# 启动服务器
node build/src/multi-tenant/server-multi-tenant.js
```

---

## 🎨 Web UI 管理界面

### UI 概述

多租户服务器内置了一个现代化的 Web 管理界面，提供直观的用户和浏览器管理功能。

**访问地址**: `http://localhost:32122/`

**主要功能**:

- ✅ 用户注册和管理
- ✅ 浏览器绑定和配置
- ✅ Token 生成和复制
- ✅ 系统状态监控
- ✅ API 文档查看

### UI 启动和访问

#### 1. 启动服务器

```bash
# JSONL 模式
node build/src/multi-tenant/server-multi-tenant.js

# PostgreSQL 模式
STORAGE_TYPE=postgresql \
DB_HOST=localhost \
DB_PORT=5432 \
DB_NAME=mcp_devtools \
DB_USER=admin \
DB_PASSWORD=password \
node build/src/multi-tenant/server-multi-tenant.js
```

#### 2. 访问 Web UI

打开浏览器访问: `http://localhost:32122/`

### UI 功能说明

#### 首页 - 系统概览

**显示内容**:

- 服务器版本信息
- 存储类型（JSONL / PostgreSQL）
- 实时统计数据：
  - 总用户数
  - 总浏览器数
  - 活跃会话数

**示例**:

```
╔═══════════════════════════════════════╗
║  Chrome DevTools MCP 多租户管理        ║
║  版本: v0.8.10                        ║
║  存储: JSONL                          ║
║                                       ║
║  👥 用户: 5  |  🌐 浏览器: 12         ║
║  ⚡ 活跃会话: 3                       ║
╚═══════════════════════════════════════╝
```

#### Tab 1: 注册用户

**操作步骤**:

1. **填写用户信息**

   ```
   邮箱地址: user@example.com  (必填)
   用户名: Alice               (可选，默认使用邮箱前缀)
   ```

2. **点击"注册用户"按钮**

3. **注册成功后**
   - 系统自动跳转到用户列表
   - 显示新注册的用户信息

**注意事项**:

- ✅ 邮箱必须唯一
- ✅ 用户名可选，为空时使用邮箱@前的部分
- ⚠️ 注册后需要绑定浏览器才能获取 Token

#### Tab 2: 用户列表

**功能**:

- 查看所有注册用户
- 显示用户的浏览器数量
- 管理用户浏览器

**用户卡片显示**:

```
┌─────────────────────────────────────┐
│ 👤 Alice (alice)                    │
│ 📧 alice@example.com                │
│ 🌐 浏览器: 2 个                     │
│                                     │
│ [🔗 管理浏览器] [🗑️ 删除用户]      │
└─────────────────────────────────────┘
```

**操作按钮**:

- **管理浏览器**: 查看和管理该用户的所有浏览器
- **删除用户**: 删除用户及其所有浏览器（谨慎操作）

#### Tab 3: 关于

**显示内容**:

- V2 API 核心特性
- API 端点列表
- 文档链接

### UI 操作流程

#### 完整流程：从注册到使用

**步骤 1: 准备浏览器**

```bash
# 启动 Chrome 并开启远程调试
google-chrome --remote-debugging-port=9222
```

**步骤 2: 注册用户**

1. 访问 `http://localhost:32122/`
2. 点击"注册用户"选项卡
3. 填写邮箱: `alice@example.com`
4. 填写用户名: `Alice`（可选）
5. 点击"注册用户"

**步骤 3: 绑定浏览器**

1. 自动跳转到"用户列表"
2. 找到刚注册的用户 `Alice`
3. 点击"管理浏览器"按钮
4. 在弹出窗口中点击"绑定新浏览器"
5. 填写信息：
   ```
   浏览器 URL: http://localhost:9222
   Token 名称: my-chrome
   描述: 开发环境浏览器
   ```
6. 点击"绑定浏览器"

**步骤 4: 获取 Token**

绑定成功后，系统会显示 Token：

```
┌─────────────────────────────────────┐
│ 🎉 浏览器绑定成功！                 │
│                                     │
│ 访问 Token（请妥善保存）:           │
│ mcp_1a2b3c4d5e6f7g8h9i0j...        │
│                                     │
│ [📋 复制 Token]                     │
└─────────────────────────────────────┘
```

**步骤 5: 使用 Token 连接**

```javascript
// 使用 Token 建立 SSE 连接
const token = 'mcp_1a2b3c4d5e6f...';
const eventSource = new EventSource(
  `http://localhost:32122/sse?token=${token}`,
);

eventSource.addEventListener('message', event => {
  const response = JSON.parse(event.data);
  console.log('收到 MCP 响应:', response);
});
```

### 浏览器管理界面

点击"管理浏览器"后，会弹出浏览器管理窗口：

**显示内容**:

- 用户的所有浏览器列表
- 每个浏览器的详细信息
- 操作按钮

**浏览器卡片**:

```
┌─────────────────────────────────────┐
│ 🌐 my-chrome                        │
│                                     │
│ URL: http://localhost:9222          │
│ 状态: ✅ 已连接                     │
│ Token: mcp_1a2b3c4d...             │
│ 工具调用: 42 次                     │
│                                     │
│ [📋 复制Token] [🗑️ 解绑]           │
└─────────────────────────────────────┘
```

**操作**:

- **复制 Token**: 复制该浏览器的访问 Token
- **解绑**: 删除该浏览器绑定（Token 将失效）

### UI 部署配置

#### 生产环境部署

**1. 通过 Nginx 反向代理**

```nginx
server {
    listen 443 ssl http2;
    server_name mcp.example.com;

    ssl_certificate /etc/ssl/certs/mcp.crt;
    ssl_certificate_key /etc/ssl/private/mcp.key;

    # Web UI
    location / {
        proxy_pass http://localhost:32122;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # SSE 长连接
    location /sse {
        proxy_pass http://localhost:32122/sse;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection '';
        proxy_set_header Host $host;

        # SSE 特殊配置
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;

        # CORS（如需要）
        add_header Access-Control-Allow-Origin *;
    }
}
```

**2. 使用环境变量配置**

```bash
# 服务器配置
export PORT=32122
export HOST=0.0.0.0

# 安全配置
export ALLOWED_IPS="10.0.0.0/8,172.16.0.0/12,192.168.0.0/16"
export ALLOWED_ORIGINS="https://mcp.example.com"

# 启动
node build/src/multi-tenant/server-multi-tenant.js
```

#### Docker 部署（含 UI）

**Dockerfile**:

```dockerfile
FROM node:22-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY build ./build

EXPOSE 32122

CMD ["node", "build/src/multi-tenant/server-multi-tenant.js"]
```

**docker-compose.yml**:

```yaml
version: '3.8'

services:
  mcp-server:
    build: .
    ports:
      - '32122:32122'
    environment:
      - STORAGE_TYPE=postgresql
      - DB_HOST=postgres
      - DB_PORT=5432
      - DB_NAME=mcp_devtools
      - DB_USER=admin
      - DB_PASSWORD=password
      - PORT=32122
      - HOST=0.0.0.0
    depends_on:
      - postgres
    restart: unless-stopped

  postgres:
    image: postgres:16-alpine
    environment:
      - POSTGRES_DB=mcp_devtools
      - POSTGRES_USER=admin
      - POSTGRES_PASSWORD=password
    volumes:
      - postgres-data:/var/lib/postgresql/data
    restart: unless-stopped

  # 可选：Nginx 反向代理
  nginx:
    image: nginx:alpine
    ports:
      - '80:80'
      - '443:443'
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf:ro
      - ./ssl:/etc/ssl:ro
    depends_on:
      - mcp-server
    restart: unless-stopped

volumes:
  postgres-data:
```

### UI 安全性配置

#### 1. IP 白名单

```bash
# 只允许内网访问
ALLOWED_IPS="10.0.0.0/8,172.16.0.0/12,192.168.0.0/16" \
node build/src/multi-tenant/server-multi-tenant.js
```

#### 2. CORS 配置

```bash
# 允许特定域名访问
ALLOWED_ORIGINS="https://admin.example.com,https://app.example.com" \
node build/src/multi-tenant/server-multi-tenant.js
```

#### 3. 添加身份认证（可选）

在 Nginx 层添加基础认证：

```nginx
location / {
    auth_basic "MCP Admin";
    auth_basic_user_file /etc/nginx/.htpasswd;

    proxy_pass http://localhost:32122;
    # ...其他配置
}
```

生成密码文件：

```bash
htpasswd -c /etc/nginx/.htpasswd admin
```

### UI 自定义

UI 界面位于 `src/multi-tenant/public/index.html`，可以根据需要自定义：

**修改主题颜色**:

```css
/* 修改渐变背景 */
body {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  /* 改为: */
  background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%);
}
```

**修改标题**:

```html
<div class="header">
  <h1>Chrome DevTools MCP - 多租户管理</h1>
  <!-- 改为: -->
  <h1>您的公司名 - MCP 管理平台</h1>
</div>
```

**添加公司 Logo**:

```html
<div class="header">
  <img
    src="/logo.png"
    alt="Logo"
    style="height: 60px; margin-bottom: 20px;"
  />
  <h1>Chrome DevTools MCP - 多租户管理</h1>
</div>
```

---

## 🧪 测试指南

### 自动化测试

使用提供的测试脚本进行完整的 API 测试：

```bash
# JSONL 模式测试
./docs/examples/test-multi-tenant-mode.sh jsonl

# PostgreSQL 模式测试
./docs/examples/test-multi-tenant-mode.sh postgresql
```

**测试输出示例**:

```
╔═══════════════════════════════════════════════════════════════════╗
║                  多租户模式测试                                    ║
╚═══════════════════════════════════════════════════════════════════╝

📋 测试配置:
   • 存储类型: jsonl
   • 服务器端口: 32122

═══════════════════════════════════════════════════════════════════
第1部分: 系统端点测试
═══════════════════════════════════════════════════════════════════

🔧 测试 1.1: 健康检查
   响应: {"status":"ok","version":"0.8.10"}
✅ 通过

🔧 测试 1.2: 性能指标
✅ 通过

═══════════════════════════════════════════════════════════════════
第2部分: 用户管理测试
═══════════════════════════════════════════════════════════════════

🔧 测试 2.1: 注册用户
   用户ID: test-1728901234
✅ 通过

🔧 测试 2.2: 获取用户详情
✅ 通过

🔧 测试 2.3: 列出所有用户
   用户数量: 1
✅ 通过

🔧 测试 2.4: 更新用户名
✅ 通过

═══════════════════════════════════════════════════════════════════
第3部分: 浏览器管理测试
═══════════════════════════════════════════════════════════════════

🔧 测试 3.1: 绑定浏览器
   浏览器ID: 550e8400-e29b-41d4-a716-446655440000
   Token: mcp_1a2b3c4d5e6f...
✅ 通过

🔧 测试 3.2: 列出用户浏览器
   浏览器数量: 1
✅ 通过

🔧 测试 3.3: 获取浏览器详情
✅ 通过

🔧 测试 3.4: 更新浏览器描述
✅ 通过

═══════════════════════════════════════════════════════════════════
📊 测试结果总结
═══════════════════════════════════════════════════════════════════

✅ 通过: 13
❌ 失败: 0
🎯 成功率: 100.0%

🎉 所有测试通过！
```

### 手动测试流程

```bash
# 1. 启动服务器
node build/src/multi-tenant/server-multi-tenant.js

# 2. 注册用户
curl -X POST http://localhost:32122/api/v2/users \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","username":"Test User"}' | jq .

# 3. 绑定浏览器
curl -X POST http://localhost:32122/api/v2/users/test/browsers \
  -H "Content-Type: application/json" \
  -d '{"browserURL":"http://localhost:9222","tokenName":"chrome-1"}' | jq .

# 4. 保存返回的 token，建立 SSE 连接
TOKEN="mcp_..."
curl -N "http://localhost:32122/sse?token=$TOKEN"
```

---

## 🎯 部署指南

### 开发环境

```bash
# 1. 克隆仓库
git clone https://github.com/ChromeDevTools/chrome-devtools-mcp
cd chrome-devtools-mcp

# 2. 安装依赖
npm install

# 3. 编译
npm run build

# 4. 启动（JSONL 模式）
node build/src/multi-tenant/server-multi-tenant.js
```

### 生产环境 (Docker)

```dockerfile
FROM node:22-alpine

WORKDIR /app

# 复制文件
COPY package*.json ./
COPY build ./build

# 安装生产依赖
RUN npm ci --only=production

# 暴露端口
EXPOSE 32122

# 启动服务器
CMD ["node", "build/src/multi-tenant/server-multi-tenant.js"]
```

**docker-compose.yml**:

```yaml
version: '3.8'

services:
  mcp-server:
    build: .
    ports:
      - '32122:32122'
    environment:
      - STORAGE_TYPE=postgresql
      - DB_HOST=postgres
      - DB_PORT=5432
      - DB_NAME=mcp_devtools
      - DB_USER=admin
      - DB_PASSWORD=password
    depends_on:
      - postgres

  postgres:
    image: postgres:16-alpine
    environment:
      - POSTGRES_DB=mcp_devtools
      - POSTGRES_USER=admin
      - POSTGRES_PASSWORD=password
    volumes:
      - postgres-data:/var/lib/postgresql/data

volumes:
  postgres-data:
```

### 生产环境 (Systemd)

```ini
# /etc/systemd/system/mcp-server.service
[Unit]
Description=Chrome DevTools MCP Multi-Tenant Server
After=network.target postgresql.service

[Service]
Type=simple
User=mcp
WorkingDirectory=/opt/chrome-devtools-mcp
Environment="STORAGE_TYPE=postgresql"
Environment="DB_HOST=localhost"
Environment="DB_NAME=mcp_devtools"
Environment="DB_USER=mcp_user"
EnvironmentFile=/etc/mcp-server/env
ExecStart=/usr/bin/node build/src/multi-tenant/server-multi-tenant.js
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

```bash
# 启动服务
sudo systemctl enable mcp-server
sudo systemctl start mcp-server

# 查看状态
sudo systemctl status mcp-server

# 查看日志
sudo journalctl -u mcp-server -f
```

---

## 💡 最佳实践

### 1. 安全性

```bash
# 启用 IP 白名单
ALLOWED_IPS="10.0.0.0/8,172.16.0.0/12" \
node build/src/multi-tenant/server-multi-tenant.js

# 使用 HTTPS（通过反向代理）
# Nginx 配置示例
server {
    listen 443 ssl http2;
    server_name mcp.example.com;

    ssl_certificate /etc/ssl/certs/mcp.crt;
    ssl_certificate_key /etc/ssl/private/mcp.key;

    location / {
        proxy_pass http://localhost:32122;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;

        # SSE 支持
        proxy_buffering off;
        proxy_read_timeout 86400;
    }
}
```

### 2. 性能优化

```bash
# PostgreSQL 连接池优化
export DB_MAX_CONNECTIONS=20
export DB_IDLE_TIMEOUT=30000

# 会话管理
export MAX_SESSIONS=200
export SESSION_TIMEOUT=1800000  # 30分钟

# Node.js 内存限制
node --max-old-space-size=4096 build/src/multi-tenant/server-multi-tenant.js
```

### 3. 监控和日志

```bash
# 使用 PM2 管理进程
pm2 start build/src/multi-tenant/server-multi-tenant.js \
    --name mcp-server \
    --instances 2 \
    --env production

# 查看日志
pm2 logs mcp-server

# 监控
pm2 monit
```

---

## 🐛 故障排查

### PostgreSQL 连接失败

```bash
# 1. 测试数据库连接
psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME

# 2. 检查环境变量
env | grep DB_

# 3. 查看服务器日志
tail -f /tmp/multi-tenant-test.log

# 4. 降级到 JSONL 模式
STORAGE_TYPE=jsonl node build/src/multi-tenant/server-multi-tenant.js
```

### SSE 连接断开

```bash
# 1. 检查 token 是否有效
curl http://localhost:32122/api/v2/users/<userId>/browsers | jq '.browsers[].token'

# 2. 检查浏览器是否在线
curl http://localhost:9222/json/version

# 3. 查看服务器日志中的连接错误
```

### 高内存占用

```bash
# 1. 检查活跃会话数
curl http://localhost:32122/metrics | jq '.sessions'

# 2. 清理过期会话
# 服务器会自动清理，或重启服务器

# 3. 增加 Node.js 内存限制
node --max-old-space-size=8192 build/src/multi-tenant/server-multi-tenant.js
```

---

## 📚 API 完整示例

完整的 curl 测试脚本请参见:

- [test-multi-tenant-mode.sh](../examples/test-multi-tenant-mode.sh)
- [test-v2-api-curl.sh](../examples/test-v2-api-curl.sh)

---

**完成时间**: 2025-10-14  
**维护者**: Chrome DevTools MCP Team
