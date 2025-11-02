/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import z from 'zod';

import {ToolCategories} from './categories.js';
import {defineTool} from './ToolDefinition.js';

export const getPageConsoleLogs = defineTool({
  name: 'get_page_console_logs',
  description: `Get ALL console logs from the current page (Enhanced).

**🎯 For AI**: Captures EVERYTHING - page + Content Scripts + Workers + iframes + complex objects!

**What you get**:
- ✅ Page main context logs
- ✅ Content Script logs (from extensions)
- ✅ Web Worker logs
- ✅ Service Worker logs
- ✅ iframe logs
- ✅ Complete object serialization (functions, errors, Map, Set, etc.)
- All console messages since last navigation (log, error, warn, info, debug)
- Automatically collected in the background
- No setup or injection needed

**Filtering options**:
- \`types\`: Filter by log type (log, error, warn, info, debug)
- \`sources\`: Filter by source (page, worker, service-worker, iframe)
- \`since\`: Only logs after timestamp (milliseconds)
- \`limit\`: Maximum number of logs to return

**When to use**:
- ✅ After clicking buttons to see what was logged
- ✅ After executing scripts to verify console output
- ✅ After form submissions to check for errors
- ✅ Debugging page behavior

**How it works**:
- Console messages are automatically collected from page load
- Messages accumulate continuously while you use other tools
- This tool retrieves all accumulated messages
- Navigation (refresh/URL change) clears the collection

**Common workflow**:
\`\`\`
1. navigate_page / new_page  → Page loads, logging starts
2. click / fill / evaluate_script  → Actions generate logs
3. get_page_console_logs  → See all accumulated logs
\`\`\`

**Filtering examples**:
\`\`\`
get_page_console_logs({ types: ['error', 'warn'] })  → Only errors and warnings
get_page_console_logs({ sources: ['worker'] })  → Only Worker logs
get_page_console_logs({ since: Date.now() - 60000 })  → Last minute
get_page_console_logs({ limit: 10 })  → Last 10 logs
\`\`\`

**Tip**: Most action tools (click, fill, evaluate_script) now automatically include console logs in their response, so you may not need to call this tool separately.

**Related tools**:
- \`list_console_messages\` - Same functionality, different name
- Action tools (click, fill, etc.) - Automatically include console logs`,
  annotations: {
    category: ToolCategories.DEBUGGING,
    readOnlyHint: true,
  },
  schema: {
    types: z
      .array(z.enum(['log', 'error', 'warn', 'info', 'debug']))
      .optional()
      .describe(
        'Filter by log types. When omitted or empty, returns all types.',
      ),
    sources: z
      .array(z.enum(['page', 'worker', 'service-worker', 'iframe']))
      .optional()
      .describe(
        'Filter by log sources. When omitted or empty, returns all sources.',
      ),
    since: z
      .number()
      .optional()
      .describe(
        'Only return logs after this timestamp (milliseconds since epoch). When omitted, returns all logs.',
      ),
    limit: z
      .number()
      .min(1)
      .optional()
      .describe(
        'Maximum number of logs to return. When omitted, returns all logs.',
      ),
  },
  handler: async (request, response, context) => {
    const page = context.getSelectedPage();

    // 尝试使用持久化的增强收集器
    const collector = context.getEnhancedConsoleCollector(page);

    if (collector) {
      // 使用增强收集器
      const {types, sources, since, limit} = request.params;

      // 应用过滤
      const logs =
        types || sources || since || limit
          ? collector.getFilteredLogs({types, sources, since, limit})
          : collector.getLogs();

      // 获取统计信息
      const stats = collector.getLogStats();

      response.appendResponseLine('# Console Logs (Enhanced Mode)\n');
      response.appendResponseLine(`**Total**: ${logs.length} messages`);
      if (logs.length !== stats.total) {
        response.appendResponseLine(` (filtered from ${stats.total})`);
      }
      response.appendResponseLine('\n');
      response.appendResponseLine(
        `**Source**: CDP Runtime.consoleAPICalled (all contexts)\n`,
      );
      response.appendResponseLine(
        `**Features**: ✅ Content Scripts ✅ Complex Objects ✅ Workers ✅ Service Workers ✅ iframes\n\n`,
      );

      // 显示统计信息
      if (stats.total > 0) {
        response.appendResponseLine('**Statistics**:\n');
        response.appendResponseLine(
          `- By Type: ${Object.entries(stats.byType)
            .map(([k, v]) => `${k}(${v})`)
            .join(', ')}\n`,
        );
        response.appendResponseLine(
          `- By Source: ${Object.entries(stats.bySource)
            .map(([k, v]) => `${k}(${v})`)
            .join(', ')}\n\n`,
        );
      }

      if (logs.length === 0) {
        response.appendResponseLine('No console messages found.\n');
        response.appendResponseLine(
          '\n**Tip**: Execute scripts or interact with the page to generate logs.\n',
        );
      } else {
        response.appendResponseLine('## Messages\n\n');
        logs.forEach((log, index) => {
          const location = log.url
            ? `${log.url}:${log.lineNumber}`
            : '<unknown>';
          const sourceTag = log.source ? ` [${log.source.toUpperCase()}]` : '';
          response.appendResponseLine(
            `### ${index + 1}. [${log.type.toUpperCase()}]${sourceTag} ${location}\n`,
          );
          response.appendResponseLine(`${log.text}\n\n`);
        });
      }

      response.setIncludePages(true);
      return;
    }

    // 降级：使用原有的 Puppeteer 机制
    response.appendResponseLine('# Console Logs (Legacy Mode)\n');
    response.appendResponseLine(
      '⚠️  Enhanced console collector not available, using legacy mode\n\n',
    );
    response.setIncludeConsoleData(true);
    response.setIncludePages(true);
  },
});
