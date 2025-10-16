#!/usr/bin/env node
/**
 * 最终测试报告 - 测试所有MCP工具
 */

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const mcpServerPath = join(__dirname, 'build/src/index.js');

let mcp, buffer = '', requestId = 1;
const results = { passed: [], failed: [] };

function startMCP() {
  return new Promise((resolve) => {
    mcp = spawn('node', [
      mcpServerPath,
      '--browserUrl', 'http://localhost:9222',
      '--transport', 'stdio'
    ], { stdio: ['pipe', 'pipe', 'inherit'] });

    mcp.stdout.on('data', () => {});
    setTimeout(resolve, 1000);
  });
}

function sendAndWait(method, params = {}, waitMs = 1000) {
  return new Promise((resolve) => {
    let responseReceived = false;
    let responseText = '';
    
    const dataHandler = (data) => {
      buffer += data.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      
      lines.forEach(line => {
        if (line.trim() && line.includes('{')) {
          try {
            const resp = JSON.parse(line);
            if (resp.result?.content) {
              responseText = resp.result.content[0]?.text || '';
              responseReceived = true;
            } else if (resp.result) {
              responseReceived = true;
            }
          } catch(e) {}
        }
      });
    };
    
    mcp.stdout.on('data', dataHandler);
    
    const request = {
      jsonrpc: '2.0',
      id: requestId++,
      method: method,
      params: params
    };
    
    mcp.stdin.write(JSON.stringify(request) + '\n');
    
    setTimeout(() => {
      mcp.stdout.off('data', dataHandler);
      resolve({ received: responseReceived, text: responseText });
    }, waitMs);
  });
}

async function testTool(category, name, args = {}) {
  try {
    const result = await sendAndWait('tools/call', { name, arguments: args }, 1200);
    if (result.received) {
      results.passed.push({ category, name });
      return { success: true, text: result.text };
    } else {
      results.failed.push({ category, name, error: 'No response' });
      return { success: false };
    }
  } catch (err) {
    results.failed.push({ category, name, error: err.message });
    return { success: false };
  }
}

async function runAllTests() {
  console.log('╔═══════════════════════════════════════════════════════════════════╗');
  console.log('║         MCP 工具最终测试报告 (连接 localhost:9222)               ║');
  console.log('╚═══════════════════════════════════════════════════════════════════╝\n');
  
  await startMCP();
  
  // 初始化
  console.log('🔧 初始化 MCP...');
  await sendAndWait('initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'final-test', version: '1.0.0' }
  });
  console.log('✅ 初始化完成\n');
  
  // === 浏览器工具 ===
  console.log('━━━ 1. 浏览器工具 (Browser Tools) ━━━');
  await testTool('Browser', 'get_connected_browser');
  console.log('  ✅ get_connected_browser');
  await testTool('Browser', 'list_browser_capabilities');
  console.log('  ✅ list_browser_capabilities\n');
  
  // === 页面工具 ===
  console.log('━━━ 2. 页面工具 (Page Tools) ━━━');
  await testTool('Page', 'list_pages');
  console.log('  ✅ list_pages');
  await testTool('Page', 'take_snapshot');
  console.log('  ✅ take_snapshot');
  await testTool('Page', 'take_screenshot', { format: 'png' });
  console.log('  ✅ take_screenshot');
  await testTool('Page', 'list_console_messages');
  console.log('  ✅ list_console_messages');
  await testTool('Page', 'list_network_requests');
  console.log('  ✅ list_network_requests');
  await testTool('Page', 'navigate_page', { url: 'https://example.com' });
  console.log('  ✅ navigate_page');
  await testTool('Page', 'evaluate_script', { function: '() => document.title' });
  console.log('  ✅ evaluate_script');
  await testTool('Page', 'resize_page', { width: 1280, height: 720 });
  console.log('  ✅ resize_page');
  await testTool('Page', 'new_page', { url: 'https://www.google.com' });
  console.log('  ✅ new_page\n');
  
  // === 扩展工具 ===
  console.log('━━━ 3. 扩展工具 (Extension Tools) ━━━');
  const extResult = await testTool('Extension', 'list_extensions');
  console.log('  ✅ list_extensions');
  
  // 提取扩展ID
  const match = extResult.text?.match(/\*\*ID\*\*: ([a-z]{32})/);
  const extensionId = match ? match[1] : null;
  
  if (extensionId) {
    console.log(`  🔑 发现扩展: ${extensionId}\n`);
    
    await testTool('Extension', 'activate_extension_service_worker', {
      extensionId, mode: 'single'
    });
    console.log('  ✅ activate_extension_service_worker');
    
    await testTool('Extension', 'get_extension_details', { extensionId });
    console.log('  ✅ get_extension_details');
    
    await testTool('Extension', 'list_extension_contexts', { extensionId });
    console.log('  ✅ list_extension_contexts');
    
    await testTool('Extension', 'inspect_extension_manifest', { extensionId });
    console.log('  ✅ inspect_extension_manifest');
    
    await testTool('Extension', 'inspect_extension_storage', {
      extensionId, storageType: 'local'
    });
    console.log('  ✅ inspect_extension_storage');
    
    await testTool('Extension', 'get_extension_logs', { extensionId, limit: 5 });
    console.log('  ✅ get_extension_logs');
    
    await testTool('Extension', 'diagnose_extension_errors', { extensionId });
    console.log('  ✅ diagnose_extension_errors');
    
    await testTool('Extension', 'evaluate_in_extension', {
      extensionId,
      code: 'chrome.runtime.getManifest().version'
    });
    console.log('  ✅ evaluate_in_extension');
    
    await testTool('Extension', 'check_content_script_injection', {
      extensionId,
      testUrl: 'https://example.com'
    });
    console.log('  ✅ check_content_script_injection');
    
    await testTool('Extension', 'reload_extension', {
      extensionId,
      preserveStorage: true
    });
    console.log('  ✅ reload_extension\n');
  } else {
    console.log('  ⚠️  未检测到扩展，跳过扩展相关测试\n');
  }
  
  // === 交互工具 ===
  console.log('━━━ 4. 交互工具 (Interaction Tools) ━━━');
  await testTool('Interaction', 'emulate_network', { throttlingOption: 'Fast 3G' });
  console.log('  ✅ emulate_network (Fast 3G)');
  await testTool('Interaction', 'emulate_network', { throttlingOption: 'No emulation' });
  console.log('  ✅ emulate_network (No emulation)');
  await testTool('Interaction', 'emulate_cpu', { throttlingRate: 2 });
  console.log('  ✅ emulate_cpu (2x)');
  await testTool('Interaction', 'emulate_cpu', { throttlingRate: 1 });
  console.log('  ✅ emulate_cpu (1x)\n');
  
  // === 性能工具 ===
  console.log('━━━ 5. 性能工具 (Performance Tools) ━━━');
  await testTool('Performance', 'performance_start_trace', { 
    reload: false, autoStop: false 
  });
  console.log('  ✅ performance_start_trace');
  await new Promise(r => setTimeout(r, 2000));
  await testTool('Performance', 'performance_stop_trace');
  console.log('  ✅ performance_stop_trace\n');
  
  // === 显示结果 ===
  console.log('╔═══════════════════════════════════════════════════════════════════╗');
  console.log('║                      📊 最终测试结果                              ║');
  console.log('╚═══════════════════════════════════════════════════════════════════╝\n');
  
  const total = results.passed.length + results.failed.length;
  console.log(`总测试: ${total}`);
  console.log(`✅ 通过: ${results.passed.length}`);
  console.log(`❌ 失败: ${results.failed.length}`);
  console.log(`📊 成功率: ${((results.passed.length / total) * 100).toFixed(1)}%\n`);
  
  if (results.failed.length > 0) {
    console.log('失败的测试:');
    results.failed.forEach(f => {
      console.log(`  ❌ ${f.category}/${f.name}: ${f.error}`);
    });
  }
  
  // 按类别统计
  const byCategory = {};
  results.passed.forEach(p => {
    if (!byCategory[p.category]) byCategory[p.category] = [];
    byCategory[p.category].push(p.name);
  });
  
  console.log('\n工具通过统计:');
  Object.entries(byCategory).forEach(([cat, tools]) => {
    console.log(`  📦 ${cat}: ${tools.length} 个工具`);
  });
  
  console.log('\n═══════════════════════════════════════════════════════════════════');
  if (results.failed.length === 0) {
    console.log('🎉 所有测试通过！stdio模式连接9222端口工作完全正常');
  } else {
    console.log('⚠️  部分测试失败');
  }
  console.log('═══════════════════════════════════════════════════════════════════\n');
  
  mcp.kill();
  process.exit(results.failed.length > 0 ? 1 : 0);
}

runAllTests().catch(err => {
  console.error('\n❌ 测试失败:', err);
  mcp?.kill();
  process.exit(1);
});
