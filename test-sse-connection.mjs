#!/usr/bin/env node

/**
 * 简单的 SSE 连接测试
 * 用于调试 500 错误
 */

import http from 'http';
import { randomBytes } from 'crypto';

const SERVER_URL = 'http://192.168.239.1:32122';
const LOCAL_CHROME_URL = 'http://192.168.0.201:9222';
const USER_ID = `test-user-${randomBytes(4).toString('hex')}`;

console.log('🧪 SSE 连接调试测试\n');
console.log(`服务器: ${SERVER_URL}`);
console.log(`Chrome: ${LOCAL_CHROME_URL}`);
console.log(`用户: ${USER_ID}\n`);

/**
 * HTTP 请求
 */
function httpRequest(method, url, data = null) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const options = {
      method,
      hostname: urlObj.hostname,
      port: urlObj.port,
      path: urlObj.pathname + urlObj.search,
      headers: data ? {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(JSON.stringify(data)),
      } : {},
    };

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve(JSON.parse(body));
          } catch (e) {
            resolve(body);
          }
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${body}`));
        }
      });
    });

    req.on('error', reject);

    if (data) {
      req.write(JSON.stringify(data));
    }

    req.end();
  });
}

async function main() {
  try {
    // 1. 注册用户
    console.log('步骤 1: 注册用户...');
    const registerResult = await httpRequest('POST', `${SERVER_URL}/api/register`, {
      userId: USER_ID,
      browserURL: LOCAL_CHROME_URL,
    });
    console.log('✅ 注册成功:', registerResult);

    // 2. 申请 Token
    console.log('\n步骤 2: 申请 Token...');
    const tokenResult = await httpRequest('POST', `${SERVER_URL}/api/auth/token`, {
      userId: USER_ID,
      permissions: ['*'],
    });
    console.log('✅ Token 申请成功');
    console.log(`   Token: ${tokenResult.token.substring(0, 20)}...`);

    // 3. 测试 SSE 连接
    console.log('\n步骤 3: 测试 SSE 连接...');
    const urlObj = new URL(`${SERVER_URL}/sse?userId=${USER_ID}`);
    
    const req = http.get({
      hostname: urlObj.hostname,
      port: urlObj.port,
      path: urlObj.pathname + urlObj.search,
      headers: {
        'Accept': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Authorization': `Bearer ${tokenResult.token}`,
      },
    }, (res) => {
      console.log(`\n📡 SSE 响应状态: ${res.statusCode}`);
      console.log(`📋 响应头:`, res.headers);

      if (res.statusCode !== 200) {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          console.error(`\n❌ SSE 连接失败 (${res.statusCode})`);
          console.error(`响应体: ${body}`);
          process.exit(1);
        });
        return;
      }

      console.log('✅ SSE 连接成功!');
      
      let buffer = '';
      res.on('data', (chunk) => {
        buffer += chunk.toString();
        console.log(`📨 收到数据: ${chunk.toString().substring(0, 100)}...`);
        
        // 简单解析 SSE 消息
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || '';
        
        for (const message of lines) {
          console.log(`\n📬 SSE 消息:\n${message}`);
        }
      });

      res.on('end', () => {
        console.log('\n❌ SSE 连接已断开');
        process.exit(0);
      });

      res.on('error', (error) => {
        console.error('\n❌ SSE 错误:', error);
        process.exit(1);
      });

      // 5 秒后断开连接
      setTimeout(() => {
        console.log('\n⏱️  测试完成，断开连接');
        req.destroy();
        process.exit(0);
      }, 5000);
    });

    req.on('error', (error) => {
      console.error('\n❌ 请求错误:', error);
      process.exit(1);
    });

  } catch (error) {
    console.error('\n❌ 测试失败:', error.message);
    process.exit(1);
  }
}

main();
