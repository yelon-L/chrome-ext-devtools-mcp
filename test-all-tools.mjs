#!/usr/bin/env node
/**
 * 全面测试所有 MCP 工具
 * 特别关注 reload_extension 等可能卡住的工具
 */

import { spawn } from 'child_process';
import { setTimeout } from 'timers/promises';

const CHROME_URL = process.env.CHROME_URL || 'http://localhost:9222';
const TEST_TIMEOUT = parseInt(process.env.TEST_TIMEOUT || '30000'); // 30秒超时
const MODE = process.env.MODE || 'stdio'; // stdio, sse, streamable

console.log('╔═══════════════════════════════════════════════════════════════════╗');
console.log('║                  MCP 工具全面测试                                  ║');
console.log('╚═══════════════════════════════════════════════════════════════════╝\n');

console.log(`测试配置:`);
console.log(`  模式: ${MODE}`);
console.log(`  Chrome URL: ${CHROME_URL}`);
console.log(`  超时时间: ${TEST_TIMEOUT}ms`);
console.log(`  时间: ${new Date().toLocaleString('zh-CN')}\n`);

// 测试结果
const results = {
  passed: [],
  failed: [],
  timeout: [],
  error: [],
};

// 定义要测试的工具
const tools = [
  // 基础工具
  { name: 'list_extensions', args: {} },
  { name: 'browser_info', args: {} },
  
  // 标签页管理
  { name: 'list_tabs', args: {} },
  { name: 'get_tab_screenshot', args: { format: 'png', quality: 80 }, requiresTab: true },
  
  // 扩展工具（需要扩展ID）
  { name: 'list_extension_contexts', args: {}, requiresExtension: true },
  { name: 'activate_extension_service_worker', args: {}, requiresExtension: true },
  { name: 'get_extension_storage', args: { storageType: 'local' }, requiresExtension: true },
  { name: 'get_extension_logs', args: { capture: false }, requiresExtension: true },
  { name: 'diagnose_extension_errors', args: {}, requiresExtension: true },
  
  // 危险工具（可能卡住）
  { name: 'reload_extension', args: { preserveStorage: true, waitForReady: true, captureErrors: false }, requiresExtension: true, risky: true },
  { name: 'evaluate_in_extension', args: { code: 'chrome.runtime.id' }, requiresExtension: true, risky: true },
];

/**
 * 启动 MCP 服务器
 */
function startMCPServer() {
  const args = ['build/src/index.js', '--chrome-url', CHROME_URL];
  
  if (MODE === 'sse') {
    args.push('--transport', 'sse', '--port', '32123');
  } else if (MODE === 'streamable') {
    args.push('--transport', 'streamable', '--port', '32124');
  }
  
  const proc = spawn('node', args, {
    stdio: ['pipe', 'pipe', 'pipe'],
    cwd: process.cwd(),
  });
  
  return proc;
}

/**
 * 发送 JSON-RPC 请求
 */
async function sendRequest(proc, method, params = {}, id = 1) {
  return new Promise((resolve, reject) => {
    const request = {
      jsonrpc: '2.0',
      id,
      method,
      params,
    };
    
    let responseData = '';
    let timeoutId;
    let resolved = false;
    
    // 设置超时
    timeoutId = globalThis.setTimeout(() => {
      if (!resolved) {
        resolved = true;
        reject(new Error(`TIMEOUT: ${method} 超过 ${TEST_TIMEOUT}ms 未响应`));
      }
    }, TEST_TIMEOUT);
    
    // 监听响应
    const onData = (data) => {
      responseData += data.toString();
      
      // 尝试解析 JSON-RPC 响应
      const lines = responseData.split('\n');
      for (const line of lines) {
        if (line.trim() && line.includes('"jsonrpc"')) {
          try {
            const response = JSON.parse(line);
            if (response.id === id) {
              clearTimeout(timeoutId);
              proc.stdout.off('data', onData);
              if (!resolved) {
                resolved = true;
                resolve(response);
              }
            }
          } catch (e) {
            // 继续等待完整的 JSON
          }
        }
      }
    };
    
    proc.stdout.on('data', onData);
    
    // 发送请求
    proc.stdin.write(JSON.stringify(request) + '\n');
  });
}

/**
 * 初始化 MCP 服务器
 */
async function initialize(proc) {
  const response = await sendRequest(proc, 'initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'test-client', version: '1.0' },
  });
  
  if (response.error) {
    throw new Error(`Initialize failed: ${response.error.message}`);
  }
  
  // 发送 initialized 通知
  proc.stdin.write(JSON.stringify({
    jsonrpc: '2.0',
    method: 'notifications/initialized',
  }) + '\n');
  
  return response.result;
}

/**
 * 获取可用工具列表
 */
async function listTools(proc) {
  const response = await sendRequest(proc, 'tools/list', {});
  
  if (response.error) {
    throw new Error(`tools/list failed: ${response.error.message}`);
  }
  
  return response.result.tools;
}

/**
 * 调用工具
 */
async function callTool(proc, toolName, args) {
  const response = await sendRequest(proc, 'tools/call', {
    name: toolName,
    arguments: args,
  }, Date.now());
  
  return response;
}

/**
 * 获取扩展列表
 */
async function getExtensions(proc) {
  const response = await callTool(proc, 'list_extensions', {});
  if (response.error) {
    throw new Error(`list_extensions failed: ${response.error.message}`);
  }
  
  // 从响应中提取扩展信息
  const content = response.result?.content;
  if (!content || !Array.isArray(content)) {
    return [];
  }
  
  // 尝试从文本中提取扩展ID
  const text = content.map(c => c.text).join('\n');
  const extensionIds = [];
  const idMatch = text.match(/ID: ([a-z]{32})/g);
  if (idMatch) {
    idMatch.forEach(match => {
      const id = match.replace('ID: ', '');
      if (id.length === 32) {
        extensionIds.push(id);
      }
    });
  }
  
  return extensionIds;
}

/**
 * 获取标签页列表
 */
async function getTabs(proc) {
  const response = await callTool(proc, 'list_tabs', {});
  if (response.error) {
    return [];
  }
  
  const content = response.result?.content;
  if (!content || !Array.isArray(content)) {
    return [];
  }
  
  // 尝试从文本中提取标签页ID
  const text = content.map(c => c.text).join('\n');
  const tabIds = [];
  const idMatch = text.match(/ID: ([\w-]+)/g);
  if (idMatch) {
    idMatch.forEach(match => {
      const id = match.replace('ID: ', '');
      tabIds.push(id);
    });
  }
  
  return tabIds;
}

/**
 * 测试单个工具
 */
async function testTool(proc, tool, extensionId, tabId) {
  const toolName = tool.name;
  const args = { ...tool.args };
  
  // 添加必需的参数
  if (tool.requiresExtension && extensionId) {
    args.extensionId = extensionId;
  }
  if (tool.requiresTab && tabId) {
    args.tabId = tabId;
  }
  
  const startTime = Date.now();
  
  try {
    console.log(`  🔧 测试工具: ${toolName}${tool.risky ? ' ⚠️  (可能卡住)' : ''}`);
    
    const response = await callTool(proc, toolName, args);
    const duration = Date.now() - startTime;
    
    if (response.error) {
      console.log(`    ❌ 失败: ${response.error.message} (${duration}ms)`);
      results.failed.push({
        tool: toolName,
        error: response.error.message,
        duration,
        args,
      });
    } else {
      console.log(`    ✅ 成功 (${duration}ms)`);
      results.passed.push({
        tool: toolName,
        duration,
        args,
      });
    }
  } catch (error) {
    const duration = Date.now() - startTime;
    
    if (error.message.includes('TIMEOUT')) {
      console.log(`    ⏱️  超时: ${duration}ms (超过${TEST_TIMEOUT}ms)`);
      results.timeout.push({
        tool: toolName,
        error: error.message,
        duration,
        args,
      });
    } else {
      console.log(`    💥 异常: ${error.message} (${duration}ms)`);
      results.error.push({
        tool: toolName,
        error: error.message,
        duration,
        args,
      });
    }
  }
}

/**
 * 主测试流程
 */
async function main() {
  let proc;
  
  try {
    // 1. 启动 MCP 服务器
    console.log('📋 步骤 1: 启动 MCP 服务器\n');
    proc = startMCPServer();
    
    // 等待服务器启动
    await setTimeout(2000);
    console.log('  ✅ 服务器已启动\n');
    
    // 2. 初始化
    console.log('📋 步骤 2: 初始化 MCP 协议\n');
    const serverInfo = await initialize(proc);
    console.log(`  ✅ 协议初始化成功`);
    console.log(`     服务器: ${serverInfo.serverInfo.name} v${serverInfo.serverInfo.version}\n`);
    
    // 3. 获取工具列表
    console.log('📋 步骤 3: 获取可用工具\n');
    const availableTools = await listTools(proc);
    console.log(`  ✅ 找到 ${availableTools.length} 个工具\n`);
    
    // 4. 获取测试资源（扩展和标签页）
    console.log('📋 步骤 4: 获取测试资源\n');
    
    const extensionIds = await getExtensions(proc);
    console.log(`  📦 找到 ${extensionIds.length} 个扩展`);
    if (extensionIds.length > 0) {
      console.log(`     第一个扩展ID: ${extensionIds[0]}`);
    }
    
    const tabIds = await getTabs(proc);
    console.log(`  📄 找到 ${tabIds.length} 个标签页`);
    if (tabIds.length > 0) {
      console.log(`     第一个标签页ID: ${tabIds[0]}`);
    }
    console.log('');
    
    // 5. 测试所有工具
    console.log('📋 步骤 5: 测试所有工具\n');
    
    for (const tool of tools) {
      // 跳过需要扩展但没有扩展的工具
      if (tool.requiresExtension && extensionIds.length === 0) {
        console.log(`  ⏭️  跳过 ${tool.name} (需要扩展)\n`);
        continue;
      }
      
      // 跳过需要标签页但没有标签页的工具
      if (tool.requiresTab && tabIds.length === 0) {
        console.log(`  ⏭️  跳过 ${tool.name} (需要标签页)\n`);
        continue;
      }
      
      await testTool(proc, tool, extensionIds[0], tabIds[0]);
      console.log('');
      
      // 危险工具测试后等待一下
      if (tool.risky) {
        await setTimeout(1000);
      }
    }
    
    // 6. 打印测试报告
    console.log('\n═══════════════════════════════════════════════════════════════════');
    console.log('测试报告');
    console.log('═══════════════════════════════════════════════════════════════════\n');
    
    const total = results.passed.length + results.failed.length + results.timeout.length + results.error.length;
    
    console.log(`总测试数: ${total}`);
    console.log(`✅ 通过: ${results.passed.length}`);
    console.log(`❌ 失败: ${results.failed.length}`);
    console.log(`⏱️  超时: ${results.timeout.length}`);
    console.log(`💥 异常: ${results.error.length}`);
    console.log('');
    
    // 详细失败报告
    if (results.failed.length > 0) {
      console.log('失败的工具:');
      results.failed.forEach(r => {
        console.log(`  - ${r.tool}: ${r.error} (${r.duration}ms)`);
      });
      console.log('');
    }
    
    // 详细超时报告
    if (results.timeout.length > 0) {
      console.log('⚠️  超时的工具 (可能卡住):');
      results.timeout.forEach(r => {
        console.log(`  - ${r.tool}: ${r.error}`);
        console.log(`    参数: ${JSON.stringify(r.args)}`);
      });
      console.log('');
    }
    
    // 详细异常报告
    if (results.error.length > 0) {
      console.log('异常的工具:');
      results.error.forEach(r => {
        console.log(`  - ${r.tool}: ${r.error} (${r.duration}ms)`);
      });
      console.log('');
    }
    
    // 性能统计
    if (results.passed.length > 0) {
      const avgDuration = results.passed.reduce((sum, r) => sum + r.duration, 0) / results.passed.length;
      const slowest = results.passed.reduce((max, r) => r.duration > max.duration ? r : max);
      
      console.log('性能统计 (通过的工具):');
      console.log(`  平均响应时间: ${avgDuration.toFixed(0)}ms`);
      console.log(`  最慢的工具: ${slowest.tool} (${slowest.duration}ms)`);
      console.log('');
    }
    
    // 7. 清理
    proc.kill('SIGTERM');
    
    // 返回退出码
    process.exit(results.timeout.length > 0 || results.error.length > 0 ? 1 : 0);
    
  } catch (error) {
    console.error('\n💥 测试失败:', error.message);
    if (proc) {
      proc.kill('SIGTERM');
    }
    process.exit(1);
  }
}

// 运行测试
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
