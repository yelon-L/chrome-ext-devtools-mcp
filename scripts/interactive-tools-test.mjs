#!/usr/bin/env node

/**
 * Interactive Tools Testing
 * Reads credentials from /tmp/mcp-test-credentials.json
 * Tests all tools one by one with detailed output
 */

import http from 'node:http';
import fs from 'node:fs';

// Load credentials
const creds = JSON.parse(
  fs.readFileSync('/tmp/mcp-test-credentials.json', 'utf-8'),
);
const {server: SERVER_URL, userId: USER_ID, token: TOKEN} = creds;

console.log(`📡 Connecting to: ${SERVER_URL}`);
console.log(`👤 User: ${USER_ID}`);
console.log(`🔑 Token: ${TOKEN.substring(0, 20)}...\n`);

// Test state
let sessionId = null;
let messageId = 1;
const pending = new Map();
const results = {
  extension: {passed: 0, failed: 0, tests: []},
  browser: {passed: 0, failed: 0, tests: []},
};

// HTTP helper
function httpRequest(method, url, data = null) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port,
      path: urlObj.pathname + urlObj.search,
      method,
      headers: {'Content-Type': 'application/json'},
    };

    if (data) {
      const jsonData = JSON.stringify(data);
      options.headers['Content-Length'] = Buffer.byteLength(jsonData);
    }

    const req = http.request(options, res => {
      let body = '';
      res.on('data', chunk => (body += chunk));
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

// Send MCP request
async function sendRequest(method, params = {}) {
  const id = messageId++;
  const message = {jsonrpc: '2.0', id, method, params};

  await httpRequest(
    'POST',
    `${SERVER_URL}/message?sessionId=${sessionId}`,
    message,
  );

  return new Promise(resolve => {
    const timeout = setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id);
        resolve({error: {message: 'Timeout (30s)'}});
      }
    }, 30000);

    pending.set(id, data => {
      clearTimeout(timeout);
      resolve(data);
    });
  });
}

// Test runner
async function runTests() {
  try {
    // Connect SSE
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🔌 Connecting via SSE');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const sseUrl = new URL(`${SERVER_URL}/sse`);
    sseUrl.searchParams.set('userId', USER_ID);

    await new Promise((resolveConnection, rejectConnection) => {
      const req = http.request(
        {
          hostname: sseUrl.hostname,
          port: sseUrl.port,
          path: sseUrl.pathname + sseUrl.search,
          method: 'GET',
          headers: {
            Authorization: `Bearer ${TOKEN}`,
            Accept: 'text/event-stream',
          },
        },
        async res => {
          if (res.statusCode !== 200) {
            console.error(`❌ SSE connection failed: ${res.statusCode}`);
            process.exit(1);
          }

          console.log('✅ SSE connected\n');

          let buffer = '';
          res.on('data', chunk => {
            buffer += chunk.toString();
            const lines = buffer.split('\n\n');
            buffer = lines.pop() || '';

            for (const message of lines) {
              const dataMatch = message.match(/data: (.+)/);
              if (dataMatch) {
                const dataStr = dataMatch[1].trim();

                // Check if it's the endpoint message with sessionId
                if (!sessionId && dataStr.includes('/message?sessionId=')) {
                  const sidMatch = dataStr.match(/sessionId=([a-f0-9-]+)/);
                  if (sidMatch) {
                    sessionId = sidMatch[1];
                    console.log(`✅ Session ID: ${sessionId}\n`);
                    console.log('⏳ Starting tests immediately...\n');
                    // Start immediately to prevent session timeout
                    setImmediate(() => testAllTools(req, resolveConnection));
                  }
                  continue;
                }

                // Try to parse as JSON (for tool responses)
                try {
                  const data = JSON.parse(dataStr);
                  if (data.id && pending.has(data.id)) {
                    const callback = pending.get(data.id);
                    pending.delete(data.id);
                    callback(data);
                  }
                } catch (e) {
                  // Ignore parse errors for non-JSON messages
                }
              }
            }
          });

          res.on('end', () => {
            console.log('\n❌ SSE disconnected');
            process.exit(0);
          });
        },
      );

      req.on('error', err => {
        console.error('❌ SSE error:', err.message);
        process.exit(1);
      });

      req.end();
    });
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

// Test all tools
async function testAllTools(sseReq, done) {
  try {
    // Initialize
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🚀 Initializing MCP');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const initResult = await sendRequest('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: {name: 'test-suite', version: '1.0.0'},
    });

    if (initResult.error) {
      console.error('❌ Init failed:', initResult.error.message);
      return;
    }
    console.log('✅ MCP initialized\n');

    // List tools
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📋 Listing Tools');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const toolsResult = await sendRequest('tools/list', {});
    const tools = toolsResult.result?.tools || [];
    console.log(`Found ${tools.length} tools\n`);

    const extTools = tools.filter(t => t.name.includes('extension'));
    const browserTools = tools.filter(t => !t.name.includes('extension'));

    console.log(`  🔌 Extension tools: ${extTools.length}`);
    console.log(`  🌐 Browser tools: ${browserTools.length}\n`);

    // Test extension tools
    await testExtensionTools(extTools);

    // Test browser tools (sample)
    await testBrowserTools(browserTools);

    // Summary
    printSummary();

    setTimeout(() => {
      sseReq.destroy();
      done();
      process.exit(0);
    }, 1000);
  } catch (error) {
    console.error('\n❌ Test error:', error);
    process.exit(1);
  }
}

// Test extension tools
async function testExtensionTools(tools) {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🔌 Testing Extension Tools');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  let extensionId = null;

  // Test list_extensions first
  await testTool('extension', 'list_extensions', {}, async result => {
    const text = result.result?.content?.[0]?.text || '';
    const match = text.match(/([a-z]{32})/);
    if (match) {
      extensionId = match[1];
      return {success: true, note: `Found: ${extensionId.substring(0, 16)}...`};
    }
    if (
      text.includes('No extensions found') ||
      text.includes('No Extensions Found')
    ) {
      return {
        success: true,
        note: 'No extensions (expected if none installed)',
      };
    }
    return {success: true, note: 'Listed extensions'};
  });

  if (!extensionId) {
    console.log(
      '\n⚠️  No extensions found - skipping extension-specific tests\n',
    );
    return;
  }

  // Test tools that need extensionId
  const testsWithId = [
    ['get_extension_details', {extensionId}],
    ['list_extension_contexts', {extensionId}],
    ['activate_extension_service_worker', {extensionId, mode: 'single'}],
    ['inspect_extension_storage', {extensionId, storageType: 'local'}],
    ['get_extension_logs', {extensionId}],
    ['diagnose_extension_errors', {extensionId, timeRange: 10}],
    ['inspect_extension_manifest', {extensionId, checkMV3Compatibility: true}],
    [
      'check_content_script_injection',
      {extensionId, testUrl: 'https://github.com'},
    ],
    ['evaluate_in_extension', {extensionId, code: 'chrome.runtime.id'}],
    ['reload_extension', {extensionId, preserveStorage: true}],
  ];

  for (const [name, args] of testsWithId) {
    await testTool('extension', name, args);
  }
}

// Test browser tools (sample)
async function testBrowserTools(tools) {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🌐 Testing Browser Tools (Sample)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  await testTool('browser', 'list_pages', {});
  await testTool('browser', 'new_page', {url: 'https://example.com'});
  await testTool('browser', 'take_screenshot', {name: 'test'});
}

// Test individual tool
async function testTool(category, name, args, validator) {
  console.log(`Testing: ${name}`);

  const result = await sendRequest('tools/call', {
    name,
    arguments: args,
  });

  let status, note;

  if (result.error) {
    status = 'failed';
    note = result.error.message;
  } else if (validator) {
    const validation = await validator(result);
    status = validation.success ? 'passed' : 'failed';
    note = validation.note || '';
  } else {
    status = 'passed';
    note = 'OK';
  }

  results[category][status]++;
  results[category].tests.push({name, status, note});

  const emoji = status === 'passed' ? '✅' : '❌';
  console.log(`  ${emoji} ${name}: ${note}\n`);
}

// Print summary
function printSummary() {
  console.log(
    '\n╔════════════════════════════════════════════════════════════════╗',
  );
  console.log(
    '║                      TEST SUMMARY                              ║',
  );
  console.log(
    '╚════════════════════════════════════════════════════════════════╝\n',
  );

  const total = Object.values(results).reduce(
    (sum, cat) => sum + cat.passed + cat.failed,
    0,
  );
  const passed = Object.values(results).reduce(
    (sum, cat) => sum + cat.passed,
    0,
  );
  const failed = Object.values(results).reduce(
    (sum, cat) => sum + cat.failed,
    0,
  );

  console.log(`📊 Total: ${total} tests`);
  console.log(`✅ Passed: ${passed} (${((passed / total) * 100).toFixed(1)}%)`);
  console.log(
    `❌ Failed: ${failed} (${((failed / total) * 100).toFixed(1)}%)\n`,
  );

  console.log('By Category:\n');
  for (const [cat, data] of Object.entries(results)) {
    const catTotal = data.passed + data.failed;
    console.log(`  ${cat}:`);
    console.log(`    ✅ ${data.passed}/${catTotal} passed`);
    if (data.failed > 0) {
      console.log(`    ❌ ${data.failed}/${catTotal} failed`);
      data.tests
        .filter(t => t.status === 'failed')
        .forEach(t => {
          console.log(`       - ${t.name}: ${t.note}`);
        });
    }
  }
}

// Run
runTests();
