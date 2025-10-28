/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {Page, CDPSession} from 'puppeteer-core';

/**
 * CDP Session Manager
 *
 * 管理 Chrome DevTools Protocol sessions 的生命周期
 * 为每个页面创建和维护 CDP session
 */
export class CDPSessionManager {
  private sessions = new WeakMap<Page, CDPSession>();
  private sessionPromises = new WeakMap<Page, Promise<CDPSession>>();

  /**
   * 为页面创建或获取 CDP session
   */
  async getOrCreateSession(page: Page): Promise<CDPSession> {
    // 如果已有 session，直接返回
    const existing = this.sessions.get(page);
    if (existing) {
      return existing;
    }

    // 如果正在创建，等待创建完成
    const pending = this.sessionPromises.get(page);
    if (pending) {
      return pending;
    }

    // 创建新 session
    const promise = this.createSession(page);
    this.sessionPromises.set(page, promise);

    try {
      const session = await promise;
      this.sessions.set(page, session);
      this.sessionPromises.delete(page);
      return session;
    } catch (error) {
      this.sessionPromises.delete(page);
      throw error;
    }
  }

  /**
   * 创建 CDP session 并启用必要的 domains
   */
  private async createSession(page: Page): Promise<CDPSession> {
    const client = await page.target().createCDPSession();

    try {
      // 启用 Runtime domain（用于 console 和对象检查）
      await client.send('Runtime.enable');

      // 启用 Log domain（用于系统日志）
      await client.send('Log.enable');

      // 监听 session 断开
      client.on('sessionattached', () => {
        console.log('[CDPSessionManager] Session attached');
      });

      client.on('disconnected', () => {
        console.log('[CDPSessionManager] Session disconnected');
        this.sessions.delete(page);
      });

      return client;
    } catch (error) {
      // 如果启用失败，清理 session
      await client.detach().catch(() => {
        // Ignore detach errors
      });
      throw error;
    }
  }

  /**
   * 获取已存在的 session（不创建新的）
   */
  getSession(page: Page): CDPSession | undefined {
    return this.sessions.get(page);
  }

  /**
   * 断开页面的 CDP session
   */
  async detachSession(page: Page): Promise<void> {
    const session = this.sessions.get(page);
    if (session) {
      this.sessions.delete(page);
      await session.detach().catch(() => {
        // Ignore detach errors
      });
    }
  }

  /**
   * 断开所有 sessions
   */
  async detachAll(): Promise<void> {
    // WeakMap 不支持迭代，所以无法主动清理
    // sessions 会在页面被垃圾回收时自动清理
  }
}
