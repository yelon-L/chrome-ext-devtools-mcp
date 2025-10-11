#!/usr/bin/env node
/**
 * SSE 客户端测试
 * 
 * 模拟真实 IDE 客户端，通过 HTTP/SSE 调用 MCP 服务器
 * 这是真正的端到端测试！
 * 
 * 使用步骤：
 * 1. 启动 Chrome: chrome --remote-debugging-port=9222
 * 2. 编译: npm run build
 * 3. 启动 SSE 服务器: node build/src/server-sse.js --browser-url http://localhost:9222
 * 4. 运行测试: node test-sse-client.js
 */

// 使用 Node.js 18+ 内置的 fetch
// 如果使用 Node.js < 18，需要先安装: npm install node-fetch eventsource

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

class MCPSSEClient {
  constructor(serverUrl) {
    this.serverUrl = serverUrl;
    this.sessionId = null;
    this.messageId = 1;
    this.pendingRequests = new Map();
    this.eventSource = null;
  }

  async connect() {
    return new Promise((resolve, reject) => {
      log(`[Client] 📡 连接到 SSE 服务器: ${this.serverUrl}/sse`, 'blue');

      this.eventSource = new EventSource(`${this.serverUrl}/sse`);

      this.eventSource.onopen = () => {
        log('[Client] ✅ SSE 连接已建立', 'green');
      };

      this.eventSource.addEventListener('endpoint', (event) => {
        const data = JSON.parse(event.data);
        this.sessionId = new URL(data.uri, this.serverUrl).searchParams.get('sessionId');
        log(`[Client] 📝 会话 ID: ${this.sessionId}`, 'yellow');
        resolve();
      });

      this.eventSource.addEventListener('message', (event) => {
        try {
          const message = JSON.parse(event.data);
          this.handleMessage(message);
        } catch (error) {
          log(`[Client] ❌ 解析消息失败: ${error.message}`, 'red');
        }
      });

      this.eventSource.onerror = (error) => {
        log(`[Client] ❌ SSE 错误: ${error.message || 'Connection failed'}`, 'red');
        reject(error);
      };

      // 超时
      setTimeout(() => reject(new Error('Connection timeout')), 10000);
    });
  }

  handleMessage(message) {
    log(`[Client] 📥 收到消息: ${message.id ? `ID=${message.id}` : 'notification'}`, 'cyan');

    if (message.id && this.pendingRequests.has(message.id)) {
      const {resolve, reject} = this.pendingRequests.get(message.id);
      this.pendingRequests.delete(message.id);

      if (message.error) {
        reject(new Error(message.error.message || 'Unknown error'));
      } else {
        resolve(message.result);
      }
    }
  }

  async sendRequest(method, params = {}) {
    if (!this.sessionId) {
      throw new Error('Not connected');
    }

    const id = this.messageId++;
    const message = {
      jsonrpc: '2.0',
      id,
      method,
      params,
    };

    log(`[Client] 📤 发送请求: ${method}`, 'blue');

    const url = `${this.serverUrl}/message?sessionId=${this.sessionId}`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(message),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${await response.text()}`);
    }

    // 等待响应
    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, {resolve, reject});
      
      // 超时
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error('Request timeout'));
        }
      }, 30000);
    });
  }

  async close() {
    if (this.eventSource) {
      this.eventSource.close();
    }
  }
}

async function runTests() {
  log('\n╔════════════════════════════════════════════════════════╗', 'cyan');
  log('║   MCP SSE 端到端测试（模拟真实 IDE 调用）              ║', 'cyan');
  log('╚════════════════════════════════════════════════════════╝\n', 'cyan');

  const serverUrl = 'http://localhost:3000';
  const client = new MCPSSEClient(serverUrl);

  try {
    // 1. 健康检查
    log('步骤 1: 健康检查...', 'blue');
    const healthResponse = await fetch(`${serverUrl}/health`);
    const health = await healthResponse.json();
    log(`  状态: ${health.status}`, health.status === 'ok' ? 'green' : 'red');
    log(`  会话数: ${health.sessions}`, 'yellow');
    log('', 'white');

    // 2. 连接
    log('步骤 2: 建立 SSE 连接...', 'blue');
    await client.connect();
    log('  ✅ 连接成功\n', 'green');

    // 3. 初始化
    log('步骤 3: 初始化 MCP...', 'blue');
    const initResult = await client.sendRequest('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: {
        name: 'test-client',
        version: '1.0.0',
      },
    });
    log(`  ✅ 初始化成功`, 'green');
    log(`  服务器: ${initResult.serverInfo.name} v${initResult.serverInfo.version}`, 'yellow');
    log('', 'white');

    // 4. 测试 list_extensions（关键测试！）
    log('步骤 4: 测试 list_extensions 工具...', 'blue');
    const startTime = Date.now();
    
    const listResult = await client.sendRequest('tools/call', {
      name: 'list_extensions',
      arguments: {},
    });
    
    const duration = Date.now() - startTime;
    
    log(`  ⏱️  耗时: ${duration}ms`, duration < 1000 ? 'green' : 'yellow');
    
    // 解析结果
    const resultText = listResult.content[0]?.text || '';
    const extensionBlocks = resultText.split('##').filter(b => b.trim());
    const extensionCount = extensionBlocks.length - 1;
    
    log(`  📊 找到 ${extensionCount} 个扩展`, extensionCount > 0 ? 'green' : 'red');
    
    // 检查 Service Worker 状态
    const hasSwStatus = resultText.includes('Service Worker:');
    log(`  ${hasSwStatus ? '✅' : '❌'} Service Worker 状态显示`, hasSwStatus ? 'green' : 'red');
    
    // 检查 Helper Extension
    const hasHelper = resultText.includes('MCP Service Worker Activator');
    log(`  ${hasHelper ? '✅' : '❌'} Helper Extension 检测`, hasHelper ? 'green' : 'red');
    
    log('\n  返回内容预览:', 'yellow');
    log(resultText.substring(0, 500).split('\n').map(l => '    ' + l).join('\n'), 'white');
    if (resultText.length > 500) {
      log('    ... (结果太长，已截断)\n', 'yellow');
    }

    // 5. 验证结果
    log('\n步骤 5: 验证测试结果...', 'blue');
    
    const checks = {
      '连接成功': true,
      '找到扩展': extensionCount > 0,
      '找到多个扩展': extensionCount >= 2,
      'SW 状态显示': hasSwStatus,
      'Helper Extension': hasHelper,
      '性能良好': duration < 2000,
    };

    log('\n  验证检查：', 'cyan');
    for (const [check, passed] of Object.entries(checks)) {
      const emoji = passed ? '✅' : '❌';
      const color = passed ? 'green' : 'red';
      log(`    ${emoji} ${check}`, color);
    }

    // 6. 对比用户反馈
    log('\n╔════════════════════════════════════════════════════════╗', 'cyan');
    log('║   与用户反馈对比                                        ║', 'cyan');
    log('╚════════════════════════════════════════════════════════╝\n', 'cyan');

    log('  用户反馈的问题：', 'yellow');
    log('    ❌ 只找到 1 个扩展（实际有 3 个）', 'red');
    log('    ❌ Helper Extension 未被检测到', 'red');
    log('    ❌ 执行速度很慢（进入循环）', 'red');

    log('\n  本次测试结果：', 'yellow');
    log(`    ${checks['找到多个扩展'] ? '✅' : '❌'} 找到 ${extensionCount} 个扩展`, 
        checks['找到多个扩展'] ? 'green' : 'red');
    log(`    ${checks['Helper Extension'] ? '✅' : '❌'} Helper Extension ${checks['Helper Extension'] ? '已' : '未'}检测到`,
        checks['Helper Extension'] ? 'green' : 'red');
    log(`    ${checks['性能良好'] ? '✅' : '❌'} 性能：${duration}ms`,
        checks['性能良好'] ? 'green' : 'red');

    // 7. 最终结论
    const allPassed = Object.values(checks).every(Boolean);
    
    log('\n╔════════════════════════════════════════════════════════╗', 'cyan');
    log('║   最终结论                                              ║', 'cyan');
    log('╚════════════════════════════════════════════════════════╝\n', 'cyan');

    if (allPassed) {
      log('🎉 所有测试通过！问题已完全修复！', 'green');
      log('\n✅ 通过真实的 HTTP/SSE 传输验证', 'green');
      log('✅ 完全模拟 IDE 调用方式', 'green');
      log('✅ 端到端测试成功', 'green');
    } else {
      log('⚠️  部分测试未通过', 'yellow');
      
      if (!checks['找到多个扩展']) {
        log('\n❌ 问题：仍然只能检测到少量扩展', 'red');
        log('   建议：检查是否有多个扩展安装在 Chrome 中', 'yellow');
      }
      
      if (!checks['Helper Extension']) {
        log('\n❌ 问题：Helper Extension 未检测到', 'red');
        log('   建议：确认 Helper Extension ID: kppbmoiecmhnnhjnlkojlblanellmonp', 'yellow');
      }
      
      if (!checks['性能良好']) {
        log('\n⚠️  问题：性能较慢', 'yellow');
        log(`   实际耗时：${duration}ms`, 'yellow');
      }
    }

    // 清理
    await client.close();
    
    log('', 'white');
    process.exit(allPassed ? 0 : 1);

  } catch (error) {
    log(`\n❌ 测试失败: ${error.message}`, 'red');
    console.error(error);
    await client.close();
    process.exit(1);
  }
}

// 检查服务器是否运行
log('检查 SSE 服务器...', 'blue');
const serverUrl = 'http://localhost:3000';

fetch(`${serverUrl}/health`)
  .then(() => {
    log('✅ SSE 服务器正在运行\n', 'green');
    runTests();
  })
  .catch(() => {
    log('❌ SSE 服务器未运行', 'red');
    log('\n请先启动 SSE 服务器：', 'yellow');
    log('  1. chrome --remote-debugging-port=9222', 'yellow');
    log('  2. npm run build', 'yellow');
    log('  3. node build/src/server-sse.js --browser-url http://localhost:9222', 'yellow');
    log('  4. node test-sse-client.js', 'yellow');
    process.exit(1);
  });
