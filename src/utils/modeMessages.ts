/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Display mode-specific startup messages
 */

const LINE = '━'.repeat(70);

export function displayStdioModeInfo(): void {
  console.error(LINE);
  console.error('🔒 SECURITY NOTICE');
  console.error(LINE);
  console.error(
    'This MCP server provides full access to browser debugging capabilities.',
  );
  console.error('Ensure you trust the MCP client before connecting.');
  console.error('');

  console.error(LINE);
  console.error('📋 STDIO MODE - Single User, Local Only');
  console.error(LINE);
  console.error('✓ For local development and IDE integration');
  console.error('✓ Connects to ONE browser instance');
  console.error('✓ Communication via standard input/output');
  console.error('✗ NOT accessible remotely');
  console.error('✗ NOT suitable for multi-user scenarios');
  console.error('');

  console.error('💡 For different use cases:');
  console.error('   Remote access:      --transport sse --port 32122');
  console.error('   Production API:     --transport streamable --port 32123');
  console.error(
    '   Multi-tenant SaaS:  node build/src/multi-tenant/server-multi-tenant.js',
  );
  console.error(LINE);
  console.error('');
}

export function displaySSEModeInfo(port: number): void {
  console.error(LINE);
  console.error('🔒 SECURITY NOTICE');
  console.error(LINE);
  console.error(
    'This MCP server provides full access to browser debugging capabilities.',
  );
  console.error('Ensure proper authentication and network security.');
  console.error('');

  console.error(LINE);
  console.error('🌐 SSE MODE - HTTP Server');
  console.error(LINE);
  console.error(`✓ Server running on http://localhost:${port}`);
  console.error('✓ Accessible remotely (configure firewall as needed)');
  console.error('✓ Multiple clients can connect');
  console.error('✓ Single browser instance shared by all clients');
  console.error('');

  console.error('📡 Available endpoints:');
  console.error(`   Health check: http://localhost:${port}/health`);
  console.error(`   SSE stream:   http://localhost:${port}/sse`);
  console.error(`   Test page:    http://localhost:${port}/test`);
  console.error('');

  console.error('⚠️  IMPORTANT:');
  console.error('   - All clients share the SAME browser instance');
  console.error('   - For isolated per-user browsers, use multi-tenant mode');
  console.error(LINE);
  console.error('');
}

export function displayStreamableModeInfo(port: number): void {
  console.error(LINE);
  console.error('🔒 SECURITY NOTICE');
  console.error(LINE);
  console.error(
    'This MCP server provides full access to browser debugging capabilities.',
  );
  console.error('Ensure proper authentication and network security.');
  console.error('');

  console.error(LINE);
  console.error('🚀 STREAMABLE HTTP MODE - Production Ready');
  console.error(LINE);
  console.error(`✓ Server running on http://localhost:${port}`);
  console.error('✓ Accessible remotely (configure firewall as needed)');
  console.error('✓ Multiple clients can connect');
  console.error('✓ Single browser instance shared by all clients');
  console.error('✓ Latest MCP standard with streaming support');
  console.error('');

  console.error('📡 Available endpoints:');
  console.error(`   Health check: http://localhost:${port}/health`);
  console.error(`   MCP endpoint: http://localhost:${port}/mcp`);
  console.error('');

  console.error('⚠️  IMPORTANT:');
  console.error('   - All clients share the SAME browser instance');
  console.error('   - For isolated per-user browsers, use multi-tenant mode');
  console.error(LINE);
  console.error('');
}

export function displayMultiTenantModeInfo(port: number): void {
  console.error(LINE);
  console.error('🔒 SECURITY NOTICE');
  console.error(LINE);
  console.error('Multi-tenant production server with isolated user sessions.');
  console.error('Configure authentication and CORS for production use.');
  console.error('');

  console.error(LINE);
  console.error('🏢 MULTI-TENANT MODE - Enterprise SaaS');
  console.error(LINE);
  console.error(`✓ Server running on http://localhost:${port}`);
  console.error('✓ 10-100 concurrent users supported');
  console.error('✓ Each user connects to their OWN browser instance');
  console.error('✓ Session isolation and resource management');
  console.error('✓ Authentication and authorization support');
  console.error('');

  console.error('📡 API Endpoints:');
  console.error(`   Health:       http://localhost:${port}/health`);
  console.error(`   Register:     POST http://localhost:${port}/api/register`);
  console.error(`   User SSE:     http://localhost:${port}/sse/:userId`);
  console.error(`   Test page:    http://localhost:${port}/test`);
  console.error('');

  console.error('🔐 Configuration (via environment variables):');
  console.error('   PORT=32122                 # Server port');
  console.error('   AUTH_ENABLED=true          # Enable authentication');
  console.error('   TOKEN_EXPIRATION=86400000  # 24 hours');
  console.error('   MAX_SESSIONS=100           # Max concurrent users');
  console.error('');

  console.error('📝 User Registration Example:');
  console.error(`   curl -X POST http://localhost:${port}/api/register \\`);
  console.error('        -H "Content-Type: application/json" \\');
  console.error(
    '        -d \'{"userId":"alice","browserURL":"http://localhost:9222"}\'',
  );
  console.error('');

  console.error('⚠️  REQUIREMENTS:');
  console.error('   - Users must start their OWN Chrome with remote debugging');
  console.error('   - Example: chrome --remote-debugging-port=9222');
  console.error('   - Each user needs a unique port (9222, 9223, 9224, etc.)');
  console.error(LINE);
  console.error('');
}
