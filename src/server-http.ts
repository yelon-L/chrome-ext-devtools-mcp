#!/usr/bin/env node
/**
 * MCP Streamable HTTP Server - 用于测试
 * 
 * 基于官方 StreamableHTTPServerTransport 实现
 * 
 * 使用方式：
 * node build/src/server-http.js --browser-url http://localhost:9222
 */

import './polyfill.js';

import http from 'node:http';
import {randomUUID} from 'node:crypto';
import {StreamableHTTPServerTransport} from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import type {CallToolResult} from '@modelcontextprotocol/sdk/types.js';

import {parseArguments} from './cli.js';
import {ensureBrowserConnected, ensureBrowserLaunched} from './browser.js';
import type {Channel} from './browser.js';
import {logger} from './logger.js';
import {McpContext} from './McpContext.js';
import {McpResponse} from './McpResponse.js';
import {Mutex} from './Mutex.js';
import type {ToolDefinition} from './tools/ToolDefinition.js';
import * as consoleTools from './tools/console.js';
import * as emulationTools from './tools/emulation.js';
import * as extensionTools from './tools/extensions.js';
import * as inputTools from './tools/input.js';
import * as networkTools from './tools/network.js';
import * as pagesTools from './tools/pages.js';
import * as performanceTools from './tools/performance.js';
import * as screenshotTools from './tools/screenshot.js';
import * as scriptTools from './tools/script.js';
import * as snapshotTools from './tools/snapshot.js';
import {readPackageJson} from './utils/common.js';

// 存储所有会话
const sessions = new Map<string, {
  transport: StreamableHTTPServerTransport;
  server: McpServer;
  context: McpContext;
}>();

async function startHTTPServer() {
  const version = readPackageJson().version ?? '0.8.1';
  const args = parseArguments(version);
  const port = parseInt(process.env.PORT || '32123', 10);

  // 启动浏览器
  console.log('[HTTP] 🚀 初始化浏览器...');
  
  const extraArgs: string[] = (args.chromeArg ?? []).map(String);
  if (args.proxyServer) {
    extraArgs.push(`--proxy-server=${args.proxyServer}`);
  }
  
  const devtools = args.experimentalDevtools ?? false;
  const browser = args.browserUrl
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

  console.log('[HTTP] ✅ 浏览器已连接');

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
    
    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Mcp-Session-Id');

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
        transport: 'streamable-http',
      }));
      return;
    }

    // 测试页面
    if (url.pathname === '/test' || url.pathname === '/') {
      res.writeHead(200, {'Content-Type': 'text/html; charset=utf-8'});
      res.end(getTestPage());
      return;
    }

    // MCP 端点
    if (url.pathname === '/mcp') {
      const sessionIdFromHeader = req.headers['mcp-session-id'] as string | undefined;
      
      console.log(`[HTTP] ${req.method} /mcp, Session: ${sessionIdFromHeader || 'new'}`);
      
      // 查找或创建会话
      let session = sessionIdFromHeader ? sessions.get(sessionIdFromHeader) : undefined;
      
      if (!session) {
        // 创建新会话
        let sessionToStore: {transport: StreamableHTTPServerTransport; server: McpServer; context: McpContext} | null = null;
        
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: async (sessionId) => {
            console.log(`[HTTP] ✅ 会话初始化: ${sessionId}`);
            // 在会话初始化后保存 session
            if (sessionToStore) {
              sessions.set(sessionId, sessionToStore);
              console.log(`[HTTP] 📦 会话已保存: ${sessionId}, 总会话数: ${sessions.size}`);
            }
          },
          onsessionclosed: async (sessionId) => {
            console.log(`[HTTP] 📴 会话关闭: ${sessionId}`);
            sessions.delete(sessionId);
          },
        });
        
        // 注意：不要手动调用 transport.start()
        // mcpServer.connect() 会自动调用它
        
        // 创建 MCP Server
        const mcpServer = new McpServer(
          {name: 'chrome-devtools-mcp', version},
          {capabilities: {tools: {}}},
        );
        
        // 创建 Context
        const context = await McpContext.from(browser, logger);
        
        // 注册工具
        const tools = [
          ...Object.values(consoleTools),
          ...Object.values(emulationTools),
          ...Object.values(extensionTools),
          ...Object.values(inputTools),
          ...Object.values(networkTools),
          ...Object.values(pagesTools),
          ...Object.values(performanceTools),
          ...Object.values(screenshotTools),
          ...Object.values(scriptTools),
          ...Object.values(snapshotTools),
        ];
        for (const tool of tools) {
          registerTool(mcpServer, tool as unknown as ToolDefinition, context);
        }
        
        await mcpServer.connect(transport);
        
        session = {transport, server: mcpServer, context};
        sessionToStore = session;
      }
      
      // 处理请求
      await session.transport.handleRequest(req, res);
      return;
    }

    res.writeHead(404);
    res.end('Not found');
  });

  // 错误处理
  httpServer.on('error', (error: NodeJS.ErrnoException) => {
    console.error('\n[HTTP] ❌ 服务器启动失败');
    console.error('');
    
    if (error.code === 'EADDRINUSE') {
      console.error(`❌ 端口 ${port} 已被占用`);
      console.error('');
      console.error('解决方案：');
      console.error(`  1. 使用其他端口: --port ${port + 1}`);
      console.error(`  2. 查找占用端口的进程:`);
      console.error(`     Windows: netstat -ano | findstr ${port}`);
      console.error(`     Linux/Mac: lsof -i :${port}`);
      console.error(`  3. 关闭占用端口的程序`);
    } else if (error.code === 'EACCES') {
      console.error(`❌ 权限不足，无法绑定端口 ${port}`);
      console.error('');
      console.error('解决方案：');
      console.error(`  1. 使用非特权端口 (>1024): --port 8080`);
      console.error(`  2. Windows: 以管理员身份运行`);
      console.error(`  3. Linux/Mac: 使用 sudo 或更改端口`);
    } else if (error.code === 'EADDRNOTAVAIL') {
      console.error(`❌ 地址不可用`);
      console.error('');
      console.error('可能原因：');
      console.error('  - 网络接口未启用');
      console.error('  - 防火墙阻止');
    } else {
      console.error(`❌ 错误: ${error.message}`);
      console.error(`   错误码: ${error.code || '未知'}`);
      console.error('');
      console.error('详细信息：');
      console.error(error.stack || error);
    }
    
    console.error('');
    process.exit(1);
  });

  httpServer.listen(port, () => {
    console.log('\n╔════════════════════════════════════════════════════════╗');
    console.log('║   Chrome DevTools MCP - Streamable HTTP Server        ║');
    console.log('╚════════════════════════════════════════════════════════╝\n');
    console.log(`[HTTP] 🌐 服务器已启动`);
    console.log(`[HTTP] 📡 端口: ${port}`);
    console.log(`[HTTP] 🔗 端点:`);
    console.log(`       - Health: http://localhost:${port}/health`);
    console.log(`       - MCP:    http://localhost:${port}/mcp`);
    console.log(`       - Test:   http://localhost:${port}/test`);
    console.log('');
    console.log('传输方式: Streamable HTTP (最新标准)');
    console.log('按 Ctrl+C 停止\n');
  });

  process.on('SIGINT', async () => {
    console.log('\n[HTTP] 🛑 正在关闭...');
    for (const [id, session] of sessions) {
      await session.transport.close();
    }
    if (browser) await browser.close();
    httpServer.close(() => process.exit(0));
  });
}

function getTestPage(): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>MCP Streamable HTTP 测试</title>
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
  <h1>🧪 Chrome DevTools MCP - Streamable HTTP 测试</h1>
  
  <div class="section">
    <h2>状态</h2>
    <p>会话ID: <span id="sessionId">未初始化</span></p>
    <p>传输方式: Streamable HTTP (最新标准)</p>
  </div>

  <div class="section">
    <h2>操作</h2>
    <button class="primary" onclick="initialize()">1. 初始化</button>
    <button class="primary" onclick="listExtensions()">2. 测试 list_extensions</button>
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
    let sessionId = null;
    let messageId = 1;

    function log(msg, type = 'info') {
      const logEl = document.getElementById('log');
      const time = new Date().toLocaleTimeString();
      logEl.textContent += \`[\${time}] \${msg}\\n\`;
      logEl.scrollTop = logEl.scrollHeight;
    }

    async function sendRequest(method, params = {}) {
      const id = messageId++;
      const message = {jsonrpc: '2.0', id, method, params};

      const headers = {'Content-Type': 'application/json'};
      if (sessionId) {
        headers['Mcp-Session-Id'] = sessionId;
      }

      log('📤 发送: ' + method, 'info');

      const res = await fetch('/mcp', {
        method: 'POST',
        headers,
        body: JSON.stringify(message),
      });

      if (!res.ok) {
        log('❌ HTTP ' + res.status, 'error');
        return null;
      }

      // 检查会话ID
      const newSessionId = res.headers.get('Mcp-Session-Id');
      if (newSessionId && !sessionId) {
        sessionId = newSessionId;
        document.getElementById('sessionId').textContent = sessionId;
        log('📝 会话ID: ' + sessionId, 'success');
      }

      const result = await res.json();
      log('📥 收到: ' + JSON.stringify(result).substring(0, 100), 'info');
      
      return result.result;
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

    log('👋 欢迎！请按顺序：', 'info');
    log('   1. 初始化', 'info');
    log('   2. 测试 list_extensions', 'info');
  </script>
</body>
</html>`;
}

startHTTPServer().catch(error => {
  console.error('[HTTP] ❌ 启动失败:', error);
  process.exit(1);
});
