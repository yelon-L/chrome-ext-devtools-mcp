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

import {checkNodeVersion, readPackageJson} from './utils/common.js';
import {parseArguments} from './cli.js';

checkNodeVersion();

const pkgVersion = readPackageJson().version ?? '0.8.1';
const args = parseArguments(pkgVersion);

const transport = (args as any).transport || 'stdio';

console.log(`[MCP] Chrome Extension Debug MCP v${pkgVersion}`);
console.log(`[MCP] Transport: ${transport}`);

if (transport === 'sse') {
  console.log('[MCP] Starting SSE server...');
  const defaultPort = 32122;
  const port = (args as any).port || parseInt(process.env.PORT || String(defaultPort), 10);
  if ((args as any).port) {
    process.env.PORT = String((args as any).port);
  } else if (!process.env.PORT) {
    process.env.PORT = String(defaultPort);
  }
  console.log(`[MCP] Port: ${port}`);
  console.log('');
  await import('./server-sse.js');
} else if (transport === 'streamable') {
  console.log('[MCP] Starting Streamable HTTP server...');
  const defaultPort = 32123;
  const port = (args as any).port || parseInt(process.env.PORT || String(defaultPort), 10);
  if ((args as any).port) {
    process.env.PORT = String((args as any).port);
  } else if (!process.env.PORT) {
    process.env.PORT = String(defaultPort);
  }
  console.log(`[MCP] Port: ${port}`);
  console.log('');
  await import('./server-http.js');
} else {
  // stdio mode
  console.log('[MCP] Starting stdio server...');
  console.log('');
  await import('./main.js');
}
