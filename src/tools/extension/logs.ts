/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Extension log collection tool
 */

import z from 'zod';

import {ToolCategories} from '../categories.js';
import {defineTool} from '../ToolDefinition.js';

export const getBackgroundLogs = defineTool({
  name: 'get_background_logs',
  description: `Get console logs from extension's background context (Service Worker or Background Page) with filtering by level and time.

**Note**: Service Worker must be active. Use \`activate_extension_service_worker\` if needed.`,
  annotations: {
    category: ToolCategories.EXTENSION_MONITORING,
    readOnlyHint: true,
  },
  schema: {
    extensionId: z
      .string()
      .regex(/^[a-z]{32}$/)
      .describe(
        'Extension ID to get logs from. Get this from list_extensions.',
      ),
    includeHistory: z
      .boolean()
      .optional()
      .default(false)
      .describe(
        'Whether to include historical logs stored by the extension. When omitted, defaults to false. Note: requires extension to store logs in globalThis.__logs.',
      ),
    level: z
      .array(z.enum(['error', 'warn', 'info', 'log', 'debug']))
      .optional()
      .describe('Log levels to include. When omitted, returns all levels.'),
    limit: z
      .number()
      .positive()
      .optional()
      .describe(
        'Maximum number of log entries to return. When omitted, defaults to 50.',
      ),
    since: z
      .number()
      .optional()
      .describe(
        'Only return logs since this timestamp (milliseconds since epoch). When omitted, returns all logs. Useful for incremental log collection.',
      ),
    duration: z
      .number()
      .positive()
      .optional()
      .default(5000)
      .describe(
        'Duration in milliseconds to capture real-time logs. When omitted, defaults to 5000 (5 seconds).',
      ),
  },
  handler: async (request, response, context) => {
    const {
      extensionId,
      includeHistory = false,
      level: _level,
      limit: _limit = 50,
      since: _since,
      duration = 5000,
    } = request.params;

    try {
      const result = await context.getBackgroundLogs(extensionId, {
        capture: true,
        duration,
        includeStored: includeHistory,
      });

      const logs = result.logs;

      response.appendResponseLine(`# Background Logs\n`);
      response.appendResponseLine(`**Extension ID**: ${extensionId}`);
      response.appendResponseLine(`**Total**: ${logs.length} entries\n`);

      if (logs.length === 0) {
        response.appendResponseLine('*No logs found*\n');
        response.appendResponseLine('**Possible reasons**:');
        response.appendResponseLine('- Extension has not logged anything yet');
        response.appendResponseLine('- Logs have been cleared');
        response.appendResponseLine(
          '- Time filter (since parameter) is too recent',
        );
        response.setIncludePages(true);
        return;
      }

      // Group logs by level
      const grouped = logs.reduce(
        (acc, log) => {
          const level = log.level || 'log';
          if (!acc[level]) {
            acc[level] = [];
          }
          acc[level].push(log);
          return acc;
        },
        {} as Record<string, typeof logs>,
      );

      // Display summary
      response.appendResponseLine('## Summary\n');
      const levelEmojis: Record<string, string> = {
        error: '❌',
        warn: '⚠️',
        info: 'ℹ️',
        log: '📝',
        debug: '🐛',
      };

      for (const [lvl, entries] of Object.entries(grouped)) {
        const emoji = levelEmojis[lvl] || '📋';
        response.appendResponseLine(
          `- ${emoji} **${lvl}**: ${entries.length} entries`,
        );
      }

      response.appendResponseLine('\n## Log Entries\n');

      // Display each log entry
      logs.forEach(log => {
        const time = new Date(log.timestamp).toLocaleTimeString();
        const logLevel = log.level || 'log';
        const emoji = levelEmojis[logLevel] || '📋';

        response.appendResponseLine(
          `### ${emoji} ${logLevel.toUpperCase()} - ${time}`,
        );

        if (log.source) {
          response.appendResponseLine(`**Source**: ${log.source}`);
        }

        response.appendResponseLine(`**Message**: ${log.text}`);

        if (log.stackTrace) {
          response.appendResponseLine(
            `**Stack Trace**:\n\`\`\`\n${log.stackTrace}\n\`\`\``,
          );
        }

        response.appendResponseLine('');
      });

      response.appendResponseLine(
        '\n**Tip**: Use the `since` parameter to get only new logs since your last check.',
      );
    } catch {
      // ✅ Following navigate_page_history pattern: simple error message
      response.appendResponseLine(
        'Unable to get background logs. The Service Worker may be inactive or disabled.',
      );
    }

    response.setIncludePages(true);
  },
});

export const getOffscreenLogs = defineTool({
  name: 'get_offscreen_logs',
  description: `Get console logs from extension's Offscreen Document (MV3 only) - hidden page for DOM operations like Canvas or Audio.

**Prerequisite**: Extension must have created an Offscreen Document.`,
  annotations: {
    category: ToolCategories.EXTENSION_MONITORING,
    readOnlyHint: true,
  },
  schema: {
    extensionId: z
      .string()
      .regex(/^[a-z]{32}$/)
      .describe(
        'Extension ID to get logs from. Get this from list_extensions.',
      ),
    includeHistory: z
      .boolean()
      .optional()
      .default(false)
      .describe(
        'Whether to include historical logs stored by the extension. When omitted, defaults to false. Note: requires extension to store logs in globalThis.__logs.',
      ),
    level: z
      .array(z.enum(['error', 'warn', 'info', 'log', 'debug']))
      .optional()
      .describe('Log levels to include. When omitted, returns all levels.'),
    limit: z
      .number()
      .positive()
      .optional()
      .describe(
        'Maximum number of log entries to return. When omitted, defaults to 50.',
      ),
    since: z
      .number()
      .optional()
      .describe(
        'Only return logs since this timestamp (milliseconds since epoch). When omitted, returns all logs. Useful for incremental log collection.',
      ),
    duration: z
      .number()
      .positive()
      .optional()
      .default(5000)
      .describe(
        'Duration in milliseconds to capture real-time logs. When omitted, defaults to 5000 (5 seconds).',
      ),
  },
  handler: async (request, response, context) => {
    const {
      extensionId,
      includeHistory = false,
      level: _level,
      limit: _limit = 50,
      since: _since,
      duration = 5000,
    } = request.params;

    try {
      const result = await context.getOffscreenLogs(extensionId, {
        capture: true,
        duration,
        includeStored: includeHistory,
      });

      const logs = result.logs;

      response.appendResponseLine(`# Offscreen Document Logs\n`);
      response.appendResponseLine(`**Extension ID**: ${extensionId}`);
      response.appendResponseLine(`**Total**: ${logs.length} entries\n`);

      if (logs.length === 0) {
        response.appendResponseLine('*No logs found*\n');
        response.appendResponseLine('**Possible reasons**:');
        response.appendResponseLine(
          '- Offscreen Document has not been created yet',
        );
        response.appendResponseLine(
          '- Offscreen Document has not logged anything',
        );
        response.appendResponseLine('- Offscreen Document was closed');
        response.appendResponseLine('\n**How to create Offscreen Document**:');
        response.appendResponseLine('```javascript');
        response.appendResponseLine('await chrome.offscreen.createDocument({');
        response.appendResponseLine('  url: "offscreen.html",');
        response.appendResponseLine('  reasons: ["TESTING"],');
        response.appendResponseLine(
          '  justification: "Testing offscreen logging"',
        );
        response.appendResponseLine('});');
        response.appendResponseLine('```');
        response.setIncludePages(true);
        return;
      }

      // Group logs by level
      const grouped = logs.reduce(
        (acc, log) => {
          const level = log.level || 'log';
          if (!acc[level]) {
            acc[level] = [];
          }
          acc[level].push(log);
          return acc;
        },
        {} as Record<string, typeof logs>,
      );

      // Display summary
      response.appendResponseLine('## Summary\n');
      const levelEmojis: Record<string, string> = {
        error: '❌',
        warn: '⚠️',
        info: 'ℹ️',
        log: '📝',
        debug: '🐛',
      };

      for (const [lvl, entries] of Object.entries(grouped)) {
        const emoji = levelEmojis[lvl] || '📋';
        response.appendResponseLine(
          `- ${emoji} **${lvl}**: ${entries.length} entries`,
        );
      }

      response.appendResponseLine('\n## Log Entries\n');

      // Display each log entry
      logs.forEach(log => {
        const time = new Date(log.timestamp).toLocaleTimeString();
        const logLevel = log.level || 'log';
        const emoji = levelEmojis[logLevel] || '📋';

        response.appendResponseLine(
          `### ${emoji} ${logLevel.toUpperCase()} - ${time}`,
        );

        if (log.source) {
          response.appendResponseLine(`**Source**: ${log.source}`);
        }

        response.appendResponseLine(`**Message**: ${log.text}`);

        if (log.stackTrace) {
          response.appendResponseLine(
            `**Stack Trace**:\n\`\`\`\n${log.stackTrace}\n\`\`\``,
          );
        }

        response.appendResponseLine('');
      });

      response.appendResponseLine(
        '\n**Tip**: Use the `since` parameter to get only new logs since your last check.',
      );
      response.appendResponseLine(
        '\n**Note**: Offscreen Document has independent console, separate from Service Worker and page console.',
      );
    } catch {
      // ✅ Following navigate_page_history pattern: simple error message
      response.appendResponseLine(
        'Unable to get offscreen logs. The Offscreen Document may not exist or has been closed.',
      );
      response.appendResponseLine('\n**How to check**:');
      response.appendResponseLine(
        '1. Use `list_extension_contexts` to see if offscreen context exists',
      );
      response.appendResponseLine(
        '2. Create Offscreen Document if needed using `chrome.offscreen.createDocument()`',
      );
    }

    response.setIncludePages(true);
  },
});
