#!/usr/bin/env node
/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * MCP 多租户代理服务器
 * 
 * 支持多用户同时连接，每个用户操作自己的浏览器
 */

import '../polyfill.js';

import http from 'node:http';
import {URL} from 'node:url';

import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import {SSEServerTransport} from '@modelcontextprotocol/sdk/server/sse.js';
import type {CallToolResult} from '@modelcontextprotocol/sdk/types.js';

import {logger} from '../logger.js';
import {McpContext} from '../McpContext.js';
import {McpResponse} from '../McpResponse.js';
import {Mutex} from '../Mutex.js';
import {getAllTools} from '../tools/registry.js';
import type {ToolDefinition} from '../tools/ToolDefinition.js';
import {readPackageJson} from '../utils/common.js';

import {SessionManager} from './core/SessionManager.js';
import {RouterManager} from './core/RouterManager.js';
import {AuthManager} from './core/AuthManager.js';
import {BrowserConnectionPool} from './core/BrowserConnectionPool.js';

/**
 * 多租户 MCP 代理服务器
 */
class MultiTenantMCPServer {
  private version: string;
  private port: number;
  private httpServer?: http.Server;
  
  // 核心管理器
  private sessionManager: SessionManager;
  private routerManager: RouterManager;
  private authManager: AuthManager;
  private browserPool: BrowserConnectionPool;
  
  private toolMutex = new Mutex();
  
  // 性能统计
  private stats = {
    totalConnections: 0,
    totalRequests: 0,
    totalErrors: 0,
    connectionTimes: [] as number[],
  };
  
  // 并发控制 - 每个用户同时只能有一个连接正在建立
  private activeConnections = new Map<string, Promise<void>>();

  constructor() {
    this.version = readPackageJson().version ?? '0.8.1';
    this.port = parseInt(process.env.PORT || '32122', 10);

    // 初始化管理器
    this.sessionManager = new SessionManager({
      timeout: 3600000, // 1 小时
      cleanupInterval: 60000, // 1 分钟
    });

    this.routerManager = new RouterManager();

    // 从环境变量读取认证配置
    const authEnabled = process.env.AUTH_ENABLED !== 'false';
    this.authManager = new AuthManager({
      enabled: authEnabled,
      tokenExpiration: 86400, // 24 小时
      type: 'token',
    });

    this.browserPool = new BrowserConnectionPool({
      healthCheckInterval: 30000, // 30 秒
      maxReconnectAttempts: 3,
      reconnectDelay: 5000, // 5 秒
    });
  }

  /**
   * 启动服务器
   */
  async start(): Promise<void> {
    console.log('\n╔════════════════════════════════════════════════════════╗');
    console.log('║   Chrome DevTools MCP - Multi-Tenant Server           ║');
    console.log('╚════════════════════════════════════════════════════════╝\n');

    // 启动管理器
    this.sessionManager.start();
    this.browserPool.start();

    // 创建 HTTP 服务器
    this.httpServer = http.createServer(async (req, res) => {
      await this.handleRequest(req, res);
    });

    // 错误处理
    this.httpServer.on('error', (error: NodeJS.ErrnoException) => {
      this.handleServerError(error);
    });

    // 启动监听
    await new Promise<void>((resolve) => {
      this.httpServer!.listen(this.port, () => {
        console.log(`[Server] 🌐 服务器已启动`);
        console.log(`[Server] 📡 端口: ${this.port}`);
        console.log(`[Server] 🔗 端点:`);
        console.log(`      - Health:   http://localhost:${this.port}/health`);
        console.log(`      - Register: http://localhost:${this.port}/api/register`);
        console.log(`      - SSE:      http://localhost:${this.port}/sse`);
        console.log(`      - Message:  http://localhost:${this.port}/message`);
        console.log(`      - Test:     http://localhost:${this.port}/test`);
        console.log('');
        console.log(`[Server] 🔐 认证: ${this.authManager.isEnabled() ? '已启用' : '未启用'}`);
        console.log('[Server] 传输方式: Server-Sent Events (SSE)');
        console.log('[Server] 按 Ctrl+C 停止\n');
        resolve();
      });
    });

    // 处理进程信号
    this.setupSignalHandlers();
  }

  /**
   * 处理 HTTP 请求
   */
  private async handleRequest(
    req: http.IncomingMessage,
    res: http.ServerResponse
  ): Promise<void> {
    const url = new URL(req.url!, `http://${req.headers.host}`);
    logger(`[Server] 📥 ${req.method} ${url.pathname}`);

    // CORS 头
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-User-Id');

    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }

    try {
      // 路由分发
      if (url.pathname === '/health') {
        await this.handleHealth(req, res);
      } else if (url.pathname === '/api/register' && req.method === 'POST') {
        await this.handleRegister(req, res);
      } else if (url.pathname === '/api/users' && req.method === 'GET') {
        await this.handleListUsers(req, res);
      } else if (url.pathname.startsWith('/api/users/') && req.method === 'GET') {
        await this.handleUserStatus(req, res, url);
      } else if (url.pathname === '/sse' && req.method === 'GET') {
        logger(`[Server] ➡️  路由到 handleSSE`);
        await this.handleSSE(req, res);
      } else if (url.pathname === '/message' && req.method === 'POST') {
        await this.handleMessage(req, res, url);
      } else if (url.pathname === '/test' || url.pathname === '/') {
        this.handleTestPage(res);
      } else {
        res.writeHead(404);
        res.end('Not found');
      }
    } catch (error) {
      logger(`[Server] 请求处理错误: ${error}`);
      res.writeHead(500);
      res.end(JSON.stringify({
        error: 'Internal server error',
        message: error instanceof Error ? error.message : String(error),
      }));
    }
  }

  /**
   * 处理健康检查
   */
  private async handleHealth(
    req: http.IncomingMessage,
    res: http.ServerResponse
  ): Promise<void> {
    // 计算平均连接时间
    const avgConnectionTime = this.stats.connectionTimes.length > 0
      ? Math.round(this.stats.connectionTimes.reduce((a, b) => a + b, 0) / this.stats.connectionTimes.length)
      : 0;
    
    const stats = {
      status: 'ok',
      version: this.version,
      sessions: this.sessionManager.getStats(),
      browsers: this.browserPool.getStats(),
      users: this.routerManager.getStats(),
      performance: {
        totalConnections: this.stats.totalConnections,
        totalRequests: this.stats.totalRequests,
        totalErrors: this.stats.totalErrors,
        avgConnectionTime: `${avgConnectionTime}ms`,
        errorRate: this.stats.totalConnections > 0
          ? `${((this.stats.totalErrors / this.stats.totalConnections) * 100).toFixed(2)}%`
          : '0%',
      },
      uptime: process.uptime(),
    };

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(stats, null, 2));
  }

  /**
   * 处理用户注册
   */
  private async handleRegister(
    req: http.IncomingMessage,
    res: http.ServerResponse
  ): Promise<void> {
    // 认证
    const authResult = await this.authenticate(req);
    if (!authResult.success) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: authResult.error }));
      return;
    }

    // 读取请求体
    const body = await this.readRequestBody(req);
    const data = JSON.parse(body);

    const { userId, browserURL, metadata } = data;

    // 验证参数
    if (!userId || !browserURL) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        error: 'userId and browserURL are required',
      }));
      return;
    }

    try {
      // 注册用户
      this.routerManager.registerUser(userId, browserURL, metadata);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        userId,
        browserURL,
        message: 'User registered successfully',
      }));
    } catch (error) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        error: error instanceof Error ? error.message : String(error),
      }));
    }
  }

  /**
   * 处理用户列表查询
   */
  private async handleListUsers(
    req: http.IncomingMessage,
    res: http.ServerResponse
  ): Promise<void> {
    // 认证
    const authResult = await this.authenticate(req);
    if (!authResult.success) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: authResult.error }));
      return;
    }

    const users = this.routerManager.getAllMappings().map(mapping => ({
      userId: mapping.userId,
      browserURL: mapping.browserURL,
      registeredAt: mapping.registeredAt,
      metadata: mapping.metadata,
    }));

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ users }, null, 2));
  }

  /**
   * 处理用户状态查询
   */
  private async handleUserStatus(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    url: URL
  ): Promise<void> {
    // 认证
    const authResult = await this.authenticate(req);
    if (!authResult.success) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: authResult.error }));
      return;
    }

    const userId = url.pathname.split('/').pop();
    if (!userId) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid userId' }));
      return;
    }

    const mapping = this.routerManager.getUserMapping(userId);
    if (!mapping) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'User not found' }));
      return;
    }

    const connection = this.browserPool.getConnection(userId);
    const sessions = this.sessionManager.getUserSessions(userId);

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      userId,
      browserURL: mapping.browserURL,
      browserStatus: connection?.status ?? 'not_connected',
      activeSessions: sessions.length,
      registeredAt: mapping.registeredAt,
    }, null, 2));
  }

  /**
   * 处理 SSE 连接
   */
  private async handleSSE(
    req: http.IncomingMessage,
    res: http.ServerResponse
  ): Promise<void> {
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

    // 获取用户 ID (支持 header 和 query 参数)
    const url = new URL(req.url!, `http://${req.headers.host}`);
    const userId = (req.headers['x-user-id'] as string) || url.searchParams.get('userId');
    
    if (!userId) {
      this.stats.totalErrors++;
      logger(`[Server] ❌ 缺少 userId`);
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ 
        error: 'userId is required',
        hint: 'Provide X-User-Id header or userId query parameter'
      }));
      return;
    }

    // 检查用户是否已注册
    const browserURL = this.routerManager.getUserBrowserURL(userId);
    if (!browserURL) {
      this.stats.totalErrors++;
      logger(`[Server] ❌ 用户未注册: ${userId}`);
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        error: 'User not registered',
        message: 'Please register your browser URL first',
      }));
      return;
    }

    logger(`[Server] 📡 SSE 连接请求: ${userId}`);

    try {
      await this.establishConnection(userId, browserURL, res, startTime);
    } catch (error) {
      // 错误已在 establishConnection 中处理和记录
      logger(`[Server] ❌ 连接建立失败: ${userId}`);
    }
  }

  /**
   * 建立 SSE 连接
   */
  private async establishConnection(
    userId: string,
    browserURL: string,
    res: http.ServerResponse,
    startTime: number
  ): Promise<void> {
    // 设置整体超时 30 秒
    const timeout = setTimeout(() => {
      this.stats.totalErrors++;
      logger(`[Server] ⏰ 连接超时: ${userId}`);
      if (!res.headersSent) {
        res.writeHead(504, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          error: 'Connection timeout',
          message: 'Failed to establish connection within 30 seconds',
        }));
      }
    }, 30000);

    try {
      logger(`[Server] 🔌 开始连接浏览器: ${userId}`);
      // 连接到用户的浏览器
      const browser = await this.browserPool.connect(userId, browserURL);
      logger(`[Server] ✓ 浏览器连接成功: ${userId}`);

      // 创建 SSE 传输层
      logger(`[Server] 📡 创建SSE传输: ${userId}`);
      const transport = new SSEServerTransport('/message', res);
      logger(`[Server] ✓ SSE传输已创建: ${userId}`);

      // 创建 MCP 服务器
      logger(`[Server] 🔧 创建MCP服务器: ${userId}`);
      const mcpServer = new McpServer(
        { name: 'chrome-devtools-mcp-multi-tenant', version: this.version },
        { capabilities: { tools: {} } }
      );

      // 创建 MCP 上下文（使用最小化模式 - 延迟初始化）
      logger(`[Server] 📦 创建MCP上下文: ${userId}`);
      const context = await McpContext.fromMinimal(browser, logger);
      logger(`[Server] ✓ MCP上下文已创建（延迟模式）: ${userId}`);

      // 注册所有工具
      logger(`[Server] 🛠️  注册工具: ${userId}`);
      const tools = getAllTools();
      for (const tool of tools) {
        this.registerTool(mcpServer, tool, context);
      }
      logger(`[Server] ✓ 已注册${tools.length}个工具: ${userId}`);

      // 连接 MCP 服务器
      logger(`[Server] 🔗 连接MCP服务器: ${userId}`);
      await mcpServer.connect(transport);
      logger(`[Server] ✓ MCP服务器已连接: ${userId}`);

      const sessionId = transport.sessionId;

      // 创建会话
      this.sessionManager.createSession(
        sessionId,
        userId,
        transport,
        mcpServer,
        context,
        browser
      );

      const elapsed = Date.now() - startTime;
      
      // 记录连接时间统计
      this.stats.connectionTimes.push(elapsed);
      if (this.stats.connectionTimes.length > 100) {
        this.stats.connectionTimes.shift(); // 保留最近100次
      }
      
      logger(`[Server] ✅ 会话建立: ${sessionId.slice(0, 8)}... (用户: ${userId}, 耗时: ${elapsed}ms)`);

      // 处理关闭事件
      transport.onclose = async () => {
        logger(`[Server] 📴 会话关闭: ${sessionId.slice(0, 8)}... (用户: ${userId})`);
        await this.sessionManager.deleteSession(sessionId);
      };
      
      // 处理错误事件
      transport.onerror = async (error) => {
        this.stats.totalErrors++;
        logger(`[Server] ⚠️  传输错误: ${sessionId.slice(0, 8)}... - ${error}`);
      };
      
      // 清除超时
      clearTimeout(timeout);
    } catch (error) {
      clearTimeout(timeout);
      this.stats.totalErrors++;
      const elapsed = Date.now() - startTime;
      logger(`[Server] ❌ SSE 连接失败: ${userId} (耗时: ${elapsed}ms) - ${error}`);
      
      // 确保响应未发送时才写入错误
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          error: 'Failed to connect to browser',
          message: error instanceof Error ? error.message : String(error),
        }));
      }
      
      throw error; // 重新抛出以便调用者知道失败
    }
  }

  /**
   * 处理消息
   */
  private async handleMessage(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    url: URL
  ): Promise<void> {
    this.stats.totalRequests++;
    
    const sessionId = url.searchParams.get('sessionId');

    if (!sessionId) {
      this.stats.totalErrors++;
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing sessionId' }));
      return;
    }

    const session = this.sessionManager.getSession(sessionId);
    if (!session) {
      this.stats.totalErrors++;
      logger(`[Server] ⚠️  会话未找到: ${sessionId.slice(0, 8)}...`);
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Session not found' }));
      return;
    }

    // 更新活跃时间
    this.sessionManager.updateActivity(sessionId);

    try {
      const body = await this.readRequestBody(req);
      const message = JSON.parse(body);
      await session.transport.handlePostMessage(req, res, message);
    } catch (error) {
      this.stats.totalErrors++;
      logger(`[Server] ❌ 消息处理错误: ${sessionId.slice(0, 8)}... - ${error}`);
      
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          error: error instanceof Error ? error.message : String(error),
        }));
      }
    }
  }

  /**
   * 处理测试页面
   */
  private handleTestPage(res: http.ServerResponse): void {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(this.getTestPageHTML());
  }

  /**
   * 注册工具
   */
  private registerTool(
    mcpServer: McpServer,
    tool: ToolDefinition,
    context: McpContext
  ): void {
    mcpServer.registerTool(
      tool.name,
      {
        description: tool.description,
        inputSchema: tool.schema,
        annotations: tool.annotations,
      },
      async (params): Promise<CallToolResult> => {
        const guard = await this.toolMutex.acquire();
        try {
          // 确保上下文已初始化（延迟创建页面）
          await context.ensureInitialized();
          
          const response = new McpResponse();
          await tool.handler({ params }, response, context);
          const content = await response.handle(tool.name, context);
          return { content };
        } catch (error) {
          const errorText = error instanceof Error ? error.message : String(error);
          return {
            content: [{ type: 'text', text: errorText }],
            isError: true,
          };
        } finally {
          guard.dispose();
        }
      }
    );
  }

  /**
   * 认证请求
   */
  private async authenticate(req: http.IncomingMessage): Promise<{
    success: boolean;
    error?: string;
  }> {
    if (!this.authManager.isEnabled()) {
      return { success: true };
    }

    const authorization = req.headers['authorization'] as string | undefined;
    const token = AuthManager.extractTokenFromHeader(authorization);

    if (!token) {
      return { success: false, error: 'Authorization header is required' };
    }

    return await this.authManager.authenticate(token);
  }

  /**
   * 读取请求体
   */
  private async readRequestBody(req: http.IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
      let body = '';
      req.on('data', chunk => { body += chunk.toString(); });
      req.on('end', () => resolve(body));
      req.on('error', reject);
    });
  }

  /**
   * 处理服务器错误
   */
  private handleServerError(error: NodeJS.ErrnoException): void {
    console.error('\n[Server] ❌ 服务器启动失败');
    console.error('');

    if (error.code === 'EADDRINUSE') {
      console.error(`❌ 端口 ${this.port} 已被占用`);
      console.error('');
      console.error('解决方案：');
      console.error(`  1. 使用其他端口: PORT=${this.port + 1} npm run start`);
      console.error(`  2. 查找占用端口的进程:`);
      console.error(`     Windows: netstat -ano | findstr ${this.port}`);
      console.error(`     Linux/Mac: lsof -i :${this.port}`);
      console.error(`  3. 关闭占用端口的程序`);
    } else if (error.code === 'EACCES') {
      console.error(`❌ 权限不足，无法绑定端口 ${this.port}`);
    } else {
      console.error(`❌ 错误: ${error.message}`);
    }

    console.error('');
    process.exit(1);
  }

  /**
   * 设置信号处理器
   */
  private setupSignalHandlers(): void {
    process.on('SIGINT', async () => {
      await this.shutdown();
    });

    process.on('SIGTERM', async () => {
      await this.shutdown();
    });
  }

  /**
   * 优雅关闭
   */
  private async shutdown(): Promise<void> {
    console.log('\n[Server] 🛑 正在关闭...');

    // 停止管理器
    this.sessionManager.stop();
    await this.browserPool.stop();

    // 清理所有会话
    await this.sessionManager.cleanupAll();

    // 关闭 HTTP 服务器
    if (this.httpServer) {
      this.httpServer.close(() => {
        console.log('[Server] ✅ 服务器已关闭');
        process.exit(0);
      });
    } else {
      process.exit(0);
    }
  }

  /**
   * 获取测试页面 HTML
   */
  private getTestPageHTML(): string {
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>MCP 多租户测试</title>
  <style>
    body { font-family: monospace; padding: 20px; max-width: 1200px; margin: 0 auto; }
    h1 { color: #333; }
    .section { margin: 20px 0; padding: 15px; border: 1px solid #ddd; border-radius: 5px; }
    button { padding: 10px 20px; margin: 5px; cursor: pointer; font-size: 14px; }
    button.primary { background: #007bff; color: white; border: none; border-radius: 4px; }
    button.primary:hover { background: #0056b3; }
    input { padding: 8px; margin: 5px; width: 300px; }
    pre { background: #f5f5f5; padding: 10px; border-radius: 4px; overflow-x: auto; }
    .log { max-height: 400px; overflow-y: auto; }
    .success { color: green; }
    .error { color: red; }
  </style>
</head>
<body>
  <h1>🧪 MCP 多租户代理 - 测试页面</h1>
  
  <div class="section">
    <h2>1. 注册用户</h2>
    <input id="userId" placeholder="用户 ID (如: user-a)" />
    <input id="browserURL" placeholder="浏览器 URL (如: http://localhost:9222)" />
    <button class="primary" onclick="registerUser()">注册</button>
  </div>

  <div class="section">
    <h2>2. 连接 SSE</h2>
    <input id="sseUserId" placeholder="用户 ID" />
    <button class="primary" onclick="connectSSE()">连接</button>
    <p>会话ID: <span id="sessionId">未连接</span></p>
  </div>

  <div class="section">
    <h2>3. 测试工具</h2>
    <button class="primary" onclick="initialize()">初始化</button>
    <button class="primary" onclick="listExtensions()">list_extensions</button>
  </div>

  <div class="section">
    <h2>日志</h2>
    <button onclick="clearLog()">清空日志</button>
    <pre id="log" class="log"></pre>
  </div>

  <script>
    let eventSource = null;
    let sessionId = null;
    let messageId = 1;
    const pending = new Map();

    function log(msg, type = 'info') {
      const logEl = document.getElementById('log');
      const time = new Date().toLocaleTimeString();
      logEl.textContent += \`[\${time}] \${msg}\\n\`;
      logEl.scrollTop = logEl.scrollHeight;
    }

    async function registerUser() {
      const userId = document.getElementById('userId').value;
      const browserURL = document.getElementById('browserURL').value;

      const res = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, browserURL }),
      });

      const data = await res.json();
      log(res.ok ? '✅ 注册成功: ' + userId : '❌ 注册失败: ' + data.error);
    }

    function connectSSE() {
      const userId = document.getElementById('sseUserId').value;
      if (!userId) {
        alert('请输入用户 ID');
        return;
      }

      eventSource = new EventSource('/sse', {
        headers: { 'X-User-Id': userId }
      });

      eventSource.addEventListener('endpoint', (e) => {
        const data = JSON.parse(e.data);
        sessionId = new URL(data.uri, location.href).searchParams.get('sessionId');
        document.getElementById('sessionId').textContent = sessionId;
        log('✅ SSE 连接成功, 会话: ' + sessionId);
      });

      eventSource.addEventListener('message', (e) => {
        const msg = JSON.parse(e.data);
        if (msg.id && pending.has(msg.id)) {
          pending.get(msg.id).resolve(msg.result);
          pending.delete(msg.id);
        }
      });
    }

    async function sendRequest(method, params = {}) {
      if (!sessionId) {
        alert('请先连接 SSE');
        return null;
      }

      const id = messageId++;
      const message = { jsonrpc: '2.0', id, method, params };

      await fetch(\`/message?sessionId=\${sessionId}\`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(message),
      });

      return new Promise((resolve) => {
        pending.set(id, { resolve });
        setTimeout(() => {
          if (pending.has(id)) {
            pending.delete(id);
            resolve(null);
            log('⏰ 请求超时');
          }
        }, 10000);
      });
    }

    async function initialize() {
      log('发送初始化请求...');
      const result = await sendRequest('initialize', {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'web-test', version: '1.0.0' },
      });
      log(result ? '✅ 初始化成功' : '❌ 初始化失败');
    }

    async function listExtensions() {
      log('调用 list_extensions...');
      const result = await sendRequest('tools/call', {
        name: 'list_extensions',
        arguments: {},
      });
      if (result) {
        const text = result.content[0]?.text || '';
        log('✅ list_extensions 完成');
        log(text.substring(0, 500));
      } else {
        log('❌ list_extensions 失败');
      }
    }

    function clearLog() {
      document.getElementById('log').textContent = '';
    }
  </script>
</body>
</html>`;
  }
}

// 启动服务器
const server = new MultiTenantMCPServer();
server.start().catch((error) => {
  console.error('[Server] ❌ 启动失败:', error);
  process.exit(1);
});
