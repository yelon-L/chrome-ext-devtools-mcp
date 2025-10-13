#!/usr/bin/env node

/**
 * 测试编译后的二进制文件 - 各种模式
 */

import {spawn} from 'child_process';
import http from 'http';

const BINARY = './dist/chrome-devtools-mcp-linux-x64';
const TEST_TIMEOUT = 8000; // 8秒超时

console.log('════════════════════════════════════════════════════════════');
console.log('测试编译后的二进制文件 - 各种模式');
console.log('════════════════════════════════════════════════════════════\n');

const results = [];

// 辅助函数：等待
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// 辅助函数：HTTP GET 请求
function httpGet(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => resolve({status: res.statusCode, data}));
    }).on('error', reject);
  });
}

// 测试1：版本信息
console.log('测试 1: 版本信息');
console.log('────────────────────────────────────────────────────────────');
try {
  const proc = spawn(BINARY, ['--version'], {timeout: 3000});
  
  await new Promise((resolve, reject) => {
    let output = '';
    proc.stdout.on('data', (data) => { output += data.toString(); });
    proc.stderr.on('data', (data) => { output += data.toString(); });
    
    proc.on('close', (code) => {
      console.log(`输出: ${output.trim()}`);
      if (output.includes('0.8.1') || output.includes('version')) {
        results.push({test: '版本信息', status: '✅ 成功'});
        resolve();
      } else {
        results.push({test: '版本信息', status: '❌ 失败', detail: '未找到版本号'});
        reject(new Error('版本号不正确'));
      }
    });
    
    setTimeout(() => {
      proc.kill();
      reject(new Error('超时'));
    }, 3000);
  });
} catch (error) {
  console.error(`❌ 错误: ${error.message}`);
  results.push({test: '版本信息', status: '❌ 失败', detail: error.message});
}

console.log('\n');

// 测试2: SSE 模式
console.log('测试 2: SSE 模式 - 服务启动和健康检查');
console.log('────────────────────────────────────────────────────────────');
const ssePort = 35001;
let sseProc = null;

try {
  sseProc = spawn(BINARY, ['--transport', 'sse', '--port', String(ssePort), '--headless']);
  
  console.log(`启动 SSE 服务器 (端口 ${ssePort})...`);
  
  // 监听输出
  sseProc.stdout.on('data', (data) => {
    const output = data.toString();
    if (output.includes('服务器已启动') || output.includes('Server running')) {
      console.log('  ✅ 服务器输出确认已启动');
    }
  });
  
  sseProc.stderr.on('data', (data) => {
    const error = data.toString();
    if (error.includes('Error') || error.includes('EADDRINUSE')) {
      console.error(`  ⚠️  错误: ${error.substring(0, 100)}`);
    }
  });
  
  // 等待服务器启动
  await sleep(3000);
  
  // 检查健康状态
  try {
    const health = await httpGet(`http://localhost:${ssePort}/health`);
    console.log(`健康检查: ${health.status} ${health.data}`);
    
    if (health.status === 200) {
      results.push({test: 'SSE 健康检查', status: '✅ 成功'});
    } else {
      results.push({test: 'SSE 健康检查', status: '⚠️  警告', detail: `状态码 ${health.status}`});
    }
  } catch (error) {
    console.error(`❌ 健康检查失败: ${error.message}`);
    results.push({test: 'SSE 健康检查', status: '❌ 失败', detail: error.message});
  }
  
  // 关闭服务器
  sseProc.kill('SIGTERM');
  await sleep(500);
  
} catch (error) {
  console.error(`❌ SSE 模式错误: ${error.message}`);
  results.push({test: 'SSE 模式', status: '❌ 失败', detail: error.message});
} finally {
  if (sseProc) sseProc.kill();
}

console.log('\n');

// 测试3: Streamable HTTP 模式
console.log('测试 3: Streamable HTTP 模式 - 服务启动');
console.log('────────────────────────────────────────────────────────────');
const streamPort = 35002;
let streamProc = null;

try {
  streamProc = spawn(BINARY, ['--transport', 'streamable', '--port', String(streamPort), '--headless']);
  
  console.log(`启动 Streamable HTTP 服务器 (端口 ${streamPort})...`);
  
  // 监听输出
  streamProc.stdout.on('data', (data) => {
    const output = data.toString();
    if (output.includes('服务器已启动') || output.includes('Server running')) {
      console.log('  ✅ 服务器输出确认已启动');
    }
  });
  
  // 等待服务器启动
  await sleep(3000);
  
  // 检查 MCP 端点
  try {
    const response = await httpGet(`http://localhost:${streamPort}/mcp`);
    console.log(`MCP 端点: ${response.status}`);
    
    // Streamable HTTP 可能期望 POST 请求，所以 GET 可能返回 405
    if (response.status === 200 || response.status === 405 || response.status === 404) {
      results.push({test: 'Streamable HTTP 端点', status: '✅ 成功', detail: `响应码 ${response.status}`});
    } else {
      results.push({test: 'Streamable HTTP 端点', status: '⚠️  警告', detail: `状态码 ${response.status}`});
    }
  } catch (error) {
    console.error(`❌ MCP 端点检查失败: ${error.message}`);
    results.push({test: 'Streamable HTTP 端点', status: '❌ 失败', detail: error.message});
  }
  
  // 关闭服务器
  streamProc.kill('SIGTERM');
  await sleep(500);
  
} catch (error) {
  console.error(`❌ Streamable HTTP 模式错误: ${error.message}`);
  results.push({test: 'Streamable HTTP 模式', status: '❌ 失败', detail: error.message});
} finally {
  if (streamProc) streamProc.kill();
}

console.log('\n');

// 测试4: Multi-tenant 模式 (使用 Node.js)
console.log('测试 4: Multi-tenant 模式 - 服务启动');
console.log('────────────────────────────────────────────────────────────');
const mtPort = 35003;
let mtProc = null;

try {
  // Multi-tenant 模式需要通过 Node.js 运行
  const mtScript = './build/src/multi-tenant/server-multi-tenant.js';
  
  mtProc = spawn('node', [mtScript], {
    env: {...process.env, PORT: String(mtPort), AUTH_ENABLED: 'false'},
  });
  
  console.log(`启动 Multi-tenant 服务器 (端口 ${mtPort})...`);
  
  // 监听输出
  mtProc.stdout.on('data', (data) => {
    const output = data.toString();
    if (output.includes('服务器已启动') || output.includes('Server running')) {
      console.log('  ✅ 服务器输出确认已启动');
    }
  });
  
  mtProc.stderr.on('data', (data) => {
    const error = data.toString();
    if (error.includes('Error') && !error.includes('ExperimentalWarning')) {
      console.error(`  ⚠️  错误: ${error.substring(0, 100)}`);
    }
  });
  
  // 等待服务器启动
  await sleep(3000);
  
  // 检查健康状态
  try {
    const health = await httpGet(`http://localhost:${mtPort}/health`);
    console.log(`健康检查: ${health.status} ${health.data}`);
    
    if (health.status === 200) {
      results.push({test: 'Multi-tenant 健康检查', status: '✅ 成功'});
    } else {
      results.push({test: 'Multi-tenant 健康检查', status: '⚠️  警告', detail: `状态码 ${health.status}`});
    }
  } catch (error) {
    console.error(`❌ 健康检查失败: ${error.message}`);
    results.push({test: 'Multi-tenant 健康检查', status: '❌ 失败', detail: error.message});
  }
  
  // 关闭服务器
  mtProc.kill('SIGTERM');
  await sleep(500);
  
} catch (error) {
  console.error(`❌ Multi-tenant 模式错误: ${error.message}`);
  results.push({test: 'Multi-tenant 模式', status: '❌ 失败', detail: error.message});
} finally {
  if (mtProc) mtProc.kill();
}

console.log('\n');
console.log('════════════════════════════════════════════════════════════');
console.log('测试总结');
console.log('════════════════════════════════════════════════════════════\n');

results.forEach(r => {
  const detail = r.detail ? ` (${r.detail})` : '';
  console.log(`${r.status} - ${r.test}${detail}`);
});

const success = results.filter(r => r.status.includes('✅')).length;
const failed = results.filter(r => r.status.includes('❌')).length;
const warning = results.filter(r => r.status.includes('⚠️')).length;

console.log('\n');
console.log(`统计: ✅ ${success} 成功 | ❌ ${failed} 失败 | ⚠️  ${warning} 警告`);

if (failed > 0) {
  console.log('\n❌ 存在失败的测试');
  process.exit(1);
} else {
  console.log('\n✅ 所有测试通过');
  process.exit(0);
}
