#!/usr/bin/env node
/**
 * 调试context.getExtensions()为什么返回空
 */

import { EventSource } from 'eventsource';
import fetch from 'node-fetch';

const SERVER_URL = 'http://localhost:32122';
const USER_ID = 'debug-context';
const CHROME_URL = 'http://localhost:9222';

let sessionId = null;
let messageId = 1;
const pendingRequests = new Map();

async function main() {
  try {
    // 注册
    await fetch(`${SERVER_URL}/api/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: USER_ID, browserURL: CHROME_URL })
    });

    // 连接SSE
    const eventSource = new EventSource(`${SERVER_URL}/sse?userId=${USER_ID}`);
    
    await new Promise((resolve) => {
      eventSource.addEventListener('endpoint', (e) => {
        const uri = e.data.startsWith('{') ? JSON.parse(e.data).uri : e.data;
        sessionId = new URL(uri, SERVER_URL).searchParams.get('sessionId');
        console.log(`✅ 连接成功\n`);
        resolve();
      });
      eventSource.addEventListener('message', (e) => {
        const msg = JSON.parse(e.data);
        if (msg.id && pendingRequests.has(msg.id)) {
          pendingRequests.get(msg.id).resolve(msg);
          pendingRequests.delete(msg.id);
        }
      });
    });

    console.log('测试1: list_extensions (这个能工作)\n');
    const result1 = await callTool('list_extensions', {});
    printShort(result1);

    console.log('\n测试2: evaluate_in_extension (检查是否能访问扩展)\n');
    const result2 = await callTool('list_extension_contexts', {
      extensionId: 'pjeiljkehgiabmjmfjohffbihlopdabn'
    });
    printShort(result2);

    console.log('\n测试3: 尝试获取扩展详情\n');
    const result3 = await callTool('get_extension_details', {
      extensionId: 'pjeiljkehgiabmjmfjohffbihlopdabn'
    });
    printShort(result3);

    process.exit(0);
  } catch (error) {
    console.error('❌ 错误:', error.message);
    process.exit(1);
  }
}

function printShort(result) {
  if (result.result?.content?.[0]?.text) {
    const text = result.result.content[0].text;
    console.log(text.substring(0, 800));
    if (text.length > 800) console.log('...[截断]');
  }
}

async function callTool(name, args) {
  const id = messageId++;
  await fetch(`${SERVER_URL}/message?sessionId=${sessionId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ 
      jsonrpc: '2.0', 
      id, 
      method: 'tools/call', 
      params: { name, arguments: args } 
    })
  });
  
  return new Promise((resolve, reject) => {
    pendingRequests.set(id, { resolve, reject });
    setTimeout(() => reject(new Error('请求超时')), 30000);
  });
}

main();
