# AUTH_ENABLED 认证问题修复

## 问题描述

用户报告当 `AUTH_ENABLED=true` 时遇到以下问题：

### 问题 1: Token 生成端点不存在

```bash
curl -X POST http://localhost:32122/api/auth/token \
  -H "Content-Type: application/json" \
  -d '{"userId": "alice", "permissions": ["*"]}'

# 返回: Not found
```

### 问题 2: 注册需要认证

```bash
curl -X POST http://localhost:32122/api/register \
  -H "Content-Type: application/json" \
  -d '{"userId": "alice", "browserURL": "http://localhost:9222"}'

# 返回: {"error":"Authorization header is required"}
```

### 根本原因

1. ❌ **`/api/auth/token` 端点不存在** - README 中提到的端点没有实现
2. ❌ **循环依赖** - 用户需要 token 才能注册，但获取 token 的端点不存在

---

## ✅ 修复方案

### 添加 `/api/auth/token` 端点

**文件：** `src/multi-tenant/server-multi-tenant.ts`

**新增路由：**

```typescript
} else if (url.pathname === '/api/auth/token' && req.method === 'POST') {
  await this.handleGenerateToken(req, res);
}
```

**新增处理函数：**

```typescript
/**
 * 生成认证 Token
 */
private async handleGenerateToken(
  req: http.IncomingMessage,
  res: http.ServerResponse
): Promise<void> {
  // 读取请求体
  const body = await this.readRequestBody(req);

  // 解析JSON
  let data;
  try {
    data = JSON.parse(body);
  } catch (parseError) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      error: 'INVALID_JSON',
      message: 'Request body must be valid JSON',
    }));
    return;
  }

  const { userId, permissions, expiresIn } = data;

  // 验证参数
  if (!userId) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      error: 'userId is required',
    }));
    return;
  }

  // 生成 token
  const token = this.authManager.generateToken(
    userId,
    permissions || ['*'],
    expiresIn
  );

  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    success: true,
    token,
    userId,
    permissions: permissions || ['*'],
    expiresIn: expiresIn || 86400,
  }));
}
```

---

## ✅ 正确的使用流程

### 步骤 1: 启动服务器（启用认证）

```bash
AUTH_ENABLED=true node build/src/index.js --mode multi-tenant
```

或使用二进制文件：

```bash
AUTH_ENABLED=true ./dist/chrome-extension-debug-linux-x64 --mode multi-tenant
```

**输出：**

```
✅ Multi-tenant server started successfully
   Authentication: Enabled  # ← 认证已启用
```

---

### 步骤 2: 生成 Token

```bash
curl -X POST http://localhost:32122/api/auth/token \
  -H "Content-Type: application/json" \
  -d '{"userId": "alice", "permissions": ["*"]}'
```

**响应：**

```json
{
  "success": true,
  "token": "mcp_3Z4Fh4jHpzWSGiVFLOXAZsIugew4jOj_",
  "userId": "alice",
  "permissions": ["*"],
  "expiresIn": 86400
}
```

**参数说明：**

- `userId` (必需): 用户 ID
- `permissions` (可选): 权限列表，默认 `["*"]` (全部权限)
- `expiresIn` (可选): 过期时间（秒），默认 86400 (24小时)

---

### 步骤 3: 使用 Token 注册用户

```bash
curl -X POST http://localhost:32122/api/register \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer mcp_3Z4Fh4jHpzWSGiVFLOXAZsIugew4jOj_" \
  -d '{"userId": "alice", "browserURL": "http://localhost:9225"}'
```

**响应：**

```json
{
  "success": true,
  "userId": "alice",
  "browserURL": "http://localhost:9225",
  "message": "User registered successfully"
}
```

---

### 步骤 4: 后续 API 调用都需要带 Token

**查询用户列表：**

```bash
curl -H "Authorization: Bearer mcp_3Z4Fh4jHpzWSGiVFLOXAZsIugew4jOj_" \
  http://localhost:32122/api/users
```

**连接 SSE：**

```bash
curl -N -H "Authorization: Bearer mcp_3Z4Fh4jHpzWSGiVFLOXAZsIugew4jOj_" \
  -H "Accept: text/event-stream" \
  "http://localhost:32122/sse?userId=alice"
```

---

## 📋 完整示例

### 多用户场景

```bash
# 1. 启动服务器
AUTH_ENABLED=true node build/src/index.js --mode multi-tenant

# 2. 为 Alice 生成 token
ALICE_TOKEN=$(curl -s -X POST http://localhost:32122/api/auth/token \
  -H "Content-Type: application/json" \
  -d '{"userId": "alice", "permissions": ["*"]}' \
  | jq -r '.token')

echo "Alice Token: $ALICE_TOKEN"

# 3. 为 Bob 生成 token
BOB_TOKEN=$(curl -s -X POST http://localhost:32122/api/auth/token \
  -H "Content-Type: application/json" \
  -d '{"userId": "bob", "permissions": ["*"]}' \
  | jq -r '.token')

echo "Bob Token: $BOB_TOKEN"

# 4. Alice 启动 Chrome 并注册
google-chrome --remote-debugging-port=9225 --user-data-dir=/tmp/chrome-alice &
curl -X POST http://localhost:32122/api/register \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ALICE_TOKEN" \
  -d '{"userId": "alice", "browserURL": "http://localhost:9225"}'

# 5. Bob 启动 Chrome 并注册
google-chrome --remote-debugging-port=9226 --user-data-dir=/tmp/chrome-bob &
curl -X POST http://localhost:32122/api/register \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $BOB_TOKEN" \
  -d '{"userId": "bob", "browserURL": "http://localhost:9226"}'
```

---

## 🔐 Token 格式

生成的 token 格式：`mcp_<base64url>`

示例：

```
mcp_3Z4Fh4jHpzWSGiVFLOXAZsIugew4jOj_
```

**特性：**

- 使用 crypto.randomBytes(24) 生成，密码学安全
- Base64URL 编码，安全用于 HTTP headers 和 URL
- 前缀 `mcp_` 便于识别

---

## 🔑 Authorization Header 格式

支持两种格式：

### 格式 1: Bearer Token (推荐)

```bash
Authorization: Bearer mcp_3Z4Fh4jHpzWSGiVFLOXAZsIugew4jOj_
```

### 格式 2: 直接使用 Token

```bash
Authorization: mcp_3Z4Fh4jHpzWSGiVFLOXAZsIugew4jOj_
```

---

## 📊 API 端点总结

### 无需认证的端点

| 端点              | 方法 | 说明           |
| ----------------- | ---- | -------------- |
| `/health`         | GET  | 健康检查       |
| `/api/auth/token` | POST | **生成 Token** |
| `/test`           | GET  | 测试页面       |

### 需要认证的端点

| 端点                 | 方法 | 说明         |
| -------------------- | ---- | ------------ |
| `/api/register`      | POST | 注册用户     |
| `/api/users`         | GET  | 查询用户列表 |
| `/api/users/:userId` | GET  | 查询用户状态 |
| `/sse?userId=xxx`    | GET  | SSE 连接     |

---

## ⚠️ 安全建议

### 开发环境

```bash
# 禁用认证，简化测试
AUTH_ENABLED=false node build/src/index.js --mode multi-tenant
```

### 生产环境

```bash
# 启用认证
AUTH_ENABLED=true \
PORT=32122 \
node build/src/index.js --mode multi-tenant
```

**生产环境建议：**

1. ✅ 启用认证 (`AUTH_ENABLED=true`)
2. ✅ 使用 HTTPS (通过 Nginx 反向代理)
3. ✅ 配置防火墙限制访问
4. ✅ 定期清理过期 token
5. ✅ 使用环境变量管理 token 有效期

---

## 🐛 故障排查

### 问题 1: "Authorization header is required"

**原因：** 启用认证但未提供 token

**解决：**

```bash
# 先生成 token
TOKEN=$(curl -s -X POST http://localhost:32122/api/auth/token \
  -H "Content-Type: application/json" \
  -d '{"userId": "alice"}' | jq -r '.token')

# 然后使用 token
curl -H "Authorization: Bearer $TOKEN" ...
```

---

### 问题 2: "Token 已过期"

**原因：** Token 过期（默认 24 小时）

**解决：**

```bash
# 生成新 token
curl -X POST http://localhost:32122/api/auth/token \
  -H "Content-Type: application/json" \
  -d '{"userId": "alice", "expiresIn": 604800}'  # 7天
```

---

### 问题 3: "Token 无效"

**原因：** Token 错误或已撤销

**解决：**

```bash
# 重新生成 token
curl -X POST http://localhost:32122/api/auth/token \
  -H "Content-Type: application/json" \
  -d '{"userId": "alice"}'
```

---

## 📝 配置选项

### 环境变量

| 变量               | 默认值  | 说明               |
| ------------------ | ------- | ------------------ |
| `AUTH_ENABLED`     | `true`  | 是否启用认证       |
| `PORT`             | `32122` | 服务器端口         |
| `TOKEN_EXPIRATION` | `86400` | Token 有效期（秒） |
| `MAX_SESSIONS`     | `100`   | 最大会话数         |

### 示例

```bash
# 自定义配置
AUTH_ENABLED=true \
PORT=8080 \
TOKEN_EXPIRATION=604800 \
MAX_SESSIONS=50 \
node build/src/index.js --mode multi-tenant
```

---

## ✅ 验证测试

### 测试 1: Token 生成

```bash
$ curl -X POST http://localhost:32122/api/auth/token \
  -H "Content-Type: application/json" \
  -d '{"userId": "alice", "permissions": ["*"]}'

{
  "success": true,
  "token": "mcp_3Z4Fh4jHpzWSGiVFLOXAZsIugew4jOj_",
  "userId": "alice",
  "permissions": ["*"],
  "expiresIn": 86400
}
```

✅ **通过**

---

### 测试 2: 使用 Token 注册

```bash
$ curl -X POST http://localhost:32122/api/register \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer mcp_3Z4Fh4jHpzWSGiVFLOXAZsIugew4jOj_" \
  -d '{"userId": "alice", "browserURL": "http://localhost:9225"}'

{
  "success": true,
  "userId": "alice",
  "browserURL": "http://localhost:9225",
  "message": "User registered successfully"
}
```

✅ **通过**

---

### 测试 3: 无 Token 注册（应该失败）

```bash
$ curl -X POST http://localhost:32122/api/register \
  -H "Content-Type: application/json" \
  -d '{"userId": "alice", "browserURL": "http://localhost:9225"}'

{
  "error": "Authorization header is required"
}
```

✅ **通过** - 正确拒绝

---

## 📚 相关文档

- [Multi-Tenant Architecture Analysis](./MULTI_TENANT_ARCHITECTURE_ANALYSIS.md)
- [Multi-Tenant Quick Start](./MULTI_TENANT_QUICK_START.md)
- [Multi-Tenant Complete Test](./MULTI_TENANT_COMPLETE_TEST.md)

---

## 总结

### 修复内容

1. ✅ 添加 `/api/auth/token` 端点
2. ✅ 实现 Token 生成逻辑
3. ✅ 解决循环依赖问题

### 工作流程

```
生成 Token → 注册用户 → 使用服务
    ↓            ↓           ↓
无需认证    需要 Token   需要 Token
```

### 测试状态

- ✅ Token 生成正常
- ✅ 使用 Token 注册成功
- ✅ 无 Token 访问被拒绝
- ✅ 认证流程完整

---

**修复日期：** 2025-10-13  
**版本：** v0.8.2  
**状态：** ✅ 已修复并验证通过
