/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Service Worker activation tool (CDP API version)
 * Uses Chrome DevTools Protocol to activate extension Service Workers
 */

import z from 'zod';

import {ExtensionHelper} from '../../extension/ExtensionHelper.js';
import {ToolCategories} from '../categories.js';
import {defineTool} from '../ToolDefinition.js';

export const activateExtensionServiceWorker = defineTool({
  name: 'activate_extension_service_worker',
  description: `Activate Service Worker(s) for MV3 Chrome extensions.

**Purpose**: Wake up inactive Service Workers using Chrome DevTools Protocol (more reliable than manual activation).

**Why you need this**:
MV3 Service Workers are ephemeral and become inactive after ~30 seconds of inactivity. When inactive:
- evaluate_in_extension fails ("No background context found")
- list_extension_contexts shows no background context
- inspect_extension_storage may fail
- Message listeners don't respond
- Background tasks don't run

**Activation modes**:
- **inactive** (default): Only activate Service Workers that are currently inactive
- **all**: Activate all extension Service Workers (even if already active)
- **single**: Activate one specific extension (requires extensionId)

**When to use**:
- BEFORE calling evaluate_in_extension on MV3 extensions
- When list_extensions shows SW status as 🔴 Inactive
- When list_extension_contexts returns "No active contexts"
- In automated testing to ensure SW is ready
- After extension reload to wake SW

**How it works**:
Uses CDP ServiceWorker.inspectWorker command to activate the SW, which is more reliable than clicking in chrome://extensions.

**💡 Best practice**: Always check SW status with list_extensions first, then activate if needed.

**Example**: activate_extension_service_worker with mode="inactive" activates 2 of 3 MV3 extensions (1 was already active).`,
  annotations: {
    category: ToolCategories.EXTENSION_DEBUGGING,
    readOnlyHint: false,
  },
  schema: {
    extensionId: z
      .string()
      .regex(/^[a-z]{32}$/)
      .optional()
      .describe('Extension ID. If not provided, activation is based on the mode parameter'),
    mode: z
      .enum(['single', 'all', 'inactive'])
      .optional()
      .default('inactive')
      .describe(`Activation mode:
        - single: Only activate the specified extensionId (requires extensionId)
        - all: Activate all extension Service Workers (including already active ones)
        - inactive: Only activate inactive Service Workers (default)`),
  },
  handler: async (request, response, context) => {
    const {extensionId, mode = 'inactive'} = request.params;

    // Validate parameter combination
    if (mode === 'single' && !extensionId) {
      response.appendResponseLine('# Parameter Error\n');
      response.appendResponseLine('❌ `extensionId` is required when using `single` mode');
      return;
    }

    try {
      // Activate Service Worker using CDP API
      const helper = new ExtensionHelper(context.getBrowser());
      const results: Array<{
        id: string;
        name: string;
        success: boolean;
        method?: string;
        error?: string;
        wasActive: boolean;
      }> = [];

      // Get list of extensions to activate
      let targetExtensions: Array<{id: string; name: string; isActive: boolean}> = [];
      
      if (mode === 'single' && extensionId) {
        // Single extension mode
        const isActive = await context.isServiceWorkerActive(extensionId);
        const extInfo = await context.getExtensionDetails(extensionId);
        
        if (!extInfo) {
          response.appendResponseLine('# Service Worker Activation Failed\n');
          response.appendResponseLine(`❌ Extension not found: \`${extensionId}\`\n`);
          response.appendResponseLine('💡 **Tip**: Use `list_extensions` to see all installed extensions');
          response.setIncludePages(true);
          return;
        }
        
        targetExtensions = [{
          id: extensionId,
          name: extInfo.name,
          isActive
        }];
      } else {
        // Batch mode: Get all extensions
        const extensions = await context.getExtensions(false);
        
        for (const ext of extensions) {
          const isActive = await context.isServiceWorkerActive(ext.id);
          
          // Filter based on mode
          if (mode === 'inactive' && isActive) {
            continue; // Skip already active ones
          }
          
          targetExtensions.push({
            id: ext.id,
            name: ext.name,
            isActive
          });
        }
      }

      // Handle case where nothing needs activation
      if (targetExtensions.length === 0) {
        response.appendResponseLine('# Service Worker Activation Result\n');
        response.appendResponseLine(`✅ **Status**: All extension Service Workers are already active\n`);
        response.appendResponseLine(`**Mode**: ${mode === 'all' ? 'All extensions' : 'Inactive only'}`);
        response.setIncludePages(true);
        return;
      }

      // Activate target extensions
      for (const target of targetExtensions) {
        const result = await helper.activateServiceWorker(target.id);
        
        results.push({
          id: target.id,
          name: target.name,
          success: result.success,
          method: result.method,
          error: result.error,
          wasActive: target.isActive
        });
      }

      // Format output
      formatCDPResponse(response, {
        status: 'completed',
        activated: results.filter(r => r.success).length,
        total: results.length,
        mode,
        results
      }, extensionId, mode);

    } catch {
      // ✅ Following navigate_page_history pattern: simple error message
      response.appendResponseLine(
        'Unable to activate Service Worker. The extension may be disabled or the Service Worker may have errors.'
      );
    }
    
    response.setIncludePages(true);
  },
});

/**
 * Format CDP API response output
 */
function formatCDPResponse(
  response: any,
  result: any,
  extensionId: string | undefined,
  mode: string
) {
  response.appendResponseLine('# Service Worker Activation Result\n');
  
  // Show activation statistics
  response.appendResponseLine(`✅ **Successfully activated**: ${result.activated} / ${result.total}\n`);
  
  if (mode === 'single' && extensionId) {
    response.appendResponseLine(`**Mode**: Single extension (${extensionId})`);
  } else if (mode === 'all') {
    response.appendResponseLine(`**Mode**: All extensions`);
  } else {
    response.appendResponseLine(`**Mode**: Inactive extensions only`);
  }

  // Show detailed results
  if (result.results && result.results.length > 0) {
    response.appendResponseLine('\n## Activation Details\n');
    
    for (const item of result.results) {
      const statusIcon = item.success ? '✅' : '❌';
      const stateLabel = item.wasActive ? '(was active)' : '(inactive → activated)';
      
      response.appendResponseLine(`${statusIcon} **${item.name}**`);
      response.appendResponseLine(`   - ID: \`${item.id}\``);
      response.appendResponseLine(`   - Status: ${stateLabel}`);
      
      if (item.success) {
        if (item.method) {
          response.appendResponseLine(`   - Activation method: ${item.method}`);
        }
      } else if (item.error) {
        response.appendResponseLine(`   - Error: ${item.error}`);
      }
      
      response.appendResponseLine('');
    }
  }

  // Add tips
  if (result.activated > 0) {
    response.appendResponseLine('\n**Next steps**:');
    response.appendResponseLine('- Service Worker may need a brief delay to be fully ready after activation');
    response.appendResponseLine('- Use `list_extension_contexts` to view current extension context status');
    response.appendResponseLine('- Use `get_extension_logs` to view SW startup logs');
    response.appendResponseLine('- Use `enhance_extension_error_capture` to enable comprehensive error monitoring');
  }
}
