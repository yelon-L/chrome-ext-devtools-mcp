/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {Debugger} from 'debug';
import type {Browser, CDPSession, Page} from 'puppeteer-core';

/**
 * CDP Target 管理器
 *
 * 使用 CDP 协议直接管理 Target 生命周期，绕过 Puppeteer 的 newPage() 瓶颈
 */
export class CdpTargetManager {
  #browser: Browser;
  #logger: Debugger;
  #cdpSession?: CDPSession;
  #managedTargets = new Set<string>();

  constructor(browser: Browser, logger: Debugger) {
    this.#browser = browser;
    this.#logger = logger;
  }

  /**
   * 初始化 CDP Session
   */
  async init(): Promise<void> {
    try {
      // 获取浏览器级别的 CDP Session
      this.#cdpSession = await this.#browser.target().createCDPSession();
      this.#logger('[CdpTargetManager] CDP Session 已初始化');
    } catch (error) {
      this.#logger(`[CdpTargetManager] 初始化失败: ${error}`);
      throw error;
    }
  }

  /**
   * 使用 CDP 直接创建 Target
   *
   * @param url - 初始 URL，默认为 about:blank
   * @returns Target ID
   */
  async createTarget(url = 'about:blank'): Promise<string> {
    if (!this.#cdpSession) {
      throw new Error('CDP Session 未初始化，请先调用 init()');
    }

    try {
      this.#logger(`[CdpTargetManager] 创建 Target: ${url}`);

      const response = await this.#cdpSession.send('Target.createTarget', {
        url,
        newWindow: false,
      });

      const targetId = response.targetId;
      this.#managedTargets.add(targetId);

      this.#logger(`[CdpTargetManager] Target 创建成功: ${targetId}`);

      return targetId;
    } catch (error) {
      this.#logger(`[CdpTargetManager] 创建 Target 失败: ${error}`);
      throw error;
    }
  }

  /**
   * 从 Target ID 获取 Puppeteer Page 对象
   *
   * @param targetId - Target ID
   * @param timeout - 超时时间（毫秒）
   * @returns Page 对象
   */
  async getPageForTarget(targetId: string, timeout = 5000): Promise<Page> {
    try {
      this.#logger(`[CdpTargetManager] 获取 Page: ${targetId}`);

      // 等待 Puppeteer Target 出现
      const target = await this.#browser.waitForTarget(
        t => (t as {_targetId?: string})._targetId === targetId,
        {timeout},
      );

      const page = await target.page();

      if (!page) {
        throw new Error(`无法从 Target ${targetId} 获取 Page`);
      }

      this.#logger(`[CdpTargetManager] Page 获取成功: ${targetId}`);

      return page;
    } catch (error) {
      this.#logger(`[CdpTargetManager] 获取 Page 失败: ${error}`);
      throw error;
    }
  }

  /**
   * 使用 CDP 关闭 Target
   *
   * @param targetId - Target ID
   */
  async closeTarget(targetId: string): Promise<void> {
    if (!this.#cdpSession) {
      throw new Error('CDP Session 未初始化');
    }

    try {
      this.#logger(`[CdpTargetManager] 关闭 Target: ${targetId}`);

      await this.#cdpSession.send('Target.closeTarget', {targetId});
      this.#managedTargets.delete(targetId);

      this.#logger(`[CdpTargetManager] Target 已关闭: ${targetId}`);
    } catch (error) {
      this.#logger(`[CdpTargetManager] 关闭 Target 失败: ${error}`);
      throw error;
    }
  }

  /**
   * 获取所有管理的 Target IDs
   */
  getManagedTargets(): string[] {
    return Array.from(this.#managedTargets);
  }

  /**
   * 清理资源
   */
  async dispose(): Promise<void> {
    try {
      // 关闭所有管理的 Targets
      const closePromises = Array.from(this.#managedTargets).map(targetId =>
        this.closeTarget(targetId).catch(err => {
          this.#logger(
            `[CdpTargetManager] 关闭 Target ${targetId} 失败: ${err}`,
          );
        }),
      );

      await Promise.all(closePromises);

      // 分离 CDP Session
      if (this.#cdpSession) {
        await this.#cdpSession.detach();
        this.#cdpSession = undefined;
      }

      this.#logger('[CdpTargetManager] 资源已清理');
    } catch (error) {
      this.#logger(`[CdpTargetManager] 清理资源失败: ${error}`);
    }
  }
}
