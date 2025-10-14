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
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {URL} from 'node:url';
import {fileURLToPath} from 'node:url';

import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import {SSEServerTransport} from '@modelcontextprotocol/sdk/server/sse.js';
import type {CallToolResult} from '@modelcontextprotocol/sdk/types.js';

import {logger} from '../logger.js';
import {McpContext} from '../McpContext.js';
import {McpResponse} from '../McpResponse.js';
import {Mutex} from '../Mutex.js';
import {getAllTools} from '../tools/registry.js';
import type {ToolDefinition} from '../tools/ToolDefinition.js';
import {displayMultiTenantModeInfo} from '../utils/modeMessages.js';
import {VERSION} from '../version.js';

import {AuthManager} from './core/AuthManager.js';
import {BrowserConnectionPool} from './core/BrowserConnectionPool.js';
import {RouterManager} from './core/RouterManager.js';
import {SessionManager} from './core/SessionManager.js';
import {PersistentStore} from './storage/PersistentStore.js';
import {PersistentStoreV2, type UserRecordV2, type BrowserRecordV2} from './storage/PersistentStoreV2.js';
import * as v2Handlers from './handlers-v2.js';
import {parseAllowedIPs, isIPAllowed, getPatternDescription} from './utils/ip-matcher.js';
import {detectBrowser} from './utils/browser-detector.js';

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
  private store: PersistentStore;  // 旧的存储（向后兼容）
  private storeV2: PersistentStoreV2;  // 新的存储（基于邮箱）
  
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
  
  // 配置常量
  private static readonly SESSION_TIMEOUT = 3600000;          // 1 hour
  private static readonly CLEANUP_INTERVAL = 60000;           // 1 minute
  private static readonly CONNECTION_TIMEOUT = 30000;         // 30 seconds
  private static readonly BROWSER_HEALTH_CHECK = 30000;       // 30 seconds
  private static readonly MAX_RECONNECT_ATTEMPTS = 3;
  private static readonly RECONNECT_DELAY = 5000;             // 5 seconds
  private static readonly BROWSER_DETECTION_TIMEOUT = 3000;   // 3 seconds
  
  // V2 API 处理方法（将在构造函数中绑定）
  private handleRegisterUserV2!: typeof v2Handlers.handleRegisterUserV2;
  private handleGetUserV2!: typeof v2Handlers.handleGetUserV2;
  private handleUpdateUsernameV2!: typeof v2Handlers.handleUpdateUsernameV2;
  private handleDeleteUserV2!: typeof v2Handlers.handleDeleteUserV2;
  private handleListUsersV2!: typeof v2Handlers.handleListUsersV2;
  private handleBindBrowserV2!: typeof v2Handlers.handleBindBrowserV2;
  private handleListBrowsersV2!: typeof v2Handlers.handleListBrowsersV2;
  private handleGetBrowserV2!: typeof v2Handlers.handleGetBrowserV2;
  private handleUpdateBrowserV2!: typeof v2Handlers.handleUpdateBrowserV2;
  private handleUnbindBrowserV2!: typeof v2Handlers.handleUnbindBrowserV2;

  constructor() {
    this.version = VERSION;
    this.port = parseInt(process.env.PORT || '32122', 10);
    
    // 从环境变量读取 IP 白名单
    const allowedIPsEnv = process.env.ALLOWED_IPS;
    if (allowedIPsEnv) {
      this.allowedIPPatterns = parseAllowedIPs(allowedIPsEnv);
      console.log(`🔒 IP whitelist enabled (${this.allowedIPPatterns.length} rules):`);
      for (const pattern of this.allowedIPPatterns) {
        console.log(`   - ${getPatternDescription(pattern)}`);
      }
    } else {
      this.allowedIPPatterns = null;
      console.log('🌍 No IP whitelist set, allowing all IP access');
    }

    // Initialize persistent storage (legacy)
    this.store = new PersistentStore({
      dataDir: process.env.DATA_DIR || './.mcp-data',
      logFileName: 'auth-store.jsonl',
      snapshotThreshold: 10000,
      autoCompaction: true,
    });
    
    // Initialize V2 storage (email-based)
    this.storeV2 = new PersistentStoreV2({
      dataDir: process.env.DATA_DIR || './.mcp-data',
      logFileName: 'store-v2.jsonl',
      snapshotThreshold: 10000,
      autoCompaction: true,
    });

    // Initialize managers
    this.sessionManager = new SessionManager({
      timeout: MultiTenantMCPServer.SESSION_TIMEOUT,
      cleanupInterval: MultiTenantMCPServer.CLEANUP_INTERVAL,
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
      healthCheckInterval: MultiTenantMCPServer.BROWSER_HEALTH_CHECK,
      maxReconnectAttempts: MultiTenantMCPServer.MAX_RECONNECT_ATTEMPTS,
      reconnectDelay: MultiTenantMCPServer.RECONNECT_DELAY,
    });
    
    // CDP 混合架构：从环境变量读取配置
    this.useCdpHybrid = process.env.USE_CDP_HYBRID === 'true';
    this.useCdpOperations = process.env.USE_CDP_OPERATIONS === 'true';
    
    if (this.useCdpHybrid) {
      console.log('🚀 CDP hybrid architecture enabled - Target management (experimental)');
    }
    if (this.useCdpOperations) {
      console.log('⚡ CDP high-frequency operations enabled - navigate/evaluate (experimental)');
    }
    
    // 绑定 V2 API 处理方法
    this.handleRegisterUserV2 = v2Handlers.handleRegisterUserV2.bind(this);
    this.handleGetUserV2 = v2Handlers.handleGetUserV2.bind(this);
    this.handleUpdateUsernameV2 = v2Handlers.handleUpdateUsernameV2.bind(this);
    this.handleDeleteUserV2 = v2Handlers.handleDeleteUserV2.bind(this);
    this.handleListUsersV2 = v2Handlers.handleListUsersV2.bind(this);
    this.handleBindBrowserV2 = v2Handlers.handleBindBrowserV2.bind(this);
    this.handleListBrowsersV2 = v2Handlers.handleListBrowsersV2.bind(this);
    this.handleGetBrowserV2 = v2Handlers.handleGetBrowserV2.bind(this);
    this.handleUpdateBrowserV2 = v2Handlers.handleUpdateBrowserV2.bind(this);
    this.handleUnbindBrowserV2 = v2Handlers.handleUnbindBrowserV2.bind(this);
  }

  /**
   * 启动服务器
   */
  async start(): Promise<void> {
    console.log(`\n${'-'.repeat(60)}`);
    console.log(`Chrome DevTools MCP v${this.version}`);
    console.log(`Multi-Tenant Server`);
    console.log(`${'-'.repeat(60)}\n`);

    // Initialize storage engine
    await this.store.initialize();
    await this.storeV2.initialize();
    
    // Initialize managers with stored data
    await this.authManager.initialize(this.store);
    await this.routerManager.initialize(this.store);

    // Start managers
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
      console.log(`⛔ IP check failed: ${clientIP}`);
      console.log(`   Configured rules: ${this.allowedIPPatterns.join(', ')}`);
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
      console.error(`⛔ IP rejected: ${clientIP}`);
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
      }
      // V2 API: 用户管理
      else if (url.pathname === '/api/users' && req.method === 'POST') {
        await this.handleRegisterUserV2(req, res);
      } else if (url.pathname === '/api/users' && req.method === 'GET') {
        await this.handleListUsersV2(req, res);
      } else if (url.pathname.match(/^\/api\/users\/[^\/]+$/) && req.method === 'GET') {
        await this.handleGetUserV2(req, res, url);
      } else if (url.pathname.match(/^\/api\/users\/[^\/]+$/) && req.method === 'PATCH') {
        await this.handleUpdateUsernameV2(req, res, url);
      } else if (url.pathname.match(/^\/api\/users\/[^\/]+$/) && req.method === 'DELETE') {
        await this.handleDeleteUserV2(req, res, url);
      }
      // V2 API: 浏览器管理
      else if (url.pathname.match(/^\/api\/users\/[^\/]+\/browsers$/) && req.method === 'POST') {
        await this.handleBindBrowserV2(req, res, url);
      } else if (url.pathname.match(/^\/api\/users\/[^\/]+\/browsers$/) && req.method === 'GET') {
        await this.handleListBrowsersV2(req, res, url);
      } else if (url.pathname.match(/^\/api\/users\/[^\/]+\/browsers\/[^\/]+$/) && req.method === 'GET') {
        await this.handleGetBrowserV2(req, res, url);
      } else if (url.pathname.match(/^\/api\/users\/[^\/]+\/browsers\/[^\/]+$/) && req.method === 'PATCH') {
        await this.handleUpdateBrowserV2(req, res, url);
      } else if (url.pathname.match(/^\/api\/users\/[^\/]+\/browsers\/[^\/]+$/) && req.method === 'DELETE') {
        await this.handleUnbindBrowserV2(req, res, url);
      }
      // Legacy API
      else if (url.pathname === '/api/auth/token' && req.method === 'POST') {
        await this.handleGenerateToken(req, res);
      } else if (url.pathname === '/api/register' && req.method === 'POST') {
        await this.handleRegister(req, res);
      } else if (url.pathname.startsWith('/api/users/') && url.pathname.endsWith('/browser') && req.method === 'PUT') {
        await this.handleUpdateBrowser(req, res, url);
      }
      // SSE连接
      else if (url.pathname === '/sse' && req.method === 'GET') {
        logger(`[Server] ➡️  Routing to handleSSE`);
        await this.handleSSE(req, res);
      }
      // SSE V2 连接（基于 token）
      else if (url.pathname === '/sse-v2' && req.method === 'GET') {
        logger(`[Server] ➡️  Routing to handleSSEV2`);
        await this.handleSSEV2(req, res);
      }
      // 其他
      else if (url.pathname === '/message' && req.method === 'POST') {
        await this.handleMessage(req, res, url);
      } else if (url.pathname === '/test') {
        this.handleTestPage(res);
      } else if (url.pathname === '/' || url.pathname.startsWith('/index')) {
        this.serveStaticFile(res, 'index.html');
      } else if (url.pathname.startsWith('/public/')) {
        const filename = url.pathname.substring('/public/'.length);
        this.serveStaticFile(res, filename);
      } else {
        res.writeHead(404);
        res.end('Not found');
      }
    } catch (error) {
      logger(`[Server] Request processing error: ${error}`);
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

      // 检测浏览器连接
      const browserDetection = await detectBrowser(
        browserURL,
        MultiTenantMCPServer.BROWSER_DETECTION_TIMEOUT
      );

      // 如果浏览器检测失败，拒绝注册
      if (!browserDetection.connected) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          error: 'BROWSER_NOT_ACCESSIBLE',
          message: 'Cannot connect to the specified browser. Please ensure Chrome is running with remote debugging enabled.',
          browserURL,
          details: browserDetection.error,
          suggestions: [
            `Start Chrome with: chrome --remote-debugging-port=${new URL(browserURL).port} --remote-debugging-address=0.0.0.0`,
            'Verify the browser URL is correct and accessible',
            'Check firewall settings allow connections to the debugging port',
            'Ensure Chrome is running on the specified host and port',
          ],
        }));
        return;
      }

      // 注册用户到持久化存储
      await this.store.registerUser(userId, browserURL, metadata);
      
      // 同时注册到路由管理器（保持兼容）
      this.routerManager.registerUser(userId, browserURL, metadata);

      // 返回注册结果，包含浏览器信息
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        userId,
        browserURL,
        browser: {
          connected: true,
          info: browserDetection.browserInfo,
        },
        message: 'User registered successfully. Browser connected.',
      }));
    } catch (error) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        error: error instanceof Error ? error.message : String(error),
      }));
    }
  }


  /**
   * 处理浏览器更新（检测并更新浏览器信息）
   */
  private async handleUpdateBrowser(
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

    // 从路径提取 userId: /api/users/{userId}/browser
    const pathParts = url.pathname.split('/');
    const userId = pathParts[pathParts.length - 2];
    
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

    try {
      // 读取请求体（可选：允许更新 browserURL）
      const body = await this.readRequestBody(req);
      let newBrowserURL = mapping.browserURL;
      
      if (body) {
        try {
          const data = JSON.parse(body);
          if (data.browserURL) {
            newBrowserURL = data.browserURL;
          }
        } catch (e) {
          // 忽略解析错误，使用现有 URL
        }
      }

      // 检测浏览器连接
      const browserDetection = await detectBrowser(
        newBrowserURL,
        MultiTenantMCPServer.BROWSER_DETECTION_TIMEOUT
      );

      // 如果浏览器检测失败，返回错误
      if (!browserDetection.connected) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          error: 'BROWSER_NOT_ACCESSIBLE',
          message: 'Cannot connect to the specified browser. Browser URL not updated.',
          browserURL: newBrowserURL,
          currentBrowserURL: mapping.browserURL,
          details: browserDetection.error,
          detectedAt: new Date().toISOString(),
          suggestions: [
            `Start Chrome with: chrome --remote-debugging-port=${new URL(newBrowserURL).port} --remote-debugging-address=0.0.0.0`,
            'Check firewall settings',
            'Verify the browser URL is correct',
            'Ensure the browser is accessible from the server',
          ],
        }, null, 2));
        return;
      }

      // 如果 URL 改变了，更新存储
      if (newBrowserURL !== mapping.browserURL) {
        await this.store.updateBrowserURL(userId, newBrowserURL);
        this.routerManager.updateBrowserURL(userId, newBrowserURL);
      }

      // 返回检测结果和浏览器信息
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        userId,
        browserURL: newBrowserURL,
        browser: {
          connected: true,
          info: browserDetection.browserInfo,
          detectedAt: new Date().toISOString(),
        },
        message: 'Browser detected and updated successfully',
      }, null, 2));
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        error: error instanceof Error ? error.message : String(error),
      }));
    }
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

    // Check if user is registered
    const browserURL = this.routerManager.getUserBrowserURL(userId);
    if (!browserURL) {
      this.stats.totalErrors++;
      logger(`[Server] ❌ user not registered: ${userId}`);
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        error: 'User not registered',
        message: 'Please register your browser URL first',
      }));
      return;
    }

    logger(`[Server] 📡 SSE connection request: ${userId}`);

    // 并发连接控制：检查该用户是否有正在建立的连接
    const existingConnection = this.activeConnections.get(userId);
    if (existingConnection) {
      logger(`[Server] ⚠️  user ${userId} already has a connection being established, rejecting duplicate connection`);
      this.stats.totalErrors++;
      res.writeHead(409, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        error: 'CONCURRENT_CONNECTION',
        message: 'user already has a connection being established, please try again later',
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
      logger(`[Server] ❌ connection failed: ${userId}`);
    }
  }

  /**
   * 处理 SSE V2 连接（基于 token）
   */
  private async handleSSEV2(
    req: http.IncomingMessage,
    res: http.ServerResponse
  ): Promise<void> {
    const startTime = Date.now();
    this.stats.totalConnections++;
    
    // 从 Authorization header 或 query 参数获取 token
    const url = new URL(req.url!, `http://${req.headers.host}`);
    const authHeader = req.headers['authorization'];
    let token = url.searchParams.get('token');
    
    // 优先使用 Authorization header
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    }
    
    if (!token) {
      this.stats.totalErrors++;
      logger(`[Server] ❌ 缺少 token`);
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ 
        error: 'token is required',
        hint: 'Provide Authorization: Bearer <token> header or token query parameter'
      }));
      return;
    }
    
    // 从 token 获取浏览器记录
    const browser = this.storeV2.getBrowserByToken(token);
    if (!browser) {
      this.stats.totalErrors++;
      logger(`[Server] ❌ invalid token: ${token.substring(0, 16)}...`);
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        error: 'Invalid token',
        message: 'Token not found or has been revoked',
      }));
      return;
    }
    
    const userId = browser.userId;
    const browserURL = browser.browserURL;
    
    logger(`[Server] 📡 SSE V2 connection request: ${userId}/${browser.tokenName}`);
    
    // 更新最后连接时间
    await this.storeV2.updateLastConnected(browser.browserId);
    
    // 并发连接控制：使用 browserId 作为键，避免同一浏览器的重复连接
    const connectionKey = browser.browserId;
    const existingConnection = this.activeConnections.get(connectionKey);
    if (existingConnection) {
      logger(`[Server] ⚠️  browser ${browser.tokenName} already has a connection being established, rejecting duplicate connection`);
      this.stats.totalErrors++;
      res.writeHead(409, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        error: 'CONCURRENT_CONNECTION',
        message: 'This browser already has a connection being established, please try again later',
      }));
      return;
    }
    
    // 创建连接承诺并记录
    const connectionPromise = this.establishConnectionV2(browser, browserURL, res, startTime)
      .finally(() => {
        // 连接完成（成功或失败）后移除记录
        this.activeConnections.delete(connectionKey);
      });
    
    this.activeConnections.set(connectionKey, connectionPromise);
    
    try {
      await connectionPromise;
    } catch (error) {
      // 错误已在 establishConnectionV2 中处理和记录
      logger(`[Server] ❌ connection failed: ${userId}/${browser.tokenName}`);
    }
  }
  
  /**
   * 建立 SSE V2 连接（基于浏览器记录）
   */
  private async establishConnectionV2(
    browserRecord: BrowserRecordV2,
    browserURL: string,
    res: http.ServerResponse,
    startTime: number
  ): Promise<void> {
    const userId = browserRecord.userId;
    const browserId = browserRecord.browserId;
    const tokenName = browserRecord.tokenName;
    
    // 设置整体超时
    const timeout = setTimeout(() => {
      this.stats.totalErrors++;
      logger(`[Server] ⏰ connection timeout: ${userId}/${tokenName}`);
      if (!res.headersSent) {
        res.writeHead(504, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          error: 'Connection timeout',
          message: `Failed to establish connection within ${MultiTenantMCPServer.CONNECTION_TIMEOUT / 1000} seconds`,
        }));
      }
    }, MultiTenantMCPServer.CONNECTION_TIMEOUT);
    
    try {
      logger(`[Server] 🔌 connecting to browser: ${userId}/${tokenName}`);
      // 使用 browserId 作为连接标识，避免与旧系统冲突
      const browser = await this.browserPool.connect(browserId, browserURL);
      logger(`[Server] ✓ browser connected: ${userId}/${tokenName}`);
      
      // Create SSE transport
      logger(`[Server] 📡 creating SSE transport: ${userId}/${tokenName}`);
      const transport = new SSEServerTransport('/message', res);
      logger(`[Server] ✓ SSE transport created: ${userId}/${tokenName}`);
      
      // Create MCP server
      logger(`[Server] 🔧 creating MCP server: ${userId}/${tokenName}`);
      const mcpServer = new McpServer(
        { name: 'chrome-devtools-mcp-multi-tenant', version: this.version },
        { capabilities: { tools: {} } }
      );
      
      // Create MCP context
      logger(`[Server] 📦 creating MCP context: ${userId}/${tokenName}`);
      const context = await McpContext.fromMinimal(browser, logger, {
        useCdpForTargets: this.useCdpHybrid,
        useCdpForOperations: this.useCdpOperations,
      });
      
      const modes: string[] = [];
      if (this.useCdpHybrid) modes.push('CDP-Target');
      if (this.useCdpOperations) modes.push('CDP-Ops');
      const mode = modes.length > 0 ? modes.join('+') : 'lazy mode';
      logger(`[Server] ✓ MCP context created (${mode}): ${userId}/${tokenName}`);
      
      const sessionId = transport.sessionId;
      
      // 创建会话（使用 browserId 作为用户标识）
      logger(`[Server] 📝 creating session (before connection): ${sessionId.slice(0, 8)}...`);
      this.sessionManager.createSession(
        sessionId,
        browserId,  // 使用 browserId 作为用户标识
        transport,
        mcpServer,
        context,
        browser
      );
      logger(`[Server] ✓ session created: ${sessionId.slice(0, 8)}...`);
      
      // Register tools
      logger(`[Server] 🛠️  registering tools: ${userId}/${tokenName}`);
      const tools = getAllTools();
      for (const tool of tools) {
        this.registerTool(mcpServer, tool, context, sessionId);
      }
      logger(`[Server] ✓ registered ${tools.length} tools: ${userId}/${tokenName}`);
      
      // Connect to MCP server
      logger(`[Server] 🔗 connecting to MCP server: ${userId}/${tokenName}`);
      await mcpServer.connect(transport);
      logger(`[Server] ✓ MCP server connected: ${userId}/${tokenName}`);
      
      const elapsed = Date.now() - startTime;
      
      // Record connection time statistics
      this.#recordConnectionTime(elapsed);
      
      logger(`[Server] ✅ session established: ${sessionId.slice(0, 8)}... (user: ${userId}/${tokenName}, elapsed: ${elapsed}ms)`);
      
      // Handle close event
      transport.onclose = async () => {
        logger(`[Server] 📴 session closed: ${sessionId.slice(0, 8)}... (user: ${userId}/${tokenName})`);
        await this.sessionManager.deleteSession(sessionId);
        // 清理会话级Mutex
        this.cleanupSessionMutex(sessionId);
      };
      
      // Handle error event
      transport.onerror = async (error) => {
        this.stats.totalErrors++;
        logger(`[Server] ⚠️  transport error: ${sessionId.slice(0, 8)}... - ${error}`);
      };
      
      // Clear timeout
      clearTimeout(timeout);
    } catch (error) {
      clearTimeout(timeout);
      this.stats.totalErrors++;
      const elapsed = Date.now() - startTime;
      
      // 分类错误
      const errorInfo = this.classifyError(error);
      
      // 记录详细错误
      logger(
        `[Server] ❌ SSE V2 connection failed: ${userId}/${tokenName} (${errorInfo.type} error, elapsed: ${elapsed}ms) - ${error}`
      );
      
      // 返回友好的错误消息
      if (!res.headersSent) {
        res.writeHead(errorInfo.statusCode, { 'Content-Type': 'application/json' });
        const errorResponse: Record<string, unknown> = {
          error: errorInfo.errorCode,
          message: errorInfo.safeMessage,
        };
        
        if (errorInfo.suggestions && errorInfo.suggestions.length > 0) {
          errorResponse.suggestions = errorInfo.suggestions;
        }
        
        res.end(JSON.stringify(errorResponse, null, 2));
      }
      
      throw error;
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
    // 设置整体超时
    const timeout = setTimeout(() => {
      this.stats.totalErrors++;
      logger(`[Server] ⏰ connection timeout: ${userId}`);
      if (!res.headersSent) {
        res.writeHead(504, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          error: 'Connection timeout',
          message: `Failed to establish connection within ${MultiTenantMCPServer.CONNECTION_TIMEOUT / 1000} seconds`,
        }));
      }
    }, MultiTenantMCPServer.CONNECTION_TIMEOUT);

    try {
      logger(`[Server] 🔌 connecting to browser: ${userId}`);  
      // Connect to the user's browser
      const browser = await this.browserPool.connect(userId, browserURL);
      logger(`[Server] ✓ browser connected: ${userId}`);

      // Create SSE transport
      logger(`[Server] 📡 creating SSE transport: ${userId}`);
      const transport = new SSEServerTransport('/message', res);
      logger(`[Server] ✓ SSE transport created: ${userId}`);

      // Create MCP server
      logger(`[Server] 🔧 creating MCP server: ${userId}`);
      const mcpServer = new McpServer(
        { name: 'chrome-devtools-mcp-multi-tenant', version: this.version },
        { capabilities: { tools: {} } }
      );

      // Create MCP context (using minimal mode - lazy initialization)
      logger(`[Server] 📦 creating MCP context: ${userId}`);
      const context = await McpContext.fromMinimal(browser, logger, {
        useCdpForTargets: this.useCdpHybrid,
        useCdpForOperations: this.useCdpOperations,
      });
      
      const modes: string[] = [];
      if (this.useCdpHybrid) modes.push('CDP-Target');
      if (this.useCdpOperations) modes.push('CDP-Ops');
      const mode = modes.length > 0 ? modes.join('+') : 'lazy mode';
      logger(`[Server] ✓ MCP context created (${mode}): ${userId}`);

      const sessionId = transport.sessionId;
      
      // 🔴 CRITICAL FIX: 在连接前先创建会话，避免竞态条件
      // Session must exist before SSE endpoint message is sent
      logger(`[Server] 📝 creating session (before connection): ${sessionId.slice(0, 8)}...`);
      this.sessionManager.createSession(
        sessionId,
        userId,
        transport,
        mcpServer,
        context,
        browser
      );
      logger(`[Server] ✓ session created: ${sessionId.slice(0, 8)}...`);
      
      // Register tools
      logger(`[Server] 🛠️  registering tools: ${userId}`);
      const tools = getAllTools();
      for (const tool of tools) {
        this.registerTool(mcpServer, tool, context, sessionId);
      }
      logger(`[Server] ✓ registered ${tools.length} tools: ${userId}`);

      // Connect to MCP server (now send SSE endpoint message, session exists)
      logger(`[Server] 🔗 connecting to MCP server: ${userId}`);
      await mcpServer.connect(transport);
      logger(`[Server] ✓ MCP server connected: ${userId}`);

      const elapsed = Date.now() - startTime;
      
      // Record connection time statistics (using circular buffer, O(1) time complexity)
      this.#recordConnectionTime(elapsed);
      
      logger(`[Server] ✅ session established: ${sessionId.slice(0, 8)}... (user: ${userId}, elapsed: ${elapsed}ms)`);

      // Handle close event
      transport.onclose = async () => {
        logger(`[Server] 📴 session closed: ${sessionId.slice(0, 8)}... (user: ${userId})`);
        await this.sessionManager.deleteSession(sessionId);
        // 清理会话级Mutex
        this.cleanupSessionMutex(sessionId);
      };
      
      // Handle error event
      transport.onerror = async (error) => {
        this.stats.totalErrors++;
        logger(`[Server] ⚠️  transport error: ${sessionId.slice(0, 8)}... - ${error}`);
      };
      
      // Clear timeout
      clearTimeout(timeout);
    } catch (error) {
      clearTimeout(timeout);
      this.stats.totalErrors++;
      const elapsed = Date.now() - startTime;
      
      // 分类错误，区分客户端/服务端错误
      const errorInfo = this.classifyError(error);
      
      // Record detailed error (only server logs)
      logger(
        `[Server] ❌ SSE connection failed: ${userId} (${errorInfo.type} error, elapsed: ${elapsed}ms) - ${error}`
      );
      
      // Ensure response is not sent before writing error
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
      logger(`[Server] ⚠️  session not found: ${sessionId.slice(0, 8)}...`);
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
      logger(`[Server] ❗ message processing error: ${sessionId} - ${error}`);
      
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
   * 提供静态文件服务
   */
  private serveStaticFile(res: http.ServerResponse, filename: string): void {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const publicDir = path.join(__dirname, 'public');
    const filePath = path.join(publicDir, filename);

    // 安全检查：确保文件在 public 目录内
    const resolvedPath = path.resolve(filePath);
    const resolvedPublicDir = path.resolve(publicDir);
    
    if (!resolvedPath.startsWith(resolvedPublicDir)) {
      res.writeHead(403, { 'Content-Type': 'text/plain' });
      res.end('Forbidden');
      return;
    }

    // 检查文件是否存在
    if (!fs.existsSync(filePath)) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('File not found');
      return;
    }

    // 获取 MIME 类型
    const ext = path.extname(filename);
    const mimeTypes: Record<string, string> = {
      '.html': 'text/html',
      '.js': 'application/javascript',
      '.css': 'text/css',
      '.json': 'application/json',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.gif': 'image/gif',
      '.svg': 'image/svg+xml',
      '.ico': 'image/x-icon',
    };
    const contentType = mimeTypes[ext] || 'application/octet-stream';

    // 读取并返回文件
    try {
      const content = fs.readFileSync(filePath);
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content);
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('Internal server error');
    }
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
      // Production mode: only allow origins in the whitelist
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
    } else {
      // Origin not in whitelist, do not set Access-Control-Allow-Origin
      logger(`[Server] ⚠️  cross-origin request origin not in whitelist: ${origin}`);
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
          
          // 执行工具
          await tool.handler({params}, {
            appendResponseLine: () => {},
            setIncludePages: () => {},
            setIncludeNetworkRequests: () => {},
            setIncludeConsoleData: () => {},
            setIncludeSnapshot: () => {},
            attachImage: () => {},
            attachNetworkRequest: () => {},
          }, context);
          
          // 记录工具调用计数（V2 架构）
          const sessionData = this.sessionManager.getSession(sessionId);
          if (sessionData) {
            const allBrowsers = Array.from(this.storeV2['browsers'].values());
            const userBrowsers = allBrowsers.filter(b => b.userId === sessionData.userId);
            if (userBrowsers.length > 0) {
              this.storeV2.incrementToolCallCount(userBrowsers[0].browserId).catch(err => {
                logger(`[Server] ⚠️  Failed to increment tool call count: ${err}`);
              });
            }
          }
          
          return {
            content: [
              {
                type: 'text',
                text: 'Tool executed successfully',
              },
            ],
          };
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
    console.error('\n[Server] ❌ server startup failed');
    console.error('');

    if (error.code === 'EADDRINUSE') {
      console.error(`❌ port ${this.port} is already in use`);
      console.error('');
      console.error('solutions:');
      console.error(`  1. use another port: PORT=${this.port + 1} npm run start`);
      console.error(`  2. find process using port:`);
      console.error(`     Windows: netstat -ano | findstr ${this.port}`);
      console.error(`     Linux/Mac: lsof -i :${this.port}`);
      console.error(`  3. close the process using the port`);
    } else if (error.code === 'EACCES') {
      console.error(`❌ permission denied, cannot bind port ${this.port}`);
    } else {
      console.error(`❌ error: ${error.message}`);
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
   * Graceful shutdown
   */
  private async shutdown(): Promise<void> {
    console.log('\n[Server] 🛑 shutting down...');

    // Stop manager
    this.sessionManager.stop();
    await this.browserPool.stop();

    // Clean up all sessions
    await this.sessionManager.cleanupAll();
    
    // 关闭存储引擎
    await this.store.close();

    // 关闭 HTTP 服务器
    if (this.httpServer) {
      this.httpServer.close(() => {
        console.log('[Server] ✅ server closed');
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
  <title>MCP Multi-Tenant Test</title>
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
  <h1>🧪 MCP Multi-Tenant Test Page</h1>
  
  <div class="section">
    <h2>1. Register User</h2>
    <input id="userId" placeholder="User ID (e.g: user-a)" />
    <input id="browserURL" placeholder="Browser URL (e.g: http://localhost:9222)" />
    <button class="primary" onclick="registerUser()">Register</button>
  </div>

  <div class="section">
    <h2>2. Connect SSE</h2>
    <input id="sseUserId" placeholder="User ID" />
    <button class="primary" onclick="connectSSE()">Connect</button>
    <p>Session ID: <span id="sessionId">Not connected</span></p>
  </div>

  <div class="section">
    <h2>3. Test Tools</h2>
    <button class="primary" onclick="initialize()">Initialize</button>
    <button class="primary" onclick="listExtensions()">list_extensions</button>
  </div>

  <div class="section">
    <h2>4. Log</h2>
    <button onclick="clearLog()">Clear log</button>
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
      log(res.ok ? '✅ register success: ' + userId : '❌ register failed: ' + data.error);
    }

    function connectSSE() {
      const userId = document.getElementById('sseUserId').value;
      if (!userId) {
        alert('Enter User ID');
        return;
      }

      eventSource = new EventSource('/sse', {
        headers: { 'X-User-Id': userId }
      });

      eventSource.addEventListener('endpoint', (e) => {
        const data = JSON.parse(e.data);
        sessionId = new URL(data.uri, location.href).searchParams.get('sessionId');
        document.getElementById('sessionId').textContent = sessionId;
        log('✅ SSE connection success, session: ' + sessionId);
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
        alert('Please connect SSE first');
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
            log('⏰ Request timeout');
          }
        }, 10000);
      });
    }

    async function initialize() {
      log('Send initialize request...');
      const result = await sendRequest('initialize', {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'web-test', version: '1.0.0' },
      });
      log(result ? '✅ Initialize success' : '❌ Initialize failed');
    }

    async function listExtensions() {
      log('Call list_extensions...');
      const result = await sendRequest('tools/call', {
        name: 'list_extensions',
        arguments: {},
      });
      if (result) {
        const text = result.content[0]?.text || '';
        log('✅ list_extensions completed');
        log(text.substring(0, 500));
      } else {
        log('❌ list_extensions failed');
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

// Start server
const server = new MultiTenantMCPServer();
server.start().catch((error) => {
  console.error('[Server] ❌ startup failed:', error);
  process.exit(1);
});
