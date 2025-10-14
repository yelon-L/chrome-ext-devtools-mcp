/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {Debugger} from 'debug';
import type {CDPSession, Page} from 'puppeteer-core';

/**
 * CDP 高频操作助手
 * 
 * 使用 CDP 协议直接实现高频操作，绕过 Puppeteer 中间层提升性能
 */
export class CdpOperations {
  #page: Page;
  #cdpSession?: CDPSession;
  #logger: Debugger;

  constructor(page: Page, logger: Debugger) {
    this.#page = page;
    this.#logger = logger;
  }

  /**
   * 初始化 CDP Session
   */
  async init(): Promise<void> {
    try {
      this.#cdpSession = await this.#page.target().createCDPSession();
      this.#logger('[CdpOperations] CDP Session 已初始化');
    } catch (error) {
      this.#logger(`[CdpOperations] 初始化失败: ${error}`);
      throw error;
    }
  }

  /**
   * 使用 CDP 直接导航
   * 
   * @param url - 目标 URL
   * @param options - 导航选项
   * @returns 是否成功
   */
  async navigate(
    url: string,
    options?: {
      waitUntil?: 'load' | 'domcontentloaded' | 'networkidle';
      timeout?: number;
    }
  ): Promise<{success: boolean; loaderId?: string; errorText?: string}> {
    if (!this.#cdpSession) {
      throw new Error('CDP Session 未初始化');
    }

    try {
      this.#logger(`[CdpOperations] 导航至: ${url}`);
      
      // 启用 Page domain
      await this.#cdpSession.send('Page.enable');
      
      // 发送导航命令
      const result = await this.#cdpSession.send('Page.navigate', {url});
      
      if (result.errorText) {
        this.#logger(`[CdpOperations] 导航失败: ${result.errorText}`);
        return {success: false, errorText: result.errorText};
      }

      // 根据 waitUntil 选项等待
      const waitUntil = options?.waitUntil || 'load';
      const timeout = options?.timeout || 30000;

      if (waitUntil === 'load') {
        await this.#waitForLoadEvent(timeout);
      } else if (waitUntil === 'domcontentloaded') {
        await this.#waitForDOMContentLoaded(timeout);
      } else if (waitUntil === 'networkidle') {
        await this.#waitForNetworkIdle(timeout);
      }

      this.#logger(`[CdpOperations] 导航成功: ${url}`);
      
      return {success: true, loaderId: result.loaderId};
    } catch (error) {
      this.#logger(`[CdpOperations] 导航异常: ${error}`);
      const errorText = error instanceof Error ? error.message : String(error);
      return {success: false, errorText};
    }
  }

  /**
   * 使用 CDP 直接执行 JavaScript
   * 
   * @param expression - JavaScript 表达式
   * @param options - 执行选项
   * @returns 执行结果
   */
  async evaluate(
    expression: string,
    options?: {
      awaitPromise?: boolean;
      returnByValue?: boolean;
      timeout?: number;
    }
  ): Promise<{
    success: boolean;
    result?: unknown;
    exceptionDetails?: unknown;
  }> {
    if (!this.#cdpSession) {
      throw new Error('CDP Session 未初始化');
    }

    try {
      this.#logger(`[CdpOperations] 执行脚本`);
      
      // 启用 Runtime domain
      await this.#cdpSession.send('Runtime.enable');
      
      const awaitPromise = options?.awaitPromise ?? true;
      const returnByValue = options?.returnByValue ?? true;

      // 执行脚本
      const result = await this.#cdpSession.send('Runtime.evaluate', {
        expression,
        awaitPromise,
        returnByValue,
      });

      if (result.exceptionDetails) {
        this.#logger(`[CdpOperations] 脚本执行出错`);
        return {
          success: false,
          exceptionDetails: result.exceptionDetails,
        };
      }

      this.#logger(`[CdpOperations] 脚本执行成功`);
      
      return {
        success: true,
        result: result.result.value,
      };
    } catch (error) {
      this.#logger(`[CdpOperations] 脚本执行异常: ${error}`);
      return {
        success: false,
        exceptionDetails: {
          text: error instanceof Error ? error.message : String(error),
        },
      };
    }
  }

  /**
   * 等待 load 事件
   */
  async #waitForLoadEvent(timeout: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error('等待 load 事件超时'));
      }, timeout);

      const listener = () => {
        clearTimeout(timer);
        this.#cdpSession?.off('Page.loadEventFired', listener);
        resolve();
      };

      this.#cdpSession?.on('Page.loadEventFired', listener);
    });
  }

  /**
   * 等待 DOMContentLoaded 事件
   */
  async #waitForDOMContentLoaded(timeout: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error('等待 DOMContentLoaded 事件超时'));
      }, timeout);

      const listener = () => {
        clearTimeout(timer);
        this.#cdpSession?.off('Page.domContentEventFired', listener);
        resolve();
      };

      this.#cdpSession?.on('Page.domContentEventFired', listener);
    });
  }

  /**
   * 等待网络空闲
   */
  async #waitForNetworkIdle(timeout: number): Promise<void> {
    if (!this.#cdpSession) {
      throw new Error('CDP Session 未初始化');
    }

    // 启用 Network domain
    await this.#cdpSession.send('Network.enable');

    return new Promise((resolve, reject) => {
      let inflightRequests = 0;
      let idleTimer: NodeJS.Timeout | undefined;
      const timeoutTimer = setTimeout(() => {
        cleanup();
        reject(new Error('等待网络空闲超时'));
      }, timeout);

      const cleanup = () => {
        clearTimeout(timeoutTimer);
        if (idleTimer) clearTimeout(idleTimer);
        this.#cdpSession?.off('Network.requestWillBeSent', onRequest);
        this.#cdpSession?.off('Network.loadingFinished', onResponse);
        this.#cdpSession?.off('Network.loadingFailed', onResponse);
      };

      const checkIdle = () => {
        if (inflightRequests === 0) {
          if (idleTimer) clearTimeout(idleTimer);
          idleTimer = setTimeout(() => {
            cleanup();
            resolve();
          }, 500); // 500ms 无请求算作空闲
        }
      };

      const onRequest = () => {
        inflightRequests++;
        if (idleTimer) {
          clearTimeout(idleTimer);
          idleTimer = undefined;
        }
      };

      const onResponse = () => {
        inflightRequests = Math.max(0, inflightRequests - 1);
        checkIdle();
      };

      this.#cdpSession?.on('Network.requestWillBeSent', onRequest);
      this.#cdpSession?.on('Network.loadingFinished', onResponse);
      this.#cdpSession?.on('Network.loadingFailed', onResponse);

      // 初始检查
      checkIdle();
    });
  }

  /**
   * 清理资源
   */
  async dispose(): Promise<void> {
    try {
      if (this.#cdpSession) {
        await this.#cdpSession.detach();
        this.#cdpSession = undefined;
      }
      this.#logger('[CdpOperations] 资源已清理');
    } catch (error) {
      this.#logger(`[CdpOperations] 清理资源失败: ${error}`);
    }
  }
}
