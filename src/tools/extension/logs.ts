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
  description: `Monitor real-time console output from extension (live log streaming).

**This is the tool you need when:**
- ✅ You want to see what the extension is logging RIGHT NOW
- ✅ You need to capture console.log(), console.error(), console.warn() output
- ✅ You want to monitor extension activity as it happens
- ✅ You need incremental log collection (get only new logs since last check)

**Data source**: Live console output from all extension contexts (captured via Puppeteer)

**What you get**:
- Real-time console messages (log, info, warn, error, debug)
- Timestamps for each log entry
- Source context (background, content_script, popup, etc.)
- Stack traces for errors (if available)
- Filtering by log level and time range

**NOT for**:
- ❌ chrome://extensions errors → use \`get_extension_runtime_errors\`
- ❌ Error analysis and recommendations → use \`diagnose_extension_errors\`
- ❌ Historical errors from hours ago → use \`get_extension_runtime_errors\`

**Example scenarios**:
1. Development debugging: "What is my extension logging?"
   → Use this tool to see live console output
   
2. Test verification: "Did my console.log() work?"
   → Use this tool to verify logging statements
   
3. Incremental monitoring: "Show me new logs since 5 minutes ago"
   → Use this tool with \`since\` parameter

**⚠️ MV3 Service Worker**: Logs only available when SW is active. Use \`activate_extension_service_worker\` if needed.

**Related tools**:
- \`enhance_extension_error_capture\` - Inject first, then monitor logs here
- \`diagnose_extension_errors\` - This provides raw data, diagnose provides analysis
- \`get_extension_runtime_errors\` - For Chrome's internal error records`,
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
