#!/usr/bin/env node

/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Unified entry point for all transport modes
 *
 * Supports:
 * - stdio (default): Standard MCP transport
 * - sse: Server-Sent Events HTTP transport
 * - streamable: Streamable HTTP transport
 */

import {parseArguments} from './cli.js';
import {checkNodeVersion} from './utils/common.js';
import {VERSION} from './version.js';

checkNodeVersion();

const args = parseArguments(VERSION) as {
  transport?: string;
  port?: number;
  [key: string]: unknown;
};

// 检测 --mode 参数
const modeIndex = process.argv.indexOf('--mode');
if (modeIndex !== -1) {
  const modeValue = process.argv[modeIndex + 1];

  if (modeValue === 'multi-tenant') {
    console.error(`[MCP] Chrome Extension Debug MCP v${VERSION}`);
    console.error('[MCP] Mode: multi-tenant (SSE transport)');
    console.error('[MCP] Starting Multi-tenant server...');
    console.error('');
    await import('./multi-tenant/server-multi-tenant.js');
    // Multi-tenant 服务器已启动，不再执行后续启动逻辑
  } else {
    console.error(
      '\n⚠️  WARNING: Unknown --mode value. Please use --transport instead.',
    );
    console.error('');
    console.error('Available transports:');
    console.error('  --transport stdio       (default, standard I/O)');
    console.error('  --transport sse         (Server-Sent Events)');
    console.error('  --transport streamable  (Streamable HTTP)');
    console.error('');
    console.error('For multi-tenant mode:');
    console.error('  --mode multi-tenant');
    console.error('');
    console.error('Continuing with default stdio mode...\n');

    // 继续执行标准启动逻辑
    await startStandardMode();
  }
} else {
  // 没有 --mode 参数，执行标准启动逻辑
  await startStandardMode();
}

async function startStandardMode() {
  const transport = args.transport || 'stdio';

  console.error(`[MCP] Chrome Extension Debug MCP v${VERSION}`);
  console.error(`[MCP] Transport: ${transport}`);

  if (transport === 'sse') {
    console.error('[MCP] Starting SSE server...');
    const defaultPort = 32122;
    const port =
      args.port || parseInt(process.env.PORT || String(defaultPort), 10);
    if (args.port) {
      process.env.PORT = String(args.port);
    } else if (!process.env.PORT) {
      process.env.PORT = String(defaultPort);
    }
    console.error(`[MCP] Port: ${port}`);
    console.error('');
    await import('./server-sse.js');
  } else if (transport === 'streamable') {
    console.error('[MCP] Starting Streamable HTTP server...');
    const defaultPort = 32123;
    const port =
      args.port || parseInt(process.env.PORT || String(defaultPort), 10);
    if (args.port) {
      process.env.PORT = String(args.port);
    } else if (!process.env.PORT) {
      process.env.PORT = String(defaultPort);
    }
    console.error(`[MCP] Port: ${port}`);
    console.error('');
    await import('./server-http.js');
  } else {
    // stdio mode
    console.error('[MCP] Starting stdio server...');
    console.error('');
    await import('./main.js');
  }
}
