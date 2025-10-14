# 基于邮箱注册的多租户架构 - 实施路线图

## 已完成 ✅

1. **架构设计文档** (`docs/analysis/EMAIL_BASED_REGISTRATION_DESIGN.md`)
   - 详细的数据模型设计
   - 完整的 API 设计
   - 使用流程和示例
   - 向后兼容策略

2. **核心数据结构定义**
   - `UserRecord`: 基于邮箱的用户实体
   - `BrowserRecord`: 浏览器实例实体
   - `LogOperation`: 新的日志操作类型

3. **备份原始文件**
   - `src/multi-tenant/storage/PersistentStore.backup.ts`

## 待实施任务

### Phase 1: PersistentStore 重构 🔄

**文件**: `src/multi-tenant/storage/PersistentStore.ts`

需要实现的方法：

**用户管理**
- `registerUserByEmail(email, username?)` - 使用邮箱注册
- `getUserByEmail(email)` - 通过邮箱查找用户
- `getUserById(userId)` - 通过 ID 获取用户
- `updateUsername(userId, username)` - 更新用户名
- `deleteUser(userId)` - 删除用户（级联删除浏览器）
- `getAllUsers()` - 列出所有用户

**浏览器管理**
- `bindBrowser(userId, browserURL, tokenName?, description?)` - 绑定浏览器并生成 token
- `getBrowserById(browserId)` - 获取浏览器信息
- `getBrowserByToken(token)` - 通过 token 获取浏览器
- `getBrowserByUserAndName(userId, tokenName)` - 获取用户的特定浏览器
- `listUserBrowsers(userId)` - 列出用户的所有浏览器
- `updateBrowser(browserId, data)` - 更新浏览器信息
- `unbindBrowser(browserId)` - 解绑浏览器
- `updateLastConnected(browserId)` - 更新最后连接时间

**工具方法**
- `generateUserId(email)` - 从邮箱提取 userId
- `generateToken()` - 生成 token (mcp_ + random)
- `generateBrowserId()` - 生成浏览器 UUID

**关键实现点**:
```typescript
// userId 提取逻辑
function generateUserId(email: string): string {
  return email.split('@')[0].toLowerCase();
}

// token 生成
function generateToken(): string {
  return 'mcp_' + crypto.randomBytes(32).toString('hex');
}
```

### Phase 2: API 端点实现

**文件**: `src/multi-tenant/server-multi-tenant.ts`

需要实现/更新的路由：

**用户 API**
- `POST /api/users` → `handleRegisterUser`
- `GET /api/users` → `handleListUsers` (更新)
- `GET /api/users/:userId` → `handleGetUser`
- `PATCH /api/users/:userId` → `handleUpdateUsername`
- `DELETE /api/users/:userId` → `handleDeleteUser`

**浏览器 API**
- `POST /api/users/:userId/browsers` → `handleBindBrowser`
- `GET /api/users/:userId/browsers` → `handleListBrowsers`
- `GET /api/users/:userId/browsers/:tokenName` → `handleGetBrowser`
- `PATCH /api/users/:userId/browsers/:tokenName` → `handleUpdateBrowser`
- `DELETE /api/users/:userId/browsers/:tokenName` → `handleUnbindBrowser`

**SSE 连接 (更新)**
- `GET /sse` (Authorization: Bearer token) → 从 token 解析浏览器

### Phase 3: 测试脚本

**文件**: `docs/examples/test-browser-binding.sh`

需要添加的测试用例：

```bash
# 1. 用户注册
curl -X POST /api/users \
  -d '{"email":"alice@example.com","username":"Alice"}'

# 2. 绑定浏览器
curl -X POST /api/users/alice/browsers \
  -d '{
    "browserURL":"http://localhost:9222",
    "tokenName":"dev-chrome"
  }'

# 3. 列出浏览器
curl /api/users/alice/browsers

# 4. 更新用户名
curl -X PATCH /api/users/alice \
  -d '{"username":"Alice Wonder"}'

# 5. 更新浏览器
curl -X PATCH /api/users/alice/browsers/dev-chrome \
  -d '{"description":"Updated desc"}'

# 6. 删除浏览器
curl -X DELETE /api/users/alice/browsers/dev-chrome

# 7. 删除用户
curl -X DELETE /api/users/alice
```

### Phase 4: 文档更新

**文件**: `docs/MULTI_TENANT_COMPLETE.md`

需要添加的章节：

1. **用户注册流程** - 基于邮箱的新流程
2. **浏览器管理** - 多浏览器绑定和管理
3. **Token 使用** - Token 直接对应浏览器
4. **迁移指南** - 从旧架构迁移

## 实施顺序建议

1. **Day 1**: Phase 1 (PersistentStore)
   - 实现核心数据模型
   - 实现用户和浏览器的 CRUD 方法
   - 单元测试

2. **Day 2**: Phase 2 (API)
   - 实现新的 API 端点
   - 更新 SSE 连接逻辑
   - 集成测试

3. **Day 3**: Phase 3 & 4
   - 创建测试脚本
   - 更新文档
   - 端到端测试

## 向后兼容策略

### 保留旧的 POST /api/register 端点

```typescript
// 标记为 deprecated 但保持功能
async handleLegacyRegister(req, res) {
  const { userId, browserURL } = await this.readRequestBody(req);
  
  // 转换为新流程：
  // 1. 创建用户（email = userId@legacy.local）
  const email = `${userId}@legacy.local`;
  await this.store.registerUserByEmail(email, userId);
  
  // 2. 绑定浏览器（tokenName = "default"）
  const browser = await this.store.bindBrowser(
    userId,
    browserURL,
    'default',
    'Migrated from legacy registration'
  );
  
  // 3. 返回兼容的响应
  res.json({
    success: true,
    userId,
    browserURL,
    token: browser.token,
    message: 'User registered (legacy API). Please migrate to POST /api/users'
  });
}
```

### 数据迁移脚本

```typescript
// scripts/migrate-to-email-based.ts
async function migrate() {
  const oldUsers = store.getAllUsers();
  
  for (const oldUser of oldUsers) {
    // 1. 创建新用户
    const email = `${oldUser.userId}@migrated.local`;
    await store.registerUserByEmail(email, oldUser.userId);
    
    // 2. 迁移浏览器
    await store.bindBrowser(
      oldUser.userId,
      oldUser.browserURL,
      'default',
      'Migrated from old system'
    );
  }
}
```

## 关键决策记录

### 为什么选择邮箱作为用户标识？

1. **正式性**: 邮箱比随意的 userId 更正式
2. **唯一性**: 邮箱天然唯一
3. **可验证**: 未来可扩展邮箱验证
4. **国际化**: 邮箱是全球通用的标识符

### 为什么 Token 直接关联到 Browser？

1. **简化模型**: Token → Browser 是直接关系
2. **多浏览器**: 一个用户多个浏览器，每个有独立 token
3. **清晰配置**: IDE 配置中一个 token = 一个浏览器
4. **安全隔离**: 不同环境使用不同 token

### 为什么支持 tokenName？

1. **人类可读**: 比 UUID 更容易识别（dev-chrome, prod-chrome）
2. **管理友好**: 查看列表时一目了然
3. **灵活命名**: 用户可以按需命名

## 测试检查清单

### 用户管理
- [ ] 使用邮箱注册新用户
- [ ] 重复邮箱注册（应失败）
- [ ] 自动生成 userId
- [ ] 更新用户名
- [ ] 删除用户（级联删除浏览器）
- [ ] 列出所有用户

### 浏览器管理
- [ ] 绑定可访问的浏览器
- [ ] 绑定不可访问的浏览器（应失败）
- [ ] 列出用户的浏览器
- [ ] 获取单个浏览器信息
- [ ] 更新浏览器 URL
- [ ] 删除浏览器
- [ ] 重复 tokenName（应失败）

### Token 和连接
- [ ] 使用 token 连接 SSE
- [ ] 无效 token（应失败）
- [ ] 从 token 解析浏览器
- [ ] Token 唯一性

### 向后兼容
- [ ] 旧的 POST /api/register 仍可用
- [ ] 数据迁移脚本正常工作

## 性能目标

- 用户注册: < 100ms
- 浏览器绑定（含检测）: < 3s
- API 响应: < 50ms (不含浏览器检测)
- 并发用户: 100+

## 下一步行动

**立即开始**: 实施 Phase 1 - PersistentStore 重构

**预估时间**: 
- Phase 1: 4小时
- Phase 2: 3小时  
- Phase 3-4: 2小时
- **总计**: ~9小时（包含测试和调试）

---

**文档版本**: v1.0  
**创建日期**: 2025-10-14  
**状态**: 设计完成，等待实施
