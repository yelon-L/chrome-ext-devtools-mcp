# Token 认证流程完整分析

## 核心组件

### 1. AuthManager (src/multi-tenant/core/AuthManager.ts)

**职责:** Token 生成、验证、撤销

**关键数据结构:**
```typescript
#tokens = new Map<string, AuthToken>()  // Token → AuthToken 映射
#revokedTokens = new Set<string>()      // 已撤销的 Token 集合
```

**Token 生成流程:**
```typescript
generateToken(userId, permissions, expiresIn?) {
  // 1. 生成随机 Token
  const token = crypto.randomBytes(24).toString('base64url');  // 24字节 → 32字符
  const finalToken = `mcp_${token}`;  // 添加前缀
  
  // 2. 创建 AuthToken 对象
  const authToken = {
    token: finalToken,
    userId: userId,
    permissions: permissions,
    expiresAt: new Date(Date.now() + expiresIn * 1000)
  };
  
  // 3. 存入内存
  this.#tokens.set(finalToken, authToken);
  
  return finalToken;
}
```

**Token 验证流程:**
```typescript
async authenticate(token: string) {
  // 1. 认证是否启用？
  if (!this.#config.enabled) return {success: true};
  
  // 2. Token 为空？
  if (!token) return {success: false, error: 'Token 不能为空'};
  
  // 3. Token 已撤销？
  if (this.#revokedTokens.has(token)) {
    return {success: false, error: 'Token 已被撤销'};
  }
  
  // 4. Token 存在？
  const authToken = this.#tokens.get(token);
  if (!authToken) return {success: false, error: 'Token 无效'};
  
  // 5. Token 过期？
  if (authToken.expiresAt < new Date()) {
    this.#tokens.delete(token);
    return {success: false, error: 'Token 已过期'};
  }
  
  // 6. 验证成功
  return {
    success: true,
    user: {userId: authToken.userId, permissions: authToken.permissions}
  };
}
```

---

### 2. PersistentStore (src/multi-tenant/storage/PersistentStore.ts)

**职责:** Token 持久化到磁盘

**存储结构:**
```
.mcp-data/
└── auth-store.jsonl    # JSONL 格式增量日志
```

**Token 记录格式:**
```typescript
interface TokenRecord {
  token: string;           // mcp_xxx
  tokenName: string;       // 设备名称
  userId: string;          // 所属用户
  permissions: string[];   // 权限列表
  createdAt: number;       // 创建时间戳
  expiresAt: number|null;  // 过期时间(null=永不过期)
  isRevoked: boolean;      // 是否已撤销
}
```

**JSONL 日志示例:**
```jsonl
{"op":"create_token","timestamp":1697232000000,"data":{"token":"mcp_abc123...","userId":"bob",...}}
{"op":"revoke_token","timestamp":1697232100000,"token":"mcp_abc123..."}
```

---

### 3. Multi-Tenant Server (src/multi-tenant/server-multi-tenant.ts)

**Token 使用点:**

#### a) SSE 连接 (GET /sse?userId=bob)
```typescript
async handleSSE(req, res) {
  // 1. 认证 Token
  const authResult = await this.authenticate(req);
  if (!authResult.success) {
    res.writeHead(401);
    res.end(JSON.stringify({error: authResult.error}));
    return;
  }
  
  // 2. 检查用户注册
  const userId = req.headers['x-user-id'] || url.searchParams.get('userId');
  const browserURL = this.routerManager.getUserBrowserURL(userId);
  
  // 3. 建立连接...
}
```

#### b) API 端点 (POST /api/auth/token)
```typescript
async handleGenerateToken(req, res) {
  // 1. 解析请求体
  const {userId, tokenName} = JSON.parse(body);
  
  // 2. 生成 Token
  const token = this.authManager.generateToken(userId, ['*'], 0);
  
  // 3. 持久化
  this.store.createToken({
    token,
    tokenName,
    userId,
    permissions: ['*'],
    createdAt: Date.now(),
    expiresAt: null,
    isRevoked: false
  });
  
  // 4. 返回
  res.end(JSON.stringify({token, userId, tokenName}));
}
```

---

## 完整流程图

### Token 生成流程
```
客户端                服务器                          AuthManager               PersistentStore
  │                     │                                │                          │
  │──POST /api/auth/token                                │                          │
  │   {userId, tokenName}                                │                          │
  │                     │                                │                          │
  │                     │──generateToken(userId, ['*'])──>│                          │
  │                     │                                │                          │
  │                     │                                │──crypto.randomBytes(24)  │
  │                     │                                │──return mcp_xxx          │
  │                     │<────────────token──────────────│                          │
  │                     │                                │                          │
  │                     │──store.createToken(...)────────────────────────────────>│
  │                     │                                │                          │
  │                     │                                │                          │──write JSONL log
  │                     │                                │                          │──flush to disk
  │<──{token: mcp_xxx}──│                                │                          │
  │                     │                                │                          │
```

### Token 验证流程 (SSE 连接)
```
客户端                服务器                          AuthManager               RouterManager
  │                     │                                │                          │
  │──GET /sse?userId=bob                                │                          │
  │   Header: Authorization: Bearer mcp_xxx             │                          │
  │                     │                                │                          │
  │                     │──extractTokenFromHeader()──────>│                          │
  │                     │                                │──parse Bearer token     │
  │                     │<────────token=mcp_xxx──────────│                          │
  │                     │                                │                          │
  │                     │──authenticate(token)───────────>│                          │
  │                     │                                │                          │
  │                     │                                │──check enabled?         │
  │                     │                                │──check token exists?    │
  │                     │                                │──check revoked?         │
  │                     │                                │──check expired?         │
  │                     │<───{success, user}─────────────│                          │
  │                     │                                │                          │
  │                     │──getUserBrowserURL(userId)─────────────────────────────>│
  │                     │<────browserURL─────────────────────────────────────────│
  │                     │                                │                          │
  │                     │──connect to browser            │                          │
  │                     │──create Session                │                          │
  │                     │                                │                          │
  │<──SSE: sessionId────│                                │                          │
```

---

## Token 失败的常见原因

### 1. Token 无效 (401)
```
原因: this.#tokens.get(token) 返回 undefined
可能:
  - Token 从未生成过
  - 服务器重启后 Token 丢失(内存中)
  - Token 拼写错误
```

**为什么会丢失？**
```typescript
constructor() {
  this.#tokens = new Map();  // ← 每次启动都是空的！
  
  // 预定义 Token 初始化
  if (this.#config.tokens && this.#config.tokens.size > 0) {
    for (const [token, user] of this.#config.tokens) {
      this.#tokens.set(token, {...});  // ← 只加载配置中的
    }
  }
}
```

**问题根源:**
- AuthManager 的 `#tokens` 是内存 Map
- 服务器重启后，内存清空
- 虽然有 PersistentStore，但**AuthManager 没有从 Store 加载 Token！**

### 2. Token 已撤销 (401)
```
原因: this.#revokedTokens.has(token) 返回 true
触发: 调用 revokeToken(token)
```

### 3. Token 已过期 (401)
```
原因: authToken.expiresAt < new Date()
配置: tokenExpiration 参数（秒）
默认: 86400 (24小时)
```

### 4. 缺少 Token (401)
```
原因: Authorization header 为空或格式错误
格式: Authorization: Bearer mcp_xxx
```

---

## 🐛 发现的 Bug！

### Bug: Token 不会从持久化存储加载

**问题代码** (AuthManager constructor):
```typescript
constructor(config?) {
  this.#tokens = new Map();  // 空 Map
  
  // 只加载预定义 Token
  if (this.#config.tokens && this.#config.tokens.size > 0) {
    for (const [token, user] of this.#config.tokens) {
      this.#tokens.set(token, {...});
    }
  }
  // ❌ 没有从 PersistentStore 加载已生成的 Token！
}
```

**结果:**
1. 用户生成 Token → 写入 Store ✅
2. Token 存在内存 Map ✅
3. 服务器重启 ❌
4. AuthManager 重新初始化 → 空 Map ❌
5. 之前的 Token 全部失效！❌

**解决方案:**
```typescript
async initialize(store: PersistentStore) {
  // 从 Store 加载所有 Token
  const tokens = store.getAllTokens();
  for (const tokenRecord of tokens) {
    if (!tokenRecord.isRevoked) {
      this.#tokens.set(tokenRecord.token, {
        token: tokenRecord.token,
        userId: tokenRecord.userId,
        permissions: tokenRecord.permissions,
        expiresAt: tokenRecord.expiresAt ? new Date(tokenRecord.expiresAt) : new Date(Date.now() + 86400000)
      });
    }
  }
}
```

---

## 环境变量配置

```bash
# 启用/禁用认证
AUTH_ENABLED=true   # 默认: true

# Token 过期时间（秒）
AUTH_TOKEN_EXPIRATION=86400  # 默认: 86400 (24小时)

# 数据目录
DATA_DIR=./.mcp-data  # 默认: ./.mcp-data
```

---

## 测试命令

### 1. 生成 Token
```bash
curl -X POST http://192.168.239.1:32122/api/auth/token \
  -H "Content-Type: application/json" \
  -d '{"userId":"bob","tokenName":"test"}'
```

### 2. 使用 Token 连接
```bash
curl -N -H "Authorization: Bearer mcp_xxx" \
  "http://192.168.239.1:32122/sse?userId=bob"
```

### 3. 检查 Token 持久化
```bash
cat .mcp-data/auth-store.jsonl | grep create_token
```

