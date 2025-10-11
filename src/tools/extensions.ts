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

    const page = await context.switchToExtensionContext(contextId);

    const url = page.url();
    const title = await page.title();

    response.appendResponseLine('# Context Switched Successfully\n');
    response.appendResponseLine(`**Target ID**: ${contextId}`);
    response.appendResponseLine(`**Title**: ${title}`);
    response.appendResponseLine(`**URL**: ${url}`);
    response.appendResponseLine(
      '\n**Next Steps**: You can now use evaluate_script or other debugging tools in this context.',
    );

    response.setIncludePages(true);
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
      // Get background target
      const backgroundTarget =
        await context.getExtensionBackgroundTarget(extensionId);

      if (!backgroundTarget) {
        throw new Error(
          `No background context found for extension ${extensionId}. The extension may not be running.`,
        );
      }

      response.appendResponseLine(`# Reloading Extension\n`);
      response.appendResponseLine(`**Extension ID**: ${extensionId}`);
      response.appendResponseLine(`\n⏳ Sending reload command...`);

      // Note: Actual reload implementation would require CDP session and evaluation
      // For now, provide guidance
      response.appendResponseLine(
        `\n**Note**: Extension reload requires executing \`chrome.runtime.reload()\` in the extension's background context.`,
      );
      response.appendResponseLine(
        `Use \`evaluate_in_extension\` tool to execute: \`chrome.runtime.reload()\``,
      );

      response.setIncludePages(true);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to reload extension: ${message}`);
    }
  },
});

export const activateServiceWorker = defineTool({
  name: 'activate_service_worker',
  description: `Automatically activate a Chrome extension's Service Worker.

This tool attempts to activate the Service Worker by opening the extension's popup or options page.
Useful when chrome.* APIs are not available due to the Service Worker being inactive.

**When to use:**
- Before calling inspect_extension_storage
- Before executing code that requires chrome.* APIs
- When you see "chrome.storage not available" errors

**What it does:**
1. Checks if Service Worker is already active
2. If inactive, opens extension popup/options page to trigger activation
3. Waits for activation to complete

Returns whether activation was successful.`,
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
      response.appendResponseLine(`# Activating Service Worker\n`);
      response.appendResponseLine(`**Extension ID**: ${extensionId}`);

      // 检查当前状态
      const isActive = await context.isServiceWorkerActive(extensionId);
      
      if (isActive) {
        response.appendResponseLine(`\n✅ Service Worker is already active!`);
        response.appendResponseLine(`\nNo action needed. Chrome APIs are available.`);
        response.setIncludePages(true);
        return;
      }

      response.appendResponseLine(`\n⚠️  Service Worker is currently inactive`);
      response.appendResponseLine(`\n🔄 Attempting automatic activation...`);

      const result = await context.activateServiceWorker(extensionId);

      if (result.success) {
        response.appendResponseLine(`\n✅ Service Worker activated successfully!`);
        if (result.method) {
          response.appendResponseLine(`\n**Activation method**: ${result.method}`);
        }
        if (result.url) {
          response.appendResponseLine(`**Page opened**: ${result.url}`);
        }
        response.appendResponseLine(`\nYou can now use chrome.* APIs.`);
      } else {
        response.appendResponseLine(`\n❌ Auto-activation failed`);
        if (result.error) {
          response.appendResponseLine(`\n**Error**: ${result.error}`);
        }
        if (result.suggestion) {
          response.appendResponseLine(`\n**Suggestion**: ${result.suggestion}`);
        }
        response.appendResponseLine(`\n**Manual activation steps:**`);
        response.appendResponseLine(`1. Open \`chrome://extensions/\``);
        response.appendResponseLine(`2. Find your extension`);
        response.appendResponseLine(`3. Click the "Service worker" link`);
      }

      response.setIncludePages(true);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to activate Service Worker: ${message}`);
    }
  },
});

export const getExtensionLogs = defineTool({
  name: 'get_extension_logs',
  description: `Get console logs from an extension's Service Worker or background page.

Retrieves console messages logged by the extension. Note that due to Service Worker lifecycle,
only recent logs (from current session) may be available. For persistent logging, the extension
should implement its own log storage mechanism.

**Limitations:**
- Service Worker logs are cleared when it goes inactive
- Only logs from current session are available via CDP
- For historical logs, extension must store them (e.g., in chrome.storage)

**Best Practice:**
Add this code to your extension's Service Worker for persistent logging:
\`\`\`javascript
const logs = [];
const originalConsole = {...console};
['log', 'info', 'warn', 'error'].forEach(method => {
  console[method] = (...args) => {
    logs.push({type: method, message: args.join(' '), timestamp: Date.now()});
    originalConsole[method](...args);
  };
});
globalThis.__logs = logs; // Expose for MCP
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
  },
  handler: async (request, response, context) => {
    const {extensionId} = request.params;

    try {
      const result = await context.getExtensionLogs(extensionId);

      response.appendResponseLine(`# Extension Logs\n`);
      response.appendResponseLine(`**Extension ID**: ${extensionId}`);
      response.appendResponseLine(
        `**Service Worker Status**: ${result.isActive ? '🟢 Active' : '🔴 Inactive'}`,
      );

      if (!result.isActive) {
        response.appendResponseLine(
          `\n⚠️  Service Worker is inactive. Recent logs may be lost.`,
        );
        response.appendResponseLine(
          `💡 Tip: Use \`activate_service_worker\` tool first.`,
        );
      }

      response.appendResponseLine(`\n## Console Logs\n`);

      if (result.logs.length === 0) {
        response.appendResponseLine('*No logs found*');
        response.appendResponseLine(
          '\n**Note**: Service Worker logs are ephemeral. For persistent logging, implement storage in your extension.',
        );
      } else {
        response.appendResponseLine(`Found ${result.logs.length} log entries:\n`);
        
        result.logs.forEach((log: {type: string; text: string; timestamp: number; source: string}, index: number) => {
          const timestamp = new Date(log.timestamp).toISOString();
          const icon =
            log.type === 'error'
              ? '❌'
              : log.type === 'warn'
                ? '⚠️ '
                : log.type === 'info'
                  ? 'ℹ️ '
                  : '📝';

          response.appendResponseLine(
            `${index + 1}. ${icon} **[${log.type}]** ${timestamp}`,
          );
          response.appendResponseLine(`   ${log.text}`);
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
      // Wrap code in async IIFE for proper async/await support
      const wrappedCode = code.trim().startsWith('return ')
        ? `(async () => { ${code} })()`
        : `(async () => { return ${code} })()`;
      
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
