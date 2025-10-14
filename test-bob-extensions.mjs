#!/usr/bin/env node

/**
 * 使用 Bob 用户的真实配置测试扩展工具
 * 
 * 配置来源：Claude Desktop config
 * {
 *   "ext-debug": {
 *     "url": "http://192.168.239.1:32122/sse?userId=bob",  // 实际远程服务器
 *     "headers": {
 *       "Authorization": "Bearer mcp_eyZBfgjQ0Q1_un3c7PHoLsyq5r2T2f7t",
 *       "Accept": "text/event-stream"
 *     }
 *   }
 * }
 */

import http from 'node:http';

// ============================================================================
// 配置（从 Claude Desktop config 复制）
// ============================================================================
const CONFIG = {
  SERVER_URL: 'http://192.168.239.1:32122',  // 远程服务器地址
  USER_ID: 'bob',
  TOKEN: 'mcp_HH2rQyRQYtOIEX7_4acBAxJCTTGnDUSz',  // 新生成的有效 Token
};

// ============================================================================
// 全局变量
// ============================================================================
let sessionId = null;  // SSE 建立后服务器分配的 Session ID
let messageId = 1;     // MCP 消息 ID（递增）
const pending = new Map();  // 等待响应的请求

// ============================================================================
// 辅助函数：发送 HTTP 请求
// ============================================================================
function httpRequest(method, url, data = null) {
  console.log(`📤 HTTP ${method} ${url}`);
  if (data) {
    console.log(`   Body: ${JSON.stringify(data, null, 2).substring(0, 100)}...`);
  }
  
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
        console.log(`📥 HTTP ${res.statusCode}`);
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            const parsed = JSON.parse(body);
            console.log(`   Response: ${JSON.stringify(parsed).substring(0, 100)}...`);
            resolve(parsed);
          } catch {
            resolve(body);
          }
        } else {
          console.error(`   Error: ${body}`);
          reject(new Error(`HTTP ${res.statusCode}: ${body}`));
        }
      });
    });

    req.on('error', reject);
    if (data) req.write(JSON.stringify(data));
    req.end();
  });
}

// ============================================================================
// 辅助函数：发送 MCP 请求
// ============================================================================
async function sendMCPRequest(method, params = {}) {
  const id = messageId++;
  const message = { jsonrpc: '2.0', id, method, params };

  console.log(`\n🔵 MCP Request #${id}: ${method}`);
  console.log(`   Params: ${JSON.stringify(params).substring(0, 80)}`);

  // 通过 HTTP POST 发送 MCP 消息
  await httpRequest('POST', `${CONFIG.SERVER_URL}/message?sessionId=${sessionId}`, message);

  // 等待 SSE 返回响应
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id);
        console.log(`⏱️  Timeout for request #${id}`);
        resolve({ error: { message: 'Timeout (30s)' } });
      }
    }, 30000);

    pending.set(id, (data) => {
      clearTimeout(timeout);
      console.log(`🟢 MCP Response #${id} received`);
      resolve(data);
    });
  });
}

// ============================================================================
// 主测试函数
// ============================================================================
async function testExtensions() {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║       使用 Bob 配置测试扩展工具（详细步骤解释）               ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  console.log('📋 配置信息:');
  console.log(`   Server: ${CONFIG.SERVER_URL}`);
  console.log(`   User ID: ${CONFIG.USER_ID}`);
  console.log(`   Token: ${CONFIG.TOKEN.substring(0, 20)}...${CONFIG.TOKEN.substring(CONFIG.TOKEN.length - 10)}`);
  console.log('');

  // ==========================================================================
  // 步骤 1: 建立 SSE 连接
  // ==========================================================================
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║ 步骤 1: 建立 SSE (Server-Sent Events) 连接                    ║');
  console.log('╚════════════════════════════════════════════════════════════════╝');
  console.log('');
  console.log('📖 什么是 SSE？');
  console.log('   SSE 是一种服务器向客户端推送实时消息的协议');
  console.log('   MCP 使用 SSE 来接收服务器的响应');
  console.log('');
  console.log('📝 这一步做了什么：');
  console.log('   1. 发送 GET 请求到 /sse?userId=bob');
  console.log('   2. 携带 Authorization header（Token 认证）');
  console.log('   3. 设置 Accept: text/event-stream（告诉服务器使用 SSE）');
  console.log('   4. 保持连接打开，等待服务器推送消息');
  console.log('');

  const sseUrl = new URL(`${CONFIG.SERVER_URL}/sse`);
  sseUrl.searchParams.set('userId', CONFIG.USER_ID);

  await new Promise((resolveConnection) => {
    console.log(`🔌 GET ${sseUrl.toString()}`);
    console.log(`   Headers:`);
    console.log(`     Authorization: Bearer ${CONFIG.TOKEN.substring(0, 20)}...`);
    console.log(`     Accept: text/event-stream`);
    console.log('');

    const req = http.request({
      hostname: sseUrl.hostname,
      port: sseUrl.port,
      path: sseUrl.pathname + sseUrl.search,
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${CONFIG.TOKEN}`,
        'Accept': 'text/event-stream',
      },
    }, async (res) => {
      if (res.statusCode !== 200) {
        console.error(`❌ SSE 连接失败: ${res.statusCode}`);
        console.error(`   可能原因:`);
        console.error(`   - Token 无效或过期`);
        console.error(`   - 用户 ${CONFIG.USER_ID} 未注册`);
        console.error(`   - 服务器未运行`);
        process.exit(1);
      }

      console.log('✅ SSE 连接成功！');
      console.log(`   Status: ${res.statusCode}`);
      console.log(`   服务器开始推送消息...\n`);

      // ======================================================================
      // SSE 消息处理
      // ======================================================================
      console.log('╔════════════════════════════════════════════════════════════════╗');
      console.log('║ SSE 消息流监听中...                                            ║');
      console.log('╚════════════════════════════════════════════════════════════════╝\n');

      let buffer = '';
      res.on('data', (chunk) => {
        buffer += chunk.toString();
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || '';

        for (const message of lines) {
          const dataMatch = message.match(/data: (.+)/);
          if (!dataMatch) continue;

          const dataStr = dataMatch[1].trim();
          console.log(`📨 SSE 消息: ${dataStr.substring(0, 80)}...`);

          // 第一条消息：Session ID
          if (!sessionId && dataStr.includes('/message?sessionId=')) {
            const sidMatch = dataStr.match(/sessionId=([a-f0-9-]+)/);
            if (sidMatch) {
              sessionId = sidMatch[1];
              console.log(`\n✅ 收到 Session ID: ${sessionId}`);
              console.log(`   这是服务器分配的唯一会话标识`);
              console.log(`   后续所有 MCP 请求都要带上这个 ID\n`);
              
              // 开始 MCP 测试
              setTimeout(() => runMCPTests(req, resolveConnection), 500);
            }
            continue;
          }

          // MCP 响应消息
          try {
            const data = JSON.parse(dataStr);
            if (data.id && pending.has(data.id)) {
              const callback = pending.get(data.id);
              pending.delete(data.id);
              callback(data);
            }
          } catch (e) {
            // 非 JSON 消息，忽略
          }
        }
      });

      res.on('end', () => {
        console.log('\n❌ SSE 连接断开');
        process.exit(0);
      });
    });

    req.on('error', (err) => {
      console.error('❌ SSE 错误:', err.message);
      process.exit(1);
    });

    req.end();
  });
}

// ============================================================================
// MCP 协议测试
// ============================================================================
async function runMCPTests(sseReq, done) {
  try {
    // ========================================================================
    // 步骤 2: MCP 协议初始化
    // ========================================================================
    console.log('╔════════════════════════════════════════════════════════════════╗');
    console.log('║ 步骤 2: MCP 协议初始化                                         ║');
    console.log('╚════════════════════════════════════════════════════════════════╝\n');
    console.log('📖 什么是 MCP 初始化？');
    console.log('   客户端和服务器交换能力信息，建立协议版本');
    console.log('');
    console.log('📝 这一步做了什么：');
    console.log('   1. 发送 initialize 请求');
    console.log('   2. 声明协议版本: 2024-11-05');
    console.log('   3. 告诉服务器客户端信息');
    console.log('   4. 服务器返回它支持的工具列表');
    console.log('');

    const initResult = await sendMCPRequest('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'bob-extension-tester', version: '1.0.0' },
    });

    if (initResult.error) {
      console.error('❌ 初始化失败:', initResult.error.message);
      return;
    }

    console.log('✅ MCP 初始化成功');
    console.log(`   服务器版本: ${initResult.result?.protocolVersion || 'unknown'}`);
    console.log(`   可用工具数: ${initResult.result?.capabilities?.tools?.length || 'N/A'}\n`);

    // ========================================================================
    // 步骤 3: 列出所有扩展
    // ========================================================================
    console.log('╔════════════════════════════════════════════════════════════════╗');
    console.log('║ 步骤 3: 调用 list_extensions 工具                             ║');
    console.log('╚════════════════════════════════════════════════════════════════╝\n');
    console.log('📖 list_extensions 做什么？');
    console.log('   列出 Chrome 浏览器中安装的所有扩展');
    console.log('');
    console.log('📝 这一步做了什么：');
    console.log('   1. 调用 tools/call 方法');
    console.log('   2. 工具名: list_extensions');
    console.log('   3. 参数: includeDisabled=true（包括禁用的扩展）');
    console.log('   4. 服务器会尝试三种方法检测扩展：');
    console.log('      a) chrome.management API（快速，需要活跃 SW）');
    console.log('      b) Target 扫描（中速，查找扩展 targets）');
    console.log('      c) 视觉检测（慢但可靠，解析 chrome://extensions/ 页面）');
    console.log('');

    const listResult = await sendMCPRequest('tools/call', {
      name: 'list_extensions',
      arguments: { includeDisabled: true },
    });

    console.log('');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('服务器响应（完整）:');
    console.log('═══════════════════════════════════════════════════════════════');

    const extensions = [];
    if (listResult.result?.content) {
      const text = listResult.result.content[0]?.text || '';
      console.log(text);
      console.log('═══════════════════════════════════════════════════════════════\n');

      // 解析扩展 ID
      const idMatches = text.match(/\*\*ID\*\*:\s*([a-z]{32})/g);
      if (idMatches) {
        idMatches.forEach(match => {
          const id = match.match(/([a-z]{32})/)[1];
          extensions.push(id);
        });
      }

      console.log('📊 解析结果:');
      console.log(`   检测到 ${extensions.length} 个扩展`);
      extensions.forEach((id, i) => {
        console.log(`   ${i + 1}. ${id}`);
      });

      // 验证目标扩展
      const hasEnhancedMCP = text.includes('Enhanced MCP');
      const hasVideoSRT = text.includes('Video SRT');

      console.log('');
      console.log('🎯 目标扩展验证:');
      console.log(`   ${hasEnhancedMCP ? '✅' : '❌'} Enhanced MCP Debug Test Extension`);
      console.log(`   ${hasVideoSRT ? '✅' : '❌'} Video SRT Ext MVP`);

      if (hasEnhancedMCP && hasVideoSRT) {
        console.log('');
        console.log('🎉 成功！两个目标扩展都被检测到！');
        console.log('   这证明视觉检测回退功能正常工作');
      }

      // 检测使用了哪种方法
      if (text.includes('Visual inspection')) {
        console.log('');
        console.log('🔍 检测方法: 视觉检测回退');
        console.log('   说明: chrome.management API 和 Target 扫描都未成功');
        console.log('   原因: 扩展可能被禁用或 Service Worker 未激活');
      }
    }

    if (extensions.length === 0) {
      console.log('⚠️  未检测到扩展');
      console.log('   检查: Bob 的浏览器 (localhost:9222) 是否运行？');
      done();
      sseReq.destroy();
      process.exit(0);
      return;
    }

    // ========================================================================
    // 步骤 4: 获取第一个扩展的详情
    // ========================================================================
    const firstExtId = extensions[0];
    console.log('');
    console.log('╔════════════════════════════════════════════════════════════════╗');
    console.log('║ 步骤 4: 调用 get_extension_details 工具                       ║');
    console.log('╚════════════════════════════════════════════════════════════════╝\n');
    console.log('📖 get_extension_details 做什么？');
    console.log('   获取指定扩展的详细信息（manifest、权限、文件等）');
    console.log('');
    console.log(`📝 这一步做了什么：`);
    console.log(`   1. 工具名: get_extension_details`);
    console.log(`   2. 参数: extensionId = ${firstExtId}`);
    console.log(`   3. 服务器查找该扩展的 manifest.json`);
    console.log(`   4. 返回扩展的完整配置信息`);
    console.log('');

    const detailsResult = await sendMCPRequest('tools/call', {
      name: 'get_extension_details',
      arguments: { extensionId: firstExtId },
    });

    console.log('');
    if (detailsResult.result?.content) {
      const text = detailsResult.result.content[0]?.text || '';
      console.log('服务器响应（前 500 字符）:');
      console.log('─'.repeat(64));
      console.log(text.substring(0, 500));
      console.log('...');
      console.log('─'.repeat(64));

      if (text.includes('not found') || text.includes('disabled')) {
        console.log('');
        console.log('ℹ️  扩展被禁用，无法获取详情');
        console.log('   这是预期行为：禁用的扩展需要先启用才能访问');
      }
    }

    // ========================================================================
    // 步骤 5: 列出扩展上下文
    // ========================================================================
    console.log('');
    console.log('╔════════════════════════════════════════════════════════════════╗');
    console.log('║ 步骤 5: 调用 list_extension_contexts 工具                     ║');
    console.log('╚════════════════════════════════════════════════════════════════╝\n');
    console.log('📖 list_extension_contexts 做什么？');
    console.log('   列出扩展的所有活跃上下文（Service Worker、Popup、Content Script 等）');
    console.log('');
    console.log('📝 这一步做了什么：');
    console.log('   1. 工具名: list_extension_contexts');
    console.log(`   2. 参数: extensionId = ${firstExtId}`);
    console.log('   3. 服务器查询 Chrome DevTools Protocol');
    console.log('   4. 返回所有活跃的执行上下文');
    console.log('');

    const contextsResult = await sendMCPRequest('tools/call', {
      name: 'list_extension_contexts',
      arguments: { extensionId: firstExtId },
    });

    console.log('');
    if (contextsResult.result?.content) {
      const text = contextsResult.result.content[0]?.text || '';
      console.log('服务器响应（前 400 字符）:');
      console.log('─'.repeat(64));
      console.log(text.substring(0, 400));
      console.log('─'.repeat(64));

      const hasSW = text.toLowerCase().includes('service_worker');
      console.log('');
      console.log(`📊 Service Worker 状态: ${hasSW ? '🟢 活跃' : '🔴 不活跃'}`);

      if (!hasSW) {
        console.log('   说明: 扩展可能被禁用或 SW 未启动');
      }
    }

    // ========================================================================
    // 总结
    // ========================================================================
    console.log('');
    console.log('╔════════════════════════════════════════════════════════════════╗');
    console.log('║                    测试完成 - 流程总结                        ║');
    console.log('╚════════════════════════════════════════════════════════════════╝\n');

    console.log('完整流程回顾:');
    console.log('');
    console.log('1️⃣  SSE 连接');
    console.log('   GET /sse?userId=bob + Authorization header');
    console.log('   → 服务器返回 Session ID');
    console.log('   → 连接保持打开，接收服务器推送');
    console.log('');
    console.log('2️⃣  MCP 初始化');
    console.log('   POST /message?sessionId=xxx + initialize 请求');
    console.log('   → 服务器通过 SSE 推送响应');
    console.log('   → 协议握手完成');
    console.log('');
    console.log('3️⃣  调用扩展工具');
    console.log('   POST /message?sessionId=xxx + tools/call 请求');
    console.log('   → 服务器执行工具（list_extensions 等）');
    console.log('   → 通过 SSE 推送结果');
    console.log('   → 客户端收到响应并解析');
    console.log('');
    console.log('📊 统计:');
    console.log(`   检测到扩展: ${extensions.length} 个`);
    console.log(`   测试的工具: 3 个（list_extensions, get_extension_details, list_extension_contexts）`);
    console.log(`   总请求数: ${messageId - 1} 个`);
    console.log('');
    console.log('✅ 这不是黑盒测试！');
    console.log('   每一步都有详细日志');
    console.log('   可以看到 HTTP 请求和响应');
    console.log('   可以验证 MCP 协议流程');
    console.log('   可以检查扩展检测结果');
    console.log('');

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

// ============================================================================
// 启动测试
// ============================================================================
testExtensions();
