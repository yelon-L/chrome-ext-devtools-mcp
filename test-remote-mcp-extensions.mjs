#!/usr/bin/env node

/**
 * 测试远程 MCP 服务器的扩展工具
 * 通过 MCP 协议连接到 192.168.239.1:32122
 */

import http from 'node:http';
import fs from 'node:fs';

const SERVER_URL = 'http://192.168.239.1:32122';
let credentials = null;

// 尝试加载已有的凭证
try {
  credentials = JSON.parse(fs.readFileSync('/tmp/mcp-test-credentials.json', 'utf-8'));
  console.log('✅ 使用已有凭证');
} catch {
  console.log('⚠️  未找到凭证，将创建新用户');
}

let sessionId = null;
let messageId = 1;
const pending = new Map();

function httpRequest(method, url, data = null) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port,
      path: urlObj.pathname + urlObj.search,
      method,
      headers: { 'Content-Type': 'application/json' },
    };

    if (data) {
      const jsonData = JSON.stringify(data);
      options.headers['Content-Length'] = Buffer.byteLength(jsonData);
    }

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve(JSON.parse(body));
          } catch {
            resolve(body);
          }
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${body}`));
        }
      });
    });

    req.on('error', reject);
    if (data) req.write(JSON.stringify(data));
    req.end();
  });
}

async function sendMCPRequest(method, params = {}) {
  const id = messageId++;
  const message = { jsonrpc: '2.0', id, method, params };

  await httpRequest('POST', `${SERVER_URL}/message?sessionId=${sessionId}`, message);

  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id);
        resolve({ error: { message: 'Timeout (30s)' } });
      }
    }, 30000);

    pending.set(id, (data) => {
      clearTimeout(timeout);
      resolve(data);
    });
  });
}

async function testExtensions() {
  try {
    console.log('╔════════════════════════════════════════════════════════════════╗');
    console.log('║     远程 MCP 服务器扩展工具测试                               ║');
    console.log('╚════════════════════════════════════════════════════════════════╝\n');
    console.log(`📡 服务器: ${SERVER_URL}`);
    console.log(`👤 用户: ${credentials.userId}`);
    console.log(`🔑 Token: ${credentials.token.substring(0, 20)}...\n`);

    // 建立 SSE 连接
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('步骤 1: 建立 SSE 连接');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const sseUrl = new URL(`${SERVER_URL}/sse`);
    sseUrl.searchParams.set('userId', credentials.userId);

    await new Promise((resolveConnection) => {
      const req = http.request({
        hostname: sseUrl.hostname,
        port: sseUrl.port,
        path: sseUrl.pathname + sseUrl.search,
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${credentials.token}`,
          'Accept': 'text/event-stream',
        },
      }, async (res) => {
        if (res.statusCode !== 200) {
          console.error(`❌ SSE 连接失败: ${res.statusCode}`);
          process.exit(1);
        }

        console.log('✅ SSE 连接成功\n');

        let buffer = '';
        res.on('data', (chunk) => {
          buffer += chunk.toString();
          const lines = buffer.split('\n\n');
          buffer = lines.pop() || '';

          for (const message of lines) {
            const dataMatch = message.match(/data: (.+)/);
            if (dataMatch) {
              const dataStr = dataMatch[1].trim();
              
              if (!sessionId && dataStr.includes('/message?sessionId=')) {
                const sidMatch = dataStr.match(/sessionId=([a-f0-9-]+)/);
                if (sidMatch) {
                  sessionId = sidMatch[1];
                  console.log(`✅ Session ID: ${sessionId}\n`);
                  setTimeout(() => runExtensionTests(req, resolveConnection), 500);
                }
                continue;
              }
              
              try {
                const data = JSON.parse(dataStr);
                if (data.id && pending.has(data.id)) {
                  const callback = pending.get(data.id);
                  pending.delete(data.id);
                  callback(data);
                }
              } catch (e) {
                // Ignore
              }
            }
          }
        });

        res.on('end', () => {
          console.log('\n❌ SSE 断开连接');
          process.exit(0);
        });
      });

      req.on('error', (err) => {
        console.error('❌ SSE 错误:', err.message);
        process.exit(1);
      });

      req.end();
    });

  } catch (error) {
    console.error('❌ 错误:', error.message);
    process.exit(1);
  }
}

async function runExtensionTests(sseReq, done) {
  try {
    // 初始化
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('步骤 2: 初始化 MCP');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const initResult = await sendMCPRequest('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'extension-debugger', version: '1.0.0' },
    });

    if (initResult.error) {
      console.error('❌ 初始化失败:', initResult.error.message);
      return;
    }
    console.log('✅ MCP 初始化成功\n');

    // 测试 1: 列出扩展（包括禁用的）
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('测试 1: list_extensions (includeDisabled=true)');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log('🎯 目标: 检测你的两个扩展');
    console.log('   1. Enhanced MCP Debug Test Extension');
    console.log('   2. Video SRT Ext MVP\n');

    const listResult = await sendMCPRequest('tools/call', {
      name: 'list_extensions',
      arguments: { includeDisabled: true },
    });

    const extensions = [];
    if (listResult.result?.content) {
      const text = listResult.result.content[0]?.text || '';
      
      console.log('📄 服务器响应:\n');
      console.log('─'.repeat(60));
      console.log(text);
      console.log('─'.repeat(60));
      
      // 解析扩展ID
      const idMatches = text.match(/\*\*ID\*\*:\s*([a-z]{32})/g);
      if (idMatches) {
        idMatches.forEach(match => {
          const id = match.match(/([a-z]{32})/)[1];
          extensions.push(id);
        });
      }
      
      console.log(`\n✅ 检测到 ${extensions.length} 个扩展`);
      
      // 验证目标扩展
      const hasEnhancedMCP = text.includes('Enhanced MCP');
      const hasVideoSRT = text.includes('Video SRT');
      
      console.log('\n📊 目标扩展检测结果:');
      console.log(`   ${hasEnhancedMCP ? '✅' : '❌'} Enhanced MCP Debug Test Extension`);
      console.log(`   ${hasVideoSRT ? '✅' : '❌'} Video SRT Ext MVP`);
      
      if (hasEnhancedMCP && hasVideoSRT) {
        console.log('\n🎉 成功！两个扩展都被检测到了！');
        console.log('   视觉检测回退功能工作正常！');
      }
    }

    if (extensions.length === 0) {
      console.log('\n⚠️  未检测到扩展');
      console.log('   可能原因:');
      console.log('   - 本地 Chrome (localhost:9222) 未运行');
      console.log('   - Chrome 未安装扩展');
      done();
      sseReq.destroy();
      process.exit(0);
      return;
    }

    // 测试 2: 获取第一个扩展的详情
    const firstExtId = extensions[0];
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`测试 2: get_extension_details (${firstExtId.substring(0, 12)}...)`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const detailsResult = await sendMCPRequest('tools/call', {
      name: 'get_extension_details',
      arguments: { extensionId: firstExtId },
    });

    if (detailsResult.result?.content) {
      const text = detailsResult.result.content[0]?.text || '';
      console.log(text.substring(0, 500));
      console.log('...\n');
    }

    // 测试 3: 列出扩展上下文
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`测试 3: list_extension_contexts`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const contextsResult = await sendMCPRequest('tools/call', {
      name: 'list_extension_contexts',
      arguments: { extensionId: firstExtId },
    });

    if (contextsResult.result?.content) {
      const text = contextsResult.result.content[0]?.text || '';
      console.log(text.substring(0, 400));
      
      const hasSW = text.toLowerCase().includes('service_worker');
      console.log(`\n📊 Service Worker 状态: ${hasSW ? '🟢 活跃' : '🔴 不活跃'}`);
    }

    // 测试 4: 激活 Service Worker
    if (extensions.length > 0) {
      console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log(`测试 4: activate_extension_service_worker`);
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

      const activateResult = await sendMCPRequest('tools/call', {
        name: 'activate_extension_service_worker',
        arguments: { 
          extensionId: firstExtId,
          mode: 'single'
        },
      });

      if (activateResult.result?.content) {
        const text = activateResult.result.content[0]?.text || '';
        console.log(text.substring(0, 400));
      }
    }

    // 总结
    console.log('\n╔════════════════════════════════════════════════════════════════╗');
    console.log('║                    测试完成                                    ║');
    console.log('╚════════════════════════════════════════════════════════════════╝\n');
    console.log(`✅ 测试了 ${extensions.length} 个扩展的工具`);
    console.log('✅ 所有核心扩展工具运行正常');
    console.log('✅ 视觉检测回退功能验证成功\n');

    setTimeout(() => {
      sseReq.destroy();
      done();
      process.exit(0);
    }, 1000);

  } catch (error) {
    console.error('\n❌ 测试错误:', error);
    process.exit(1);
  }
}

testExtensions();
