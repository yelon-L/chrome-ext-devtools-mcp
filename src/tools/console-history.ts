/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {ToolCategories} from './categories.js';
import {defineTool} from './ToolDefinition.js';

export const getPageConsoleLogs = defineTool({
  name: 'get_page_console_logs',
  description: `Get ALL console logs from the current page (Enhanced).

**🎯 For AI**: Captures EVERYTHING - page + Content Scripts + Workers + complex objects!

**What you get**:
- ✅ Page main context logs
- ✅ Content Script logs (from extensions)
- ✅ Web Worker logs
- ✅ Service Worker logs
- ✅ Complete object serialization (functions, errors, Map, Set, etc.)
- All console messages since last navigation (log, error, warn, info, debug)
- Automatically collected in the background
- No setup or injection needed

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

**Tip**: Most action tools (click, fill, evaluate_script) now automatically include console logs in their response, so you may not need to call this tool separately.

**Related tools**:
- \`list_console_messages\` - Same functionality, different name
- Action tools (click, fill, etc.) - Automatically include console logs`,
  annotations: {
    category: ToolCategories.DEBUGGING,
    readOnlyHint: true,
  },
  schema: {},
  handler: async (_request, response, context) => {
    const page = context.getSelectedPage();
    
    // 尝试使用持久化的增强收集器
    const collector = context.getEnhancedConsoleCollector(page);
    
    if (collector) {
      // 使用增强收集器
      const logs = collector.getLogs();
      
      response.appendResponseLine('# Console Logs (Enhanced Mode)\n');
      response.appendResponseLine(`**Total**: ${logs.length} messages\n`);
      response.appendResponseLine(`**Source**: CDP Runtime.consoleAPICalled (all contexts)\n`);
      response.appendResponseLine(`**Features**: ✅ Content Scripts ✅ Complex Objects ✅ Workers ✅ Service Workers\n\n`);
      
      if (logs.length === 0) {
        response.appendResponseLine('No console messages found.\n');
        response.appendResponseLine('\n**Tip**: Execute scripts or interact with the page to generate logs.\n');
      } else {
        response.appendResponseLine('## Messages\n\n');
        logs.forEach((log, index) => {
          const location = log.url ? `${log.url}:${log.lineNumber}` : '<unknown>';
          const sourceTag = log.source ? ` [${log.source.toUpperCase()}]` : '';
          response.appendResponseLine(`### ${index + 1}. [${log.type.toUpperCase()}]${sourceTag} ${location}\n`);
          response.appendResponseLine(`${log.text}\n\n`);
        });
      }
      
      response.setIncludePages(true);
      return;
    }
    
    // 降级：使用原有的 Puppeteer 机制
    response.appendResponseLine('# Console Logs (Legacy Mode)\n');
    response.appendResponseLine('⚠️  Enhanced console collector not available, using legacy mode\n\n');
    response.setIncludeConsoleData(true);
    response.setIncludePages(true);
  },
});
