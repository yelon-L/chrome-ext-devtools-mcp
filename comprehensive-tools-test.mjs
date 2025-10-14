#!/usr/bin/env node

/**
 * Comprehensive MCP Tools Testing Script
 * Tests all tools against remote Multi-Tenant MCP server
 * 
 * Server: 192.168.239.1 (multi-tenant mode)
 * Chrome: localhost:9222
 */

import http from 'node:http';

// Configuration
const SERVER_URL = 'http://192.168.239.1:32122';
const USER_ID = 'test-user-' + Date.now();
const BROWSER_URL = 'http://localhost:9222';

console.log('╔════════════════════════════════════════════════════════════════╗');
console.log('║    Comprehensive MCP Tools Testing Suite                      ║');
console.log('╚════════════════════════════════════════════════════════════════╝\n');
console.log(`📡 Server: ${SERVER_URL}`);
console.log(`🌐 Chrome: ${BROWSER_URL}`);
console.log(`👤 User ID: ${USER_ID}\n`);

// HTTP request helper
function httpRequest(method, url, data = null) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port,
      path: urlObj.pathname + urlObj.search,
      method,
      headers: {
        'Content-Type': 'application/json',
      },
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

// Test Results Tracker
const testResults = {
  total: 0,
  passed: 0,
  failed: 0,
  skipped: 0,
  details: [],
};

function recordTest(category, toolName, status, details = '') {
  testResults.total++;
  testResults[status]++;
  testResults.details.push({ category, toolName, status, details });
  
  const emoji = {
    passed: '✅',
    failed: '❌',
    skipped: '⏭️',
  }[status];
  
  console.log(`  ${emoji} ${toolName}: ${details || status}`);
}

// Main test execution
async function runTests() {
  let token = null;
  let sessionId = null;
  let messageId = 1;
  const pending = new Map();

  try {
    // Step 1: Register user
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📝 Step 1: User Registration');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    const registerResult = await httpRequest(
      'POST',
      `${SERVER_URL}/api/register`,
      { userId: USER_ID, browserURL: BROWSER_URL }
    );
    console.log(`✅ User registered: ${USER_ID}`);

    // Step 2: Get token
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🔑 Step 2: Token Request');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    const tokenResult = await httpRequest(
      'POST',
      `${SERVER_URL}/api/auth/token`,
      { userId: USER_ID }
    );
    token = tokenResult.token;
    console.log(`✅ Token obtained: ${token.substring(0, 20)}...`);

    // Step 3: Connect via SSE
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🔌 Step 3: SSE Connection');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    const sseUrl = new URL(`${SERVER_URL}/sse`);
    sseUrl.searchParams.set('userId', USER_ID);

    await new Promise((resolve, reject) => {
      const req = http.request({
        hostname: sseUrl.hostname,
        port: sseUrl.port,
        path: sseUrl.pathname + sseUrl.search,
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'text/event-stream',
        },
      }, async (res) => {
        if (res.statusCode !== 200) {
          reject(new Error(`SSE connection failed: ${res.statusCode}`));
          return;
        }

        console.log('✅ SSE connected');

        let buffer = '';
        res.on('data', (chunk) => {
          buffer += chunk.toString();
          const lines = buffer.split('\n\n');
          buffer = lines.pop() || '';

          for (const message of lines) {
            const dataMatch = message.match(/data: (.+)/);
            if (dataMatch) {
              try {
                const data = JSON.parse(dataMatch[1]);

                if (!sessionId && data.sessionId) {
                  sessionId = data.sessionId;
                  console.log(`✅ Session ID: ${sessionId}\n`);
                  console.log('⏳ Starting tests in 2 seconds...\n');
                  setTimeout(() => runAllToolTests(sessionId, token, pending, messageId, req, resolve), 2000);
                }

                if (data.id && pending.has(data.id)) {
                  const resolve = pending.get(data.id);
                  pending.delete(data.id);
                  resolve(data);
                }
              } catch (e) {
                console.error('⚠️  SSE parse error:', e.message);
              }
            }
          }
        });

        res.on('end', () => {
          console.log('\n❌ SSE connection closed');
          process.exit(1);
        });

        res.on('error', reject);
      });

      req.on('error', reject);
      req.end();
    });

  } catch (error) {
    console.error('\n❌ Test setup failed:', error.message);
    process.exit(1);
  }
}

// Send MCP request helper
async function sendRequest(sessionId, token, pending, messageId, method, params = {}) {
  const id = messageId.value++;
  const message = { jsonrpc: '2.0', id, method, params };

  await httpRequest(
    'POST',
    `${SERVER_URL}/message?sessionId=${sessionId}`,
    message
  );

  return new Promise((resolve) => {
    pending.set(id, resolve);
    setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id);
        resolve({ error: { code: -1, message: 'Timeout after 30s' } });
      }
    }, 30000);
  });
}

// Main test runner
async function runAllToolTests(sessionId, token, pending, msgId, sseReq, finalResolve) {
  const messageId = { value: msgId };
  const send = (method, params) => sendRequest(sessionId, token, pending, messageId, method, params);

  try {
    // Initialize
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🚀 Initializing MCP');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    const initResult = await send('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'test-suite', version: '1.0.0' },
    });

    if (initResult.error) {
      console.error('❌ Initialize failed:', initResult.error.message);
      return;
    }
    console.log('✅ MCP initialized\n');

    // List tools
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📋 Listing Available Tools');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    const toolsResult = await send('tools/list', {});
    const tools = toolsResult.result?.tools || [];
    console.log(`✅ Found ${tools.length} tools\n`);

    // Categorize tools
    const extensionTools = tools.filter(t => t.name.includes('extension'));
    const browserTools = tools.filter(t => !t.name.includes('extension'));

    // Test Extension Tools
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🔌 Testing Extension Tools (' + extensionTools.length + ' tools)');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    await testExtensionTools(send);

    // Test Browser Tools (sample)
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🌐 Testing Browser Tools (sample)');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    await testBrowserTools(send);

    // Print Summary
    printSummary();

    // Cleanup
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🧹 Cleanup');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    setTimeout(() => {
      console.log('✅ Tests completed');
      sseReq.destroy();
      finalResolve();
      process.exit(0);
    }, 1000);

  } catch (error) {
    console.error('\n❌ Test execution error:', error);
    sseReq.destroy();
    process.exit(1);
  }
}

// Test Extension Tools
async function testExtensionTools(send) {
  let extensionId = null;

  // 1. list_extensions
  console.log('Testing: list_extensions');
  const listResult = await send('tools/call', {
    name: 'list_extensions',
    arguments: {},
  });

  if (listResult.error) {
    recordTest('Extension', 'list_extensions', 'failed', listResult.error.message);
  } else {
    const content = listResult.result?.content?.[0]?.text || '';
    const match = content.match(/([a-z]{32})/);
    if (match) {
      extensionId = match[1];
      recordTest('Extension', 'list_extensions', 'passed', `Found extension: ${extensionId.substring(0, 12)}...`);
    } else {
      recordTest('Extension', 'list_extensions', 'passed', 'No extensions found (empty but working)');
    }
  }

  if (!extensionId) {
    console.log('\n⚠️  No extensions found, skipping extension-specific tests\n');
    return;
  }

  // 2. get_extension_details
  console.log('\nTesting: get_extension_details');
  const detailsResult = await send('tools/call', {
    name: 'get_extension_details',
    arguments: { extensionId },
  });
  
  if (detailsResult.error) {
    recordTest('Extension', 'get_extension_details', 'failed', detailsResult.error.message);
  } else {
    recordTest('Extension', 'get_extension_details', 'passed', 'Retrieved extension details');
  }

  // 3. list_extension_contexts
  console.log('\nTesting: list_extension_contexts');
  const contextsResult = await send('tools/call', {
    name: 'list_extension_contexts',
    arguments: { extensionId },
  });
  
  if (contextsResult.error) {
    recordTest('Extension', 'list_extension_contexts', 'failed', contextsResult.error.message);
  } else {
    recordTest('Extension', 'list_extension_contexts', 'passed', 'Listed contexts');
  }

  // 4. activate_extension_service_worker
  console.log('\nTesting: activate_extension_service_worker');
  const activateResult = await send('tools/call', {
    name: 'activate_extension_service_worker',
    arguments: { extensionId, mode: 'single' },
  });
  
  if (activateResult.error) {
    recordTest('Extension', 'activate_extension_service_worker', 'failed', activateResult.error.message);
  } else {
    recordTest('Extension', 'activate_extension_service_worker', 'passed', 'SW activated');
  }

  // 5. inspect_extension_storage
  console.log('\nTesting: inspect_extension_storage');
  const storageResult = await send('tools/call', {
    name: 'inspect_extension_storage',
    arguments: { extensionId, storageType: 'local' },
  });
  
  if (storageResult.error) {
    recordTest('Extension', 'inspect_extension_storage', 'failed', storageResult.error.message);
  } else {
    recordTest('Extension', 'inspect_extension_storage', 'passed', 'Storage inspected');
  }

  // 6. get_extension_logs
  console.log('\nTesting: get_extension_logs');
  const logsResult = await send('tools/call', {
    name: 'get_extension_logs',
    arguments: { extensionId },
  });
  
  if (logsResult.error) {
    recordTest('Extension', 'get_extension_logs', 'failed', logsResult.error.message);
  } else {
    recordTest('Extension', 'get_extension_logs', 'passed', 'Logs collected');
  }

  // 7. diagnose_extension_errors
  console.log('\nTesting: diagnose_extension_errors');
  const diagnoseResult = await send('tools/call', {
    name: 'diagnose_extension_errors',
    arguments: { extensionId, timeRange: 10 },
  });
  
  if (diagnoseResult.error) {
    recordTest('Extension', 'diagnose_extension_errors', 'failed', diagnoseResult.error.message);
  } else {
    recordTest('Extension', 'diagnose_extension_errors', 'passed', 'Errors diagnosed');
  }

  // 8. inspect_extension_manifest
  console.log('\nTesting: inspect_extension_manifest');
  const manifestResult = await send('tools/call', {
    name: 'inspect_extension_manifest',
    arguments: { extensionId, checkMV3Compatibility: true },
  });
  
  if (manifestResult.error) {
    recordTest('Extension', 'inspect_extension_manifest', 'failed', manifestResult.error.message);
  } else {
    recordTest('Extension', 'inspect_extension_manifest', 'passed', 'Manifest inspected');
  }

  // 9. check_content_script_injection
  console.log('\nTesting: check_content_script_injection');
  const csResult = await send('tools/call', {
    name: 'check_content_script_injection',
    arguments: { extensionId, testUrl: 'https://github.com' },
  });
  
  if (csResult.error) {
    recordTest('Extension', 'check_content_script_injection', 'failed', csResult.error.message);
  } else {
    recordTest('Extension', 'check_content_script_injection', 'passed', 'Content scripts checked');
  }

  // 10. evaluate_in_extension
  console.log('\nTesting: evaluate_in_extension');
  const evalResult = await send('tools/call', {
    name: 'evaluate_in_extension',
    arguments: { extensionId, code: 'chrome.runtime.id' },
  });
  
  if (evalResult.error) {
    recordTest('Extension', 'evaluate_in_extension', 'failed', evalResult.error.message);
  } else {
    recordTest('Extension', 'evaluate_in_extension', 'passed', 'Code evaluated');
  }

  // 11. reload_extension
  console.log('\nTesting: reload_extension');
  const reloadResult = await send('tools/call', {
    name: 'reload_extension',
    arguments: { extensionId, preserveStorage: true },
  });
  
  if (reloadResult.error) {
    recordTest('Extension', 'reload_extension', 'failed', reloadResult.error.message);
  } else {
    recordTest('Extension', 'reload_extension', 'passed', 'Extension reloaded');
  }
}

// Test Browser Tools (sample)
async function testBrowserTools(send) {
  // 1. list_pages
  console.log('Testing: list_pages');
  const pagesResult = await send('tools/call', {
    name: 'list_pages',
    arguments: {},
  });
  
  if (pagesResult.error) {
    recordTest('Browser', 'list_pages', 'failed', pagesResult.error.message);
  } else {
    recordTest('Browser', 'list_pages', 'passed', 'Pages listed');
  }

  // 2. new_page
  console.log('\nTesting: new_page');
  const newPageResult = await send('tools/call', {
    name: 'new_page',
    arguments: { url: 'https://example.com' },
  });
  
  if (newPageResult.error) {
    recordTest('Browser', 'new_page', 'failed', newPageResult.error.message);
  } else {
    recordTest('Browser', 'new_page', 'passed', 'New page created');
  }

  // 3. take_screenshot
  console.log('\nTesting: take_screenshot');
  const screenshotResult = await send('tools/call', {
    name: 'take_screenshot',
    arguments: { name: 'test-screenshot' },
  });
  
  if (screenshotResult.error) {
    recordTest('Browser', 'take_screenshot', 'failed', screenshotResult.error.message);
  } else {
    recordTest('Browser', 'take_screenshot', 'passed', 'Screenshot taken');
  }
}

// Print test summary
function printSummary() {
  console.log('\n');
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║                      TEST SUMMARY                              ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');
  
  console.log(`📊 Total Tests: ${testResults.total}`);
  console.log(`✅ Passed: ${testResults.passed} (${((testResults.passed/testResults.total)*100).toFixed(1)}%)`);
  console.log(`❌ Failed: ${testResults.failed} (${((testResults.failed/testResults.total)*100).toFixed(1)}%)`);
  console.log(`⏭️  Skipped: ${testResults.skipped}\n`);

  // Group by category
  const byCategory = {};
  testResults.details.forEach(({ category, toolName, status }) => {
    if (!byCategory[category]) byCategory[category] = { passed: 0, failed: 0, skipped: 0 };
    byCategory[category][status]++;
  });

  console.log('📋 Results by Category:\n');
  Object.entries(byCategory).forEach(([category, stats]) => {
    const total = stats.passed + stats.failed + stats.skipped;
    console.log(`  ${category}:`);
    console.log(`    ✅ ${stats.passed}/${total} passed`);
    if (stats.failed > 0) console.log(`    ❌ ${stats.failed}/${total} failed`);
    if (stats.skipped > 0) console.log(`    ⏭️  ${stats.skipped}/${total} skipped`);
  });

  // List failures
  const failures = testResults.details.filter(r => r.status === 'failed');
  if (failures.length > 0) {
    console.log('\n❌ Failed Tests:\n');
    failures.forEach(({ category, toolName, details }) => {
      console.log(`  • ${category}/${toolName}: ${details}`);
    });
  }
}

// Start tests
runTests().catch(console.error);
