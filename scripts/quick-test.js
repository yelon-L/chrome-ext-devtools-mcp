#!/usr/bin/env node
/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {spawn} from 'node:child_process';

const mcp = spawn(
  'node',
  [
    'build/src/index.js',
    '--browserUrl',
    'http://localhost:9222',
    '--transport',
    'stdio',
  ],
  {stdio: ['pipe', 'pipe', 'inherit']},
);

let requestId = 1;
let buffer = '';

mcp.stdout.on('data', data => {
  buffer += data.toString();
  const lines = buffer.split('\n');
  buffer = lines.pop() || '';

  lines.forEach(line => {
    if (line.trim() && line.includes('{')) {
      try {
        const resp = JSON.parse(line);
        if (resp.result?.content) {
          const text = resp.result.content[0]?.text || '';
          console.log('\n📋 响应内容 (前800字符):');
          console.log(text.substring(0, 800));
          console.log('\n...');
        }
      } catch (e) {}
    }
  });
});

setTimeout(() => {
  mcp.stdin.write(
    JSON.stringify({
      jsonrpc: '2.0',
      id: requestId++,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: {name: 'test', version: '1.0'},
      },
    }) + '\n',
  );
}, 500);

setTimeout(() => {
  console.log('\n🔍 发送 list_extensions 请求...');
  mcp.stdin.write(
    JSON.stringify({
      jsonrpc: '2.0',
      id: requestId++,
      method: 'tools/call',
      params: {name: 'list_extensions', arguments: {}},
    }) + '\n',
  );
}, 1500);

setTimeout(() => {
  console.log('\n✅ 测试完成');
  mcp.kill();
  process.exit(0);
}, 4000);
