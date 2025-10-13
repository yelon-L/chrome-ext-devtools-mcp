#!/usr/bin/env node

/**
 * 测试编译后的二进制 - 工具列表访问
 * 验证 MCP 协议能否正常获取工具
 */

import {spawn} from 'child_process';
import http from 'http';
import {createRequire} from 'module';
const require = createRequire(import.meta.url);
const EventSource = require('eventsource');

const BINARY = './dist/chrome-devtools-mcp-linux-x64';

console.log('════════════════════════════════════════════════════════════');
console.log('测试编译后的二进制 - 工具列表访问');
console.log('════════════════════════════════════════════════════════════\n');

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// 测试 SSE 模式的工具列表
console.log('测试: SSE 模式 - 工具列表访问');
console.log('────────────────────────────────────────────────────────────');

const ssePort = 36001;
let sseProc = null;
let sessionId = null;

try {
  // 启动 SSE 服务器
  sseProc = spawn(BINARY, ['--transport', 'sse', '--port', String(ssePort), '--headless']);
  
  console.log(`启动 SSE 服务器 (端口 ${ssePort})...`);
  
  // 等待服务器启动
  await sleep(3000);
  
  // 连接到 SSE
  console.log('连接到 SSE 端点...');
  
  const eventSource = new EventSource(`http://localhost:${ssePort}/sse`);
  
  // 获取 endpoint 事件以获取 sessionId
  const endpointPromise = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('等待 endpoint 事件超时'));
    }, 5000);
    
    eventSource.addEventListener('endpoint', (event) => {
      clearTimeout(timeout);
      try {
        const data = JSON.parse(event.data);
        console.log(`✅ 收到 endpoint 事件: ${data.uri}`);
        
        // 从 URI 中提取 sessionId
        const match = data.uri.match(/sessionId=([^&]+)/);
        if (match) {
          resolve(match[1]);
        } else {
          reject(new Error('无法从 endpoint URI 提取 sessionId'));
        }
      } catch (error) {
        reject(error);
      }
    });
    
    eventSource.addEventListener('error', (error) => {
      clearTimeout(timeout);
      reject(new Error(`SSE 连接错误: ${error.message || '未知错误'}`));
    });
  });
  
  sessionId = await endpointPromise;
  console.log(`✅ 获取到 sessionId: ${sessionId}`);
  
  // 发送 initialize 请求
  console.log('\n发送 initialize 请求...');
  const initRequest = {
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: {
        name: 'test-client',
        version: '1.0.0',
      },
    },
  };
  
  const initResponse = await sendMCPMessage(ssePort, sessionId, initRequest);
  console.log(`✅ Initialize 响应: ${JSON.stringify(initResponse).substring(0, 200)}`);
  
  if (initResponse.result && initResponse.result.capabilities) {
    console.log('  ✅ 服务器能力:', Object.keys(initResponse.result.capabilities).join(', '));
  }
  
  // 发送 tools/list 请求
  console.log('\n发送 tools/list 请求...');
  const toolsRequest = {
    jsonrpc: '2.0',
    id: 2,
    method: 'tools/list',
    params: {},
  };
  
  const toolsResponse = await sendMCPMessage(ssePort, sessionId, toolsRequest);
  
  if (toolsResponse.result && toolsResponse.result.tools) {
    const tools = toolsResponse.result.tools;
    console.log(`✅ 成功获取工具列表! 共 ${tools.length} 个工具`);
    console.log('\n工具列表（前 20 个）:');
    tools.slice(0, 20).forEach((tool, i) => {
      console.log(`  ${i + 1}. ${tool.name}`);
    });
    
    // 检查扩展工具
    const extensionTools = tools.filter(t => t.name.includes('extension'));
    console.log(`\n✅ 扩展调试工具: ${extensionTools.length} 个`);
    extensionTools.forEach(tool => {
      console.log(`  - ${tool.name}`);
    });
    
    if (tools.length >= 37) {
      console.log('\n✅ 所有工具都可访问！');
    } else {
      console.log(`\n⚠️  工具数量异常: 期望 >=37, 实际 ${tools.length}`);
    }
  } else {
    console.error('❌ 未能获取工具列表');
    console.error('响应:', JSON.stringify(toolsResponse));
  }
  
  // 关闭连接
  eventSource.close();
  sseProc.kill('SIGTERM');
  
  console.log('\n✅ SSE 模式工具访问测试完成');
  
} catch (error) {
  console.error(`\n❌ 测试失败: ${error.message}`);
  console.error(error.stack);
} finally {
  if (sseProc) {
    sseProc.kill();
  }
}

// 辅助函数：发送 MCP 消息
function sendMCPMessage(port, sessionId, message) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(message);
    
    const options = {
      hostname: 'localhost',
      port: port,
      path: `/message?sessionId=${sessionId}`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
      },
    };
    
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const response = JSON.parse(data);
          resolve(response);
        } catch (error) {
          reject(new Error(`解析响应失败: ${data}`));
        }
      });
    });
    
    req.on('error', reject);
    req.write(postData);
    req.end();
    
    // 超时
    setTimeout(() => {
      req.destroy();
      reject(new Error('请求超时'));
    }, 10000);
  });
}

console.log('\n════════════════════════════════════════════════════════════');
console.log('测试完成');
console.log('════════════════════════════════════════════════════════════\n');
