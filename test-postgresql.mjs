#!/usr/bin/env node
/**
 * PostgreSQL 完整功能测试
 * 测试所有 V2 API 在 PostgreSQL 存储下的功能
 */

import { spawn } from 'child_process';
import { setTimeout as delay } from 'timers/promises';

const DB_CONFIG = {
  host: process.env.DB_HOST || '192.168.0.205',
  port: process.env.DB_PORT || '5432',
  database: process.env.DB_NAME || 'postgres',
  user: process.env.DB_USER || 'admin',
  password: process.env.DB_PASSWORD || 'admin',
};

const SERVER_PORT = 32122;
const BASE_URL = `http://localhost:${SERVER_PORT}`;

console.log('╔═══════════════════════════════════════════════════════════════════╗');
console.log('║            PostgreSQL 完整功能测试                                 ║');
console.log('╚═══════════════════════════════════════════════════════════════════╝\n');

console.log('⚙️  配置:');
console.log(`   数据库: ${DB_CONFIG.user}@${DB_CONFIG.host}:${DB_CONFIG.port}/${DB_CONFIG.database}`);
console.log(`   服务器: ${BASE_URL}\n`);

const results = {
  passed: [],
  failed: [],
};

/**
 * HTTP 请求封装
 */
async function request(method, path, body = null) {
  const url = `${BASE_URL}${path}`;
  const options = {
    method,
    headers: {
      'Content-Type': 'application/json',
    },
  };
  
  if (body) {
    options.body = JSON.stringify(body);
  }
  
  try {
    const response = await fetch(url, options);
    const data = await response.json();
    return { status: response.status, data };
  } catch (error) {
    throw new Error(`Request failed: ${error.message}`);
  }
}

/**
 * 测试用例
 */
async function testHealthCheck() {
  console.log('\n🔧 测试: 健康检查');
  try {
    const { status, data } = await request('GET', '/health');
    if (status === 200 && data.status === 'ok') {
      console.log('   ✅ 成功');
      results.passed.push('健康检查');
      return true;
    }
    throw new Error(`Unexpected response: ${JSON.stringify(data)}`);
  } catch (error) {
    console.log(`   ❌ 失败: ${error.message}`);
    results.failed.push({ test: '健康检查', error: error.message });
    return false;
  }
}

async function testRegisterUser(email, username) {
  console.log(`\n🔧 测试: 注册用户 (${email})`);
  try {
    const { status, data } = await request('POST', '/api/v2/users', {
      email,
      username,
    });
    
    if (status === 201 && data.success && data.userId) {
      console.log(`   ✅ 成功: userId=${data.userId}`);
      results.passed.push(`注册用户: ${email}`);
      return data.userId;
    }
    
    throw new Error(`Unexpected response: ${JSON.stringify(data)}`);
  } catch (error) {
    console.log(`   ❌ 失败: ${error.message}`);
    results.failed.push({ test: `注册用户: ${email}`, error: error.message });
    return null;
  }
}

async function testGetUser(userId) {
  console.log(`\n🔧 测试: 获取用户信息 (${userId})`);
  try {
    const { status, data } = await request('GET', `/api/v2/users/${userId}`);
    
    if (status === 200 && data.userId === userId) {
      console.log(`   ✅ 成功: ${data.username}`);
      results.passed.push(`获取用户: ${userId}`);
      return true;
    }
    
    throw new Error(`Unexpected response: ${JSON.stringify(data)}`);
  } catch (error) {
    console.log(`   ❌ 失败: ${error.message}`);
    results.failed.push({ test: `获取用户: ${userId}`, error: error.message });
    return false;
  }
}

async function testListUsers() {
  console.log('\n🔧 测试: 列出所有用户');
  try {
    const { status, data } = await request('GET', '/api/v2/users');
    
    if (status === 200 && Array.isArray(data)) {
      console.log(`   ✅ 成功: ${data.length} 个用户`);
      results.passed.push('列出用户');
      return data.length;
    }
    
    throw new Error(`Unexpected response: ${JSON.stringify(data)}`);
  } catch (error) {
    console.log(`   ❌ 失败: ${error.message}`);
    results.failed.push({ test: '列出用户', error: error.message });
    return 0;
  }
}

async function testBindBrowser(userId, browserURL, tokenName) {
  console.log(`\n🔧 测试: 绑定浏览器 (${tokenName})`);
  try {
    const { status, data } = await request('POST', `/api/v2/users/${userId}/browsers`, {
      browserURL,
      tokenName,
      description: 'PostgreSQL 测试浏览器',
    });
    
    if (status === 201 && data.success && data.browserId && data.token) {
      console.log(`   ✅ 成功`);
      console.log(`      browserId: ${data.browserId}`);
      console.log(`      token: ${data.token.substring(0, 32)}...`);
      results.passed.push(`绑定浏览器: ${tokenName}`);
      return { browserId: data.browserId, token: data.token };
    }
    
    throw new Error(`Unexpected response: ${JSON.stringify(data)}`);
  } catch (error) {
    console.log(`   ❌ 失败: ${error.message}`);
    results.failed.push({ test: `绑定浏览器: ${tokenName}`, error: error.message });
    return null;
  }
}

async function testListBrowsers(userId) {
  console.log(`\n🔧 测试: 列出用户浏览器 (${userId})`);
  try {
    const { status, data } = await request('GET', `/api/v2/users/${userId}/browsers`);
    
    if (status === 200 && Array.isArray(data)) {
      console.log(`   ✅ 成功: ${data.length} 个浏览器`);
      results.passed.push(`列出浏览器: ${userId}`);
      return data.length;
    }
    
    throw new Error(`Unexpected response: ${JSON.stringify(data)}`);
  } catch (error) {
    console.log(`   ❌ 失败: ${error.message}`);
    results.failed.push({ test: `列出浏览器: ${userId}`, error: error.message });
    return 0;
  }
}

async function testUpdateBrowser(userId, browserId, description) {
  console.log(`\n🔧 测试: 更新浏览器 (${browserId})`);
  try {
    const { status, data } = await request('PATCH', `/api/v2/users/${userId}/browsers/${browserId}`, {
      description,
    });
    
    if (status === 200 && data.success) {
      console.log(`   ✅ 成功`);
      results.passed.push(`更新浏览器: ${browserId}`);
      return true;
    }
    
    throw new Error(`Unexpected response: ${JSON.stringify(data)}`);
  } catch (error) {
    console.log(`   ❌ 失败: ${error.message}`);
    results.failed.push({ test: `更新浏览器: ${browserId}`, error: error.message });
    return false;
  }
}

async function testDeleteBrowser(userId, browserId) {
  console.log(`\n🔧 测试: 删除浏览器 (${browserId})`);
  try {
    const { status, data } = await request('DELETE', `/api/v2/users/${userId}/browsers/${browserId}`);
    
    if (status === 200 && data.success) {
      console.log(`   ✅ 成功`);
      results.passed.push(`删除浏览器: ${browserId}`);
      return true;
    }
    
    throw new Error(`Unexpected response: ${JSON.stringify(data)}`);
  } catch (error) {
    console.log(`   ❌ 失败: ${error.message}`);
    results.failed.push({ test: `删除浏览器: ${browserId}`, error: error.message });
    return false;
  }
}

async function testDeleteUser(userId) {
  console.log(`\n🔧 测试: 删除用户 (${userId})`);
  try {
    const { status, data } = await request('DELETE', `/api/v2/users/${userId}`);
    
    if (status === 200 && data.success) {
      console.log(`   ✅ 成功`);
      results.passed.push(`删除用户: ${userId}`);
      return true;
    }
    
    throw new Error(`Unexpected response: ${JSON.stringify(data)}`);
  } catch (error) {
    console.log(`   ❌ 失败: ${error.message}`);
    results.failed.push({ test: `删除用户: ${userId}`, error: error.message });
    return false;
  }
}

/**
 * 启动服务器
 */
async function startServer() {
  console.log('📋 启动 PostgreSQL 多租户服务器...\n');
  
  const proc = spawn('node', ['build/src/multi-tenant/server-multi-tenant.js'], {
    env: {
      ...process.env,
      STORAGE_TYPE: 'postgresql',
      DB_HOST: DB_CONFIG.host,
      DB_PORT: DB_CONFIG.port,
      DB_NAME: DB_CONFIG.database,
      DB_USER: DB_CONFIG.user,
      DB_PASSWORD: DB_CONFIG.password,
      PORT: String(SERVER_PORT),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  
  let serverReady = false;
  
  proc.stdout.on('data', (data) => {
    const output = data.toString();
    if (output.includes('Multi-tenant server started')) {
      serverReady = true;
    }
    if (output.includes('PostgreSQL storage initialized')) {
      console.log('   ✅ PostgreSQL 存储初始化成功');
    }
  });
  
  proc.stderr.on('data', (data) => {
    const error = data.toString();
    if (error.includes('error') || error.includes('Error')) {
      console.error('   ❌ 服务器错误:', error);
    }
  });
  
  // 等待服务器启动
  for (let i = 0; i < 30; i++) {
    if (serverReady) break;
    await delay(1000);
  }
  
  if (!serverReady) {
    console.error('   ❌ 服务器启动超时');
    proc.kill();
    return null;
  }
  
  console.log('   ✅ 服务器已启动\n');
  return proc;
}

/**
 * 主测试流程
 */
async function main() {
  let proc = null;
  
  try {
    // 1. 启动服务器
    proc = await startServer();
    if (!proc) {
      console.error('❌ 无法启动服务器');
      process.exit(1);
    }
    
    // 等待服务器完全就绪
    await delay(2000);
    
    // 2. 运行测试
    console.log('═══════════════════════════════════════════════════════════════════');
    console.log('开始API测试');
    console.log('═══════════════════════════════════════════════════════════════════');
    
    // 健康检查
    const healthOk = await testHealthCheck();
    if (!healthOk) {
      throw new Error('健康检查失败，停止测试');
    }
    
    // 用户管理测试
    const userId1 = await testRegisterUser('pg-test1@example.com', 'PG Test User 1');
    if (!userId1) throw new Error('注册用户1失败');
    
    const userId2 = await testRegisterUser('pg-test2@example.com', 'PG Test User 2');
    if (!userId2) throw new Error('注册用户2失败');
    
    await testGetUser(userId1);
    const userCount = await testListUsers();
    
    // 浏览器管理测试
    const browser1 = await testBindBrowser(userId1, 'http://localhost:9222', 'pg-browser-1');
    if (!browser1) throw new Error('绑定浏览器1失败');
    
    const browser2 = await testBindBrowser(userId1, 'http://localhost:9223', 'pg-browser-2');
    if (!browser2) throw new Error('绑定浏览器2失败');
    
    await testListBrowsers(userId1);
    
    await testUpdateBrowser(userId1, browser1.browserId, 'Updated description');
    
    // 删除测试
    await testDeleteBrowser(userId1, browser2.browserId);
    await testListBrowsers(userId1); // 应该只剩1个
    
    await testDeleteUser(userId2);
    await testListUsers(); // 应该只剩1个用户
    
    // 清理
    await testDeleteUser(userId1);
    
    // 3. 打印测试报告
    console.log('\n\n╔═══════════════════════════════════════════════════════════════════╗');
    console.log('║                        测试报告                                    ║');
    console.log('╚═══════════════════════════════════════════════════════════════════╝\n');
    
    const total = results.passed.length + results.failed.length;
    const passRate = ((results.passed.length / total) * 100).toFixed(1);
    
    console.log(`📊 总测试数: ${total}`);
    console.log(`✅ 通过: ${results.passed.length} (${passRate}%)`);
    console.log(`❌ 失败: ${results.failed.length}\n`);
    
    if (results.failed.length > 0) {
      console.log('失败的测试:');
      results.failed.forEach(f => {
        console.log(`  - ${f.test}: ${f.error}`);
      });
      console.log('');
    }
    
    if (results.passed.length === total) {
      console.log('🎉 所有测试通过！PostgreSQL 存储工作正常。\n');
    } else {
      console.log('⚠️  部分测试失败，请检查错误信息。\n');
    }
    
    // 4. 关闭服务器
    console.log('🛑 关闭服务器...');
    proc.kill('SIGTERM');
    await delay(1000);
    
    process.exit(results.failed.length > 0 ? 1 : 0);
    
  } catch (error) {
    console.error('\n💥 测试失败:', error.message);
    if (proc) {
      proc.kill('SIGTERM');
    }
    process.exit(1);
  }
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
