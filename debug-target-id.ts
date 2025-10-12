#!/usr/bin/env tsx
/**
 * 调试 targetId 问题
 */

import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import path from 'path';
import {fileURLToPath} from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function debug() {
  const serverPath = path.join(__dirname, 'build/src/index.js');
  const transport = new StdioClientTransport({
    command: 'node',
    args: [serverPath, '--browser-url', 'http://localhost:9222'],
  });

  const client = new Client({name: 'debug', version: '1.0.0'}, {capabilities: {}});
  await client.connect(transport);
  
  const extensionId = 'pjeiljkehgiabmjmfjohffbihlopdabn';

  // 获取上下文列表
  const contextsResult = await client.callTool({
    name: 'list_extension_contexts',
    arguments: {extensionId},
  });

  const contextsText = contextsResult.content
    ?.filter((c: any) => c.type === 'text')
    .map((c: any) => c.text)
    .join('\n') || '';

  console.log('扩展上下文信息:\n');
  console.log(contextsText.substring(0, 600));
  
  // 提取 target ID
  const targetIdMatch = contextsText.match(/Target ID[:\s`*]+([A-F0-9]{32})/);
  const targetId = targetIdMatch ? targetIdMatch[1] : null;
  
  console.log(`\n提取的 Target ID: ${targetId}`);
  console.log(`\nevaluate_in_extension 会使用这个 targetId 调用 evaluateInContext\n`);

  await client.close();
}

debug();
