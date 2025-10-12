/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * 扩展日志收集工具
 */

import z from 'zod';

import {ToolCategories} from '../categories.js';
import {defineTool} from '../ToolDefinition.js';

export const getExtensionLogs = defineTool({
  name: 'get_extension_logs',
  description: `Get console logs from a Chrome extension.

Captures console output from different extension contexts:
- Background script / Service Worker logs
- Content script logs (if running in tabs)
- Popup and options page logs

This is essential for debugging extension behavior without manually opening DevTools.
Logs are color-coded by level (error, warning, info, log, debug) for easy identification.`,
  annotations: {
    category: ToolCategories.EXTENSION_DEBUGGING,
    readOnlyHint: true,
  },
  schema: {
    extensionId: z
      .string()
      .regex(/^[a-z]{32}$/)
      .describe('Extension ID to get logs from. Get this from list_extensions.'),
    level: z
      .array(z.enum(['error', 'warn', 'info', 'log', 'debug']))
      .optional()
      .describe('Log levels to include. If not specified, returns all levels.'),
    limit: z
      .number()
      .positive()
      .optional()
      .describe('Maximum number of log entries to return. Default is 50.'),
    since: z
      .number()
      .optional()
      .describe('Only return logs since this timestamp (milliseconds since epoch). Useful for incremental log collection.'),
  },
  handler: async (request, response, context) => {
    const {
      extensionId,
      level,
      limit = 50,
      since,
    } = request.params;

    try {
      const result = await context.getExtensionLogs(extensionId, {
        capture: true,
        duration: 5000,
        includeStored: true,
      });
      
      const logs = result.logs;

      response.appendResponseLine(`# Extension Logs\n`);
      response.appendResponseLine(`**Extension ID**: ${extensionId}`);
      response.appendResponseLine(`**Total**: ${logs.length} entries\n`);

      if (logs.length === 0) {
        response.appendResponseLine('*No logs found*\n');
        response.appendResponseLine('**Possible reasons**:');
        response.appendResponseLine('- Extension has not logged anything yet');
        response.appendResponseLine('- Logs have been cleared');
        response.appendResponseLine('- Time filter (since parameter) is too recent');
        response.setIncludePages(true);
        return;
      }

      // Group logs by level
      const grouped = logs.reduce((acc, log) => {
        const level = log.level || 'log';
        if (!acc[level]) {
          acc[level] = [];
        }
        acc[level].push(log);
        return acc;
      }, {} as Record<string, typeof logs>);

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
        response.appendResponseLine(`- ${emoji} **${lvl}**: ${entries.length} entries`);
      }

      response.appendResponseLine('\n## Log Entries\n');

      // Display each log entry
      logs.forEach((log) => {
        const time = new Date(log.timestamp).toLocaleTimeString();
        const logLevel = log.level || 'log';
        const emoji = levelEmojis[logLevel] || '📋';
        
        response.appendResponseLine(`### ${emoji} ${logLevel.toUpperCase()} - ${time}`);
        
        if (log.source) {
          response.appendResponseLine(`**Source**: ${log.source}`);
        }
        
        response.appendResponseLine(`**Message**: ${log.text}`);
        
        if (log.stackTrace) {
          response.appendResponseLine(`**Stack Trace**:\n\`\`\`\n${log.stackTrace}\n\`\`\``);
        }
        
        response.appendResponseLine('');
      });

      response.appendResponseLine('\n**Tip**: Use the `since` parameter to get only new logs since your last check.');

      response.setIncludePages(true);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to get extension logs: ${message}`);
    }
  },
});
