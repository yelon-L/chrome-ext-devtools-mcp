/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import z from 'zod';

import {logger} from '../logger.js';

import {ToolCategories} from './categories.js';
import {defineTool} from './ToolDefinition.js';

export const getConnectedBrowser = defineTool({
  name: 'get_connected_browser',
  description: `Get information about the currently connected browser. This tool helps you identify which Chrome instance you are debugging.`,
  annotations: {
    category: ToolCategories.BROWSER_INFO,
    readOnlyHint: true,
  },
  schema: {},
  handler: async (_request, response, context) => {
    const browser = context.getBrowser();
    
    // 获取浏览器版本信息
    const version = await browser.version();
    
    // 获取浏览器的 WebSocket URL（如果可用）
    const wsEndpoint = browser.wsEndpoint();
    
    // 从 wsEndpoint 提取 host 和 port
    let browserURL = 'Unknown';
    let host = 'Unknown';
    let port = 'Unknown';
    
    try {
      if (wsEndpoint) {
        const wsUrl = new URL(wsEndpoint);
        host = wsUrl.hostname;
        port = wsUrl.port || '9222';
        browserURL = `http://${host}:${port}`;
      }
    } catch (error) {
      logger(`[get_connected_browser] Failed to parse WebSocket URL: ${error}`);
    }
    
    // 获取页面数量
    const pages = await browser.pages();
    const pageCount = pages.length;
    
    const browserInfo = {
      version,
      browserURL,
      host,
      port,
      wsEndpoint,
      pageCount,
      userAgent: version.includes('userAgent') ? version : undefined,
    };
    
    response.appendResponseLine(`# Connected Browser Information`);
    response.appendResponseLine(``);
    response.appendResponseLine(`**Browser URL**: ${browserURL}`);
    response.appendResponseLine(`**Version**: ${version}`);
    response.appendResponseLine(`**Host**: ${host}`);
    response.appendResponseLine(`**Port**: ${port}`);
    response.appendResponseLine(`**WebSocket Endpoint**: ${wsEndpoint}`);
    response.appendResponseLine(`**Open Pages**: ${pageCount}`);
    response.appendResponseLine(``);
    response.appendResponseLine(`You are currently debugging Chrome at **${browserURL}**.`);
    
    logger(`[get_connected_browser] Browser info: ${JSON.stringify(browserInfo)}`);
  },
});

export const listBrowserCapabilities = defineTool({
  name: 'list_browser_capabilities',
  description: `List the capabilities and features of the connected browser. This includes supported protocols, domains, and Chrome DevTools Protocol (CDP) features.`,
  annotations: {
    category: ToolCategories.BROWSER_INFO,
    readOnlyHint: true,
  },
  schema: {},
  handler: async (_request, response, context) => {
    const browser = context.getBrowser();
    
    try {
      // 获取 CDP 客户端
      const client = await (browser as any).target().createCDPSession();
      
      // 获取支持的 domains
      const {domains} = await client.send('Schema.getDomains');
      
      await client.detach();
      
      const domainNames = domains.map((d: any) => d.name).sort();
      const domainCount = domainNames.length;
      
      response.appendResponseLine(`# Browser Capabilities`);
      response.appendResponseLine(``);
      response.appendResponseLine(`**Supported CDP Domains**: ${domainCount}`);
      response.appendResponseLine(``);
      response.appendResponseLine(`**Available Domains**:`);
      for (const name of domainNames) {
        response.appendResponseLine(`- ${name}`);
      }
      response.appendResponseLine(``);
      response.appendResponseLine(`These domains represent the Chrome DevTools Protocol features available for automation and debugging.`);
      
      logger(`[list_browser_capabilities] Found ${domainCount} CDP domains`);
    } catch (error) {
      response.appendResponseLine(
        `⚠️ Failed to retrieve browser capabilities: ${error instanceof Error ? error.message : String(error)}`
      );
      logger(`[list_browser_capabilities] Error: ${error}`);
    }
  },
});
