/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Extension error capture enhancement tool
 * 
 * Injects error listeners into extension context to capture uncaught errors
 */

import z from 'zod';

import {ToolCategories} from '../categories.js';
import {defineTool} from '../ToolDefinition.js';
import {reportExtensionNotFound} from '../utils/ErrorReporting.js';

export const enhanceExtensionErrorCapture = defineTool({
  name: 'enhance_extension_error_capture',
  description: `Inject global error listeners to catch future uncaught errors (preventive measure).

**This is the tool you need when:**
- ✅ You want to catch errors BEFORE they happen (inject before testing)
- ✅ You're debugging hard-to-reproduce async errors
- ✅ Other tools show "no errors" but you know there are problems
- ✅ You need to capture Promise rejections that aren't logged

**What it does**: Injects code into extension to catch all future errors

**What you get**:
- Captures all uncaught JavaScript errors (from injection time forward)
- Captures all unhandled Promise rejections
- Automatically logs them to console with [EXTENSION_ERROR] prefix
- These logged errors then become visible to other tools

**NOT for**:
- ❌ Historical errors (already happened) → use \`get_extension_runtime_errors\`
- ❌ Existing console logs → use \`get_extension_logs\`
- ❌ Error analysis → use \`diagnose_extension_errors\`

**Lifecycle**: Active until extension reload or Service Worker restart

**Example scenarios**:
1. Before testing: "Catch any errors during my test"
   → Inject first, then trigger actions, then check logs
   
2. Production monitoring: "Monitor for unexpected errors"
   → Inject once, leave active
   
3. No errors showing but extension broken: "Why no error logs?"
   → Inject to catch errors that aren't being logged

**Typical workflow**:
\`\`\`
1. enhance_extension_error_capture → Inject listeners
2. [Perform actions that may cause errors]
3. get_extension_logs → See [EXTENSION_ERROR] entries
4. diagnose_extension_errors → Get analysis and recommendations
\`\`\`

**⚠️ MV3 prerequisite**: Service Worker must be active. Use \`activate_extension_service_worker\` if needed.

**Related tools**:
- \`get_extension_logs\` - Monitor logs after injection
- \`diagnose_extension_errors\` - Analyze captured errors
- \`get_extension_runtime_errors\` - For historical Chrome errors`,
  annotations: {
    category: ToolCategories.EXTENSION_DEBUGGING,
    readOnlyHint: false,
  },
  schema: {
    extensionId: z
      .string()
      .regex(/^[a-z]{32}$/)
      .describe('Extension ID to enhance. Get this from list_extensions.'),
    captureStackTraces: z
      .boolean()
      .optional()
      .describe('Include full stack traces in error logs. Default is true.'),
  },
  handler: async (request, response, context) => {
    const {
      extensionId,
      captureStackTraces = true,
    } = request.params;

    try {
      // 1. Get extension details
      const extensions = await context.getExtensions();
      const extension = extensions.find(ext => ext.id === extensionId);

      if (!extension) {
        reportExtensionNotFound(response, extensionId, extensions);
        response.setIncludePages(true);
        return;
      }

      response.appendResponseLine(`# Enhancing Error Capture\n`);
      response.appendResponseLine(`**Extension**: ${extension.name} (v${extension.version})`);
      response.appendResponseLine(`**ID**: ${extensionId}\n`);

      // 2. Check if Service Worker is active (for MV3)
      if (extension.manifestVersion === 3) {
        if (extension.serviceWorkerStatus === 'inactive') {
          response.appendResponseLine('⚠️ **Service Worker is inactive**\n');
          response.appendResponseLine('The Service Worker must be active to inject error listeners.');
          response.appendResponseLine('**Solution**: Run `activate_extension_service_worker` first.\n');
          response.setIncludePages(true);
          return;
        }
      }

      // 3. Get background context
      const contexts = await context.getExtensionContexts(extensionId);
      const backgroundContext = contexts.find((ctx: any) => ctx.isPrimary);

      if (!backgroundContext) {
        response.appendResponseLine('❌ **No Background Context Found**\n');
        response.appendResponseLine('The extension has no active background context.');
        response.appendResponseLine('**Solution**: Use `activate_extension_service_worker` to activate it.\n');
        response.setIncludePages(true);
        return;
      }

      // 4. Inject error capture code
      const injectionCode = `
        (function() {
          // Check if already injected
          if (self.__ERROR_CAPTURE_ENHANCED__) {
            return {
              status: 'already_injected',
              message: 'Error capture is already active'
            };
          }

          // Mark as injected
          self.__ERROR_CAPTURE_ENHANCED__ = true;

          const captureStackTraces = ${captureStackTraces};
          let errorCount = 0;
          let rejectionCount = 0;

          // Capture uncaught errors
          self.addEventListener('error', (event) => {
            errorCount++;
            const errorInfo = {
              type: 'UNCAUGHT_ERROR',
              message: event.message,
              filename: event.filename,
              lineno: event.lineno,
              colno: event.colno,
              timestamp: new Date().toISOString(),
              count: errorCount
            };

            if (captureStackTraces && event.error?.stack) {
              errorInfo.stack = event.error.stack;
            }

            console.error('[EXTENSION_ERROR]', JSON.stringify(errorInfo, null, 2));
          });

          // Capture unhandled promise rejections
          self.addEventListener('unhandledrejection', (event) => {
            rejectionCount++;
            const rejectionInfo = {
              type: 'UNHANDLED_REJECTION',
              reason: event.reason?.message || String(event.reason),
              timestamp: new Date().toISOString(),
              count: rejectionCount
            };

            if (captureStackTraces && event.reason?.stack) {
              rejectionInfo.stack = event.reason.stack;
            }

            console.error('[EXTENSION_ERROR]', JSON.stringify(rejectionInfo, null, 2));
          });

          return {
            status: 'injected',
            message: 'Error capture listeners activated',
            captureStackTraces
          };
        })();
      `;

      const result = await context.evaluateInExtensionContext(
        backgroundContext.targetId,
        injectionCode,
        true
      ) as {status: string; message: string; captureStackTraces?: boolean};

      // 5. Report result
      if (result.status === 'already_injected') {
        response.appendResponseLine('ℹ️ **Already Enhanced**\n');
        response.appendResponseLine('Error capture is already active for this extension.');
        response.appendResponseLine('No additional action needed.\n');
      } else if (result.status === 'injected') {
        response.appendResponseLine('✅ **Enhancement Complete**\n');
        response.appendResponseLine('Error listeners have been successfully injected.');
        response.appendResponseLine(`**Stack Traces**: ${captureStackTraces ? 'Enabled' : 'Disabled'}\n`);
        
        response.appendResponseLine('## What\'s Captured\n');
        response.appendResponseLine('- ❌ **Uncaught JavaScript errors** - All unhandled errors');
        response.appendResponseLine('- 🔴 **Unhandled Promise rejections** - Async errors');
        response.appendResponseLine('- 📍 **File location and line numbers** - Error source tracking');
        if (captureStackTraces) {
          response.appendResponseLine('- 📚 **Stack traces** - Full error context');
        }
        response.appendResponseLine('');

        response.appendResponseLine('## Next Steps\n');
        response.appendResponseLine('1. Trigger extension actions that may cause errors');
        response.appendResponseLine('2. Run `diagnose_extension_errors` to analyze captured errors');
        response.appendResponseLine('3. Check `get_extension_logs` for [EXTENSION_ERROR] entries\n');

        response.appendResponseLine('## Lifecycle\n');
        response.appendResponseLine('- ✅ Active until extension reload or Service Worker restart');
        response.appendResponseLine('- ✅ Safe to call multiple times (idempotent)');
        response.appendResponseLine('- ✅ No performance impact on extension\n');
      }

    } catch (error) {
      response.appendResponseLine(
        'Unable to enhance error capture. The extension may be inactive or disabled.'
      );
      response.appendResponseLine(`\n**Error**: ${error instanceof Error ? error.message : String(error)}`);
    }
    
    response.setIncludePages(true);
  },
});
