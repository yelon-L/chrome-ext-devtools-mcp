/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Extension context management tool
 *
 * Provides context listing and switching functionality
 */

import z from 'zod';

import {ToolCategories} from '../categories.js';
import {defineTool} from '../ToolDefinition.js';

export const listExtensionContexts = defineTool({
  name: 'list_extension_contexts',
  description: `List all running contexts (background, popup, content_script, etc.) of an extension with their type, URL, and target ID.

Use this to verify Service Worker is active before running code. If no contexts, use \`activate_extension_service_worker\` first.`,
  annotations: {
    category: ToolCategories.EXTENSION_INSPECTION,
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
      response.appendResponseLine(
        '\n💡 **Tip**: For MV3 extensions, try `activate_extension_service_worker` to activate the Service Worker',
      );
      response.setIncludePages(true);
      return;
    }

    response.appendResponseLine(`# Extension Contexts (${contexts.length})\n`);

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
  description: `Switch the active context to a specific extension context.

After switching, operations like evaluate_in_extension will run in the selected context.
This is essential for debugging different parts of an extension:
- Switch to background/service worker for background logic
- Switch to popup for UI code
- Switch to content script for page interaction code

Use list_extension_contexts first to get available Target IDs.`,
  annotations: {
    category: ToolCategories.EXTENSION_INSPECTION,
    readOnlyHint: false,
  },
  schema: {
    extensionId: z
      .string()
      .regex(/^[a-z]{32}$/)
      .describe('Extension ID. Get this from list_extensions.'),
    targetId: z
      .string()
      .describe(
        'Target ID of the context to switch to. Get this from list_extension_contexts.',
      ),
  },
  handler: async (request, response, context) => {
    const {targetId} = request.params;

    try {
      await context.switchToExtensionContext(targetId);

      response.appendResponseLine(`# Context Switched\n`);
      response.appendResponseLine(
        `✅ Successfully switched to context: \`${targetId}\``,
      );
      response.appendResponseLine(`\n**Next Steps**:`);
      response.appendResponseLine(
        '- Use `evaluate_in_extension` to run code in this context',
      );
      response.appendResponseLine(
        '- Use `inspect_extension_storage` to check storage',
      );
      response.appendResponseLine(
        '- Use `get_background_logs` to view logs from this context',
      );
    } catch {
      // ✅ Following navigate_page_history pattern: simple error message
      response.appendResponseLine(
        'Unable to switch extension context. The context may no longer exist or the extension was reloaded.',
      );
    }

    response.setIncludePages(true);
  },
});
