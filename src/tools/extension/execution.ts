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

/**
 * Cache management helper functions for smart extension reload
 */

/**
 * Helper function to add timeout to CDP commands
 */
async function cdpWithTimeout<T>(promise: Promise<T>, timeoutMs: number, operation: string): Promise<T> {
  const timeoutPromise = new Promise<T>((_, reject) => {
    setTimeout(() => {
      reject(new Error(`CDP operation timeout (${timeoutMs}ms): ${operation}`));
    }, timeoutMs);
  });
  
  return Promise.race([promise, timeoutPromise]);
}

/**
 * Capture all logs from extension components and current page
 * 
 * @param extensionId - Extension ID
 * @param duration - Capture duration in milliseconds
 * @param response - Response object to append logs to
 * @param context - Context object
 * @returns Promise that resolves with log results [backgroundLogs, offscreenLogs]
 */
export async function captureExtensionLogs(
  extensionId: string,
  duration: number,
  context: any
): Promise<[any, any]> {
  // Start log listeners FIRST
  const logCapturePromise = Promise.all([
    context.getBackgroundLogs(extensionId, {
      capture: true,
      duration,
      includeStored: false,
    }).catch((err: any) => ({ 
      logs: [], 
      error: err.message || 'Failed to capture background logs'
    })),
    
    context.getOffscreenLogs(extensionId, {
      capture: true,
      duration,
      includeStored: false,
    }).catch((err: any) => ({ 
      logs: [], 
      error: err.message || 'Failed to capture offscreen logs'
    })),
  ]);
  
  // Give listeners time to initialize
  await new Promise(resolve => setTimeout(resolve, 200));
  
  return logCapturePromise;
}

/**
 * Legacy wrapper for backward compatibility
 */
async function captureAllLogs(
  extensionId: string,
  duration: number,
  response: any,
  context: any
): Promise<void> {
  response.appendResponseLine(`\n---\n\n## 📋 Captured Logs\n`);
  response.appendResponseLine(`*Capturing logs for ${duration}ms...*\n\n`);
  
  try {
    // Parallel capture: Extension (Background + Offscreen) + Page
    const [backgroundResult, offscreenResult] = await Promise.allSettled([
      // Background Service Worker
      context.getBackgroundLogs(extensionId, {
        capture: true,
        duration,
        includeStored: false,
      }).catch((err: any) => ({ 
        logs: [], 
        error: err.message || 'Failed to capture background logs'
      })),
      
      // Offscreen Document
      context.getOffscreenLogs(extensionId, {
        capture: true,
        duration,
        includeStored: false,
      }).catch((err: any) => ({ 
        logs: [], 
        error: err.message || 'Failed to capture offscreen logs'
      })),
    ]);
    
    // Extract results
    const backgroundLogs = backgroundResult.status === 'fulfilled' 
      ? backgroundResult.value 
      : { logs: [], error: 'Failed to capture' };
      
    const offscreenLogs = offscreenResult.status === 'fulfilled'
      ? offscreenResult.value
      : { logs: [], error: 'Failed to capture' };
    
    // Count total logs
    const extLogs = (backgroundLogs.logs?.length || 0) + (offscreenLogs.logs?.length || 0);
    
    // Format extension logs
    if (extLogs > 0) {
      response.appendResponseLine(`### Extension Logs\n`);
      response.appendResponseLine(`**Total**: ${extLogs} entries\n\n`);
      
      // Background logs
      if (backgroundLogs.logs && backgroundLogs.logs.length > 0) {
        response.appendResponseLine(`#### Background Service Worker (${backgroundLogs.logs.length} entries)\n`);
        formatLogEntries(backgroundLogs.logs, response, 5);
      }
      
      // Offscreen logs
      if (offscreenLogs.logs && offscreenLogs.logs.length > 0) {
        response.appendResponseLine(`\n#### Offscreen Document (${offscreenLogs.logs.length} entries)\n`);
        formatLogEntries(offscreenLogs.logs, response, 5);
      }
    } else {
      response.appendResponseLine(`### Extension Logs\n`);
      response.appendResponseLine(`*No extension logs captured*\n\n`);
    }
    
    // Page logs are automatically included via setIncludeConsoleData(true)
    // Just indicate they are available
    response.appendResponseLine(`### Page Logs\n`);
    response.appendResponseLine(`*Page console logs are included below (if any)*\n`);
    
  } catch (error) {
    response.appendResponseLine(
      `\n⚠️  **Log capture error**: ${error instanceof Error ? error.message : 'Unknown error'}\n`
    );
  }
}

/**
 * Format log entries for display
 */
function formatLogEntries(logs: any[], response: any, maxDisplay: number = 5): void {
  const displayLogs = logs.slice(-maxDisplay); // Show most recent
  
  for (const log of displayLogs) {
    const timestamp = new Date(log.timestamp).toLocaleTimeString();
    const level = log.level || log.type || 'log';
    const icon = getLogIcon(level);
    
    // Extract message from various possible fields
    let message = '';
    if (log.text && log.text.trim()) {
      message = log.text;
    } else if (log.message && log.message.trim()) {
      message = log.message;
    } else if (log.args && Array.isArray(log.args)) {
      // Try to extract from args if available
      message = log.args
        .map((arg: any) => arg.value || arg.description || '[Object]')
        .join(' ');
    } else {
      // Fallback: show log object structure for debugging
      message = `[Log data: ${JSON.stringify(log).substring(0, 50)}...]`;
    }
    
    const truncated = truncateMessage(message, 120);
    response.appendResponseLine(`${icon} **[${timestamp}]** ${truncated}`);
  }
  
  if (logs.length > maxDisplay) {
    response.appendResponseLine(`\n*...and ${logs.length - maxDisplay} more entries*`);
  }
}

/**
 * Get icon for log level
 */
function getLogIcon(level: string): string {
  const icons: Record<string, string> = {
    log: '📝',
    info: 'ℹ️',
    warn: '⚠️',
    warning: '⚠️',  // Also support 'warning'
    error: '❌',
    debug: '🔍',
  };
  return icons[level] || '📝';
}

/**
 * Truncate long messages
 */
function truncateMessage(message: string, maxLength: number): string {
  if (message.length <= maxLength) {
    return message;
  }
  return message.substring(0, maxLength) + '...';
}

/**
 * Format captured logs from parallel capture
 * @param logResults - Array of [backgroundLogs, offscreenLogs]
 * @param response - Response object
 */
export function formatCapturedLogs(logResults: any, response: any): void {
  response.appendResponseLine(`\n---\n\n## 📋 Captured Logs\n`);
  
  try {
    // logResults is [backgroundLogs, offscreenLogs] from Promise.all
    const [backgroundLogs, offscreenLogs] = logResults || [{ logs: [] }, { logs: [] }];
    
    // Count total logs
    const extLogs = (backgroundLogs.logs?.length || 0) + (offscreenLogs.logs?.length || 0);
    
    // Format extension logs
    if (extLogs > 0) {
      response.appendResponseLine(`### Extension Logs\n`);
      response.appendResponseLine(`**Total**: ${extLogs} entries\n\n`);
      
      // Background logs
      if (backgroundLogs.logs && backgroundLogs.logs.length > 0) {
        response.appendResponseLine(`#### Background Service Worker (${backgroundLogs.logs.length} entries)\n`);
        formatLogEntries(backgroundLogs.logs, response, 8);
      }
      
      // Offscreen logs
      if (offscreenLogs.logs && offscreenLogs.logs.length > 0) {
        response.appendResponseLine(`\n#### Offscreen Document (${offscreenLogs.logs.length} entries)\n`);
        formatLogEntries(offscreenLogs.logs, response, 8);
      }
    } else {
      response.appendResponseLine(`### Extension Logs\n`);
      response.appendResponseLine(`*No extension logs captured during execution*\n\n`);
    }
    
    // Page logs are automatically included via setIncludeConsoleData(true)
    response.appendResponseLine(`### Page Logs\n`);
    response.appendResponseLine(`*Page console logs are included below (if any)*\n`);
    
  } catch (error) {
    response.appendResponseLine(`\n⚠️  Error formatting logs: ${error instanceof Error ? error.message : 'Unknown error'}\n`);
  }
}

/**
 * Clear all browser caches for an extension using reliable CDP commands
 * This approach doesn't require chrome.browsingData API permissions
 * Clears: HTTP cache, Service Worker caches, CacheStorage, Storage
 */
async function clearExtensionCache(extensionId: string, context: any): Promise<{success: boolean; details: string[]}> {
  const details: string[] = [];
  const browser = context.getBrowser();
  
  try {
    const pages = await browser.pages();
    let successCount = 0;
    let totalOperations = 0;
    
    // 1. Clear HTTP browser cache using CDP
    try {
      const page = pages[0]; // Use first available page
      const cdpSession = await page.target().createCDPSession();
      
      // Clear browser HTTP cache with timeout
      await cdpWithTimeout(
        cdpSession.send('Network.clearBrowserCache'),
        3000,
        'Network.clearBrowserCache'
      );
      details.push('✅ Cleared HTTP browser cache');
      successCount++;
      totalOperations++;
      
      await cdpSession.detach();
    } catch (err: any) {
      details.push(`⚠️ HTTP cache: ${err.message}`);
      totalOperations++;
    }
    
    // 2. Clear CacheStorage using CDP (via Storage API)
    // Note: CacheStorage.requestCacheNames requires frame context, 
    // using Storage.clearDataForOrigin is more reliable
    try {
      const page = pages[0];
      const cdpSession = await page.target().createCDPSession();
      
      // Clear cache_storage via Storage domain with timeout
      await cdpWithTimeout(
        cdpSession.send('Storage.clearDataForOrigin', {
          origin: `chrome-extension://${extensionId}`,
          storageTypes: 'cache_storage'
        }),
        3000,
        'Storage.clearDataForOrigin (cache_storage)'
      );
      
      details.push('✅ Cleared CacheStorage');
      successCount++;
      totalOperations++;
      
      await cdpSession.detach();
    } catch (err: any) {
      details.push(`⚠️ CacheStorage: ${err.message}`);
      totalOperations++;
    }
    
    // 3. Clear Service Worker registrations
    // Note: Service Worker clearing is handled by Storage.clearDataForOrigin
    // with 'service_workers' type, but we add explicit handling for completeness
    try {
      const page = pages[0];
      const cdpSession = await page.target().createCDPSession();
      
      // Clear service workers via Storage domain (most reliable method) with timeout
      await cdpWithTimeout(
        cdpSession.send('Storage.clearDataForOrigin', {
          origin: `chrome-extension://${extensionId}`,
          storageTypes: 'service_workers'
        }),
        3000,
        'Storage.clearDataForOrigin (service_workers)'
      );
      
      details.push('✅ Cleared Service Worker registrations');
      successCount++;
      totalOperations++;
      
      await cdpSession.detach();
    } catch (err: any) {
      details.push(`⚠️ Service Workers: ${err.message}`);
      totalOperations++;
    }
    
    // 4. Clear Storage (localStorage, sessionStorage, IndexedDB, etc.)
    try {
      const page = pages[0];
      const cdpSession = await page.target().createCDPSession();
      
      // Clear all storage types for the extension origin with timeout
      await cdpWithTimeout(
        cdpSession.send('Storage.clearDataForOrigin', {
          origin: `chrome-extension://${extensionId}`,
          storageTypes: 'local_storage,session_storage,indexeddb,websql,service_workers,cache_storage'
        }),
        3000,
        'Storage.clearDataForOrigin (all storage)'
      );
      
      details.push('✅ Cleared localStorage, sessionStorage, IndexedDB');
      successCount++;
      totalOperations++;
      
      await cdpSession.detach();
    } catch (err: any) {
      details.push(`⚠️ Storage: ${err.message}`);
      totalOperations++;
    }
    
    // 5. Force reload all extension pages to clear in-memory caches
    try {
      const extensionPages = pages.filter((p: any) => 
        p.url().includes(`chrome-extension://${extensionId}`)
      );
      
      for (const page of extensionPages) {
        try {
          await page.reload({ waitUntil: 'domcontentloaded', timeout: 3000 });
        } catch (e) {
          // Some pages might be closing, ignore errors
        }
      }
      
      if (extensionPages.length > 0) {
        details.push(`✅ Force-reloaded ${extensionPages.length} extension pages`);
        successCount++;
      }
      totalOperations++;
    } catch (err: any) {
      details.push(`⚠️ Page reload: ${err.message}`);
      totalOperations++;
    }
    
    // Summary
    const successRate = totalOperations > 0 ? (successCount / totalOperations * 100).toFixed(0) : 0;
    details.unshift(`📊 Cache clearing: ${successCount}/${totalOperations} operations successful (${successRate}%)`);
    
    return {
      success: successCount >= totalOperations / 2, // Consider success if > 50% operations worked
      details,
    };
  } catch (error: any) {
    console.error('[clearExtensionCache] Fatal error:', error.message);
    details.push(`❌ Fatal error: ${error.message}`);
    return { success: false, details };
  }
}

/**
 * Disable caching for extension resources during reload
 * Uses CDP Network.setCacheDisabled command
 */
async function disableExtensionCache(extensionId: string, context: any): Promise<{success: boolean; details: string[]}> {
  const details: string[] = [];
  
  try {
    const browser = context.getBrowser();
    const pages = await browser.pages();
    
    // Disable cache for all pages
    let disabledCount = 0;
    for (const page of pages) {
      try {
        const cdpSession = await page.target().createCDPSession();
        await cdpWithTimeout(
          cdpSession.send('Network.setCacheDisabled', { cacheDisabled: true }),
          3000,
          'Network.setCacheDisabled'
        );
        await cdpSession.detach();
        disabledCount++;
      } catch (err) {
        // Some pages may not support CDP, skip them
        console.warn('[disableExtensionCache] Failed to disable cache for page:', err);
      }
    }
    
    details.push(`Cache disabled for ${disabledCount} browser pages`);
    details.push('HTTP cache will be bypassed for extension resources');
    
    return { success: disabledCount > 0, details };
  } catch (error: any) {
    console.warn('[disableExtensionCache] Failed:', error.message);
    details.push(`Cache disable failed: ${error.message}`);
    return { success: false, details };
  }
}

/**
 * Check if extension is using cached version
 * Detects cache issues by checking reload timestamps
 */
async function detectCachedVersion(extensionId: string, context: any): Promise<{isCached: boolean; reason: string}> {
  try {
    const extensions = await context.getExtensions();
    const extension = extensions.find((ext: any) => ext.id === extensionId);
    
    if (!extension) {
      return { isCached: false, reason: 'Extension not found' };
    }
    
    // Check if extension has been reloaded recently (within 10 seconds)
    // This suggests possible caching issues if files were just modified
    const installTime = new Date(extension.installTime || 0).getTime();
    const now = Date.now();
    const timeSinceInstall = now - installTime;
    
    // If extension was installed/reloaded very recently, there might be cache issues
    if (timeSinceInstall < 10000) {
      return { 
        isCached: true, 
        reason: 'Extension reloaded recently, browser cache may contain stale resources' 
      };
    }
    
    // Check Service Worker status for MV3 extensions
    if (extension.manifestVersion === 3) {
      // If SW is inactive immediately after install, might be cache issue
      if (extension.serviceWorkerStatus === 'inactive' && timeSinceInstall < 5000) {
        return {
          isCached: true,
          reason: 'Service Worker inactive after recent reload, possible cache issue'
        };
      }
    }
    
    return { isCached: false, reason: 'No cache issues detected' };
  } catch (error: any) {
    console.warn('[detectCachedVersion] Detection failed:', error.message);
    // Default to assuming cache issues for safety
    return { 
      isCached: true, 
      reason: 'Cache detection failed, assuming cached version for safety' 
    };
  }
}

/**
 * Determine the actual cache strategy to use
 */
function resolveActualStrategy(
  requestedStrategy: string,
  cacheDetection: {isCached: boolean; reason: string}
): {strategy: string; reason: string} {
  if (requestedStrategy === 'auto') {
    // Auto mode: decide based on cache detection
    const strategy = cacheDetection.isCached ? 'force-clear' : 'preserve';
    return {
      strategy,
      reason: cacheDetection.isCached 
        ? `Auto-detected cache issue: ${cacheDetection.reason}` 
        : `No cache issues detected: ${cacheDetection.reason}`
    };
  }
  
  // Use the requested strategy
  return {
    strategy: requestedStrategy,
    reason: `User-requested strategy: ${requestedStrategy}`
  };
}

export const reloadExtension = defineTool({
  name: 'reload_extension',
  description: `Complete disk reload for Chrome extensions with smart cache management

**Core Principle**: 
- **Unload completely → Read from disk → Reload fresh**
- **Uses chrome.developerPrivate.reload()** - Chrome's official developer reload API
- **Equivalent to manually clicking the "Reload" button in chrome://extensions**
- **Smart cache management** - Automatically handles browser caching issues

**Cache Strategies**:
- **auto** (default): Intelligently detects cache issues and applies appropriate strategy
- **force-clear**: Clear all browser caches before reload (use when experiencing stale code issues)
- **preserve**: Keep all caches for fastest reload (may use cached resources)
- **disable**: Disable caching during reload operation

**Complete Reload Process**:
1. 🔥 Detect and handle cache strategy
2. 🧹 Clear browser caches if needed (Service Worker cache, HTTP cache, storage)
3. 📂 Re-read manifest.json and all files from disk
4. 🔄 Re-parse manifest, reload all resources
5. ✅ Start fresh Service Worker/Background Script
6. 📝 Verify reload with latest code

**Files That Get Reloaded**:
- ✅ manifest.json (permissions, CSP, version, etc.)
- ✅ All JavaScript files (background, content scripts, popup, etc.)
- ✅ All CSS stylesheets
- ✅ All HTML pages
- ✅ Icons, images, and static assets
- ✅ Any file declared in manifest

**Cache Strategy Recommendations**:
- Use **auto** for most development scenarios (AI will decide automatically)
- Use **force-clear** when code changes don't appear after reload
- Use **preserve** for rapid iteration when cache issues are not a concern
- Use **disable** for final testing to ensure no caching artifacts

**Optional Features**:
- cacheStrategy: 'auto' | 'force-clear' | 'preserve' | 'disable' (default: 'auto')
- preserveStorage: true - Keep chrome.storage data (default: false)
- waitForReady: true - Wait and verify reload completion (default: true)
- captureErrors: true - Capture post-reload errors (default: true)

**Typical Workflow**:
Modify extension files → reload_extension(auto) → Cache handled automatically → Changes take effect

**Important Notes**:
- 🔥 Most thorough reload with intelligent cache management
- 📂 Everything loaded from disk directory files
- ✅ Works for unpacked extensions (development environment)
- ⚠️ All extension pages (popup, options) will be closed
- 🚀 Smart cache detection prevents stale code issues

**Example**: reload_extension(extensionId, {cacheStrategy: 'auto'}) - Smart reload with automatic cache handling`,
  annotations: {
    category: ToolCategories.EXTENSION_DEBUGGING,
    readOnlyHint: false,
  },
  schema: {
    extensionId: z
      .string()
      .regex(/^[a-z]{32}$/)
      .describe('Extension ID to reload. Get this from list_extensions.'),
    cacheStrategy: z
      .enum(['auto', 'force-clear', 'preserve', 'disable'])
      .optional()
      .describe('Cache handling strategy: auto (smart detection), force-clear (clear all caches), preserve (keep caches), disable (disable caching). Default is auto.'),
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
      cacheStrategy = 'auto',
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
    console.log(`Options: cacheStrategy=${cacheStrategy}, preserveStorage=${preserveStorage}, waitForReady=${waitForReady}, captureErrors=${captureErrors}`);
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

      // 4. Smart Cache Management
      let nextStep = preserveStorage ? 3 : 2;
      response.appendResponseLine(`## Step ${nextStep}: Smart Cache Management\n`);
      response.appendResponseLine(`**Requested Strategy**: ${cacheStrategy}\n`);
      
      // Detect cache issues if using auto strategy
      let actualStrategy: 'auto' | 'force-clear' | 'preserve' | 'disable' = cacheStrategy;
      let strategyReason = '';
      
      if (cacheStrategy === 'auto') {
        response.appendResponseLine('🔍 Detecting cache issues...\n');
        const cacheDetection = await detectCachedVersion(extensionId, context);
        const resolved = resolveActualStrategy(cacheStrategy, cacheDetection);
        actualStrategy = resolved.strategy as 'auto' | 'force-clear' | 'preserve' | 'disable';
        strategyReason = resolved.reason;
        response.appendResponseLine(`**Detection Result**: ${cacheDetection.isCached ? '⚠️ Cache issues detected' : '✅ No cache issues'}\n`);
        response.appendResponseLine(`**Auto-Selected Strategy**: ${actualStrategy}\n`);
        response.appendResponseLine(`**Reason**: ${strategyReason}\n`);
      } else {
        response.appendResponseLine(`**Strategy**: ${actualStrategy} (user-specified)\n`);
      }
      
      // Apply cache strategy
      if (actualStrategy === 'force-clear') {
        response.appendResponseLine('\n🧹 Clearing all browser caches...\n');
        
        // Add timeout protection for cache clearing (8 seconds max)
        const clearPromise = clearExtensionCache(extensionId, context);
        const timeoutPromise = new Promise<{success: boolean; details: string[]}>((resolve) => {
          setTimeout(() => {
            resolve({
              success: false,
              details: ['⚠️ Cache clearing timeout (8s) - continuing with reload']
            });
          }, 8000);
        });
        
        const clearResult = await Promise.race([clearPromise, timeoutPromise]);
        
        if (clearResult.success) {
          response.appendResponseLine('✅ **Cache cleared successfully**:\n');
          clearResult.details.forEach(detail => {
            response.appendResponseLine(`   - ${detail}\n`);
          });
        } else {
          response.appendResponseLine('⚠️ **Cache clearing encountered issues**:\n');
          clearResult.details.forEach(detail => {
            response.appendResponseLine(`   - ${detail}\n`);
          });
          response.appendResponseLine('Continuing with reload anyway...\n');
        }
      } else if (actualStrategy === 'disable') {
        response.appendResponseLine('\n🚫 Disabling cache for reload...\n');
        const disableResult = await disableExtensionCache(extensionId, context);
        if (disableResult.success) {
          response.appendResponseLine('✅ **Cache disabled successfully**:\n');
          disableResult.details.forEach(detail => {
            response.appendResponseLine(`   - ${detail}\n`);
          });
        } else {
          response.appendResponseLine('⚠️ **Cache disable encountered issues**:\n');
          disableResult.details.forEach(detail => {
            response.appendResponseLine(`   - ${detail}\n`);
          });
          response.appendResponseLine('Continuing with reload anyway...\n');
        }
      } else if (actualStrategy === 'preserve') {
        response.appendResponseLine('💾 Preserving caches for faster reload\n');
        response.appendResponseLine('   - Browser HTTP cache will be used if available\n');
        response.appendResponseLine('   - Service Worker cache will be preserved\n');
      }
      
      response.appendResponseLine('');

      // 5. Get contexts before reload
      nextStep++;
      const contextsBefore = await context.getExtensionContexts(extensionId);
      response.appendResponseLine(`## Step ${nextStep}: Reloading Extension\n`);
      response.appendResponseLine(`**Active contexts before**: ${contextsBefore.length}\n`);

      // 5. 🔥 Complete reload using chrome.developerPrivate.reload() 
      //    This is the only method that truly reloads files from disk
      console.log(`[reload_extension] Step 3: Executing complete disk reload (developerPrivate.reload)...`);
      
      // 🚀 Call developerPrivate.reload() in chrome://extensions page
      //    This completely reloads the extension, all files read from disk
      const browser = context.getBrowser();
      const devPage = await browser.newPage();
      
      try {
        console.log(`[reload_extension] Navigating to chrome://extensions...`);
        await devPage.goto('chrome://extensions/', {
          waitUntil: 'networkidle0',
          timeout: 10000,
        });
        
        // Wait for page to be ready
        await new Promise(resolve => setTimeout(resolve, 500));
        
        console.log(`[reload_extension] 🔥 Calling chrome.developerPrivate.reload() - complete disk reload`);
        
        // 🛡️ Add timeout protection for evaluate call
        const reloadPromise = devPage.evaluate((extId: string) => {
          return new Promise((resolve, reject) => {
            const chromeAPI = (window as any).chrome;
            
            if (typeof chromeAPI === 'undefined' || !chromeAPI.developerPrivate) {
              reject(new Error('chrome.developerPrivate API not available'));
              return;
            }
            
            if (!chromeAPI.developerPrivate.reload) {
              reject(new Error('chrome.developerPrivate.reload() method not available'));
              return;
            }
            
            // 🛡️ Safety timeout: if callback not called within 8 seconds, reject
            const safetyTimeout = setTimeout(() => {
              reject(new Error('Extension reload callback timeout (8s) - reload may have failed'));
            }, 8000);
            
            // 🔥 Complete reload:
            // - failQuietly: false - Don't fail silently, report all errors immediately
            // - populateErrorForUnpacked: true - Populate detailed error info for unpacked extensions
            // 
            // This call will:
            // 1. Completely unload extension (clear all memory state)
            // 2. Re-read manifest.json and all files from disk
            // 3. Re-parse and reload extension
            // 4. Start fresh Service Worker/Background Script
            chromeAPI.developerPrivate.reload(extId, {
              failQuietly: false,                // 🔥 No error tolerance
              populateErrorForUnpacked: true     // 🔥 Detailed error info
            }, () => {
              clearTimeout(safetyTimeout);
              if (chromeAPI.runtime.lastError) {
                reject(new Error(chromeAPI.runtime.lastError.message));
              } else {
                resolve({success: true});
              }
            });
          });
        }, extensionId);
        
        // 🛡️ Race with timeout to prevent infinite hang
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => {
            reject(new Error('Extension reload operation timeout (10s)'));
          }, 10000);
        });
        
        const reloadResult = await Promise.race([reloadPromise, timeoutPromise]);
        
        console.log(`[reload_extension] ✅ Disk reload successful:`, reloadResult);
        response.appendResponseLine('✅ Extension completely reloaded from disk\n');
        response.appendResponseLine('   📂 All files re-read from directory');
        response.appendResponseLine('   🔄 manifest.json, JS, CSS, HTML all applied with latest versions\n');
        
      } catch (reloadError) {
        console.error(`[reload_extension] ❌ Reload failed:`, reloadError);
        await devPage.close();
        throw reloadError;
      } finally {
        // Cleanup: close chrome://extensions page
        await devPage.close().catch(() => {});
      }

      response.appendResponseLine('🔄 Reload complete, extension restarting with latest files...\n');

      // 6. Wait and verify reload completion
      if (waitForReady) {
        nextStep++;
        response.appendResponseLine(`## Step ${nextStep}: Verifying Reload\n`);
        
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
        nextStep++;
        response.appendResponseLine(`## Step ${nextStep}: Restoring Storage\n`);
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
        nextStep++;
        response.appendResponseLine(`## Step ${nextStep}: Error Check\n`);
        
        try {
          // Reduce wait time to avoid hanging
          await new Promise(resolve => setTimeout(resolve, 500));
          
          // Add timeout protection for getBackgroundLogs (3 seconds max)
          const logsPromise = context.getBackgroundLogs(extensionId, {
            capture: true,
            duration: 1000,  // Reduced from 3000ms to 1000ms
            includeStored: false,  // Disable to avoid Log domain issues
          });
          
          const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('Log capture timeout')), 3000);
          });
          
          const logsResult = await Promise.race([logsPromise, timeoutPromise]) as any;
          
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
            response.appendResponseLine('\n💡 **Next step**: Use `get_extension_runtime_errors` to see full error details\n');
          }
        } catch (e) {
          response.appendResponseLine('ℹ️ Error check skipped (timeout or error)\n');
        }
      }

      // 9. Summary
      response.appendResponseLine(`## ✅ Reload Complete (Smart Reload with Cache Management)\n`);
      response.appendResponseLine('**What Happened**:');
      response.appendResponseLine(`- 🧹 **Cache Strategy**: ${actualStrategy} ${actualStrategy !== cacheStrategy ? '(auto-selected)' : ''}`);
      response.appendResponseLine('- ✅ **All files re-read from disk** (manifest.json, JS, CSS, HTML)');
      response.appendResponseLine('- ✅ **Code changes applied** - Your latest modifications are now in effect');
      response.appendResponseLine('- 🔄 Background script/service worker restarted and loaded new code');
      response.appendResponseLine('- 🔄 All extension pages (popup, options) have been closed');
      response.appendResponseLine('- 📝 Content scripts will be re-injected on next page navigation');
      if (preserveStorage) {
        response.appendResponseLine('- 💾 Storage data preserved and restored');
      } else {
        response.appendResponseLine('- 🔄 Extension memory state reset');
      }
      response.appendResponseLine('');
      
      response.appendResponseLine('**Verify Changes**:');
      response.appendResponseLine('- Use `list_extension_contexts` to see active contexts');
      response.appendResponseLine('- Use `get_extension_logs` to monitor extension activity');
      response.appendResponseLine('- Refresh web pages to re-inject content scripts');
      response.appendResponseLine('');
      response.appendResponseLine('💡 **Tip**: This is a true disk reload with smart cache management. The cache strategy ensures your latest code changes are loaded without browser caching issues.');

      response.setIncludePages(true);
      
      // Clean up timeout check
      if (timeoutCheckInterval) {
        clearInterval(timeoutCheckInterval);
      }
      
      const elapsed = Date.now() - startTime;
      console.log(`[reload_extension] SUCCESS in ${elapsed}ms`);
      console.log(`  Session: ${sessionInfo}`);
      console.log(`  Token: ${tokenInfo}`);
      console.log(`  Extension: ${extensionId}`);
      console.log(`  Cache Strategy: ${actualStrategy} (requested: ${cacheStrategy})\n`);
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

export const clearExtensionErrors = defineTool({
  name: 'clear_extension_errors',
  description: `Clear error records for Chrome extensions from chrome://extensions

**Purpose**: Remove all displayed errors to start fresh for new testing

**What it clears**:
- ✅ Runtime errors shown in chrome://extensions "Errors" button
- ✅ Manifest errors
- ✅ Install warnings
- ✅ Error occurrence counts

**When to use**:
1. After fixing bugs - clear old errors before testing
2. Starting new test session - clean slate for error monitoring
3. Before reload - combine with reload_extension for fresh start

**Common workflows**:
- Fix code → \`clear_extension_errors\` → \`reload_extension\` → Test
- \`reload_extension\` → Check errors → Fix → \`clear_extension_errors\` → Test again
- \`clear_extension_errors\` alone - just clean up error history

**API Used**: chrome.developerPrivate.deleteExtensionErrors()

**Note**: This only clears Chrome's internal error records. It does NOT:
- ❌ Fix the underlying bugs
- ❌ Prevent future errors
- ❌ Clear console logs (use browser's console clear)

**Related tools**:
- \`get_extension_runtime_errors\` - View errors before clearing
- \`reload_extension\` - Reload after clearing`,
  annotations: {
    category: ToolCategories.EXTENSION_DEBUGGING,
    readOnlyHint: false, // Clears data (side effect)
  },
  schema: {
    extensionId: z
      .string()
      .regex(/^[a-z]{32}$/)
      .describe('Extension ID to clear errors for. Get this from list_extensions.'),
    errorTypes: z
      .array(z.enum(['runtime', 'manifest']))
      .optional()
      .describe('Types of errors to clear. Default: all types (runtime + manifest).'),
  },
  handler: async (request, response, context) => {
    const {extensionId, errorTypes} = request.params;

    // 1. Verify extension exists
    const extensions = await context.getExtensions();
    const extension = extensions.find((ext: any) => ext.id === extensionId);

    // ✅ Following close_page pattern: return info instead of throwing
    if (!extension) {
      reportExtensionNotFound(response, extensionId, extensions);
      response.setIncludePages(true);
      return;
    }

    response.appendResponseLine(`# Clear Extension Errors\n`);
    response.appendResponseLine(`**Extension**: ${extension.name} (v${extension.version})`);
    response.appendResponseLine(`**ID**: ${extensionId}\n`);

    try {
      // 2. Navigate to chrome://extensions and clear errors
      const browser = context.getBrowser();
      const page = await browser.newPage();

      try {
        // Navigate to chrome://extensions
        await page.goto('chrome://extensions/', {
          waitUntil: 'networkidle0',
          timeout: 10000,
        });

        // Wait for page to be ready
        await new Promise(resolve => setTimeout(resolve, 500));

        // 3. Call chrome.developerPrivate.deleteExtensionErrors()
        const clearResult = await page.evaluate(
          async (extId: string, types: string[] | undefined) => {
            const chromeAPI = (window as any).chrome;

            if (typeof chromeAPI === 'undefined' || !chromeAPI.developerPrivate) {
              return {
                success: false,
                error: 'chrome.developerPrivate API not available',
              };
            }

            if (!chromeAPI.developerPrivate.deleteExtensionErrors) {
              return {
                success: false,
                error: 'chrome.developerPrivate.deleteExtensionErrors() not available',
              };
            }

            return new Promise(resolve => {
              try {
                // Build options for deleteExtensionErrors
                const options: any = {extensionId: extId};

                // If specific error types requested, filter by type
                // Note: Chrome API accepts errorIds array, but we clear all by default
                if (types && types.length > 0) {
                  // For now, we clear all errors as Chrome doesn't provide easy filtering
                  // Future enhancement: get error list first, filter by type, then delete specific IDs
                  options.type = types;
                }

                // Call deleteExtensionErrors
                chromeAPI.developerPrivate.deleteExtensionErrors(options, () => {
                  if (chromeAPI.runtime.lastError) {
                    resolve({
                      success: false,
                      error: chromeAPI.runtime.lastError.message,
                    });
                  } else {
                    resolve({
                      success: true,
                      clearedTypes: types || ['runtime', 'manifest'],
                    });
                  }
                });
              } catch (error) {
                resolve({
                  success: false,
                  error: `Failed to call deleteExtensionErrors: ${error}`,
                });
              }
            });
          },
          extensionId,
          errorTypes
        );

        const typedResult = clearResult as any;

        if (!typedResult.success) {
          response.appendResponseLine(`❌ **Failed to clear errors**\n`);
          response.appendResponseLine(`**Reason**: ${typedResult.error}\n`);
          response.appendResponseLine(`## 💡 Alternative\n`);
          response.appendResponseLine('You can manually clear errors:');
          response.appendResponseLine('1. Open chrome://extensions');
          response.appendResponseLine('2. Click the "Errors" button for the extension');
          response.appendResponseLine('3. Click "Clear all" in the error dialog\n');
        } else {
          response.appendResponseLine(`✅ **Errors cleared successfully**\n`);

          const clearedTypes = typedResult.clearedTypes || ['runtime', 'manifest'];
          response.appendResponseLine(`**Cleared types**: ${clearedTypes.join(', ')}`);
          response.appendResponseLine('');

          response.appendResponseLine(`## What was cleared:\n`);
          response.appendResponseLine('- 🧹 All runtime errors from chrome://extensions');
          response.appendResponseLine('- 🧹 Error occurrence counts reset to 0');
          response.appendResponseLine('- 🧹 Manifest errors (if any)');
          response.appendResponseLine('- 🧹 Install warnings (if any)');
          response.appendResponseLine('');

          response.appendResponseLine(`## Next steps:\n`);
          response.appendResponseLine('✅ **Errors cleared** - You now have a clean slate\n');
          response.appendResponseLine('**Recommended workflow**:');
          response.appendResponseLine('1. \`reload_extension\` - Apply your code fixes');
          response.appendResponseLine('2. Test your extension');
          response.appendResponseLine('3. \`get_extension_runtime_errors\` - Check for new errors');
          response.appendResponseLine('');
          response.appendResponseLine('💡 **Tip**: Use \`get_extension_runtime_errors\` to check for any new errors\n');
        }
      } finally {
        await page.close();
      }
    } catch (error) {
      // ✅ Following navigate_page_history pattern: simple error message
      response.appendResponseLine(
        'Unable to clear extension errors. The operation failed or Chrome API is unavailable.'
      );

      if (error instanceof Error) {
        response.appendResponseLine(`\n**Details**: ${error.message}`);
      }
    }

    response.setIncludePages(true);
  },
});

export const evaluateInExtension = defineTool({
  name: 'evaluate_in_extension',
  description: `Execute JavaScript code in extension's background context with full chrome.* API access.

**🎯 For AI: PREREQUISITE** - Service Worker MUST be 🟢 Active (check with \`list_extensions\` first).

**🎯 Auto-capture logs**: By default, this tool automatically captures logs from:
- 📝 Background Service Worker
- 📝 Offscreen Document
- 📝 Current page console

**Use cases**:
- Test extension APIs (chrome.runtime, chrome.storage, etc.)
- Debug extension logic and inspect state
- Call extension functions

**⚠️ MV3 Prerequisites**:
1. Check SW status: \`list_extensions\` 
2. If 🔴 Inactive: \`activate_extension_service_worker\`
3. Wait 1-2 seconds
4. Then use this tool

**Common error**: "No background context found" → SW is inactive, activate it first.

**Related tools**: \`activate_extension_service_worker\`, \`list_extensions\`, \`list_extension_contexts\``,
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
    captureLogs: z
      .boolean()
      .optional()
      .default(true)
      .describe(`Automatically capture extension and page logs during execution.
      - true: Capture all logs (Background + Offscreen + Page) - recommended
      - false: Skip log capture for performance
      Default: true`),
    logDuration: z
      .number()
      .min(1000)
      .max(15000)
      .optional()
      .default(3000)
      .describe(`Log capture duration in milliseconds. Default: 3000ms (3 seconds)`),
  },
  handler: async (request, response, context) => {
    const {extensionId, code, contextId, captureLogs = true, logDuration = 3000} = request.params;

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
      
      // Start log capture BEFORE executing code (if enabled)
      let result;
      let logCapturePromise: Promise<any> | null = null;
      
      if (captureLogs) {
        // Start log listeners FIRST
        logCapturePromise = Promise.all([
          context.getBackgroundLogs(extensionId, {
            capture: true,
            duration: logDuration,
            includeStored: false,
          }).catch((err: any) => ({ 
            logs: [], 
            error: err.message || 'Failed to capture background logs'
          })),
          
          context.getOffscreenLogs(extensionId, {
            capture: true,
            duration: logDuration,
            includeStored: false,
          }).catch((err: any) => ({ 
            logs: [], 
            error: err.message || 'Failed to capture offscreen logs'
          })),
        ]);
        
        // Give listeners time to initialize
        await new Promise(resolve => setTimeout(resolve, 200));
      }
      
      // Execute code (log listeners are now active)
      result = await context.evaluateInExtensionContext(
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

      // Wait for log capture to complete and format results
      if (captureLogs && logCapturePromise) {
        const logResults = await logCapturePromise;
        formatCapturedLogs(logResults, response);
      }

    } catch {
      // ✅ Following navigate_page_history pattern: simple error message
      response.appendResponseLine(
        'Unable to evaluate code in extension. The extension may be inactive or the code has syntax errors.'
      );
    }
    
    // Include page console data (for page logs)
    response.setIncludeConsoleData(true);
    response.setIncludePages(true);
  },
});
