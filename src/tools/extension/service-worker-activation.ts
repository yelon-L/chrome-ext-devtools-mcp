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
  description: `Wake up inactive Service Workers for MV3 extensions using Chrome DevTools Protocol.

**🎯 For AI: Use BEFORE** \`evaluate_in_extension\`, \`inspect_extension_storage\`, or any tool requiring active SW.

**Why needed**:
MV3 Service Workers become inactive after ~30 seconds. When inactive:
- \`evaluate_in_extension\` fails with "No background context found"
- \`list_extension_contexts\` shows no background context
- Storage inspection may fail

**Activation modes**:
- **inactive** (default): Only activate currently inactive SWs
- **all**: Activate all extension SWs (even if active)
- **single**: Activate specific extension (requires extensionId)

**Required workflow**:
1. \`list_extensions\` → Check SW status
2. If 🔴 Inactive → \`activate_extension_service_worker\`
3. Wait 1-2 seconds
4. Proceed with other tools

**Related tools**: \`list_extensions\`, \`evaluate_in_extension\`, \`list_extension_contexts\``,
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
    response.appendResponseLine('- Use `get_background_logs` to view SW startup logs');
  }
}
