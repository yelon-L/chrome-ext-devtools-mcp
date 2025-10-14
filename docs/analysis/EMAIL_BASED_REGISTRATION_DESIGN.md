# 基于邮箱的用户注册架构设计

## 一、核心变更分析

### 当前架构问题

```typescript
// 当前：注册时需要 browserURL
POST /api/register
{
  "userId": "alice",
  "browserURL": "http://localhost:9222"  // ❌ 时序耦合
}
```

**问题**：
1. 用户注册和浏览器绑定混在一起
2. 注册时浏览器可能还未启动
3. userId 不够正式，缺少身份验证基础
4. 一个用户只能有一个浏览器

### 新架构设计

```typescript
// 步骤 1: 用户注册（只需邮箱）
POST /api/users
{
  "email": "alice@example.com"
}
→ {
  "userId": "alice",  // 自动从邮箱提取
  "email": "alice@example.com",
  "createdAt": "2025-10-14T02:44:00Z"
}

// 步骤 2: 绑定浏览器（返回 token）
POST /api/users/alice/browsers
{
  "browserURL": "http://localhost:9222",
  "tokenName": "dev-chrome"  // 可选
}
→ {
  "token": "mcp_abc123...",
  "tokenName": "dev-chrome",
  "browserURL": "http://localhost:9222",
  "browser": { ... }
}
```

## 二、数据模型设计

### 1. User（用户实体）

```typescript
interface User {
  userId: string;           // 主键，从邮箱提取
  email: string;            // 唯一索引，必填
  username?: string;        // 可修改的显示名称
  metadata?: {
    createdAt: Date;
    updatedAt: Date;
    lastLoginAt?: Date;
  };
}
```

**规则**：
- `userId` 初始值 = `email.split('@')[0]`
- `username` 默认 = `userId`，可后续修改
- `email` 必须唯一

**示例**：
```json
{
  "userId": "alice",
  "email": "alice@example.com",
  "username": "alice",
  "metadata": {
    "createdAt": "2025-10-14T02:00:00Z"
  }
}
```

### 2. Browser（浏览器实例）

```typescript
interface Browser {
  browserId: string;        // UUID，主键
  userId: string;           // 外键 → User.userId
  browserURL: string;       // http://host:port
  tokenName: string;        // 人类可读的名称
  token: string;            // 访问令牌（唯一）
  metadata?: {
    description?: string;
    createdAt: Date;
    lastConnectedAt?: Date;
    browserInfo?: {         // 检测到的浏览器信息
      version: string;
      userAgent: string;
    };
  };
}
```

**规则**：
- 一个用户可以有多个浏览器
- `token` 唯一，格式：`mcp_` + 随机字符串
- `tokenName` 在同一用户下唯一
- 删除用户时级联删除所有浏览器

**示例**：
```json
{
  "browserId": "uuid-123",
  "userId": "alice",
  "browserURL": "http://localhost:9222",
  "tokenName": "dev-chrome",
  "token": "mcp_abc123...",
  "metadata": {
    "description": "Development environment",
    "createdAt": "2025-10-14T02:30:00Z",
    "browserInfo": {
      "version": "Chrome/131.0",
      "userAgent": "Mozilla/5.0 ..."
    }
  }
}
```

### 3. 关系图

```
┌─────────────────────────┐
│ User                    │
├─────────────────────────┤
│ userId (PK)             │
│ email (UNIQUE)          │
│ username                │
└─────────────────────────┘
            │ 1
            │
            │ has many
            │
            ▼ *
┌─────────────────────────┐
│ Browser                 │
├─────────────────────────┤
│ browserId (PK)          │
│ userId (FK)             │
│ token (UNIQUE)          │
│ tokenName               │
│ browserURL              │
└─────────────────────────┘
```

## 三、API 设计

### 3.1 用户管理（User Management）

#### 注册用户

```http
POST /api/users
Content-Type: application/json

{
  "email": "alice@example.com",
  "username": "Alice"  // 可选，默认为邮箱前缀
}

Response 201:
{
  "success": true,
  "userId": "alice",
  "email": "alice@example.com",
  "username": "Alice",
  "createdAt": "2025-10-14T02:44:00Z"
}

Response 409 (邮箱已存在):
{
  "error": "EMAIL_EXISTS",
  "message": "Email alice@example.com is already registered"
}
```

#### 获取用户信息

```http
GET /api/users/{userId}

Response 200:
{
  "userId": "alice",
  "email": "alice@example.com",
  "username": "Alice",
  "browsers": [
    {
      "browserId": "uuid-123",
      "tokenName": "dev-chrome",
      "browserURL": "http://localhost:9222",
      "connected": true,
      "createdAt": "2025-10-14T02:30:00Z"
    }
  ],
  "metadata": {
    "createdAt": "2025-10-14T02:00:00Z",
    "browserCount": 1
  }
}
```

#### 更新用户名

```http
PATCH /api/users/{userId}
Content-Type: application/json

{
  "username": "Alice Wonder"
}

Response 200:
{
  "success": true,
  "userId": "alice",
  "username": "Alice Wonder",
  "updatedAt": "2025-10-14T03:00:00Z"
}
```

#### 列出所有用户

```http
GET /api/users

Response 200:
{
  "users": [
    {
      "userId": "alice",
      "email": "alice@example.com",
      "username": "Alice",
      "browserCount": 2,
      "createdAt": "2025-10-14T02:00:00Z"
    },
    {
      "userId": "bob",
      "email": "bob@example.com",
      "username": "Bob",
      "browserCount": 1,
      "createdAt": "2025-10-14T02:10:00Z"
    }
  ],
  "total": 2
}
```

#### 删除用户

```http
DELETE /api/users/{userId}

Response 200:
{
  "success": true,
  "message": "User alice and 2 associated browsers deleted",
  "deletedBrowsers": [
    "dev-chrome",
    "prod-chrome"
  ]
}

Response 404:
{
  "error": "USER_NOT_FOUND",
  "message": "User alice not found"
}
```

### 3.2 浏览器管理（Browser Management）

#### 绑定浏览器（返回 token）

```http
POST /api/users/{userId}/browsers
Content-Type: application/json

{
  "browserURL": "http://localhost:9222",
  "tokenName": "dev-chrome",  // 可选
  "description": "Development environment"  // 可选
}

Response 201:
{
  "success": true,
  "browserId": "uuid-123",
  "token": "mcp_abc123def456...",
  "tokenName": "dev-chrome",
  "browserURL": "http://localhost:9222",
  "browser": {
    "connected": true,
    "info": {
      "browser": "Chrome/131.0",
      "version": "131.0.6778.86",
      "userAgent": "Mozilla/5.0 ...",
      "protocolVersion": "1.3"
    }
  },
  "message": "Browser bound successfully. Use this token to connect.",
  "createdAt": "2025-10-14T02:30:00Z"
}

Response 400 (浏览器不可访问):
{
  "error": "BROWSER_NOT_ACCESSIBLE",
  "message": "Cannot connect to the specified browser...",
  "suggestions": [...]
}

Response 409 (tokenName 已存在):
{
  "error": "TOKEN_NAME_EXISTS",
  "message": "Token name 'dev-chrome' already exists for user alice"
}
```

#### 列出用户的浏览器

```http
GET /api/users/{userId}/browsers

Response 200:
{
  "browsers": [
    {
      "browserId": "uuid-123",
      "tokenName": "dev-chrome",
      "token": "mcp_abc123...",  // 完整 token
      "browserURL": "http://localhost:9222",
      "connected": true,
      "description": "Development environment",
      "browserInfo": {
        "version": "Chrome/131.0",
        "userAgent": "Mozilla/5.0 ..."
      },
      "createdAt": "2025-10-14T02:30:00Z",
      "lastConnectedAt": "2025-10-14T03:00:00Z"
    },
    {
      "browserId": "uuid-456",
      "tokenName": "staging-chrome",
      "token": "mcp_def456...",
      "browserURL": "http://staging:9222",
      "connected": false,
      "createdAt": "2025-10-14T02:40:00Z"
    }
  ],
  "total": 2
}
```

#### 获取单个浏览器信息

```http
GET /api/users/{userId}/browsers/{tokenName}

Response 200:
{
  "browserId": "uuid-123",
  "userId": "alice",
  "tokenName": "dev-chrome",
  "token": "mcp_abc123...",
  "browserURL": "http://localhost:9222",
  "connected": true,
  "browserInfo": {
    "version": "Chrome/131.0",
    "userAgent": "Mozilla/5.0 ...",
    "pageCount": 5
  },
  "metadata": {
    "description": "Development environment",
    "createdAt": "2025-10-14T02:30:00Z",
    "lastConnectedAt": "2025-10-14T03:00:00Z"
  }
}
```

#### 更新浏览器

```http
PATCH /api/users/{userId}/browsers/{tokenName}
Content-Type: application/json

{
  "browserURL": "http://new-host:9222",  // 可选
  "description": "Updated description"    // 可选
}

Response 200:
{
  "success": true,
  "browserId": "uuid-123",
  "tokenName": "dev-chrome",
  "browserURL": "http://new-host:9222",
  "browser": {
    "connected": true,
    "info": { ... }
  },
  "updatedAt": "2025-10-14T03:30:00Z"
}
```

#### 删除浏览器（解绑）

```http
DELETE /api/users/{userId}/browsers/{tokenName}

Response 200:
{
  "success": true,
  "message": "Browser 'dev-chrome' unbound and token revoked",
  "tokenName": "dev-chrome",
  "deletedAt": "2025-10-14T04:00:00Z"
}
```

### 3.3 认证（Authentication）

#### SSE 连接（使用 token）

```http
GET /sse
Authorization: Bearer mcp_abc123...

# 服务器从 token 解析出：
# - userId
# - browserId
# - browserURL

# 然后建立 SSE 连接
```

**关键变化**：
- ✅ 不再需要 `?userId=xxx` 参数
- ✅ token 直接对应浏览器
- ✅ 一个 token = 一个浏览器实例

## 四、实现计划

### Phase 1: 数据模型重构

**文件**：`src/multi-tenant/storage/PersistentStore.ts`

```typescript
// 新增方法
- registerUserByEmail(email: string, username?: string): Promise<User>
- getUserByEmail(email: string): User | null
- updateUsername(userId: string, username: string): Promise<void>
- deleteUser(userId: string): Promise<{ browsers: string[] }>

- bindBrowser(userId, browserURL, tokenName?, description?): Promise<Browser>
- listUserBrowsers(userId: string): Browser[]
- getBrowser(userId: string, tokenName: string): Browser | null
- getBrowserByToken(token: string): Browser | null
- updateBrowser(userId, tokenName, data): Promise<void>
- unbindBrowser(userId: string, tokenName: string): Promise<void>

- generateToken(): string  // mcp_ + crypto.randomBytes
```

### Phase 2: API 实现

**文件**：`src/multi-tenant/server-multi-tenant.ts`

```typescript
// 路由更新
- POST   /api/users                      → handleRegisterUser
- GET    /api/users                      → handleListUsers (更新)
- GET    /api/users/:userId              → handleGetUser
- PATCH  /api/users/:userId              → handleUpdateUser
- DELETE /api/users/:userId              → handleDeleteUser

- POST   /api/users/:userId/browsers     → handleBindBrowser
- GET    /api/users/:userId/browsers     → handleListBrowsers
- GET    /api/users/:userId/browsers/:tokenName → handleGetBrowser
- PATCH  /api/users/:userId/browsers/:tokenName → handleUpdateBrowser
- DELETE /api/users/:userId/browsers/:tokenName → handleUnbindBrowser

- GET    /sse (Authorization: Bearer token) → handleSSE (更新)
```

### Phase 3: 迁移支持

**向后兼容**：
```typescript
// 保留旧的 POST /api/register 端点
// 但标记为 deprecated
POST /api/register (DEPRECATED)
{
  "userId": "alice",
  "browserURL": "http://localhost:9222"
}

// 内部转换为新流程：
1. 创建用户: email = userId@local.host
2. 绑定浏览器: tokenName = "default"
3. 返回兼容的响应
```

## 五、存储结构

### JSONL 格式

```jsonl
{"type":"USER_REGISTERED","userId":"alice","email":"alice@example.com","username":"alice","timestamp":1697251200000}
{"type":"BROWSER_BOUND","userId":"alice","browserId":"uuid-123","tokenName":"dev-chrome","token":"mcp_abc...","browserURL":"http://localhost:9222","timestamp":1697251800000}
{"type":"USERNAME_UPDATED","userId":"alice","oldUsername":"alice","newUsername":"Alice Wonder","timestamp":1697252400000}
{"type":"BROWSER_UNBOUND","userId":"alice","tokenName":"dev-chrome","browserId":"uuid-123","timestamp":1697253000000}
{"type":"USER_DELETED","userId":"alice","deletedBrowsers":["dev-chrome"],"timestamp":1697253600000}
```

### 内存索引

```typescript
class PersistentStore {
  private users: Map<string, User>;                    // userId → User
  private usersByEmail: Map<string, string>;           // email → userId
  private browsers: Map<string, Browser>;              // browserId → Browser
  private browsersByToken: Map<string, string>;        // token → browserId
  private browsersByUser: Map<string, Set<string>>;    // userId → Set<browserId>
}
```

## 六、使用流程示例

### 完整流程

```bash
# 1. 用户注册
curl -X POST http://localhost:32136/api/users \
  -H "Content-Type: application/json" \
  -d '{"email":"alice@example.com"}'
→ userId: alice

# 2. 绑定开发环境浏览器
curl -X POST http://localhost:32136/api/users/alice/browsers \
  -H "Content-Type: application/json" \
  -d '{
    "browserURL":"http://localhost:9222",
    "tokenName":"dev-chrome",
    "description":"My dev environment"
  }'
→ token: mcp_abc123...

# 3. 绑定生产环境浏览器
curl -X POST http://localhost:32136/api/users/alice/browsers \
  -H "Content-Type: application/json" \
  -d '{
    "browserURL":"http://prod-server:9222",
    "tokenName":"prod-chrome"
  }'
→ token: mcp_def456...

# 4. 查看所有浏览器
curl http://localhost:32136/api/users/alice/browsers
→ 2 browsers

# 5. IDE 配置（使用 token）
{
  "mcpServers": {
    "chrome-dev": {
      "url": "http://localhost:32136/sse",
      "headers": {"Authorization": "Bearer mcp_abc123..."}
    },
    "chrome-prod": {
      "url": "http://localhost:32136/sse",
      "headers": {"Authorization": "Bearer mcp_def456..."}
    }
  }
}

# 6. 解绑浏览器
curl -X DELETE http://localhost:32136/api/users/alice/browsers/dev-chrome

# 7. 删除用户（连同所有浏览器）
curl -X DELETE http://localhost:32136/api/users/alice
```

## 七、优势分析

| 维度 | 旧架构 | 新架构 |
|------|--------|--------|
| **用户标识** | userId（随意） | email（正式） |
| **注册流程** | 必须提供浏览器 | 独立注册，稍后绑定 |
| **多浏览器** | 不支持 | 一个用户多个浏览器 |
| **Token 管理** | 与浏览器分离 | Token 直接对应浏览器 |
| **IDE 配置** | 需要 userId 参数 | 只需 token |
| **可扩展性** | 受限 | 高度灵活 |

## 八、迁移指南

### 现有用户数据迁移

```typescript
// 迁移脚本
function migrateOldUsers() {
  for (const oldUser of oldStore.getAllUsers()) {
    // 1. 创建新用户
    const email = `${oldUser.userId}@migrated.local`;
    store.registerUserByEmail(email, oldUser.userId);
    
    // 2. 迁移浏览器绑定
    const browserURL = oldUser.browserURL;
    store.bindBrowser(
      oldUser.userId,
      browserURL,
      'default',  // tokenName
      'Migrated from old system'
    );
  }
}
```

## 九、测试计划

### 测试用例

1. **用户注册**
   - ✅ 使用邮箱注册
   - ✅ 重复邮箱注册（应失败）
   - ✅ 自动生成 userId
   - ✅ 自定义 username

2. **浏览器绑定**
   - ✅ 绑定可访问的浏览器
   - ✅ 绑定不可访问的浏览器（应失败）
   - ✅ 重复 tokenName（应失败）
   - ✅ 生成唯一 token

3. **CRUD 操作**
   - ✅ 更新用户名
   - ✅ 查询用户信息
   - ✅ 列出浏览器
   - ✅ 更新浏览器
   - ✅ 删除浏览器
   - ✅ 删除用户（级联删除）

4. **SSE 连接**
   - ✅ 使用 token 连接
   - ✅ 无效 token（应失败）
   - ✅ 从 token 解析浏览器

## 十、时间估算

| 任务 | 时间 |
|------|------|
| Phase 1: 数据模型重构 | 2h |
| Phase 2: API 实现 | 3h |
| Phase 3: 测试脚本 | 1h |
| Phase 4: 文档更新 | 1h |
| **总计** | **7h** |

---

**状态**: 设计完成，等待实施  
**版本**: v0.9.0  
**日期**: 2025-10-14
