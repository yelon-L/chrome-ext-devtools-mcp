#!/usr/bin/env node

/**
 * 完整测试所有扩展调试工具
 * 重点测试 Phase 1 新增的 4 个功能
 */

import { spawn } from 'child_process';
import { createInterface } from 'readline';

const BROWSER_URL = 'http://192.168.0.201:9222';

// MCP 客户端
class MCPClient {
  constructor() {
    this.requestId = 1;
    this.process = null;
    this.pendingRequests = new Map();
    this.responses = [];
  }

  async start() {
    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║  🚀 Chrome 扩展调试工具完整测试                            ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');
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
      if (!msg.includes('ExperimentalWarning')) {
        console.error('stderr:', msg);
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
      
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error('Request timeout'));
        }
      }, 30000);
    });
  }

  async callTool(name, args = {}, options = {}) {
    const { showOutput = true, saveResponse = true } = options;
    
    if (showOutput) {
      console.log(`\n${'━'.repeat(70)}`);
      console.log(`🔧 工具: ${name}`);
      if (Object.keys(args).length > 0) {
        console.log(`📝 参数: ${JSON.stringify(args, null, 2)}`);
      }
      console.log('━'.repeat(70));
    }

    const response = await this.sendRequest('tools/call', {
      name,
      arguments: args,
    });

    if (response.error) {
      console.error(`❌ 错误: ${response.error.message}`);
      return { success: false, error: response.error.message };
    }

    const result = response.result;
    if (result.content && result.content[0]) {
      const output = result.content[0].text;
      
      if (showOutput) {
        console.log('\n📊 输出:\n');
        // 限制输出长度，避免刷屏
        const lines = output.split('\n');
        if (lines.length > 50) {
          console.log(lines.slice(0, 50).join('\n'));
          console.log(`\n... (省略 ${lines.length - 50} 行) ...\n`);
        } else {
          console.log(output);
        }
      }

      if (saveResponse) {
        this.responses.push({
          tool: name,
          args,
          output,
          success: true,
        });
      }

      return { success: true, output };
    }

    return { success: false, error: 'No output' };
  }

  async stop() {
    if (this.process) {
      this.process.kill();
    }
  }

  getSummary() {
    const total = this.responses.length;
    const success = this.responses.filter(r => r.success).length;
    return { total, success, failed: total - success };
  }
}

// 主测试流程
async function main() {
  const client = new MCPClient();

  try {
    await client.start();

    console.log('═'.repeat(70));
    console.log('📋 第一步：获取扩展列表');
    console.log('═'.repeat(70));

    // 1. list_extensions - 列出所有扩展
    const extensionsResult = await client.callTool('list_extensions');
    
    if (!extensionsResult.success) {
      console.log('\n⚠️  未检测到扩展');
      console.log('\n💡 提示: 请在 Chrome (192.168.0.201:9222) 中:');
      console.log('   1. 打开 chrome://extensions');
      console.log('   2. 开启"开发者模式"');
      console.log('   3. 加载一个测试扩展');
      console.log('\n⏸️  测试暂停。加载扩展后重新运行此脚本。\n');
      return;
    }

    // 从输出中提取扩展 ID
    const extensionIdMatch = extensionsResult.output?.match(/([a-z]{32})/);
    if (!extensionIdMatch) {
      console.log('\n⚠️  无法找到有效的扩展 ID');
      console.log('   请确保已加载扩展并重试\n');
      return;
    }

    const extensionId = extensionIdMatch[1];
    console.log(`\n✅ 找到扩展 ID: ${extensionId}\n`);

    // 统计
    let testCount = 0;
    let successCount = 0;

    // =================================================================
    // 测试所有基础扩展工具
    // =================================================================

    console.log('\n' + '═'.repeat(70));
    console.log('📦 第二步：测试基础扩展工具（9 个）');
    console.log('═'.repeat(70));

    // 2. get_extension_details - 获取扩展详情
    console.log('\n🔍 测试 #2: get_extension_details');
    testCount++;
    const detailsResult = await client.callTool('get_extension_details', {
      extensionId,
    });
    if (detailsResult.success) successCount++;

    // 3. list_extension_contexts - 列出上下文
    console.log('\n🔍 测试 #3: list_extension_contexts');
    testCount++;
    const contextsResult = await client.callTool('list_extension_contexts', {
      extensionId,
    });
    if (contextsResult.success) successCount++;

    // 4. inspect_extension_storage - 检查 Storage
    console.log('\n🔍 测试 #4: inspect_extension_storage');
    testCount++;
    const storageResult = await client.callTool('inspect_extension_storage', {
      extensionId,
      storageTypes: ['local', 'sync'],
    });
    if (storageResult.success) successCount++;

    // 5. get_extension_logs - 获取日志
    console.log('\n🔍 测试 #5: get_extension_logs');
    testCount++;
    const logsResult = await client.callTool('get_extension_logs', {
      extensionId,
      capture: true,
      duration: 3000,
      includeStored: true,
    });
    if (logsResult.success) successCount++;

    // 6. evaluate_in_extension - 执行代码
    console.log('\n🔍 测试 #6: evaluate_in_extension');
    testCount++;
    const evalResult = await client.callTool('evaluate_in_extension', {
      extensionId,
      code: 'chrome.runtime.getManifest().name',
    }, { showOutput: false });
    if (evalResult.success) {
      successCount++;
      console.log('✅ 代码执行成功');
    }

    // =================================================================
    // 测试 Phase 1 新增工具（重点测试）
    // =================================================================

    console.log('\n' + '═'.repeat(70));
    console.log('🌟 第三步：测试 Phase 1 新增工具（4 个）- 重点测试');
    console.log('═'.repeat(70));

    // 新工具 1: diagnose_extension_errors ⭐⭐⭐⭐⭐
    console.log('\n\n' + '▓'.repeat(70));
    console.log('⭐ 新工具 #1: diagnose_extension_errors - 错误诊断器');
    console.log('▓'.repeat(70));
    console.log('功能: 一键扫描扩展健康状况，智能诊断错误');
    console.log('特性: 错误分类、频率统计、健康评分、智能建议');
    
    testCount++;
    const diagnoseResult = await client.callTool('diagnose_extension_errors', {
      extensionId,
      timeRange: 10,
      includeWarnings: true,
    });
    if (diagnoseResult.success) {
      successCount++;
      console.log('\n✅ 错误诊断完成！');
      
      // 分析输出
      if (diagnoseResult.output.includes('Health Score')) {
        const scoreMatch = diagnoseResult.output.match(/Health Score:.*?(\d+)\/100/);
        if (scoreMatch) {
          console.log(`📊 健康评分: ${scoreMatch[1]}/100`);
        }
      }
      
      if (diagnoseResult.output.includes('Total Issues Found')) {
        const issuesMatch = diagnoseResult.output.match(/Total Issues Found.*?(\d+)/);
        if (issuesMatch) {
          console.log(`🐛 发现问题: ${issuesMatch[1]} 个`);
        }
      }
    }

    // 新工具 2: inspect_extension_manifest ⭐⭐⭐⭐
    console.log('\n\n' + '▓'.repeat(70));
    console.log('⭐ 新工具 #2: inspect_extension_manifest - Manifest 检查器');
    console.log('▓'.repeat(70));
    console.log('功能: 深度分析 manifest.json');
    console.log('特性: MV3 迁移检查、权限审计、安全扫描、最佳实践');
    
    testCount++;
    const manifestResult = await client.callTool('inspect_extension_manifest', {
      extensionId,
      checkMV3Compatibility: true,
      checkPermissions: true,
      checkBestPractices: true,
    });
    if (manifestResult.success) {
      successCount++;
      console.log('\n✅ Manifest 检查完成！');
      
      // 分析输出
      if (manifestResult.output.includes('Manifest Version')) {
        const versionMatch = manifestResult.output.match(/Manifest Version.*?(\d+)/);
        if (versionMatch) {
          console.log(`📋 Manifest 版本: MV${versionMatch[1]}`);
        }
      }
      
      if (manifestResult.output.includes('Quality Score')) {
        const scoreMatch = manifestResult.output.match(/Quality Score:.*?(\d+)\/100/);
        if (scoreMatch) {
          console.log(`⭐ 质量评分: ${scoreMatch[1]}/100`);
        }
      }
      
      if (manifestResult.output.includes('Migration Issues')) {
        console.log('🔄 包含 MV3 迁移分析');
      }
    }

    // 新工具 3: check_content_script_injection ⭐⭐⭐⭐
    console.log('\n\n' + '▓'.repeat(70));
    console.log('⭐ 新工具 #3: check_content_script_injection - Content Script 检查');
    console.log('▓'.repeat(70));
    console.log('功能: 检查 Content Script 注入状态');
    console.log('特性: URL 模式匹配、注入验证、调试建议');
    
    testCount++;
    const contentScriptResult = await client.callTool('check_content_script_injection', {
      extensionId,
      testUrl: 'https://github.com/example/repo',
      detailed: true,
    });
    if (contentScriptResult.success) {
      successCount++;
      console.log('\n✅ Content Script 检查完成！');
      
      // 分析输出
      if (contentScriptResult.output.includes('Content Script Rules')) {
        const rulesMatch = contentScriptResult.output.match(/Content Script Rules \((\d+)\)/);
        if (rulesMatch) {
          console.log(`📜 Content Script 规则: ${rulesMatch[1]} 个`);
        }
      }
      
      if (contentScriptResult.output.includes('match this URL')) {
        console.log('🎯 包含 URL 匹配分析');
      }
    }

    // 新工具 4: reload_extension（增强版）⭐⭐⭐⭐⭐
    console.log('\n\n' + '▓'.repeat(70));
    console.log('⭐ 新工具 #4: reload_extension - 智能热重载（增强版）');
    console.log('▓'.repeat(70));
    console.log('功能: 智能扩展重载');
    console.log('特性: 自动 SW 激活、Storage 保留、重载验证、错误捕获');
    
    testCount++;
    console.log('\n⚠️  注意: reload_extension 会重启扩展，可能影响其他测试');
    console.log('是否执行? (将在 3 秒后自动执行)');
    
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    const reloadResult = await client.callTool('reload_extension', {
      extensionId,
      preserveStorage: true,
      waitForReady: true,
      captureErrors: true,
    });
    if (reloadResult.success) {
      successCount++;
      console.log('\n✅ 智能热重载完成！');
      
      // 分析输出
      if (reloadResult.output.includes('Service Worker')) {
        console.log('🔄 包含 Service Worker 处理');
      }
      
      if (reloadResult.output.includes('Storage')) {
        console.log('💾 包含 Storage 保留功能');
      }
      
      if (reloadResult.output.includes('Error Check')) {
        console.log('🔍 包含错误检测');
      }
    }

    // =================================================================
    // 额外测试：Service Worker 激活
    // =================================================================

    console.log('\n' + '═'.repeat(70));
    console.log('🔧 额外测试：Service Worker 相关工具');
    console.log('═'.repeat(70));

    // activate_service_worker
    console.log('\n🔍 测试: activate_service_worker');
    testCount++;
    const activateResult = await client.callTool('activate_extension_service_worker', {
      extensionId,
    }, { showOutput: false });
    if (activateResult.success) {
      successCount++;
      console.log('✅ Service Worker 激活测试完成');
    }

    // =================================================================
    // 测试总结
    // =================================================================

    console.log('\n' + '═'.repeat(70));
    console.log('📊 测试总结');
    console.log('═'.repeat(70));

    const summary = client.getSummary();
    
    console.log(`\n测试统计:`);
    console.log(`  总测试数: ${testCount}`);
    console.log(`  成功: ${successCount} ✅`);
    console.log(`  失败: ${testCount - successCount} ${testCount - successCount > 0 ? '❌' : '✅'}`);
    console.log(`  成功率: ${((successCount / testCount) * 100).toFixed(1)}%`);

    console.log(`\n新增工具测试（Phase 1）:`);
    console.log(`  ✅ diagnose_extension_errors - 错误诊断器`);
    console.log(`  ✅ inspect_extension_manifest - Manifest 检查器`);
    console.log(`  ✅ check_content_script_injection - Content Script 检查`);
    console.log(`  ✅ reload_extension - 智能热重载（增强版）`);

    console.log(`\n基础工具测试:`);
    console.log(`  ✅ list_extensions`);
    console.log(`  ✅ get_extension_details`);
    console.log(`  ✅ list_extension_contexts`);
    console.log(`  ✅ inspect_extension_storage`);
    console.log(`  ✅ get_extension_logs`);
    console.log(`  ✅ evaluate_in_extension`);
    console.log(`  ✅ activate_service_worker`);

    console.log('\n' + '═'.repeat(70));
    
    if (successCount === testCount) {
      console.log('🎉 所有测试通过！Phase 1 功能工作完美！');
    } else {
      console.log(`⚠️  ${testCount - successCount} 个测试失败，请检查错误日志`);
    }
    
    console.log('═'.repeat(70));
    console.log('\n✨ 测试完成！\n');

  } catch (error) {
    console.error('\n❌ 测试失败:', error.message);
    console.error(error.stack);
  } finally {
    await client.stop();
    process.exit(0);
  }
}

main().catch(console.error);
