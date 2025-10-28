# MCP 多租户代理项目总结

> ⚠️ **文档已废弃** - 本文档已合并到 [Multi-Tenant 完整文档](../MULTI_TENANT_COMPLETE.md)  
> 请使用新的统一文档以获取最新信息和完整功能说明。

## 项目概述

本项目实现了一个支持多用户的 MCP (Model Context Protocol) 代理服务器，允许多个开发者同时通过同一个 MCP 服务器连接和调试各自的 Chrome 浏览器及扩展。

### 核心特性

✅ **多用户隔离**: 每个用户操作独立的浏览器实例，互不干扰  
✅ **会话管理**: 自动管理用户会话生命周期，支持超时清理  
✅ **认证授权**: 可选的 Token 认证机制保障安全  
✅ **连接池**: 智能管理浏览器连接，支持健康检查和自动重连  
✅ **SSE 传输**: 基于 Server-Sent Events 的实时通信  
✅ **完整测试**: 单元测试覆盖核心组件

## 架构设计

### 系统架构

```
┌─────────────────────────────────────────────────────────────────┐
│                 MCP Multi-Tenant Proxy Server                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────┐ │
│  │  SessionManager  │  │  RouterManager   │  │  AuthManager │ │
│  │  会话管理         │  │  路由管理         │  │  认证管理     │ │
│  └────────┬─────────┘  └────────┬─────────┘  └──────┬───────┘ │
│           │                     │                    │         │
│  ┌────────┴─────────────────────┴────────────────────┴──────┐  │
│  │            BrowserConnectionPool                         │  │
│  │            浏览器连接池                                   │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

### 核心组件

1. **SessionManager**: 管理客户端 SSE 会话
2. **RouterManager**: 管理用户到浏览器的映射
3. **AuthManager**: 处理认证和授权
4. **BrowserConnectionPool**: 管理浏览器连接池

详见: [MULTI_TENANT_ARCHITECTURE.md](./MULTI_TENANT_ARCHITECTURE.md)

## 项目结构

```
chrome-ext-devtools-mcp/
├── src/
│   └── multi-tenant/
│       ├── server-multi-tenant.ts          # 主服务器
│       ├── core/
│       │   ├── SessionManager.ts           # 会话管理器
│       │   ├── RouterManager.ts            # 路由管理器
│       │   ├── AuthManager.ts              # 认证管理器
│       │   └── BrowserConnectionPool.ts    # 连接池
│       └── types/
│           ├── session.types.ts            # 会话类型定义
│           ├── router.types.ts             # 路由类型定义
│           ├── auth.types.ts               # 认证类型定义
│           └── browser-pool.types.ts       # 连接池类型定义
├── tests/
│   └── multi-tenant/
│       ├── SessionManager.test.ts          # 会话管理器测试
│       ├── RouterManager.test.ts           # 路由管理器测试
│       └── AuthManager.test.ts             # 认证管理器测试
└── docs/
    ├── MULTI_TENANT_ARCHITECTURE.md        # 架构设计文档
    ├── MULTI_TENANT_DEV_STANDARDS.md       # 开发规范
    ├── MULTI_TENANT_TEST_PLAN.md           # 测试计划
    ├── MULTI_TENANT_USAGE.md               # 使用指南
    └── MULTI_TENANT_README.md              # 本文档
```

## 快速开始

### 1. 安装和构建

```bash
npm install
npm run build
```

### 2. 启动服务器

```bash
# 开发模式（禁用认证）
npm run start:multi-tenant:dev

# 生产模式（启用认证）
npm run start:multi-tenant
```

### 3. 运行测试

```bash
# 运行多租户测试
npm run test:multi-tenant

# 运行所有测试
npm test
```

## 使用示例

### 场景：两个开发者独立调试

**开发者 A:**

```bash
# 1. 启动 Chrome
chrome --remote-debugging-port=9222

# 2. 注册到服务器
curl -X POST http://localhost:32122/api/register \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "developer-a",
    "browserURL": "http://localhost:9222"
  }'

# 3. 在 IDE 中配置
# X-User-Id: developer-a
```

**开发者 B:**

```bash
# 1. 启动 Chrome (不同端口)
chrome --remote-debugging-port=9223

# 2. 注册到服务器
curl -X POST http://localhost:32122/api/register \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "developer-b",
    "browserURL": "http://localhost:9223"
  }'

# 3. 在 IDE 中配置
# X-User-Id: developer-b
```

现在两个开发者可以同时使用 MCP 工具调试各自的浏览器，互不干扰！

详见: [MULTI_TENANT_USAGE.md](./MULTI_TENANT_USAGE.md)

## API 端点

| 端点                        | 方法 | 说明                 |
| --------------------------- | ---- | -------------------- |
| `/health`                   | GET  | 健康检查和服务器状态 |
| `/api/register`             | POST | 注册用户和浏览器     |
| `/api/users`                | GET  | 查询用户列表         |
| `/api/users/:userId/status` | GET  | 查询用户状态         |
| `/sse`                      | GET  | 建立 SSE 连接        |
| `/message`                  | POST | 发送 MCP 消息        |
| `/test`                     | GET  | 测试页面             |

## 配置选项

### 环境变量

```bash
# 服务器端口
PORT=32122

# 是否启用认证
AUTH_ENABLED=true

# Node 环境
NODE_ENV=production
```

### 代码配置

```typescript
// 会话超时
sessionManager = new SessionManager({
  timeout: 3600000, // 1 小时
  cleanupInterval: 60000, // 1 分钟
  maxSessions: 100, // 最大会话数
});

// 浏览器健康检查
browserPool = new BrowserConnectionPool({
  healthCheckInterval: 30000, // 30 秒
  maxReconnectAttempts: 3, // 最大重连次数
  reconnectDelay: 5000, // 重连延迟
  connectionTimeout: 10000, // 连接超时
});
```

## 开发计划执行情况

### ✅ 第一阶段：架构设计和规范制定

- [x] 架构设计文档
- [x] 开发规范文档
- [x] 测试计划文档

### ✅ 第二阶段：核心功能实现 - 会话管理和路由

- [x] SessionManager 实现
- [x] RouterManager 实现

### ✅ 第三阶段：用户注册和认证机制

- [x] AuthManager 实现
- [x] Token 认证机制

### ✅ 第四阶段：连接池管理

- [x] BrowserConnectionPool 实现
- [x] 健康检查和自动重连

### ✅ 第五阶段：测试框架和单元测试

- [x] SessionManager 测试
- [x] RouterManager 测试
- [x] AuthManager 测试

### 🔄 第六阶段：集成测试和多用户场景测试

- [ ] 完整用户流程测试
- [ ] 多用户并发测试
- [ ] 故障恢复测试

### ✅ 第七阶段：文档和部署指南

- [x] 使用文档
- [x] API 文档
- [x] 部署指南

## 测试覆盖

### 单元测试

- **SessionManager**: 11 个测试用例 ✅
- **RouterManager**: 10 个测试用例 ✅
- **AuthManager**: 13 个测试用例 ✅
- **BrowserConnectionPool**: 待实现

### 运行测试

```bash
# 运行多租户测试
npm run test:multi-tenant

# 预期输出
✔ SessionManager (11 tests)
✔ RouterManager (10 tests)
✔ AuthManager (13 tests)
```

## 性能指标

| 指标           | 目标值 | 实际值 |
| -------------- | ------ | ------ |
| SSE 连接时间   | < 1s   | 待测试 |
| 工具调用响应   | < 3s   | 待测试 |
| 并发用户数     | > 50   | 待测试 |
| 内存使用增长   | < 10%  | 待测试 |
| 会话清理间隔   | 60s    | ✅     |
| 浏览器健康检查 | 30s    | ✅     |

## 安全特性

✅ **Token 认证**: 支持 Bearer Token 认证  
✅ **会话隔离**: 用户间完全隔离  
✅ **自动清理**: 过期会话自动清理  
✅ **Token 撤销**: 支持 Token 撤销机制  
✅ **权限控制**: 基于权限的授权

## 已知问题和限制

1. **浏览器连接**: 需要浏览器开启远程调试端口
2. **网络要求**: 用户浏览器需能被服务器访问
3. **并发限制**: 未进行大规模并发测试
4. **持久化**: 用户注册信息暂不持久化

## 未来计划

- [ ] 添加 BrowserConnectionPool 单元测试
- [ ] 实现集成测试套件
- [ ] 添加性能测试
- [ ] 支持配置文件
- [ ] 添加日志持久化
- [ ] 实现用户注册信息持久化
- [ ] 添加 WebSocket 传输支持
- [ ] 实现分布式部署支持
- [ ] 添加监控仪表盘

## 贡献指南

开发新功能请遵循以下流程：

1. 阅读 [开发规范](./MULTI_TENANT_DEV_STANDARDS.md)
2. 编写代码并遵循命名和架构规范
3. 编写单元测试（覆盖率 > 80%）
4. 运行 `npm test` 确保所有测试通过
5. 更新相关文档
6. 提交 Pull Request

## 文档索引

- **架构设计**: [MULTI_TENANT_ARCHITECTURE.md](./MULTI_TENANT_ARCHITECTURE.md)
- **开发规范**: [MULTI_TENANT_DEV_STANDARDS.md](./MULTI_TENANT_DEV_STANDARDS.md)
- **测试计划**: [MULTI_TENANT_TEST_PLAN.md](./MULTI_TENANT_TEST_PLAN.md)
- **使用指南**: [MULTI_TENANT_USAGE.md](./MULTI_TENANT_USAGE.md)
- **部署指南**: [REMOTE_MCP_GUIDE.md](../REMOTE_MCP_GUIDE.md)

## 常见问题

### Q: 如何启动服务器？

```bash
npm run start:multi-tenant:dev
```

### Q: 如何运行测试？

```bash
npm run test:multi-tenant
```

### Q: 如何禁用认证？

```bash
AUTH_ENABLED=false npm run start:multi-tenant
```

### Q: 支持多少并发用户？

理论上无限制，建议先进行压力测试确定实际承载能力。

### Q: 浏览器断开后会自动重连吗？

会。BrowserConnectionPool 会自动检测断开并尝试重连（最多 3 次）。

## 获取帮助

- **GitHub Issues**: https://github.com/ChromeDevTools/chrome-devtools-mcp/issues
- **文档目录**: `/docs/MULTI_TENANT_*.md`
- **测试示例**: `/tests/multi-tenant/*.test.ts`

## 致谢

本项目基于 [Chrome DevTools MCP](https://github.com/ChromeDevTools/chrome-devtools-mcp) 构建。

## 许可证

Apache-2.0 License

---

**项目状态**: ✅ 核心功能完成，待集成测试  
**最后更新**: 2025-01-12
