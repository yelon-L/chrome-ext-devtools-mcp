#!/usr/bin/env node
/**
 * 真实的 MCP 端到端测试
 * 通过 stdio 完全模拟 IDE 的调用方式
 */

import {spawn} from 'child_process';
import {fileURLToPath} from 'url';
import {dirname, join} from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

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

async function runTest() {
  log('\n╔════════════════════════════════════════════════════════╗', 'cyan');
  log('║   MCP 真实端到端测试                                   ║', 'cyan');
  log('╚════════════════════════════════════════════════════════╝\n', 'cyan');

  log('前提条件：', 'yellow');
  log('  ✅ Chrome 运行在 9222 端口', 'yellow');
  log('  ✅ 代码已编译', 'green');
  log('', 'white');

  // 启动 MCP 服务器
  log('步骤 1: 启动 MCP 服务器（连接模式）...', 'blue');
  
  const mcpPath = join(__dirname, 'build', 'src', 'index.js');
  const mcp = spawn('node', [
    mcpPath,
    '--browser-url',
    'http://localhost:9222'
  ], {
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  let messageId = 1;
  let initDone = false;
  let testResult = null;

  // 监听 stderr（日志输出）
  mcp.stderr.on('data', (data) => {
    const output = data.toString();
    
    // 显示所有输出以便调试
    console.error(output);
    
    if (output.includes('Chrome DevTools MCP Server connected')) {
      log('  ✅ MCP 服务器已连接\n', 'green');
      initDone = true;
      // 发送 initialize
      sendMessage({
        jsonrpc: '2.0',
        id: messageId++,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: {
            name: 'test-client',
            version: '1.0.0',
          },
        },
      });
    }
  });

  // 监听 stdout（MCP 响应）
  let buffer = '';
  mcp.stdout.on('data', (data) => {
    buffer += data.toString();
    
    // 尝试解析 JSON-RPC 消息
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    
    for (const line of lines) {
      if (!line.trim()) continue;
      
      try {
        const message = JSON.parse(line);
        handleMessage(message);
      } catch (e) {
        // 不是 JSON，可能是日志
      }
    }
  });

  function sendMessage(msg) {
    mcp.stdin.write(JSON.stringify(msg) + '\n');
  }

  function handleMessage(message) {
    log(`📥 收到响应: ${message.method || `ID=${message.id}`}`, 'cyan');

    // Initialize 响应
    if (message.id === 1 && message.result) {
      log('\n步骤 2: 初始化完成', 'blue');
      log(`  服务器: ${message.result.serverInfo.name} v${message.result.serverInfo.version}`, 'yellow');
      
      // 调用 list_extensions
      log('\n步骤 3: 调用 list_extensions...', 'blue');
      const startTime = Date.now();
      
      sendMessage({
        jsonrpc: '2.0',
        id: messageId++,
        method: 'tools/call',
        params: {
          name: 'list_extensions',
          arguments: {},
        },
      });
      
      // 保存开始时间
      message._startTime = startTime;
    }

    // list_extensions 响应
    if (message.id === 2 && message.result) {
      const duration = Date.now() - (message._startTime || 0);
      
      log(`  ⏱️  耗时: ${duration}ms\n`, duration < 2000 ? 'green' : 'yellow');
      
      // 解析结果
      const resultText = message.result.content[0]?.text || '';
      const extensionBlocks = resultText.split('##').filter(b => b.trim());
      const extensionCount = extensionBlocks.length - 1;
      
      log('步骤 4: 解析结果...', 'blue');
      log(`  📊 找到 ${extensionCount} 个扩展`, extensionCount > 0 ? 'green' : 'red');
      
      const hasSwStatus = resultText.includes('Service Worker:');
      const hasHelper = resultText.includes('MCP Service Worker Activator');
      
      log(`  ${hasSwStatus ? '✅' : '❌'} Service Worker 状态显示`, hasSwStatus ? 'green' : 'red');
      log(`  ${hasHelper ? '✅' : '❌'} Helper Extension 检测`, hasHelper ? 'green' : 'red');
      
      log('\n  返回内容预览:', 'yellow');
      const preview = resultText.substring(0, 600);
      log(preview.split('\n').map(l => '    ' + l).join('\n'), 'white');
      if (resultText.length > 600) {
        log('    ...(已截断)\n', 'yellow');
      }
      
      // 验证结果
      log('\n╔════════════════════════════════════════════════════════╗', 'cyan');
      log('║   测试结果                                              ║', 'cyan');
      log('╚════════════════════════════════════════════════════════╝\n', 'cyan');
      
      const checks = {
        '找到扩展': extensionCount > 0,
        '找到多个扩展': extensionCount >= 2,
        'SW 状态显示': hasSwStatus,
        'Helper Extension': hasHelper,
        '性能良好': duration < 2000,
      };
      
      log('验证检查：', 'cyan');
      for (const [check, passed] of Object.entries(checks)) {
        const emoji = passed ? '✅' : '❌';
        const color = passed ? 'green' : 'red';
        log(`  ${emoji} ${check}`, color);
      }
      
      // 对比用户反馈
      log('\n与用户反馈对比：', 'yellow');
      log('  用户问题：只找到 1 个扩展（实际有 3 个）', 'yellow');
      log(`  测试结果：找到 ${extensionCount} 个扩展`, extensionCount >= 2 ? 'green' : 'red');
      
      const allPassed = Object.values(checks).every(Boolean);
      
      log('\n最终结论：', 'cyan');
      if (allPassed) {
        log('🎉 所有测试通过！问题已修复！', 'green');
      } else {
        log('⚠️  部分测试未通过', 'yellow');
      }
      
      testResult = allPassed;
      
      // 清理
      mcp.kill();
      setTimeout(() => process.exit(testResult ? 0 : 1), 1000);
    }

    // 错误处理
    if (message.error) {
      log(`\n❌ 错误: ${message.error.message}`, 'red');
      mcp.kill();
      process.exit(1);
    }
  }

  // 错误处理
  mcp.on('error', (error) => {
    log(`\n❌ MCP 启动失败: ${error.message}`, 'red');
    process.exit(1);
  });

  mcp.on('exit', (code) => {
    if (!testResult && code !== 0) {
      log(`\n❌ MCP 异常退出: code ${code}`, 'red');
      process.exit(1);
    }
  });

  // 超时保护
  setTimeout(() => {
    if (!testResult) {
      log('\n⏰ 测试超时', 'yellow');
      mcp.kill();
      process.exit(1);
    }
  }, 30000);
}

runTest();
