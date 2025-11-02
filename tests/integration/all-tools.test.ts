/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * 所有工具的集成测试
 *
 * 测试所有 MCP 工具的基本功能，确保没有报错
 */

import assert from 'node:assert';
import {before, describe, it} from 'node:test';

import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';

// 测试超时时间
const TEST_TIMEOUT = 60000;

// 创建 MCP 客户端
async function createClient(): Promise<Client> {
  const transport = new StdioClientTransport({
    command: 'node',
    args: ['build/src/index.js', '--browserUrl', 'http://localhost:9222'],
  });

  const client = new Client(
    {name: 'all-tools-test', version: '1.0.0'},
    {capabilities: {}},
  );

  await client.connect(transport);
  return client;
}

// 调用工具并验证响应
async function callTool(
  client: Client,
  name: string,
  args: Record<string, unknown>,
): Promise<string> {
  const result = await client.callTool({name, arguments: args});
  assert.ok(result.content, `工具 ${name} 应该返回内容`);
  assert.ok(Array.isArray(result.content), `工具 ${name} 应该返回数组`);
  assert.ok(result.content.length > 0, `工具 ${name} 应该返回非空内容`);

  const firstContent = result.content[0];
  assert.ok(firstContent, `工具 ${name} 应该有第一个内容项`);
  const text = firstContent.type === 'text' ? firstContent.text : '';
  assert.ok(text.length > 0, `工具 ${name} 应该返回文本内容`);

  // 检查是否有明显的错误标记
  // 注意：某些工具的标题包含 "Error" 字样（如 "Runtime Errors"），这是正常的
  // 只检查真正的错误消息格式 "Error: xxx"
  const hasRealError = text.includes('Error: ') && !text.includes('No errors');
  assert.ok(
    !hasRealError,
    `工具 ${name} 不应该返回错误: ${text.substring(0, 200)}`,
  );

  return text;
}

describe('All Tools Integration Test', {timeout: TEST_TIMEOUT}, () => {
  let client: Client;
  let extensionId: string;

  before(async () => {
    // 连接到 MCP 服务器
    client = await createClient();
    assert.ok(client, 'MCP 客户端应该创建成功');

    // 获取扩展 ID - 尝试找测试扩展，如果没有就用第一个扩展
    const text = await callTool(client, 'list_extensions', {});

    // 先尝试找测试扩展
    let match = text.match(
      /Enhanced MCP Debug Test Extension[\s\S]*?ID[:\s*]+([a-z]{32})/,
    );

    // 如果没有测试扩展，就用第一个扩展
    if (!match) {
      console.log('⚠️  未找到测试扩展，使用第一个可用扩展');
      match = text.match(/ID[:\s*]+([a-z]{32})/);
    }

    assert.ok(match, '应该至少有一个扩展');
    extensionId = match![1];
    console.log(`✅ 使用扩展 ID: ${extensionId}`);
  });

  it('should list all tools', async () => {
    const {tools} = await client.listTools();
    assert.ok(tools.length > 0, '应该有可用的工具');
    console.log(`✅ 找到 ${tools.length} 个工具`);
  });

  // 页面工具测试
  describe('Page Tools', () => {
    it('list_pages', async () => {
      await callTool(client, 'list_pages', {});
    });

    it('new_page', async () => {
      await callTool(client, 'new_page', {url: 'about:blank'});
    });

    it('take_snapshot', async () => {
      await callTool(client, 'take_snapshot', {});
    });
  });

  // 扩展发现工具测试
  describe('Extension Discovery Tools', () => {
    it('list_extensions', async () => {
      await callTool(client, 'list_extensions', {});
    });

    it('get_extension_details', async () => {
      await callTool(client, 'get_extension_details', {extensionId});
    });
  });

  // Service Worker 工具测试
  describe('Service Worker Tools', () => {
    it('activate_extension_service_worker', async () => {
      await callTool(client, 'activate_extension_service_worker', {
        extensionId,
      });
    });
  });

  // 上下文工具测试
  describe('Context Tools', () => {
    it('list_extension_contexts', async () => {
      await callTool(client, 'list_extension_contexts', {extensionId});
    });

    // 注意：switch_extension_context 需要 targetId，这里跳过
    // 因为需要先获取 targetId，会使测试复杂化
  });

  // 日志工具测试
  describe('Log Tools', () => {
    it('get_background_logs', async () => {
      await callTool(client, 'get_background_logs', {extensionId});
    });

    it('get_offscreen_logs', async () => {
      await callTool(client, 'get_offscreen_logs', {extensionId});
    });
  });

  // 错误工具测试
  describe('Error Tools', () => {
    it('get_extension_runtime_errors', async () => {
      // 这个工具可能返回实际错误，也可能返回 "No errors"，都是正常的
      // 所以不使用 callTool，而是直接调用并检查响应
      const result = await client.callTool({
        name: 'get_extension_runtime_errors',
        arguments: {extensionId},
      });
      assert.ok(result.content, '应该返回内容');
      assert.ok(Array.isArray(result.content), '应该返回数组');
      assert.ok(result.content.length > 0, '应该返回非空内容');

      const firstContent = result.content[0];
      assert.ok(firstContent, '应该有第一个内容项');
      const text = firstContent.type === 'text' ? firstContent.text : '';
      assert.ok(text.length > 0, '应该返回文本内容');

      // 验证响应包含预期的标题
      assert.ok(
        text.includes('Extension Runtime Errors') || text.includes('No errors'),
        '应该包含错误报告或无错误信息',
      );
    });

    it('clear_extension_errors', async () => {
      await callTool(client, 'clear_extension_errors', {extensionId});
    });
  });

  // 存储工具测试
  describe('Storage Tools', () => {
    it('inspect_extension_storage', async () => {
      await callTool(client, 'inspect_extension_storage', {extensionId});
    });
  });

  // 内容脚本工具测试
  describe('Content Script Tools', () => {
    it('check_content_script_injection', async () => {
      await callTool(client, 'check_content_script_injection', {extensionId});
    });
  });

  // Manifest 检查工具测试
  describe('Manifest Tools', () => {
    it('inspect_extension_manifest', async () => {
      await callTool(client, 'inspect_extension_manifest', {extensionId});
    });
  });

  // 代码执行工具测试
  describe('Execution Tools', () => {
    it('evaluate_in_extension', async () => {
      const text = await callTool(client, 'evaluate_in_extension', {
        extensionId,
        code: 'chrome.runtime.id',
      });
      assert.ok(text.includes(extensionId), '应该返回扩展 ID');
    });
  });

  // Popup 工具测试
  describe('Popup Tools', () => {
    it('get_popup_info', async () => {
      await callTool(client, 'get_popup_info', {extensionId});
    });

    it('is_popup_open', async () => {
      await callTool(client, 'is_popup_open', {extensionId});
    });

    // 注意：以下 popup 工具在无头环境可能失败，所以跳过
    // - open_extension_popup: 需要活动的浏览器窗口
    // - wait_for_popup: 依赖 open_extension_popup
    // - close_popup: 依赖 open_extension_popup
    // - interact_with_popup: 依赖 open_extension_popup
  });

  // 重载工具测试
  describe('Reload Tools', () => {
    it('reload_extension', async () => {
      const text = await callTool(client, 'reload_extension', {extensionId});
      // 重载可能需要时间，所以只检查是否有响应
      assert.ok(text.length > 0, '应该返回内容');
    });
  });

  // 清理
  it('should close client', async () => {
    await client.close();
  });
});
