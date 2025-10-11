/**
 * Helper Extension Client
 * 
 * 与 MCP Helper Extension 通信，实现自动激活功能
 */

import type {Browser, Page} from 'puppeteer';

export interface ActivationResult {
  success: boolean;
  method?: string;
  message?: string;
  error?: string;
}

export class HelperExtensionClient {
  private browser: Browser;
  private helperExtensionId: string | null = null;
  private helperDetected: boolean = false;

  constructor(browser: Browser) {
    this.browser = browser;
  }

  /**
   * 检测是否安装了 Helper Extension
   */
  async detectHelperExtension(): Promise<boolean> {
    try {
      console.log('[HelperClient] 检测 Helper Extension...');

      const page = (await this.browser.pages())[0];
      const cdp = await page.createCDPSession();

      // 方法 1: 从 active targets 中查找
      console.log('[HelperClient] 方法 1: 检查 active Service Workers...');
      const {targetInfos} = await cdp.send('Target.getTargets');
      const extensions = targetInfos.filter(
        t => t.type === 'service_worker' && t.url.startsWith('chrome-extension://'),
      );

      for (const ext of extensions) {
        const extId = ext.url.match(/chrome-extension:\/\/([a-z]{32})/)?.[1];
        if (!extId) continue;

        if (await this.tryDetectExtension(extId)) {
          return true;
        }
      }

      console.log('[HelperClient] 方法 1 未找到，尝试方法 2...');

      // 方法 2: 尝试已知的扩展 IDs（从其他已安装扩展推测）
      console.log('[HelperClient] 方法 2: 尝试从所有扩展中查找...');
      
      // 获取所有可能的扩展 IDs
      const allTargets = targetInfos.filter(t => t.url.startsWith('chrome-extension://'));
      const possibleIds = new Set<string>();
      
      for (const target of allTargets) {
        const extId = target.url.match(/chrome-extension:\/\/([a-z]{32})/)?.[1];
        if (extId) {
          possibleIds.add(extId);
        }
      }

      // 尝试每个可能的 ID
      for (const extId of possibleIds) {
        if (await this.tryDetectExtension(extId)) {
          return true;
        }
      }

      console.log('[HelperClient] ⚠️  未检测到 Helper Extension');
      console.log('[HelperClient] 💡 提示: Helper Extension 可能处于 Inactive 状态');
      console.log('[HelperClient] 💡 建议: 使用 ping 测试或手动指定 ID');
      
      return false;
    } catch (error) {
      console.error('[HelperClient] 检测失败:', error);
      return false;
    }
  }

  /**
   * 尝试检测指定 ID 的扩展是否为 Helper Extension
   */
  private async tryDetectExtension(extId: string): Promise<boolean> {
    try {
      const manifestPage = await this.browser.newPage();
      await manifestPage.goto(`chrome-extension://${extId}/manifest.json`, {
        waitUntil: 'networkidle0',
        timeout: 2000, // 减少超时时间
      });

      const manifestText = await manifestPage.evaluate(() => document.body.textContent);
      await manifestPage.close();

      if (!manifestText) return false;

      const manifest = JSON.parse(manifestText);

      // 检查是否是 Helper Extension（支持多种名称变体）
      const isHelper = 
        manifest.name === 'MCP Service Worker Activator' ||
        manifest.name === 'MCP Service Worker Activator (Auto-Generated)' ||
        (manifest.name && manifest.name.includes('MCP Service Worker Activator'));

      if (isHelper) {
        this.helperExtensionId = extId;
        this.helperDetected = true;
        console.log(`[HelperClient] ✅ 检测到 Helper Extension: ${extId}`);
        console.log(`[HelperClient]    名称: ${manifest.name}`);
        console.log(`[HelperClient]    版本: ${manifest.version}`);
        // 不在这里做 ping 测试，避免性能问题
        return true;
      }

      return false;
    } catch (e) {
      // 无法访问此扩展，静默失败
      return false;
    }
  }

  /**
   * 通过 Helper Extension 激活目标扩展
   */
  async activateExtension(targetExtensionId: string): Promise<ActivationResult> {
    if (!this.helperDetected || !this.helperExtensionId) {
      return {
        success: false,
        error: 'Helper Extension not detected. Please install it first.',
      };
    }

    try {
      console.log(
        `[HelperClient] 请求激活扩展: ${targetExtensionId} via Helper: ${this.helperExtensionId}`,
      );

      // 创建一个页面来发送消息
      const page = await this.browser.newPage();

      try {
        // 注入脚本发送消息给 Helper Extension
        const result = await page.evaluate(
          (helperId, targetId) => {
            return new Promise((resolve) => {
              // 使用 chrome.runtime.sendMessage 发送外部消息
              // @ts-ignore - chrome API 在扩展页面中可用
              if (typeof chrome !== 'undefined' && chrome.runtime) {
                // @ts-ignore
                chrome.runtime.sendMessage(
                  helperId,
                  {
                    action: 'activate',
                    extensionId: targetId,
                  },
                  (response: unknown) => {
                    // @ts-ignore
                    if (chrome.runtime.lastError) {
                      resolve({
                        success: false,
                        // @ts-ignore
                        error: chrome.runtime.lastError.message,
                      });
                    } else {
                      resolve(response);
                    }
                  },
                );
              } else {
                resolve({
                  success: false,
                  error: 'chrome.runtime not available',
                });
              }
            });
          },
          this.helperExtensionId,
          targetExtensionId,
        );

        await page.close();

        console.log('[HelperClient] 激活结果:', result);
        return result as ActivationResult;
      } catch (error) {
        await page.close();
        throw error;
      }
    } catch (error) {
      console.error('[HelperClient] 激活失败:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Ping Helper Extension 检查是否在线
   */
  async pingHelper(): Promise<boolean> {
    if (!this.helperDetected || !this.helperExtensionId) {
      return false;
    }

    try {
      const page = await this.browser.newPage();

      const result = await page.evaluate((helperId) => {
        return new Promise((resolve) => {
          // @ts-ignore
          if (typeof chrome !== 'undefined' && chrome.runtime) {
            // @ts-ignore
            chrome.runtime.sendMessage(
              helperId,
              {action: 'ping'},
              (response: unknown) => {
                // @ts-ignore
                if (chrome.runtime.lastError) {
                  resolve(false);
                } else {
                  // @ts-ignore
                  resolve(response?.success === true);
                }
              },
            );
          } else {
            resolve(false);
          }
        });
      }, this.helperExtensionId);

      await page.close();

      return result as boolean;
    } catch (error) {
      return false;
    }
  }

  /**
   * 是否已检测到 Helper
   */
  isHelperAvailable(): boolean {
    return this.helperDetected;
  }

  /**
   * 获取 Helper Extension ID
   */
  getHelperExtensionId(): string | null {
    return this.helperExtensionId;
  }
}
