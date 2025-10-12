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
  description: `Reload a Chrome extension.

Forces the extension to reload, similar to clicking the reload button in chrome://extensions.
This is useful after modifying extension files during development or to reset extension state.

Note: Reloading will:
- Close all extension contexts (popup, options, devtools)
- Restart the background script/service worker
- Re-inject content scripts
- Clear extension's in-memory state`,
  annotations: {
    category: ToolCategories.EXTENSION_DEBUGGING,
    readOnlyHint: false,
  },
  schema: {
    extensionId: z
      .string()
      .regex(/^[a-z]{32}$/)
      .describe('Extension ID to reload. Get this from list_extensions.'),
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

      // Execute chrome.runtime.reload() in the background context
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

      response.appendResponseLine(`# Extension Reloaded\n`);
      response.appendResponseLine(`✅ Successfully reloaded extension: \`${extensionId}\`\n`);
      response.appendResponseLine(`**Effects of reload**:`);
      response.appendResponseLine('- Background script/service worker has been restarted');
      response.appendResponseLine('- All extension pages (popup, options) have been closed');
      response.appendResponseLine('- Content scripts will be re-injected on page navigation');
      response.appendResponseLine('- Extension state has been reset\n');
      response.appendResponseLine('**Next Steps**:');
      response.appendResponseLine('- Use list_extension_contexts to see new contexts');
      response.appendResponseLine('- Check get_extension_logs for any startup errors');

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

The code runs with full extension permissions and has access to all chrome.* APIs.`,
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
      
      response.appendResponseLine(`# Evaluation Error\n`);
      response.appendResponseLine(`**Extension ID**: ${extensionId}`);
      response.appendResponseLine(`\n**Code**:\n\`\`\`javascript\n${code}\n\`\`\``);
      response.appendResponseLine(`\n**Error**: ${message}\n`);
      response.appendResponseLine(`**Possible causes**:`);
      response.appendResponseLine('- Syntax error in JavaScript code');
      response.appendResponseLine('- Extension context is not active');
      response.appendResponseLine('- Missing permissions for the API being used');
      response.appendResponseLine('- Service Worker is not running (for MV3)');

      response.setIncludePages(true);
    }
  },
});
