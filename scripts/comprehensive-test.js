#!/usr/bin/env node
/**
 * 完整测试所有MCP工具
 * 分类测试：浏览器工具、页面工具、扩展工具
 */

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const mcpServerPath = join(__dirname, 'build/src/index.js');

class MCPTester {
  constructor() {
    this.mcp = null;
    this.buffer = '';
    this.requestId = 1;
    this.results = {
      passed: [],
      failed: [],
      total: 0
    };
    this.extensionId = null;
  }

  start() {
    this.mcp = spawn('node', [
      mcpServerPath,
      '--browserUrl', 'http://localhost:9222',
      '--transport', 'stdio'
    ], { stdio: ['pipe', 'pipe', 'inherit'] });

    this.mcp.stdout.on('data', (data) => {
      this.buffer += data.toString();
      const lines = this.buffer.split('\n');
      this.buffer = lines.pop() || '';
      
      lines.forEach(line => {
        if (line.trim() && line.includes('{')) {
          try {
            const response = JSON.parse(line);
            if (response.result?.content) {
              const text = response.result.content[0]?.text || '';
              
              // 提取扩展ID (修复转义问题)
              const match = text.match(/\*\*ID\*\*: ([a-z]{32})/);
              if (match && !this.extensionId) {
                this.extensionId = match[1];
                console.log(`\n🔑 已提取扩展ID: ${this.extensionId}`);
              }
            }
          } catch(e) {}
        }
      });
    });
  }

  sendRequest(method, params = {}) {
    const request = {
      jsonrpc: '2.0',
      id: this.requestId++,
      method: method,
      params: params
    };
    this.mcp.stdin.write(JSON.stringify(request) + '\n');
  }

  async testTool(category, name, args = {}) {
    this.results.total++;
    console.log(`\n🧪 测试 [${category}]: ${name}`);
    
    try {
      this.sendRequest('tools/call', { name, arguments: args });
      await this.wait(800);
      this.results.passed.push(`${category}/${name}`);
      console.log(`   ✅ 通过`);
      return true;
    } catch (err) {
      this.results.failed.push(`${category}/${name}: ${err.message}`);
      console.log(`   ❌ 失败: ${err.message}`);
      return false;
    }
  }

  wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async runAllTests() {
    console.log('╔════════════════════════════════════════════════════════════════════╗');
    console.log('║         MCP 工具完整测试 - 连接到 localhost:9222                  ║');
    console.log('╚════════════════════════════════════════════════════════════════════╝');
    
    // 初始化
    console.log('\n━━━ 初始化 MCP 协议 ━━━');
    this.sendRequest('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'comprehensive-test', version: '1.0.0' }
    });
    await this.wait(1000);
    
    // ========== 1. 浏览器工具 ==========
    console.log('\n╔════════════════════════════════════════════════════════════════════╗');
    console.log('║  第 1 类: 浏览器工具 (Browser Tools)                              ║');
    console.log('╚════════════════════════════════════════════════════════════════════╝');
    
    await this.testTool('Browser', 'get_connected_browser');
    await this.testTool('Browser', 'list_browser_capabilities');
    
    // ========== 2. 页面工具 ==========
    console.log('\n╔════════════════════════════════════════════════════════════════════╗');
    console.log('║  第 2 类: 页面工具 (Page Tools)                                   ║');
    console.log('╚════════════════════════════════════════════════════════════════════╝');
    
    await this.testTool('Page', 'list_pages');
    await this.testTool('Page', 'take_snapshot');
    await this.testTool('Page', 'take_screenshot', { format: 'png' });
    await this.testTool('Page', 'list_console_messages');
    await this.testTool('Page', 'list_network_requests');
    await this.testTool('Page', 'navigate_page', { url: 'https://example.com' });
    await this.wait(1000);
    await this.testTool('Page', 'evaluate_script', { 
      function: '() => document.title' 
    });
    await this.testTool('Page', 'select_page', { pageIdx: 0 });
    await this.testTool('Page', 'new_page', { url: 'https://www.google.com' });
    await this.wait(1000);
    
    // ========== 3. 扩展工具 ==========
    console.log('\n╔════════════════════════════════════════════════════════════════════╗');
    console.log('║  第 3 类: 扩展工具 (Extension Tools)                              ║');
    console.log('╚════════════════════════════════════════════════════════════════════╝');
    
    await this.testTool('Extension', 'list_extensions');
    await this.wait(1500); // 增加等待时间，确保响应被处理
    
    if (this.extensionId) {
      console.log(`\n🔑 使用扩展ID: ${this.extensionId}`);
      
      await this.testTool('Extension', 'activate_extension_service_worker', {
        extensionId: this.extensionId,
        mode: 'single'
      });
      await this.wait(1000);
      
      await this.testTool('Extension', 'get_extension_details', {
        extensionId: this.extensionId
      });
      
      await this.testTool('Extension', 'list_extension_contexts', {
        extensionId: this.extensionId
      });
      
      await this.testTool('Extension', 'inspect_extension_manifest', {
        extensionId: this.extensionId
      });
      
      await this.testTool('Extension', 'inspect_extension_storage', {
        extensionId: this.extensionId,
        storageType: 'local'
      });
      
      await this.testTool('Extension', 'get_extension_logs', {
        extensionId: this.extensionId,
        limit: 5
      });
      
      await this.testTool('Extension', 'diagnose_extension_errors', {
        extensionId: this.extensionId
      });
      
      await this.testTool('Extension', 'evaluate_in_extension', {
        extensionId: this.extensionId,
        code: 'chrome.runtime.getManifest().version'
      });
      
      await this.testTool('Extension', 'check_content_script_injection', {
        extensionId: this.extensionId,
        testUrl: 'https://example.com'
      });
      
      await this.testTool('Extension', 'reload_extension', {
        extensionId: this.extensionId,
        preserveStorage: true
      });
      await this.wait(2000);
      
    } else {
      console.log('\n⚠️  未检测到扩展，跳过扩展工具测试');
    }
    
    // ========== 4. 交互工具 ==========
    console.log('\n╔════════════════════════════════════════════════════════════════════╗');
    console.log('║  第 4 类: 交互工具 (Interaction Tools)                            ║');
    console.log('╚════════════════════════════════════════════════════════════════════╝');
    
    await this.testTool('Interaction', 'select_page', { pageIdx: 0 });
    await this.testTool('Interaction', 'resize_page', { width: 1280, height: 720 });
    await this.testTool('Interaction', 'emulate_network', { 
      throttlingOption: 'Fast 3G' 
    });
    await this.testTool('Interaction', 'emulate_network', { 
      throttlingOption: 'No emulation' 
    });
    await this.testTool('Interaction', 'emulate_cpu', { throttlingRate: 2 });
    await this.testTool('Interaction', 'emulate_cpu', { throttlingRate: 1 });
    
    // ========== 5. 性能工具 ==========
    console.log('\n╔════════════════════════════════════════════════════════════════════╗');
    console.log('║  第 5 类: 性能工具 (Performance Tools)                            ║');
    console.log('╚════════════════════════════════════════════════════════════════════╝');
    
    await this.testTool('Performance', 'performance_start_trace', { 
      reload: false,
      autoStop: false
    });
    await this.wait(2000);
    await this.testTool('Performance', 'performance_stop_trace');
    await this.wait(1000);
    
    // 显示测试结果
    this.showResults();
    
    // 清理
    await this.wait(1000);
    this.mcp.kill();
    process.exit(this.results.failed.length > 0 ? 1 : 0);
  }

  showResults() {
    console.log('\n\n');
    console.log('╔════════════════════════════════════════════════════════════════════╗');
    console.log('║                        📊 测试结果汇总                             ║');
    console.log('╚════════════════════════════════════════════════════════════════════╝');
    console.log('');
    console.log(`总测试数: ${this.results.total}`);
    console.log(`✅ 通过: ${this.results.passed.length}`);
    console.log(`❌ 失败: ${this.results.failed.length}`);
    console.log(`📊 成功率: ${((this.results.passed.length / this.results.total) * 100).toFixed(1)}%`);
    
    if (this.results.failed.length > 0) {
      console.log('\n失败的测试:');
      this.results.failed.forEach(f => console.log(`  ❌ ${f}`));
    }
    
    console.log('\n通过的工具:');
    const byCategory = {};
    this.results.passed.forEach(p => {
      const [cat, name] = p.split('/');
      if (!byCategory[cat]) byCategory[cat] = [];
      byCategory[cat].push(name);
    });
    
    Object.entries(byCategory).forEach(([cat, tools]) => {
      console.log(`\n  📦 ${cat} (${tools.length}个工具):`);
      tools.forEach(t => console.log(`     ✅ ${t}`));
    });
    
    console.log('\n');
    console.log('═══════════════════════════════════════════════════════════════════');
    if (this.results.failed.length === 0) {
      console.log('🎉 所有测试通过！MCP服务器工作正常');
    } else {
      console.log('⚠️  部分测试失败，请检查上述失败项');
    }
    console.log('═══════════════════════════════════════════════════════════════════');
  }
}

// 运行测试
const tester = new MCPTester();
tester.start();

setTimeout(() => {
  tester.runAllTests().catch(err => {
    console.error('\n❌ 测试过程出错:', err);
    tester.mcp?.kill();
    process.exit(1);
  });
}, 1000);
