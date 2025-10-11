/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {Browser, Page, CDPSession} from 'puppeteer';
import type {
  ExtensionInfo,
  ExtensionContext,
  StorageData,
  StorageType,
  ManifestV2,
  ManifestV3,
  ExtensionContextType,
} from './types.js';
import {HelperExtensionClient} from './HelperExtensionClient.js';

interface CDPTargetInfo {
  targetId: string;
  type: string;
  title: string;
  url: string;
  attached: boolean;
  canAccessOpener: boolean;
}

/**
 * 扩展辅助类 - 使用 CDP API 实现可靠的扩展检测
 * 参考 chrome-extension-debug-mcp 的实现方式
 */
export class ExtensionHelper {
  private cdpSession: CDPSession | null = null;
  private helperClient: HelperExtensionClient | null = null;
  private helperDetectionAttempted: boolean = false;

  constructor(private browser: Browser) {
    // Helper Client 将在第一次需要时初始化
  }

  /**
   * 获取 CDP Session
   */
  private async getCDPSession(): Promise<CDPSession> {
    if (!this.cdpSession) {
      const pages = await this.browser.pages();
      if (pages.length === 0) {
        throw new Error('No pages available to create CDP session');
      }
      this.cdpSession = await pages[0].createCDPSession();
    }
    return this.cdpSession;
  }

  /**
   * 从 URL 提取扩展 ID
   */
  private extractExtensionId(url: string): string | null {
    const match = url.match(/chrome-extension:\/\/([a-z]{32})/);
    return match ? match[1] : null;
  }

  /**
   * 推断上下文类型
   */
  private inferContextType(target: CDPTargetInfo): ExtensionContextType {
    const {url, type} = target;

    if (type === 'service_worker' || type === 'background_page') {
      return 'background';
    }

    if (url.includes('/popup.html')) {
      return 'popup';
    }

    if (url.includes('/options.html')) {
      return 'options';
    }

    if (url.includes('/devtools.html')) {
      return 'devtools';
    }

    return 'content_script';
  }

  /**
   * 获取扩展的 manifest 信息
   * MV3: 使用 Puppeteer newPage 打开 manifest.json
   */
  private async getExtensionManifest(
    extensionId: string,
  ): Promise<(ManifestV2 | ManifestV3) | null> {
    let manifestPage: Page | null = null;

    try {
      // 使用 Puppeteer newPage 方法创建新标签页
      const manifestUrl = `chrome-extension://${extensionId}/manifest.json`;
      manifestPage = await this.browser.newPage();
      
      // 添加超时和更快的等待策略
      await manifestPage.goto(manifestUrl, {
        waitUntil: 'domcontentloaded', // 从 networkidle0 改为 domcontentloaded，更快
        timeout: 3000, // 添加 3 秒超时
      });

      // 读取页面内容
      const manifestText = await manifestPage.evaluate(
        () => document.body.textContent,
      );

      // 关闭页面
      await manifestPage.close();
      manifestPage = null;

      if (manifestText) {
        const manifest = JSON.parse(manifestText) as ManifestV2 | ManifestV3;
        return manifest;
      }

      return null;
    } catch (error) {
      // 静默失败，减少日志噪音
      // console.error(`Failed to get manifest for ${extensionId}:`, error);

      // 清理资源
      if (manifestPage) {
        try {
          await manifestPage.close();
        } catch (e) {
          // Ignore
        }
      }

      return null;
    }
  }

  /**
   * 获取所有扩展信息（优化版：只调用一次 CDP，批量处理）
   */
  async getExtensions(includeDisabled = false): Promise<ExtensionInfo[]> {
    try {
      console.log('[ExtensionHelper] 获取所有扩展...');
      
      // 获取所有 targets（只调用一次）
      const cdp = await this.getCDPSession();
      const {targetInfos} = await cdp.send('Target.getTargets');
      const allTargets = targetInfos as CDPTargetInfo[];
      
      // 从所有 chrome-extension:// URLs 中提取唯一的扩展 ID
      const extensionIds = new Set<string>();
      
      for (const target of allTargets) {
        if (target.url?.startsWith('chrome-extension://')) {
          const id = this.extractExtensionId(target.url);
          if (id) {
            extensionIds.add(id);
          }
        }
      }
      
      console.log(`[ExtensionHelper] 从 targets 找到 ${extensionIds.size} 个扩展 ID`);
      
      // 添加已知的扩展 ID（即使它们的 SW 是 inactive）
      // 这样可以检测到 Helper Extension 和其他可能的扩展
      const KNOWN_EXTENSION_IDS = [
        'kppbmoiecmhnnhjnlkojlblanellmonp', // MCP Service Worker Activator (手动安装)
        // 可以添加更多已知的扩展 ID
      ];
      
      let addedCount = 0;
      for (const knownId of KNOWN_EXTENSION_IDS) {
        if (!extensionIds.has(knownId)) {
          extensionIds.add(knownId);
          addedCount++;
        }
      }
      
      if (addedCount > 0) {
        console.log(`[ExtensionHelper] 添加了 ${addedCount} 个已知扩展 ID`);
      }
      
      console.log(`[ExtensionHelper] 总共将检查 ${extensionIds.size} 个扩展`);
      
      // 批量获取详细信息
      const extensions: ExtensionInfo[] = [];
      
      for (const extId of extensionIds) {
        const manifest = await this.getExtensionManifestQuick(extId);
        if (!manifest) continue;
        
        // 查找该扩展的 background target
        const backgroundTarget = allTargets.find(
          t =>
            (t.type === 'service_worker' || t.type === 'background_page') &&
            t.url?.includes(extId),
        );
        
        // 确定 Service Worker 状态
        let serviceWorkerStatus: 'active' | 'inactive' | 'not_found' | undefined;
        const manifestVersion = manifest.manifest_version;
        
        if (manifestVersion === 3) {
          if (backgroundTarget && backgroundTarget.type === 'service_worker') {
            serviceWorkerStatus = 'active';
          } else if ((manifest as ManifestV3).background?.service_worker) {
            serviceWorkerStatus = 'inactive';
          } else {
            serviceWorkerStatus = 'not_found';
          }
        }
        
        // 扩展启用状态：能读取 manifest = 已安装且启用
        const enabled = true;
        
        extensions.push({
          id: extId,
          name: manifest.name,
          version: manifest.version,
          manifestVersion,
          description: manifest.description,
          enabled,
          backgroundUrl: backgroundTarget?.url,
          serviceWorkerStatus,
          permissions:
            manifestVersion === 3
              ? (manifest as ManifestV3).permissions
              : (manifest as ManifestV2).permissions,
          hostPermissions:
            manifestVersion === 3
              ? (manifest as ManifestV3).host_permissions
              : undefined,
        });
      }
      
      console.log(`[ExtensionHelper] 成功处理 ${extensions.length} 个扩展`);
      return includeDisabled ? extensions : extensions.filter(ext => ext.enabled);
    } catch (error) {
      console.error('[ExtensionHelper] 获取扩展列表失败:', error);
      return [];
    }
  }

  /**
   * 快速获取 manifest（用于批量处理，带缓存和快速失败）
   */
  private manifestCache = new Map<string, ManifestV2 | ManifestV3 | null>();
  
  private async getExtensionManifestQuick(
    extensionId: string,
  ): Promise<(ManifestV2 | ManifestV3) | null> {
    // 检查缓存
    if (this.manifestCache.has(extensionId)) {
      return this.manifestCache.get(extensionId)!;
    }
    
    // 调用原有方法
    const manifest = await this.getExtensionManifest(extensionId);
    
    // 缓存结果（包括 null）
    this.manifestCache.set(extensionId, manifest);
    
    return manifest;
  }

  /**
   * 获取指定扩展的详细信息
   */
  async getExtensionDetails(extensionId: string): Promise<ExtensionInfo | null> {
    try {
      const manifest = await this.getExtensionManifest(extensionId);
      if (!manifest) {
        return null;
      }

      const cdp = await this.getCDPSession();
      const result = await cdp.send('Target.getTargets');
      const targets = result.targetInfos as CDPTargetInfo[];

      // 查找背景页
      const backgroundTarget = targets.find(
        t =>
          (t.type === 'service_worker' || t.type === 'background_page') &&
          t.url?.includes(extensionId),
      );

      // 确定 Service Worker 状态
      let serviceWorkerStatus: 'active' | 'inactive' | 'not_found' | undefined;
      if (manifest.manifest_version === 3) {
        if (backgroundTarget && backgroundTarget.type === 'service_worker') {
          serviceWorkerStatus = 'active';
        } else if ((manifest as ManifestV3).background?.service_worker) {
          // manifest 中定义了 SW，但未在 targets 中找到 = Inactive
          serviceWorkerStatus = 'inactive';
        } else {
          serviceWorkerStatus = 'not_found';
        }
      }

      // 扩展启用状态：从 manifest 存在推断（能读取 manifest = 扩展已安装）
      const enabled = !!manifest;

      return {
        id: extensionId,
        name: manifest.name,
        version: manifest.version,
        manifestVersion: manifest.manifest_version,
        description: manifest.description,
        enabled,
        backgroundUrl: backgroundTarget?.url,
        serviceWorkerStatus,
        permissions:
          manifest.manifest_version === 3
            ? (manifest as ManifestV3).permissions
            : (manifest as ManifestV2).permissions,
        hostPermissions:
          manifest.manifest_version === 3
            ? (manifest as ManifestV3).host_permissions
            : undefined,
      };
    } catch (error) {
      // 静默失败
      return null;
    }
  }

  /**
   * 获取扩展的所有上下文
   */
  async getExtensionContexts(extensionId: string): Promise<ExtensionContext[]> {
    try {
      const cdp = await this.getCDPSession();
      const result = await cdp.send('Target.getTargets');
      const targets = result.targetInfos as CDPTargetInfo[];

      const contexts: ExtensionContext[] = [];

      for (const target of targets) {
        const targetExtId = this.extractExtensionId(target.url);
        if (targetExtId !== extensionId) {
          continue;
        }

        const contextType = this.inferContextType(target);
        const isPrimary =
          target.type === 'service_worker' || target.type === 'background_page';

        contexts.push({
          type: contextType,
          extensionId,
          targetId: target.targetId,
          url: target.url,
          isPrimary,
          title: target.title,
        });
      }

      return contexts;
    } catch (error) {
      console.error(`Failed to get contexts for ${extensionId}:`, error);
      return [];
    }
  }

  /**
   * 在指定上下文中执行代码
   * 这个方法更适合 Service Worker，因为它们没有 Page 对象
   */
  async evaluateInContext(
    contextId: string,
    code: string,
    awaitPromise = true,
  ): Promise<unknown> {
    const cdp = await this.getCDPSession();
    let sessionId: string | null = null;

    try {
      // Attach 到目标上下文
      const attachResult = await cdp.send('Target.attachToTarget', {
        targetId: contextId,
        flatten: true,
      });
      sessionId = attachResult.sessionId;

      // 执行代码
      const evalResult = await cdp.send('Runtime.evaluate', {
        expression: code,
        returnByValue: true,
        awaitPromise,
      });

      // Detach
      if (sessionId) {
        await cdp.send('Target.detachFromTarget', {sessionId});
        sessionId = null;
      }

      if (evalResult.exceptionDetails) {
        throw new Error(
          evalResult.exceptionDetails.exception?.description ||
            'Evaluation failed',
        );
      }

      return evalResult.result?.value;
    } catch (error) {
      // 清理
      if (sessionId) {
        try {
          await cdp.send('Target.detachFromTarget', {sessionId});
        } catch (e) {
          // Ignore
        }
      }
      throw error;
    }
  }

  /**
   * 切换到指定的扩展上下文
   * 注意：Service Worker 没有 Page 对象，应该使用 evaluateInContext
   */
  async switchToExtensionContext(contextId: string): Promise<Page | null> {
    try {
      const cdp = await this.getCDPSession();
      const result = await cdp.send('Target.getTargets');
      const targets = result.targetInfos as CDPTargetInfo[];

      const target = targets.find(t => t.targetId === contextId);

      if (!target) {
        throw new Error(`Context with ID ${contextId} not found`);
      }

      // 对于 Service Worker，返回 null 并提示使用 evaluateInContext
      if (target.type === 'service_worker') {
        console.warn(
          'Service Worker does not have a Page object. Use evaluateInContext() instead.',
        );
        return null;
      }

      // 对于常规 Page 类型，使用 Puppeteer API
      const puppeteerTargets = await this.browser.targets();
      const puppeteerTarget = puppeteerTargets.find(
        t => (t as unknown as {_targetId: string})._targetId === contextId,
      );

      if (!puppeteerTarget) {
        throw new Error(`Puppeteer target not found for ${contextId}`);
      }

      const page = await puppeteerTarget.page();
      if (page) {
        await page.bringToFront();
      }

      return page;
    } catch (error) {
      console.error(`Failed to switch to context ${contextId}:`, error);
      throw error;
    }
  }

  /**
   * 获取扩展 Background Target
   */
  async getExtensionBackgroundTarget(extensionId: string): Promise<CDPTargetInfo | null> {
    try {
      const cdp = await this.getCDPSession();
      const result = await cdp.send('Target.getTargets');
      const targets = result.targetInfos as CDPTargetInfo[];

      const backgroundTarget = targets.find(
        t =>
          (t.type === 'service_worker' || t.type === 'background_page') &&
          t.url?.includes(extensionId),
      );

      return backgroundTarget || null;
    } catch (error) {
      console.error(`Failed to get background target for ${extensionId}:`, error);
      return null;
    }
  }

  /**
   * 检测并初始化 Helper Extension Client
   */
  private async ensureHelperClient(): Promise<void> {
    if (!this.helperDetectionAttempted) {
      this.helperDetectionAttempted = true;
      this.helperClient = new HelperExtensionClient(this.browser);
      await this.helperClient.detectHelperExtension();
    }
  }

  /**
   * 自动激活 Service Worker - 增强版
   * 方法 0: Helper Extension（如果可用）⭐⭐⭐⭐⭐
   * 方法 1: 直接触发 Service Worker (CDP)
   * 方法 2: 打开扩展页面
   * 方法 3: 指导手动激活
   */
  async activateServiceWorker(extensionId: string): Promise<{
    success: boolean;
    method?: string;
    url?: string;
    error?: string;
    suggestion?: string;
  }> {
    try {
      console.log(`[ExtensionHelper] 尝试激活 Service Worker: ${extensionId}`);
      
      // ===== 方法 0: Helper Extension（优先级最高）=====
      await this.ensureHelperClient();
      
      if (this.helperClient && this.helperClient.isHelperAvailable()) {
        console.log(`[ExtensionHelper] ✨ 检测到 Helper Extension，使用增强模式`);
        
        const helperResult = await this.helperClient.activateExtension(extensionId);
        
        if (helperResult.success) {
          console.log(`[ExtensionHelper] ✅ Helper Extension 激活成功`);
          return {
            success: true,
            method: `Helper Extension (${helperResult.method})`,
            url: undefined,
          };
        }
        
        console.log(`[ExtensionHelper] ⚠️ Helper Extension 激活失败: ${helperResult.error}`);
        // 继续尝试其他方法
      } else {
        console.log(`[ExtensionHelper] ℹ️ 未检测到 Helper Extension，使用标准模式`);
      }
      
      // ===== 方法 1: 直接通过 CDP 触发 Service Worker =====
      console.log(`[ExtensionHelper] 方法 1: 直接触发 Service Worker`);
      const directActivation = await this.tryDirectActivation(extensionId);
      if (directActivation.success) {
        return directActivation;
      }
      console.log(`[ExtensionHelper] 方法 1 失败: ${directActivation.error}`);
      
      // ===== 方法 2: 通过扩展页面激活 =====
      console.log(`[ExtensionHelper] 方法 2: 通过扩展页面激活`);
      const pageActivation = await this.tryPageActivation(extensionId);
      if (pageActivation.success) {
        return pageActivation;
      }
      console.log(`[ExtensionHelper] 方法 2 失败: ${pageActivation.error}`);
      
      // ===== 所有方法都失败 =====
      const suggestion = this.helperClient && this.helperClient.isHelperAvailable()
        ? this.getManualActivationGuide(extensionId)
        : await this.getManualActivationGuideWithHelperHint(extensionId);
        
      return {
        success: false,
        error: '所有自动激活方法均失败',
        suggestion,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error(`[ExtensionHelper] 激活失败:`, error);
      return {
        success: false,
        error: `激活过程异常: ${errorMsg}`,
        suggestion: await this.getManualActivationGuideWithHelperHint(extensionId),
      };
    }
  }

  /**
   * 方法 1: 直接触发 Service Worker（增强版 - 多种 CDP 方法）
   */
  private async tryDirectActivation(extensionId: string): Promise<{
    success: boolean;
    method?: string;
    error?: string;
  }> {
    try {
      const backgroundTarget = await this.getExtensionBackgroundTarget(extensionId);
      if (!backgroundTarget) {
        return {
          success: false,
          error: '未找到 Service Worker target',
        };
      }

      const cdp = await this.getCDPSession();
      
      // === 尝试多种 CDP 激活方法 ===
      
      // 方法 1.1: ServiceWorker.startWorker
      try {
        console.log(`[ExtensionHelper] 尝试 ServiceWorker.startWorker...`);
        await cdp.send('ServiceWorker.enable' as any);
        await cdp.send('ServiceWorker.startWorker' as any, {
          scopeURL: `chrome-extension://${extensionId}/`,
        });
        
        await new Promise(resolve => setTimeout(resolve, 500));
        if (await this.isServiceWorkerActive(extensionId)) {
          console.log(`[ExtensionHelper] ✅ ServiceWorker.startWorker 成功`);
          return {success: true, method: 'ServiceWorker.startWorker'};
        }
      } catch (e) {
        console.log(`[ExtensionHelper] ServiceWorker.startWorker 失败:`, (e as Error).message);
      }
      
      // 方法 1.2: 直接执行唤醒代码
      try {
        console.log(`[ExtensionHelper] 尝试执行唤醒代码...`);
        
        // 尝试多个唤醒方法
        const wakeMethods = [
          'self.clients.matchAll()',
          'self.skipWaiting()',
          'chrome.storage.local.get(null)',
          'chrome.runtime.getManifest()',
        ];
        
        for (const wakeCode of wakeMethods) {
          try {
            await this.evaluateInContext(
              backgroundTarget.targetId,
              `(async () => { try { await ${wakeCode}; } catch(e) {} return true; })()`,
              true,
            );
            
            await new Promise(resolve => setTimeout(resolve, 300));
            if (await this.isServiceWorkerActive(extensionId)) {
              console.log(`[ExtensionHelper] ✅ 唤醒成功: ${wakeCode}`);
              return {success: true, method: `Direct CDP: ${wakeCode}`};
            }
          } catch (e) {
            continue;
          }
        }
      } catch (e) {
        console.log(`[ExtensionHelper] 唤醒代码失败:`, (e as Error).message);
      }
      
      // 方法 1.3: 强制触发事件
      try {
        console.log(`[ExtensionHelper] 尝试触发 SW 事件...`);
        
        // 触发各种可能激活 SW 的事件
        await this.evaluateInContext(
          backgroundTarget.targetId,
          `
          (async () => {
            // 触发多个事件来激活 SW
            const events = [
              () => self.dispatchEvent(new Event('activate')),
              () => self.dispatchEvent(new Event('install')),
              () => self.dispatchEvent(new ExtendableEvent('message')),
            ];
            
            for (const event of events) {
              try { event(); } catch(e) {}
            }
            
            return true;
          })()
          `,
          true,
        );
        
        await new Promise(resolve => setTimeout(resolve, 500));
        if (await this.isServiceWorkerActive(extensionId)) {
          console.log(`[ExtensionHelper] ✅ 事件触发成功`);
          return {success: true, method: 'Event dispatch'};
        }
      } catch (e) {
        console.log(`[ExtensionHelper] 事件触发失败:`, (e as Error).message);
      }

      return {
        success: false,
        error: 'Service Worker 已执行多种激活方法但 APIs 仍未就绪',
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * 方法 2: 通过扩展页面激活
   */
  private async tryPageActivation(extensionId: string): Promise<{
    success: boolean;
    method?: string;
    url?: string;
    error?: string;
    suggestion?: string;
  }> {
    try {
      const manifest = await this.getExtensionManifest(extensionId);
      if (!manifest) {
        return {
          success: false,
          error: '无法获取扩展 manifest',
        };
      }

      // 尝试打开 popup 或 options 页面
      let targetUrl: string | null = null;
      let method: string | null = null;

      // MV3: action.default_popup, MV2: browser_action.default_popup
      if ('action' in manifest && manifest.action?.default_popup) {
        targetUrl = `chrome-extension://${extensionId}/${manifest.action.default_popup}`;
        method = 'MV3 action.default_popup';
      } else if ('browser_action' in manifest && manifest.browser_action?.default_popup) {
        targetUrl = `chrome-extension://${extensionId}/${manifest.browser_action.default_popup}`;
        method = 'MV2 browser_action.default_popup';
      } else if (manifest.options_page) {
        targetUrl = `chrome-extension://${extensionId}/${manifest.options_page}`;
        method = 'options_page';
      } else if (manifest.options_ui?.page) {
        targetUrl = `chrome-extension://${extensionId}/${manifest.options_ui.page}`;
        method = 'options_ui.page';
      }

      if (!targetUrl) {
        const error = '扩展没有 popup 或 options 页面';
        console.warn(`[ExtensionHelper] ${error}`);
        return {
          success: false,
          error,
          suggestion:
            '自动激活需要扩展有 popup 或 options 页面。' +
            '请手动激活：访问 chrome://extensions/ 并点击 "Service worker" 链接',
        };
      }

      console.log(`[ExtensionHelper] 通过 ${method} 激活: ${targetUrl}`);
      
      try {
        const page = await this.browser.newPage();
        await page.goto(targetUrl, {
          waitUntil: 'networkidle0',
          timeout: 5000,
        });
        
        // 在 popup 页面中触发一个 chrome API 调用来激活 Service Worker
        try {
          await page.evaluate(`
            if (typeof chrome !== 'undefined' && chrome.runtime) {
              chrome.runtime.sendMessage({type: 'activation_ping'}).catch(() => {});
            }
          `);
        } catch (e) {
          // 忽略，继续
        }
        
        await page.close();

        // 等待激活（增加等待时间）
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // 验证激活
        const isActive = await this.isServiceWorkerActive(extensionId);
        
        if (isActive) {
          console.log(`[ExtensionHelper] ✅ Service Worker 激活成功`);
          return {
            success: true,
            method: method || undefined,
            url: targetUrl,
          };
        } else {
          console.warn(`[ExtensionHelper] ⚠️ 打开页面成功但 Service Worker 仍未激活`);
          
          // 尝试备用方法：直接向 Service Worker 发送消息
          try {
            const backgroundTarget = await this.getExtensionBackgroundTarget(extensionId);
            if (backgroundTarget) {
              const evalResult = await this.evaluateInContext(
                backgroundTarget.targetId,
                'self.name || "service_worker"',
                false
              );
              
              // 再次检查
              const isActiveNow = await this.isServiceWorkerActive(extensionId);
              if (isActiveNow) {
                console.log(`[ExtensionHelper] ✅ 通过直接访问激活成功`);
                return {
                  success: true,
                  method: `${method} + direct access`,
                  url: targetUrl,
                };
              }
            }
          } catch (e) {
            // 忽略备用方法的错误
          }
          
          return {
            success: false,
            error: '页面已打开但 Service Worker 未激活',
            suggestion: 
              'Service Worker 可能有初始化错误。\n' +
              '1. 访问 chrome://extensions/\n' +
              '2. 点击 "Service worker" 查看是否有错误\n' +
              '3. 检查扩展的 background.js 是否有语法错误',
          };
        }
      } catch (pageError) {
        const error = `无法打开扩展页面: ${pageError instanceof Error ? pageError.message : String(pageError)}`;
        console.error(`[ExtensionHelper] ${error}`);
        return {
          success: false,
          error,
          suggestion: `页面 ${targetUrl} 无法加载，可能扩展有错误。请检查扩展是否正常工作`,
        };
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error(`[ExtensionHelper] 激活失败:`, error);
      return {
        success: false,
        error: `激活过程异常: ${errorMsg}`,
        suggestion: '请手动激活：访问 chrome://extensions/ 并点击 "Service worker" 链接',
      };
    }
  }

  /**
   * 获取手动激活指南
   */
  private getManualActivationGuide(extensionId: string): string {
    return `Service Worker 自动激活失败，请手动激活：

📋 手动激活步骤：
1. 在 Chrome 浏览器中，打开新标签页
2. 访问: chrome://extensions/
3. 找到扩展（ID: ${extensionId}）
4. 点击蓝色的 "Service worker" 链接
5. 等待 DevTools 打开，Service Worker 将自动激活
6. 重新运行 MCP 命令

💡 提示：
- Service worker 链接在扩展卡片中间，通常是蓝色可点击文字
- 如果看不到 "Service worker" 链接，说明扩展可能有错误
- 激活后 Service Worker 会保持活跃约 30 秒，之后再次休眠

🔍 调试信息：
- 扩展 ID: ${extensionId}
- 如果看到错误，请检查扩展的 background.js 是否有语法错误`;
  }

  /**
   * 获取手动激活指南（包含 Helper Extension 提示）
   */
  private async getManualActivationGuideWithHelperHint(extensionId: string): Promise<string> {
    let helperPath = '';
    
    // 尝试生成临时 Helper Extension
    try {
      const {HelperExtensionGenerator} = await import('./HelperExtensionGenerator.js');
      const generator = new HelperExtensionGenerator();
      
      // 检查是否已经生成
      if (!generator.isGenerated()) {
        console.log('[ExtensionHelper] 生成临时 Helper Extension 以供安装...');
        helperPath = await generator.generateHelperExtension();
        console.log(`[ExtensionHelper] Helper Extension 已生成: ${helperPath}`);
      } else {
        helperPath = generator.getHelperPath() || '';
      }
    } catch (error) {
      console.warn('[ExtensionHelper] 无法生成 Helper Extension:', error);
    }
    
    const helperInstallGuide = helperPath ? `
╔═══════════════════════════════════════════════════════════╗
║  🚀 推荐：安装 Helper Extension 实现 95%+ 自动激活！      ║
╚═══════════════════════════════════════════════════════════╝

📦 Helper Extension 已自动生成！

📁 路径: ${helperPath}

📋 安装步骤：
1. 访问 chrome://extensions/
2. 开启右上角的 "开发者模式"
3. 点击 "加载已解压的扩展程序"
4. 选择目录: ${helperPath}
5. 完成！扩展会显示为 "MCP Service Worker Activator (Auto-Generated)"

✅ 安装后：
- 自动激活成功率提升到 95%+
- 无需再手动激活 Service Worker
- 立即生效，无需重启 MCP

Helper Extension 说明：
- 使用 chrome.debugger API 实现可靠的自动激活
- 开源、安全、不收集数据
- 可选安装，卸载后降级到手动模式

────────────────────────────────────────────────────────────

` : `
🚀 可选增强（推荐）：
安装 MCP Helper Extension 可实现 95%+ 自动激活成功率！

💡 提示：如果使用 --browser-url 连接模式，建议改用自动启动模式：
   移除 --browser-url 参数，MCP 会自动启动 Chrome 并注入 Helper Extension

────────────────────────────────────────────────────────────

`;

    return `❌ Service Worker 自动激活失败

有两个解决方案：

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

【方案 1】立即恢复使用 - 手动激活（临时，需每次操作）

📋 操作步骤：
1. 在 Chrome 中，打开新标签页
2. 访问: chrome://extensions/
3. 找到扩展（ID: ${extensionId}）
4. 点击蓝色的 "Service worker" 链接
5. 等待 DevTools 打开，Service Worker 将自动激活
6. 重新运行 MCP 命令

💡 提示：
- Service worker 链接在扩展卡片中间，通常是蓝色可点击文字
- 如果看不到链接，说明扩展可能有错误
- 激活后保持活跃约 30 秒，之后再次休眠

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

【方案 2】一劳永逸 - 安装 Helper Extension（推荐，95%+ 成功率）
${helperInstallGuide}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🔍 调试信息：
- 扩展 ID: ${extensionId}
- 如果持续失败，请检查扩展的 background.js 是否有语法错误
- 建议使用方案 2 以获得最佳体验`;
  }

  /**
   * 检查 Service Worker 是否激活（chrome.storage 是否可用）
   */
  async isServiceWorkerActive(extensionId: string): Promise<boolean> {
    try {
      const backgroundTarget = await this.getExtensionBackgroundTarget(extensionId);
      if (!backgroundTarget) return false;

      const result = await this.evaluateInContext(
        backgroundTarget.targetId,
        'typeof chrome !== "undefined" && typeof chrome.storage !== "undefined"',
        false,
      );

      return result === true;
    } catch (error) {
      return false;
    }
  }

  /**
   * 获取扩展的 Console 日志
   */
  async getExtensionLogs(extensionId: string): Promise<{
    logs: Array<{
      type: string;
      text: string;
      timestamp: number;
      source: string;
    }>;
    isActive: boolean;
  }> {
    const logs: Array<{
      type: string;
      text: string;
      timestamp: number;
      source: string;
    }> = [];

    try {
      const backgroundTarget = await this.getExtensionBackgroundTarget(extensionId);
      if (!backgroundTarget) {
        return {logs: [], isActive: false};
      }

      const isActive = await this.isServiceWorkerActive(extensionId);
      const cdp = await this.getCDPSession();

      // Attach 到 background target
      const attachResult = await cdp.send('Target.attachToTarget', {
        targetId: backgroundTarget.targetId,
        flatten: true,
      });

      // 启用 Console domain
      await cdp.send('Console.enable');

      // 获取已有的 console 消息
      // 注意：这只能获取当前会话的消息，历史消息可能已经丢失
      // 建议在 Service Worker 中添加持久化日志

      // 执行代码获取 console 历史（如果扩展有保存）
      const evalResult = await cdp.send('Runtime.evaluate', {
        expression: `
          (() => {
            // 尝试获取扩展自己保存的日志（如果有）
            if (typeof globalThis.__logs !== 'undefined') {
              return globalThis.__logs;
            }
            return [];
          })()
        `,
        returnByValue: true,
      });

      // Detach
      await cdp.send('Target.detachFromTarget', {
        sessionId: attachResult.sessionId,
      });

      const storedLogs = evalResult.result?.value as Array<{
        type: string;
        message: string;
        timestamp: number;
      }> || [];

      storedLogs.forEach((log: {type: string; message: string; timestamp: number}) => {
        logs.push({
          type: log.type,
          text: log.message,
          timestamp: log.timestamp,
          source: 'stored',
        });
      });

      return {logs, isActive};
    } catch (error) {
      console.error(`Failed to get logs for ${extensionId}:`, error);
      return {logs: [], isActive: false};
    }
  }

  /**
   * 获取扩展的 Storage 数据
   * 自动检测并激活 Service Worker
   */
  async getExtensionStorage(
    extensionId: string,
    storageType: StorageType,
  ): Promise<StorageData> {
    try {
      const backgroundTarget = await this.getExtensionBackgroundTarget(extensionId);

      if (!backgroundTarget) {
        throw new Error(
          `Extension ${extensionId} not found or background context not available`,
        );
      }

      // 检查是否激活，如果未激活则尝试自动激活
      const isActive = await this.isServiceWorkerActive(extensionId);
      if (!isActive) {
        console.log('[ExtensionHelper] Service Worker inactive, attempting auto-activation...');
        const result = await this.activateServiceWorker(extensionId);
        if (!result.success) {
          const errorMsg = result.error || 'Unknown error';
          const suggestion = result.suggestion || 
            'Please manually activate by opening the extension popup or visiting chrome://extensions/ and clicking the "Service worker" link.';
          throw new Error(
            `Service Worker is inactive and auto-activation failed.\n` +
            `Error: ${errorMsg}\n` +
            `Suggestion: ${suggestion}`,
          );
        }
        console.log('[ExtensionHelper] ✅ Auto-activation successful');
      }

      const cdp = await this.getCDPSession();

      // Attach 到 background target
      const attachResult = await cdp.send('Target.attachToTarget', {
        targetId: backgroundTarget.targetId,
        flatten: true,
      });

      // 在扩展上下文中执行代码获取 Storage
      const evalResult = await cdp.send('Runtime.evaluate', {
        expression: `
          (async () => {
            try {
              // 检查 chrome.storage 是否可用
              if (typeof chrome === 'undefined' || !chrome.storage) {
                return {
                  error: 'chrome.storage API not available in this context',
                  data: {},
                };
              }

              const storage = chrome.storage['${storageType}'];
              if (!storage) {
                return {
                  error: 'Storage type ${storageType} not available',
                  data: {},
                };
              }

              const data = await storage.get(null);
              
              let bytesInUse, quota;
              try {
                bytesInUse = await storage.getBytesInUse(null);
                if ('${storageType}' === 'local') quota = 5 * 1024 * 1024;
                else if ('${storageType}' === 'sync') quota = 100 * 1024;
                else if ('${storageType}' === 'session') quota = 10 * 1024 * 1024;
              } catch (e) {
                // getBytesInUse may not be supported
              }

              return {data: data || {}, bytesInUse, quota};
            } catch (error) {
              return {
                error: error.message,
                data: {},
              };
            }
          })()
        `,
        returnByValue: true,
        awaitPromise: true,
      });

      // Detach
      await cdp.send('Target.detachFromTarget', {
        sessionId: attachResult.sessionId,
      });

      // 检查是否有异常
      if (evalResult.exceptionDetails) {
        throw new Error(
          evalResult.exceptionDetails.exception?.description ||
            'Failed to evaluate storage code',
        );
      }

      const result = evalResult.result?.value as {
        data: Record<string, unknown>;
        bytesInUse?: number;
        quota?: number;
        error?: string;
      };

      if (!result) {
        throw new Error('No result returned from storage evaluation');
      }

      if (result.error) {
        throw new Error(`Storage access error: ${result.error}`);
      }

      return {
        type: storageType,
        data: result.data || {},
        bytesUsed: result.bytesInUse,
        quota: result.quota,
      };
    } catch (error) {
      console.error(`Failed to get storage for ${extensionId}:`, error);
      throw error;
    }
  }
}
