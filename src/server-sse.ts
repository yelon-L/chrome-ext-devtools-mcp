#!/usr/bin/env node
/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * MCP SSE Server - 用于测试
 * 
 * 使用方式：
 * node build/src/server-sse.js --browser-url http://localhost:9222
 * 
 * 然后访问：
 * http://localhost:3000/health - 健康检查
 * http://localhost:3000/sse - SSE 连接
 * http://localhost:3000/test - 测试页面
 */

import './polyfill.js';

import http from 'node:http';
import {URL} from 'node:url';

import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import {SSEServerTransport} from '@modelcontextprotocol/sdk/server/sse.js';
import type {CallToolResult} from '@modelcontextprotocol/sdk/types.js';

import {ensureBrowserConnected, ensureBrowserLaunched, shouldCloseBrowser, validateBrowserURL} from './browser.js';
import type {Channel} from './browser.js';
import {parseArguments} from './cli.js';
import {logger} from './logger.js';
import {McpContext} from './McpContext.js';
import {McpResponse} from './McpResponse.js';
import {Mutex} from './Mutex.js';
import {getAllTools} from './tools/registry.js';
import type {ToolDefinition} from './tools/ToolDefinition.js';
import {displaySSEModeInfo} from './utils/modeMessages.js';
import {VERSION} from './version.js';

const sessions = new Map<string, {
  transport: SSEServerTransport;
  server: McpServer;
  context: McpContext;
}>();

async function startSSEServer() {
  const args = parseArguments(VERSION);
  const port = parseInt(process.env.PORT || '32122', 10);

  // 如果配置了 --browserUrl，先验证浏览器连接
  if (args.browserUrl) {
    try {
      console.log('[SSE] Validating browser connection...');
      await validateBrowserURL(args.browserUrl);
      console.log('[SSE] Browser validation successful');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('\n❌ Browser Connection Validation Failed');
      console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.error(`Error: ${errorMessage}`);
      console.error('');
      console.error('📝 Please check:');
      console.error('  1. Chrome is running with remote debugging enabled');
      console.error(`  2. The browser URL is correct: ${args.browserUrl}`);
      console.error('  3. No firewall is blocking the connection');
      console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.error('');
      process.exit(1);
    }
  }
  
  // 启动浏览器
  console.log('[SSE] Initializing browser...');
  
  const extraArgs: string[] = (args.chromeArg ?? []).map(String);
  if (args.proxyServer) {
    extraArgs.push(`--proxy-server=${args.proxyServer}`);
  }
  
  const devtools = args.experimentalDevtools ?? false;
  let browser = args.browserUrl
    ? await ensureBrowserConnected({
        browserURL: args.browserUrl,
        devtools,
      })
    : await ensureBrowserLaunched({
        headless: args.headless,
        executablePath: args.executablePath,
        channel: args.channel as Channel,
        isolated: args.isolated,
        viewport: args.viewport,
        args: extraArgs,
        devtools,
      });

  console.log('[SSE] Browser connected');

  // 工具注册函数
  const toolMutex = new Mutex();
  function registerTool(mcpServer: McpServer, tool: ToolDefinition, context: McpContext): void {
    mcpServer.registerTool(
      tool.name,
      {
        description: tool.description,
        inputSchema: tool.schema,
        annotations: tool.annotations,
      },
      async (params): Promise<CallToolResult> => {
        const guard = await toolMutex.acquire();
        try {
          const response = new McpResponse();
          await tool.handler({params}, response, context);
          const content = await response.handle(tool.name, context);
          return {content};
        } catch (error) {
          const errorText = error instanceof Error ? error.message : String(error);
          return {
            content: [{type: 'text', text: errorText}],
            isError: true,
          };
        } finally {
          guard.dispose();
        }
      },
    );
  }

  // HTTP 服务器
  const httpServer = http.createServer(async (req, res) => {
    const url = new URL(req.url!, `http://${req.headers.host}`);
    
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }

    // 健康检查
    if (url.pathname === '/health') {
      res.writeHead(200, {'Content-Type': 'application/json'});
      res.end(JSON.stringify({
        status: 'ok',
        sessions: sessions.size,
        browser: 'connected',
      }));
      return;
    }

    // 测试页面
    if (url.pathname === '/test' || url.pathname === '/') {
      res.writeHead(200, {'Content-Type': 'text/html; charset=utf-8'});
      res.end(getTestPage());
      return;
    }

    // SSE 连接
    if (url.pathname === '/sse' && req.method === 'GET') {
      console.log('[SSE] 📡 New SSE connection');

      // 使用 SSEServerTransport - 它会自动发送 endpoint 事件
      const transport = new SSEServerTransport('/message', res);
      
      // 注意：不要手动调用 transport.start()
      // mcpServer.connect() 会自动调用它

      // 创建 MCP Server
      const mcpServer = new McpServer(
        {name: 'chrome-devtools-mcp', version: VERSION},
        {capabilities: {tools: {}}},
      );

      // ✅ 验证并重连浏览器（如果配置了 browserURL）
      if (args.browserUrl) {
        try {
          // 测试连接有效性
          await browser.version();
        } catch (error) {
          console.warn('[SSE] ⚠️  Browser connection lost, attempting to reconnect...');
          console.warn('[SSE] Error:', error instanceof Error ? error.message : String(error));
          
          try {
            // ✅ 尝试重连浏览器
            browser = await ensureBrowserConnected({
              browserURL: args.browserUrl,
              devtools,
            });
            
            console.log('[SSE] ✅ Browser reconnected successfully');
          } catch (reconnectError) {
            // 重连失败，关闭连接
            console.error('[SSE] ❌ Failed to reconnect to browser');
            console.error('[SSE] Error:', reconnectError instanceof Error ? reconnectError.message : String(reconnectError));
            
            res.writeHead(503, {
              'Content-Type': 'text/event-stream',
              'Cache-Control': 'no-cache',
              'Connection': 'keep-alive',
            });
            res.write('event: error\n');
            res.write(`data: ${JSON.stringify({
              code: -32000,
              message: 'Browser connection lost and reconnection failed',
              data: {
                browserURL: args.browserUrl,
                error: reconnectError instanceof Error ? reconnectError.message : String(reconnectError),
              },
            })}\n\n`);
            res.end();
            return;
          }
        }
      }

      // 创建 Context
      const context = await McpContext.from(browser, logger);

      // 从统一注册中心获取所有工具并注册
      const tools = getAllTools();
      for (const tool of tools) {
        registerTool(mcpServer, tool, context);
      }

      await mcpServer.connect(transport);

      const sessionId = transport.sessionId;
      sessions.set(sessionId, {transport, server: mcpServer, context});

      console.log(`[SSE] ✅ Session established: ${sessionId}`);

      transport.onclose = () => {
        console.log(`[SSE] 📴 Session closed: ${sessionId}`);
        sessions.delete(sessionId);
      };

      return;
    }

    // POST 消息
    if (url.pathname === '/message' && req.method === 'POST') {
      const sessionId = url.searchParams.get('sessionId');
      
      if (!sessionId) {
        res.writeHead(400, {'Content-Type': 'application/json'});
        res.end(JSON.stringify({error: 'Missing sessionId'}));
        return;
      }

      const session = sessions.get(sessionId);
      if (!session) {
        res.writeHead(404, {'Content-Type': 'application/json'});
        res.end(JSON.stringify({error: 'Session not found'}));
        return;
      }

      let body = '';
      req.on('data', chunk => { body += chunk.toString(); });
      req.on('end', async () => {
        try {
          const message = JSON.parse(body);
          await session.transport.handlePostMessage(req, res, message);
        } catch (error) {
          console.error('[SSE] ❌ Error:', error);
          res.writeHead(500, {'Content-Type': 'application/json'});
          res.end(JSON.stringify({
            error: error instanceof Error ? error.message : String(error),
          }));
        }
      });

      return;
    }

    res.writeHead(404);
    res.end('Not found');
  });

  // 错误处理
  httpServer.on('error', (error: NodeJS.ErrnoException) => {
    console.error('\n[SSE] ❌ Server failed to start');
    console.error('');
    
    if (error.code === 'EADDRINUSE') {
      console.error(`❌ Port ${port} is already in use`);
      console.error('');
      console.error('Solutions:');
      console.error(`  1. Use another port: --port ${port + 1}`);
      console.error(`  2. Find the process using the port:`);
      console.error(`     Windows: netstat -ano | findstr ${port}`);
      console.error(`     Linux/Mac: lsof -i :${port}`);
      console.error(`  3. Stop the program using the port`);
    } else if (error.code === 'EACCES') {
      console.error(`❌ Permission denied to bind port ${port}`);
      console.error('');
      console.error('Solutions:');
      console.error(`  1. Use non-privileged port (>1024): --port 8080`);
      console.error(`  2. Windows: Run as administrator`);
      console.error(`  3. Linux/Mac: Use sudo or change port`);
    } else if (error.code === 'EADDRNOTAVAIL') {
      console.error(`❌ Address unavailable`);
      console.error('');
      console.error('Possible reasons:');
      console.error('  - Network interface not enabled');
      console.error('  - Firewall blocking');
    } else {
      console.error(`❌ Error: ${error.message}`);
      console.error(`   Error code: ${error.code || 'unknown'}`);
      console.error('');
      console.error('Details:');
      console.error(error.stack || error);
    }
    
    console.error('');
    process.exit(1);
  });

  httpServer.listen(port, () => {
    console.log('');
    displaySSEModeInfo(port);
    console.log('✅ Server started successfully');
    console.log('Press Ctrl+C to stop\n');
  });

  process.on('SIGINT', async () => {
    console.log('\n[SSE] 🛑 Shutting down...');
    for (const [id, session] of sessions) {
      await session.transport.close();
    }
    if (browser && shouldCloseBrowser()) {
      console.log('[SSE] 🔒 Closing browser...');
      await browser.close();
    } else if (browser) {
      console.log('[SSE] ✅ Keeping external browser running (connected via --browserUrl)');
    }
    httpServer.close(() => process.exit(0));
  });
}

function getTestPage(): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>MCP SSE 测试</title>
  <style>
    body { font-family: monospace; padding: 20px; max-width: 1200px; margin: 0 auto; }
    h1 { color: #333; }
    .section { margin: 20px 0; padding: 15px; border: 1px solid #ddd; border-radius: 5px; }
    button { padding: 10px 20px; margin: 5px; cursor: pointer; font-size: 14px; }
    button.primary { background: #007bff; color: white; border: none; border-radius: 4px; }
    button.primary:hover { background: #0056b3; }
    pre { background: #f5f5f5; padding: 10px; border-radius: 4px; overflow-x: auto; }
    .log { max-height: 400px; overflow-y: auto; }
    .success { color: green; }
    .error { color: red; }
    .info { color: blue; }
  </style>
</head>
<body>
  <h1>🧪 Chrome DevTools MCP - SSE 测试页面</h1>
  
  <div class="section">
    <h2>状态</h2>
    <p>会话ID: <span id="sessionId">未连接</span></p>
    <p>连接状态: <span id="status">未连接</span></p>
  </div>

  <div class="section">
    <h2>操作</h2>
    <button class="primary" onclick="connect()">1. 连接 SSE</button>
    <button class="primary" onclick="initialize()">2. 初始化</button>
    <button class="primary" onclick="listExtensions()">3. 测试 list_extensions</button>
    <button onclick="clearLog()">清空日志</button>
  </div>

  <div class="section">
    <h2>结果</h2>
    <div id="result"></div>
  </div>

  <div class="section">
    <h2>日志</h2>
    <pre id="log" class="log"></pre>
  </div>

  <script>
    let eventSource = null;
    let sessionId = null;
    let messageId = 1;
    const pendingRequests = new Map();

    function log(msg, type = 'info') {
      const logEl = document.getElementById('log');
      const time = new Date().toLocaleTimeString();
      logEl.textContent += \`[\${time}] \${msg}\\n\`;
      logEl.scrollTop = logEl.scrollHeight;
    }

    function connect() {
      if (eventSource) {
        log('已经连接', 'error');
        return;
      }

      log('正在连接 SSE...', 'info');
      eventSource = new EventSource('/sse');

      eventSource.addEventListener('endpoint', (e) => {
        const data = JSON.parse(e.data);
        sessionId = new URL(data.uri, location.href).searchParams.get('sessionId');
        document.getElementById('sessionId').textContent = sessionId;
        document.getElementById('status').textContent = '✅ 已连接';
        log('✅ SSE 连接成功, 会话ID: ' + sessionId, 'success');
      });

      eventSource.addEventListener('message', (e) => {
        const msg = JSON.parse(e.data);
        log('📥 收到: ' + JSON.stringify(msg).substring(0, 100), 'info');
        
        if (msg.id && pendingRequests.has(msg.id)) {
          const {resolve} = pendingRequests.get(msg.id);
          pendingRequests.delete(msg.id);
          resolve(msg.result);
        }
      });

      eventSource.onerror = (e) => {
        log('❌ SSE 错误', 'error');
        document.getElementById('status').textContent = '❌ 断开';
      };
    }

    async function sendRequest(method, params = {}) {
      if (!sessionId) {
        alert('请先连接 SSE');
        return null;
      }

      const id = messageId++;
      const message = {
        jsonrpc: '2.0',
        id,
        method,
        params,
      };

      log('📤 发送: ' + method, 'info');

      const res = await fetch(\`/message?sessionId=\${sessionId}\`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(message),
      });

      if (!res.ok) {
        log('❌ 请求失败: ' + res.status, 'error');
        return null;
      }

      return new Promise((resolve) => {
        pendingRequests.set(id, {resolve});
        setTimeout(() => {
          if (pendingRequests.has(id)) {
            pendingRequests.delete(id);
            resolve(null);
            log('⏰ 请求超时', 'error');
          }
        }, 10000);
      });
    }

    async function initialize() {
      const result = await sendRequest('initialize', {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: {name: 'web-test', version: '1.0.0'},
      });

      if (result) {
        log('✅ 初始化成功: ' + result.serverInfo.name, 'success');
      }
    }

    async function listExtensions() {
      const startTime = Date.now();
      
      const result = await sendRequest('tools/call', {
        name: 'list_extensions',
        arguments: {},
      });

      const duration = Date.now() - startTime;

      if (result) {
        const text = result.content[0]?.text || '';
        const count = (text.match(/##/g) || []).length - 1;
        
        log(\`✅ list_extensions 完成 (耗时: \${duration}ms)\`, 'success');
        log(\`   找到 \${count} 个扩展\`, 'success');
        
        document.getElementById('result').innerHTML = '<pre>' + text.substring(0, 1000) + '</pre>';
      } else {
        log('❌ list_extensions 失败', 'error');
      }
    }

    function clearLog() {
      document.getElementById('log').textContent = '';
    }

    // 自动提示
    log('👋 欢迎！请按顺序点击按钮：', 'info');
    log('   1. 连接 SSE', 'info');
    log('   2. 初始化', 'info');
    log('   3. 测试 list_extensions', 'info');
  </script>
</body>
</html>`;
}

startSSEServer().catch(error => {
  console.error('[SSE] ❌ Failed to start:', error);
  process.exit(1);
});
