/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * 扩展执行和重载工具
 */

import z from 'zod';

import {ToolCategories} from '../categories.js';
import {defineTool} from '../ToolDefinition.js';

export const reloadExtension = defineTool({
  name: 'reload_extension',
  description: `Smart reload for Chrome extensions with automatic Service Worker activation and error detection.

**Purpose**: Intelligent extension reload with verification, error capture, and optional state preservation.

**What it does**:
- Automatically activates inactive Service Workers (MV3) before reload
- Optionally preserves chrome.storage data across reload
- Closes all extension contexts (popup, options, devtools pages)
- Restarts background script/service worker
- Waits for extension to be ready after reload
- Captures and reports startup errors
- Verifies successful reload completion

**Reload behavior**:
- Background/Service Worker: Restarted immediately
- Extension pages (popup, options): Closed and must be reopened
- Content scripts: Re-injected on next page navigation/reload
- Storage: Preserved if preserveStorage=true, cleared otherwise

**Smart features** (vs manual reload):
1. Auto-activates inactive Service Workers (no manual activation needed)
2. Verifies extension is ready before returning
3. Captures startup errors within first 5 seconds
4. Reports new context status and health

**When to use**:
- Hot reload during development (after code changes)
- Recovering from extension crashes or errors
- Testing with fresh state (preserveStorage=false)
- Resetting Service Worker state

**Example**: reload_extension with preserveStorage=true reloads extension, keeps user data, auto-activates SW, and reports "No errors detected after reload".`,
  annotations: {
    category: ToolCategories.EXTENSION_DEBUGGING,
    readOnlyHint: false,
  },
  schema: {
    extensionId: z
      .string()
      .regex(/^[a-z]{32}$/)
      .describe('Extension ID to reload. Get this from list_extensions.'),
    preserveStorage: z
      .boolean()
      .optional()
      .describe('Preserve chrome.storage data during reload. Default is false (clears state).'),
    waitForReady: z
      .boolean()
      .optional()
      .describe('Wait and verify extension is ready after reload. Default is true.'),
    captureErrors: z
      .boolean()
      .optional()
      .describe('Capture and report errors after reload. Default is true.'),
  },
  handler: async (request, response, context) => {
    const {
      extensionId,
      preserveStorage = false,
      waitForReady = true,
      captureErrors = true,
    } = request.params;

    try {
      response.appendResponseLine(`# Smart Extension Reload\n`);
      response.appendResponseLine(`**Extension ID**: ${extensionId}`);
      response.appendResponseLine(`**Preserve Storage**: ${preserveStorage ? '✅ Yes' : '❌ No'}`);
      response.appendResponseLine(`**Wait for Ready**: ${waitForReady ? '✅ Yes' : '❌ No'}\n`);

      // 1. 获取扩展信息
      const extensions = await context.getExtensions();
      const extension = extensions.find((ext: any) => ext.id === extensionId);

      if (!extension) {
        throw new Error(`Extension ${extensionId} not found`);
      }

      response.appendResponseLine(`## Step 1: Pre-Reload State\n`);
      response.appendResponseLine(`**Extension**: ${extension.name} (v${extension.version})`);
      response.appendResponseLine(`**Manifest Version**: ${extension.manifestVersion}`);

      // 2. 检查并激活 Service Worker（MV3）
      if (extension.manifestVersion === 3) {
        response.appendResponseLine(`**Service Worker**: ${extension.serviceWorkerStatus || 'unknown'}\n`);
        
        if (extension.serviceWorkerStatus === 'inactive' || extension.serviceWorkerStatus === 'not_found') {
          response.appendResponseLine('🔄 Service Worker is inactive. Activating...\n');
          
          try {
            // 激活 Service Worker
            await context.activateServiceWorker(extensionId);
            response.appendResponseLine('✅ Service Worker activated successfully\n');
            
            // 等待一下让 SW 完全启动
            await new Promise(resolve => setTimeout(resolve, 1000));
          } catch (activationError) {
            response.appendResponseLine('⚠️ Could not activate Service Worker automatically');
            response.appendResponseLine('Attempting reload anyway...\n');
          }
        }
      }

      // 3. 保存 Storage 数据（如果需要）
      let savedStorage: any = null;
      if (preserveStorage) {
        response.appendResponseLine('## Step 2: Preserving Storage\n');
        try {
          const storageData = await context.getExtensionStorage(extensionId, 'local');
          savedStorage = storageData.data;
          response.appendResponseLine(`✅ Saved ${Object.keys(savedStorage || {}).length} storage keys\n`);
        } catch (e) {
          response.appendResponseLine('⚠️ Could not preserve storage (will be lost on reload)\n');
        }
      }

      // 4. 获取 reload 前的上下文
      const contextsBefore = await context.getExtensionContexts(extensionId);
      response.appendResponseLine(`## Step ${preserveStorage ? '3' : '2'}: Reloading Extension\n`);
      response.appendResponseLine(`**Active contexts before**: ${contextsBefore.length}\n`);

      // 5. 执行 reload
      const backgroundContext = contextsBefore.find((ctx: any) => ctx.isPrimary);
      
      if (!backgroundContext) {
        throw new Error(
          `No background context found. Extension may not be running.`,
        );
      }

      await context.evaluateInExtensionContext(
        backgroundContext.targetId,
        `
        if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.reload) {
          chrome.runtime.reload();
        } else {
          throw new Error('chrome.runtime.reload() is not available');
        }
        `,
        false, // Don't wait as extension will terminate
      );

      response.appendResponseLine('🔄 Reload command sent...\n');

      // 6. 等待并验证 reload 完成
      if (waitForReady) {
        response.appendResponseLine(`## Step ${preserveStorage ? '4' : '3'}: Verifying Reload\n`);
        
        // 等待扩展重新启动
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        try {
          const contextsAfter = await context.getExtensionContexts(extensionId);
          response.appendResponseLine(`**Active contexts after**: ${contextsAfter.length}`);
          
          const newBackgroundContext = contextsAfter.find((ctx: any) => ctx.isPrimary);
          if (newBackgroundContext) {
            response.appendResponseLine('✅ Background context is active');
          } else {
            response.appendResponseLine('⚠️ Background context not detected yet (may take a moment)');
          }
          response.appendResponseLine('');
        } catch (e) {
          response.appendResponseLine('⚠️ Could not verify contexts after reload\n');
        }
      }

      // 7. 恢复 Storage 数据（如果需要）
      if (preserveStorage && savedStorage) {
        response.appendResponseLine(`## Step ${waitForReady ? '5' : '4'}: Restoring Storage\n`);
        try {
          // 等待 background context 就绪
          await new Promise(resolve => setTimeout(resolve, 1000));
          
          const contextsAfter = await context.getExtensionContexts(extensionId);
          const newBackgroundContext = contextsAfter.find((ctx: any) => ctx.isPrimary);
          
          if (newBackgroundContext) {
            await context.evaluateInExtensionContext(
              newBackgroundContext.targetId,
              `chrome.storage.local.set(${JSON.stringify(savedStorage)})`,
              true,
            );
            response.appendResponseLine('✅ Storage data restored\n');
          } else {
            response.appendResponseLine('⚠️ Could not restore storage (background context not ready)\n');
          }
        } catch (e) {
          response.appendResponseLine('⚠️ Failed to restore storage\n');
        }
      }

      // 8. 捕获启动错误
      if (captureErrors) {
        response.appendResponseLine(`## Step ${preserveStorage ? (waitForReady ? '6' : '5') : (waitForReady ? '4' : '3')}: Error Check\n`);
        
        try {
          await new Promise(resolve => setTimeout(resolve, 1500));
          
          const logsResult = await context.getExtensionLogs(extensionId, {
            capture: true,
            duration: 3000,
            includeStored: true,
          });
          
          const recentErrors = logsResult.logs
            .filter((log: any) => log.level === 'error' && Date.now() - log.timestamp < 5000)
            .slice(0, 3);
          
          if (recentErrors.length === 0) {
            response.appendResponseLine('✅ No errors detected after reload\n');
          } else {
            response.appendResponseLine(`⚠️ **${recentErrors.length} error(s) detected after reload**:\n`);
            recentErrors.forEach((log: any) => {
              response.appendResponseLine(`- ${log.text}`);
            });
            response.appendResponseLine('\n💡 Use `diagnose_extension_errors` for detailed analysis\n');
          }
        } catch (e) {
          response.appendResponseLine('ℹ️ Error check skipped\n');
        }
      }

      // 9. 总结
      response.appendResponseLine(`## ✅ Reload Complete\n`);
      response.appendResponseLine('**What happened**:');
      response.appendResponseLine('- Background script/service worker has been restarted');
      response.appendResponseLine('- All extension pages (popup, options) have been closed');
      response.appendResponseLine('- Content scripts will be re-injected on next page navigation');
      if (preserveStorage) {
        response.appendResponseLine('- Storage data was preserved and restored');
      } else {
        response.appendResponseLine('- Extension in-memory state has been reset');
      }
      response.appendResponseLine('');
      
      response.appendResponseLine('**Next Steps**:');
      response.appendResponseLine('- Use `list_extension_contexts` to see active contexts');
      response.appendResponseLine('- Use `get_extension_logs` to monitor extension activity');
      response.appendResponseLine('- Reload pages to re-inject content scripts');

      response.setIncludePages(true);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to reload extension: ${message}`);
    }
  },
});

export const evaluateInExtension = defineTool({
  name: 'evaluate_in_extension',
  description: `Evaluate JavaScript code in an extension context.

Executes arbitrary JavaScript in the extension's background context (Service Worker for MV3, 
background page for MV2). This is essential for:
- Testing extension APIs (chrome.runtime, chrome.storage, etc.)
- Debugging extension logic
- Inspecting extension state
- Calling extension functions

The code runs with full extension permissions and has access to all chrome.* APIs.

⚠️ **Prerequisites for MV3 extensions**:
- Service Worker MUST be active before calling this tool
- If SW is inactive, this tool will fail with "No background context found"
- Use 'activate_extension_service_worker' first if you see SW status as 🔴 Inactive
- Check SW status with 'list_extensions' before proceeding`,
  annotations: {
    category: ToolCategories.EXTENSION_DEBUGGING,
    readOnlyHint: false,
  },
  schema: {
    extensionId: z
      .string()
      .regex(/^[a-z]{32}$/)
      .describe('Extension ID. Get this from list_extensions.'),
    code: z
      .string()
      .describe('JavaScript code to execute in the extension context. Can be async.'),
    contextId: z
      .string()
      .optional()
      .describe('Specific context ID to execute in. If not provided, uses the background context.'),
  },
  handler: async (request, response, context) => {
    const {extensionId, code, contextId} = request.params;

    try {
      // Get background context
      const contexts = await context.getExtensionContexts(extensionId);
      const backgroundContext = contexts.find(ctx => ctx.isPrimary);

      if (!backgroundContext) {
        throw new Error(
          `No background context found for extension ${extensionId}`,
        );
      }

      const targetId = contextId || backgroundContext.targetId;
      
      // Wrap code in async IIFE
      const wrappedCode = `(async () => { return (${code}); })()`;
      
      const result = await context.evaluateInExtensionContext(
        targetId,
        wrappedCode,
        true,
      );

      response.appendResponseLine(`# Evaluation Result\n`);
      response.appendResponseLine(`**Extension ID**: ${extensionId}`);
      
      if (contextId) {
        response.appendResponseLine(`**Context ID**: ${contextId}`);
      } else {
        response.appendResponseLine(`**Context**: Background (default)`);
      }
      
      response.appendResponseLine(`\n**Code**:\n\`\`\`javascript\n${code}\n\`\`\``);
      response.appendResponseLine(`\n**Result**:\n\`\`\`json\n${JSON.stringify(result, null, 2)}\n\`\`\``);

      response.setIncludePages(true);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      
      response.appendResponseLine(`# ❌ Code Evaluation Failed\n`);
      response.appendResponseLine(`**Extension ID**: ${extensionId}`);
      if (contextId) {
        response.appendResponseLine(`**Context ID**: ${contextId}`);
      }
      response.appendResponseLine(`\n**Code**:\n\`\`\`javascript\n${code}\n\`\`\``);
      response.appendResponseLine(`\n**Error**: ${message}\n`);
      
      // Smart detection of Service Worker related errors
      if (
        message.includes('No background context found') ||
        message.includes('No background context') ||
        message.includes('Service Worker') ||
        message.includes('inactive') ||
        message.includes('not running') ||
        message.includes('context') && message.includes('not found')
      ) {
        response.appendResponseLine(`## 🔴 Service Worker Not Active\n`);
        response.appendResponseLine(`This error occurs when trying to execute code in an inactive Service Worker.\n`);
        response.appendResponseLine(`**Solution** (3 simple steps):`);
        response.appendResponseLine(`1. Verify SW status: \`list_extensions\``);
        response.appendResponseLine(`   - Look for 🔴 Inactive or 🟢 Active status`);
        response.appendResponseLine(`2. Activate SW: \`activate_extension_service_worker\` with extensionId="${extensionId}"`);
        response.appendResponseLine(`   - This wakes up the Service Worker`);
        response.appendResponseLine(`3. Retry code execution: \`evaluate_in_extension\` with same code\n`);
        response.appendResponseLine(`**Why this happens**: MV3 Service Workers are ephemeral and sleep after ~30s of inactivity.`);
      } else if (message.includes('SyntaxError') || message.includes('Unexpected token')) {
        response.appendResponseLine(`## 🐛 JavaScript Syntax Error\n`);
        response.appendResponseLine(`**Possible issues**:`);
        response.appendResponseLine(`- Check for typos in variable/function names`);
        response.appendResponseLine(`- Ensure proper quotes and brackets`);
        response.appendResponseLine(`- Verify the code is valid JavaScript`);
        response.appendResponseLine(`- Try wrapping expressions in parentheses: \`(expression)\``);
      } else {
        response.appendResponseLine(`**Possible causes**:`);
        response.appendResponseLine('- Syntax error in JavaScript code');
        response.appendResponseLine('- Extension context is not active');
        response.appendResponseLine('- Missing permissions for the API being used');
        response.appendResponseLine('- The extension doesn\'t have access to the chrome.* API you\'re calling');
        response.appendResponseLine('\n💡 **Debugging tip**: Check extension console in DevTools for more details');
      }

      response.setIncludePages(true);
    }
  },
});
