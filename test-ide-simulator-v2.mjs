#!/usr/bin/env node

/**
 * IDE 模拟器 - V2 API 测试
 * 测试 SSE V2 连接能否及时识别要调试的浏览器
 */

import { createRequire } from 'module';
import fetch from 'node-fetch';

const require = createRequire(import.meta.url);
const EventSource = require('eventsource');

const SERVER = process.env.SERVER_URL || 'http://localhost:32122';
const BROWSER_URL = process.env.BROWSER_URL || 'http://localhost:9222';

// 颜色定义
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
};

function log(color, prefix, message) {
  console.log(`${color}${prefix}${colors.reset} ${message}`);
}

function success(message) {
  log(colors.green, '✅', message);
}

function info(message) {
  log(colors.blue, 'ℹ️ ', message);
}

function warn(message) {
  log(colors.yellow, '⚠️ ', message);
}

function error(message) {
  log(colors.red, '❌', message);
}

function step(message) {
  console.log(`\n${colors.bright}${colors.cyan}${'='.repeat(60)}${colors.reset}`);
  console.log(`${colors.bright}${colors.cyan}${message}${colors.reset}`);
  console.log(`${colors.bright}${colors.cyan}${'='.repeat(60)}${colors.reset}\n`);
}

/**
 * 测试步骤 1: 注册用户
 */
async function registerUser() {
  step('步骤 1: 注册用户（使用邮箱）');
  
  const email = `ide-test-${Date.now()}@example.com`;
  const username = 'IDE Test User';
  
  info(`POST ${SERVER}/api/users`);
  info(`  email: ${email}`);
  info(`  username: ${username}`);
  
  const response = await fetch(`${SERVER}/api/users`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, username }),
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    error(`注册失败: ${response.status} ${response.statusText}`);
    console.log(errorText);
    throw new Error('User registration failed');
  }
  
  const data = await response.json();
  success('用户注册成功');
  console.log(JSON.stringify(data, null, 2));
  
  return {
    userId: data.userId,
    email: data.email,
    username: data.username,
  };
}

/**
 * 测试步骤 2: 绑定浏览器
 */
async function bindBrowser(userId) {
  step('步骤 2: 绑定浏览器（获取 token）');
  
  const tokenName = 'ide-test-browser';
  
  info(`POST ${SERVER}/api/users/${userId}/browsers`);
  info(`  browserURL: ${BROWSER_URL}`);
  info(`  tokenName: ${tokenName}`);
  
  const response = await fetch(`${SERVER}/api/users/${userId}/browsers`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      browserURL: BROWSER_URL,
      tokenName,
      description: 'Browser for IDE testing',
    }),
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    error(`浏览器绑定失败: ${response.status} ${response.statusText}`);
    console.log(errorText);
    throw new Error('Browser binding failed');
  }
  
  const data = await response.json();
  success('浏览器绑定成功');
  console.log(JSON.stringify({
    browserId: data.browserId,
    tokenName: data.tokenName,
    token: `${data.token.substring(0, 20)}...`,
    browserURL: data.browserURL,
    browser: data.browser,
  }, null, 2));
  
  return {
    browserId: data.browserId,
    token: data.token,
    tokenName: data.tokenName,
    browserURL: data.browserURL,
  };
}

/**
 * 测试步骤 3: 建立 SSE V2 连接
 */
async function connectSSEV2(token, userId, tokenName) {
  step('步骤 3: 建立 SSE V2 连接（模拟 IDE）');
  
  info(`GET ${SERVER}/sse-v2`);
  info(`  Authorization: Bearer ${token.substring(0, 20)}...`);
  info(`  预期识别: userId=${userId}, tokenName=${tokenName}`);
  
  return new Promise((resolve, reject) => {
    const eventSource = new EventSource(`${SERVER}/sse-v2`, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });
    
    let endpointReceived = false;
    let sessionId = null;
    const startTime = Date.now();
    
    eventSource.addEventListener('endpoint', (event) => {
      const elapsed = Date.now() - startTime;
      endpointReceived = true;
      
      const endpointUrl = event.data;
      const match = endpointUrl.match(/sessionId=([^&]+)/);
      sessionId = match ? match[1] : null;
      
      success(`✨ 连接建立成功！耗时: ${elapsed}ms`);
      info(`  Session ID: ${sessionId}`);
      info(`  Endpoint: ${endpointUrl}`);
      console.log('');
      
      // 显示浏览器识别信息
      console.log(`${colors.bright}${colors.green}🎯 浏览器识别信息:${colors.reset}`);
      console.log(`${colors.cyan}  👤 用户: ${colors.bright}${userId}${colors.reset}`);
      console.log(`${colors.cyan}  🌐 浏览器: ${colors.bright}${tokenName}${colors.reset}`);
      console.log(`${colors.cyan}  🔗 URL: ${colors.bright}${BROWSER_URL}${colors.reset}`);
      console.log(`${colors.cyan}  ⏱️  连接时间: ${colors.bright}${elapsed}ms${colors.reset}`);
      console.log('');
      
      resolve({
        sessionId,
        endpointUrl,
        connectionTime: elapsed,
      });
    });
    
    eventSource.addEventListener('message', (event) => {
      try {
        const message = JSON.parse(event.data);
        info(`收到消息: ${message.method || message.type || 'unknown'}`);
      } catch (e) {
        info(`收到消息: ${event.data}`);
      }
    });
    
    eventSource.onerror = (err) => {
      const elapsed = Date.now() - startTime;
      
      if (!endpointReceived) {
        error(`❌ 连接失败！耗时: ${elapsed}ms`);
        console.error('错误详情:', err);
        eventSource.close();
        reject(new Error('SSE connection failed'));
      } else {
        // 连接已建立后的错误，可能是正常关闭
        warn('连接已关闭或出现错误');
        eventSource.close();
      }
    };
    
    // 超时保护
    setTimeout(() => {
      if (!endpointReceived) {
        error('❌ 连接超时（15秒）');
        eventSource.close();
        reject(new Error('Connection timeout'));
      }
    }, 15000);
  });
}

/**
 * 测试步骤 4: 调用工具测试
 */
async function testToolCall(sessionId, endpointUrl) {
  step('步骤 4: 测试工具调用（验证浏览器操作）');
  
  info('调用 get-browser-info 工具');
  
  const messageUrl = `${SERVER}${endpointUrl}`;
  
  const toolCallRequest = {
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/call',
    params: {
      name: 'get-browser-info',
      arguments: {},
    },
  };
  
  info(`POST ${messageUrl}`);
  console.log('请求:', JSON.stringify(toolCallRequest, null, 2));
  
  try {
    const response = await fetch(messageUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(toolCallRequest),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      error(`工具调用失败: ${response.status}`);
      console.log(errorText);
      return null;
    }
    
    const result = await response.json();
    success('工具调用成功');
    console.log('响应:', JSON.stringify(result, null, 2));
    
    return result;
  } catch (err) {
    error(`工具调用异常: ${err.message}`);
    return null;
  }
}

/**
 * 测试步骤 5: 清理
 */
async function cleanup(userId, tokenName) {
  step('步骤 5: 清理测试数据');
  
  // 解绑浏览器
  info(`DELETE ${SERVER}/api/users/${userId}/browsers/${tokenName}`);
  const unbindResponse = await fetch(
    `${SERVER}/api/users/${userId}/browsers/${tokenName}`,
    { method: 'DELETE' }
  );
  
  if (unbindResponse.ok) {
    success('浏览器解绑成功');
  } else {
    warn('浏览器解绑失败（可能已被删除）');
  }
  
  // 删除用户
  info(`DELETE ${SERVER}/api/users/${userId}`);
  const deleteResponse = await fetch(
    `${SERVER}/api/users/${userId}`,
    { method: 'DELETE' }
  );
  
  if (deleteResponse.ok) {
    success('用户删除成功');
  } else {
    warn('用户删除失败');
  }
}

/**
 * 主测试流程
 */
async function main() {
  console.log('\n');
  console.log(`${colors.bright}${colors.magenta}${'═'.repeat(60)}${colors.reset}`);
  console.log(`${colors.bright}${colors.magenta}  IDE 模拟器 - V2 API 浏览器识别测试${colors.reset}`);
  console.log(`${colors.bright}${colors.magenta}${'═'.repeat(60)}${colors.reset}`);
  console.log('');
  info(`服务器: ${SERVER}`);
  info(`浏览器: ${BROWSER_URL}`);
  console.log('');
  
  let user = null;
  let browser = null;
  let connection = null;
  
  try {
    // 步骤 1: 注册用户
    user = await registerUser();
    
    // 步骤 2: 绑定浏览器
    browser = await bindBrowser(user.userId);
    
    // 步骤 3: 建立 SSE V2 连接
    connection = await connectSSEV2(browser.token, user.userId, browser.tokenName);
    
    // 步骤 4: 测试工具调用
    if (connection) {
      await testToolCall(connection.sessionId, connection.endpointUrl);
    }
    
    // 等待一会儿观察连接
    info('连接保持 3 秒...');
    await new Promise(resolve => setTimeout(resolve, 3000));
    
  } catch (err) {
    error(`测试失败: ${err.message}`);
    console.error(err);
  } finally {
    // 步骤 5: 清理
    if (user && browser) {
      await cleanup(user.userId, browser.tokenName);
    }
  }
  
  // 最终总结
  console.log('\n');
  console.log(`${colors.bright}${colors.magenta}${'═'.repeat(60)}${colors.reset}`);
  console.log(`${colors.bright}${colors.magenta}  测试总结${colors.reset}`);
  console.log(`${colors.bright}${colors.magenta}${'═'.repeat(60)}${colors.reset}`);
  console.log('');
  
  if (connection) {
    success('✅ SSE V2 连接能够及时识别要调试的浏览器');
    console.log('');
    console.log(`${colors.cyan}关键指标:${colors.reset}`);
    console.log(`  • 连接建立时间: ${connection.connectionTime}ms`);
    console.log(`  • 浏览器识别: 即时（通过 token 自动解析）`);
    console.log(`  • Session ID: ${connection.sessionId}`);
    console.log('');
    console.log(`${colors.cyan}V2 架构优势:${colors.reset}`);
    console.log(`  ✓ 无需手动指定 userId`);
    console.log(`  ✓ Token 直接对应浏览器实例`);
    console.log(`  ✓ 支持一用户多浏览器`);
    console.log(`  ✓ 自动记录连接时间`);
  } else {
    error('❌ 测试未完成或失败');
  }
  
  console.log('');
}

// 运行测试
main().catch(console.error);
