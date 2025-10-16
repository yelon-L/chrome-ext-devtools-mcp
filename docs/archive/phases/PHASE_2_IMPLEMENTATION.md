# Phase 2: API 端点实现指南

## 已完成 ✅

**Phase 1**: PersistentStoreV2 完整实现
- 文件: `src/multi-tenant/storage/PersistentStoreV2.ts`
- 所有用户和浏览器管理方法已实现
- 包含完整的日志持久化和压缩机制

## Phase 2: server-multi-tenant.ts 更新

### 1. 引入 PersistentStoreV2

```typescript
// src/multi-tenant/server-multi-tenant.ts
// 在顶部添加
import {PersistentStoreV2, type UserRecord, type BrowserRecord} from './storage/PersistentStoreV2.js';

// 在类中替换
class MultiTenantMCPServer {
  private store: PersistentStoreV2;  // 替换原来的 PersistentStore
  
  constructor() {
    // ...
    this.store = new PersistentStoreV2({
      dataDir: process.env.DATA_DIR || './.mcp-data',
      logFileName: 'store-v2.jsonl',
      snapshotThreshold: 10000,
      autoCompaction: true,
    });
  }
}
```

### 2. 更新路由处理

在 `handleRequest` 方法中添加新路由：

```typescript
private async handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  const url = new URL(req.url!, `http://${req.headers.host}`);
  
  // ... 现有代码 ...
  
  try {
    // ========== 用户管理 API ==========
    if (url.pathname === '/api/users' && req.method === 'POST') {
      await this.handleRegisterUser(req, res);
    } else if (url.pathname === '/api/users' && req.method === 'GET') {
      await this.handleListUsersV2(req, res);
    } else if (url.pathname.match(/^\/api\/users\/[^\/]+$/) && req.method === 'GET') {
      await this.handleGetUser(req, res, url);
    } else if (url.pathname.match(/^\/api\/users\/[^\/]+$/) && req.method === 'PATCH') {
      await this.handleUpdateUsername(req, res, url);
    } else if (url.pathname.match(/^\/api\/users\/[^\/]+$/) && req.method === 'DELETE') {
      await this.handleDeleteUser(req, res, url);
    }
    
    // ========== 浏览器管理 API ==========
    else if (url.pathname.match(/^\/api\/users\/[^\/]+\/browsers$/) && req.method === 'POST') {
      await this.handleBindBrowser(req, res, url);
    } else if (url.pathname.match(/^\/api\/users\/[^\/]+\/browsers$/) && req.method === 'GET') {
      await this.handleListBrowsers(req, res, url);
    } else if (url.pathname.match(/^\/api\/users\/[^\/]+\/browsers\/[^\/]+$/) && req.method === 'GET') {
      await this.handleGetBrowser(req, res, url);
    } else if (url.pathname.match(/^\/api\/users\/[^\/]+\/browsers\/[^\/]+$/) && req.method === 'PATCH') {
      await this.handleUpdateBrowserV2(req, res, url);
    } else if (url.pathname.match(/^\/api\/users\/[^\/]+\/browsers\/[^\/]+$/) && req.method === 'DELETE') {
      await this.handleUnbindBrowser(req, res, url);
    }
    
    // ========== SSE 连接（更新） ==========
    else if (url.pathname === '/sse' && req.method === 'GET') {
      await this.handleSSEV2(req, res);
    }
    
    // ========== 向后兼容：旧的注册端点 ==========
    else if (url.pathname === '/api/register' && req.method === 'POST') {
      await this.handleLegacyRegister(req, res);
    }
    
    // ... 其他现有路由 ...
    else {
      res.writeHead(404);
      res.end('Not found');
    }
  } catch (error) {
    // 错误处理...
  }
}
```

### 3. 实现用户管理端点

```typescript
/**
 * 注册用户（新 API）
 */
private async handleRegisterUser(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  try {
    const body = await this.readRequestBody(req);
    const data = JSON.parse(body);
    const { email, username } = data;
    
    if (!email) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'email is required' }));
      return;
    }
    
    // 检查邮箱格式
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid email format' }));
      return;
    }
    
    // 检查邮箱是否已注册
    if (this.store.hasEmail(email)) {
      res.writeHead(409, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        error: 'EMAIL_EXISTS',
        message: `Email ${email} is already registered`,
      }));
      return;
    }
    
    // 注册用户
    const user = await this.store.registerUserByEmail(email, username);
    
    res.writeHead(201, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: true,
      userId: user.userId,
      email: user.email,
      username: user.username,
      createdAt: new Date(user.registeredAt).toISOString(),
    }));
  } catch (error) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      error: error instanceof Error ? error.message : String(error),
    }));
  }
}

/**
 * 获取用户信息
 */
private async handleGetUser(req: http.IncomingMessage, res: http.ServerResponse, url: URL): Promise<void> {
  const userId = url.pathname.split('/').pop();
  if (!userId) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Invalid userId' }));
    return;
  }
  
  const user = this.store.getUserById(userId);
  if (!user) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'User not found' }));
    return;
  }
  
  const browsers = this.store.listUserBrowsers(userId);
  
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    userId: user.userId,
    email: user.email,
    username: user.username,
    browsers: browsers.map(b => ({
      browserId: b.browserId,
      tokenName: b.tokenName,
      browserURL: b.browserURL,
      connected: false, // TODO: 检查连接状态
      createdAt: new Date(b.createdAt).toISOString(),
    })),
    metadata: {
      createdAt: new Date(user.registeredAt).toISOString(),
      browserCount: browsers.length,
    },
  }, null, 2));
}

/**
 * 更新用户名
 */
private async handleUpdateUsername(req: http.IncomingMessage, res: http.ServerResponse, url: URL): Promise<void> {
  const userId = url.pathname.split('/').pop();
  if (!userId) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Invalid userId' }));
    return;
  }
  
  try {
    const body = await this.readRequestBody(req);
    const data = JSON.parse(body);
    const { username } = data;
    
    if (!username) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'username is required' }));
      return;
    }
    
    await this.store.updateUsername(userId, username);
    
    const user = this.store.getUserById(userId)!;
    
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: true,
      userId: user.userId,
      username: user.username,
      updatedAt: user.updatedAt ? new Date(user.updatedAt).toISOString() : null,
    }));
  } catch (error) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      error: error instanceof Error ? error.message : String(error),
    }));
  }
}

/**
 * 删除用户
 */
private async handleDeleteUser(req: http.IncomingMessage, res: http.ServerResponse, url: URL): Promise<void> {
  const userId = url.pathname.split('/').pop();
  if (!userId) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Invalid userId' }));
    return;
  }
  
  try {
    const deletedBrowsers = await this.store.deleteUser(userId);
    
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: true,
      message: `User ${userId} and ${deletedBrowsers.length} associated browsers deleted`,
      deletedBrowsers,
    }));
  } catch (error) {
    const statusCode = error instanceof Error && error.message.includes('not found') ? 404 : 500;
    res.writeHead(statusCode, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      error: error instanceof Error ? error.message : String(error),
    }));
  }
}

/**
 * 列出所有用户（V2）
 */
private async handleListUsersV2(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  const users = this.store.getAllUsers();
  
  const usersWithBrowserCount = users.map(user => {
    const browsers = this.store.listUserBrowsers(user.userId);
    return {
      userId: user.userId,
      email: user.email,
      username: user.username,
      browserCount: browsers.length,
      createdAt: new Date(user.registeredAt).toISOString(),
    };
  });
  
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    users: usersWithBrowserCount,
    total: users.length,
  }, null, 2));
}
```

### 4. 实现浏览器管理端点

```typescript
/**
 * 绑定浏览器
 */
private async handleBindBrowser(req: http.IncomingMessage, res: http.ServerResponse, url: URL): Promise<void> {
  const pathParts = url.pathname.split('/');
  const userId = pathParts[pathParts.length - 2];
  
  if (!userId) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Invalid userId' }));
    return;
  }
  
  try {
    const body = await this.readRequestBody(req);
    const data = JSON.parse(body);
    const { browserURL, tokenName, description } = data;
    
    if (!browserURL) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'browserURL is required' }));
      return;
    }
    
    // 检测浏览器连接
    const browserDetection = await this.detectBrowser(browserURL);
    
    if (!browserDetection.connected) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        error: 'BROWSER_NOT_ACCESSIBLE',
        message: 'Cannot connect to the specified browser',
        browserURL,
        details: browserDetection.error,
        suggestions: [
          `Start Chrome with: chrome --remote-debugging-port=${new URL(browserURL).port} --remote-debugging-address=0.0.0.0`,
          'Verify the browser URL is correct and accessible',
          'Check firewall settings',
        ],
      }));
      return;
    }
    
    // 绑定浏览器
    const browser = await this.store.bindBrowser(userId, browserURL, tokenName, description);
    
    // 保存浏览器信息
    if (browserDetection.browserInfo && browser.metadata) {
      browser.metadata.browserInfo = {
        version: browserDetection.browserInfo.Browser,
        userAgent: browserDetection.browserInfo['User-Agent'],
        protocolVersion: browserDetection.browserInfo['Protocol-Version'],
      };
    }
    
    res.writeHead(201, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: true,
      browserId: browser.browserId,
      token: browser.token,
      tokenName: browser.tokenName,
      browserURL: browser.browserURL,
      browser: {
        connected: true,
        info: browserDetection.browserInfo,
      },
      message: 'Browser bound successfully. Use this token to connect.',
      createdAt: new Date(browser.createdAt).toISOString(),
    }, null, 2));
  } catch (error) {
    const statusCode = error instanceof Error && error.message.includes('not found') ? 404 :
                       error instanceof Error && error.message.includes('already exists') ? 409 : 500;
    res.writeHead(statusCode, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      error: error instanceof Error ? error.message : String(error),
    }));
  }
}

/**
 * 列出用户的浏览器
 */
private async handleListBrowsers(req: http.IncomingMessage, res: http.ServerResponse, url: URL): Promise<void> {
  const pathParts = url.pathname.split('/');
  const userId = pathParts[pathParts.length - 2];
  
  if (!userId) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Invalid userId' }));
    return;
  }
  
  const browsers = this.store.listUserBrowsers(userId);
  
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    browsers: browsers.map(b => ({
      browserId: b.browserId,
      tokenName: b.tokenName,
      token: b.token,
      browserURL: b.browserURL,
      connected: false, // TODO: 检查连接状态
      description: b.metadata?.description,
      browserInfo: b.metadata?.browserInfo,
      createdAt: new Date(b.createdAt).toISOString(),
      lastConnectedAt: b.lastConnectedAt ? new Date(b.lastConnectedAt).toISOString() : null,
    })),
    total: browsers.length,
  }, null, 2));
}

/**
 * 解绑浏览器
 */
private async handleUnbindBrowser(req: http.IncomingMessage, res: http.ServerResponse, url: URL): Promise<void> {
  const pathParts = url.pathname.split('/');
  const tokenName = pathParts[pathParts.length - 1];
  const userId = pathParts[pathParts.length - 3];
  
  if (!userId || !tokenName) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Invalid userId or tokenName' }));
    return;
  }
  
  try {
    const browser = this.store.getBrowserByUserAndName(userId, tokenName);
    if (!browser) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Browser not found' }));
      return;
    }
    
    await this.store.unbindBrowser(browser.browserId);
    
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: true,
      message: `Browser '${tokenName}' unbound and token revoked`,
      tokenName,
      deletedAt: new Date().toISOString(),
    }));
  } catch (error) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      error: error instanceof Error ? error.message : String(error),
    }));
  }
}
```

### 5. 更新 SSE 连接

```typescript
/**
 * 处理 SSE 连接（V2 - 使用 token）
 */
private async handleSSEV2(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  const startTime = Date.now();
  this.stats.totalConnections++;
  
  // 认证
  const authResult = await this.authenticate(req);
  if (!authResult.success) {
    this.stats.totalErrors++;
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: authResult.error }));
    return;
  }
  
  // 从 Authorization header 提取 token
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    this.stats.totalErrors++;
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Missing or invalid Authorization header' }));
    return;
  }
  
  const token = authHeader.substring(7); // Remove 'Bearer '
  
  // 从 token 查找浏览器
  const browser = this.store.getBrowserByToken(token);
  if (!browser) {
    this.stats.totalErrors++;
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      error: 'Browser not found',
      message: 'Invalid token or browser has been unbound',
    }));
    return;
  }
  
  logger(`[Server] 📡 SSE connection: ${browser.userId}/${browser.tokenName}`);
  
  // 更新最后连接时间
  await this.store.updateLastConnected(browser.browserId);
  
  // 建立连接（使用浏览器的 URL）
  try {
    const browserInstance = await this.browserPool.connect(browser.browserId, browser.browserURL);
    // ... 后续 SSE 连接逻辑
  } catch (error) {
    this.stats.totalErrors++;
    logger(`[Server] ❌ connection failed: ${browser.userId}/${browser.tokenName}`);
    // 错误处理...
  }
}
```

### 6. 向后兼容端点

```typescript
/**
 * 旧的注册端点（向后兼容）
 * @deprecated 使用 POST /api/users + POST /api/users/:userId/browsers
 */
private async handleLegacyRegister(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  try {
    const body = await this.readRequestBody(req);
    const data = JSON.parse(body);
    const { userId, browserURL, metadata } = data;
    
    if (!userId || !browserURL) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'userId and browserURL are required' }));
      return;
    }
    
    // 转换为新流程：
    // 1. 创建用户（email = userId@legacy.local）
    const email = `${userId}@legacy.local`;
    let user;
    
    try {
      user = await this.store.registerUserByEmail(email, userId);
    } catch (error) {
      // 用户可能已存在
      user = this.store.getUserById(userId);
      if (!user) throw error;
    }
    
    // 2. 绑定浏览器
    const browserDetection = await this.detectBrowser(browserURL);
    
    if (!browserDetection.connected) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        error: 'BROWSER_NOT_ACCESSIBLE',
        message: 'Cannot connect to the specified browser',
        suggestions: ['...'],
      }));
      return;
    }
    
    const browser = await this.store.bindBrowser(userId, browserURL, 'default', 'Migrated from legacy API');
    
    // 3. 返回兼容的响应
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: true,
      userId,
      browserURL,
      token: browser.token,
      browser: {
        connected: true,
        info: browserDetection.browserInfo,
      },
      message: 'User registered (legacy API). Please migrate to POST /api/users',
      _deprecated: true,
      _newAPI: {
        registerUser: 'POST /api/users',
        bindBrowser: `POST /api/users/${userId}/browsers`,
      },
    }));
  } catch (error) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      error: error instanceof Error ? error.message : String(error),
    }));
  }
}
```

## 下一步

1. 将以上代码整合到 `server-multi-tenant.ts`
2. 测试编译: `npm run build`
3. 进入 Phase 3: 创建测试脚本
4. 进入 Phase 4: 更新文档

## 注意事项

- 所有新端点都需要认证（除了 `/api/users` POST）
- 浏览器绑定时必须先验证连接
- Token 和浏览器是一一对应关系
- 删除用户会级联删除所有浏览器
