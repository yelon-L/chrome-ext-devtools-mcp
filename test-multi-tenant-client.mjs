#!/usr/bin/env node

/**
 * Multi-Tenant 客户端测试脚本
 * 连接到远程 Multi-Tenant 服务器并测试所有扩展工具
 */

import http from 'http';
import { randomBytes } from 'crypto';

const SERVER_URL = 'http://192.168.239.1:32122';
const LOCAL_CHROME_URL = 'http://192.168.0.201:9222';  // 本地 Chrome
const USER_ID = `test-user-${randomBytes(4).toString('hex')}`;

console.log('╔═══════════════════════════════════════════════════════════════╗');
console.log('║  🌐 Multi-Tenant 客户端测试                                   ║');
console.log('╚═══════════════════════════════════════════════════════════════╝\n');
console.log(`📡 服务器: ${SERVER_URL}`);
console.log(`🌐 本地 Chrome: ${LOCAL_CHROME_URL}`);
console.log(`👤 用户 ID: ${USER_ID}\n`);

/**
 * HTTP 请求辅助函数
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

/**
 * SSE 客户端
 */
class SSEClient {
  constructor(url) {
    this.url = url;
    this.messageHandlers = [];
    this.errorHandlers = [];
    this.connected = false;
  }

  connect(token) {
    return new Promise((resolve, reject) => {
      const urlObj = new URL(this.url);
      
      const req = http.get({
        hostname: urlObj.hostname,
        port: urlObj.port,
        path: urlObj.pathname + urlObj.search,
        headers: {
          'Accept': 'text/event-stream',
          'Cache-Control': 'no-cache',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        },
      }, (res) => {
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode}`));
          return;
        }

        this.connected = true;
        console.log('✅ SSE 连接已建立\n');
        resolve();

        let buffer = '';
        
        res.on('data', (chunk) => {
          buffer += chunk.toString();
          const lines = buffer.split('\n\n');
          buffer = lines.pop() || '';

          for (const message of lines) {
            this.#handleMessage(message);
          }
        });

        res.on('end', () => {
          this.connected = false;
          console.log('❌ SSE 连接已断开');
        });

        res.on('error', (error) => {
          this.connected = false;
          this.errorHandlers.forEach(h => h(error));
        });
      });

      req.on('error', reject);
      this.req = req;
    });
  }

  #handleMessage(message) {
    const lines = message.split('\n');
    let eventType = 'message';
    let data = '';

    for (const line of lines) {
      if (line.startsWith('event:')) {
        eventType = line.substring(6).trim();
      } else if (line.startsWith('data:')) {
        data += line.substring(5).trim();
      }
    }

    if (data) {
      try {
        const parsed = JSON.parse(data);
        this.messageHandlers.forEach(h => h(eventType, parsed));
      } catch (e) {
        console.error('解析消息失败:', e);
      }
    }
  }

  onMessage(handler) {
    this.messageHandlers.push(handler);
  }

  onError(handler) {
    this.errorHandlers.push(handler);
  }

  send(data) {
    return httpRequest('POST', this.url, data);
  }

  disconnect() {
    if (this.req) {
      this.req.destroy();
    }
  }
}

/**
 * MCP 客户端
 */
class MCPMultiTenantClient {
  constructor(serverUrl, userId, browserUrl) {
    this.serverUrl = serverUrl;
    this.userId = userId;
    this.browserUrl = browserUrl;
    this.requestId = 1;
    this.pendingRequests = new Map();
    this.sessionId = null;
    this.token = null;
  }

  async register() {
    console.log('━'.repeat(70));
    console.log('📝 步骤 1: 注册用户到 Multi-Tenant 服务器');
    console.log('━'.repeat(70));

    try {
      const response = await httpRequest('POST', `${this.serverUrl}/api/register`, {
        userId: this.userId,
        browserURL: this.browserUrl,
      });

      console.log(`✅ 注册成功`);
      console.log(`   User ID: ${this.userId}`);
      console.log(`   Browser URL: ${this.browserUrl}`);
      console.log(`   Message: ${response.message}\n`);

      return response;
    } catch (error) {
      console.error(`❌ 注册失败: ${error.message}`);
      throw error;
    }
  }

  async requestToken() {
    console.log('━'.repeat(70));
    console.log('📝 步骤 2: 申请访问 Token');
    console.log('━'.repeat(70));

    try {
      const response = await httpRequest('POST', `${this.serverUrl}/api/auth/token`, {
        userId: this.userId,
        permissions: ['*'],
      });

      this.token = response.token;

      console.log(`✅ Token 申请成功`);
      console.log(`   Token: ${this.token?.substring(0, 16)}...`);
      console.log(`   Permissions: ${response.permissions.join(', ')}`);
      console.log(`   Expires: ${new Date(response.expiresAt).toLocaleString()}`);
      console.log(`   Total Tokens: ${response.totalTokens}\n`);

      return response;
    } catch (error) {
      console.error(`❌ Token 申请失败: ${error.message}`);
      throw error;
    }
  }

  async connect() {
    console.log('━'.repeat(70));
    console.log('📡 步骤 3: 建立 SSE 连接');
    console.log('━'.repeat(70));

    const sseUrl = `${this.serverUrl}/sse?userId=${this.userId}`;
    this.sseClient = new SSEClient(sseUrl);

    this.sseClient.onMessage((eventType, data) => {
      if (eventType === 'message' && data.jsonrpc) {
        if (data.id && this.pendingRequests.has(data.id)) {
          const resolve = this.pendingRequests.get(data.id);
          this.pendingRequests.delete(data.id);
          resolve(data);
        }
      }
    });

    await this.sseClient.connect(this.token);

    // 初始化
    await this.sendRequest('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: {
        name: 'multi-tenant-test-client',
        version: '1.0.0',
      },
    });

    console.log('✅ MCP 初始化成功\n');
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
      
      this.sseClient.send(request).catch(reject);
      
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error('Request timeout'));
        }
      }, 30000);
    });
  }

  async callTool(name, args = {}) {
    console.log(`\n${'─'.repeat(70)}`);
    console.log(`🔧 工具: ${name}`);
    if (Object.keys(args).length > 0) {
      console.log(`📝 参数: ${JSON.stringify(args, null, 2)}`);
    }
    console.log('─'.repeat(70));

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
      
      console.log('\n📊 输出:\n');
      const lines = output.split('\n');
      if (lines.length > 50) {
        console.log(lines.slice(0, 50).join('\n'));
        console.log(`\n... (省略 ${lines.length - 50} 行) ...\n`);
      } else {
        console.log(output);
      }

      return { success: true, output };
    }

    return { success: false, error: 'No output' };
  }

  disconnect() {
    if (this.sseClient) {
      this.sseClient.disconnect();
    }
  }
}

/**
 * 主测试流程
 */
async function main() {
  const client = new MCPMultiTenantClient(SERVER_URL, USER_ID, LOCAL_CHROME_URL);

  try {
    // 1. 注册用户
    await client.register();

    // 2. 申请 Token
    await client.requestToken();

    // 3. 建立 SSE 连接
    await client.connect();

    // 4. 测试扩展工具
    console.log('\n' + '═'.repeat(70));
    console.log('🧪 步骤 4: 测试扩展调试工具');
    console.log('═'.repeat(70));

    let successCount = 0;
    let totalCount = 0;

    // 测试 list_extensions
    totalCount++;
    console.log('\n📋 测试 #1: list_extensions');
    const extensionsResult = await client.callTool('list_extensions');
    
    if (!extensionsResult.success) {
      console.log('\n⚠️  未检测到扩展，跳过扩展相关测试');
      console.log('\n💡 提示: 请在 Chrome (192.168.0.201:9222) 中加载扩展\n');
      return;
    }
    successCount++;

    // 提取扩展 ID
    const extensionIdMatch = extensionsResult.output?.match(/([a-z]{32})/);
    if (!extensionIdMatch) {
      console.log('\n⚠️  无法找到扩展 ID\n');
      return;
    }

    const extensionId = extensionIdMatch[1];
    console.log(`\n✅ 找到扩展 ID: ${extensionId}\n`);

    // 测试 Phase 1 新增工具
    console.log('\n' + '▓'.repeat(70));
    console.log('⭐ 测试 Phase 1 新增工具（4 个）');
    console.log('▓'.repeat(70));

    // 1. diagnose_extension_errors
    totalCount++;
    console.log('\n⭐ 新工具 #1: diagnose_extension_errors');
    const diagnoseResult = await client.callTool('diagnose_extension_errors', {
      extensionId,
      timeRange: 10,
      includeWarnings: true,
    });
    if (diagnoseResult.success) successCount++;

    // 2. inspect_extension_manifest
    totalCount++;
    console.log('\n⭐ 新工具 #2: inspect_extension_manifest');
    const manifestResult = await client.callTool('inspect_extension_manifest', {
      extensionId,
      checkMV3Compatibility: true,
      checkPermissions: true,
      checkBestPractices: true,
    });
    if (manifestResult.success) successCount++;

    // 3. check_content_script_injection
    totalCount++;
    console.log('\n⭐ 新工具 #3: check_content_script_injection');
    const contentScriptResult = await client.callTool('check_content_script_injection', {
      extensionId,
      testUrl: 'https://github.com/example/repo',
      detailed: true,
    });
    if (contentScriptResult.success) successCount++;

    // 4. reload_extension（增强版）
    totalCount++;
    console.log('\n⭐ 新工具 #4: reload_extension（增强版）');
    const reloadResult = await client.callTool('reload_extension', {
      extensionId,
      preserveStorage: true,
      waitForReady: true,
      captureErrors: true,
    });
    if (reloadResult.success) successCount++;

    // 测试其他基础工具
    console.log('\n' + '═'.repeat(70));
    console.log('📦 测试基础扩展工具');
    console.log('═'.repeat(70));

    // get_extension_details
    totalCount++;
    console.log('\n🔍 测试: get_extension_details');
    const detailsResult = await client.callTool('get_extension_details', { extensionId });
    if (detailsResult.success) successCount++;

    // list_extension_contexts
    totalCount++;
    console.log('\n🔍 测试: list_extension_contexts');
    const contextsResult = await client.callTool('list_extension_contexts', { extensionId });
    if (contextsResult.success) successCount++;

    // inspect_extension_storage
    totalCount++;
    console.log('\n🔍 测试: inspect_extension_storage');
    const storageResult = await client.callTool('inspect_extension_storage', {
      extensionId,
      storageTypes: ['local', 'sync'],
    });
    if (storageResult.success) successCount++;

    // 总结
    console.log('\n' + '═'.repeat(70));
    console.log('📊 测试总结');
    console.log('═'.repeat(70));
    console.log(`\n总测试数: ${totalCount}`);
    console.log(`成功: ${successCount} ✅`);
    console.log(`失败: ${totalCount - successCount} ${totalCount - successCount > 0 ? '❌' : '✅'}`);
    console.log(`成功率: ${((successCount / totalCount) * 100).toFixed(1)}%\n`);

    if (successCount === totalCount) {
      console.log('🎉 Multi-Tenant 模式测试全部通过！\n');
    } else {
      console.log(`⚠️  ${totalCount - successCount} 个测试失败\n`);
    }

  } catch (error) {
    console.error('\n❌ 测试失败:', error.message);
    console.error(error.stack);
  } finally {
    client.disconnect();
    setTimeout(() => process.exit(0), 1000);
  }
}

main().catch(console.error);
