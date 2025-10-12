/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import z from 'zod';

import {ToolCategories} from './categories.js';
import {defineTool} from './ToolDefinition.js';

export const listExtensions = defineTool({
  name: 'list_extensions',
  description: `List all installed Chrome extensions with their metadata.

This tool discovers extensions by scanning Chrome targets and retrieving their manifest information.
Shows extension ID, name, version, manifest version, permissions, and enabled status.
Useful for understanding which extensions are installed and active in the current browser session.`,
  annotations: {
    category: ToolCategories.EXTENSION_DEBUGGING,
    readOnlyHint: true,
  },
  schema: {
    includeDisabled: z
      .boolean()
      .optional()
      .describe(
        'Whether to include disabled extensions in the results. Default is false.',
      ),
  },
  handler: async (request, response, context) => {
    const extensions = await context.getExtensions(
      request.params.includeDisabled,
    );

    if (extensions.length === 0) {
      response.appendResponseLine('No extensions found.');
      response.setIncludePages(true);
      return;
    }

    response.appendResponseLine(
      `# Installed Extensions (${extensions.length})\n`,
    );

    for (const ext of extensions) {
      response.appendResponseLine(`## ${ext.name}`);
      response.appendResponseLine(`- **ID**: ${ext.id}`);
      response.appendResponseLine(`- **Version**: ${ext.version}`);
      response.appendResponseLine(
        `- **Manifest Version**: ${ext.manifestVersion}`,
      );
      if (ext.description) {
        response.appendResponseLine(`- **Description**: ${ext.description}`);
      }
      response.appendResponseLine(
        `- **Status**: ${ext.enabled ? '✅ Enabled' : '❌ Disabled'}`,
      );

      // Service Worker 状态（仅 MV3）
      if (ext.manifestVersion === 3 && ext.serviceWorkerStatus) {
        const statusEmoji = {
          active: '🟢',
          inactive: '🔴',
          not_found: '⚠️',
        }[ext.serviceWorkerStatus];
        const statusText = {
          active: 'Active',
          inactive: 'Inactive',
          not_found: 'Not Found',
        }[ext.serviceWorkerStatus];
        response.appendResponseLine(
          `- **Service Worker**: ${statusEmoji} ${statusText}`,
        );
      }

      if (ext.permissions && ext.permissions.length > 0) {
        response.appendResponseLine(
          `- **Permissions**: ${ext.permissions.join(', ')}`,
        );
      }

      if (ext.hostPermissions && ext.hostPermissions.length > 0) {
        response.appendResponseLine(
          `- **Host Permissions**: ${ext.hostPermissions.join(', ')}`,
        );
      }

      if (ext.backgroundUrl) {
        response.appendResponseLine(`- **Background**: ${ext.backgroundUrl}`);
      }

      response.appendResponseLine('');
    }

    response.setIncludePages(true);
  },
});

export const getExtensionDetails = defineTool({
  name: 'get_extension_details',
  description: `Get detailed information about a specific Chrome extension.

Retrieves comprehensive metadata including manifest details, permissions, host permissions,
background script information, and extension status. Use this after list_extensions to get
more detailed information about a particular extension.`,
  annotations: {
    category: ToolCategories.EXTENSION_DEBUGGING,
    readOnlyHint: true,
  },
  schema: {
    extensionId: z
      .string()
      .regex(/^[a-z]{32}$/)
      .describe(
        'Extension ID (32 lowercase letters). Get this from list_extensions.',
      ),
  },
  handler: async (request, response, context) => {
    const {extensionId} = request.params;

    const ext = await context.getExtensionDetails(extensionId);

    if (!ext) {
      response.appendResponseLine(
        `Extension with ID ${extensionId} not found. It may be disabled or uninstalled.`,
      );
      response.appendResponseLine(
        '\nUse list_extensions with includeDisabled=true to see all extensions.',
      );
      response.setIncludePages(true);
      return;
    }

    response.appendResponseLine(`# Extension Details: ${ext.name}\n`);
    response.appendResponseLine(`## Basic Information`);
    response.appendResponseLine(`- **ID**: ${ext.id}`);
    response.appendResponseLine(`- **Name**: ${ext.name}`);
    response.appendResponseLine(`- **Version**: ${ext.version}`);
    response.appendResponseLine(
      `- **Manifest Version**: MV${ext.manifestVersion}`,
    );
    response.appendResponseLine(
      `- **Status**: ${ext.enabled ? '✅ Enabled' : '❌ Disabled'}`,
    );

    if (ext.description) {
      response.appendResponseLine(
        `- **Description**: ${ext.description}\n`,
      );
    }

    response.appendResponseLine(`## Technical Details`);

    if (ext.backgroundUrl) {
      response.appendResponseLine(
        `- **Background ${ext.manifestVersion === 3 ? 'Service Worker' : 'Page'}**: ${ext.backgroundUrl}`,
      );
    }

    if (ext.permissions && ext.permissions.length > 0) {
      response.appendResponseLine(`\n### Permissions`);
      for (const permission of ext.permissions) {
        response.appendResponseLine(`- ${permission}`);
      }
    }

    if (ext.hostPermissions && ext.hostPermissions.length > 0) {
      response.appendResponseLine(`\n### Host Permissions`);
      for (const hostPermission of ext.hostPermissions) {
        response.appendResponseLine(`- ${hostPermission}`);
      }
    }

    response.appendResponseLine(
      '\n**Next Steps**: Use list_extension_contexts to see all running contexts of this extension.',
    );

    response.setIncludePages(true);
  },
});

export const listExtensionContexts = defineTool({
  name: 'list_extension_contexts',
  description: `List all execution contexts for a Chrome extension.

This includes:
- Background context (Service Worker for MV3, Background Page for MV2)
- Popup windows
- Options pages  
- DevTools pages
- Content scripts

Use this to understand all running contexts of an extension before debugging.
Each context has a unique Target ID that can be used with switch_extension_context.`,
  annotations: {
    category: ToolCategories.EXTENSION_DEBUGGING,
    readOnlyHint: true,
  },
  schema: {
    extensionId: z
      .string()
      .regex(/^[a-z]{32}$/)
      .describe('Extension ID to inspect. Get this from list_extensions.'),
  },
  handler: async (request, response, context) => {
    const {extensionId} = request.params;

    const contexts = await context.getExtensionContexts(extensionId);

    if (contexts.length === 0) {
      response.appendResponseLine(
        `No active contexts found for extension ${extensionId}.`,
      );
      response.appendResponseLine(
        '\nThe extension may be disabled or not running any contexts currently.',
      );
      response.setIncludePages(true);
      return;
    }

    response.appendResponseLine(
      `# Extension Contexts (${contexts.length})\n`,
    );

    // Group by context type
    const grouped = contexts.reduce(
      (acc, ctx) => {
        if (!acc[ctx.type]) {
          acc[ctx.type] = [];
        }
        acc[ctx.type].push(ctx);
        return acc;
      },
      {} as Record<string, typeof contexts>,
    );

    // Display each context type
    for (const [type, ctxList] of Object.entries(grouped)) {
      response.appendResponseLine(`## ${type.toUpperCase()}\n`);

      for (const ctx of ctxList) {
        response.appendResponseLine(`### ${ctx.title || 'Untitled'}`);
        response.appendResponseLine(`- **Target ID**: \`${ctx.targetId}\``);
        response.appendResponseLine(`- **URL**: ${ctx.url}`);
        if (ctx.isPrimary) {
          response.appendResponseLine('- **Primary Context**: ✅');
        }
        response.appendResponseLine('');
      }
    }

    response.appendResponseLine(
      '\n**Next Steps**: Use switch_extension_context with a Target ID to debug that specific context.',
    );

    response.setIncludePages(true);
  },
});

export const switchExtensionContext = defineTool({
  name: 'switch_extension_context',
  description: `Switch the active debugging context to a specific extension context.

After switching, subsequent DevTools Protocol commands and script evaluations (via evaluate_script)
will be executed in the selected context. This is essential for debugging specific parts of an extension
like the background service worker, popup, or options page.`,
  annotations: {
    category: ToolCategories.EXTENSION_DEBUGGING,
    readOnlyHint: false,
  },
  schema: {
    contextId: z
      .string()
      .describe(
        'Target ID of the context to switch to. Get this from list_extension_contexts.',
      ),
  },
  handler: async (request, response, context) => {
    const {contextId} = request.params;

    try {
      // 尝试切换上下文
      const page = await context.switchToExtensionContext(contextId);

      const url = page.url();
      const title = await page.title();

      response.appendResponseLine('# Context Switched Successfully\n');
      response.appendResponseLine(`**Target ID**: ${contextId}`);
      response.appendResponseLine(`**Title**: ${title}`);
      response.appendResponseLine(`**URL**: ${url}\n`);
      response.appendResponseLine(
        '**Next Steps**: You can now use evaluate_script or other debugging tools in this context.',
      );

      response.setIncludePages(true);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      
      // 检查是否是 Service Worker 错误
      if (message.includes('Service Worker') || message.includes('Page object')) {
        response.appendResponseLine('# Cannot Switch to Service Worker\n');
        response.appendResponseLine(`**Target ID**: ${contextId}\n`);
        response.appendResponseLine(
          '⚠️  Service Workers do not have a Page object and cannot be switched to using this tool.\n',
        );
        response.appendResponseLine('**Instead, use one of these tools:**\n');
        response.appendResponseLine(
          '- `evaluate_in_extension` - Execute code in the Service Worker context',
        );
        response.appendResponseLine(
          '- `get_extension_logs` - Capture console logs from the Service Worker',
        );
        response.appendResponseLine(
          '- `inspect_extension_storage` - Access extension storage\n',
        );
        response.appendResponseLine('**Example:**');
        response.appendResponseLine('```javascript');
        response.appendResponseLine('// Use evaluate_in_extension instead');
        response.appendResponseLine('evaluate_in_extension({');
        response.appendResponseLine('  extensionId: "your_extension_id",');
        response.appendResponseLine('  code: "chrome.runtime.getManifest()"');
        response.appendResponseLine('})');
        response.appendResponseLine('```');
        response.setIncludePages(true);
      } else {
        throw new Error(`Failed to switch context: ${message}`);
      }
    }
  },
});

export const inspectExtensionStorage = defineTool({
  name: 'inspect_extension_storage',
  description: `Inspect extension storage (local, sync, session, or managed).

Retrieves data from the specified storage area of a Chrome extension using chrome.storage API.
Shows storage quota, usage, and all stored key-value pairs. This is essential for debugging
data persistence issues in extensions.

Storage types:
- local: 5MB quota, persists across browser restarts
- sync: 100KB quota, syncs across devices signed into same account
- session: 10MB quota, cleared when browser closes (MV3 only)
- managed: Enterprise-managed storage (read-only for extension)`,
  annotations: {
    category: ToolCategories.EXTENSION_DEBUGGING,
    readOnlyHint: true,
  },
  schema: {
    extensionId: z
      .string()
      .regex(/^[a-z]{32}$/)
      .describe('Extension ID (32 lowercase letters)'),
    storageType: z
      .enum(['local', 'sync', 'session', 'managed'])
      .optional()
      .describe(
        'Storage type to inspect. Default is "local". session is only available in MV3.',
      ),
  },
  handler: async (request, response, context) => {
    const {extensionId, storageType = 'local'} = request.params;

    try {
      const storage = await context.getExtensionStorage(
        extensionId,
        storageType,
      );

      response.appendResponseLine(`# Extension Storage: ${storageType}\n`);
      response.appendResponseLine(`**Extension ID**: ${extensionId}`);

      // Display quota information
      if (storage.bytesUsed !== undefined && storage.quota !== undefined) {
        const usagePercent = (
          (storage.bytesUsed / storage.quota) *
          100
        ).toFixed(2);
        response.appendResponseLine(
          `**Storage Usage**: ${storage.bytesUsed} / ${storage.quota} bytes (${usagePercent}%)`,
        );
      }

      response.appendResponseLine('\n## Stored Data\n');

      if (Object.keys(storage.data).length === 0) {
        response.appendResponseLine('*No data stored*');
      } else {
        // Format JSON output
        const formatted = JSON.stringify(storage.data, null, 2);
        response.appendResponseLine('```json');
        response.appendResponseLine(formatted);
        response.appendResponseLine('```');
      }

      response.setIncludePages(true);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to inspect storage: ${message}`);
    }
  },
});

export const reloadExtension = defineTool({
  name: 'reload_extension',
  description: `Reload a Chrome extension to apply code changes.

This is useful during extension development to quickly reload the extension after making changes
to the code. The extension will be reloaded using chrome.runtime.reload() API if available,
or via chrome.management.setEnabled() toggle.`,
  annotations: {
    category: ToolCategories.EXTENSION_DEBUGGING,
    readOnlyHint: false,
  },
  schema: {
    extensionId: z
      .string()
      .regex(/^[a-z]{32}$/)
      .describe('Extension ID (32 lowercase letters)'),
  },
  handler: async (request, response, context) => {
    const {extensionId} = request.params;

    try {
      // Get extension contexts to find background
      const contexts = await context.getExtensionContexts(extensionId);
      const backgroundContext = contexts.find(ctx => ctx.isPrimary);

      if (!backgroundContext) {
        throw new Error(
          `No background context found for extension ${extensionId}. The extension may not be running.`,
        );
      }

      response.appendResponseLine(`# Reloading Extension\n`);
      response.appendResponseLine(`**Extension ID**: ${extensionId}`);
      response.appendResponseLine(`**Context**: ${backgroundContext.type}`);
      response.appendResponseLine(`**URL**: ${backgroundContext.url}\n`);
      response.appendResponseLine(`⏳ Sending reload command...\n`);

      // Execute chrome.runtime.reload() in the background context
      // Wrap in try-catch to handle chrome API availability
      await context.evaluateInExtensionContext(
        backgroundContext.targetId,
        `
        if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.reload) {
          chrome.runtime.reload();
        } else {
          throw new Error('chrome.runtime.reload() is not available. Service Worker may be inactive.');
        }
        `,
        false, // Don't wait for promise as extension will terminate
      );

      response.appendResponseLine(`✅ Reload command sent successfully`);
      response.appendResponseLine(
        `\n**Note**: The extension will restart in a few seconds. You may need to re-activate the Service Worker after reload.`,
      );

      response.setIncludePages(true);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to reload extension: ${message}`);
    }
  },
});

export const getExtensionLogs = defineTool({
  name: 'get_extension_logs',
  description: `Get console logs from an extension's Service Worker or background page.

**Features:**
- Real-time log capture (monitors console output for specified duration)
- Historical log retrieval (if extension stores logs in globalThis.__logs)
- Complete stack traces and source file information
- Works with any extension (no custom implementation required)

**Default Behavior:**
Captures logs for 5 seconds and includes any stored historical logs.

**Options:**
- \`capture\`: Enable real-time capture (default: true)
- \`duration\`: Capture duration in milliseconds (default: 5000)
- \`includeStored\`: Include historical logs from globalThis.__logs (default: true)

**Usage Examples:**
1. Quick capture (5 seconds):
   \`\`\`
   get_extension_logs(extensionId)
   \`\`\`

2. Longer capture (30 seconds):
   \`\`\`
   get_extension_logs(extensionId, {duration: 30000})
   \`\`\`

3. Only historical logs (no capture):
   \`\`\`
   get_extension_logs(extensionId, {capture: false})
   \`\`\`

**Optional: Persistent Logging**
For long-term log storage, add this to your extension's Service Worker:
\`\`\`javascript
const logs = [];
const originalConsole = {...console};
['log', 'info', 'warn', 'error'].forEach(method => {
  console[method] = (...args) => {
    logs.push({type: method, message: args.join(' '), timestamp: Date.now()});
    originalConsole[method](...args);
  };
});
globalThis.__logs = logs;
\`\`\``,
  annotations: {
    category: ToolCategories.EXTENSION_DEBUGGING,
    readOnlyHint: true,
  },
  schema: {
    extensionId: z
      .string()
      .regex(/^[a-z]{32}$/)
      .describe('Extension ID (32 lowercase letters)'),
    capture: z
      .boolean()
      .optional()
      .describe('Enable real-time log capture (default: true)'),
    duration: z
      .number()
      .optional()
      .describe('Capture duration in milliseconds (default: 5000)'),
    includeStored: z
      .boolean()
      .optional()
      .describe('Include historical logs from globalThis.__logs (default: true)'),
  },
  handler: async (request, response, context) => {
    const {extensionId, capture, duration, includeStored} = request.params;

    try {
      const result = await context.getExtensionLogs(extensionId, {
        capture,
        duration,
        includeStored,
      });

      response.appendResponseLine(`# Extension Logs\n`);
      response.appendResponseLine(`**Extension ID**: ${extensionId}`);
      response.appendResponseLine(
        `**Service Worker Status**: ${result.isActive ? '🟢 Active' : '🔴 Inactive'}`,
      );

      // 显示捕获信息
      if (result.captureInfo) {
        const captureSeconds = (result.captureInfo.duration / 1000).toFixed(1);
        response.appendResponseLine(
          `**Capture Duration**: ${captureSeconds}s (captured ${result.captureInfo.messageCount} new logs)`,
        );
      }

      if (!result.isActive) {
        response.appendResponseLine(
          `\n⚠️  Service Worker is inactive. Real-time capture not available.`,
        );
        response.appendResponseLine(
          `💡 Tip: Manually activate Service Worker via chrome://extensions/ first.`,
        );
      }

      response.appendResponseLine(`\n## Console Logs\n`);

      if (result.logs.length === 0) {
        response.appendResponseLine('*No logs found*');
        if (capture) {
          response.appendResponseLine(
            `\n**Note**: No console output detected during capture period.`,
          );
          response.appendResponseLine(
            `Try triggering extension actions or increasing \`duration\` parameter.`,
          );
        } else {
          response.appendResponseLine(
            '\n**Note**: No stored logs found. Enable \`capture\` to monitor real-time output.',
          );
        }
      } else {
        const storedCount = result.logs.filter(l => l.source === 'stored').length;
        const realtimeCount = result.logs.filter(l => l.source === 'realtime').length;
        
        response.appendResponseLine(`Found ${result.logs.length} log entries`);
        if (storedCount > 0 && realtimeCount > 0) {
          response.appendResponseLine(`(${storedCount} stored, ${realtimeCount} real-time):\n`);
        } else if (storedCount > 0) {
          response.appendResponseLine(`(all from stored logs):\n`);
        } else {
          response.appendResponseLine(`(all from real-time capture):\n`);
        }
        
        result.logs.forEach((log, index) => {
          const timestamp = new Date(log.timestamp).toISOString();
          const icon =
            log.type === 'error'
              ? '❌'
              : log.type === 'warn'
                ? '⚠️ '
                : log.type === 'info'
                  ? 'ℹ️ '
                  : '📝';
          const sourceTag = log.source === 'realtime' ? '[realtime]' : '[stored]';

          response.appendResponseLine(
            `${index + 1}. ${icon} **[${log.type}]** ${sourceTag} ${timestamp}`,
          );
          response.appendResponseLine(`   ${log.text}`);
          
          // 显示源文件和行号
          if (log.url && log.lineNumber !== undefined) {
            response.appendResponseLine(`   📍 ${log.url}:${log.lineNumber}`);
          }
          
          // 显示堆栈信息
          if (log.stackTrace) {
            response.appendResponseLine(`   Stack trace:`);
            response.appendResponseLine(`${log.stackTrace}`);
          }
          
          response.appendResponseLine('');
        });
      }

      response.setIncludePages(true);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to get extension logs: ${message}`);
    }
  },
});

/**
 * Safely wrap user code for evaluation in async context
 * Handles statements, expressions, and return statements correctly
 */
function wrapCodeForEvaluation(code: string): string {
  const trimmed = code.trim();
  
  // Check if code contains statement keywords (not in comments)
  const statementPattern = /^\s*(const|let|var|function|class|if|for|while|do|switch|try|throw)\s/;
  const hasStatementKeyword = statementPattern.test(trimmed);
  
  // Check if code already starts with return
  const startsWithReturn = /^\s*return\s/.test(trimmed);
  
  // If it's a statement or already has return, wrap as-is
  if (hasStatementKeyword || startsWithReturn) {
    return `(async () => { ${trimmed} })()`;
  }
  
  // For expressions, add return to get the value
  return `(async () => { return (${trimmed}); })()`;
}

export const evaluateInExtension = defineTool({
  name: 'evaluate_in_extension',
  description: `Evaluate JavaScript code in an extension's background context.

This tool allows you to execute arbitrary JavaScript code in the extension's Service Worker
(MV3) or background page (MV2). Useful for debugging, testing functions, or calling extension APIs.

**Examples**:
- \`chrome.runtime.reload()\` - Reload the extension
- \`chrome.tabs.query({active: true})\` - Get active tab
- \`await chrome.storage.local.get(null)\` - Get all storage data`,
  annotations: {
    category: ToolCategories.EXTENSION_DEBUGGING,
    readOnlyHint: false,
  },
  schema: {
    extensionId: z
      .string()
      .regex(/^[a-z]{32}$/)
      .describe('Extension ID (32 lowercase letters)'),
    code: z
      .string()
      .describe(
        'JavaScript code to evaluate. Can be async. Use await for promises.',
      ),
    awaitPromise: z
      .boolean()
      .optional()
      .describe(
        'Whether to await the result if it is a Promise. Default is true.',
      ),
  },
  handler: async (request, response, context) => {
    const {extensionId, code, awaitPromise = true} = request.params;

    try {
      const contexts = await context.getExtensionContexts(extensionId);

      const backgroundContext = contexts.find(ctx => ctx.isPrimary);

      if (!backgroundContext) {
        throw new Error(
          `No background context found for extension ${extensionId}`,
        );
      }

      response.appendResponseLine(`# Evaluating Code in Extension\n`);
      response.appendResponseLine(`**Extension ID**: ${extensionId}`);
      response.appendResponseLine(`**Context**: ${backgroundContext.type}`);
      response.appendResponseLine(`\n## Code\n\`\`\`javascript\n${code}\n\`\`\``);

      // Use CDP-based evaluation (works for Service Workers)
      // Wrap code in async IIFE with proper handling for statements/expressions
      const wrappedCode = wrapCodeForEvaluation(code);
      
      const result = await context.evaluateInExtensionContext(
        backgroundContext.targetId,
        wrappedCode,
        awaitPromise,
      );

      response.appendResponseLine(`\n## Result\n`);

      if (result && typeof result === 'object' && 'error' in result) {
        response.appendResponseLine(`**Error**: ${(result as {error: string}).error}`);
      } else {
        const formatted = JSON.stringify(result, null, 2);
        response.appendResponseLine('```json');
        response.appendResponseLine(formatted);
        response.appendResponseLine('```');
      }

      response.setIncludePages(true);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to evaluate code: ${message}`);
    }
  },
});
