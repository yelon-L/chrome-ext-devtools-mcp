#!/usr/bin/env node

/**
 * 快速测试 Service Worker 激活工具
 * 使用 SSE 方式连接多租户服务器
 */

import { EventSource } from 'eventsource';
import fetch from 'node-fetch';

const SERVER_URL = 'http://localhost:32122';
const USER_ID = 'test-sw-activation';

let sessionId = null;
let messageId = 1;
const pendingRequests = new Map();

console.log('🚀 快速测试 activate_extension_service_worker 工具\n');

// 连接 SSE
const eventSource = new EventSource(`${SERVER_URL}/sse`, {
  headers: { 'X-User-Id': USER_ID },
});

eventSource.addEventListener('endpoint', async (e) => {
  const data = JSON.parse(e.data);
  const url = new URL(data.uri, SERVER_URL);
  sessionId = url.searchParams.get('sessionId');
  
  console.log(`✅ 连接成功，会话ID: ${sessionId}\n`);
  
  try {
    await runQuickTest();
  } catch (error) {
    console.error('❌ 测试失败:', error.message);
    process.exit(1);
  }
});

eventSource.addEventListener('message', (e) => {
  const msg = JSON.parse(e.data);
  if (msg.id && pendingRequests.has(msg.id)) {
    const { resolve } = pendingRequests.get(msg.id);
    pendingRequests.delete(msg.id);
    resolve(msg);
  }
});

eventSource.onerror = (e) => {
  console.error('❌ SSE 连接错误:', e);
  process.exit(1);
};

// 发送请求
async function sendRequest(method, params = {}) {
  const id = messageId++;
  const message = { jsonrpc: '2.0', id, method, params };

  const response = await fetch(`${SERVER_URL}/message?sessionId=${sessionId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(message),
  });

  if (!response.ok) {
    throw new Error(`请求失败: ${response.status}`);
  }

  return new Promise((resolve, reject) => {
    pendingRequests.set(id, { resolve, reject });
    setTimeout(() => {
      if (pendingRequests.has(id)) {
        pendingRequests.delete(id);
        reject(new Error('请求超时'));
      }
    }, 30000);
  });
}

// 调用工具
async function callTool(name, args) {
  console.log(`\n📞 调用: ${name}`);
  console.log(`   参数:`, JSON.stringify(args, null, 2));
  
  const start = Date.now();
  const result = await sendRequest('tools/call', { name, arguments: args });
  const duration = Date.now() - start;
  
  console.log(`✅ 完成 (${duration}ms)`);
  
  // 提取文本内容
  if (result.result?.content?.[0]?.text) {
    const text = result.result.content[0].text;
    console.log('\n' + text.substring(0, 800));
    if (text.length > 800) console.log('...[输出已截断]');
  }
  
  return { result, duration };
}

// 运行快速测试
async function runQuickTest() {
  console.log('='.repeat(60));
  console.log('开始快速测试');
  console.log('='.repeat(60));

  // 测试 1: 列出工具，验证新工具存在
  console.log('\n📋 测试 1: 验证工具已注册');
  const listResult = await sendRequest('tools/list');
  const tools = listResult.result?.tools || [];
  const hasTool = tools.some(t => t.name === 'activate_extension_service_worker');
  
  if (hasTool) {
    console.log('✅ 工具已找到');
    const tool = tools.find(t => t.name === 'activate_extension_service_worker');
    console.log(`   描述: ${tool.description.substring(0, 80)}...`);
  } else {
    throw new Error('工具未找到');
  }

  // 测试 2: 导航到 chrome://extensions
  console.log('\n🌐 测试 2: 导航到扩展页面');
  await callTool('navigate_page', { url: 'chrome://extensions' });
  
  // 等待页面加载
  await new Promise(resolve => setTimeout(resolve, 1500));

  // 测试 3: 激活所有未激活的 SW（默认模式）
  console.log('\n⚡ 测试 3: 激活未激活的 Service Worker');
  const { duration: duration1 } = await callTool('activate_extension_service_worker', {
    mode: 'inactive'
  });

  // 测试 4: 再次激活（应该显示无需激活）
  console.log('\n⚡ 测试 4: 再次激活（验证幂等性）');
  const { duration: duration2 } = await callTool('activate_extension_service_worker', {
    mode: 'inactive'
  });

  // 测试 5: 列出扩展
  console.log('\n📦 测试 5: 列出已安装扩展');
  await callTool('list_extensions', {});

  // 性能统计
  console.log('\n' + '='.repeat(60));
  console.log('性能统计');
  console.log('='.repeat(60));
  console.log(`首次激活: ${duration1}ms`);
  console.log(`二次激活: ${duration2}ms`);
  
  if (duration1 < 500 && duration2 < 500) {
    console.log('✅ 性能优秀（< 500ms）');
  } else if (duration1 < 1000 && duration2 < 1000) {
    console.log('⚠️  性能一般（< 1000ms）');
  } else {
    console.log('❌ 性能较差（> 1000ms）');
  }

  // 完成
  console.log('\n' + '='.repeat(60));
  console.log('✅ 所有测试完成！');
  console.log('='.repeat(60));
  
  process.exit(0);
}

// 处理退出
process.on('SIGINT', () => {
  console.log('\n\n👋 测试已中断');
  process.exit(0);
});

setTimeout(() => {
  if (!sessionId) {
    console.error('❌ 连接超时，请确保服务器正在运行：');
    console.error('   AUTH_ENABLED=false PORT=32122 node build/src/multi-tenant/server-multi-tenant.js');
    process.exit(1);
  }
}, 5000);
