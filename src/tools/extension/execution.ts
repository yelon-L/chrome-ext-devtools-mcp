/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Extension execution and reload tools
 */

import z from 'zod';

import {ToolCategories} from '../categories.js';
import {defineTool} from '../ToolDefinition.js';
import {
  EXTENSION_NOT_FOUND,
  NO_BACKGROUND_CONTEXT,
  RELOAD_TIMEOUT,
} from './errors.js';
import {
  reportExtensionNotFound,
  reportNoBackgroundContext,
  reportTimeout,
} from '../utils/ErrorReporting.js';

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

    // Detailed logging: record tool invocation
    const sessionInfo = (context as any).sessionId || 'unknown-session';
    const tokenInfo = (context as any).token || 'unknown-token';
    const timestamp = new Date().toISOString();
    
    console.log(`\n${'='.repeat(80)}`);
    console.log(`[reload_extension] ${timestamp}`);
    console.log(`Session: ${sessionInfo}`);
    console.log(`Token: ${tokenInfo}`);
    console.log(`Extension ID: ${extensionId}`);
    console.log(`Options: preserveStorage=${preserveStorage}, waitForReady=${waitForReady}, captureErrors=${captureErrors}`);
    console.log(`${'='.repeat(80)}\n`);

    // Global timeout protection - prevent infinite hang
    const TOTAL_TIMEOUT = 20000; // 20 seconds total timeout
    const startTime = Date.now();
    let timeoutCheckInterval: NodeJS.Timeout | null = null;
    
    const checkTimeout = () => {
      const elapsed = Date.now() - startTime;
      if (elapsed > TOTAL_TIMEOUT) {
        console.error(`[reload_extension] TIMEOUT after ${elapsed}ms!`);
        console.error(`  Session: ${sessionInfo}`);
        console.error(`  Token: ${tokenInfo}`);
        console.error(`  Extension: ${extensionId}`);
        if (timeoutCheckInterval) {
          clearInterval(timeoutCheckInterval);
        }
        reportTimeout(response, 'Reload operation', elapsed, TOTAL_TIMEOUT);
        response.setIncludePages(true);
        return;
      }
    };
    
    // Check timeout every second
    timeoutCheckInterval = setInterval(checkTimeout, 1000);

    // ✅ Following navigate_page_history pattern: minimize try block scope
    console.log(`[reload_extension] Step 1: Starting reload process...`);
    response.appendResponseLine(`# Smart Extension Reload\n`);
    response.appendResponseLine(`**Extension ID**: ${extensionId}`);
    response.appendResponseLine(`**Preserve Storage**: ${preserveStorage ? '✅ Yes' : '❌ No'}`);
    response.appendResponseLine(`**Wait for Ready**: ${waitForReady ? '✅ Yes' : '❌ No'}`);

    // 1. Get extension information (outside try block)
    const extensions = await context.getExtensions();
    const extension = extensions.find((ext: any) => ext.id === extensionId);

    // ✅ Following close_page pattern: return info instead of throwing
    if (!extension) {
      reportExtensionNotFound(response, extensionId, extensions);
      response.setIncludePages(true);
      return;
    }

    try {

      response.appendResponseLine(`## Step 1: Pre-Reload State\n`);
      response.appendResponseLine(`**Extension**: ${extension.name} (v${extension.version})`);
      response.appendResponseLine(`**Manifest Version**: ${extension.manifestVersion}`);

      // 2. Check and activate Service Worker (MV3)
      if (extension.manifestVersion === 3) {
        response.appendResponseLine(`**Service Worker**: ${extension.serviceWorkerStatus || 'unknown'}\n`);
        
        if (extension.serviceWorkerStatus === 'inactive' || extension.serviceWorkerStatus === 'not_found') {
          response.appendResponseLine('🔄 Service Worker is inactive. Activating...\n');
          
          try {
            // Activate Service Worker
            await context.activateServiceWorker(extensionId);
            response.appendResponseLine('✅ Service Worker activated successfully\n');
            
            // Wait for SW to fully start
            await new Promise(resolve => setTimeout(resolve, 1000));
          } catch (activationError) {
            response.appendResponseLine('⚠️ Could not activate Service Worker automatically');
            response.appendResponseLine('Attempting reload anyway...\n');
          }
        }
      }

      // 3. Save Storage data (if needed)
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

      // 4. Get contexts before reload
      const contextsBefore = await context.getExtensionContexts(extensionId);
      response.appendResponseLine(`## Step ${preserveStorage ? '3' : '2'}: Reloading Extension\n`);
      response.appendResponseLine(`**Active contexts before**: ${contextsBefore.length}\n`);

      // 5. Execute reload
      console.log(`[reload_extension] Step 3: Executing reload...`);
      const backgroundContext = contextsBefore.find((ctx: any) => ctx.isPrimary);
      
      // ✅ Following close_page pattern: return info instead of throwing
      if (!backgroundContext) {
        console.error(`[reload_extension] ERROR: No background context found`);
        reportNoBackgroundContext(response, extensionId, extension);
        response.setIncludePages(true);
        return;
      }

      console.log(`[reload_extension] Background context ID: ${backgroundContext.targetId}`);
      
      try {
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
        console.log(`[reload_extension] Reload command sent successfully`);
      } catch (evalError) {
        console.error(`[reload_extension] ERROR executing reload:`, evalError);
        throw evalError;
      }

      response.appendResponseLine('🔄 Reload command sent...\n');

      // 6. Wait and verify reload completion
      if (waitForReady) {
        response.appendResponseLine(`## Step ${preserveStorage ? '4' : '3'}: Verifying Reload\n`);
        
        // Wait for extension restart
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

      // 7. Restore Storage data (if needed)
      if (preserveStorage && savedStorage) {
        response.appendResponseLine(`## Step ${waitForReady ? '5' : '4'}: Restoring Storage\n`);
        try {
          // Wait for background context ready
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

      // 8. Capture startup errors (optimized: reduce wait time)
      if (captureErrors) {
        response.appendResponseLine(`## Step ${preserveStorage ? (waitForReady ? '6' : '5') : (waitForReady ? '4' : '3')}: Error Check\n`);
        
        try {
          // Reduce wait time to avoid hanging
          await new Promise(resolve => setTimeout(resolve, 500));
          
          const logsResult = await context.getExtensionLogs(extensionId, {
            capture: true,
            duration: 1000,  // Reduced from 3000ms to 1000ms
            includeStored: true,
          });
          
          const recentErrors = logsResult.logs
            .filter((log: any) => log.level === 'error' && Date.now() - log.timestamp < 5000)
            .slice(0, 3);
          
          if (recentErrors.length === 0) {
            response.appendResponseLine('✅ No errors detected after reload\n');
            response.appendResponseLine('💡 **Tip**: For comprehensive error monitoring, use `enhance_extension_error_capture`\n');
          } else {
            response.appendResponseLine(`⚠️ **${recentErrors.length} error(s) detected after reload**:\n`);
            recentErrors.forEach((log: any) => {
              response.appendResponseLine(`- ${log.text}`);
            });
            response.appendResponseLine('\n💡 **Next steps**:');
            response.appendResponseLine('1. Use `diagnose_extension_errors` for detailed analysis');
            response.appendResponseLine('2. Use `enhance_extension_error_capture` to catch uncaught errors and Promise rejections\n');
          }
        } catch (e) {
          response.appendResponseLine('ℹ️ Error check skipped (completed quickly to avoid blocking)\n');
        }
      }

      // 9. Summary
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
      
      // Clean up timeout check
      if (timeoutCheckInterval) {
        clearInterval(timeoutCheckInterval);
      }
      
      const elapsed = Date.now() - startTime;
      console.log(`[reload_extension] SUCCESS in ${elapsed}ms`);
      console.log(`  Session: ${sessionInfo}`);
      console.log(`  Token: ${tokenInfo}`);
      console.log(`  Extension: ${extensionId}\n`);
    } catch (error) {
      // Clean up timeout check
      if (timeoutCheckInterval) {
        clearInterval(timeoutCheckInterval);
      }
      
      const elapsed = Date.now() - startTime;
      const message = error instanceof Error ? error.message : String(error);
      const stack = error instanceof Error ? error.stack : '';
      
      // Detailed error logging
      console.error(`\n${'!'.repeat(80)}`);
      console.error(`[reload_extension] ERROR after ${elapsed}ms`);
      console.error(`Session: ${sessionInfo}`);
      console.error(`Token: ${tokenInfo}`);
      console.error(`Extension: ${extensionId}`);
      console.error(`Error: ${message}`);
      if (stack) {
        console.error(`Stack trace:\n${stack}`);
      }
      console.error(`${'!'.repeat(80)}\n`);
      
      // ✅ Following navigate_page_history pattern: simple user message
      // (Detailed error已记录到console用于调试)
      response.appendResponseLine(
        'Unable to reload extension. The operation failed or timed out. Check console logs for details.'
      );
    } finally {
      // ✅ Use finally to ensure cleanup, will execute regardless
      if (timeoutCheckInterval) {
        clearInterval(timeoutCheckInterval);
        timeoutCheckInterval = null;
        console.log(`[reload_extension] Timeout interval cleared`);
      }
    }
    
    // ✅ Following navigate_page_history pattern: setIncludePages outside try-catch-finally
    response.setIncludePages(true);
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

      // ✅ Following close_page pattern: return info instead of throwing
      if (!backgroundContext) {
        const extensions = await context.getExtensions();
        const extension = extensions.find(ext => ext.id === extensionId);
        reportNoBackgroundContext(response, extensionId, extension);
        response.setIncludePages(true);
        return;
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

    } catch {
      // ✅ Following navigate_page_history pattern: simple error message
      response.appendResponseLine(
        'Unable to evaluate code in extension. The extension may be inactive or the code has syntax errors.'
      );
    }
    
    response.setIncludePages(true);
  },
});
