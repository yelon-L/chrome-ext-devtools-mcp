#!/usr/bin/env node
/**
 * 简单的 Streamable HTTP 测试服务器
 * 
 * 直接使用编译好的代码，避免编译问题
 */

import http from 'http';
import {randomUUID} from 'crypto';
import {StreamableHTTPServerTransport} from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';

const port = 3000;

// 存储会话
const sessions = new Map();

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  
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
      transport: 'streamable-http',
    }));
    return;
  }

  // 测试页面
  if (url.pathname === '/test' || url.pathname === '/') {
    res.writeHead(200, {'Content-Type': 'text/html'});
    res.end(`<!DOCTYPE html>
<html>
<head><title>Streamable HTTP 测试</title></head>
<body>
  <h1>MCP Streamable HTTP 测试</h1>
  <button onclick="test()">测试连接</button>
  <pre id="log"></pre>
  <script>
    function log(msg) {
      document.getElementById('log').textContent += msg + '\\n';
    }
    
    async function test() {
      log('发送 initialize...');
      const res = await fetch('/mcp', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: {
            protocolVersion: '2024-11-05',
            capabilities: {},
            clientInfo: {name: 'test', version: '1.0'}
          }
        })
      });
      
      const sessionId = res.headers.get('Mcp-Session-Id');
      log('Session ID: ' + sessionId);
      
      const data = await res.json();
      log('结果: ' + JSON.stringify(data, null, 2));
    }
  </script>
</body>
</html>`);
    return;
  }

  // MCP 端点
  if (url.pathname === '/mcp') {
    const sessionIdFromHeader = req.headers['mcp-session-id'];
    
    console.log(`[${req.method}] /mcp, Session: ${sessionIdFromHeader || 'new'}`);
    
    let session = sessionIdFromHeader ? sessions.get(sessionIdFromHeader) : undefined;
    
    if (!session) {
      console.log('创建新会话...');
      
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (id) => console.log('✅ 会话初始化:', id),
        onsessionclosed: (id) => {
          console.log('📴 会话关闭:', id);
          sessions.delete(id);
        },
      });
      
      await transport.start();
      
      const mcpServer = new McpServer(
        {name: 'test-server', version: '1.0.0'},
        {capabilities: {tools: {}}}
      );
      
      // 注册一个简单的测试工具
      mcpServer.registerTool(
        'test_tool',
        {description: 'Test tool', inputSchema: {type: 'object', properties: {}}},
        async () => ({content: [{type: 'text', text: 'Hello from test tool!'}]})
      );
      
      await mcpServer.connect(transport);
      
      session = {transport, server: mcpServer};
      
      if (transport.sessionId) {
        sessions.set(transport.sessionId, session);
      }
    }
    
    await session.transport.handleRequest(req, res);
    return;
  }

  res.writeHead(404);
  res.end('Not found');
});

server.listen(port, () => {
  console.log('\n╔════════════════════════════════════════════╗');
  console.log('║   Streamable HTTP 测试服务器               ║');
  console.log('╚════════════════════════════════════════════╝\n');
  console.log(`🌐 http://localhost:${port}`);
  console.log(`❤️  http://localhost:${port}/health`);
  console.log(`🧪 http://localhost:${port}/test\n`);
});
