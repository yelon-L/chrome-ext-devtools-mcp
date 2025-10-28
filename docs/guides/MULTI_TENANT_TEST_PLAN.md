# 多租户 MCP 代理测试计划

## 1. 测试策略

### 1.1 测试金字塔

```
        ┌─────────┐
        │   E2E   │  10%  - 端到端测试
        │  Tests  │
    ┌───┴─────────┴───┐
    │   Integration   │  30%  - 集成测试
    │     Tests       │
┌───┴─────────────────┴───┐
│     Unit Tests          │  60%  - 单元测试
└─────────────────────────┘
```

### 1.2 测试类型

#### 单元测试 (Unit Tests)

- **目标**: 测试单个函数/类的功能
- **工具**: Node.js Test Runner + Sinon
- **覆盖率目标**: >80%

#### 集成测试 (Integration Tests)

- **目标**: 测试组件间交互
- **工具**: Node.js Test Runner + Puppeteer
- **覆盖率目标**: 核心流程 100%

#### 端到端测试 (E2E Tests)

- **目标**: 测试完整用户场景
- **工具**: Node.js Test Runner + 真实浏览器
- **覆盖率目标**: 主要场景覆盖

#### 性能测试 (Performance Tests)

- **目标**: 验证系统性能指标
- **工具**: 自定义性能测试脚本
- **指标**: 响应时间、吞吐量、并发数

#### 安全测试 (Security Tests)

- **目标**: 验证安全机制
- **工具**: 手动测试 + 自动化脚本
- **覆盖**: 认证、授权、注入攻击

## 2. 单元测试计划

### 2.1 SessionManager 测试

```typescript
describe('SessionManager', () => {
  describe('createSession', () => {
    it('应该成功创建新会话', async () => {});
    it('应该为会话分配唯一 ID', async () => {});
    it('应该正确关联用户和浏览器', async () => {});
    it('应该在用户 ID 为空时抛出错误', async () => {});
    it('应该在浏览器 URL 无效时抛出错误', async () => {});
  });

  describe('getSession', () => {
    it('应该返回存在的会话', async () => {});
    it('应该在会话不存在时返回 undefined', async () => {});
    it('应该返回正确的会话对象', async () => {});
  });

  describe('deleteSession', () => {
    it('应该成功删除会话', async () => {});
    it('应该清理相关资源', async () => {});
    it('应该在删除不存在的会话时不报错', async () => {});
  });

  describe('cleanupExpiredSessions', () => {
    it('应该删除超时的会话', async () => {});
    it('应该保留活跃的会话', async () => {});
    it('应该正确计算会话过期时间', async () => {});
  });

  describe('getUserSessions', () => {
    it('应该返回用户的所有会话', async () => {});
    it('应该在用户无会话时返回空数组', async () => {});
    it('应该支持多会话场景', async () => {});
  });
});
```

### 2.2 RouterManager 测试

```typescript
describe('RouterManager', () => {
  describe('registerUser', () => {
    it('应该成功注册用户', async () => {});
    it('应该保存用户浏览器映射', async () => {});
    it('应该在重复注册时更新映射', async () => {});
    it('应该验证浏览器 URL 格式', async () => {});
  });

  describe('getUserBrowserURL', () => {
    it('应该返回已注册用户的浏览器 URL', async () => {});
    it('应该在用户未注册时返回 undefined', async () => {});
  });

  describe('unregisterUser', () => {
    it('应该成功注销用户', async () => {});
    it('应该清理用户映射', async () => {});
  });

  describe('getAllUsers', () => {
    it('应该返回所有注册用户列表', async () => {});
    it('应该在无用户时返回空数组', async () => {});
  });
});
```

### 2.3 AuthManager 测试

```typescript
describe('AuthManager', () => {
  describe('authenticate', () => {
    it('应该验证有效的 Token', async () => {});
    it('应该拒绝无效的 Token', async () => {});
    it('应该拒绝过期的 Token', async () => {});
    it('应该返回用户信息', async () => {});
  });

  describe('authorize', () => {
    it('应该允许有权限的操作', async () => {});
    it('应该拒绝无权限的操作', async () => {});
    it('应该支持多级权限', async () => {});
  });

  describe('generateToken', () => {
    it('应该生成有效的 Token', async () => {});
    it('应该设置正确的过期时间', async () => {});
    it('应该包含用户信息', async () => {});
  });

  describe('revokeToken', () => {
    it('应该撤销指定 Token', async () => {});
    it('应该使已撤销的 Token 无效', async () => {});
  });
});
```

### 2.4 BrowserConnectionPool 测试

```typescript
describe('BrowserConnectionPool', () => {
  describe('connect', () => {
    it('应该成功连接到浏览器', async () => {});
    it('应该复用已有连接', async () => {});
    it('应该在连接失败时抛出错误', async () => {});
    it('应该支持并发连接', async () => {});
  });

  describe('disconnect', () => {
    it('应该成功断开连接', async () => {});
    it('应该清理连接资源', async () => {});
  });

  describe('healthCheck', () => {
    it('应该检测连接健康状态', async () => {});
    it('应该标记断开的连接', async () => {});
    it('应该触发自动重连', async () => {});
  });

  describe('reconnect', () => {
    it('应该成功重连', async () => {});
    it('应该使用指数退避', async () => {});
    it('应该在达到最大次数后停止', async () => {});
  });
});
```

## 3. 集成测试计划

### 3.1 用户注册流程测试

```typescript
describe('User Registration Flow', () => {
  it('应该完成完整的注册流程', async () => {
    // 1. 启动代理服务器
    // 2. 启动测试浏览器
    // 3. 发送注册请求
    // 4. 验证注册成功
    // 5. 验证浏览器连接建立
  });

  it('应该处理重复注册', async () => {});
  it('应该处理无效的浏览器 URL', async () => {});
  it('应该处理认证失败', async () => {});
});
```

### 3.2 SSE 连接流程测试

```typescript
describe('SSE Connection Flow', () => {
  it('应该建立 SSE 连接', async () => {
    // 1. 用户注册
    // 2. 发起 SSE 连接
    // 3. 接收 endpoint 事件
    // 4. 验证会话创建
  });

  it('应该正确路由到用户浏览器', async () => {});
  it('应该支持多个并发连接', async () => {});
  it('应该在断开后正确清理', async () => {});
});
```

### 3.3 工具调用流程测试

```typescript
describe('Tool Invocation Flow', () => {
  it('应该成功调用工具', async () => {
    // 1. 建立连接
    // 2. 初始化 MCP
    // 3. 调用 list_extensions
    // 4. 验证结果返回
  });

  it('应该隔离不同用户的操作', async () => {
    // 1. 用户 A 和 B 分别连接
    // 2. A 操作自己的浏览器
    // 3. B 操作自己的浏览器
    // 4. 验证操作不互相影响
  });

  it('应该处理工具调用错误', async () => {});
  it('应该支持并发工具调用', async () => {});
});
```

### 3.4 会话管理测试

```typescript
describe('Session Management', () => {
  it('应该自动清理过期会话', async () => {
    // 1. 创建会话
    // 2. 等待超时
    // 3. 触发清理
    // 4. 验证会话已删除
  });

  it('应该在浏览器断开后清理会话', async () => {});
  it('应该支持会话重连', async () => {});
});
```

## 4. 端到端测试计划

### 4.1 完整用户场景

```typescript
describe('E2E: Complete User Scenario', () => {
  it('开发者 A 和 B 独立调试各自扩展', async () => {
    // 场景：两个开发者同时使用系统

    // 1. 开发者 A 启动 Chrome A
    const chromeA = await launchChrome({port: 9222});

    // 2. 开发者 B 启动 Chrome B
    const chromeB = await launchChrome({port: 9223});

    // 3. 启动多租户代理
    const proxy = await startMultiTenantProxy();

    // 4. 开发者 A 注册
    await proxy.register('dev-a', 'http://localhost:9222');

    // 5. 开发者 B 注册
    await proxy.register('dev-b', 'http://localhost:9223');

    // 6. 开发者 A 连接并操作
    const clientA = await connectSSE('dev-a');
    await clientA.callTool('list_extensions');

    // 7. 开发者 B 连接并操作
    const clientB = await connectSSE('dev-b');
    await clientB.callTool('list_extensions');

    // 8. 验证操作隔离
    // 9. 验证结果正确
  });
});
```

### 4.2 压力测试场景

```typescript
describe('E2E: Stress Test', () => {
  it('应该支持 10 个并发用户', async () => {
    const users = 10;
    const clients = [];

    // 创建多个用户和浏览器
    for (let i = 0; i < users; i++) {
      const chrome = await launchChrome({port: 9222 + i});
      await proxy.register(`user-${i}`, chrome.url);
      const client = await connectSSE(`user-${i}`);
      clients.push(client);
    }

    // 并发调用工具
    await Promise.all(
      clients.map(client => client.callTool('list_extensions')),
    );

    // 验证所有调用成功
  });
});
```

### 4.3 故障恢复测试

```typescript
describe('E2E: Failure Recovery', () => {
  it('应该在浏览器崩溃后恢复', async () => {
    // 1. 建立连接
    // 2. 模拟浏览器崩溃
    // 3. 验证错误处理
    // 4. 重启浏览器
    // 5. 验证自动重连
  });

  it('应该在代理服务器重启后恢复', async () => {});
});
```

## 5. 性能测试计划

### 5.1 响应时间测试

```typescript
describe('Performance: Response Time', () => {
  it('SSE 连接建立应小于 1 秒', async () => {
    const start = Date.now();
    await connectSSE('test-user');
    const duration = Date.now() - start;
    expect(duration).toBeLessThan(1000);
  });

  it('工具调用响应应小于 3 秒', async () => {
    const start = Date.now();
    await client.callTool('list_extensions');
    const duration = Date.now() - start;
    expect(duration).toBeLessThan(3000);
  });
});
```

### 5.2 并发性能测试

```typescript
describe('Performance: Concurrency', () => {
  it('应该支持 50 个并发 SSE 连接', async () => {
    const connections = await Promise.all(
      Array(50)
        .fill(0)
        .map((_, i) => connectSSE(`user-${i}`)),
    );
    expect(connections.length).toBe(50);
  });

  it('应该支持 100 个并发工具调用', async () => {
    const results = await Promise.all(
      Array(100)
        .fill(0)
        .map(() => client.callTool('list_pages')),
    );
    expect(results.filter(r => r.success).length).toBe(100);
  });
});
```

### 5.3 资源使用测试

```typescript
describe('Performance: Resource Usage', () => {
  it('内存使用应保持稳定', async () => {
    const baseline = process.memoryUsage().heapUsed;

    // 创建 100 个会话
    for (let i = 0; i < 100; i++) {
      await sessionManager.createSession(`user-${i}`, 'http://...');
    }

    // 清理所有会话
    await sessionManager.cleanupAll();

    // 强制 GC
    if (global.gc) global.gc();

    const after = process.memoryUsage().heapUsed;
    const growth = (after - baseline) / baseline;

    expect(growth).toBeLessThan(0.1); // 增长小于 10%
  });
});
```

## 6. 安全测试计划

### 6.1 认证测试

```typescript
describe('Security: Authentication', () => {
  it('应该拒绝无效的 Token', async () => {
    const response = await request('/sse', {
      headers: {Authorization: 'Bearer invalid_token'},
    });
    expect(response.status).toBe(401);
  });

  it('应该拒绝过期的 Token', async () => {});
  it('应该拒绝被撤销的 Token', async () => {});
});
```

### 6.2 授权测试

```typescript
describe('Security: Authorization', () => {
  it('用户 A 不能访问用户 B 的会话', async () => {
    const sessionB = await sessionManager.createSession('user-b', '...');

    const response = await request(`/message?sessionId=${sessionB.id}`, {
      headers: {'X-User-Id': 'user-a'},
    });

    expect(response.status).toBe(403);
  });

  it('用户不能操作其他用户的浏览器', async () => {});
});
```

### 6.3 注入攻击测试

```typescript
describe('Security: Injection Attacks', () => {
  it('应该防止 SQL 注入（如果使用数据库）', async () => {});

  it('应该防止 XSS 攻击', async () => {
    const maliciousUserId = '<script>alert("xss")</script>';
    await expect(proxy.register(maliciousUserId, 'http://...')).rejects.toThrow(
      'Invalid userId',
    );
  });

  it('应该防止命令注入', async () => {});
});
```

## 7. 测试环境

### 7.1 本地开发环境

```bash
# 启动测试
npm run test

# 启动单元测试
npm run test:unit

# 启动集成测试
npm run test:integration

# 启动 E2E 测试
npm run test:e2e

# 测试覆盖率
npm run test:coverage
```

### 7.2 CI/CD 环境

```yaml
# .github/workflows/test.yml
name: Test Multi-Tenant MCP

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm install
      - run: npm run test:unit
      - run: npm run test:integration
      - run: npm run test:e2e
      - run: npm run test:coverage
```

## 8. 测试数据

### 8.1 测试用户

```typescript
const TEST_USERS = [
  {
    userId: 'test-user-1',
    token: 'test_token_1',
    browserURL: 'http://localhost:9222',
  },
  {
    userId: 'test-user-2',
    token: 'test_token_2',
    browserURL: 'http://localhost:9223',
  },
];
```

### 8.2 Mock 数据

```typescript
const MOCK_SESSION = {
  sessionId: 'sess_test_123',
  userId: 'test-user',
  createdAt: new Date(),
  lastActivity: new Date(),
};

const MOCK_BROWSER = {
  wsEndpoint: () => 'ws://localhost:9222',
  isConnected: () => true,
  close: async () => {},
};
```

## 9. 测试报告

### 9.1 覆盖率报告

生成覆盖率报告：

```bash
npm run test:coverage
```

目标覆盖率：

- **Statements**: >80%
- **Branches**: >75%
- **Functions**: >80%
- **Lines**: >80%

### 9.2 性能报告

性能指标：

- SSE 连接时间: < 1s
- 工具调用响应: < 3s
- 并发连接数: > 50
- 内存增长: < 10%

## 10. 测试执行计划

### Phase 1: 单元测试 (Week 1)

- [ ] SessionManager 测试
- [ ] RouterManager 测试
- [ ] AuthManager 测试
- [ ] BrowserConnectionPool 测试

### Phase 2: 集成测试 (Week 2)

- [ ] 用户注册流程
- [ ] SSE 连接流程
- [ ] 工具调用流程
- [ ] 会话管理

### Phase 3: E2E 测试 (Week 3)

- [ ] 完整用户场景
- [ ] 多用户并发场景
- [ ] 故障恢复场景

### Phase 4: 性能和安全测试 (Week 4)

- [ ] 性能测试
- [ ] 安全测试
- [ ] 压力测试

## 11. Bug 跟踪

使用 GitHub Issues 跟踪测试发现的问题：

```markdown
## Bug 模板

**标题**: [BUG] 简短描述

**环境**:

- OS:
- Node.js:
- 浏览器:

**重现步骤**:

1. ...
2. ...

**期望行为**:

**实际行为**:

**测试用例**:

**优先级**: High / Medium / Low
```
