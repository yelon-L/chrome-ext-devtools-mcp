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
  description: `List all running contexts (background, popup, options, etc.) of an extension with their type, URL, and target ID.

**Note**: Content scripts are not listed here as they run in page contexts without separate targets. Use \`check_content_script_injection\` to verify content script injection.

**Use this to**: Verify Service Worker is active before running code. If no contexts, use \`activate_extension_service_worker\` first.`,
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

        // 标注是否可以切换
        const canSwitch = !(ctx.type === 'background' && ctx.isPrimary);
        if (canSwitch) {
          response.appendResponseLine(
            '- **Switchable**: ✅ (use `switch_extension_context`)',
          );
        } else {
          response.appendResponseLine(
            '- **Switchable**: ❌ (Service Worker - use `evaluate_in_extension` instead)',
          );
        }
        response.appendResponseLine('');
      }
    }

    response.appendResponseLine('\n**Next Steps**:');
    response.appendResponseLine(
      '- Use `switch_extension_context` with a Target ID to switch to popup/options contexts',
    );
    response.appendResponseLine(
      '- Use `evaluate_in_extension` to execute code in Service Worker contexts',
    );
    response.appendResponseLine(
      '- Use `check_content_script_injection` to verify content script injection',
    );

    response.setIncludePages(true);
  },
});

export const switchExtensionContext = defineTool({
  name: 'switch_extension_context',
  description: `Switch the active context to a specific extension context.

After switching, operations like evaluate_in_extension will run in the selected context.
This is essential for debugging different parts of an extension:
- Switch to popup for UI code
- Switch to content script for page interaction code
- Switch to options page or devtools panel

⚠️ **Note**: Service Worker contexts cannot be switched to (no Page object). Use \`evaluate_in_extension\` directly for Service Worker code execution.

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
    const {extensionId, targetId} = request.params;

    try {
      // 先检查目标上下文类型
      const contexts = await context.getExtensionContexts(extensionId);
      const targetContext = contexts.find(ctx => ctx.targetId === targetId);

      if (!targetContext) {
        response.appendResponseLine(
          `❌ Context \`${targetId}\` not found. The context may no longer exist or the extension was reloaded.`,
        );
        response.appendResponseLine(
          '\n💡 **Tip**: Use `list_extension_contexts` to see available contexts.',
        );
        response.setIncludePages(true);
        return;
      }

      // Service Worker 不支持切换
      if (targetContext.type === 'background' && targetContext.isPrimary) {
        response.appendResponseLine(
          `❌ Cannot switch to Service Worker context (\`${targetId}\`).`,
        );
        response.appendResponseLine(
          '\n**Reason**: Service Worker contexts do not have a Page object.',
        );
        response.appendResponseLine(
          '\n💡 **Solution**: Use `evaluate_in_extension` to execute code in the Service Worker directly:',
        );
        response.appendResponseLine(
          `\n\`\`\`\nevaluate_in_extension(extensionId="${extensionId}", code="your_code_here")\n\`\`\``,
        );
        response.setIncludePages(true);
        return;
      }

      await context.switchToExtensionContext(targetId);

      response.appendResponseLine(`# Context Switched\n`);
      response.appendResponseLine(
        `✅ Successfully switched to context: \`${targetId}\``,
      );
      response.appendResponseLine(`\n**Context Type**: ${targetContext.type}`);
      response.appendResponseLine(`**URL**: ${targetContext.url}`);
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
    } catch (error) {
      // ✅ Following navigate_page_history pattern: simple error message
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      response.appendResponseLine(
        `❌ Unable to switch extension context: ${errorMsg}`,
      );
      response.appendResponseLine(
        '\n💡 **Tip**: The context may no longer exist or the extension was reloaded.',
      );
    }

    response.setIncludePages(true);
  },
});
