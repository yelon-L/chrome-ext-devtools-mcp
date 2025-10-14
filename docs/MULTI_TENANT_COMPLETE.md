# Multi-Tenant MCP Server 完整指南

**版本:** 0.8.7  
**更新:** 2025-10-13  
**维护:** 统一文档，替代 docs/guides 中的多个分散文档

---

## 📚 快速导航

- [基础概念](#基础概念) - 什么是多租户，为什么需要
- [快速开始](#快速开始) - 5分钟上手
- [参数配置](#参数配置) - 所有配置项说明
- [API接口](#api接口) - 完整 REST API 文档
- [架构设计](#架构设计) - 核心组件和数据流
- [使用场景](#使用场景) - 典型应用场景
- [部署指南](#部署指南) - 生产环境部署
- [最佳实践](#最佳实践) - 性能优化和安全配置
- [故障排查](#故障排查) - 常见问题解决

---

## 基础概念

### 什么是 Multi-Tenant？

**多租户模式** = 一个服务器 + 多个用户 + 各自独立的浏览器

```
              MCP Server (192.168.1.5:32122)
                        ↓
    ┌───────────────────┼───────────────────┐
    ↓                   ↓                   ↓
  Alice              Bob                Carol
  (9222)            (9223)             (9224)
```

每个用户：
- ✅ 独立的浏览器实例
- ✅ 独立的会话和上下文
- ✅ 完全隔离，互不影响
- ✅ 可选的 Token 认证

### 为什么需要？

| 场景 | 传统方式 | Multi-Tenant |
|------|---------|--------------|
| 团队开发 | 每人一个服务器 | 共享一个服务器 |
| 资源消耗 | N × 服务器资源 | 1 × 服务器资源 |
| 管理复杂度 | N × 配置管理 | 1 × 集中管理 |
| 成本 | 高 | 低 |

---

## 快速开始

### 1. 启动服务器

```bash
# 方法1: 使用二进制文件（推荐）
./chrome-extension-debug-linux-x64 --mode multi-tenant

# 方法2: npm
npx chrome-extension-debug-mcp@latest --mode multi-tenant

# 方法3: 开发模式
npm run start:multi-tenant
```

**启动成功:**
```
🚀 Multi-Tenant MCP Server
📍 Port: 32122
🔐 Auth: disabled
✅ Server started
```

### 2. 注册用户

```bash
curl -X POST http://localhost:32122/api/register \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "alice",
    "browserURL": "http://localhost:9222"
  }'
```

### 3. 获取 Token（如启用认证）

```bash
curl -X POST http://localhost:32122/api/auth/token \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "alice",
    "tokenName": "my-laptop"
  }'
```

### 4. 配置 Claude Desktop

`claude_desktop_config.json`:
```json
{
  "mcpServers": {
    "chrome-debug": {
      "url": "http://localhost:32122/sse?userId=alice",
      "headers": {
        "Authorization": "Bearer mcp_YOUR_TOKEN_HERE"
      }
    }
  }
}
```

### 5. 测试连接

```bash
# 检查健康状态
curl http://localhost:32122/health | jq .

# 查看已注册用户（需要 Token）
curl -H "Authorization: Bearer mcp_YOUR_TOKEN_HERE" \
  http://localhost:32122/api/users | jq .
```

---

## 参数配置

### CLI 参数

```bash
# 基础用法
./chrome-extension-debug --mode multi-tenant

# 指定端口
./chrome-extension-debug --mode multi-tenant --port 8080

# 无头模式
./chrome-extension-debug --mode multi-tenant --headless

# 指定视口
./chrome-extension-debug --mode multi-tenant --viewport 1920x1080
```

### 环境变量

#### 基础配置

```bash
PORT=32122                    # 服务器端口
MAX_SESSIONS=100              # 最大会话数
SESSION_TIMEOUT=1800000       # 会话超时(ms, 30分钟)
```

#### 认证配置

```bash
AUTH_ENABLED=true             # 启用Token认证
AUTH_TOKEN_EXPIRATION=0       # Token过期时间(秒, 0=永久)
```

#### 安全配置

```bash
ALLOWED_IPS=192.168.1.0/24,10.0.0.1    # IP白名单(CIDR)
ALLOWED_ORIGINS=https://app.com         # CORS来源
```

#### CDP 配置

```bash
USE_CDP_HYBRID=true           # 启用CDP混合模式
USE_CDP_OPERATIONS=true       # 使用CDP操作
```

#### 存储配置

```bash
DATA_DIR=./multi-tenant-data  # 数据目录
```

### 配置示例

**开发环境:**
```bash
PORT=32122 \
MAX_SESSIONS=100 \
./chrome-extension-debug --mode multi-tenant
```

**生产环境:**
```bash
AUTH_ENABLED=true \
ALLOWED_IPS=192.168.1.0/24 \
MAX_SESSIONS=50 \
SESSION_TIMEOUT=3600000 \
DATA_DIR=/var/lib/mcp \
./chrome-extension-debug --mode multi-tenant
```

**局域网共享:**
```bash
ALLOWED_IPS=192.168.1.0/24 \
ALLOWED_ORIGINS=* \
./chrome-extension-debug --mode multi-tenant
```

---

## API接口

### 用户管理

#### 注册用户
```http
POST /api/register
Content-Type: application/json

{
  "userId": "alice",
  "browserURL": "http://localhost:9222",
  "metadata": {         // 可选
    "name": "Alice",
    "email": "alice@example.com"
  }
}

Response: {"userId": "alice", "registered": true}
```

#### 注销用户
```http
POST /api/unregister
Content-Type: application/json

{
  "userId": "alice"
}

Response: {"userId": "alice", "unregistered": true}
```

#### 查询用户
```http
GET /api/users/{userId}
Authorization: Bearer mcp_YOUR_TOKEN_HERE

Response: {
  "userId": "alice",
  "browserURL": "http://localhost:9222",
  "browserStatus": "not_connected",
  "activeSessions": 0,
  "registeredAt": "2025-10-13T15:56:40.327Z"
}
```

#### 列出所有用户
```http
GET /api/users
Authorization: Bearer mcp_YOUR_TOKEN_HERE

Response: {
  "users": [
    {
      "userId": "alice",
      "browserURL": "http://localhost:9222",
      "registeredAt": "2025-10-13T15:56:40.327Z",
      "metadata": {
        "name": "Alice",
        "email": "alice@example.com"
      }
    }
  ]
}
```

**注意**: 此端点需要认证（AUTH_ENABLED=true 时）

### 认证管理

#### 生成 Token
```http
POST /api/auth/token
Content-Type: application/json

{
  "userId": "alice",
  "tokenName": "my-laptop"
}

Response: {
  "token": "mcp_a1b2c3...",
  "userId": "alice",
  "tokenName": "my-laptop"
}
```

#### 列出 Tokens
```http
GET /api/auth/tokens/{userId}

Response: {
  "tokens": [
    {"token": "mcp_...", "tokenName": "laptop"},
    {"token": "mcp_...", "tokenName": "desktop"}
  ]
}
```

#### 删除 Token
```http
DELETE /api/auth/token
Content-Type: application/json

{
  "token": "mcp_a1b2c3..."
}

Response: {"deleted": true}
```

### MCP 连接

#### SSE 连接
```http
GET /sse?userId=alice
Authorization: Bearer mcp_a1b2c3...

Response: (Server-Sent Events stream)
data: Use this endpoint: POST http://localhost:32122/message?sessionId=xxx
```

#### 发送 MCP 消息
```http
POST /message?sessionId=xxx
Content-Type: application/json

{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "list_extensions",
    "arguments": {"includeDisabled": true}
  }
}

Response: (via SSE stream)
```

### 监控接口

#### 健康检查
```http
GET /health

Response: {
  "status": "ok",
  "version": "0.8.7",
  "sessions": {"total": 5, "active": 3},
  "browsers": {"total": 3, "connected": 3},
  "users": {"totalUsers": 3},
  "performance": {
    "totalRequests": 250,
    "errorRate": "0.8%"
  },
  "uptime": 3600.5
}
```

---

## 架构设计

### 系统架构

```
┌────────────────────────────────────────────────────────┐
│            Multi-Tenant MCP Server                     │
├────────────────────────────────────────────────────────┤
│                                                        │
│  ┌──────────────┐  ┌──────────────┐  ┌─────────────┐ │
│  │SessionManager│  │RouterManager │  │ AuthManager │ │
│  └──────┬───────┘  └──────┬───────┘  └──────┬──────┘ │
│         └─────────────────┼──────────────────┘        │
│                           │                           │
│  ┌────────────────────────┴─────────────────────┐    │
│  │     BrowserConnectionPool                   │    │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐     │    │
│  │  │Browser 1│  │Browser 2│  │Browser N│     │    │
│  │  └─────────┘  └─────────┘  └─────────┘     │    │
│  └──────────────────────────────────────────────┘    │
│                                                        │
│  ┌──────────────────────────────────────────────┐    │
│  │   PersistentStore (users/tokens/logs)       │    │
│  └──────────────────────────────────────────────┘    │
└────────────────────────────────────────────────────────┘
```

### 核心组件

**SessionManager** - 会话管理
- 创建/销毁 Session
- 维护生命周期
- 定期清理过期会话
- 提供查询和统计

**RouterManager** - 路由管理
- 用户注册/注销
- 维护 userId ↔ browserURL 映射
- 查询用户信息
- 路由统计

**AuthManager** - 认证管理
- Token 生成（32字节随机）
- Token 验证
- Token 管理（列表、删除）
- 认证统计

**BrowserConnectionPool** - 连接池
- 浏览器连接管理
- 健康检查（10秒间隔）
- 自动重连（最多3次）
- 连接统计

**PersistentStore** - 持久化
- 用户记录 (users.jsonl)
- Token 记录 (tokens.jsonl)
- 操作日志 (operations.log)

### 数据流

```
1. 客户端 SSE 连接 → AuthManager 验证
2. RouterManager 查找用户浏览器
3. BrowserConnectionPool 连接浏览器
4. SessionManager 创建 Session
5. 返回 Session ID
6. 客户端发送 MCP 请求
7. SessionManager 路由到 MCP Server
8. 处理并返回结果
```

---

## 使用场景

### 场景1: 团队协作开发

**需求:** 3-5人团队，共享服务器，各自调试

**配置:**
```bash
# 服务器
AUTH_ENABLED=true \
ALLOWED_IPS=192.168.1.0/24 \
./chrome-extension-debug --mode multi-tenant

# 成员注册
curl -X POST http://server:32122/api/register \
  -d '{"userId":"alice","browserURL":"http://192.168.1.10:9222"}'
```

### 场景2: 远程调试多环境

**需求:** test/staging/prod 环境集中管理

**配置:**
```bash
# 注册多环境
for env in test staging prod; do
  curl -X POST http://server:32122/api/register \
    -d "{\"userId\":\"$env\",\"browserURL\":\"http://$env-server:9222\"}"
done
```

### 场景3: 教学演示

**需求:** 20-30学生同时连接

**配置:**
```bash
AUTH_ENABLED=false \
MAX_SESSIONS=50 \
SESSION_TIMEOUT=7200000 \
./chrome-extension-debug --mode multi-tenant
```

### 场景4: CI/CD 并行测试

**需求:** Pipeline 并行运行多个测试

**配置:**
```bash
# CI脚本
for i in {1..10}; do
  curl -X POST http://mcp:32122/api/register \
    -d "{\"userId\":\"ci-$i\",\"browserURL\":\"http://chrome-$i:9222\"}" &
done
```

---

## 部署指南

### Docker 部署

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY chrome-extension-debug-linux-x64 .
EXPOSE 32122

ENV AUTH_ENABLED=true
ENV MAX_SESSIONS=100

CMD ["./chrome-extension-debug-linux-x64", "--mode", "multi-tenant"]
```

```bash
docker build -t mcp-multi-tenant .
docker run -d -p 32122:32122 \
  -e AUTH_ENABLED=true \
  -e ALLOWED_IPS=192.168.1.0/24 \
  mcp-multi-tenant
```

### Systemd 服务

```ini
[Unit]
Description=MCP Multi-Tenant Server
After=network.target

[Service]
Type=simple
User=mcp
WorkingDirectory=/opt/mcp
Environment="PORT=32122"
Environment="AUTH_ENABLED=true"
Environment="MAX_SESSIONS=100"
ExecStart=/opt/mcp/chrome-extension-debug --mode multi-tenant
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable mcp-multi-tenant
sudo systemctl start mcp-multi-tenant
sudo systemctl status mcp-multi-tenant
```

### Nginx 反向代理

```nginx
upstream mcp_backend {
    server localhost:32122;
}

server {
    listen 80;
    server_name mcp.example.com;

    location / {
        proxy_pass http://mcp_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_read_timeout 3600s;
    }
}
```

---

## 最佳实践

### 性能优化

1. **合理设置会话数**
   ```bash
   # 根据服务器资源调整
   MAX_SESSIONS=50  # 4GB RAM
   MAX_SESSIONS=100 # 8GB RAM
   MAX_SESSIONS=200 # 16GB RAM
   ```

2. **启用 CDP 混合模式**
   ```bash
   USE_CDP_HYBRID=true
   USE_CDP_OPERATIONS=true
   ```

3. **调整会话超时**
   ```bash
   # 短期任务
   SESSION_TIMEOUT=600000  # 10分钟
   
   # 长期任务
   SESSION_TIMEOUT=7200000 # 2小时
   ```

### 安全配置

1. **启用认证**
   ```bash
   AUTH_ENABLED=true
   ```

2. **限制 IP 访问**
   ```bash
   ALLOWED_IPS=192.168.1.0/24,10.0.0.0/8
   ```

3. **限制 CORS 来源**
   ```bash
   ALLOWED_ORIGINS=https://trusted.com
   ```

4. **使用 HTTPS**
   ```bash
   # 通过 Nginx/Caddy 提供 TLS
   ```

### 监控和日志

1. **启用日志文件**
   ```bash
   ./chrome-extension-debug --mode multi-tenant \
     --logFile /var/log/mcp/server.log
   ```

2. **监控健康状态**
   ```bash
   # 定期检查
   */5 * * * * curl -s http://localhost:32122/health | jq .status
   ```

3. **设置告警**
   ```bash
   # 监控错误率
   curl -s http://localhost:32122/health | jq .performance.errorRate
   ```

---

## 故障排查

### 问题1: 连接失败

**症状:** 客户端无法连接 SSE

**排查:**
```bash
# 1. 检查服务器是否运行
curl http://localhost:32122/health

# 2. 检查端口是否开放
netstat -tulpn | grep 32122

# 3. 检查防火墙
sudo ufw status

# 4. 查看日志
journalctl -u mcp-multi-tenant -f
```

**解决:**
- 确保服务器已启动
- 开放防火墙端口: `sudo ufw allow 32122`
- 检查 ALLOWED_IPS 配置

### 问题2: Token 认证失败

**症状:** 401 Unauthorized

**排查:**
```bash
# 1. 验证 Token
curl -X POST http://localhost:32122/api/auth/validate \
  -H "Authorization: Bearer mcp_xxx"

# 2. 列出用户 Tokens
curl http://localhost:32122/api/auth/tokens/alice
```

**解决:**
- 重新生成 Token
- 检查 Token 格式（必须以 `mcp_` 开头）
- 确认 Token 未被删除

### 问题3: Session 超时

**症状:** Session not found

**排查:**
```bash
# 检查 Session 统计
curl http://localhost:32122/health | jq .sessions
```

**解决:**
- 增加超时时间: `SESSION_TIMEOUT=7200000`
- 保持连接活跃（定期发送请求）

### 问题4: 浏览器连接失败

**症状:** Cannot connect to browser

**排查:**
```bash
# 1. 检查浏览器是否启动
curl http://localhost:9222/json/version

# 2. 检查网络连通性
ping localhost

# 3. 查看连接池状态
curl http://localhost:32122/health | jq .browsers
```

**解决:**
- 启动 Chrome: `chrome --remote-debugging-port=9222`
- 检查防火墙规则
- 验证 browserURL 配置

### 问题5: 性能问题

**症状:** 响应缓慢

**排查:**
```bash
# 1. 检查系统资源
top
free -h
df -h

# 2. 检查会话数
curl http://localhost:32122/health | jq .sessions

# 3. 检查错误率
curl http://localhost:32122/health | jq .performance.errorRate
```

**解决:**
- 减少 MAX_SESSIONS
- 启用 CDP_HYBRID
- 增加服务器资源
- 清理过期会话

---

## 附录

### 相关文档

**本文档替代以下文档（不再单独维护）:**
- `docs/guides/MULTI_TENANT_README.md`
- `docs/guides/MULTI_TENANT_QUICK_START.md`
- `docs/guides/MULTI_TENANT_USAGE.md`
- `docs/guides/MULTI_TENANT_ARCHITECTURE.md`
- `docs/guides/MULTI_TENANT_LAN_BEST_PRACTICES.md`
- `docs/guides/MULTI_TENANT_DEV_STANDARDS.md`

**保留的专题文档:**
- `docs/guides/MULTI_TENANT_ARCHITECTURE_ANALYSIS.md` - 深度架构分析
- `docs/guides/MULTI_TENANT_TEST_PLAN.md` - 测试计划
- `docs/guides/MULTI_TENANT_COMPLETE_TEST.md` - 完整测试
- `docs/guides/MULTI_TENANT_USER_FLOW_COMPARISON.md` - 用户流程对比

### 版本历史

**v0.8.7 (2025-10-13)**
- 添加视觉检测回退功能
- 统一多租户文档

**v0.8.6 (2025-10-13)**
- 修复 Session 管理竞态条件
- 增强 help 文档

**v0.8.5 及之前**
- 多租户核心功能实现

### 支持

- GitHub: https://github.com/GoogleChromeLabs/chrome-devtools-mcp
- Issues: https://github.com/GoogleChromeLabs/chrome-devtools-mcp/issues
- 文档: docs/MULTI_TENANT_COMPLETE.md

---

**文档状态:** ✅ 完整  
**维护方式:** 统一维护，定期更新  
**反馈渠道:** GitHub Issues
