/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * 扩展上下文管理工具
 * 
 * 提供上下文列表和切换功能
 */

import z from 'zod';

import {ToolCategories} from '../categories.js';
import {defineTool} from '../ToolDefinition.js';

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
Each context has a unique Target ID that can be used with switch_extension_context.

⚠️ **Note for MV3 extensions**:
- If Service Worker is inactive, it won't appear in the contexts list
- "No active contexts" may indicate SW is inactive (check with 'list_extensions')
- Use 'activate_extension_service_worker' to activate SW if needed
- MV3 SW is ephemeral and may become inactive after 30 seconds of inactivity`,
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
      response.appendResponseLine(
        '\n💡 **Tip**: For MV3 extensions, try `activate_extension_service_worker` to activate the Service Worker',
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
  description: `Switch the active context to a specific extension context.

After switching, operations like evaluate_in_extension will run in the selected context.
This is essential for debugging different parts of an extension:
- Switch to background/service worker for background logic
- Switch to popup for UI code
- Switch to content script for page interaction code

Use list_extension_contexts first to get available Target IDs.`,
  annotations: {
    category: ToolCategories.EXTENSION_DEBUGGING,
    readOnlyHint: false,
  },
  schema: {
    extensionId: z
      .string()
      .regex(/^[a-z]{32}$/)
      .describe('Extension ID. Get this from list_extensions.'),
    targetId: z
      .string()
      .describe('Target ID of the context to switch to. Get this from list_extension_contexts.'),
  },
  handler: async (request, response, context) => {
    const {targetId} = request.params;

    try {
      await context.switchToExtensionContext(targetId);

      response.appendResponseLine(`# Context Switched\n`);
      response.appendResponseLine(`✅ Successfully switched to context: \`${targetId}\``);
      response.appendResponseLine(`\n**Next Steps**:`);
      response.appendResponseLine('- Use evaluate_in_extension to run code in this context');
      response.appendResponseLine('- Use inspect_extension_storage to check storage');
      response.appendResponseLine('- Use get_extension_logs to view logs from this context');

      response.setIncludePages(true);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      response.appendResponseLine(`# Error Switching Context\n`);
      response.appendResponseLine(`❌ Failed to switch to context \`${targetId}\`\n`);
      response.appendResponseLine(`**Error**: ${message}\n`);
      response.appendResponseLine(`**Possible Causes**:`);
      response.appendResponseLine('- Invalid Target ID');
      response.appendResponseLine('- Context has been closed');
      response.appendResponseLine('- Extension has been disabled or reloaded');
      response.appendResponseLine('\nUse list_extension_contexts to see current available contexts.');
      
      response.setIncludePages(true);
    }
  },
});
