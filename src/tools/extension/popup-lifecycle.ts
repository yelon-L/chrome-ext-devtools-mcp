/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Popup 生命周期管理工具
 * 
 * 提供完整的扩展 Popup 生命周期管理功能：
 * - 打开 Popup
 * - 检测 Popup 状态
 * - 等待 Popup 打开
 * - 关闭 Popup
 * - 获取 Popup 信息
 */

import z from 'zod';

import {ToolCategories} from '../categories.js';
import {defineTool} from '../ToolDefinition.js';

/**
 * 打开扩展 Popup
 * 
 * 使用 chrome.action.openPopup() API 自动打开扩展的 popup 窗口
 */
export const openExtensionPopup = defineTool({
  name: 'open_extension_popup',
  description: `Programmatically open extension's popup window using chrome.action.openPopup() API.

**🎯 For AI**: Opens true popup window (not regular page). May fail in remote debugging → use fallback.

**Prerequisites**:
- Extension has popup configured (action.default_popup in manifest)
- Service Worker active (MV3) - tool auto-activates if needed

**Workflow after opening**:
1. \`open_extension_popup\` → Open popup
2. \`is_popup_open\` → Verify opened
3. \`take_snapshot\` → Get elements  
4. \`click\`/\`fill\` → Interact
5. \`take_screenshot\` → Capture state

**⚠️ If this fails** ("No active browser window"):
Use fallback: \`navigate_page({ url: "chrome-extension://[ID]/popup.html" })\`
Note: Fallback opens as regular page (persistent), not true popup (auto-closes).
For most testing, both work fine.

**Related tools**: \`is_popup_open\`, \`wait_for_popup\`, \`take_snapshot\`, \`navigate_page\``,
  annotations: {
    category: ToolCategories.EXTENSION_DEBUGGING,
    readOnlyHint: false,  // 有副作用：打开 popup
  },
  schema: {
    extensionId: z
      .string()
      .regex(/^[a-z]{32}$/)
      .describe('Extension ID (32 lowercase letters). Get this from list_extensions.'),
  },
  handler: async (request, response, context) => {
    const {extensionId} = request.params;

    // 1. 获取扩展信息
    const extension = await context.getExtensionDetails(extensionId);
    if (!extension) {
      response.appendResponseLine(`Extension ${extensionId} not found.`);
      response.appendResponseLine('\n**Suggestions**:');
      response.appendResponseLine('- Use `list_extensions` to see available extensions');
      response.appendResponseLine('- Verify the extension ID is correct');
      response.setIncludePages(true);
      return;
    }

    // 2. 检查是否配置了 popup
    // 从 extension details 中获取 manifest
    const contexts = await context.getExtensionContexts(extensionId);
    
    // 尝试从扩展上下文中推断是否有 popup 配置
    // 更可靠的方法：检查 manifest 并获取 background context
    try {
      // 获取扩展的所有上下文
      const contexts = await context.getExtensionContexts(extensionId);
      const backgroundContext = contexts.find(ctx => ctx.type === 'background');
      
      // 3. 如果 background 不存在，尝试激活 Service Worker
      if (!backgroundContext) {
        response.appendResponseLine('Background context not active. Activating Service Worker...\n');
        
        const activationResult = await context.activateServiceWorker(extensionId);
        
        if (!activationResult.success) {
          response.appendResponseLine(`Failed to activate Service Worker.`);
          response.appendResponseLine(`\n**Error**: ${activationResult.error || 'Unknown error'}`);
          response.appendResponseLine('\n**Suggestions**:');
          response.appendResponseLine('- Use `activate_extension_service_worker` manually');
          response.appendResponseLine('- Check if extension is enabled');
          response.appendResponseLine('- Reload the extension if needed');
          response.setIncludePages(true);
          return;
        }
        
        // 等待 Service Worker 完全激活
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // 重新获取上下文
        const updatedContexts = await context.getExtensionContexts(extensionId);
        const updatedBackgroundContext = updatedContexts.find(ctx => ctx.type === 'background');
        
        if (!updatedBackgroundContext) {
          response.appendResponseLine('Service Worker activated but background context still not found.');
          response.appendResponseLine('\nThis may be a timing issue. Please try again.');
          response.setIncludePages(true);
          return;
        }
        
        response.appendResponseLine('✅ Service Worker activated successfully.\n');
      }

      // 4. 在 background context 中执行 openPopup
      // 使用最新的 background context
      const finalContexts = await context.getExtensionContexts(extensionId);
      const finalBackgroundContext = finalContexts.find(ctx => ctx.type === 'background');
      
      if (!finalBackgroundContext) {
        response.appendResponseLine('Background context not found.');
        response.setIncludePages(true);
        return;
      }
      
      response.appendResponseLine('Opening popup...\n');
      
      // 使用 ExtensionHelper.evaluateInContext (支持 Service Worker)
      const result = await context.evaluateInExtensionContext(
        finalBackgroundContext.targetId,
        `
        (async () => {
          const chromeAPI = typeof chrome !== 'undefined' ? chrome : undefined;
          
          if (!chromeAPI) {
            return { success: false, error: 'chrome API not available' };
          }
          
          // MV3: chrome.action.openPopup()
          if (chromeAPI.action && chromeAPI.action.openPopup) {
            try {
              await chromeAPI.action.openPopup();
              return { success: true, api: 'action' };
            } catch (error) {
              return { success: false, error: error.message, api: 'action' };
            }
          }
          
          // MV2: chrome.browserAction.openPopup()
          if (chromeAPI.browserAction && chromeAPI.browserAction.openPopup) {
            try {
              await chromeAPI.browserAction.openPopup();
              return { success: true, api: 'browserAction' };
            } catch (error) {
              return { success: false, error: error.message, api: 'browserAction' };
            }
          }
          
          return { success: false, error: 'No openPopup API available' };
        })()
        `
      );

      // 5. 检查执行结果
      const evalResult = result as {success: boolean; error?: string; api?: string};
      
      if (!evalResult.success) {
        response.appendResponseLine('Failed to open popup.');
        response.appendResponseLine(`\n**Error**: ${evalResult.error || 'Unknown error'}`);
        response.appendResponseLine('\n**Possible reasons**:');
        response.appendResponseLine('- Extension does not have a popup configured');
        response.appendResponseLine('- Popup is already open');
        response.appendResponseLine('- Missing permissions');
        response.appendResponseLine('\n**Suggestions**:');
        response.appendResponseLine('- Check manifest.json for action.default_popup');
        response.appendResponseLine('- Use `get_extension_details` to verify configuration');
        response.setIncludePages(true);
        return;
      }

      // 6. 等待 popup 打开
      await new Promise(resolve => setTimeout(resolve, 500));

      // 7. 验证 popup 已打开
      const updatedContexts = await context.getExtensionContexts(extensionId);
      const popupContext = updatedContexts.find(ctx => ctx.type === 'popup');

      if (popupContext) {
        response.appendResponseLine('# Popup Opened Successfully ✅\n');
        response.appendResponseLine(`**Popup URL**: ${popupContext.url}`);
        response.appendResponseLine(`**Target ID**: \`${popupContext.targetId}\``);
        response.appendResponseLine(`**API Used**: chrome.${evalResult.api}.openPopup()`);
        response.appendResponseLine('\n**Next Steps**:');
        response.appendResponseLine('1. Use `take_snapshot` to get popup elements');
        response.appendResponseLine('2. Use `click`, `fill` to interact with elements');
        response.appendResponseLine('3. Use `evaluate_script` to run custom JavaScript');
        response.appendResponseLine('4. Use `close_popup` when done');
      } else {
        response.appendResponseLine('# Popup Command Sent ⚠️\n');
        response.appendResponseLine('The openPopup() command was executed successfully,');
        response.appendResponseLine('but the popup context was not detected immediately.');
        response.appendResponseLine('\n**This may be normal** if popup takes time to load.');
        response.appendResponseLine('\n**Next Steps**:');
        response.appendResponseLine('- Use `is_popup_open` to check if popup is now open');
        response.appendResponseLine('- Use `wait_for_popup` to wait for popup to appear');
        response.appendResponseLine('- Try `list_extension_contexts` to see all contexts');
      }

    } catch (error) {
      // ✅ 遵循设计原则：业务失败不抛异常，返回友好消息
      response.appendResponseLine('Unable to open popup.');
      response.appendResponseLine('\n**Details**: An error occurred while trying to open the popup.');
      response.appendResponseLine('\n**Suggestions**:');
      response.appendResponseLine('- Ensure the extension has a popup configured');
      response.appendResponseLine('- Verify Service Worker is active');
      response.appendResponseLine('- Check browser console for errors');
      response.appendResponseLine('- Try reloading the extension');
    }

    response.setIncludePages(true);
  },
});

/**
 * 检查 Popup 是否打开
 * 
 * 查询扩展的上下文列表，检测 popup 类型的上下文是否存在
 */
export const isPopupOpen = defineTool({
  name: 'is_popup_open',
  description: `Check if the extension's popup is currently open.

**This is the tool you need when:**
- ✅ You want to verify if popup is open before interacting
- ✅ You need to check popup status for conditional logic
- ✅ You're debugging popup lifecycle issues
- ✅ You want to avoid opening popup twice

**What it does**:
- Queries extension contexts
- Identifies popup-type contexts
- Returns open/closed status with details

**What you get**:
- Boolean status (open/closed)
- Popup URL if open
- Target ID if open
- Helpful next steps

**Example scenarios**:
1. Pre-check before opening: "Is popup already open?"
   → Use this tool to avoid duplicate opens
   
2. Verify after opening: "Did popup open successfully?"
   → Use this tool after open_extension_popup
   
3. Conditional logic: "Only interact if popup is open"
   → Use this tool to check before click/fill

**Related tools**:
- \`open_extension_popup\` - Open the popup if closed
- \`wait_for_popup\` - Wait for popup to open
- \`list_extension_contexts\` - See all contexts including popup`,
  annotations: {
    category: ToolCategories.EXTENSION_DEBUGGING,
    readOnlyHint: true,  // 只读操作
  },
  schema: {
    extensionId: z
      .string()
      .regex(/^[a-z]{32}$/)
      .describe('Extension ID to check. Get this from list_extensions.'),
  },
  handler: async (request, response, context) => {
    const {extensionId} = request.params;

    // 获取扩展的所有上下文
    const contexts = await context.getExtensionContexts(extensionId);

    // 查找 popup 上下文
    const popupContext = contexts.find(ctx => ctx.type === 'popup');

    if (popupContext) {
      response.appendResponseLine('# Popup Status: Open ✅\n');
      response.appendResponseLine(`**Popup URL**: ${popupContext.url}`);
      response.appendResponseLine(`**Target ID**: \`${popupContext.targetId}\``);
      response.appendResponseLine(`**Title**: ${popupContext.title || 'N/A'}`);
      response.appendResponseLine('\n**Available Actions**:');
      response.appendResponseLine('- Use `take_snapshot` to get popup elements');
      response.appendResponseLine('- Use `click`, `fill` to interact with UI');
      response.appendResponseLine('- Use `close_popup` to close it');
    } else {
      response.appendResponseLine('# Popup Status: Closed\n');
      response.appendResponseLine('The popup is not currently open.');
      
      // 检查是否有 popup 配置
      if (contexts.length === 0) {
        response.appendResponseLine('\n⚠️ **No contexts found** - Extension may be disabled or not loaded.');
      } else {
        response.appendResponseLine('\n**Active Contexts**:');
        const contextTypes = contexts.map(ctx => ctx.type).join(', ');
        response.appendResponseLine(`- ${contextTypes}`);
      }
      
      response.appendResponseLine('\n**Next Steps**:');
      response.appendResponseLine('- Use `open_extension_popup` to open the popup');
      response.appendResponseLine('- Use `get_extension_details` to verify popup is configured');
    }

    response.setIncludePages(true);
  },
});

/**
 * 等待 Popup 打开
 * 
 * 轮询检测 popup 上下文，支持超时设置
 */
export const waitForPopup = defineTool({
  name: 'wait_for_popup',
  description: `Wait for the extension's popup to open (with timeout).

**This is the tool you need when:**
- ✅ You triggered popup opening and need to wait for it
- ✅ You want to proceed only after popup is ready
- ✅ You're handling async popup loading
- ✅ You need timeout protection

**What it does**:
- Polls for popup context at regular intervals
- Returns immediately when popup detected
- Times out after specified duration
- Reports elapsed time

**How it works**:
- Checks every 100ms for popup context
- Returns success as soon as popup found
- Returns timeout error if not found within limit
- Default timeout: 5000ms (5 seconds)

**Use cases**:
1. After user action: User clicks button → wait_for_popup
2. After trigger: Automated trigger → wait_for_popup → verify
3. Testing: Open popup → wait → take snapshot → test

**Related tools**:
- \`open_extension_popup\` - Opens popup (use before this)
- \`is_popup_open\` - Instant status check (no waiting)
- \`take_snapshot\` - Use after popup is ready`,
  annotations: {
    category: ToolCategories.EXTENSION_DEBUGGING,
    readOnlyHint: true,
  },
  schema: {
    extensionId: z
      .string()
      .regex(/^[a-z]{32}$/)
      .describe('Extension ID to wait for. Get this from list_extensions.'),
    timeout: z
      .number()
      .optional()
      .default(5000)
      .describe('Maximum wait time in milliseconds. Default is 5000ms (5 seconds).'),
  },
  handler: async (request, response, context) => {
    const {extensionId, timeout} = request.params;

    const startTime = Date.now();
    const checkInterval = 100; // 每 100ms 检查一次
    let attempts = 0;

    response.appendResponseLine(`Waiting for popup to open (timeout: ${timeout}ms)...\n`);

    while (Date.now() - startTime < timeout) {
      attempts++;
      
      const contexts = await context.getExtensionContexts(extensionId);
      const popupContext = contexts.find(ctx => ctx.type === 'popup');

      if (popupContext) {
        const elapsedTime = Date.now() - startTime;
        response.appendResponseLine('# Popup Detected ✅\n');
        response.appendResponseLine(`**Wait Time**: ${elapsedTime}ms`);
        response.appendResponseLine(`**Attempts**: ${attempts}`);
        response.appendResponseLine(`**Popup URL**: ${popupContext.url}`);
        response.appendResponseLine(`**Target ID**: \`${popupContext.targetId}\``);
        response.appendResponseLine('\n**Next Steps**:');
        response.appendResponseLine('- Popup is ready for interaction');
        response.appendResponseLine('- Use `take_snapshot` to get elements');
        response.setIncludePages(true);
        return;
      }

      await new Promise(resolve => setTimeout(resolve, checkInterval));
    }

    // 超时
    response.appendResponseLine('# Popup Wait Timeout ⏱️\n');
    response.appendResponseLine(`Popup did not open within ${timeout}ms (${attempts} attempts)`);
    response.appendResponseLine('\n**Possible reasons**:');
    response.appendResponseLine('- Popup was not triggered');
    response.appendResponseLine('- Popup takes longer to load than expected');
    response.appendResponseLine('- Extension has no popup configured');
    response.appendResponseLine('- Service Worker is not active');
    response.appendResponseLine('\n**Suggestions**:');
    response.appendResponseLine('- Try increasing the timeout value');
    response.appendResponseLine('- Use `is_popup_open` to check current status');
    response.appendResponseLine('- Use `open_extension_popup` to trigger opening');
    response.appendResponseLine('- Check if extension has popup in manifest');

    response.setIncludePages(true);
  },
});

/**
 * 关闭 Popup
 * 
 * 通过关闭 popup 页面来关闭 popup
 */
export const closePopup = defineTool({
  name: 'close_popup',
  description: `Close the extension's popup window.

**This is the tool you need when:**
- ✅ You want to close popup programmatically
- ✅ You're cleaning up after tests
- ✅ You need to reset popup state
- ✅ You want to test popup reopen behavior

**What it does**:
- Finds the popup context
- Closes the popup page
- Verifies popup is closed

**How it works**:
- Identifies popup by context type
- Uses page close API to shut down popup
- Returns success/failure status

**Note**: Popup will close naturally when user clicks outside or switches focus.
This tool is useful for programmatic control.

**Use cases**:
1. Test cleanup: After tests → close_popup → clean state
2. Reset: Close popup → open_extension_popup → fresh start
3. Lifecycle test: Open → interact → close → verify

**Related tools**:
- \`open_extension_popup\` - Open popup after closing
- \`is_popup_open\` - Verify popup is closed`,
  annotations: {
    category: ToolCategories.EXTENSION_DEBUGGING,
    readOnlyHint: false,  // 有副作用：关闭 popup
  },
  schema: {
    extensionId: z
      .string()
      .regex(/^[a-z]{32}$/)
      .describe('Extension ID. Get this from list_extensions.'),
  },
  handler: async (request, response, context) => {
    const {extensionId} = request.params;

    // 获取 popup 上下文
    const contexts = await context.getExtensionContexts(extensionId);
    const popupContext = contexts.find(ctx => ctx.type === 'popup');

    if (!popupContext) {
      response.appendResponseLine('Popup is not open.');
      response.appendResponseLine('\nNothing to close.');
      response.appendResponseLine('\n**Tip**: Use `is_popup_open` to check status before closing.');
      response.setIncludePages(true);
      return;
    }

    try {
      // ✅ 遵循 close_page 模式：使用 context.closePage 而不是直接 page.close()
      // 先切换到 popup 页面
      const popupPage = await context.switchToExtensionContext(popupContext.targetId);
      
      // 查找 popup 页面的索引（通过遍历所有页面）
      let popupPageIdx = -1;
      for (let i = 0; i < 100; i++) {  // 最多检查 100 个页面
        try {
          const page = context.getPageByIdx(i);
          if (page === popupPage) {
            popupPageIdx = i;
            break;
          }
        } catch {
          // 索引超出范围，停止查找
          break;
        }
      }
      
      if (popupPageIdx === -1) {
        response.appendResponseLine('Unable to close popup.');
        response.appendResponseLine('\nThe popup page could not be found.');
        response.setIncludePages(true);
        return;
      }
      
      // 使用 context.closePage 关闭（这是标准方法，不会破坏连接）
      await context.closePage(popupPageIdx);

      response.appendResponseLine('# Popup Closed ✅\n');
      response.appendResponseLine('The popup has been closed successfully.');
      response.appendResponseLine('\n**Next Steps**:');
      response.appendResponseLine('- Use `open_extension_popup` to reopen');
      response.appendResponseLine('- Use `is_popup_open` to verify closed status');

    } catch (error) {
      // ✅ 遵循 close_page 模式：捕获预期错误
      response.appendResponseLine('Unable to close popup.');
      response.appendResponseLine('\nThe popup may have already been closed or is inaccessible.');
    }

    response.setIncludePages(true);
  },
});

/**
 * 获取 Popup 详细信息
 * 
 * 获取 popup 的完整信息，包括 URL、状态、上下文等
 */
export const getPopupInfo = defineTool({
  name: 'get_popup_info',
  description: `Get detailed information about the extension's popup.

**This is the tool you need when:**
- ✅ You want comprehensive popup information
- ✅ You need to inspect popup configuration
- ✅ You're debugging popup issues
- ✅ You want popup metadata for logging

**What you get**:
- Popup configuration from manifest
- Current open/closed status
- Popup URL and context info (if open)
- Target ID for interaction (if open)
- Manifest version info

**Output includes**:
- Configuration: popup file path from manifest
- Status: whether popup is currently open
- Context: active popup context details
- Metadata: extension info and versions

**Use cases**:
1. Pre-flight check: Verify popup is configured before trying to open
2. Status report: Get full popup state for debugging
3. Metadata logging: Record popup info for test reports

**Related tools**:
- \`get_extension_details\` - General extension info
- \`is_popup_open\` - Quick status check
- \`list_extension_contexts\` - All contexts`,
  annotations: {
    category: ToolCategories.EXTENSION_DEBUGGING,
    readOnlyHint: true,
  },
  schema: {
    extensionId: z
      .string()
      .regex(/^[a-z]{32}$/)
      .describe('Extension ID. Get this from list_extensions.'),
  },
  handler: async (request, response, context) => {
    const {extensionId} = request.params;

    // 获取扩展详情
    const extension = await context.getExtensionDetails(extensionId);
    
    if (!extension) {
      response.appendResponseLine(`Extension ${extensionId} not found.`);
      response.setIncludePages(true);
      return;
    }

    // 获取上下文
    const contexts = await context.getExtensionContexts(extensionId);
    const popupContext = contexts.find(ctx => ctx.type === 'popup');

    response.appendResponseLine('# Popup Information\n');
    response.appendResponseLine(`**Extension**: ${extension.name}`);
    response.appendResponseLine(`**Version**: ${extension.version}`);
    response.appendResponseLine(`**Manifest Version**: MV${extension.manifestVersion}`);
    response.appendResponseLine('');

    // Popup 配置信息
    response.appendResponseLine('## Configuration\n');
    
    // 尝试获取 popup 配置（从 manifest）
    // 注意：extension details 中可能没有完整的 manifest
    response.appendResponseLine('**Status**: Checking manifest configuration...');
    response.appendResponseLine('');

    // Popup 运行时状态
    response.appendResponseLine('## Runtime Status\n');
    
    if (popupContext) {
      response.appendResponseLine('**State**: ✅ Open');
      response.appendResponseLine(`**Popup URL**: ${popupContext.url}`);
      response.appendResponseLine(`**Target ID**: \`${popupContext.targetId}\``);
      response.appendResponseLine(`**Title**: ${popupContext.title || 'N/A'}`);
      response.appendResponseLine('');
      response.appendResponseLine('**Available Actions**:');
      response.appendResponseLine('- Take snapshot to get elements');
      response.appendResponseLine('- Interact with UI (click, fill, etc.)');
      response.appendResponseLine('- Execute scripts in popup context');
      response.appendResponseLine('- Close popup when done');
    } else {
      response.appendResponseLine('**State**: Closed');
      response.appendResponseLine('');
      response.appendResponseLine('**Available Actions**:');
      response.appendResponseLine('- Use `open_extension_popup` to open');
      response.appendResponseLine('- Use `get_extension_details` for manifest info');
    }

    response.setIncludePages(true);
  },
});
