# Release Notes - v0.8.10

## 🎉 主要更新

### 🚨 Breaking Changes - Legacy API 完全移除

v0.8.10 是一个重大更新版本，完全移除了所有 Legacy API 和组件，统一使用 V2 架构。

#### 移除的 API 端点
- ❌ `POST /api/register` → ✅ `POST /api/v2/users`
- ❌ `POST /api/auth/token` → ✅ Token 在绑定浏览器时自动生成
- ❌ `PUT /api/users/:id/browser` → ✅ `POST /api/v2/users/:id/browsers`
- ❌ `GET /sse` → ✅ `GET /api/v2/sse`
- ❌ `GET /sse-v2` → ✅ `GET /api/v2/sse`

#### 移除的组件
- `PersistentStore` → `PersistentStoreV2`
- `AuthManager` → 功能集成到 `PersistentStoreV2`
- `RouterManager` → 功能集成到 `PersistentStoreV2`

### ⚠️ 迁移必读

**重要**: 所有现有用户必须重新注册并重新绑定浏览器！

1. **备份数据** (如需保留)
   ```bash
   cp .mcp-data/auth-store.jsonl .mcp-data/auth-store.jsonl.backup
   ```

2. **查看迁移指南**
   - 详细迁移步骤: `docs/guides/V2_API_MIGRATION_GUIDE.md`
   - API 对比文档

3. **更新客户端配置**
   - 更新 SSE URL: `/sse` → `/api/v2/sse`
   - 移除 `CHROME_USER_ID` 环境变量
   - 只保留 `CHROME_TOKEN`

## ✨ 新功能

### 性能监控和优化

#### 1. 性能监控器 (`PerformanceMonitor`)
- 📊 实时 API 调用统计
- ⏱️ 响应时间追踪
- ❌ 错误率监控
- 🔝 热门端点分析

#### 2. 响应缓存 (`SimpleCache`)
- 🚀 30秒 TTL 缓存
- 💾 最多 500 个缓存条目
- 🔄 自动过期清理

#### 3. 新的 `/metrics` 端点
查看实时性能指标:
```bash
curl http://localhost:32122/metrics | jq
```

返回数据:
```json
{
  "summary": {
    "totalRequests": 1234,
    "totalErrors": 5,
    "avgResponseTime": 45.2,
    "uniqueEndpoints": 11
  },
  "cache": {
    "size": 123,
    "maxSize": 500,
    "utilization": 24.6
  },
  "topEndpoints": [...],
  "slowestEndpoints": [...],
  "highErrorRateEndpoints": [...]
}
```

### Web UI 更新

- ✅ 完全适配 V2 API
- ✅ 显示性能指标端点
- ✅ 修复浏览器解绑功能
- ✅ 更新 API 文档展示

## 🔧 技术改进

### API 设计优化

#### 路径参数标准化
所有浏览器相关操作现在使用 `browserId`:

```bash
# 旧版 (错误)
GET /api/v2/users/:userId/browsers/:tokenName

# 新版 (正确)
GET /api/v2/users/:userId/browsers/:browserId
```

#### 响应格式扁平化
```json
// 旧版
{
  "user": {
    "userId": "bob",
    "email": "bob@example.com"
  }
}

// 新版
{
  "userId": "bob",
  "email": "bob@example.com"
}
```

### 代码质量

- **代码减少**: 删除 800+ 行 Legacy 代码
- **文件减少**: 删除 7 个 Legacy 文件
- **测试覆盖**: 11 个 V2 API 端点 100% 测试通过
- **性能**: 所有操作 < 3s，大部分 < 100ms

## 📚 文档更新

### 新增文档
1. **V2_API_MIGRATION_GUIDE.md** - 完整迁移指南
2. **V2_API_TEST_REPORT.md** - 详细测试报告
3. **PHASE_2_REFACTORING_COMPLETE.md** - 重构总结
4. **PHASE_3_COMPLETE.md** - 测试验证总结

### 测试工具
- **test-v2-api-complete.sh** - 完整的 V2 API 测试脚本
  - 彩色输出
  - 详细错误信息
  - 自动化测试所有端点

## 🧪 测试结果

### 测试统计
- ✅ **11/11** 端点测试通过
- ✅ **100%** 测试通过率
- ✅ **0** 失败
- ✅ **0** 错误

### 性能基准
| 操作 | 响应时间 |
|------|---------|
| 健康检查 | < 10ms |
| 用户注册 | < 100ms |
| 浏览器绑定 | < 3s |
| 其他操作 | < 50ms |

## 🚀 升级步骤

### 1. 备份数据
```bash
# 备份 Legacy 数据（可选）
cp -r .mcp-data .mcp-data.backup
```

### 2. 更新代码
```bash
git pull
npm install
npm run build
```

### 3. 重新注册用户
```bash
# 使用邮箱注册
curl -X POST http://localhost:32122/api/v2/users \
  -H "Content-Type: application/json" \
  -d '{"email":"your@example.com","username":"Your Name"}'
```

### 4. 绑定浏览器
```bash
# 会返回 token
curl -X POST http://localhost:32122/api/v2/users/your-user-id/browsers \
  -H "Content-Type: application/json" \
  -d '{"browserURL":"http://localhost:9222","tokenName":"my-browser"}'
```

### 5. 更新客户端配置
```json
{
  "mcpServers": {
    "chrome-devtools": {
      "command": "node",
      "args": ["/path/to/build/src/index.js"],
      "env": {
        "CHROME_REMOTE_URL": "http://localhost:32122/api/v2/sse",
        "CHROME_TOKEN": "mcp_xxx...xxx"
      }
    }
  }
}
```

## 📋 完整 V2 API 参考

### 用户管理
- `POST /api/v2/users` - 注册用户
- `GET /api/v2/users` - 列出所有用户
- `GET /api/v2/users/:id` - 获取用户信息
- `PATCH /api/v2/users/:id` - 更新用户名
- `DELETE /api/v2/users/:id` - 删除用户

### 浏览器管理
- `POST /api/v2/users/:id/browsers` - 绑定浏览器
- `GET /api/v2/users/:id/browsers` - 列出浏览器
- `GET /api/v2/users/:id/browsers/:browserId` - 获取浏览器信息
- `PATCH /api/v2/users/:id/browsers/:browserId` - 更新浏览器
- `DELETE /api/v2/users/:id/browsers/:browserId` - 解绑浏览器

### 其他
- `GET /health` - 健康检查
- `GET /metrics` - 性能指标
- `GET /api/v2/sse` - SSE 连接

## ⚡ 性能提升

- 🚀 请求追踪和监控
- 💾 智能响应缓存
- 📊 实时性能分析
- 🔍 详细的性能指标

## 🛠️ 已知问题

无重大问题。所有测试通过。

## 🙏 反馈

如有问题或建议，请：
1. 查看迁移指南: `docs/guides/V2_API_MIGRATION_GUIDE.md`
2. 查看测试报告: `V2_API_TEST_REPORT.md`
3. 提交 GitHub Issue

## 📝 下一步计划

- [ ] Token 过期机制
- [ ] 更细粒度的权限控制
- [ ] 审计日志
- [ ] API 速率限制

---

**版本**: 0.8.10  
**发布日期**: 2025-10-14  
**Breaking Changes**: Yes  
**迁移难度**: Medium  
**推荐升级**: Yes (更好的性能和架构)
