/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * JSONL 文件存储适配器
 *
 * 包装现有的 PersistentStoreV2，提供统一接口
 */

import {
  PersistentStoreV2,
  type UserRecordV2,
  type BrowserRecordV2,
} from './PersistentStoreV2.js';
import type {StorageAdapter} from './StorageAdapter.js';

/**
 * JSONL 存储适配器
 */
export class JSONLStorageAdapter implements StorageAdapter {
  private store: PersistentStoreV2;

  constructor(config: {
    dataDir: string;
    logFileName?: string;
    snapshotThreshold?: number;
    autoCompaction?: boolean;
  }) {
    this.store = new PersistentStoreV2(config);
  }

  async initialize(): Promise<void> {
    await this.store.initialize();
  }

  async close(): Promise<void> {
    await this.store.close();
  }

  // ============================================================================
  // 用户管理
  // ============================================================================

  async registerUser(user: UserRecordV2): Promise<void> {
    await this.store.registerUserByEmail(user.email, user.username);
  }

  async getUser(userId: string): Promise<UserRecordV2 | null> {
    return this.store.getUserById(userId) || null;
  }

  async getUserByEmail(email: string): Promise<UserRecordV2 | null> {
    return this.store.getUserByEmail(email) || null;
  }

  async getAllUsers(): Promise<UserRecordV2[]> {
    return this.store.getAllUsers();
  }

  async updateUsername(userId: string, username: string): Promise<void> {
    await this.store.updateUsername(userId, username);
  }

  async deleteUser(userId: string): Promise<void> {
    await this.store.deleteUser(userId);
  }

  // ============================================================================
  // 浏览器管理
  // ============================================================================

  async bindBrowser(browser: BrowserRecordV2): Promise<void> {
    await this.store.bindBrowser(
      browser.userId,
      browser.browserURL,
      browser.tokenName,
      browser.metadata?.description,
    );
  }

  async getBrowser(browserId: string): Promise<BrowserRecordV2 | null> {
    return this.store.getBrowserById(browserId) || null;
  }

  async getBrowserByToken(token: string): Promise<BrowserRecordV2 | null> {
    return this.store.getBrowserByToken(token) || null;
  }

  async getUserBrowsers(userId: string): Promise<BrowserRecordV2[]> {
    return this.store.listUserBrowsers(userId);
  }

  async getAllBrowsers(): Promise<BrowserRecordV2[]> {
    // 收集所有用户的浏览器
    const allBrowsers: BrowserRecordV2[] = [];
    for (const user of this.store.getAllUsers()) {
      allBrowsers.push(...this.store.listUserBrowsers(user.userId));
    }
    return allBrowsers;
  }

  async updateBrowser(
    browserId: string,
    updates: {browserURL?: string; description?: string},
  ): Promise<void> {
    await this.store.updateBrowser(browserId, updates);
  }

  async updateLastConnected(browserId: string): Promise<void> {
    await this.store.updateLastConnected(browserId);
  }

  async incrementToolCallCount(browserId: string): Promise<void> {
    await this.store.incrementToolCallCount(browserId);
  }

  async unbindBrowser(browserId: string): Promise<void> {
    await this.store.unbindBrowser(browserId);
  }

  // ============================================================================
  // 统计信息
  // ============================================================================

  async getStats(): Promise<{users: number; browsers: number}> {
    return this.store.getStats();
  }
}
