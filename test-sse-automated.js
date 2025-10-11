#!/usr/bin/env node
/**
 * SSE 自动化测试
 */

import {EventSource} from 'eventsource';
import fetch from 'node-fetch';

function log(msg, color = 'white') {
  const colors = {red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m', blue: '\x1b[34m', cyan: '\x1b[36m'};
  console.log(`${colors[color]}${msg}\x1b[0m`);
}

async function test() {
  log('\n╔════════════════════════════════════════════════════════╗', 'cyan');
  log('║   SSE 自动化测试                                       ║', 'cyan');
  log('╚════════════════════════════════════════════════════════╝\n', 'cyan');

  // 1. 健康检查
  log('步骤 1: 健康检查...', 'blue');
  const healthRes = await fetch('http://localhost:3000/health');
  const health = await healthRes.json();
  log(`  状态: ${health.status}`, health.status === 'ok' ? 'green' : 'red');
  log(`  浏览器: ${health.browser}\n`, 'yellow');

  if (health.status !== 'ok') {
    log('❌ 服务器未就绪', 'red');
    process.exit(1);
  }

  // 2. 连接 SSE
  log('步骤 2: 连接 SSE...', 'blue');
  
  let sessionId = null;
  let messageId = 1;
  const pendingRequests = new Map();
  
  const es = new EventSource('http://localhost:3000/sse');
  
  const connected = new Promise((resolve, reject) => {
    es.addEventListener('endpoint', (e) => {
      const data = JSON.parse(e.data);
      sessionId = new URL(data.uri, 'http://localhost:3000').searchParams.get('sessionId');
      log(`  ✅ SSE 连接成功`, 'green');
      log(`  会话 ID: ${sessionId}\n`, 'yellow');
      resolve();
    });
    
    es.onerror = (e) => {
      log('  ❌ SSE 连接失败', 'red');
      reject(e);
    };
    
    setTimeout(() => reject(new Error('连接超时')), 10000);
  });

  await connected;

  // 监听消息
  es.addEventListener('message', (e) => {
    const msg = JSON.parse(e.data);
    if (msg.id && pendingRequests.has(msg.id)) {
      const {resolve} = pendingRequests.get(msg.id);
      pendingRequests.delete(msg.id);
      resolve(msg);
    }
  });

  async function sendRequest(method, params = {}) {
    const id = messageId++;
    const message = {jsonrpc: '2.0', id, method, params};

    await fetch(`http://localhost:3000/message?sessionId=${sessionId}`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(message),
    });

    return new Promise((resolve, reject) => {
      pendingRequests.set(id, {resolve});
      setTimeout(() => {
        if (pendingRequests.has(id)) {
          pendingRequests.delete(id);
          reject(new Error('请求超时'));
        }
      }, 30000);
    });
  }

  // 3. 初始化
  log('步骤 3: 初始化 MCP...', 'blue');
  const initResult = await sendRequest('initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: {name: 'test', version: '1.0.0'},
  });

  if (initResult.result) {
    log(`  ✅ 初始化成功`, 'green');
    log(`  服务器: ${initResult.result.serverInfo.name} v${initResult.result.serverInfo.version}\n`, 'yellow');
  }

  // 4. 测试 list_extensions（关键测试！）
  log('步骤 4: 测试 list_extensions...', 'blue');
  const startTime = Date.now();
  
  const listResult = await sendRequest('tools/call', {
    name: 'list_extensions',
    arguments: {},
  });
  
  const duration = Date.now() - startTime;
  
  log(`  ⏱️  耗时: ${duration}ms`, duration < 2000 ? 'green' : 'yellow');

  if (listResult.result) {
    const text = listResult.result.content[0]?.text || '';
    const extensionBlocks = text.split('##').filter(b => b.trim());
    const extensionCount = extensionBlocks.length - 1;
    
    log(`  📊 找到 ${extensionCount} 个扩展`, extensionCount > 0 ? 'green' : 'red');
    
    const hasSwStatus = text.includes('Service Worker:');
    const hasHelper = text.includes('MCP Service Worker Activator');
    
    log(`  ${hasSwStatus ? '✅' : '❌'} Service Worker 状态显示`, hasSwStatus ? 'green' : 'red');
    log(`  ${hasHelper ? '✅' : '❌'} Helper Extension 检测`, hasHelper ? 'green' : 'red');
    
    log('\n  返回内容预览:', 'yellow');
    log(text.substring(0, 600).split('\n').map(l => '    ' + l).join('\n'), 'white');
    if (text.length > 600) log('    ...(已截断)\n', 'yellow');
    
    // 验证
    log('\n╔════════════════════════════════════════════════════════╗', 'cyan');
    log('║   测试结果验证                                          ║', 'cyan');
    log('╚════════════════════════════════════════════════════════╝\n', 'cyan');
    
    const checks = {
      '找到扩展': extensionCount > 0,
      '找到多个扩展': extensionCount >= 2,
      'SW 状态显示': hasSwStatus,
      'Helper Extension': hasHelper,
      '性能良好': duration < 2000,
    };
    
    for (const [check, passed] of Object.entries(checks)) {
      log(`  ${passed ? '✅' : '❌'} ${check}`, passed ? 'green' : 'red');
    }
    
    // 对比用户反馈
    log('\n与用户反馈对比：', 'yellow');
    log('  用户问题：只找到 1 个扩展', 'yellow');
    log(`  测试结果：找到 ${extensionCount} 个扩展`, extensionCount >= 2 ? 'green' : 'red');
    
    const allPassed = Object.values(checks).every(Boolean);
    
    log('\n最终结论：', 'cyan');
    if (allPassed) {
      log('🎉 所有测试通过！问题已修复！', 'green');
    } else {
      log('⚠️  部分测试未通过', 'yellow');
    }
    
    es.close();
    process.exit(allPassed ? 0 : 1);
  } else {
    log('  ❌ 测试失败', 'red');
    es.close();
    process.exit(1);
  }
}

test().catch(error => {
  log(`\n❌ 错误: ${error.message}`, 'red');
  console.error(error);
  process.exit(1);
});
