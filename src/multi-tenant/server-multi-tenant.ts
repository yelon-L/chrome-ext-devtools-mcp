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

import crypto from 'node:crypto';
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
import {VERSION} from '../version.js';
import {displayMultiTenantModeInfo} from '../utils/modeMessages.js';

import {SessionManager} from './core/SessionManager.js';
import {RouterManager} from './core/RouterManager.js';
import {AuthManager} from './core/AuthManager.js';
import {BrowserConnectionPool} from './core/BrowserConnectionPool.js';
import {parseAllowedIPs, isIPAllowed, getPatternDescription} from './utils/ip-matcher.js';
import {PersistentStore} from './storage/PersistentStore.js';

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
  private store: PersistentStore;
  
  // 每个会话一个Mutex，避免全局锁导致的性能瓶颈
  private sessionMutexes = new Map<string, Mutex>();
  
  // 性能统计
  private stats = {
    totalConnections: 0,
    totalRequests: 0,
    totalErrors: 0,
  };
  
  // 循环缓冲区：保存最近100次连接时间，避免 shift() 的 O(n) 开销
  private static readonly CONNECTION_TIMES_BUFFER_SIZE = 100;
  private connectionTimesBuffer = new Array<number>(MultiTenantMCPServer.CONNECTION_TIMES_BUFFER_SIZE);
  private connectionTimesIndex = 0;
  private connectionTimesCount = 0; // 实际数据数量
  
  // 并发控制 - 每个用户同时只能有一个连接正在建立
  private activeConnections = new Map<string, Promise<void>>();
  
  // CDP 混合架构配置
  private useCdpHybrid: boolean;
  private useCdpOperations: boolean;
  
  // IP 白名单配置
  private allowedIPPatterns: string[] | null;

  constructor() {
    this.version = VERSION;
    this.port = parseInt(process.env.PORT || '32122', 10);
    
    // 从环境变量读取 IP 白名单
    const allowedIPsEnv = process.env.ALLOWED_IPS;
    if (allowedIPsEnv) {
      this.allowedIPPatterns = parseAllowedIPs(allowedIPsEnv);
      console.log(`🔒 IP 白名单已启用 (${this.allowedIPPatterns.length} 个规则):`);
      for (const pattern of this.allowedIPPatterns) {
        console.log(`   - ${getPatternDescription(pattern)}`);
      }
    } else {
      this.allowedIPPatterns = null;
      console.log('🌍 未设置 IP 白名单，允许所有 IP 访问');
    }

    // 初始化持久化存储
    this.store = new PersistentStore({
      dataDir: process.env.DATA_DIR || './.mcp-data',
      logFileName: 'auth-store.jsonl',
      snapshotThreshold: 10000,
      autoCompaction: true,
    });

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
    
    // CDP 混合架构：从环境变量读取配置
    this.useCdpHybrid = process.env.USE_CDP_HYBRID === 'true';
    this.useCdpOperations = process.env.USE_CDP_OPERATIONS === 'true';
    
    if (this.useCdpHybrid) {
      console.log('🚀 CDP 混合架构已启用 - Target 管理（实验性）');
    }
    if (this.useCdpOperations) {
      console.log('⚡ CDP 高频操作已启用 - navigate/evaluate（实验性）');
    }
  }

  /**
   * 启动服务器
   */
  async start(): Promise<void> {
    console.log(`\n${'-'.repeat(60)}`);
    console.log(`Chrome DevTools MCP v${this.version}`);
    console.log(`Multi-Tenant Server`);
    console.log(`${'-'.repeat(60)}\n`);

    // 初始化存储引擎
    await this.store.initialize();

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
        console.log('');
        displayMultiTenantModeInfo(this.port);
        console.log(`✅ Multi-tenant server started successfully`);
        console.log(`   Authentication: ${this.authManager.isEnabled() ? 'Enabled' : 'Disabled'}`);
        console.log('   Press Ctrl+C to stop\n');
        resolve();
      });
    });

    // 处理进程信号
    this.setupSignalHandlers();
  }

  /**
   * 检查 IP 是否在白名单中
   */
  private isIPAllowed(req: http.IncomingMessage): boolean {
    // 如果未设置白名单，允许所有 IP
    if (!this.allowedIPPatterns) {
      return true;
    }

    // 获取客户端 IP
    const clientIP = this.getClientIP(req);
    
    // 使用增强的 IP 匹配器检查
    const allowed = isIPAllowed(clientIP, this.allowedIPPatterns);
    
    if (!allowed) {
      console.log(`⛔ IP 检查失败: ${clientIP}`);
      console.log(`   配置的规则: ${this.allowedIPPatterns.join(', ')}`);
    }
    
    return allowed;
  }

  /**
   * 获取客户端真实 IP
   * 支持代理场景（X-Forwarded-For, X-Real-IP）
   */
  private getClientIP(req: http.IncomingMessage): string {
    // 检查 X-Forwarded-For 头（代理场景）
    const xForwardedFor = req.headers['x-forwarded-for'];
    if (xForwardedFor) {
      const ips = typeof xForwardedFor === 'string' 
        ? xForwardedFor.split(',').map(ip => ip.trim())
        : xForwardedFor[0].split(',').map(ip => ip.trim());
      return ips[0]; // 返回最原始的 IP
    }

    // 检查 X-Real-IP 头
    const xRealIP = req.headers['x-real-ip'];
    if (xRealIP) {
      return typeof xRealIP === 'string' ? xRealIP : xRealIP[0];
    }

    // 直接连接场景
    return req.socket.remoteAddress || '0.0.0.0';
  }

  /**
   * 处理 HTTP 请求
   */
  private async handleRequest(
    req: http.IncomingMessage,
    res: http.ServerResponse
  ): Promise<void> {
    const url = new URL(req.url!, `http://${req.headers.host}`);
    
    // IP 白名单检查（/health 端点除外）
    if (url.pathname !== '/health' && !this.isIPAllowed(req)) {
      const clientIP = this.getClientIP(req);
      console.error(`⛔ IP 被拒绝: ${clientIP}`);
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ 
        error: 'Access denied', 
        message: 'Your IP address is not allowed to access this server'
      }));
      return;
    }

    // 生成Request ID用于追踪
    const requestId = crypto.randomUUID();
    res.setHeader('X-Request-ID', requestId);
    
    logger(`[Server] 📥 [${requestId}] ${req.method} ${url.pathname}`);

    // CORS 头（支持白名单配置）
    this.#setCorsHeaders(req, res);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-User-Id, X-Request-ID');

    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }

    try {
      // 路由分发
      if (url.pathname === '/health') {
        await this.handleHealth(req, res);
      } else if (url.pathname === '/api/auth/token' && req.method === 'POST') {
        await this.handleGenerateToken(req, res);
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
   * Classify error type and provide user-friendly error messages
   * 
   * @param error - Error object
   * @returns Error classification with actionable message
   */
  private classifyError(error: unknown): {
    type: 'client' | 'server';
    statusCode: number;
    errorCode: string;
    safeMessage: string;
    suggestions?: string[];
  } {
    const message = error instanceof Error ? error.message : String(error);
    
    // Browser connection errors
    if (
      message.includes('Failed to fetch browser webSocket URL') ||
      message.includes('ECONNREFUSED') ||
      message.includes('connect ECONNREFUSED') ||
      message.includes('fetch failed')
    ) {
      return {
        type: 'client',
        statusCode: 400,
        errorCode: 'BROWSER_CONNECTION_FAILED',
        safeMessage: 'Cannot connect to Chrome browser. Please verify browser is running with remote debugging enabled.',
        suggestions: [
          'Start Chrome with: chrome --remote-debugging-port=9222 --remote-debugging-address=0.0.0.0',
          'Check if the browser URL is correct and accessible',
          'Verify firewall allows connections to the debugging port',
          'Ensure Chrome is running on the specified host and port',
        ],
      };
    }
    
    // User/configuration errors
    if (
      message.includes('Invalid browser URL') ||
      message.includes('User not found') ||
      message.includes('Invalid user')
    ) {
      return {
        type: 'client',
        statusCode: 400,
        errorCode: 'INVALID_CONFIGURATION',
        safeMessage: 'Invalid user configuration. Please check your registration details.',
        suggestions: [
          'Verify the browser URL format (e.g., http://localhost:9222)',
          'Ensure you have registered the user before connecting',
          'Check that the user ID matches your registration',
        ],
      };
    }
    
    // Timeout errors
    if (message.includes('timeout') || message.includes('Timeout')) {
      return {
        type: 'server',
        statusCode: 504,
        errorCode: 'CONNECTION_TIMEOUT',
        safeMessage: 'Connection timeout. The browser took too long to respond.',
        suggestions: [
          'Check if Chrome is responsive and not frozen',
          'Verify network connectivity between server and browser',
          'Try restarting Chrome with remote debugging',
          'Increase timeout if browser is on slow network',
        ],
      };
    }
    
    // Authentication errors
    if (message.includes('Unauthorized') || message.includes('Invalid token')) {
      return {
        type: 'client',
        statusCode: 401,
        errorCode: 'AUTHENTICATION_FAILED',
        safeMessage: 'Authentication failed. Invalid or expired token.',
        suggestions: [
          'Request a new token using POST /api/auth/token',
          'Check that the Authorization header is correctly formatted',
          'Verify the token has not expired',
        ],
      };
    }
    
    // CDP/Puppeteer errors
    if (message.includes('Target closed') || message.includes('Session closed')) {
      return {
        type: 'server',
        statusCode: 500,
        errorCode: 'BROWSER_SESSION_CLOSED',
        safeMessage: 'Browser session was closed unexpectedly.',
        suggestions: [
          'The browser or tab may have been closed manually',
          'Try reconnecting to establish a new session',
          'Check browser console for crash reports',
        ],
      };
    }
    
    // Default: Internal server error (don't leak details)
    return {
      type: 'server',
      statusCode: 500,
      errorCode: 'INTERNAL_ERROR',
      safeMessage: 'Internal server error. Please contact administrator.',
      suggestions: [
        'Check server logs for detailed error information',
        'Verify all system requirements are met',
        'Try restarting the MCP server',
      ],
    };
  }

  /**
   * 记录连接时间到循环缓冲区
   * 
   * 使用循环缓冲区避免 array.shift() 的 O(n) 时间复杂度
   * 
   * @param elapsed - 连接耗时（毫秒）
   */
  #recordConnectionTime(elapsed: number): void {
    this.connectionTimesBuffer[this.connectionTimesIndex] = elapsed;
    this.connectionTimesIndex = (this.connectionTimesIndex + 1) % MultiTenantMCPServer.CONNECTION_TIMES_BUFFER_SIZE;
    
    if (this.connectionTimesCount < MultiTenantMCPServer.CONNECTION_TIMES_BUFFER_SIZE) {
      this.connectionTimesCount++;
    }
  }

  /**
   * 计算平均连接时间
   * 
   * @returns 平均连接时间（毫秒）
   */
  #calculateAverageConnectionTime(): number {
    if (this.connectionTimesCount === 0) {
      return 0;
    }
    
    let sum = 0;
    for (let i = 0; i < this.connectionTimesCount; i++) {
      sum += this.connectionTimesBuffer[i];
    }
    
    return Math.round(sum / this.connectionTimesCount);
  }

  /**
   * 处理健康检查
   */
  private async handleHealth(
    req: http.IncomingMessage,
    res: http.ServerResponse
  ): Promise<void> {
    // 计算平均连接时间（使用循环缓冲区）
    const avgConnectionTime = this.#calculateAverageConnectionTime();
    
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
   * 生成认证 Token
   */
  private async handleGenerateToken(
    req: http.IncomingMessage,
    res: http.ServerResponse
  ): Promise<void> {
    // 读取请求体
    const body = await this.readRequestBody(req);
    
    // 解析JSON
    let data;
    try {
      data = JSON.parse(body);
    } catch (parseError) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        error: 'INVALID_JSON',
        message: 'Request body must be valid JSON',
      }));
      return;
    }

    const { userId, tokenName, permissions, expiresIn } = data;

    // 验证参数
    if (!userId) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        error: 'userId is required',
      }));
      return;
    }

    try {
      // 检查用户是否已注册
      if (!this.store.hasUser(userId)) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          error: 'USER_NOT_FOUND',
          message: `User ${userId} not registered. Please register first.`,
        }));
        return;
      }

      // 生成 token 名称（如果未提供）
      const finalTokenName = tokenName || `${userId}-${crypto.randomBytes(4).toString('hex')}`;

      // 生成 token (使用 AuthManager)
      const token = this.authManager.generateToken(
        userId,
        permissions || ['*'],
        expiresIn
      );

      // 保存到持久化存储
      await this.store.createToken(
        userId,
        token,
        finalTokenName,
        permissions || ['*'],
        expiresIn // undefined 表示永不过期
      );

      // 统计用户的 token 数量
      const userTokens = this.store.getUserTokens(userId);

      const response: Record<string, unknown> = {
        success: true,
        token,
        tokenName: finalTokenName,
        userId,
        permissions: permissions || ['*'],
        totalTokens: userTokens.length,
        message: 'Token generated successfully',
      };

      // 只有指定了 expiresIn 才返回 expiresAt
      if (expiresIn) {
        response.expiresAt = new Date(Date.now() + expiresIn).toISOString();
        response.expiresIn = expiresIn;
      } else {
        response.expiresAt = null;
        response.expiresIn = null;
        response.note = 'Token never expires';
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(response));
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        error: error instanceof Error ? error.message : String(error),
      }));
    }
  }

  /**
   * 处理用户注册
   */
  private async handleRegister(
    req: http.IncomingMessage,
    res: http.ServerResponse
  ): Promise<void> {
    // 注册接口不需要认证（首次注册）
    
    // 读取请求体
    const body = await this.readRequestBody(req);
    
    // 解析JSON，单独处理解析错误
    let data;
    try {
      data = JSON.parse(body);
    } catch (parseError) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        error: 'INVALID_JSON',
        message: 'Request body must be valid JSON',
      }));
      return;
    }

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
      // 检查用户名重复（使用持久化存储）
      if (this.store.hasUser(userId)) {
        res.writeHead(409, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          error: 'USER_EXISTS',
          message: `User ${userId} already registered`,
        }));
        return;
      }

      // 注册用户到持久化存储
      await this.store.registerUser(userId, browserURL, metadata);
      
      // 同时注册到路由管理器（保持兼容）
      this.routerManager.registerUser(userId, browserURL, metadata);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        userId,
        browserURL,
        message: 'User registered successfully. Please request a token to connect.',
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

    // 并发连接控制：检查该用户是否有正在建立的连接
    const existingConnection = this.activeConnections.get(userId);
    if (existingConnection) {
      logger(`[Server] ⚠️  用户 ${userId} 已有连接正在建立，拒绝重复连接`);
      this.stats.totalErrors++;
      res.writeHead(409, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        error: 'CONCURRENT_CONNECTION',
        message: '该用户已有连接正在建立中，请稍后重试',
      }));
      return;
    }

    // 创建连接承诺并记录
    const connectionPromise = this.establishConnection(userId, browserURL, res, startTime)
      .finally(() => {
        // 连接完成（成功或失败）后移除记录
        this.activeConnections.delete(userId);
      });
    
    this.activeConnections.set(userId, connectionPromise);

    try {
      await connectionPromise;
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
      const context = await McpContext.fromMinimal(browser, logger, {
        useCdpForTargets: this.useCdpHybrid,
        useCdpForOperations: this.useCdpOperations,
      });
      
      const modes: string[] = [];
      if (this.useCdpHybrid) modes.push('CDP-Target');
      if (this.useCdpOperations) modes.push('CDP-Ops');
      const mode = modes.length > 0 ? modes.join('+') : '延迟模式';
      logger(`[Server] ✓ MCP上下文已创建（${mode}）: ${userId}`);

      // 连接 MCP 服务器
      logger(`[Server] 🔗 连接MCP服务器: ${userId}`);
      await mcpServer.connect(transport);
      logger(`[Server] ✓ MCP服务器已连接: ${userId}`);

      const sessionId = transport.sessionId;
      
      // 注册所有工具（在获取sessionId后）
      logger(`[Server] 🛠️  注册工具: ${userId}`);
      const tools = getAllTools();
      for (const tool of tools) {
        this.registerTool(mcpServer, tool, context, sessionId);
      }
      logger(`[Server] ✓ 已注册${tools.length}个工具: ${userId}`);

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
      
      // 记录连接时间统计（使用循环缓冲区，O(1) 时间复杂度）
      this.#recordConnectionTime(elapsed);
      
      logger(`[Server] ✅ 会话建立: ${sessionId.slice(0, 8)}... (用户: ${userId}, 耗时: ${elapsed}ms)`);

      // 处理关闭事件
      transport.onclose = async () => {
        logger(`[Server] 📴 会话关闭: ${sessionId.slice(0, 8)}... (用户: ${userId})`);
        await this.sessionManager.deleteSession(sessionId);
        // 清理会话级Mutex
        this.cleanupSessionMutex(sessionId);
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
      
      // 分类错误，区分客户端/服务端错误
      const errorInfo = this.classifyError(error);
      
      // 记录详细错误（仅服务端日志）
      logger(
        `[Server] ❌ SSE 连接失败: ${userId} (${errorInfo.type} error, 耗时: ${elapsed}ms) - ${error}`
      );
      
      // 确保响应未发送时才写入错误
      if (!res.headersSent) {
        res.writeHead(errorInfo.statusCode, { 'Content-Type': 'application/json' });
        const errorResponse: Record<string, unknown> = {
          error: errorInfo.errorCode,
          message: errorInfo.safeMessage,
        };
        
        // Include suggestions if available
        if (errorInfo.suggestions && errorInfo.suggestions.length > 0) {
          errorResponse.suggestions = errorInfo.suggestions;
        }
        
        res.end(JSON.stringify(errorResponse, null, 2));
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
      
      // 单独处理JSON解析错误
      let message;
      try {
        message = JSON.parse(body);
      } catch (parseError) {
        // 客户端错误，返回400
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          error: 'INVALID_JSON',
          message: 'Request body must be valid JSON',
        }));
        return;
      }
      
      await session.transport.handlePostMessage(req, res, message);
    } catch (error) {
      this.stats.totalErrors++;
      logger(`[Server] ❗ 消息处理错误: ${sessionId} - ${error}`);
      
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          error: 'INTERNAL_ERROR',
          message: 'Failed to process message',
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
   * 设置CORS头（支持白名单）
   * 
   * @param req - HTTP请求
   * @param res - HTTP响应
   */
  #setCorsHeaders(
    req: http.IncomingMessage,
    res: http.ServerResponse
  ): void {
    const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',').map(o => o.trim()) || ['*'];
    const origin = req.headers.origin;
    
    if (allowedOrigins.includes('*')) {
      // 开发模式：允许所有源
      res.setHeader('Access-Control-Allow-Origin', '*');
    } else if (origin && allowedOrigins.includes(origin)) {
      // 生产模式：只允许白名单中的源
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
    } else {
      // 不在白名单中，不设置Access-Control-Allow-Origin
      logger(`[Server] ⚠️  拒绝跨域请求来源: ${origin}`);
    }
  }
  
  /**
   * 获取会话级Mutex
   * 
   * 每个会话使用独立的锁，不同用户可以并发执行工具
   * 
   * @param sessionId - 会话ID
   * @returns 会话专属的Mutex
   */
  private getSessionMutex(sessionId: string): Mutex {
    if (!this.sessionMutexes.has(sessionId)) {
      this.sessionMutexes.set(sessionId, new Mutex());
    }
    return this.sessionMutexes.get(sessionId)!;
  }
  
  /**
   * 清理会话Mutex
   * 
   * @param sessionId - 会话ID
   */
  private cleanupSessionMutex(sessionId: string): void {
    this.sessionMutexes.delete(sessionId);
  }

  /**
   * 注册工具
   */
  private registerTool(
    mcpServer: McpServer,
    tool: ToolDefinition,
    context: McpContext,
    sessionId: string
  ): void {
    mcpServer.registerTool(
      tool.name,
      {
        description: tool.description,
        inputSchema: tool.schema,
        annotations: tool.annotations,
      },
      async (params): Promise<CallToolResult> => {
        // 使用会话级锁，不同用户并发执行
        const mutex = this.getSessionMutex(sessionId);
        const guard = await mutex.acquire();
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
   * 读取请求体（带大小限制）
   * 
   * @param req - HTTP请求
   * @param maxSize - 最大大小（字节），默认10MB
   * @returns 请求体字符串
   */
  private async readRequestBody(
    req: http.IncomingMessage,
    maxSize = 10 * 1024 * 1024 // 默认10MB
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      let body = '';
      let size = 0;
      
      req.on('data', chunk => {
        size += chunk.length;
        
        // 检查大小限制，防止DoS攻击
        if (size > maxSize) {
          req.destroy();
          reject(new Error(`Request body too large: ${size} > ${maxSize} bytes`));
          return;
        }
        
        body += chunk.toString();
      });
      
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
    
    // 关闭存储引擎
    await this.store.close();

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
