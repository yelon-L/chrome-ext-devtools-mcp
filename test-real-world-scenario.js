#!/usr/bin/env node
/**
 * 真实场景测试：模拟 IDE 通过 MCP 协议调用工具
 * 
 * 这个测试模拟用户遇到的实际问题：
 * 1. Chrome 已经在运行（9222 端口）
 * 2. 已安装 3 个扩展（其中 2 个 SW Inactive）
 * 3. IDE 通过 MCP 协议调用 list_extensions
 * 4. 期望：应该找到所有 3 个扩展
 */

import {spawn} from 'child_process';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';

function log(message, color = 'white') {
  const colors = {
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m',
  };
  console.log(`${colors[color]}${message}\x1b[0m`);
}

async function testRealWorldScenario() {
  log('\n╔════════════════════════════════════════════════════════╗', 'cyan');
  log('║   真实场景测试：模拟 IDE 调用 MCP 工具                  ║', 'cyan');
  log('╚════════════════════════════════════════════════════════╝\n', 'cyan');

  log('前提条件检查：', 'blue');
  log('  1. Chrome 应该在 9222 端口运行', 'yellow');
  log('  2. 应该安装了至少 1 个扩展', 'yellow');
  log('  3. 可选：安装了 Helper Extension', 'yellow');
  log('', 'white');

  let mcpProcess;
  let client;

  try {
    // 1. 启动 MCP 服务器（连接模式）
    log('步骤 1: 启动 MCP 服务器（连接模式）...', 'blue');
    
    mcpProcess = spawn('node', [
      'build/index.js',
      '--browser-url',
      'http://localhost:9222'
    ], {
      cwd: process.cwd(),
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    // 监听 stderr 输出（MCP 的日志）
    mcpProcess.stderr.on('data', (data) => {
      const output = data.toString();
      if (output.includes('[ExtensionHelper]') || 
          output.includes('[Browser]') ||
          output.includes('[HelperGen]')) {
        log(`  📝 ${output.trim()}`, 'yellow');
      }
    });

    // 等待 MCP 服务器启动
    await new Promise(resolve => setTimeout(resolve, 3000));
    log('  ✅ MCP 服务器已启动\n', 'green');

    // 2. 创建 MCP 客户端（模拟 IDE）
    log('步骤 2: 创建 MCP 客户端（模拟 IDE）...', 'blue');
    
    const transport = new StdioClientTransport({
      stdin: mcpProcess.stdout,
      stdout: mcpProcess.stdin,
    });

    client = new Client({
      name: 'test-client',
      version: '1.0.0',
    }, {
      capabilities: {},
    });

    await client.connect(transport);
    log('  ✅ MCP 客户端已连接\n', 'green');

    // 3. 调用 list_extensions 工具（模拟 IDE 调用）
    log('步骤 3: 调用 list_extensions 工具...', 'blue');
    
    const startTime = Date.now();
    const result = await client.callTool({
      name: 'list_extensions',
      arguments: {},
    });
    const duration = Date.now() - startTime;

    log(`  ⏱️  耗时: ${duration}ms\n`, duration < 1000 ? 'green' : 'yellow');

    // 4. 解析结果
    log('步骤 4: 解析结果...', 'blue');
    
    const resultText = result.content[0]?.text || '';
    
    // 提取扩展信息
    const extensionBlocks = resultText.split('##').filter(block => block.trim());
    const extensionCount = extensionBlocks.length - 1; // 减去标题
    
    log(`  📊 返回结果：\n`, 'yellow');
    log(resultText.substring(0, 500), 'white');
    if (resultText.length > 500) {
      log('\n  ... (结果太长，已截断)\n', 'yellow');
    }

    // 5. 验证结果
    log('\n步骤 5: 验证结果...', 'blue');
    
    const checks = {
      foundExtensions: extensionCount > 0,
      foundMultipleExtensions: extensionCount >= 2,
      hasServiceWorkerStatus: resultText.includes('Service Worker:'),
      hasHelperExtension: resultText.includes('MCP Service Worker Activator'),
      performanceOk: duration < 2000,
    };

    log('\n验证检查：', 'cyan');
    for (const [check, passed] of Object.entries(checks)) {
      const emoji = passed ? '✅' : '❌';
      const color = passed ? 'green' : 'red';
      log(`  ${emoji} ${check}: ${passed}`, color);
    }

    // 6. 详细分析
    log('\n╔════════════════════════════════════════════════════════╗', 'cyan');
    log('║   测试结果分析                                          ║', 'cyan');
    log('╚════════════════════════════════════════════════════════╝\n', 'cyan');

    log(`扩展数量: ${extensionCount}`, extensionCount >= 2 ? 'green' : 'red');
    
    if (extensionCount === 1) {
      log('\n❌ 问题：只检测到 1 个扩展', 'red');
      log('   原因：可能其他扩展的 SW 是 Inactive', 'yellow');
      log('   期望：应该检测到所有扩展（包括 Inactive 的）', 'yellow');
    } else if (extensionCount >= 2) {
      log('\n✅ 成功：检测到多个扩展', 'green');
      log('   说明：修复生效，可以检测 Inactive 的扩展', 'green');
    }

    if (checks.hasHelperExtension) {
      log('\n✅ Helper Extension: 已检测到', 'green');
      log('   说明：硬编码 ID 方案工作正常', 'green');
    } else {
      log('\n⚠️  Helper Extension: 未检测到', 'yellow');
      log('   原因：可能未安装或 ID 不匹配', 'yellow');
    }

    if (checks.hasServiceWorkerStatus) {
      log('\n✅ Service Worker 状态: 已显示', 'green');
      log('   说明：状态检测功能正常', 'green');
    }

    if (checks.performanceOk) {
      log(`\n✅ 性能: ${duration}ms（良好）`, 'green');
    } else {
      log(`\n⚠️  性能: ${duration}ms（较慢）`, 'yellow');
    }

    // 7. 对比用户反馈
    log('\n╔════════════════════════════════════════════════════════╗', 'cyan');
    log('║   与用户反馈对比                                        ║', 'cyan');
    log('╚════════════════════════════════════════════════════════╝\n', 'cyan');

    log('用户反馈的问题：', 'yellow');
    log('  ❌ 只找到 1 个扩展（实际有 3 个）', 'red');
    log('  ❌ Helper Extension 未被检测到', 'red');
    log('  ❌ 无法使用 Helper Extension 激活其他扩展', 'red');

    log('\n本次测试结果：', 'yellow');
    log(`  ${checks.foundMultipleExtensions ? '✅' : '❌'} 找到 ${extensionCount} 个扩展`, 
        checks.foundMultipleExtensions ? 'green' : 'red');
    log(`  ${checks.hasHelperExtension ? '✅' : '❌'} Helper Extension ${checks.hasHelperExtension ? '已' : '未'}检测到`, 
        checks.hasHelperExtension ? 'green' : 'red');

    // 8. 最终结论
    const allPassed = Object.values(checks).every(Boolean);
    
    log('\n╔════════════════════════════════════════════════════════╗', 'cyan');
    log('║   最终结论                                              ║', 'cyan');
    log('╚════════════════════════════════════════════════════════╝\n', 'cyan');

    if (allPassed) {
      log('🎉 所有检查通过！问题已修复！', 'green');
    } else {
      log('⚠️  部分检查未通过，问题仍存在', 'yellow');
      log('\n建议：', 'cyan');
      if (!checks.foundMultipleExtensions) {
        log('  1. 检查是否有多个扩展安装', 'yellow');
        log('  2. 检查扩展的 Service Worker 状态', 'yellow');
      }
      if (!checks.hasHelperExtension) {
        log('  3. 安装 Helper Extension 到 Chrome', 'yellow');
        log('  4. 确认 ID: kppbmoiecmhnnhjnlkojlblanellmonp', 'yellow');
      }
    }

    // 清理
    await client.close();
    mcpProcess.kill();

    process.exit(allPassed ? 0 : 1);

  } catch (error) {
    log(`\n❌ 测试失败: ${error.message}`, 'red');
    console.error(error);

    if (client) {
      await client.close();
    }
    if (mcpProcess) {
      mcpProcess.kill();
    }

    process.exit(1);
  }
}

// 检查前提条件
log('检查测试前提条件...', 'blue');
log('请确保：', 'yellow');
log('  1. Chrome 已启动: chrome --remote-debugging-port=9222', 'yellow');
log('  2. 已安装至少 1 个测试扩展', 'yellow');
log('  3. 已编译 MCP: npm run build', 'yellow');
log('', 'white');

const readline = await import('readline');
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

rl.question('前提条件已满足？(y/n) ', (answer) => {
  rl.close();
  
  if (answer.toLowerCase() === 'y') {
    testRealWorldScenario();
  } else {
    log('\n请先满足前提条件后再运行测试', 'yellow');
    process.exit(0);
  }
});
