#!/usr/bin/env node

/**
 * Extension Tools Focused Test
 * Tests all extension-related tools, especially Service Worker activation
 * when SW is inactive
 */

import http from 'node:http';
import fs from 'node:fs';

// Load credentials
const creds = JSON.parse(fs.readFileSync('/tmp/mcp-test-credentials.json', 'utf-8'));
const { server: SERVER_URL, userId: USER_ID, token: TOKEN } = creds;

console.log('╔════════════════════════════════════════════════════════════════╗');
console.log('║        Extension Tools Test - Service Worker Focus            ║');
console.log('╚════════════════════════════════════════════════════════════════╝\n');
console.log(`📡 Server: ${SERVER_URL}`);
console.log(`👤 User: ${USER_ID}`);
console.log(`🔑 Token: ${TOKEN.substring(0, 20)}...\n`);

let sessionId = null;
let messageId = 1;
const pending = new Map();
const results = [];

// HTTP helper
function httpRequest(method, url, data = null) {
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
  const message = { jsonrpc: '2.0', id, method, params };

  await httpRequest('POST', `${SERVER_URL}/message?sessionId=${sessionId}`, message);

  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id);
        resolve({ error: { message: 'Timeout (30s)' } });
      }
    }, 30000);

    pending.set(id, (data) => {
      clearTimeout(timeout);
      resolve(data);
    });
  });
}

// Record test result
function recordResult(toolName, status, details, response) {
  results.push({ toolName, status, details, response });
  const emoji = status === 'pass' ? '✅' : '❌';
  console.log(`  ${emoji} ${toolName}`);
  if (details) console.log(`     ${details}`);
}

// Parse response text
function parseResponse(result) {
  if (!result || result.error) {
    return { error: result?.error?.message || 'Unknown error' };
  }
  
  const text = result.result?.content?.[0]?.text || '';
  return { text, raw: result };
}

// Main test function
async function runTests() {
  try {
    // Connect SSE
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🔌 Connecting via SSE');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const sseUrl = new URL(`${SERVER_URL}/sse`);
    sseUrl.searchParams.set('userId', USER_ID);

    await new Promise((resolveConnection, rejectConnection) => {
      const req = http.request({
        hostname: sseUrl.hostname,
        port: sseUrl.port,
        path: sseUrl.pathname + sseUrl.search,
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${TOKEN}`,
          'Accept': 'text/event-stream',
        },
      }, async (res) => {
        if (res.statusCode !== 200) {
          console.error(`❌ SSE connection failed: ${res.statusCode}`);
          process.exit(1);
        }

        console.log('✅ SSE connected\n');

        let buffer = '';
        res.on('data', (chunk) => {
          buffer += chunk.toString();
          const lines = buffer.split('\n\n');
          buffer = lines.pop() || '';

          for (const message of lines) {
            const dataMatch = message.match(/data: (.+)/);
            if (dataMatch) {
              const dataStr = dataMatch[1].trim();
              
              // Check for session ID
              if (!sessionId && dataStr.includes('/message?sessionId=')) {
                const sidMatch = dataStr.match(/sessionId=([a-f0-9-]+)/);
                if (sidMatch) {
                  sessionId = sidMatch[1];
                  console.log(`✅ Session ID: ${sessionId}\n`);
                  console.log('⏳ Starting extension tests...\n');
                  setImmediate(() => testExtensionTools(req, resolveConnection));
                }
                continue;
              }
              
              // Parse JSON responses
              try {
                const data = JSON.parse(dataStr);
                if (data.id && pending.has(data.id)) {
                  const callback = pending.get(data.id);
                  pending.delete(data.id);
                  callback(data);
                }
              } catch (e) {
                // Ignore non-JSON messages
              }
            }
          }
        });

        res.on('end', () => {
          console.log('\n❌ SSE disconnected');
          process.exit(0);
        });
      });

      req.on('error', (err) => {
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

// Test all extension tools
async function testExtensionTools(sseReq, done) {
  try {
    // Initialize
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🚀 Initialize MCP');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const initResult = await sendRequest('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'extension-test', version: '1.0.0' },
    });

    if (initResult.error) {
      console.error('❌ Initialize failed:', initResult.error.message);
      return;
    }
    console.log('✅ MCP initialized\n');

    // Test 1: List Extensions
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('Test 1: list_extensions');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const listResult = await sendRequest('tools/call', {
      name: 'list_extensions',
      arguments: {},
    });

    const { text: listText, error: listError } = parseResponse(listResult);
    
    if (listError) {
      recordResult('list_extensions', 'fail', `Error: ${listError}`, listResult);
      console.log('\n❌ Cannot proceed without extension list\n');
      printSummary();
      sseReq.destroy();
      done();
      return;
    }

    // Extract extension ID
    const extMatch = listText.match(/([a-z]{32})/);
    if (!extMatch) {
      recordResult('list_extensions', 'fail', 'No extensions found', listResult);
      console.log('\n⚠️  No extensions installed to test\n');
      printSummary();
      sseReq.destroy();
      done();
      return;
    }

    const extensionId = extMatch[1];
    recordResult('list_extensions', 'pass', `Found extension: ${extensionId.substring(0, 16)}...`, listResult);
    console.log(`\n📦 Testing extension: ${extensionId}\n`);

    // Test 2: Get Extension Details
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('Test 2: get_extension_details');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const detailsResult = await sendRequest('tools/call', {
      name: 'get_extension_details',
      arguments: { extensionId },
    });

    const { text: detailsText, error: detailsError } = parseResponse(detailsResult);
    if (detailsError) {
      recordResult('get_extension_details', 'fail', `Error: ${detailsError}`, detailsResult);
    } else {
      const nameMatch = detailsText.match(/Name:\s*([^\n]+)/);
      const versionMatch = detailsText.match(/Version:\s*([^\n]+)/);
      recordResult('get_extension_details', 'pass', 
        `${nameMatch?.[1] || 'Unknown'} v${versionMatch?.[1] || '?'}`, detailsResult);
    }

    // Test 3: List Extension Contexts (Check SW status)
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('Test 3: list_extension_contexts (Check SW Status)');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const contextsResult = await sendRequest('tools/call', {
      name: 'list_extension_contexts',
      arguments: { extensionId },
    });

    const { text: contextsText, error: contextsError } = parseResponse(contextsResult);
    if (contextsError) {
      recordResult('list_extension_contexts', 'fail', `Error: ${contextsError}`, contextsResult);
    } else {
      const hasSW = contextsText.toLowerCase().includes('service_worker') || 
                    contextsText.toLowerCase().includes('background');
      const swStatus = hasSW ? '🟢 SW context found' : '🔴 SW context NOT found (inactive?)';
      recordResult('list_extension_contexts', 'pass', swStatus, contextsResult);
      console.log(`\n${swStatus}\n`);
    }

    // Test 4: Activate Service Worker
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('Test 4: activate_extension_service_worker (KEY TEST)');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const activateResult = await sendRequest('tools/call', {
      name: 'activate_extension_service_worker',
      arguments: { extensionId, mode: 'single' },
    });

    const { text: activateText, error: activateError } = parseResponse(activateResult);
    if (activateError) {
      recordResult('activate_extension_service_worker', 'fail', `Error: ${activateError}`, activateResult);
    } else {
      const activated = activateText.toLowerCase().includes('activated') || 
                       activateText.toLowerCase().includes('success');
      const status = activated ? '🟢 SW activated successfully' : '⚠️  Response unclear';
      recordResult('activate_extension_service_worker', 'pass', status, activateResult);
      console.log(`\n${status}\n`);
    }

    // Test 5: Verify SW is active (check contexts again)
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('Test 5: Verify SW Activation (list_extension_contexts)');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const verifyResult = await sendRequest('tools/call', {
      name: 'list_extension_contexts',
      arguments: { extensionId },
    });

    const { text: verifyText, error: verifyError } = parseResponse(verifyResult);
    if (verifyError) {
      recordResult('verify_sw_activation', 'fail', `Error: ${verifyError}`, verifyResult);
    } else {
      const hasSW = verifyText.toLowerCase().includes('service_worker') || 
                    verifyText.toLowerCase().includes('background');
      const status = hasSW ? '✅ SW is now ACTIVE' : '⚠️  SW still not visible';
      recordResult('verify_sw_activation', hasSW ? 'pass' : 'fail', status, verifyResult);
      console.log(`\n${status}\n`);
    }

    // Test 6: Get Extension Logs
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('Test 6: get_extension_logs');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const logsResult = await sendRequest('tools/call', {
      name: 'get_extension_logs',
      arguments: { extensionId },
    });

    const { text: logsText, error: logsError } = parseResponse(logsResult);
    if (logsError) {
      recordResult('get_extension_logs', 'fail', `Error: ${logsError}`, logsResult);
    } else {
      const logCount = (logsText.match(/\n/g) || []).length;
      recordResult('get_extension_logs', 'pass', `Retrieved ${logCount} log entries`, logsResult);
    }

    // Test 7: Evaluate in Extension
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('Test 7: evaluate_in_extension');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const evalResult = await sendRequest('tools/call', {
      name: 'evaluate_in_extension',
      arguments: { 
        extensionId, 
        code: 'typeof chrome !== "undefined" ? chrome.runtime.id : "no chrome API"'
      },
    });

    const { text: evalText, error: evalError } = parseResponse(evalResult);
    if (evalError) {
      recordResult('evaluate_in_extension', 'fail', `Error: ${evalError}`, evalResult);
    } else {
      const hasResult = evalText.length > 0;
      recordResult('evaluate_in_extension', 'pass', 
        hasResult ? `Result: ${evalText.substring(0, 50)}...` : 'Code executed', evalResult);
    }

    // Test 8: Inspect Extension Storage
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('Test 8: inspect_extension_storage');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const storageResult = await sendRequest('tools/call', {
      name: 'inspect_extension_storage',
      arguments: { extensionId, storageType: 'local' },
    });

    const { text: storageText, error: storageError } = parseResponse(storageResult);
    if (storageError) {
      recordResult('inspect_extension_storage', 'fail', `Error: ${storageError}`, storageResult);
    } else {
      const isEmpty = storageText.toLowerCase().includes('empty') || 
                     storageText.toLowerCase().includes('no items');
      recordResult('inspect_extension_storage', 'pass', 
        isEmpty ? 'Storage is empty' : 'Storage inspected', storageResult);
    }

    // Test 9: Diagnose Extension Errors
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('Test 9: diagnose_extension_errors');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const diagnoseResult = await sendRequest('tools/call', {
      name: 'diagnose_extension_errors',
      arguments: { extensionId, timeRange: 10 },
    });

    const { text: diagnoseText, error: diagnoseError } = parseResponse(diagnoseResult);
    if (diagnoseError) {
      recordResult('diagnose_extension_errors', 'fail', `Error: ${diagnoseError}`, diagnoseResult);
    } else {
      const hasErrors = diagnoseText.toLowerCase().includes('error found') ||
                       diagnoseText.toLowerCase().includes('errors found');
      recordResult('diagnose_extension_errors', 'pass', 
        hasErrors ? 'Errors found and analyzed' : 'No errors detected', diagnoseResult);
    }

    // Test 10: Inspect Manifest
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('Test 10: inspect_extension_manifest');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const manifestResult = await sendRequest('tools/call', {
      name: 'inspect_extension_manifest',
      arguments: { extensionId, checkMV3Compatibility: true },
    });

    const { text: manifestText, error: manifestError } = parseResponse(manifestResult);
    if (manifestError) {
      recordResult('inspect_extension_manifest', 'fail', `Error: ${manifestError}`, manifestResult);
    } else {
      const mv3 = manifestText.includes('manifest_version": 3') || manifestText.includes('MV3');
      recordResult('inspect_extension_manifest', 'pass', 
        mv3 ? '🟢 MV3 extension' : '🟡 MV2 extension', manifestResult);
    }

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

// Print summary
function printSummary() {
  console.log('\n');
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║                  EXTENSION TOOLS TEST SUMMARY                  ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  const passed = results.filter(r => r.status === 'pass').length;
  const failed = results.filter(r => r.status === 'fail').length;
  const total = results.length;

  console.log(`📊 Total Tests: ${total}`);
  console.log(`✅ Passed: ${passed} (${((passed/total)*100).toFixed(1)}%)`);
  console.log(`❌ Failed: ${failed} (${((failed/total)*100).toFixed(1)}%)\n`);

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('Test Details:\n');

  results.forEach((r, i) => {
    const emoji = r.status === 'pass' ? '✅' : '❌';
    console.log(`${i + 1}. ${emoji} ${r.toolName}`);
    if (r.details) console.log(`   ${r.details}`);
  });

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  
  // Key findings
  const swActivated = results.find(r => r.toolName === 'activate_extension_service_worker');
  const swVerified = results.find(r => r.toolName === 'verify_sw_activation');
  
  console.log('\n🔑 Key Findings:\n');
  
  if (swActivated?.status === 'pass') {
    console.log('✅ Service Worker activation tool is working');
  }
  
  if (swVerified?.status === 'pass') {
    console.log('✅ Service Worker successfully activated and verified');
  } else if (swVerified?.status === 'fail') {
    console.log('⚠️  Service Worker activation may need investigation');
  }
}

// Run tests
runTests();
