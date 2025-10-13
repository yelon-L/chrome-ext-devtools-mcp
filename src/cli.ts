/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {Options as YargsOptions} from 'yargs';
import yargs from 'yargs';
import {hideBin} from 'yargs/helpers';
import {ParameterValidator} from './utils/paramValidator.js';

export const cliOptions = {
  browserUrl: {
    type: 'string',
    description:
      'Connect to a running Chrome instance using port forwarding. For more details see: https://developer.chrome.com/docs/devtools/remote-debugging/local-server.',
    alias: 'u',
    coerce: (url: string | undefined) => {
      if (!url) {
        return;
      }
      try {
        new URL(url);
      } catch {
        throw new Error(`Provided browserUrl ${url} is not valid URL.`);
      }
      return url;
    },
  },
  headless: {
    type: 'boolean',
    description: 'Whether to run in headless (no UI) mode.',
    default: false,
  },
  executablePath: {
    type: 'string',
    description: 'Path to custom Chrome executable.',
    // 移除 yargs 的 conflicts，使用自定义验证器
    alias: 'e',
  },
  isolated: {
    type: 'boolean',
    description:
      'If specified, creates a temporary user-data-dir that is automatically cleaned up after the browser is closed.',
    default: false,
  },
  channel: {
    type: 'string',
    description:
      'Specify a different Chrome channel that should be used. The default is the stable channel version.',
    choices: ['stable', 'canary', 'beta', 'dev'] as const,
    // 移除 yargs 的 conflicts，使用自定义验证器
  },
  logFile: {
    type: 'string',
    describe:
      'Path to a file to write debug logs to. Set the env variable `DEBUG` to `*` to enable verbose logs. Useful for submitting bug reports.',
  },
  viewport: {
    type: 'string',
    describe:
      'Initial viewport size for the Chrome instances started by the server. For example, `1280x720`. In headless mode, max size is 3840x2160px.',
    coerce: (arg: string | undefined) => {
      if (arg === undefined) {
        return;
      }
      const [width, height] = arg.split('x').map(Number);
      if (!width || !height || Number.isNaN(width) || Number.isNaN(height)) {
        throw new Error('Invalid viewport. Expected format is `1280x720`.');
      }
      return {
        width,
        height,
      };
    },
  },
  proxyServer: {
    type: 'string',
    description: `Proxy server configuration for Chrome passed as --proxy-server when launching the browser. See https://www.chromium.org/developers/design-documents/network-settings/ for details.`,
  },
  acceptInsecureCerts: {
    type: 'boolean',
    description: `If enabled, ignores errors relative to self-signed and expired certificates. Use with caution.`,
  },
  experimentalDevtools: {
    type: 'boolean',
    describe: 'Whether to enable automation over DevTools targets',
    hidden: true,
  },
  chromeArg: {
    type: 'array',
    describe:
      'Additional arguments for Chrome. Only applies when Chrome is launched by chrome-extension-debug-mcp.',
  },
  transport: {
    type: 'string',
    description:
      'Transport protocol to use for MCP communication.',
    choices: ['stdio', 'sse', 'streamable'] as const,
    default: 'stdio',
    alias: 't',
  },
  port: {
    type: 'number',
    description:
      'Port number for HTTP-based transports (SSE or Streamable).',
    alias: 'p',
  },
} satisfies Record<string, YargsOptions>;

export function parseArguments(version: string, argv = process.argv) {
  // 检测是否是打包的二进制文件
  const isBundled = !process.argv[1] || process.argv[1].includes('bun-') || !process.argv[1].endsWith('.js');
  const scriptName = isBundled 
    ? 'chrome-extension-debug-mcp'  // 打包后的可执行文件名
    : 'npx chrome-extension-debug-mcp@latest';  // npm 运行方式

  const yargsInstance = yargs(hideBin(argv))
    .scriptName(scriptName)
    .usage('$0 [options]')
    .epilog(`Chrome Extension Debug MCP v${version}

Transport Modes:
  stdio      - Standard I/O (default, for MCP clients)
  sse        - Server-Sent Events (HTTP streaming, port 32122 or --port)
  streamable - Streamable HTTP (latest standard, port 32123 or --port)

For more information, visit:
  https://github.com/GoogleChromeLabs/chrome-devtools-mcp`)
    .options(cliOptions)
    .check(args => {
      // We can't set default in the options else
      // Yargs will complain
      if (!args.channel && !args.browserUrl && !args.executablePath) {
        args.channel = 'stable';
      }
      return true;
    })
    .example([
      [
        '$0',
        'Start with stdio transport (default)',
      ],
      [
        '$0 --transport sse',
        'Start SSE server on port 32122',
      ],
      [
        '$0 --transport streamable --port 3000',
        'Start Streamable HTTP server on port 3000',
      ],
      [
        '$0 --browserUrl http://127.0.0.1:9222',
        'Connect to an existing browser instance',
      ],
      ['$0 --channel beta', 'Use Chrome Beta'],
      ['$0 --headless', 'Run in headless mode'],
      ['$0 --logFile /tmp/log.txt', 'Save logs to a file'],
      [
        '$0 --viewport 1280x720',
        'Launch with viewport size 1280x720px',
      ],
    ])
    .alias('h', 'help')
    .alias('v', 'version');

  const parsed = yargsInstance
    .wrap(Math.min(120, yargsInstance.terminalWidth()))
    .help()
    .version(version)
    .parseSync();

  // 参数验证
  const validationResult = ParameterValidator.validate(parsed as any);
  
  if (!validationResult.valid || validationResult.warnings.length > 0) {
    ParameterValidator.displayResults(validationResult);
    
    if (!validationResult.valid) {
      process.exit(1);
    }
  }

  return parsed;
}
