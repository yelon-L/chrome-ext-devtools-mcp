#!/usr/bin/env node

/**
 * 测试本地 Chrome 连接并运行完整的 extension 工具测试
 */

import http from 'http';
import { randomBytes } from 'crypto';
import puppeteer from 'puppeteer-core';

const SERVER_URL = 'http://192.168.239.1:32122';
const LOCAL_CHROME_URL = 'http://localhost:9222';  // 改用本地 Chrome
const USER_ID = `test-user-${randomBytes(4).toString('hex')}`;

console.log('╔═══════════════════════════════════════════════════════════════╗');
console.log('║  🧪 本地 Chrome 测试                                          ║');
console.log('╚═══════════════════════════════════════════════════════════════╝\n');

// 首先测试 Chrome 连接
async function testChromeConnection() {
  console.log(`📡 测试 Chrome 连接: ${LOCAL_CHROME_URL}`);
  try {
    const browser = await puppeteer.connect({
      browserURL: LOCAL_CHROME_URL,
      defaultViewport: null,
    });
    
    const version = await browser.version();
    console.log(`✅ Chrome 连接成功: ${version}\n`);
    await browser.disconnect();
    return true;
  } catch (error) {
    console.error(`❌ Chrome 连接失败: ${error.message}`);
    console.error('\n💡 请启动 Chrome:');
    console.error('   google-chrome --remote-debugging-port=9222 --no-first-run\n');
    return false;
  }
}

/**
 * HTTP 请求
 */
function httpRequest(method, url, data = null) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const options = {
      method,
      hostname: urlObj.hostname,
      port: urlObj.port,
      path: urlObj.pathname + urlObj.search,
      headers: data ? {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(JSON.stringify(data)),
      } : {},
    };

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve(JSON.parse(body));
          } catch (e) {
            resolve(body);
          }
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${body}`));
        }
      });
    });

    req.on('error', reject);

    if (data) {
      req.write(JSON.stringify(data));
    }

    req.end();
  });
}

async function main() {
  // 1. 测试 Chrome 连接
  const chromeOk = await testChromeConnection();
  if (!chromeOk) {
    process.exit(1);
  }

  console.log(`📡 服务器: ${SERVER_URL}`);
  console.log(`🌐 Chrome: ${LOCAL_CHROME_URL}`);
  console.log(`👤 用户: ${USER_ID}\n`);

  try {
    // 2. 注册用户
    console.log('步骤 1: 注册用户...');
    await httpRequest('POST', `${SERVER_URL}/api/register`, {
      userId: USER_ID,
      browserURL: LOCAL_CHROME_URL,
    });
    console.log('✅ 注册成功\n');

    // 3. 申请 Token
    console.log('步骤 2: 申请 Token...');
    const tokenResult = await httpRequest('POST', `${SERVER_URL}/api/auth/token`, {
      userId: USER_ID,
      permissions: ['*'],
    });
    console.log(`✅ Token: ${tokenResult.token.substring(0, 20)}...\n`);

    // 4. 连接 SSE
    console.log('步骤 3: 连接 SSE...');
    const urlObj = new URL(`${SERVER_URL}/sse?userId=${USER_ID}`);
    
    const req = http.get({
      hostname: urlObj.hostname,
      port: urlObj.port,
      path: urlObj.pathname + urlObj.search,
      headers: {
        'Accept': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Authorization': `Bearer ${tokenResult.token}`,
      },
    }, (res) => {
      if (res.statusCode !== 200) {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          console.error(`❌ SSE 连接失败 (${res.statusCode}): ${body}`);
          process.exit(1);
        });
        return;
      }

      console.log('✅ SSE 连接成功!\n');
      
      let messageId = 1;
      const pending = new Map();
      let sessionId = null;
      
      // 解析 SSE 消息
      let buffer = '';
      res.on('data', (chunk) => {
        buffer += chunk.toString();
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || '';
        
        for (const message of lines) {
          const dataMatch = message.match(/data: (.+)/);
          if (dataMatch) {
            try {
              const data = JSON.parse(dataMatch[1]);
              
              // 提取 sessionId
              if (!sessionId && data.sessionId) {
                sessionId = data.sessionId;
                console.log(`📋 Session ID: ${sessionId}\n`);
                console.log('⏳ Waiting 1 second before starting tests...');
                
                // 开始测试
                setTimeout(() => runTests(sessionId, tokenResult.token), 1000);
              }
              
              // 处理响应
              if (data.id && pending.has(data.id)) {
                const resolve = pending.get(data.id);
                pending.delete(data.id);
                resolve(data);
              }
            } catch (e) {
              // 忽略解析错误
              console.log(`⚠️  SSE message parse error: ${e.message}`);
            }
          }
        }
      });

      res.on('end', () => {
        console.log('\n❌ SSE 连接已断开');
        process.exit(0);
      });

      // 发送请求的辅助函数
      async function sendRequest(method, params = {}) {
        const id = messageId++;
        const message = { jsonrpc: '2.0', id, method, params };

        console.log(`📤 Sending request #${id}: ${method}`);
        await httpRequest('POST', `${SERVER_URL}/message?sessionId=${sessionId}`, message);

        return new Promise((resolve) => {
          let timeoutId;
          
          const wrappedResolve = (value) => {
            if (timeoutId) clearTimeout(timeoutId);
            console.log(`📥 Received response #${id}`);
            resolve(value);
          };
          
          pending.set(id, wrappedResolve);
          
          timeoutId = setTimeout(() => {
            if (pending.has(id)) {
              pending.delete(id);
              console.log(`⏰ Request #${id} timed out after 30s`);
              resolve(null);
            }
          }, 30000);
        });
      }

      // 运行测试
      async function runTests(sid, token) {
        try {
          console.log('═'.repeat(70));
          console.log('🧪 开始测试 Extension 工具');
          console.log('═'.repeat(70));

          // 初始化
          console.log('\n步骤 1: 初始化 MCP...');
          const initResult = await sendRequest('initialize', {
            protocolVersion: '2024-11-05',
            capabilities: {},
            clientInfo: { name: 'test-client', version: '1.0.0' },
          });
          
          if (initResult) {
            console.log('✅ 初始化成功');
          } else {
            console.log('❌ 初始化失败');
            return;
          }

          // 测试 list_extensions
          console.log('\n步骤 2: 测试 list_extensions...');
          const listResult = await sendRequest('tools/call', {
            name: 'list_extensions',
            arguments: {},
          });

          if (listResult && listResult.result) {
            const text = listResult.result.content[0]?.text || '';
            console.log('✅ list_extensions 成功');
            console.log(`   输出长度: ${text.length} 字符`);
            
            // 提取扩展 ID
            const match = text.match(/([a-z]{32})/);
            if (match) {
              const extensionId = match[1];
              console.log(`   找到扩展: ${extensionId}`);
              
              // 测试新工具
              console.log('\n⏳ 开始测试新增的 4 个工具...');
              await testNewTools(extensionId);
            } else {
              console.log('   ⚠️  未找到扩展 ID (可能没有安装扩展)');
            }
          } else {
            console.log('❌ list_extensions 失败');
          }

          console.log('\n' + '═'.repeat(70));
          console.log('✅ 测试完成!');
          console.log('═'.repeat(70));
          
          setTimeout(() => {
            console.log('\n🔌 关闭连接...');
            req.destroy();
            process.exit(0);
          }, 1000);
        } catch (error) {
          console.error('\n❌ 测试过程出错:', error.message);
          req.destroy();
          process.exit(1);
        }
      }

      // 测试新工具
      async function testNewTools(extensionId) {
        console.log('\n' + '▓'.repeat(70));
        console.log('⭐ 测试 Phase 1 新增工具');
        console.log('▓'.repeat(70));

        let successCount = 0;
        const totalTests = 4;

        // 1. diagnose_extension_errors
        console.log('\n🔍 [1/4] 测试: diagnose_extension_errors');
        console.log('   参数: timeRange=10, includeWarnings=true');
        const diagnoseResult = await sendRequest('tools/call', {
          name: 'diagnose_extension_errors',
          arguments: { extensionId, timeRange: 10, includeWarnings: true },
        });
        if (diagnoseResult && diagnoseResult.result) {
          console.log('✅ diagnose_extension_errors 成功');
          successCount++;
        } else {
          console.log('❌ diagnose_extension_errors 失败');
        }

        // 2. inspect_extension_manifest
        console.log('\n🔍 [2/4] 测试: inspect_extension_manifest');
        console.log('   参数: checkMV3Compatibility=true, checkPermissions=true');
        const manifestResult = await sendRequest('tools/call', {
          name: 'inspect_extension_manifest',
          arguments: { 
            extensionId, 
            checkMV3Compatibility: true,
            checkPermissions: true,
            checkBestPractices: true,
          },
        });
        if (manifestResult && manifestResult.result) {
          console.log('✅ inspect_extension_manifest 成功');
          successCount++;
        } else {
          console.log('❌ inspect_extension_manifest 失败');
        }

        // 3. check_content_script_injection
        console.log('\n🔍 [3/4] 测试: check_content_script_injection');
        console.log('   参数: testUrl="https://github.com/example/repo"');
        const contentScriptResult = await sendRequest('tools/call', {
          name: 'check_content_script_injection',
          arguments: { 
            extensionId, 
            testUrl: 'https://github.com/example/repo',
            detailed: true,
          },
        });
        if (contentScriptResult && contentScriptResult.result) {
          console.log('✅ check_content_script_injection 成功');
          successCount++;
        } else {
          console.log('❌ check_content_script_injection 失败');
        }

        // 4. reload_extension
        console.log('\n🔍 [4/4] 测试: reload_extension');
        console.log('   参数: preserveStorage=true, waitForReady=true');
        const reloadResult = await sendRequest('tools/call', {
          name: 'reload_extension',
          arguments: { 
            extensionId,
            preserveStorage: true,
            waitForReady: true,
            captureErrors: true,
          },
        });
        if (reloadResult && reloadResult.result) {
          console.log('✅ reload_extension 成功');
          successCount++;
        } else {
          console.log('❌ reload_extension 失败');
        }

        // 测试总结
        console.log('\n' + '─'.repeat(70));
        console.log(`📊 新工具测试结果: ${successCount}/${totalTests} 成功`);
        console.log('─'.repeat(70));
      }
    });

    req.on('error', (error) => {
      console.error('\n❌ 请求错误:', error);
      process.exit(1);
    });

  } catch (error) {
    console.error('\n❌ 测试失败:', error.message);
    process.exit(1);
  }
}

main();
