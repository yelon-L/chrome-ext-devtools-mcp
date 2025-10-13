/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import './polyfill.js';

import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import {StdioServerTransport} from '@modelcontextprotocol/sdk/server/stdio.js';
import type {CallToolResult} from '@modelcontextprotocol/sdk/types.js';
import {SetLevelRequestSchema} from '@modelcontextprotocol/sdk/types.js';

import type {Channel} from './browser.js';
import {ensureBrowserConnected, ensureBrowserLaunched} from './browser.js';
import {parseArguments} from './cli.js';
import {logger, saveLogsToFile} from './logger.js';
import {McpContext} from './McpContext.js';
import {McpResponse} from './McpResponse.js';
import {Mutex} from './Mutex.js';
import {getAllTools} from './tools/registry.js';
import type {ToolDefinition} from './tools/ToolDefinition.js';
import {VERSION} from './version.js';
import {displayStdioModeInfo} from './utils/modeMessages.js';

const version = VERSION;

export const args = parseArguments(version);

const logFile = args.logFile ? saveLogsToFile(args.logFile) : undefined;

logger(`Starting Chrome Extension Debug MCP Server v${version}`);
const server = new McpServer(
  {
    name: 'chrome_extension_debug',
    title: 'Chrome Extension Debug MCP server',
    version,
  },
  {capabilities: {logging: {}}},
);
server.server.setRequestHandler(SetLevelRequestSchema, () => {
  return {};
});

let context: McpContext;
async function getContext(): Promise<McpContext> {
  const extraArgs: string[] = (args.chromeArg ?? []).map(String);
  if (args.proxyServer) {
    extraArgs.push(`--proxy-server=${args.proxyServer}`);
  }
  const devtools = args.experimentalDevtools ?? false;
  const browser = args.browserUrl
    ? await ensureBrowserConnected({
        browserURL: args.browserUrl,
        devtools,
      })
    : await ensureBrowserLaunched({
        headless: args.headless,
        executablePath: args.executablePath,
        channel: args.channel as Channel,
        isolated: args.isolated,
        logFile,
        viewport: args.viewport,
        args: extraArgs,
        acceptInsecureCerts: args.acceptInsecureCerts,
        devtools,
      });

  if (context?.browser !== browser) {
    context = await McpContext.from(browser, logger);
  }
  return context;
}


const toolMutex = new Mutex();

function registerTool(tool: ToolDefinition): void {
  server.registerTool(
    tool.name,
    {
      description: tool.description,
      inputSchema: tool.schema,
      annotations: tool.annotations,
    },
    async (params): Promise<CallToolResult> => {
      const guard = await toolMutex.acquire();
      try {
        logger(`${tool.name} request: ${JSON.stringify(params, null, '  ')}`);
        const context = await getContext();
        const response = new McpResponse();
        await tool.handler(
          {
            params,
          },
          response,
          context,
        );
        try {
          const content = await response.handle(tool.name, context);
          return {
            content,
          };
        } catch (error) {
          const errorText =
            error instanceof Error ? error.message : String(error);

          return {
            content: [
              {
                type: 'text',
                text: errorText,
              },
            ],
            isError: true,
          };
        }
      } catch (err) {
        logger(`${tool.name} error: ${err.message}`);
        throw err;
      } finally {
        guard.dispose();
      }
    },
  );
}

// 从统一注册中心获取所有工具
const tools = getAllTools();
for (const tool of tools) {
  registerTool(tool);
}

const transport = new StdioServerTransport();
await server.connect(transport);
logger('Chrome DevTools MCP Server connected');
displayStdioModeInfo();
