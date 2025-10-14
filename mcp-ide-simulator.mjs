#!/usr/bin/env node

/**
 * MCP IDE Simulator
 * 
 * Simulates how a real IDE (like Claude Desktop, Cline) interacts with MCP server
 * This is NOT a simple script - it follows the exact MCP protocol flow
 */

import http from 'node:http';
import fs from 'node:fs';

// Load credentials
const creds = JSON.parse(fs.readFileSync('/tmp/mcp-test-credentials.json', 'utf-8'));
const { server: SERVER_URL, userId: USER_ID, token: TOKEN } = creds;

console.log('╔════════════════════════════════════════════════════════════════╗');
console.log('║              MCP IDE Simulator - Protocol Flow                 ║');
console.log('╚════════════════════════════════════════════════════════════════╝\n');
console.log(`📡 Connecting as IDE to: ${SERVER_URL}`);
console.log(`👤 User: ${USER_ID}\n`);

// MCP State
let sessionId = null;
let messageId = 1;
const pending = new Map();
let serverCapabilities = null;
let availableTools = [];

// HTTP Request Helper
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

// Send MCP Request
async function sendMCPRequest(method, params = {}) {
  const id = messageId++;
  const message = {
    jsonrpc: '2.0',
    id,
    method,
    params,
  };

  console.log(`\n→ MCP Request #${id}:`);
  console.log(`  Method: ${method}`);
  console.log(`  Params:`, JSON.stringify(params, null, 2).split('\n').map((l, i) => i === 0 ? l : '    ' + l).join('\n'));

  await httpRequest('POST', `${SERVER_URL}/message?sessionId=${sessionId}`, message);

  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id);
        console.log(`  ⏰ Timeout after 30s`);
        resolve({ error: { message: 'Timeout (30s)' } });
      }
    }, 30000);

    pending.set(id, (data) => {
      clearTimeout(timeout);
      console.log(`\n← MCP Response #${id}:`);
      if (data.error) {
        console.log(`  ❌ Error:`, data.error);
      } else if (data.result) {
        console.log(`  ✅ Success`);
        // Show brief result
        const result = data.result;
        if (result.content) {
          const text = result.content[0]?.text || '';
          console.log(`  Content: ${text.substring(0, 200)}${text.length > 200 ? '...' : ''}`);
        } else {
          console.log(`  Result:`, JSON.stringify(result).substring(0, 200));
        }
      }
      resolve(data);
    });
  });
}

// Main IDE Flow
async function simulateIDEInteraction() {
  try {
    // ═══════════════════════════════════════════════════════════════
    // STEP 1: Establish SSE Connection (like IDE does)
    // ═══════════════════════════════════════════════════════════════
    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('STEP 1: Establish SSE Connection');
    console.log('═══════════════════════════════════════════════════════════════');
    
    const sseUrl = new URL(`${SERVER_URL}/sse`);
    sseUrl.searchParams.set('userId', USER_ID);

    await new Promise((resolveConnection) => {
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
          console.error(`❌ SSE failed: ${res.statusCode}`);
          process.exit(1);
        }

        console.log('✅ SSE Connection established');

        let buffer = '';
        res.on('data', (chunk) => {
          buffer += chunk.toString();
          const lines = buffer.split('\n\n');
          buffer = lines.pop() || '';

          for (const message of lines) {
            const dataMatch = message.match(/data: (.+)/);
            if (dataMatch) {
              const dataStr = dataMatch[1].trim();
              
              // Get session ID
              if (!sessionId && dataStr.includes('/message?sessionId=')) {
                const sidMatch = dataStr.match(/sessionId=([a-f0-9-]+)/);
                if (sidMatch) {
                  sessionId = sidMatch[1];
                  console.log(`✅ Session ID received: ${sessionId}`);
                  console.log(`   This is how IDE gets the session for subsequent calls\n`);
                  
                  // Start IDE interaction flow
                  setTimeout(() => ideWorkflow(req, resolveConnection), 500);
                }
                continue;
              }
              
              // Handle MCP responses
              try {
                const data = JSON.parse(dataStr);
                if (data.id && pending.has(data.id)) {
                  const callback = pending.get(data.id);
                  pending.delete(data.id);
                  callback(data);
                }
              } catch (e) {
                // Ignore non-JSON
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

// IDE Workflow - This is what a real IDE does
async function ideWorkflow(sseReq, done) {
  try {
    // ═══════════════════════════════════════════════════════════════
    // STEP 2: Initialize MCP Session (Required by MCP spec)
    // ═══════════════════════════════════════════════════════════════
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('STEP 2: Initialize MCP Session');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('IDE sends initialize to negotiate protocol version and capabilities');
    
    const initResult = await sendMCPRequest('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {
        // IDE capabilities
        roots: { listChanged: true },
        sampling: {},
      },
      clientInfo: {
        name: 'MCP-IDE-Simulator',
        version: '1.0.0',
      },
    });

    if (initResult.error) {
      console.error('❌ Initialize failed');
      process.exit(1);
    }

    serverCapabilities = initResult.result?.capabilities;
    console.log('\n📋 Server capabilities:', serverCapabilities);

    // ═══════════════════════════════════════════════════════════════
    // STEP 3: List Available Tools (IDE discovers what it can do)
    // ═══════════════════════════════════════════════════════════════
    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('STEP 3: Discover Available Tools');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('IDE calls tools/list to see what tools are available');

    const toolsResult = await sendMCPRequest('tools/list', {});
    availableTools = toolsResult.result?.tools || [];
    
    console.log(`\n✅ Found ${availableTools.length} tools:`);
    const extensionTools = availableTools.filter(t => t.name.includes('extension'));
    const browserTools = availableTools.filter(t => !t.name.includes('extension'));
    console.log(`   🔌 Extension tools: ${extensionTools.length}`);
    console.log(`   🌐 Browser tools: ${browserTools.length}`);

    // Show extension tools
    console.log('\n📋 Extension Tools Available:');
    extensionTools.forEach((tool, i) => {
      console.log(`   ${i + 1}. ${tool.name}`);
      console.log(`      ${tool.description.split('\n')[0]}`);
    });

    // ═══════════════════════════════════════════════════════════════
    // STEP 4: IDE's Intelligent Tool Usage
    // ═══════════════════════════════════════════════════════════════
    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('STEP 4: IDE Intelligently Uses Tools');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('IDE reads tool descriptions and understands prerequisites');
    console.log('For extension debugging, IDE knows to:');
    console.log('  1. First call list_extensions to discover extensions');
    console.log('  2. Check SW status');
    console.log('  3. Activate SW if needed');
    console.log('  4. Then call other tools\n');

    // ───────────────────────────────────────────────────────────────
    // Tool Call 1: list_extensions (First attempt - without includeDisabled)
    // ───────────────────────────────────────────────────────────────
    console.log('\n───────────────────────────────────────────────────────────────');
    console.log('Tool Call 1: list_extensions (Standard call)');
    console.log('───────────────────────────────────────────────────────────────');
    console.log('IDE: "User wants to debug extensions, let me see what\'s installed"');
    console.log('IDE: "First, I\'ll try the standard call to see enabled extensions"');
    
    let listResult = await sendMCPRequest('tools/call', {
      name: 'list_extensions',
      arguments: {},  // 先不带参数，看看有什么
    });

    let foundExtensions = [];
    if (listResult.result?.content) {
      const text = listResult.result.content[0]?.text || '';
      
      // IDE parses the response
      const extMatches = text.match(/\*\*ID\*\*:\s*([a-z]{32})/g);
      if (extMatches) {
        foundExtensions = extMatches.map(m => m.match(/([a-z]{32})/)[1]);
        console.log(`\n✅ IDE parsed: Found ${foundExtensions.length} enabled extension(s)`);
        foundExtensions.forEach((id, i) => {
          // Extract name
          const nameMatch = text.match(new RegExp(`##\\s*([^\\n]+)[\\s\\S]*?${id}`));
          const name = nameMatch ? nameMatch[1].trim() : 'Unknown';
          console.log(`   ${i + 1}. ${name} (${id.substring(0, 12)}...)`);
        });
      } else {
        console.log('\n⚠️  IDE: No enabled extensions found');
        console.log('   IDE Decision: Try with includeDisabled=true parameter');
      }
    }
    
    // ───────────────────────────────────────────────────────────────
    // Tool Call 2: list_extensions (Second attempt - with includeDisabled)
    // ───────────────────────────────────────────────────────────────
    console.log('\n───────────────────────────────────────────────────────────────');
    console.log('Tool Call 2: list_extensions (with includeDisabled=true)');
    console.log('───────────────────────────────────────────────────────────────');
    console.log('IDE: "Let me check if there are disabled extensions too"');
    
    const listExtTool = availableTools.find(t => t.name === 'list_extensions');
    if (listExtTool) {
      console.log('\n📖 Reading tool schema to understand parameters:');
      console.log(JSON.stringify(listExtTool.inputSchema, null, 2));
      console.log('\n💡 IDE: I see there\'s an includeDisabled parameter!');
    }
    
    listResult = await sendMCPRequest('tools/call', {
      name: 'list_extensions',
      arguments: {
        includeDisabled: true,  // IDE智能决定使用这个参数
      },
    });

    let allExtensions = [];
    if (listResult.result?.content) {
      const text = listResult.result.content[0]?.text || '';
      console.log('\n📄 Full Response (showing first 500 chars):');
      console.log('─'.repeat(60));
      console.log(text.substring(0, 500));
      if (text.length > 500) console.log('...[truncated]...');
      console.log('─'.repeat(60));
      
      // IDE parses the response more carefully
      const extMatches = text.match(/\*\*ID\*\*:\s*([a-z]{32})/g);
      if (extMatches) {
        allExtensions = extMatches.map(m => m.match(/([a-z]{32})/)[1]);
        console.log(`\n🎯 IDE Analysis: Found ${allExtensions.length} total extension(s)`);
        
        // Parse each extension details
        allExtensions.forEach((id, i) => {
          // Find the extension section
          const idPos = text.indexOf(id);
          const section = text.substring(Math.max(0, idPos - 200), idPos + 200);
          
          // Extract details
          const nameMatch = section.match(/##\s*([^\n]+)/);
          const statusMatch = section.match(/\*\*Status\*\*:\s*([^\n]+)/);
          const swMatch = section.match(/\*\*Service Worker\*\*:\s*([^\n]+)/);
          
          const name = nameMatch ? nameMatch[1].trim() : 'Unknown';
          const status = statusMatch ? statusMatch[1].trim() : 'Unknown';
          const sw = swMatch ? swMatch[1].trim() : 'N/A';
          
          console.log(`\n   ${i + 1}. ${name}`);
          console.log(`      ID: ${id}`);
          console.log(`      Status: ${status}`);
          if (sw !== 'N/A') console.log(`      SW: ${sw}`);
        });
        
        // Check for specific extensions
        const hasEnhancedMCP = allExtensions.some(id => 
          text.includes(id) && text.includes('Enhanced MCP')
        );
        const hasVideoSRT = allExtensions.some(id => 
          text.includes(id) && text.includes('Video SRT')
        );
        
        console.log('\n📊 Target Extensions Check:');
        console.log(`   ${hasEnhancedMCP ? '✅' : '❌'} Enhanced MCP Debug Test Extension`);
        console.log(`   ${hasVideoSRT ? '✅' : '❌'} Video SRT Ext MVP`);
        
        foundExtensions = allExtensions;
      } else {
        console.log('\n⚠️  IDE: Still no extensions detected!');
        console.log('   Response says:', text.split('\n')[0]);
        console.log('   This means the visual detection fallback may have been used');
      }
    }

    // ───────────────────────────────────────────────────────────────
    // IDE's Next Decision
    // ───────────────────────────────────────────────────────────────
    if (foundExtensions.length === 0) {
      console.log('\n───────────────────────────────────────────────────────────────');
      console.log('IDE Decision Tree: No extensions found');
      console.log('───────────────────────────────────────────────────────────────');
      console.log('🤔 IDE considers options:');
      console.log('   Option 1: Navigate to chrome://extensions/ and screenshot');
      console.log('   Option 2: Ask user to enable at least one extension');
      console.log('   Option 3: Try visual inspection method');
      console.log('\n💡 IDE chooses: Visual inspection via navigate + evaluate');
      
      console.log('\n───────────────────────────────────────────────────────────────');
      console.log('Tool Call 2: navigate_to (Visual Inspection)');
      console.log('───────────────────────────────────────────────────────────────');
      
      const navResult = await sendMCPRequest('tools/call', {
        name: 'navigate_to_url',
        arguments: {
          url: 'chrome://extensions/',
        },
      });
      
      console.log('\n🤔 IDE: Now let me take a screenshot to see what\'s there');
      
      console.log('\n───────────────────────────────────────────────────────────────');
      console.log('Tool Call 3: take_screenshot');
      console.log('───────────────────────────────────────────────────────────────');
      
      const screenshotResult = await sendMCPRequest('tools/call', {
        name: 'take_screenshot',
        arguments: {
          name: 'extensions_page_inspection',
        },
      });
      
      if (screenshotResult.result?.content) {
        const text = screenshotResult.result.content[0]?.text || '';
        console.log('\n✅ IDE: Screenshot taken');
        console.log('   IDE can now visually analyze the extensions page');
        console.log('   This shows ALL extensions regardless of state');
      }
    } else {
      // Test other extension tools
      const testExtId = foundExtensions[0];
      
      console.log(`\n───────────────────────────────────────────────────────────────`);
      console.log(`Tool Call 2: list_extension_contexts (Check SW status)`);
      console.log(`───────────────────────────────────────────────────────────────`);
      console.log(`🤔 IDE: Let me check if Service Worker is active for ${testExtId.substring(0, 12)}...`);
      
      const contextsResult = await sendMCPRequest('tools/call', {
        name: 'list_extension_contexts',
        arguments: { extensionId: testExtId },
      });
      
      if (contextsResult.result?.content) {
        const text = contextsResult.result.content[0]?.text || '';
        const hasSW = text.toLowerCase().includes('service_worker');
        
        console.log(`\n📊 IDE analysis: SW is ${hasSW ? '🟢 ACTIVE' : '🔴 INACTIVE'}`);
        
        if (!hasSW) {
          console.log('\n🤔 IDE decision: SW is inactive, I should activate it first');
          console.log('   (This is prerequisite awareness from tool descriptions)');
          
          console.log(`\n───────────────────────────────────────────────────────────────`);
          console.log(`Tool Call 3: activate_extension_service_worker`);
          console.log(`───────────────────────────────────────────────────────────────`);
          
          const activateResult = await sendMCPRequest('tools/call', {
            name: 'activate_extension_service_worker',
            arguments: { 
              extensionId: testExtId,
              mode: 'single',
            },
          });
          
          console.log('\n✅ IDE: Now SW should be active, I can call other tools');
        }
      }
    }

    // ═══════════════════════════════════════════════════════════════
    // STEP 5: Summary
    // ═══════════════════════════════════════════════════════════════
    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('STEP 5: IDE Workflow Summary');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('\n✅ What IDE did:');
    console.log('   1. Established SSE connection');
    console.log('   2. Initialized MCP protocol');
    console.log('   3. Discovered available tools');
    console.log('   4. Read tool descriptions to understand prerequisites');
    console.log('   5. Made intelligent decisions based on results');
    console.log('   6. Used fallback strategies when needed');
    
    console.log('\n🎯 Key Differences from Simple Scripts:');
    console.log('   ✅ IDE understands tool relationships');
    console.log('   ✅ IDE reads descriptions and makes smart decisions');
    console.log('   ✅ IDE handles prerequisites automatically');
    console.log('   ✅ IDE uses fallback strategies (visual inspection)');
    console.log('   ✅ IDE parses and interprets responses intelligently');

    console.log('\n💡 For Extension Detection Issue:');
    console.log('   Problem: list_extensions cannot detect disabled/inactive extensions');
    console.log('   IDE Solution: Falls back to visual inspection automatically');
    console.log('   → navigate_to chrome://extensions/');
    console.log('   → screenshot or evaluate_script to parse DOM');
    console.log('   → Extract ALL extensions regardless of state');

    console.log('\n✅ Test Complete!\n');

    setTimeout(() => {
      sseReq.destroy();
      done();
      process.exit(0);
    }, 1000);

  } catch (error) {
    console.error('\n❌ Error:', error);
    process.exit(1);
  }
}

// Start simulation
simulateIDEInteraction();
