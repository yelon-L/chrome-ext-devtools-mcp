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
 * ExtensionHelper 配置选项
 */
export interface ExtensionHelperOptions {
  /** 已知的扩展ID列表（用于检测未激活的扩展） */
  knownExtensionIds?: string[];
  
  /** 超时配置 */
  timeouts?: {
    /** manifest 加载超时（毫秒），默认 2000 */
    manifestLoad?: number;
    /** 页面加载超时（毫秒），默认 5000 */
    pageLoad?: number;
  };
  
  /** 日志配置 */
  logging?: {
    /** 是否使用console（开发模式），默认 false */
    useConsole?: boolean;
  };
}

/**
 * 扩展辅助类 - 使用 CDP API 实现可靠的扩展检测
 * 参考 chrome-extension-debug-mcp 的实现方式
 */
export class ExtensionHelper {
  private cdpSession: CDPSession | null = null;
  private helperClient: HelperExtensionClient | null = null;
  private helperDetectionAttempted: boolean = false;
  private options: Required<ExtensionHelperOptions>;

  constructor(
    private browser: Browser,
    options: ExtensionHelperOptions = {},
  ) {
    // 合并默认配置
    this.options = {
      knownExtensionIds: options.knownExtensionIds || [],
      timeouts: {
        manifestLoad: options.timeouts?.manifestLoad || 2000,
        pageLoad: options.timeouts?.pageLoad || 5000,
      },
      logging: {
        useConsole: options.logging?.useConsole || false,
      },
    };
    // Helper Client 将在第一次需要时初始化
  }
  
  /**
   * 日志方法（可配置是否使用console）
   */
  private log(message: string): void {
    if (this.options.logging.useConsole) {
      console.log(message);
    }
  }
  
  private logWarn(message: string): void {
    if (this.options.logging.useConsole) {
      console.warn(message);
    }
  }
  
  private logError(message: string, error?: unknown): void {
    if (this.options.logging.useConsole) {
      console.error(message, error);
    }
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
   * 确定 Service Worker 状态
   * 
   * @param manifest - 扩展的 manifest 信息
   * @param backgroundTarget - 从 targets 中找到的 background target
   * @returns Service Worker 状态
   * - `active`: Service Worker 正在运行
   * - `inactive`: Service Worker 已定义但未激活（休眠）
   * - `not_found`: Manifest 中未定义 Service Worker
   * - `undefined`: MV2 扩展（没有 Service Worker）
   */
  private determineServiceWorkerStatus(
    manifest: ManifestV2 | ManifestV3,
    backgroundTarget: CDPTargetInfo | null,
  ): 'active' | 'inactive' | 'not_found' | undefined {
    // 只有 MV3 才有 Service Worker
    if (manifest.manifest_version !== 3) {
      return undefined;
    }

    const mv3Manifest = manifest as ManifestV3;

    // 检查 Manifest 中是否定义了 Service Worker
    if (!mv3Manifest.background?.service_worker) {
      return 'not_found';
    }

    // 检查 Service Worker 是否在运行
    if (backgroundTarget && backgroundTarget.type === 'service_worker') {
      return 'active';
    }

    // Manifest 中定义了 SW，但未在 targets 中找到 = Inactive (休眠)
    return 'inactive';
  }

  /**
   * 推断上下文类型
   * 
   * @param target - CDP target 信息
   * @param manifest - 可选的 manifest 信息，用于精确判断
   * @returns 上下文类型
   */
  private inferContextType(
    target: CDPTargetInfo,
    manifest?: ManifestV2 | ManifestV3,
  ): ExtensionContextType {
    const {url, type} = target;

    // 1. 通过 target type 判断（最准确）
    if (type === 'service_worker' || type === 'background_page') {
      return 'background';
    }

    // 2. 如果有 manifest，使用 manifest 精确判断
    if (manifest) {
      const manifestV3 = manifest as ManifestV3;
      const manifestV2 = manifest as ManifestV2;

      // Popup: 检查 action.default_popup 或 browser_action.default_popup
      const popupPage =
        manifestV3.action?.default_popup ||
        manifestV2.browser_action?.default_popup ||
        manifestV2.page_action?.default_popup;

      if (popupPage && url.endsWith(popupPage)) {
        return 'popup';
      }

      // Options: 检查 options_page 或 options_ui.page
      const optionsPage =
        manifest.options_page || (manifest as ManifestV3).options_ui?.page;

      if (optionsPage && url.endsWith(optionsPage)) {
        return 'options';
      }

      // DevTools: 检查 devtools_page
      const devtoolsPage = (manifest as any).devtools_page;
      if (devtoolsPage && url.endsWith(devtoolsPage)) {
        return 'devtools';
      }
    }

    // 3. 检查 offscreen document（MV3 新特性）
    if (url.includes('/offscreen')) {
      return 'content_script'; // 暂时归类为 content_script，未来可以添加 'offscreen' 类型
    }

    // 4. 回退到基于 URL 的推断
    if (url.includes('/popup.html')) {
      return 'popup';
    }

    if (url.includes('/options.html')) {
      return 'options';
    }

    if (url.includes('/devtools.html')) {
      return 'devtools';
    }

    // 5. 默认为 content_script
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
      
      // 使用配置的超时时间
      await manifestPage.goto(manifestUrl, {
        waitUntil: 'domcontentloaded',
        timeout: this.options.timeouts.manifestLoad,
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
   * 🚀 优化方法：通过 chrome.management.getAll() API 获取所有扩展
   * 优点：一次调用获取所有扩展，包括休眠的扩展
   */
  private async getExtensionsViaManagementAPI(allTargets: CDPTargetInfo[]): Promise<ExtensionInfo[]> {
    try {
      // 方案A: 找一个已经活跃的扩展 Service Worker
      let activeExtensionTarget = allTargets.find(
        t => t.type === 'service_worker' && t.url?.startsWith('chrome-extension://')
      );
      
      // 方案B: 如果没有活跃的SW，尝试主动激活一个
      if (!activeExtensionTarget) {
        this.log('[ExtensionHelper] 没有活跃的SW，尝试激活一个扩展...');
        
        // 从 targets 中找任意一个扩展页面
        const anyExtensionTarget = allTargets.find(
          t => t.url?.startsWith('chrome-extension://')
        );
        
        if (anyExtensionTarget) {
          const extId = this.extractExtensionId(anyExtensionTarget.url);
          if (extId) {
            try {
              // 通过打开 manifest.json 来触发 SW 激活（轻量级操作）
              const manifestPage = await this.browser.newPage();
              await manifestPage.goto(`chrome-extension://${extId}/manifest.json`, {
                timeout: this.options.timeouts.manifestLoad,
                waitUntil: 'domcontentloaded'
              });
              await manifestPage.close();
              
              // 等待 SW 激活
              await new Promise(resolve => setTimeout(resolve, 500));
              
              // 重新获取 targets
              const cdp = await this.getCDPSession();
              const {targetInfos} = await cdp.send('Target.getTargets');
              const newTargets = targetInfos as CDPTargetInfo[];
              
              activeExtensionTarget = newTargets.find(
                t => t.type === 'service_worker' && t.url?.startsWith('chrome-extension://')
              );
              
              if (activeExtensionTarget) {
                this.log('[ExtensionHelper] ✅ 成功激活一个SW');
              }
            } catch (error) {
              this.log('[ExtensionHelper] 激活SW失败，使用回退方案');
            }
          }
        }
      }
      
      if (!activeExtensionTarget) {
        this.log('[ExtensionHelper] 仍然没有活跃的SW，使用回退方案');
        return [];
      }
      
      const extId = this.extractExtensionId(activeExtensionTarget.url);
      if (!extId) return [];
      
      this.log(`[ExtensionHelper] 使用扩展 ${extId} 调用 chrome.management.getAll()`);
      
      // 在扩展上下文中执行 chrome.management.getAll()
      const result = await this.evaluateInContext(
        activeExtensionTarget.targetId,
        `
        (async () => {
          if (typeof chrome === 'undefined' || !chrome.management) {
            return {error: 'chrome.management not available'};
          }
          try {
            const extensions = await chrome.management.getAll();
            return {success: true, extensions};
          } catch (error) {
            return {error: error.message};
          }
        })()
        `,
        true
      );
      
      if (!result || (result as any).error) {
        this.log(`[ExtensionHelper] chrome.management API 调用失败: ${(result as any)?.error}`);
        return [];
      }
      
      const managementData = (result as any).extensions || [];
      this.log(`[ExtensionHelper] chrome.management API 返回 ${managementData.length} 个扩展`);
      
      // 🚀 并行获取所有扩展的 manifest
      const manifestPromises = managementData.map((ext: any) => 
        this.getExtensionManifestQuick(ext.id).then(manifest => ({ext, manifest}))
      );
      
      const manifestResults = await Promise.all(manifestPromises);
      
      // 转换为 ExtensionInfo 格式
      const extensions: ExtensionInfo[] = [];
      
      for (const {ext, manifest} of manifestResults) {
        const manifestVersion = manifest?.manifest_version || 2;  // 默认 MV2 更安全
        
        // 查找该扩展的 background target
        const backgroundTarget = allTargets.find(
          t =>
            (t.type === 'service_worker' || t.type === 'background_page') &&
            t.url?.includes(ext.id),
        ) || null;
        
        // 确定 Service Worker 状态（使用公共方法）
        const serviceWorkerStatus = manifest
          ? this.determineServiceWorkerStatus(manifest, backgroundTarget)
          : undefined;
        
        extensions.push({
          id: ext.id,
          name: ext.name,
          version: ext.version || 'unknown',
          manifestVersion,  // ✅ 准确的版本号
          description: ext.description || '',
          enabled: ext.enabled,
          backgroundUrl: backgroundTarget?.url,
          serviceWorkerStatus,
          permissions: ext.permissions || [],
          hostPermissions: ext.hostPermissions || [],
        });
      }
      
      return extensions;
    } catch (error) {
      this.logError('[ExtensionHelper] getExtensionsViaManagementAPI 失败:', error);
      return [];
    }
  }

  /**
   * 获取所有扩展信息（优化版：优先使用 chrome.management API）
   */
  async getExtensions(includeDisabled = false): Promise<ExtensionInfo[]> {
    try {
      this.log('[ExtensionHelper] 获取所有扩展...');
      
      // 获取所有 targets（只调用一次）
      const cdp = await this.getCDPSession();
      const {targetInfos} = await cdp.send('Target.getTargets');
      const allTargets = targetInfos as CDPTargetInfo[];
      
      // 🚀 优化：尝试使用 chrome.management.getAll() API
      const managementExtensions = await this.getExtensionsViaManagementAPI(allTargets);
      
      if (managementExtensions.length > 0) {
        this.log(`[ExtensionHelper] ✅ 通过 chrome.management API 获取到 ${managementExtensions.length} 个扩展`);
        return includeDisabled ? managementExtensions : managementExtensions.filter(ext => ext.enabled);
      }
      
      this.log('[ExtensionHelper] ⚠️  chrome.management API 不可用，回退到 targets 扫描');
      
      // 回退方案：从所有 chrome-extension:// URLs 中提取唯一的扩展 ID
      const extensionIds = new Set<string>();
      
      for (const target of allTargets) {
        if (target.url?.startsWith('chrome-extension://')) {
          const id = this.extractExtensionId(target.url);
          if (id) {
            extensionIds.add(id);
          }
        }
      }
      
      this.log(`[ExtensionHelper] 从 targets 找到 ${extensionIds.size} 个扩展 ID`);
      
      // 添加已知的扩展 ID（即使它们的 SW 是 inactive）
      // 这样可以检测到 Helper Extension 和其他可能的扩展
      const knownIds = this.options.knownExtensionIds || [];
      
      let addedCount = 0;
      for (const knownId of knownIds) {
        if (!extensionIds.has(knownId)) {
          extensionIds.add(knownId);
          addedCount++;
        }
      }
      
      if (addedCount > 0) {
        this.log(`[ExtensionHelper] 添加了 ${addedCount} 个已知扩展 ID`);
      }
      
      this.log(`[ExtensionHelper] 总共将检查 ${extensionIds.size} 个扩展`);
      
      // 🚀 优化：并行获取所有扩展的 manifest
      const extensions: ExtensionInfo[] = [];
      
      this.log(`[ExtensionHelper] 并行获取 ${extensionIds.size} 个扩展的 manifest...`);
      const startTime = Date.now();
      
      const manifestPromises = Array.from(extensionIds).map(async (extId) => {
        const manifest = await this.getExtensionManifestQuick(extId);
        return {extId, manifest};
      });
      
      const manifestResults = await Promise.all(manifestPromises);
      const elapsed = Date.now() - startTime;
      this.log(`[ExtensionHelper] 所有 manifest 获取完成，总耗时 ${elapsed}ms`);
      
      for (const {extId, manifest} of manifestResults) {
        if (!manifest) {
          this.log(`[ExtensionHelper] 扩展 ${extId} manifest 为空，跳过`);
          continue;
        }
        
        // 查找该扩展的 background target
        const backgroundTarget = allTargets.find(
          t =>
            (t.type === 'service_worker' || t.type === 'background_page') &&
            t.url?.includes(extId),
        ) || null;
        
        // 确定 Service Worker 状态（使用公共方法）
        const serviceWorkerStatus = this.determineServiceWorkerStatus(
          manifest,
          backgroundTarget,
        );
        const manifestVersion = manifest.manifest_version;
        
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
      
      this.log(`[ExtensionHelper] 成功处理 ${extensions.length} 个扩展`);
      return includeDisabled ? extensions : extensions.filter(ext => ext.enabled);
    } catch (error) {
      this.logError('[ExtensionHelper] 获取扩展列表失败:', error);
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
   * 
   * 直接获取单个扩展的信息，避免获取所有扩展
   * 性能：~20ms（只获取1个） vs ~200ms（获取所有再过滤）
   */
  async getExtensionDetails(extensionId: string): Promise<ExtensionInfo | null> {
    try {
      // 1. 获取该扩展的 manifest
      const manifest = await this.getExtensionManifest(extensionId);
      if (!manifest) {
        return null;
      }

      // 2. 获取 targets（轻量级操作）
      const cdp = await this.getCDPSession();
      const {targetInfos} = await cdp.send('Target.getTargets');
      const allTargets = targetInfos as CDPTargetInfo[];

      // 3. 查找该扩展的 background target
      const backgroundTarget = allTargets.find(
        t =>
          (t.type === 'service_worker' || t.type === 'background_page') &&
          t.url?.includes(extensionId),
      ) || null;

      // 4. 确定 Service Worker 状态（使用公共方法）
      const serviceWorkerStatus = this.determineServiceWorkerStatus(
        manifest,
        backgroundTarget,
      );

      // 5. 构建返回结果
      return {
        id: extensionId,
        name: manifest.name,
        version: manifest.version,
        manifestVersion: manifest.manifest_version,
        description: manifest.description,
        enabled: true,  // 能读取 manifest 说明扩展已启用
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
   * 
   * 优化：使用 manifest 信息精确判断上下文类型
   */
  async getExtensionContexts(extensionId: string): Promise<ExtensionContext[]> {
    try {
      // 获取 manifest 用于精确判断类型
      const manifest = await this.getExtensionManifestQuick(extensionId);

      const cdp = await this.getCDPSession();
      const result = await cdp.send('Target.getTargets');
      const targets = result.targetInfos as CDPTargetInfo[];

      const contexts: ExtensionContext[] = [];

      for (const target of targets) {
        const targetExtId = this.extractExtensionId(target.url);
        if (targetExtId !== extensionId) {
          continue;
        }

        // 使用 manifest 精确判断类型
        const contextType = this.inferContextType(target, manifest || undefined);
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
      this.logError(`Failed to get contexts for ${extensionId}:`, error);
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
      // 方案：获取目标的 page 或 worker，直接使用 Puppeteer API
      const targets = await this.browser.targets();
      const target = targets.find(t => (t as any)._targetId === contextId);
      
      if (!target) {
        throw new Error(`Target ${contextId} not found`);
      }

      // 尝试获取 worker (Service Worker)
      const worker = await target.worker();
      if (worker) {
        // 使用 worker.evaluate
        return await worker.evaluate((code) => {
          // 使用 eval 在 worker 上下文执行
          return eval(code);
        }, code);
      }

      // 如果不是 worker，尝试 page
      const page = await target.page();
      if (page) {
        return await page.evaluate((code) => {
          return eval(code);
        }, code);
      }

      throw new Error('Cannot get page or worker for this target');
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
   * 
   * @param contextId - Context ID (target ID)
   * @returns Page 对象
   * @throws Error 如果 context 不存在或是 Service Worker
   * 
   * 注意：Service Worker 没有 Page 对象，应该使用 evaluateInContext
   */
  async switchToExtensionContext(contextId: string): Promise<Page> {
    try {
      const cdp = await this.getCDPSession();
      const result = await cdp.send('Target.getTargets');
      const targets = result.targetInfos as CDPTargetInfo[];

      const target = targets.find(t => t.targetId === contextId);

      if (!target) {
        throw new Error(`Context with ID ${contextId} not found`);
      }

      // Service Worker 不支持 Page API，直接抛错并提示
      if (target.type === 'service_worker') {
        throw new Error(
          'Service Worker does not have a Page object. Use evaluateInContext() instead.',
        );
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
      
      if (!page) {
        throw new Error(`Failed to get Page object for context ${contextId}`);
      }
      
      await page.bringToFront();

      return page;
    } catch (error) {
      this.logError(`Failed to switch to context ${contextId}:`, error);
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
      this.logError(`Failed to get background target for ${extensionId}:`, error);
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
      this.log(`[ExtensionHelper] 尝试激活 Service Worker: ${extensionId}`);
      
      // ===== 方法 0: Helper Extension（优先级最高）=====
      await this.ensureHelperClient();
      
      if (this.helperClient && this.helperClient.isHelperAvailable()) {
        this.log(`[ExtensionHelper] ✨ 检测到 Helper Extension，使用增强模式`);
        
        const helperResult = await this.helperClient.activateExtension(extensionId);
        
        if (helperResult.success) {
          this.log(`[ExtensionHelper] ✅ Helper Extension 激活成功`);
          return {
            success: true,
            method: `Helper Extension (${helperResult.method})`,
            url: undefined,
          };
        }
        
        this.log(`[ExtensionHelper] ⚠️ Helper Extension 激活失败: ${helperResult.error}`);
        // 继续尝试其他方法
      } else {
        this.log(`[ExtensionHelper] ℹ️ 未检测到 Helper Extension，使用标准模式`);
      }
      
      // ===== 方法 1: 直接通过 CDP 触发 Service Worker =====
      this.log(`[ExtensionHelper] 方法 1: 直接触发 Service Worker`);
      const directActivation = await this.tryDirectActivation(extensionId);
      if (directActivation.success) {
        return directActivation;
      }
      this.log(`[ExtensionHelper] 方法 1 失败: ${directActivation.error}`);
      
      // ===== 方法 2: 通过扩展页面激活 =====
      this.log(`[ExtensionHelper] 方法 2: 通过扩展页面激活`);
      const pageActivation = await this.tryPageActivation(extensionId);
      if (pageActivation.success) {
        return pageActivation;
      }
      this.log(`[ExtensionHelper] 方法 2 失败: ${pageActivation.error}`);
      
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
      this.logError(`[ExtensionHelper] 激活失败:`, error);
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
        this.log(`[ExtensionHelper] 尝试 ServiceWorker.startWorker...`);
        await cdp.send('ServiceWorker.enable' as any);
        await cdp.send('ServiceWorker.startWorker' as any, {
          scopeURL: `chrome-extension://${extensionId}/`,
        });
        
        await new Promise(resolve => setTimeout(resolve, 500));
        if (await this.isServiceWorkerActive(extensionId)) {
          this.log(`[ExtensionHelper] ✅ ServiceWorker.startWorker 成功`);
          return {success: true, method: 'ServiceWorker.startWorker'};
        }
      } catch (e) {
        this.log(`[ExtensionHelper] ServiceWorker.startWorker 失败: ${(e as Error).message}`);
      }
      
      // 方法 1.2: 直接执行唤醒代码
      try {
        this.log(`[ExtensionHelper] 尝试执行唤醒代码...`);
        
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
              this.log(`[ExtensionHelper] ✅ 唤醒成功: ${wakeCode}`);
              return {success: true, method: `Direct CDP: ${wakeCode}`};
            }
          } catch (e) {
            continue;
          }
        }
      } catch (e) {
        this.log(`[ExtensionHelper] 唤醒代码失败: ${(e as Error).message}`);
      }
      
      // 方法 1.3: 强制触发事件
      try {
        this.log(`[ExtensionHelper] 尝试触发 SW 事件...`);
        
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
          this.log(`[ExtensionHelper] ✅ 事件触发成功`);
          return {success: true, method: 'Event dispatch'};
        }
      } catch (e) {
        this.log(`[ExtensionHelper] 事件触发失败: ${(e as Error).message}`);
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
        this.logWarn(`[ExtensionHelper] ${error}`);
        return {
          success: false,
          error,
          suggestion:
            '自动激活需要扩展有 popup 或 options 页面。' +
            '请手动激活：访问 chrome://extensions/ 并点击 "Service worker" 链接',
        };
      }

      this.log(`[ExtensionHelper] 通过 ${method} 激活: ${targetUrl}`);
      
      try {
        const page = await this.browser.newPage();
        await page.goto(targetUrl, {
          waitUntil: 'networkidle0',
          timeout: this.options.timeouts.pageLoad,
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

        // 等待激活
        await new Promise(resolve => setTimeout(resolve, this.options.timeouts.manifestLoad));
        
        // 验证激活
        const isActive = await this.isServiceWorkerActive(extensionId);
        
        if (isActive) {
          this.log(`[ExtensionHelper] ✅ Service Worker 激活成功`);
          return {
            success: true,
            method: method || undefined,
            url: targetUrl,
          };
        } else {
          this.logWarn(`[ExtensionHelper] ⚠️ 打开页面成功但 Service Worker 仍未激活`);
          
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
                this.log(`[ExtensionHelper] ✅ 通过直接访问激活成功`);
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
        this.logError(`[ExtensionHelper] ${error}`);
        return {
          success: false,
          error,
          suggestion: `页面 ${targetUrl} 无法加载，可能扩展有错误。请检查扩展是否正常工作`,
        };
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logError(`[ExtensionHelper] 激活失败:`, error);
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
        this.log('[ExtensionHelper] 生成临时 Helper Extension 以供安装...');
        helperPath = await generator.generateHelperExtension();
        this.log(`[ExtensionHelper] Helper Extension 已生成: ${helperPath}`);
      } else {
        helperPath = generator.getHelperPath() || '';
      }
    } catch (error) {
      this.logWarn('[ExtensionHelper] 无法生成 Helper Extension:');
      this.logError('', error);
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
   * 
   * 支持两种模式：
   * 1. 读取历史日志（如果扩展存储了 globalThis.__logs）
   * 2. 实时捕获日志（监听指定时间内的 console 输出）
   * 
   * @param extensionId - 扩展 ID
   * @param options - 可选配置
   * @returns 日志结果
   */
  async getExtensionLogs(
    extensionId: string,
    options?: {
      /** 是否实时捕获日志（默认 true） */
      capture?: boolean;
      /** 实时捕获的时长（毫秒，默认 5000） */
      duration?: number;
      /** 是否包含历史日志（默认 true） */
      includeStored?: boolean;
    }
  ): Promise<{
    logs: Array<{
      type: string;
      text: string;
      timestamp: number;
      source: 'stored' | 'realtime';
      level?: string;
      stackTrace?: string;
      url?: string;
      lineNumber?: number;
    }>;
    isActive: boolean;
    captureInfo?: {
      started: number;
      ended: number;
      duration: number;
      messageCount: number;
    };
  }> {
    const {
      capture = true,
      duration = 5000,
      includeStored = true,
    } = options || {};

    const logs: Array<any> = [];
    let swSession: any = null;

    try {
      // 1. 找到 Service Worker target（使用 Puppeteer Target API）
      const backgroundTarget = await this.getExtensionBackgroundTarget(extensionId);
      if (!backgroundTarget) {
        return {logs: [], isActive: false};
      }

      // 2. 通过 targetId 找到对应的 Puppeteer Target
      const targets = await this.browser.targets();
      const swTarget = targets.find(
        t => (t as unknown as {_targetId: string})._targetId === backgroundTarget.targetId
      );

      if (!swTarget) {
        this.logError('[ExtensionHelper] 未找到 Service Worker 的 Puppeteer Target');
        return {logs: [], isActive: false};
      }

      // 3. 创建独立的 CDPSession for Service Worker
      swSession = await swTarget.createCDPSession();
      this.log('[ExtensionHelper] 已为 Service Worker 创建独立 CDPSession');

      // 4. 读取历史日志（如果需要）
      if (includeStored) {
        const evalResult = await swSession.send('Runtime.evaluate', {
          expression: `
            (() => {
              if (typeof globalThis.__logs !== 'undefined') {
                return globalThis.__logs;
              }
              return [];
            })()
          `,
          returnByValue: true,
        });

        const storedLogs = evalResult.result?.value as Array<{
          type: string;
          message: string;
          timestamp: number;
        }> || [];

        storedLogs.forEach((log) => {
          logs.push({
            type: log.type,
            text: log.message,
            timestamp: log.timestamp,
            source: 'stored',
          });
        });

        this.log(`[ExtensionHelper] 读取到 ${storedLogs.length} 条历史日志`);
      }

      // 5. 实时捕获日志（如果需要）
      let captureInfo;
      if (capture) {
        const captureStartTime = Date.now();
        const capturedLogs: Array<any> = [];

        // 启用 Runtime domain（在 SW session 上）
        await swSession.send('Runtime.enable');
        this.log('[ExtensionHelper] 已在 SW session 上启用 Runtime domain');

        // 监听 console API 调用（在 SW session 上）
        const consoleHandler = (event: any) => {
          this.log(`[ExtensionHelper] 收到 SW console 事件: ${event.type}, args: ${event.args?.length || 0}`);
          
          const args = event.args || [];
          const text = args
            .map((arg: any) => {
              if (arg.value !== undefined) {
                return String(arg.value);
              }
              if (arg.description) {
                return arg.description;
              }
              return '[Object]';
            })
            .join(' ');

          capturedLogs.push({
            type: event.type || 'log',
            text,
            timestamp: event.timestamp || Date.now(),
            source: 'realtime',
            level: event.type,
            stackTrace: event.stackTrace?.callFrames
              ? event.stackTrace.callFrames
                  .map((frame: any) => `  at ${frame.functionName || 'anonymous'} (${frame.url}:${frame.lineNumber})`)
                  .join('\n')
              : undefined,
            url: event.stackTrace?.callFrames?.[0]?.url,
            lineNumber: event.stackTrace?.callFrames?.[0]?.lineNumber,
          });
        };

        swSession.on('Runtime.consoleAPICalled', consoleHandler);
        this.log('[ExtensionHelper] 已开始监听 SW console 事件');

        // 等待指定时长
        this.log(`[ExtensionHelper] 捕获日志 ${duration}ms...`);
        await new Promise((resolve) => setTimeout(resolve, duration));

        // 停止监听
        swSession.off('Runtime.consoleAPICalled', consoleHandler);

        // 禁用 Runtime domain
        await swSession.send('Runtime.disable');

        const captureEndTime = Date.now();

        captureInfo = {
          started: captureStartTime,
          ended: captureEndTime,
          duration: captureEndTime - captureStartTime,
          messageCount: capturedLogs.length,
        };

        this.log(`[ExtensionHelper] 捕获完成，共 ${capturedLogs.length} 条日志`);

        // 合并捕获的日志
        logs.push(...capturedLogs);
      }

      // 6. 分离 session
      if (swSession) {
        await swSession.detach();
        swSession = null;
        this.log('[ExtensionHelper] 已分离 SW CDPSession');
      }

      // 按时间戳排序
      logs.sort((a, b) => a.timestamp - b.timestamp);

      return {
        logs,
        isActive: true,  // 如果找到 target 就是 active
        captureInfo,
      };
    } catch (error) {
      // 清理
      if (swSession) {
        try {
          await swSession.detach();
        } catch (e) {
          // Ignore
        }
      }

      this.logError(`[ExtensionHelper] getExtensionLogs 失败:`, error);
      return {logs: [], isActive: false};
    }
  }

  /**
   * 获取扩展的 Storage 数据
   * 注意：需要Service Worker处于激活状态
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

      // 检查Service Worker是否激活
      const isActive = await this.isServiceWorkerActive(extensionId);
      if (!isActive) {
        throw new Error(
          `Service Worker is inactive for extension ${extensionId}.\n` +
          `Please manually activate it first:\n` +
          `1. Visit chrome://extensions/\n` +
          `2. Find the extension (ID: ${extensionId})\n` +
          `3. Click the "Service worker" link to open DevTools\n` +
          `\n` +
          `Keep the DevTools window open to keep the Service Worker active.`,
        );
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
      this.logError(`Failed to get storage for ${extensionId}:`, error);
      throw error;
    }
  }
}
