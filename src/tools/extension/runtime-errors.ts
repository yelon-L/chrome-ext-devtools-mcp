/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Extension runtime errors retrieval tool
 *
 * Gets errors from Chrome's internal error tracking system (chrome.developerPrivate API)
 */

import z from 'zod';

import {ToolCategories} from '../categories.js';
import {defineTool} from '../ToolDefinition.js';
import {reportExtensionNotFound} from '../utils/ErrorReporting.js';

export const getExtensionRuntimeErrors = defineTool({
  name: 'get_extension_runtime_errors',
  description: `Get extension errors from chrome://extensions (uses chrome.developerPrivate API).

**This is the tool you need when:**
- ✅ You see "Errors" button with a number in chrome://extensions
- ✅ You want Chrome's internal error records (not just console logs)
- ✅ You need detailed error messages with stack traces
- ✅ You want error occurrence counts (how many times each error happened)

**Data source**: chrome.developerPrivate API (called in chrome://extensions context)

**What you get**:
- Complete error list from Chrome's internal tracking
- Full stack traces with function names and line numbers
- Error occurrence counts (e.g., "This error happened 4510 times")
- Manifest errors and install warnings
- Render process and view IDs
- Context URLs and source file locations

**How it works**:
1. Navigates to chrome://extensions
2. **Calls chrome.developerPrivate.getExtensionsInfo() API**
3. Extracts complete error data directly from Chrome
4. Returns structured error information

**NOT for**:
- ❌ Real-time console monitoring → use \`get_background_logs\`

**Example scenarios**:
1. User reports: "chrome://extensions shows 8 errors"
   → Use this tool to get all 8 errors with complete details
   
2. Quick error check: "Does this extension have errors?"
   → Use this tool for complete verification
   
3. Need occurrence counts: "Which errors happen most frequently?"
   → This tool shows occurrence counts for each error

**Complementary tools**:
- \`get_background_logs\` - Real-time background console monitoring`,
  annotations: {
    category: ToolCategories.EXTENSION_DEBUGGING,
    readOnlyHint: true,
  },
  schema: {
    extensionId: z
      .string()
      .regex(/^[a-z]{32}$/)
      .describe(
        'Extension ID to get runtime errors from. Get this from list_extensions.',
      ),
    includeManifestErrors: z
      .boolean()
      .optional()
      .describe('Include manifest errors. Default is true.'),
    includeWarnings: z
      .boolean()
      .optional()
      .describe('Include warning-level messages. Default is false.'),
    sortBy: z
      .enum(['occurrences', 'time'])
      .optional()
      .describe(
        'Sort errors by occurrence count or timestamp. Default is occurrences.',
      ),
    limit: z
      .number()
      .positive()
      .optional()
      .describe('Maximum number of errors to return. Default is 50.'),
  },
  handler: async (request, response, context) => {
    const {
      extensionId,
      includeManifestErrors = true,
      includeWarnings = false,
      sortBy = 'occurrences',
      limit = 50,
    } = request.params;

    try {
      // 1. Get extension details first to verify it exists
      const extensions = await context.getExtensions();
      const extension = extensions.find(ext => ext.id === extensionId);

      if (!extension) {
        reportExtensionNotFound(response, extensionId, extensions);
        response.setIncludePages(true);
        return;
      }

      response.appendResponseLine(`# Extension Runtime Errors\n`);
      response.appendResponseLine(
        `**Extension**: ${extension.name} (v${extension.version})`,
      );
      response.appendResponseLine(`**ID**: ${extensionId}\n`);

      // 2. Navigate to chrome://extensions and extract errors from DOM
      response.appendResponseLine(
        `## 🔍 Extracting Errors from chrome://extensions\n`,
      );

      // Create a new page for extraction
      const browser = context.getBrowser();
      const page = await browser.newPage();

      let runtimeErrors: Array<{
        message: string;
        source: string;
        stack: string;
        context: string;
        type: string;
        occurrences: number;
        severity: string;
        renderProcessId?: number;
        renderViewId?: number;
      }> = [];
      let manifestErrors: Array<{
        message: string;
        source: string;
        type: string;
      }> = [];
      let installWarnings: string[] = [];
      let errorCount = 0;

      try {
        // Navigate to chrome://extensions
        await page.goto('chrome://extensions/', {
          waitUntil: 'networkidle0',
          timeout: 10000,
        });

        // Wait for page to load
        await new Promise(resolve => setTimeout(resolve, 500));

        // 🚀 Use chrome.developerPrivate API in chrome://extensions context
        const errorData = await page.evaluate(async (extId: string) => {
          // Check if chrome.developerPrivate is available
          const chromeAPI = (
            window as {
              chrome?: {
                developerPrivate?: {
                  getExtensionsInfo: (
                    options: unknown,
                    callback: (extensions: unknown[]) => void,
                  ) => void;
                };
              };
            }
          ).chrome;
          if (typeof chromeAPI === 'undefined' || !chromeAPI.developerPrivate) {
            return {
              error: 'chrome.developerPrivate API not available',
              errors: [],
            };
          }

          return new Promise(resolve => {
            try {
              // Call chrome.developerPrivate.getExtensionsInfo
              chromeAPI.developerPrivate!.getExtensionsInfo(
                {
                  includeDisabled: true,
                  includeTerminated: true,
                },
                (extensions: unknown[]) => {
                  const typedExtensions = extensions as Array<{
                    id: string;
                    runtimeErrors?: unknown[];
                    manifestErrors?: unknown[];
                    installWarnings?: unknown[];
                  }>;
                  // Find the target extension
                  const targetExt = typedExtensions.find(
                    ext => ext.id === extId,
                  );

                  if (!targetExt) {
                    resolve({
                      error: 'Extension not found in developerPrivate data',
                      errors: [],
                    });
                    return;
                  }

                  // Extract error information
                  const runtimeErrors = (targetExt.runtimeErrors || []).map(
                    (err: unknown) => {
                      const typedErr = err as {
                        message?: string;
                        source?: string;
                        stackTrace?: Array<{
                          functionName?: string;
                          url?: string;
                          lineNumber?: number;
                          columnNumber?: number;
                        }>;
                        contextUrl?: string;
                        type?: string;
                        occurrences?: number;
                        severity?: string;
                        renderProcessId?: number;
                        renderViewId?: number;
                      };
                      return {
                        message: typedErr.message || '',
                        source: typedErr.source || '',
                        stack: typedErr.stackTrace
                          ? typedErr.stackTrace
                              .map(frame => {
                                const funcName =
                                  frame.functionName || '<anonymous>';
                                const location = `${frame.url}:${frame.lineNumber}:${frame.columnNumber}`;
                                return `  at ${funcName} (${location})`;
                              })
                              .join('\n')
                          : '',
                        context: typedErr.contextUrl || '',
                        type: typedErr.type || 'runtime',
                        occurrences: typedErr.occurrences || 1,
                        severity: typedErr.severity || 'ERROR',
                        renderProcessId: typedErr.renderProcessId,
                        renderViewId: typedErr.renderViewId,
                      };
                    },
                  );

                  const manifestErrors = (targetExt.manifestErrors || []).map(
                    (err: unknown) => {
                      const typedErr = err as {
                        message?: string;
                        manifestKey?: string;
                      };
                      return {
                        message: typedErr.message || '',
                        source: typedErr.manifestKey || '',
                        type: 'manifest',
                      };
                    },
                  );

                  const installWarnings = (targetExt.installWarnings || []).map(
                    (warn: unknown) => {
                      const typedWarn = warn as string | {message?: string};
                      return typeof typedWarn === 'string'
                        ? typedWarn
                        : typedWarn.message || '';
                    },
                  );

                  resolve({
                    success: true,
                    usedDeveloperPrivate: true,
                    errorCount: runtimeErrors.length,
                    errors: runtimeErrors,
                    manifestErrors: manifestErrors,
                    installWarnings: installWarnings,
                  });
                },
              );
            } catch (error) {
              resolve({
                error: `Failed to call developerPrivate: ${error}`,
                errors: [],
              });
            }
          });
        }, extensionId);

        const typedErrorData = errorData as {
          error?: string;
          errorCount?: number;
          errors?: typeof runtimeErrors;
          manifestErrors?: typeof manifestErrors;
          installWarnings?: typeof installWarnings;
          usedDeveloperPrivate?: boolean;
        };

        if (typedErrorData.error) {
          response.appendResponseLine(
            `⚠️ **Unable to extract errors**: ${typedErrorData.error}\n`,
          );
        } else {
          errorCount = typedErrorData.errorCount || 0;
          runtimeErrors = typedErrorData.errors || [];
          manifestErrors = typedErrorData.manifestErrors || [];
          installWarnings = typedErrorData.installWarnings || [];

          // Show if we used chrome.developerPrivate API
          if (typedErrorData.usedDeveloperPrivate) {
            response.appendResponseLine(
              `✅ **Successfully used chrome.developerPrivate API** to extract complete error details\n`,
            );
          }
        }
      } finally {
        await page.close();
      }

      // 3. Process and filter errors

      // Filter warnings if not requested
      if (!includeWarnings) {
        runtimeErrors = runtimeErrors.filter(err => err.severity !== 'WARNING');
      }

      // 4. Display summary
      response.appendResponseLine(`## Summary\n`);

      if (errorCount > 0) {
        response.appendResponseLine(
          `- 🔴 **Error Count**: ${errorCount} (from chrome://extensions)`,
        );
      }

      response.appendResponseLine(
        `- 📝 **Extracted Details**: ${runtimeErrors.length} error(s)`,
      );

      if (includeManifestErrors && manifestErrors.length > 0) {
        response.appendResponseLine(
          `- 📦 **Manifest Errors**: ${manifestErrors.length}`,
        );
      }

      if (installWarnings.length > 0) {
        response.appendResponseLine(
          `- ⚠️ **Install Warnings**: ${installWarnings.length}`,
        );
      }

      response.appendResponseLine('');

      // 5. Handle no errors case
      if (
        errorCount === 0 &&
        runtimeErrors.length === 0 &&
        manifestErrors.length === 0
      ) {
        response.appendResponseLine('✅ **No errors found!**\n');
        response.appendResponseLine(
          'The extension appears to be running correctly according to chrome://extensions.\n',
        );
        response.appendResponseLine('## 💡 Note\n');
        response.appendResponseLine(
          'This tool extracts error information from the chrome://extensions page.',
        );
        response.appendResponseLine('For real-time error monitoring, use:');
        response.appendResponseLine(
          '- `get_background_logs` - Monitor background console output\n',
        );
        response.setIncludePages(true);
        return;
      }

      // 6. Show limitation if errors exist but details not extracted
      if (errorCount > 0 && runtimeErrors.length === 0) {
        response.appendResponseLine('## ⚠️ Limitation\n');
        response.appendResponseLine(
          `Chrome shows **${errorCount} errors** for this extension, but error details are not accessible without user interaction.\n`,
        );
        response.appendResponseLine(
          '**Why**: Chrome requires clicking the "Errors" button to load full error details.\n',
        );
        response.appendResponseLine('**Alternative approaches**:');
        response.appendResponseLine(
          '1. **Manual check**: Open chrome://extensions and click "Errors" button',
        );
        response.appendResponseLine(
          '2. **Console monitoring**: Use `get_background_logs` to capture new errors\n',
        );
        response.setIncludePages(true);
        return;
      }

      // 9. Sort errors
      if (sortBy === 'occurrences') {
        runtimeErrors.sort(
          (a, b) => (b.occurrences || 0) - (a.occurrences || 0),
        );
      }

      // Apply limit
      const displayErrors = runtimeErrors.slice(0, limit);

      // 10. Display runtime errors
      if (displayErrors.length > 0) {
        response.appendResponseLine(
          `## Runtime Errors (${displayErrors.length})\n`,
        );

        displayErrors.forEach((error, index: number) => {
          response.appendResponseLine(`### ❌ Error #${index + 1}\n`);

          response.appendResponseLine(`**Message**:`);
          response.appendResponseLine(`\`\`\`\n${error.message}\n\`\`\`\n`);

          if (error.source && error.source.length > 0) {
            response.appendResponseLine(`**Source**: \`${error.source}\``);
          }

          if (error.context && error.context.length > 0) {
            response.appendResponseLine(`**Context**: ${error.context}`);
          }

          // Display stack trace if available
          if (error.stack && error.stack.length > 0) {
            response.appendResponseLine(`\n**Stack Trace**:`);
            response.appendResponseLine('```');
            response.appendResponseLine(error.stack);
            response.appendResponseLine('```');
          }

          response.appendResponseLine('');
        });

        if (runtimeErrors.length > limit) {
          response.appendResponseLine(
            `\n*...and ${runtimeErrors.length - limit} more error(s). Use \`limit\` parameter to see more.*\n`,
          );
        }
      }

      // 11. Display manifest errors
      if (includeManifestErrors && manifestErrors.length > 0) {
        response.appendResponseLine(`## Manifest Errors\n`);

        manifestErrors.forEach((error, index: number) => {
          response.appendResponseLine(`### 📦 Manifest Error #${index + 1}\n`);
          response.appendResponseLine(`**Message**: ${error.message}`);

          if (error.source) {
            response.appendResponseLine(
              `**Manifest Key**: \`${error.source}\``,
            );
          }

          response.appendResponseLine('');
        });
      }

      // 12. Display install warnings
      if (installWarnings.length > 0) {
        response.appendResponseLine(`## Install Warnings\n`);

        installWarnings.forEach((warning, index: number) => {
          response.appendResponseLine(`### ⚠️ Warning #${index + 1}\n`);
          response.appendResponseLine(`**Message**: ${warning}\n`);
        });
      }

      // 13. Note about implementation status
      response.appendResponseLine(`## 💡 Note\n`);
      response.appendResponseLine(
        'This tool is still under development. Once fully implemented, it will provide:',
      );
      response.appendResponseLine(
        '- Error occurrence counts to identify high-frequency issues',
      );
      response.appendResponseLine(
        "- Complete stack traces from Chrome's internal records",
      );
      response.appendResponseLine(
        '- Detailed recommendations based on error patterns\n',
      );

      // 14. Related tools suggestions
      response.appendResponseLine(`## 🔧 Related Tools\n`);
      response.appendResponseLine('Need more help? Try these tools:\n');
      response.appendResponseLine(
        '- `get_background_logs` - Monitor real-time background console output\n',
      );
    } catch (error) {
      // Follow navigate_page_history pattern: simple error message
      response.appendResponseLine(
        'Unable to retrieve runtime errors. The extension may be inactive or the API may be unavailable.',
      );

      if (error instanceof Error) {
        response.appendResponseLine(`\n**Details**: ${error.message}`);
      }
    }

    response.setIncludePages(true);
  },
});
