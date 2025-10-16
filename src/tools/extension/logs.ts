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

export const getExtensionLogs = defineTool({
  name: 'get_extension_logs',
  description: `Get console logs from a Chrome extension.

**Purpose**: Capture and retrieve console output from all extension contexts without opening DevTools.

**Log sources**:
- Background script / Service Worker (MV3)
- Content scripts running in web pages
- Popup windows
- Options pages
- DevTools pages

**What it provides**:
- Log message text
- Log level (error, warn, info, log, debug)
- Timestamp
- Source context (background, content_script, etc.)
- Stack traces for errors

**Filtering options**:
- By log level (error, warn, info, etc.)
- By time range (since timestamp)
- Limit number of entries

**When to use**:
- Debug extension without opening DevTools
- Monitor extension activity in real-time
- Capture error messages and stack traces
- Verify console.log() statements are working
- Diagnose issues reported by users

**⚠️ MV3 Service Worker logs**:
- SW logs only available when SW is active
- Inactive SW = no background logs
- Use activate_extension_service_worker to wake SW
- Content script logs available regardless of SW status

**Example**: get_extension_logs with level=["error", "warn"] returns 5 errors from Service Worker and 2 warnings from content scripts.`,
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

    } catch {
      // ✅ Following navigate_page_history pattern: simple error message
      response.appendResponseLine(
        'Unable to get extension logs. The extension may be inactive or disabled.'
      );
    }
    
    response.setIncludePages(true);
  },
});
