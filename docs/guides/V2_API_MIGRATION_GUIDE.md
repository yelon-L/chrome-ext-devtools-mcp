# V2 API 迁移指南

## 概述

从 v0.9.0 开始，Legacy API 已被完全移除，所有用户需要迁移到 V2 API。

## 主要变化

### 1. 用户注册方式改变

**Legacy API (已移除)**:
```bash
# 注册用户
POST /api/register
{
  "userId": "bob",
  "browserURL": "http://localhost:9222"
}
```

**V2 API (新方式)**:
```bash
# 步骤 1: 注册用户（基于邮箱）
POST /api/v2/users
{
  "email": "bob@example.com",
  "username": "Bob"  # 可选
}

# 返回:
{
  "success": true,
  "user": {
    "userId": "bob",  # 从邮箱自动生成
    "email": "bob@example.com",
    "username": "Bob",
    "createdAt": 1234567890000
  }
}

# 步骤 2: 绑定浏览器
POST /api/v2/users/bob/browsers
{
  "browserURL": "http://localhost:9222",
  "tokenName": "my-browser",  # 可选
  "description": "本地开发浏览器"  # 可选
}

# 返回（包含 token）:
{
  "success": true,
  "browser": {
    "browserId": "uuid-xxx",
    "userId": "bob",
    "browserURL": "http://localhost:9222",
    "token": "mcp_xxx...xxx",  # 用于 SSE 连接
    "tokenName": "my-browser",
    "createdAt": 1234567890000
  }
}
```

### 2. Token 生成方式改变

**Legacy API (已移除)**:
```bash
POST /api/auth/token
{
  "userId": "bob",
  "tokenName": "test-script"
}
```

**V2 API (新方式)**:
Token 在绑定浏览器时自动生成，每个浏览器有自己的 token。

### 3. SSE 连接方式改变

**Legacy API (已移除)**:
```bash
# 使用 userId
GET /sse?userId=bob
# 或
GET /sse
Header: X-User-Id: bob
```

**V2 API (新方式)**:
```bash
# 使用浏览器的 token
GET /api/v2/sse?token=mcp_xxx...xxx
# 或
GET /api/v2/sse
Header: Authorization: Bearer mcp_xxx...xxx
```

### 4. 浏览器管理

**V2 API 新增功能**:
```bash
# 列出用户的所有浏览器
GET /api/v2/users/bob/browsers

# 获取特定浏览器信息
GET /api/v2/users/bob/browsers/{browserId}

# 更新浏览器信息
PATCH /api/v2/users/bob/browsers/{browserId}
{
  "browserURL": "http://localhost:9223",  # 可选
  "description": "新的描述"  # 可选
}

# 解绑浏览器
DELETE /api/v2/users/bob/browsers/{browserId}
```

## 完整的 V2 API 端点

### 用户管理
- `POST /api/v2/users` - 注册用户
- `GET /api/v2/users` - 列出所有用户
- `GET /api/v2/users/:id` - 获取用户信息
- `PATCH /api/v2/users/:id` - 更新用户名
- `DELETE /api/v2/users/:id` - 删除用户

### 浏览器管理
- `POST /api/v2/users/:id/browsers` - 绑定浏览器
- `GET /api/v2/users/:id/browsers` - 列出用户的浏览器
- `GET /api/v2/users/:id/browsers/:browserId` - 获取浏览器信息
- `PATCH /api/v2/users/:id/browsers/:browserId` - 更新浏览器
- `DELETE /api/v2/users/:id/browsers/:browserId` - 解绑浏览器

### SSE 连接
- `GET /api/v2/sse` - SSE 连接（需要 token 认证）

## 迁移步骤

### 1. 更新注册脚本

**旧脚本**:
```bash
# Legacy 方式
curl -X POST http://localhost:32122/api/register \
  -H "Content-Type: application/json" \
  -d '{"userId":"bob","browserURL":"http://localhost:9222"}'

curl -X POST http://localhost:32122/api/auth/token \
  -H "Content-Type: application/json" \
  -d '{"userId":"bob","tokenName":"test"}'
```

**新脚本**:
```bash
# V2 方式
# 1. 注册用户
curl -X POST http://localhost:32122/api/v2/users \
  -H "Content-Type: application/json" \
  -d '{"email":"bob@example.com","username":"Bob"}'

# 2. 绑定浏览器（会返回 token）
curl -X POST http://localhost:32122/api/v2/users/bob/browsers \
  -H "Content-Type: application/json" \
  -d '{"browserURL":"http://localhost:9222","tokenName":"my-browser"}'
```

### 2. 更新 MCP 客户端配置

**旧配置** (Claude Desktop):
```json
{
  "mcpServers": {
    "chrome-devtools": {
      "command": "node",
      "args": ["/path/to/build/index.js"],
      "env": {
        "CHROME_REMOTE_URL": "http://localhost:32122/sse",
        "CHROME_USER_ID": "bob",
        "CHROME_TOKEN": "mcp_xxx...xxx"
      }
    }
  }
}
```

**新配置**:
```json
{
  "mcpServers": {
    "chrome-devtools": {
      "command": "node",
      "args": ["/path/to/build/index.js"],
      "env": {
        "CHROME_REMOTE_URL": "http://localhost:32122/api/v2/sse",
        "CHROME_TOKEN": "mcp_xxx...xxx"
      }
    }
  }
}
```

注意变化：
- ✅ URL 从 `/sse` 改为 `/api/v2/sse`
- ✅ 移除 `CHROME_USER_ID`，只需要 `CHROME_TOKEN`

### 3. 更新测试脚本

参考新的测试脚本：
- `docs/examples/test-browser-binding.sh` - V2 API 示例
- `docs/examples/test-email-registration-v2.sh` - 邮箱注册示例

## 优势

V2 API 相比 Legacy API 的优势：

1. **更清晰的用户模型**
   - 基于邮箱的用户系统
   - 一个用户可以管理多个浏览器

2. **更细粒度的访问控制**
   - 每个浏览器有独立的 token
   - 可以单独撤销某个浏览器的访问权限

3. **RESTful 设计**
   - 标准的 HTTP 方法（GET/POST/PATCH/DELETE）
   - 清晰的资源层级关系

4. **更好的可扩展性**
   - 支持多浏览器管理
   - 更灵活的元数据存储

## 常见问题

### Q: 旧的数据会丢失吗？
A: Legacy 数据存储在 `auth-store.jsonl`，V2 数据存储在 `store-v2.jsonl`，两者独立。建议手动迁移重要数据。

### Q: 可以继续使用 userId 吗？
A: 可以。V2 API 会从邮箱自动生成 userId（邮箱 @ 前面的部分）。

### Q: 一个用户可以有多少个浏览器？
A: 没有硬性限制，但建议每个用户不超过 10 个浏览器。

### Q: Token 会过期吗？
A: 当前版本的 token 不会过期，但建议定期轮换 token 以提高安全性。

### Q: 如何撤销某个浏览器的访问权限？
A: 使用 `DELETE /api/v2/users/:id/browsers/:browserId` 解绑浏览器即可。

## 支持

如有问题，请查看：
- [V2 API 文档](./MULTI_TENANT_COMPLETE.md)
- [快速开始指南](./MULTI_TENANT_QUICK_START.md)
- [GitHub Issues](https://github.com/your-repo/issues)
