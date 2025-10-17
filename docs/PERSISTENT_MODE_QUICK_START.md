# 持久连接模式 - 快速开始

**5分钟快速上手指南**

---

## 🎯 问题

IDE长时间不操作（默认1小时）后，MCP服务会自动断开连接，导致无法继续使用。

---

## ✅ 解决方案

**持久连接模式**：会话永不超时，适用于单客户端开发环境。

---

## 🚀 使用方法

### 方法1：零配置（推荐）

```bash
# 直接启动，自动启用持久模式
node build/src/multi-tenant/server-multi-tenant.js
```

**输出**：
```
📋 Configuration:
   Session: timeout=3600000ms, cleanup=60000ms, persistent=true
```

✅ **完成！** 你的会话现在永不超时。

---

### 方法2：环境变量

创建 `.env` 文件：

```bash
# 显式启用持久模式
PERSISTENT_MODE=true
```

启动服务：
```bash
node build/src/multi-tenant/server-multi-tenant.js
```

---

### 方法3：多租户场景禁用

```bash
# .env
MAX_SESSIONS=100
PERSISTENT_MODE=false
```

**输出**：
```
📋 Configuration:
   Session: timeout=3600000ms, cleanup=60000ms, persistent=false
     - maxSessions: 100
```

---

## 🔍 验证

### 检查配置

```bash
# 启动服务后看到这行
Session: timeout=3600000ms, cleanup=60000ms, persistent=true
#                                                       ^^^^
#                                                    看这里！
```

### 检查日志

```bash
# 会话创建时
[SessionManager] 会话已创建 {"sessionId":"...","userId":"...","persistent":true}
#                                                                          ^^^^

# 每分钟清理检查时
[SessionManager] 跳过持久连接会话清理 {"persistent":1}
#                ^^^^^^^^^^^^^^
#              持久会话不会被清理
```

### 健康检查

```bash
curl http://localhost:32122/health | jq '.sessions'

# 输出
{
  "total": 1,
  "active": 1,    # 永远是活跃状态
  "byUser": {
    "user123": 1
  }
}
```

---

## 📊 默认行为规则

| 场景 | MAX_SESSIONS | PERSISTENT_MODE | 结果 |
|------|--------------|-----------------|------|
| 开发环境 | 未设置 | 未设置 | ✅ 自动启用 |
| 多租户 | 100 | 未设置 | ❌ 自动禁用 |
| 强制启用 | 100 | true | ✅ 显式启用 |
| 强制禁用 | 未设置 | false | ❌ 显式禁用 |

---

## ⚠️ 常见问题

### Q1: 持久模式会导致内存泄漏吗？

**A**: 不会。持久会话仍然可以通过以下方式清理：
- IDE主动断开连接
- 服务器重启
- 手动调用清理API

### Q2: 多租户场景下能用吗？

**A**: 不建议。多租户场景应该设置 `MAX_SESSIONS` 并禁用持久模式，避免资源耗尽。

### Q3: 如何知道持久模式是否生效？

**A**: 查看启动日志中的 `persistent=true` 标志。

---

## 🎯 推荐配置

### 开发环境（单用户）

```bash
# 不设置任何配置，依赖默认行为
# MAX_SESSIONS=
# PERSISTENT_MODE=
```

### 生产环境（单用户）

```bash
PERSISTENT_MODE=true
SESSION_TIMEOUT=86400000  # 24小时（虽然不会生效）
```

### 生产环境（多租户）

```bash
MAX_SESSIONS=100
PERSISTENT_MODE=false
SESSION_TIMEOUT=1800000  # 30分钟
```

---

## 📚 完整文档

详细信息请参考：
- **使用指南**: `docs/PERSISTENT_CONNECTION_MODE.md`
- **实现总结**: `PERSISTENT_CONNECTION_IMPLEMENTATION.md`
- **环境变量**: `.env.example`

---

## 💡 一句话总结

**单客户端场景：什么都不用配置，直接启动即可享受永不断连的体验。**
