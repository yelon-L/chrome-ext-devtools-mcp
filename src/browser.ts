/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import type {
  Browser,
  ChromeReleaseChannel,
  LaunchOptions,
  Target,
} from 'puppeteer-core';
import puppeteer from 'puppeteer-core';

let browser: Browser | undefined;
let isExternalBrowser = false; // 标记是否为外部浏览器（不应关闭）
let initialBrowserURL: string | undefined; // 保存初始连接的 browserURL

function makeTargetFilter(devtools: boolean) {
  const ignoredPrefixes = new Set(['chrome://', 'chrome-untrusted://']);

  if (!devtools) {
    ignoredPrefixes.add('devtools://');
  }
  return function targetFilter(target: Target): boolean {
    if (target.url() === 'chrome://newtab/') {
      return true;
    }
    for (const prefix of ignoredPrefixes) {
      if (target.url().startsWith(prefix)) {
        return false;
      }
    }
    return true;
  };
}

/**
 * 验证浏览器URL是否可达
 * @throws Error 如果浏览器URL不可达
 */
export async function validateBrowserURL(browserURL: string): Promise<void> {
  try {
    const url = new URL('/json/version', browserURL);
    const response = await fetch(url.toString(), {
      signal: AbortSignal.timeout(5000), // 5秒超时
    });

    if (!response.ok) {
      throw new Error(
        `Browser returned HTTP ${response.status}: ${response.statusText}`,
      );
    }

    const data = await response.json();
    if (!data.Browser && !data.webSocketDebuggerUrl) {
      throw new Error('Invalid browser response: missing required fields');
    }

    console.log(
      `[Browser] ✅ Validated browser connection: ${data.Browser || 'Unknown'}`,
    );
  } catch (error) {
    if (error instanceof TypeError && error.message.includes('fetch')) {
      throw new Error(
        `Cannot connect to browser at ${browserURL}. ` +
          `Please ensure Chrome is running with --remote-debugging-port. ` +
          `Error: ${error.message}`,
      );
    }
    throw error;
  }
}

export async function ensureBrowserConnected(options: {
  browserURL: string;
  devtools: boolean;
}) {
  // 验证现有连接是否有效
  if (browser?.connected) {
    try {
      // ✅ 测试连接是否真的有效
      await browser.version();

      // URL 不匹配警告
      if (initialBrowserURL && initialBrowserURL !== options.browserURL) {
        console.warn('[Browser] ⚠️  Already connected to:', initialBrowserURL);
        console.warn(
          '[Browser] ⚠️  Ignoring new browserURL:',
          options.browserURL,
        );
        console.warn(
          '[Browser] 💡 Tip: Restart the service to connect to a different browser',
        );
      }

      // 连接有效，直接返回
      return browser;
    } catch (error) {
      // ✅ 连接已失效，需要重连
      console.warn('[Browser] ⚠️  Connection lost, attempting to reconnect...');
      console.warn(
        '[Browser] Error:',
        error instanceof Error ? error.message : String(error),
      );

      // 清理旧连接
      try {
        await browser.disconnect();
      } catch {
        // 忽略断开错误
      }

      browser = undefined;
      // 继续执行重连逻辑
    }
  }

  // 执行连接（首次或重连）
  console.log('[Browser] 📡 Connecting to browser:', options.browserURL);
  console.log('');

  try {
    browser = await puppeteer.connect({
      targetFilter: makeTargetFilter(options.devtools),
      browserURL: options.browserURL,
      defaultViewport: null,
      handleDevToolsAsPage: options.devtools,
    });

    isExternalBrowser = true; // 标记为外部浏览器
    initialBrowserURL = options.browserURL; // 保存初始 URL

    console.log('[Browser] ✅ Connected successfully to:', initialBrowserURL);

    return browser;
  } catch (error) {
    console.error(
      '[Browser] ❌ Failed to connect to browser:',
      options.browserURL,
    );
    console.error(
      '[Browser] Error:',
      error instanceof Error ? error.message : String(error),
    );
    throw error;
  }
}

interface McpLaunchOptions {
  acceptInsecureCerts?: boolean;
  executablePath?: string;
  channel?: Channel;
  userDataDir?: string;
  headless: boolean;
  isolated: boolean;
  logFile?: fs.WriteStream;
  viewport?: {
    width: number;
    height: number;
  };
  args?: string[];
  devtools: boolean;
}

export async function launch(options: McpLaunchOptions): Promise<Browser> {
  const {channel, executablePath, headless, isolated} = options;
  const profileDirName =
    channel && channel !== 'stable'
      ? `chrome-profile-${channel}`
      : 'chrome-profile';

  let userDataDir = options.userDataDir;
  if (!isolated && !userDataDir) {
    userDataDir = path.join(
      os.homedir(),
      '.cache',
      'chrome-devtools-mcp',
      profileDirName,
    );
    await fs.promises.mkdir(userDataDir, {
      recursive: true,
    });
  }

  const args: LaunchOptions['args'] = [
    ...(options.args ?? []),
    '--hide-crash-restore-bubble',
  ];

  if (headless) {
    args.push('--screen-info={3840x2160}');
  }
  let puppeteerChannel: ChromeReleaseChannel | undefined;
  if (options.devtools) {
    args.push('--auto-open-devtools-for-tabs');
  }
  if (!executablePath) {
    puppeteerChannel =
      channel && channel !== 'stable'
        ? (`chrome-${channel}` as ChromeReleaseChannel)
        : 'chrome';
  }

  try {
    const browser = await puppeteer.launch({
      channel: puppeteerChannel,
      targetFilter: makeTargetFilter(options.devtools),
      executablePath,
      defaultViewport: null,
      userDataDir,
      pipe: true,
      headless,
      args,
      acceptInsecureCerts: options.acceptInsecureCerts,
      handleDevToolsAsPage: options.devtools,
    });
    if (options.logFile) {
      // FIXME: we are probably subscribing too late to catch startup logs. We
      // should expose the process earlier or expose the getRecentLogs() getter.
      browser.process()?.stderr?.pipe(options.logFile);
      browser.process()?.stdout?.pipe(options.logFile);
    }
    if (options.viewport) {
      const [page] = await browser.pages();
      // @ts-expect-error internal API for now.
      await page?.resize({
        contentWidth: options.viewport.width,
        contentHeight: options.viewport.height,
      });
    }
    return browser;
  } catch (error) {
    if (
      userDataDir &&
      ((error as Error).message.includes('The browser is already running') ||
        (error as Error).message.includes('Target closed') ||
        (error as Error).message.includes('Connection closed'))
    ) {
      throw new Error(
        `The browser is already running for ${userDataDir}. Use --isolated to run multiple browser instances.`,
        {
          cause: error,
        },
      );
    }
    throw error;
  }
}

export async function ensureBrowserLaunched(
  options: McpLaunchOptions,
): Promise<Browser> {
  if (browser?.connected) {
    return browser;
  }
  browser = await launch(options);
  isExternalBrowser = false; // 标记为自己启动的浏览器
  return browser;
}

/**
 * 检查是否应该关闭浏览器
 * 外部连接的浏览器不应该被关闭
 */
export function shouldCloseBrowser(): boolean {
  return !isExternalBrowser;
}

/**
 * 验证浏览器连接状态
 * @param expectedURL 预期的浏览器 URL（可选）
 * @returns 连接是否有效
 */
export async function verifyBrowserConnection(
  expectedURL?: string,
): Promise<boolean> {
  if (!browser?.connected) {
    console.log('[Browser] ✗ Not connected');
    return false;
  }

  try {
    const version = await browser.version();
    const wsEndpoint = browser.wsEndpoint();

    console.log('[Browser] ✓ Connection verified:', {
      version,
      endpoint: wsEndpoint,
      initialURL: initialBrowserURL,
      expectedURL: expectedURL || '(not specified)',
    });

    // 如果提供了 expectedURL，验证是否一致
    if (expectedURL && initialBrowserURL && initialBrowserURL !== expectedURL) {
      console.warn('[Browser] ⚠️  URL mismatch:');
      console.warn('  Initial:', initialBrowserURL);
      console.warn('  Expected:', expectedURL);
      return false;
    }

    return true;
  } catch (error) {
    console.error('[Browser] ✗ Connection lost:', error);
    return false;
  }
}

/**
 * 获取当前连接的浏览器 URL
 * @returns 初始连接的浏览器 URL，如果未连接则返回 undefined
 */
export function getBrowserURL(): string | undefined {
  return initialBrowserURL;
}

/**
 * 重置浏览器连接状态（用于测试或强制重连）
 */
export function resetBrowserConnection(): void {
  browser = undefined;
  initialBrowserURL = undefined;
  isExternalBrowser = false;
  console.log('[Browser] 🔄 Connection state reset');
}

export type Channel = 'stable' | 'canary' | 'beta' | 'dev';
