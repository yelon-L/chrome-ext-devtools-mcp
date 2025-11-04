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
import {
  ensureBrowserConnected,
  ensureBrowserLaunched,
  validateBrowserURL,
} from './browser.js';
import {parseArguments} from './cli.js';
import {logger, saveLogsToFile} from './logger.js';
import {McpContext} from './McpContext.js';
import {McpResponse} from './McpResponse.js';
import {Mutex} from './Mutex.js';
import {getAllTools} from './tools/registry.js';
import type {ToolDefinition} from './tools/ToolDefinition.js';
import {displayStdioModeInfo} from './utils/modeMessages.js';
import {VERSION} from './version.js';

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

// 如果配置了 --browserUrl，在启动时验证浏览器连接
if (args.browserUrl) {
  try {
    console.log('[MCP] Validating browser connection...');
    await validateBrowserURL(args.browserUrl);
    console.log('[MCP] Browser validation successful');
    console.log('');
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('\n❌ Browser Connection Validation Failed');
    console.error(
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    );
    console.error(`Error: ${errorMessage}`);
    console.error('');
    console.error('📝 Please check:');
    console.error('  1. Chrome is running with remote debugging enabled:');
    console.error(`     google-chrome --remote-debugging-port=9222`);
    console.error('  2. The browser URL is correct and accessible:');
    console.error(`     ${args.browserUrl}`);
    console.error('  3. No firewall is blocking the connection');
    console.error(
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    );
    console.error('');
    process.exit(1);
  }
}

const transport = new StdioServerTransport();

// Handle stdout errors (EPIPE, broken pipe, etc.)
process.stdout.on('error', error => {
  // EPIPE errors are expected when client disconnects
  if (error.code === 'EPIPE') {
    logger('[stdio] Client disconnected (EPIPE), shutting down gracefully');
    void cleanup('stdout EPIPE').then(() => process.exit(0));
  } else {
    logger(`[stdio] stdout error: ${error.message}`);
    void cleanup('stdout error').then(() => process.exit(1));
  }
});

// Handle stderr errors as well
process.stderr.on('error', error => {
  if (error.code === 'EPIPE') {
    logger('[stdio] stderr EPIPE, ignoring');
  } else {
    logger(`[stdio] stderr error: ${error.message}`);
  }
});

await server.connect(transport);
logger('Chrome DevTools MCP Server connected');
displayStdioModeInfo();

// ============================================================================
// Resource Cleanup and Signal Handling for stdio mode
// ============================================================================

const lastRequestTime = Date.now();
// 空闲超时配置（毫秒）
// 0 = 永不超时，适合开发环境
// 默认 30 分钟，给用户足够思考时间
const IDLE_TIMEOUT = process.env.STDIO_IDLE_TIMEOUT
  ? parseInt(process.env.STDIO_IDLE_TIMEOUT, 10)
  : 1800000; // 默认 30 分钟（从 5 分钟提升）
let cleanupInProgress = false;

if (IDLE_TIMEOUT === 0) {
  logger('[stdio] Idle timeout disabled (will never auto-exit)');
} else {
  logger(`[stdio] Idle timeout: ${IDLE_TIMEOUT / 60000} minutes`);
}

// Update last request time on each tool call
const originalRegisterTool = registerTool;
function _registerToolWithTracking(tool: ToolDefinition): void {
  originalRegisterTool(tool);
  // Track activity (already handled by mutex)
}

// Cleanup function
async function cleanup(reason: string): Promise<void> {
  if (cleanupInProgress) {
    return;
  }
  cleanupInProgress = true;

  // Safe logging that won't throw on EPIPE
  const safeLog = (msg: string) => {
    try {
      logger(msg);
    } catch {
      // Ignore logging errors during cleanup
    }
  };

  safeLog(`\n[stdio] Cleanup initiated: ${reason}`);

  try {
    // Stop idle timeout check
    if (idleCheckInterval) {
      clearInterval(idleCheckInterval);
    }

    // Remove stdout/stderr error handlers to prevent recursive cleanup
    process.stdout.removeAllListeners('error');
    process.stderr.removeAllListeners('error');

    // Pause and cleanup stdin
    process.stdin.pause();
    process.stdin.removeAllListeners();
    process.stdin.unref();

    // Close browser if managed by us
    if (context?.browser && !args.browserUrl) {
      safeLog('[stdio] Closing managed browser...');
      await context.browser.close();
    }

    safeLog('[stdio] Cleanup complete');
  } catch (error) {
    // Use logger instead of console.error to avoid EPIPE
    safeLog(
      `[stdio] Cleanup error: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

// Idle timeout check (only if IDLE_TIMEOUT > 0)
let idleCheckInterval: NodeJS.Timeout | undefined;
if (IDLE_TIMEOUT > 0) {
  idleCheckInterval = setInterval(() => {
    const idle = Date.now() - lastRequestTime;

    // 警告：接近超时（剩余 10%）
    if (idle > IDLE_TIMEOUT * 0.9 && idle < IDLE_TIMEOUT) {
      const remaining = Math.round((IDLE_TIMEOUT - idle) / 1000);
      console.warn(
        `[stdio] ⚠️  Approaching idle timeout, will exit in ${remaining}s`,
      );
    }

    if (idle > IDLE_TIMEOUT) {
      console.log(
        `[stdio] Idle timeout (${Math.round(idle / 1000)}s), exiting...`,
      );
      void cleanup('idle timeout').then(() => process.exit(0));
    }
  }, 30000);

  // Allow event loop to exit even with this interval
  idleCheckInterval.unref();
}

// Signal handlers
process.on('SIGTERM', () => {
  console.log('\n[stdio] Received SIGTERM');
  void cleanup('SIGTERM').then(() => process.exit(0));
});

process.on('SIGINT', () => {
  console.log('\n[stdio] Received SIGINT');
  void cleanup('SIGINT').then(() => process.exit(0));
});

// stdin end event
process.stdin.on('end', () => {
  console.log('[stdio] stdin closed');
  void cleanup('stdin end').then(() => process.exit(0));
});

// Force exit after 10 seconds if cleanup hangs
function forceExit(timeout = 10000): void {
  setTimeout(() => {
    console.error('[stdio] Force exit - cleanup timeout');
    process.exit(1);
  }, timeout).unref(); // unref so it doesn't prevent exit
}

// Unhandled errors
process.on('uncaughtException', error => {
  console.error('[stdio] Uncaught exception:', error);
  forceExit(5000);
  void cleanup('uncaught exception').then(() => process.exit(1));
});

process.on('unhandledRejection', reason => {
  console.error('[stdio] Unhandled rejection:', reason);
  forceExit(5000);
  void cleanup('unhandled rejection').then(() => process.exit(1));
});
