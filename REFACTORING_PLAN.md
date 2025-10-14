# API 架构重构计划

## 目标
根据 ANALYSIS_REPORT.md 的建议：
1. **移除 Legacy API**，只保留 V2 架构
2. **规范化 API 路径**：使用 `/api/v2/` 前缀
3. **清理Legacy代码**：PersistentStore, AuthManager, RouterManager

## 当前状态分析

### Legacy 组件（需要移除）
- `PersistentStore` - Legacy 存储（基于 userId）
- `AuthManager` - Token 管理器（依赖 PersistentStore）
- `RouterManager` - 用户路由管理器（依赖 PersistentStore）
- Legacy API handlers:
  - `/api/register` - 注册
  - `/api/auth/token` - Token 生成
  - `/api/users/:id/browser` (PUT) - 更新浏览器
  - `/sse` (GET) - Legacy SSE 连接

### V2 组件（保留并规范化）
- `PersistentStoreV2` - V2 存储（基于 email + 多浏览器）
- V2 API handlers:
  - `/api/users` → `/api/v2/users`
  - `/api/users/:id` → `/api/v2/users/:id`
  - `/api/users/:id/browsers` → `/api/v2/users/:id/browsers`
  - `/sse-v2` → `/api/v2/sse`

## 重构步骤

### Phase 1: 移除 Legacy API 路由
- [x] 移除 `/api/register`
- [x] 移除 `/api/auth/token`
- [x] 移除 `/api/users/:id/browser` (PUT)
- [x] 移除 `/sse` (GET) - 保留 `/sse-v2`

### Phase 2: 移除 Legacy 组件
- [ ] 移除 `PersistentStore` 导入和实例
- [ ] 移除 `AuthManager` 导入和实例
- [ ] 移除 `RouterManager` 导入和实例
- [ ] 移除相关 handler 方法

### Phase 3: 规范化 V2 API 路径
- [ ] `/api/users` → `/api/v2/users`
- [ ] `/api/users/:id` → `/api/v2/users/:id`
- [ ] `/api/users/:id/browsers` → `/api/v2/users/:id/browsers`
- [ ] `/sse-v2` → `/api/v2/sse`

### Phase 4: 清理文件
- [ ] 删除 `storage/PersistentStore.ts`
- [ ] 删除 `core/AuthManager.ts`
- [ ] 删除 `core/RouterManager.ts`
- [ ] 删除相关类型文件

### Phase 5: 更新依赖
- [ ] 更新测试脚本
- [ ] 更新文档
- [ ] 更新 Web UI

## 注意事项

1. **V2 认证机制**: V2 使用基于 Token 的 SSE 连接，不需要 Auth Manager
2. **向后兼容**: 这是一个breaking change，需要更新版本号
3. **数据迁移**: 现有数据存储在 Legacy store中的用户需要迁移
