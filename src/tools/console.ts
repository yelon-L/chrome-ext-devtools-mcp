/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import z from 'zod';

import {ToolCategories} from './categories.js';
import {defineTool} from './ToolDefinition.js';

export {getPageConsoleLogs} from './console-history.js';

const FILTERABLE_MESSAGE_TYPES: readonly [string, ...string[]] = [
  'log',
  'debug',
  'info',
  'error',
  'warn',
  'dir',
  'dirxml',
  'table',
  'trace',
  'clear',
  'startGroup',
  'startGroupCollapsed',
  'endGroup',
  'assert',
  'profile',
  'profileEnd',
  'count',
  'timeEnd',
];

const FILTERABLE_MESSAGE_SOURCES: readonly [string, ...string[]] = [
  'page',
  'worker',
  'service-worker',
  'iframe',
];

export const consoleTool = defineTool({
  name: 'list_console_messages',
  description: `List console messages with filtering and pagination support.

**Filtering**:
- Filter by type: log, debug, info, error, warn, etc.
- Filter by source: page, worker, service-worker, iframe
- Filter by time: messages since timestamp
- Limit: maximum number of messages to return

**Pagination**:
- Control page size (default: 20)
- Navigate pages (0-indexed)

**Examples**:
- Get all errors: types=['error']
- Get recent logs: since=1234567890000
- Get first 10 messages: pageSize=10, pageIdx=0
- Get worker logs: sources=['worker']

**How it works**:
- ✅ Console messages are automatically collected from all pages
- ✅ Collection starts when MCP server connects to the browser
- ✅ Messages accumulate continuously while you use other tools
- ⚠️ Messages are cleared when page navigates (refresh/URL change)`,
  annotations: {
    category: ToolCategories.DEBUGGING,
    readOnlyHint: true,
  },
  schema: {
    types: z
      .array(z.enum(FILTERABLE_MESSAGE_TYPES))
      .optional()
      .describe('Filter by message types'),
    sources: z
      .array(z.enum(FILTERABLE_MESSAGE_SOURCES))
      .optional()
      .describe('Filter by message sources'),
    since: z
      .number()
      .optional()
      .describe('Only messages after this timestamp (milliseconds)'),
    limit: z
      .number()
      .int()
      .positive()
      .optional()
      .describe('Maximum number of messages to return'),
    pageSize: z
      .number()
      .int()
      .positive()
      .optional()
      .describe('Messages per page (default: 20)'),
    pageIdx: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe('Page number (0-indexed)'),
  },
  handler: async (request, response, context) => {
    const page = context.getSelectedPage();
    const collector = context.getEnhancedConsoleCollector(page);

    if (!collector) {
      response.appendResponseLine(
        'No console collector available for this page',
      );
      return;
    }

    // 应用过滤
    const filtered = collector.getFilteredLogs({
      types: request.params.types,
      sources: request.params.sources as
        | Array<'page' | 'worker' | 'service-worker' | 'iframe'>
        | undefined,
      since: request.params.since,
      limit: request.params.limit,
    });

    // 应用分页
    const {paginate} = await import('../utils/pagination.js');
    const paginated = paginate(filtered, {
      pageSize: request.params.pageSize,
      pageIdx: request.params.pageIdx,
    });

    // 获取统计信息
    const stats = collector.getLogStats();

    // 构建响应
    const lines: string[] = [];
    lines.push('## Console Messages');
    lines.push('');
    lines.push(`**Total Messages**: ${stats.total}`);
    lines.push(`**Filtered**: ${filtered.length}`);
    lines.push(
      `**Current Page**: ${paginated.currentPage + 1}/${paginated.totalPages}`,
    );
    lines.push(
      `**Showing**: ${paginated.startIndex + 1}-${paginated.endIndex} of ${filtered.length}`,
    );
    lines.push('');

    if (Object.keys(stats.byType).length > 0) {
      lines.push('**By Type**:');
      for (const [type, count] of Object.entries(stats.byType)) {
        lines.push(`- ${type}: ${count}`);
      }
      lines.push('');
    }

    if (Object.keys(stats.bySource).length > 0) {
      lines.push('**By Source**:');
      for (const [source, count] of Object.entries(stats.bySource)) {
        lines.push(`- ${source}: ${count}`);
      }
      lines.push('');
    }

    if (paginated.hasNextPage) {
      lines.push(`**Next Page**: pageIdx=${paginated.currentPage + 1}`);
    }
    if (paginated.hasPreviousPage) {
      lines.push(`**Previous Page**: pageIdx=${paginated.currentPage - 1}`);
    }

    if (paginated.invalidPage) {
      lines.push('');
      lines.push('⚠️ Invalid page number provided. Showing first page.');
    }

    response.appendResponseLine(lines.join('\n'));

    // 仍然使用原有的 setIncludeConsoleData 来显示消息内容
    // 但这里我们已经过滤和分页了，所以需要一个新的方式
    // 暂时先显示统计信息
    response.setIncludeConsoleData(true);
  },
});
