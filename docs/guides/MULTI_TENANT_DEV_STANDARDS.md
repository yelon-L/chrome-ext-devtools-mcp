> ⚠️ **文档已废弃** - 本文档已合并到 [Multi-Tenant 完整文档](../MULTI_TENANT_COMPLETE.md)
> 请使用新的统一文档以获取最新信息。

# 多租户 MCP 代理开发规范

## 1. 代码规范

### 1.1 命名规范

#### 文件命名
- **类文件**: PascalCase，如 `SessionManager.ts`
- **工具文件**: kebab-case，如 `auth-utils.ts`
- **测试文件**: `*.test.ts`
- **类型定义**: `*.types.ts`

#### 变量命名
```typescript
// 常量：全大写下划线分隔
const MAX_RECONNECT_ATTEMPTS = 3;
const DEFAULT_SESSION_TIMEOUT = 3600000;

// 类名：PascalCase
class SessionManager {}
class BrowserConnectionPool {}

// 接口：PascalCase，以 I 开头（可选）
interface Session {}
interface IAuthManager {}

// 变量和函数：camelCase
const sessionId = 'xxx';
function connectToBrowser() {}

// 私有属性：# 前缀
class Manager {
  #sessions = new Map();
}
```

### 1.2 代码组织

#### 目录结构
```
src/
├── multi-tenant/
│   ├── server-multi-tenant.ts       # 主服务器
│   ├── core/
│   │   ├── SessionManager.ts        # 会话管理
│   │   ├── RouterManager.ts         # 路由管理
│   │   ├── AuthManager.ts           # 认证管理
│   │   └── BrowserConnectionPool.ts # 连接池
│   ├── types/
│   │   ├── session.types.ts
│   │   ├── auth.types.ts
│   │   └── router.types.ts
│   ├── utils/
│   │   ├── crypto-utils.ts
│   │   ├── health-check.ts
│   │   └── logger.ts
│   └── middleware/
│       ├── auth.middleware.ts
│       └── error-handler.ts
├── tests/
│   └── multi-tenant/
│       ├── SessionManager.test.ts
│       ├── integration/
│       └── e2e/
└── docs/
    └── multi-tenant/
```

### 1.3 TypeScript 规范

#### 严格类型
```typescript
// ✅ 好的实践
interface Session {
  sessionId: string;
  userId: string;
  createdAt: Date;
}

function createSession(userId: string): Session {
  return {
    sessionId: generateId(),
    userId,
    createdAt: new Date(),
  };
}

// ❌ 避免
function createSession(userId: any): any {
  return { sessionId: generateId(), userId };
}
```

#### 使用类型守卫
```typescript
function isValidSession(session: unknown): session is Session {
  return (
    typeof session === 'object' &&
    session !== null &&
    'sessionId' in session &&
    'userId' in session
  );
}
```

#### 错误处理
```typescript
// 自定义错误类
class SessionError extends Error {
  constructor(
    message: string,
    public code: string,
    public details?: unknown
  ) {
    super(message);
    this.name = 'SessionError';
  }
}

// 使用
throw new SessionError(
  'Session not found',
  'SESSION_NOT_FOUND',
  { sessionId }
);
```

## 2. 架构规范

### 2.1 单一职责原则
每个类只负责一个功能领域：

```typescript
// ✅ 好的实践
class SessionManager {
  createSession() {}
  getSession() {}
  deleteSession() {}
}

class BrowserConnectionPool {
  connect() {}
  disconnect() {}
  healthCheck() {}
}

// ❌ 避免
class Manager {
  createSession() {}
  connectBrowser() {}
  authenticateUser() {}
  // 职责混乱
}
```

### 2.2 依赖注入
```typescript
// ✅ 好的实践
class SessionManager {
  constructor(
    private readonly authManager: AuthManager,
    private readonly logger: Logger
  ) {}
}

const sessionManager = new SessionManager(authManager, logger);

// ❌ 避免硬编码依赖
class SessionManager {
  private authManager = new AuthManager(); // 不灵活
}
```

### 2.3 接口优于实现
```typescript
// 定义接口
interface IAuthManager {
  authenticate(token: string): Promise<User>;
  authorize(user: User, action: string): boolean;
}

// 实现可替换
class TokenAuthManager implements IAuthManager {
  async authenticate(token: string) { /* ... */ }
  authorize(user: User, action: string) { /* ... */ }
}

class OAuth2AuthManager implements IAuthManager {
  async authenticate(token: string) { /* ... */ }
  authorize(user: User, action: string) { /* ... */ }
}
```

## 3. 错误处理规范

### 3.1 错误分类
```typescript
// 业务错误
class BusinessError extends Error {
  constructor(message: string, public code: string) {
    super(message);
    this.name = 'BusinessError';
  }
}

// 系统错误
class SystemError extends Error {
  constructor(message: string, public originalError?: Error) {
    super(message);
    this.name = 'SystemError';
  }
}

// 验证错误
class ValidationError extends Error {
  constructor(
    message: string,
    public field: string,
    public value: unknown
  ) {
    super(message);
    this.name = 'ValidationError';
  }
}
```

### 3.2 统一错误处理
```typescript
async function handleRequest(req: Request, res: Response) {
  try {
    // 业务逻辑
  } catch (error) {
    if (error instanceof BusinessError) {
      res.status(400).json({
        error: error.code,
        message: error.message,
      });
    } else if (error instanceof SystemError) {
      logger.error('System error', error);
      res.status(500).json({
        error: 'INTERNAL_ERROR',
        message: 'Internal server error',
      });
    } else {
      logger.error('Unknown error', error);
      res.status(500).json({
        error: 'UNKNOWN_ERROR',
        message: 'An unexpected error occurred',
      });
    }
  }
}
```

## 4. 日志规范

### 4.1 日志级别
```typescript
// ERROR: 错误，需要立即处理
logger.error('Failed to connect to browser', {
  userId,
  browserURL,
  error: error.message,
});

// WARN: 警告，需要注意
logger.warn('Session inactive for 10 minutes', { sessionId });

// INFO: 重要信息
logger.info('New session created', { sessionId, userId });

// DEBUG: 调试信息
logger.debug('Processing request', { method, params });
```

### 4.2 日志格式
```typescript
interface LogEntry {
  timestamp: string;
  level: 'error' | 'warn' | 'info' | 'debug';
  component: string;
  message: string;
  metadata?: Record<string, unknown>;
}

// 示例
{
  timestamp: '2025-01-12T10:30:00.000Z',
  level: 'info',
  component: 'SessionManager',
  message: 'Session created',
  metadata: {
    sessionId: 'sess_123',
    userId: 'user-a',
    browserURL: 'http://192.168.1.100:9222'
  }
}
```

### 4.3 敏感数据脱敏
```typescript
function sanitizeLog(data: any): any {
  const sensitiveFields = ['password', 'token', 'apiKey'];
  
  if (typeof data === 'object' && data !== null) {
    const sanitized = { ...data };
    for (const field of sensitiveFields) {
      if (field in sanitized) {
        sanitized[field] = '***REDACTED***';
      }
    }
    return sanitized;
  }
  
  return data;
}
```

## 5. 测试规范

### 5.1 测试命名
```typescript
describe('SessionManager', () => {
  describe('createSession', () => {
    it('should create a new session with valid userId', async () => {
      // ...
    });
    
    it('should throw error when userId is invalid', async () => {
      // ...
    });
    
    it('should not create duplicate sessions for same user', async () => {
      // ...
    });
  });
});
```

### 5.2 测试结构 (AAA 模式)
```typescript
it('should authenticate valid token', async () => {
  // Arrange (准备)
  const authManager = new AuthManager();
  const validToken = 'valid_token_123';
  
  // Act (执行)
  const result = await authManager.authenticate(validToken);
  
  // Assert (断言)
  expect(result).toBeDefined();
  expect(result.userId).toBe('user-a');
});
```

### 5.3 测试覆盖率目标
- **单元测试**: > 80%
- **集成测试**: 核心流程 100%
- **E2E 测试**: 主要用户场景

### 5.4 Mock 规范
```typescript
// 使用接口 mock
const mockAuthManager: IAuthManager = {
  authenticate: async (token) => ({ userId: 'test-user' }),
  authorize: (user, action) => true,
};

// 使用 sinon stub
const connectStub = sinon.stub(browserPool, 'connect');
connectStub.resolves(mockBrowser);
```

## 6. 安全规范

### 6.1 输入验证
```typescript
import { z } from 'zod';

// 定义 schema
const RegisterSchema = z.object({
  userId: z.string().min(3).max(50).regex(/^[a-z0-9-]+$/),
  browserURL: z.string().url(),
  metadata: z.object({
    name: z.string().optional(),
    email: z.string().email().optional(),
  }).optional(),
});

// 验证
function validateRegisterRequest(data: unknown) {
  return RegisterSchema.parse(data);
}
```

### 6.2 Token 管理
```typescript
// 生成 Token
function generateToken(userId: string, expiresIn: number): string {
  return jwt.sign(
    { userId },
    process.env.JWT_SECRET!,
    { expiresIn }
  );
}

// 验证 Token
function verifyToken(token: string): { userId: string } {
  return jwt.verify(token, process.env.JWT_SECRET!) as { userId: string };
}
```

### 6.3 速率限制
```typescript
class RateLimiter {
  private requests = new Map<string, number[]>();
  
  checkLimit(userId: string, maxRequests: number, windowMs: number): boolean {
    const now = Date.now();
    const userRequests = this.requests.get(userId) || [];
    
    // 清理过期请求
    const validRequests = userRequests.filter(
      time => now - time < windowMs
    );
    
    if (validRequests.length >= maxRequests) {
      return false;
    }
    
    validRequests.push(now);
    this.requests.set(userId, validRequests);
    return true;
  }
}
```

## 7. 性能规范

### 7.1 异步操作
```typescript
// ✅ 好的实践：并行执行
async function initializeMultiple(userIds: string[]) {
  const promises = userIds.map(id => initializeUser(id));
  return Promise.all(promises);
}

// ❌ 避免：串行执行
async function initializeMultiple(userIds: string[]) {
  for (const id of userIds) {
    await initializeUser(id); // 慢
  }
}
```

### 7.2 资源清理
```typescript
class SessionManager {
  private cleanupInterval?: NodeJS.Timeout;
  
  start() {
    // 定期清理过期会话
    this.cleanupInterval = setInterval(
      () => this.cleanupExpiredSessions(),
      60000 // 每分钟
    );
  }
  
  stop() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
  }
}
```

### 7.3 内存管理
```typescript
// 使用 WeakMap 避免内存泄漏
class Cache {
  private cache = new WeakMap<object, any>();
  
  set(key: object, value: any) {
    this.cache.set(key, value);
  }
  
  get(key: object) {
    return this.cache.get(key);
  }
}
```

## 8. 文档规范

### 8.1 JSDoc 注释
```typescript
/**
 * 创建新的用户会话
 * 
 * @param userId - 用户唯一标识
 * @param browserURL - 用户浏览器的调试端口 URL
 * @returns 新创建的会话对象
 * @throws {SessionError} 当用户已有活跃会话时
 * @throws {BrowserConnectionError} 当无法连接到浏览器时
 * 
 * @example
 * ```typescript
 * const session = await sessionManager.createSession(
 *   'user-a',
 *   'http://192.168.1.100:9222'
 * );
 * ```
 */
async createSession(userId: string, browserURL: string): Promise<Session> {
  // ...
}
```

### 8.2 README 规范
每个模块应包含：
- 模块用途
- 主要 API
- 使用示例
- 配置选项
- 常见问题

## 9. Git 规范

### 9.1 提交消息
```
<type>(<scope>): <subject>

<body>

<footer>
```

类型 (type):
- `feat`: 新功能
- `fix`: 修复 bug
- `docs`: 文档
- `style`: 格式
- `refactor`: 重构
- `test`: 测试
- `chore`: 构建/工具

示例:
```
feat(multi-tenant): add session manager

- Implement session lifecycle management
- Add session timeout mechanism
- Support multiple concurrent sessions per user

Closes #123
```

### 9.2 分支策略
- `main`: 生产分支
- `develop`: 开发分支
- `feature/xxx`: 功能分支
- `fix/xxx`: 修复分支
- `test/xxx`: 测试分支

## 10. Code Review 检查清单

### 功能性
- [ ] 代码实现了需求
- [ ] 边界条件处理正确
- [ ] 错误处理完整

### 可读性
- [ ] 命名清晰有意义
- [ ] 逻辑易于理解
- [ ] 注释充分

### 可维护性
- [ ] 遵循 SOLID 原则
- [ ] 没有重复代码
- [ ] 易于扩展

### 性能
- [ ] 没有明显性能问题
- [ ] 资源正确释放
- [ ] 异步操作合理

### 安全
- [ ] 输入验证完整
- [ ] 没有安全漏洞
- [ ] 敏感数据保护

### 测试
- [ ] 单元测试覆盖
- [ ] 测试用例充分
- [ ] 测试通过
