# 持久连接模式 (Persistent Connection Mode)

**版本**: v0.8.11  
**创建时间**: 2025-10-17  
**适用模式**: SSE / Streamable / Multi-Tenant

---

## 📋 问题背景

### 原有超时机制的问题

在默认配置下，MCP服务会在以下情况**主动断开IDE客户端连接**：

```
每60秒检查一次
  ↓
发现会话超过1小时无活动
  ↓
调用 transport.close()
  ↓
IDE客户端被断开 ❌
```

**触发条件**：

- 默认超时：1小时（3600000ms）
- 判定标准：`lastActivity` 未更新
- 活动来源：仅工具调用会更新（SSE心跳包不会更新）

**影响**：

- IDE在长时间不操作后无法继续使用
- 用户需要重新连接才能恢复服务
- 单客户端场景下的用户体验极差

---

## ✅ 解决方案

### 持久连接模式

引入 `persistent` 标志，标记为持久连接的会话**永不超时**：

```typescript
interface Session {
  sessionId: string;
  userId: string;
  // ...
  lastActivity: Date;
  persistent?: boolean; // 🔑 新增字段
}
```

### 智能默认行为

```typescript
// 默认逻辑
persistentMode = !MAX_SESSIONS || PERSISTENT_MODE === 'true';
```

**规则**：

1. **未设置 `MAX_SESSIONS`** → 自动启用持久模式（单客户端场景）
2. **设置了 `MAX_SESSIONS`** → 自动禁用持久模式（多租户场景）
3. **显式设置 `PERSISTENT_MODE`** → 覆盖自动判断

---

## 🔧 配置方式

### 方法1：依赖默认行为（推荐）

```bash
# 不设置 MAX_SESSIONS，自动启用持久模式
node build/src/server-sse.js

# 输出日志
📋 Configuration:
   Session: timeout=3600000ms, cleanup=60000ms, persistent=true
```

### 方法2：显式启用

```bash
# .env 文件
PERSISTENT_MODE=true

# 或环境变量
export PERSISTENT_MODE=true
node build/src/multi-tenant/server-multi-tenant.js
```

### 方法3：多租户场景禁用

```bash
# 设置最大会话数，自动禁用持久模式
MAX_SESSIONS=100

# 输出日志
📋 Configuration:
   Session: timeout=3600000ms, cleanup=60000ms, persistent=false
     - maxSessions: 100
```

---

## 🔍 工作原理

### 1. 会话创建

```typescript
// SessionManager.ts
createSession(...): Session {
  const session: Session = {
    // ...
    persistent: this.#config.persistentMode,  // 继承全局配置
  };

  this.#logger.info('会话已创建', {
    sessionId,
    userId,
    persistent: session.persistent  // 日志记录
  });
}
```

### 2. 清理逻辑

```typescript
// SessionManager.ts
async cleanupExpiredSessions(): Promise<void> {
  for (const [sessionId, session] of this.#sessions) {
    // 🔑 跳过持久连接会话
    if (session.persistent) {
      skippedPersistent++;
      continue;
    }

    const inactive = now - session.lastActivity.getTime();
    if (inactive > this.#config.timeout) {
      expiredSessions.push(sessionId);
    }
  }

  // 日志输出跳过的持久会话数
  this.#logger.info('清理过期会话', {
    count: expiredSessions.length,
    persistent: skippedPersistent
  });
}
```

### 3. 监控日志

```bash
# 会话创建
[SessionManager] 会话已创建 {"sessionId":"sess_abc","userId":"user123","persistent":true}

# 清理检查（每分钟）
[SessionManager] 跳过持久连接会话清理 {"persistent":1}

# 清理执行
[SessionManager] 清理过期会话 {"count":3,"persistent":1}
```

---

## 📊 使用场景

### ✅ 适用场景：启用持久模式

| 场景               | 原因                   |
| ------------------ | ---------------------- |
| **单客户端IDE**    | 避免长时间不操作后断连 |
| **SSE模式**        | 单用户开发环境         |
| **Streamable模式** | 单用户开发环境         |
| **本地开发**       | 无需会话限制           |

### ⚠️ 不适用场景：禁用持久模式

| 场景                      | 原因                 |
| ------------------------- | -------------------- |
| **多租户生产环境**        | 需要定期清理僵尸会话 |
| **公共服务**              | 防止资源耗尽         |
| **设置了 `MAX_SESSIONS`** | 需要会话数量控制     |

---

## 🧪 验证方法

### 1. 检查配置

```bash
# 启动服务，查看配置输出
node build/src/multi-tenant/server-multi-tenant.js

# 输出示例（已启用）
📋 Configuration:
   Session: timeout=3600000ms, cleanup=60000ms, persistent=true

# 输出示例（已禁用）
📋 Configuration:
   Session: timeout=3600000ms, cleanup=60000ms, persistent=false
     - maxSessions: 100
```

### 2. 健康检查

```bash
curl http://localhost:32122/health | jq '.sessions'
```

**输出示例**：

```json
{
  "total": 2,
  "active": 2,
  "byUser": {
    "user123": 1
  }
}
```

### 3. 观察日志

```bash
# 持久模式：不会看到会话被清理
[SessionManager] 跳过持久连接会话清理 {"persistent":1}

# 普通模式：会看到定期清理
[SessionManager] 清理过期会话 {"count":2,"persistent":0}
[SessionManager] 会话已删除 {"sessionId":"sess_xyz"}
```

---

## ⚙️ 环境变量参考

```bash
# 显式启用持久模式
PERSISTENT_MODE=true

# 显式禁用持久模式
PERSISTENT_MODE=false

# 多租户模式（自动禁用持久模式）
MAX_SESSIONS=100

# 不设置 MAX_SESSIONS（自动启用持久模式）
# MAX_SESSIONS=
```

---

## 🎯 最佳实践

### 开发环境（推荐启用）

```bash
# .env
# 不设置 MAX_SESSIONS，自动启用持久模式
SESSION_TIMEOUT=3600000
SESSION_CLEANUP_INTERVAL=60000
```

### 生产环境（多租户）

```bash
# .env
MAX_SESSIONS=100         # 限制最大会话数
SESSION_TIMEOUT=1800000  # 30分钟超时
PERSISTENT_MODE=false    # 禁用持久模式
```

### 单用户生产环境

```bash
# .env
PERSISTENT_MODE=true     # 显式启用
SESSION_TIMEOUT=86400000 # 设置为24小时（虽然不会生效）
```

---

## 🔄 与原有机制的对比

| 特性         | 原有机制            | 持久连接模式      |
| ------------ | ------------------- | ----------------- |
| **超时断连** | ✅ 1小时后断开      | ❌ 永不断开       |
| **会话清理** | ✅ 定期清理过期会话 | ✅ 跳过持久会话   |
| **资源管理** | ⚠️ 僵尸会话累积     | ✅ 持久会话受保护 |
| **用户体验** | ⚠️ 需要重连         | ✅ 无缝使用       |
| **适用场景** | 多租户              | 单客户端          |

---

## 🚨 注意事项

### 1. 内存管理

持久连接会话**不会自动释放**，需要：

- IDE主动关闭连接
- 服务器重启
- 手动清理

### 2. 僵尸连接

如果IDE意外崩溃：

- 持久会话会保留在内存中
- 浏览器连接会保持
- 需要手动重启服务清理

**解决方案**：监听SSE `onclose` 事件

```typescript
transport.onclose = () => {
  sessionManager.deleteSession(sessionId);
};
```

### 3. 多租户风险

在多租户场景下启用持久模式会导致：

- ❌ 无法限制用户会话数
- ❌ 资源耗尽风险
- ❌ 僵尸会话累积

**建议**：多租户场景必须禁用持久模式

---

## 📚 相关文档

- **环境变量配置**: `.env.example`
- **会话管理**: `src/multi-tenant/core/SessionManager.ts`
- **配置加载**: `src/multi-tenant/config/MultiTenantConfig.ts`
- **类型定义**: `src/multi-tenant/types/session.types.ts`

---

## 💡 总结

持久连接模式通过以下机制解决单客户端场景下的自动断连问题：

1. ✅ **智能默认**：未设置 `MAX_SESSIONS` 自动启用
2. ✅ **跳过清理**：持久会话不会被超时清理
3. ✅ **无缝体验**：IDE长时间不操作也能正常使用
4. ✅ **灵活配置**：支持环境变量显式控制

**推荐配置**：

- 开发环境：依赖默认行为（不设置 `MAX_SESSIONS`）
- 生产环境（单用户）：显式设置 `PERSISTENT_MODE=true`
- 生产环境（多租户）：设置 `MAX_SESSIONS` 并显式 `PERSISTENT_MODE=false`
