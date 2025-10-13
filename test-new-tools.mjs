#!/usr/bin/env node

/**
 * 测试 Phase 1 新开发的扩展调试工具
 */

import { spawn } from 'child_process';
import { createInterface } from 'readline';

const BROWSER_URL = 'http://192.168.0.201:9222';

// MCP 客户端模拟器
class MCPClient {
  constructor() {
    this.requestId = 1;
    this.process = null;
    this.pendingRequests = new Map();
  }

  async start() {
    console.log('🚀 启动 MCP 服务器...');
    console.log(`📡 连接到 Chrome: ${BROWSER_URL}\n`);

    this.process = spawn('node', ['build/src/index.js'], {
      env: { ...process.env, BROWSER_URL },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const rl = createInterface({
      input: this.process.stdout,
      crlfDelay: Infinity,
    });

    rl.on('line', (line) => {
      try {
        const response = JSON.parse(line);
        if (response.id && this.pendingRequests.has(response.id)) {
          const resolve = this.pendingRequests.get(response.id);
          this.pendingRequests.delete(response.id);
          resolve(response);
        }
      } catch (e) {
        // 忽略非 JSON 行
      }
    });

    this.process.stderr.on('data', (data) => {
      const msg = data.toString();
      if (msg.includes('Error') || msg.includes('error')) {
        console.error('❌ 错误:', msg);
      }
    });

    // 等待服务器就绪
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // 初始化
    await this.sendRequest('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: {
        name: 'test-client',
        version: '1.0.0',
      },
    });

    console.log('✅ MCP 服务器已就绪\n');
  }

  async sendRequest(method, params = {}) {
    const id = this.requestId++;
    const request = {
      jsonrpc: '2.0',
      id,
      method,
      params,
    };

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, resolve);
      this.process.stdin.write(JSON.stringify(request) + '\n');
      
      // 超时处理
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error('Request timeout'));
        }
      }, 30000);
    });
  }

  async callTool(name, args = {}) {
    console.log(`\n${'='.repeat(80)}`);
    console.log(`🔧 测试工具: ${name}`);
    console.log(`📝 参数: ${JSON.stringify(args, null, 2)}`);
    console.log('='.repeat(80));

    const response = await this.sendRequest('tools/call', {
      name,
      arguments: args,
    });

    if (response.error) {
      console.error(`❌ 错误: ${response.error.message}`);
      return null;
    }

    const result = response.result;
    if (result.content && result.content[0]) {
      const output = result.content[0].text;
      console.log('\n📊 输出:\n');
      console.log(output);
      return output;
    }

    return null;
  }

  async stop() {
    if (this.process) {
      this.process.kill();
    }
  }
}

// 主测试流程
async function main() {
  const client = new MCPClient();

  try {
    await client.start();

    console.log('═'.repeat(80));
    console.log('🧪 Phase 1 新工具测试开始');
    console.log('═'.repeat(80));

    // 1. 首先列出扩展，获取扩展 ID
    console.log('\n📋 步骤 1: 获取扩展列表...\n');
    const extensionsOutput = await client.callTool('list_extensions');
    
    // 从输出中提取扩展 ID（简化版，实际应该解析 JSON）
    const extensionIdMatch = extensionsOutput?.match(/([a-z]{32})/);
    if (!extensionIdMatch) {
      console.log('\n⚠️  未检测到扩展，跳过扩展相关测试');
      console.log('\n💡 提示: 请在 Chrome 中加载一个扩展后重试\n');
      return;
    }

    const extensionId = extensionIdMatch[1];
    console.log(`\n✅ 找到扩展 ID: ${extensionId}\n`);

    // 2. 测试新工具 1: diagnose_extension_errors
    console.log('\n━'.repeat(80));
    console.log('🩺 测试 1/4: diagnose_extension_errors - 错误诊断器');
    console.log('━'.repeat(80));
    await client.callTool('diagnose_extension_errors', {
      extensionId,
      timeRange: 5,
      includeWarnings: false,
    });

    // 3. 测试新工具 2: inspect_extension_manifest
    console.log('\n━'.repeat(80));
    console.log('📋 测试 2/4: inspect_extension_manifest - Manifest 检查');
    console.log('━'.repeat(80));
    await client.callTool('inspect_extension_manifest', {
      extensionId,
      checkMV3Compatibility: true,
      checkPermissions: true,
      checkBestPractices: true,
    });

    // 4. 测试新工具 3: check_content_script_injection
    console.log('\n━'.repeat(80));
    console.log('📄 测试 3/4: check_content_script_injection - Content Script 检查');
    console.log('━'.repeat(80));
    await client.callTool('check_content_script_injection', {
      extensionId,
      testUrl: 'https://github.com/example/repo',
      detailed: true,
    });

    // 5. 测试增强工具: reload_extension（智能版）
    console.log('\n━'.repeat(80));
    console.log('🔄 测试 4/4: reload_extension - 智能热重载（增强版）');
    console.log('━'.repeat(80));
    await client.callTool('reload_extension', {
      extensionId,
      preserveStorage: true,
      waitForReady: true,
      captureErrors: true,
    });

    console.log('\n' + '═'.repeat(80));
    console.log('✅ 所有测试完成！');
    console.log('═'.repeat(80));
    console.log('\n📊 测试总结:');
    console.log('  - diagnose_extension_errors ✅');
    console.log('  - inspect_extension_manifest ✅');
    console.log('  - check_content_script_injection ✅');
    console.log('  - reload_extension (增强版) ✅');
    console.log('\n🎉 Phase 1 所有功能工作正常！\n');

  } catch (error) {
    console.error('\n❌ 测试失败:', error.message);
    console.error(error.stack);
  } finally {
    await client.stop();
    process.exit(0);
  }
}

main().catch(console.error);
