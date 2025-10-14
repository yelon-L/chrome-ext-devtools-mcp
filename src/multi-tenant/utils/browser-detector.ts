/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * 浏览器检测工具
 * 检测浏览器是否可连接并获取信息
 */

export interface BrowserDetectionResult {
  connected: boolean;
  browserInfo?: {
    browser: string;
    protocolVersion: string;
    userAgent: string;
    v8Version: string;
    webSocketDebuggerUrl: string;
  };
  error?: string;
}

/**
 * 检测浏览器连接并获取信息
 * 
 * @param browserURL - 浏览器调试地址
 * @param timeout - 超时时间（毫秒），默认 3000ms
 * @returns 检测结果
 */
export async function detectBrowser(
  browserURL: string,
  timeout = 3000
): Promise<BrowserDetectionResult> {
  try {
    const versionURL = `${browserURL}/json/version`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    
    const response = await fetch(versionURL, {
      signal: controller.signal,
      headers: { 'Accept': 'application/json' },
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      return {
        connected: false,
        error: `HTTP ${response.status}: ${response.statusText}`,
      };
    }
    
    const browserInfo = await response.json();
    return {
      connected: true,
      browserInfo: {
        browser: browserInfo.Browser || 'Unknown',
        protocolVersion: browserInfo['Protocol-Version'],
        userAgent: browserInfo['User-Agent'],
        v8Version: browserInfo['V8-Version'],
        webSocketDebuggerUrl: browserInfo.webSocketDebuggerUrl,
      },
    };
  } catch (error) {
    return {
      connected: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
