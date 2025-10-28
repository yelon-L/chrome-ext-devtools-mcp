/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * 统一存储访问层
 * 
 * 提供统一的同步接口，内部自动处理 JSONL 和 PostgreSQL 的差异
 */

import {SyncMethodNotSupportedError, StorageNotInitializedError} from '../errors/index.js';

import type {PersistentStoreV2, UserRecordV2, BrowserRecordV2} from './PersistentStoreV2.js';
import type {StorageAdapter} from './StorageAdapter.js';

/**
 * 统一存储适配器
 * 包装 PersistentStoreV2 使其符合 StorageAdapter 接口
 */
export class UnifiedStorage {
  private storeV2: PersistentStoreV2 | null = null;
  private storage: StorageAdapter | null = null;

  constructor(store: PersistentStoreV2 | StorageAdapter) {
    // 检查是否是 StorageAdapter（异步接口）
    // StorageAdapter 的 getUser 返回 Promise，而 PersistentStoreV2 的 getUserById 是同步的
    if ('getUser' in store && typeof (store as any).getUser === 'function') {
      // StorageAdapter (异步)
      this.storage = store as StorageAdapter;
    } else {
      // PersistentStoreV2 (同步)
      this.storeV2 = store as PersistentStoreV2;
    }
  }

  // ============================================================================
  // 用户管理 - 同步接口
  // ============================================================================

  hasEmail(email: string): boolean {
    if (this.storeV2) {
      return this.storeV2.hasEmail(email);
    }
    // PostgreSQL 模式：无法提供同步检查
    throw new SyncMethodNotSupportedError('hasEmail', 'hasEmailAsync');
  }

  getUserById(userId: string): UserRecordV2 | null {
    if (this.storeV2) {
      return this.storeV2.getUserById(userId);
    }
    throw new SyncMethodNotSupportedError('getUserById', 'getUserByIdAsync');
  }

  getAllUsers(): UserRecordV2[] {
    if (this.storeV2) {
      return this.storeV2.getAllUsers();
    }
    throw new SyncMethodNotSupportedError('getAllUsers', 'getAllUsersAsync');
  }

  listUserBrowsers(userId: string): BrowserRecordV2[] {
    if (this.storeV2) {
      return this.storeV2.listUserBrowsers(userId);
    }
    throw new SyncMethodNotSupportedError('listUserBrowsers', 'getUserBrowsersAsync');
  }

  getBrowserById(browserId: string): BrowserRecordV2 | null {
    if (this.storeV2) {
      return this.storeV2.getBrowserById(browserId);
    }
    throw new SyncMethodNotSupportedError('getBrowserById', 'getBrowserAsync');
  }

  getBrowserByToken(token: string): BrowserRecordV2 | null {
    if (this.storeV2) {
      return this.storeV2.getBrowserByToken(token);
    }
    throw new SyncMethodNotSupportedError('getBrowserByToken', 'getBrowserByTokenAsync');
  }

  getStats(): {users: number; browsers: number} {
    if (this.storeV2) {
      return this.storeV2.getStats();
    }
    throw new SyncMethodNotSupportedError('getStats', 'getStatsAsync');
  }

  // ============================================================================
  // 用户管理 - 异步接口
  // ============================================================================

  async hasEmailAsync(email: string): Promise<boolean> {
    if (this.storeV2) {
      return this.storeV2.hasEmail(email);
    }
    if (this.storage) {
      const user = await this.storage.getUserByEmail(email);
      return user !== null;
    }
    return false;
  }

  async registerUserByEmail(email: string, username?: string): Promise<UserRecordV2> {
    if (this.storeV2) {
      return this.storeV2.registerUserByEmail(email, username);
    }
    if (this.storage) {
      // 生成 userId 从邮箱
      const userId = email.split('@')[0].toLowerCase().replace(/[^a-z0-9-]/g, '-');
      const user: UserRecordV2 = {
        userId,
        email,
        username: username || email.split('@')[0],
        registeredAt: Date.now(),
      };
      await this.storage.registerUser(user);
      return user;
    }
    throw new StorageNotInitializedError();
  }

  async getUserByIdAsync(userId: string): Promise<UserRecordV2 | null> {
    if (this.storeV2) {
      return this.storeV2.getUserById(userId);
    }
    if (this.storage) {
      return this.storage.getUser(userId);
    }
    return null;
  }

  async getAllUsersAsync(): Promise<UserRecordV2[]> {
    if (this.storeV2) {
      return this.storeV2.getAllUsers();
    }
    if (this.storage) {
      return this.storage.getAllUsers();
    }
    return [];
  }

  async updateUsername(userId: string, username: string): Promise<void> {
    if (this.storeV2) {
      return this.storeV2.updateUsername(userId, username);
    }
    if (this.storage) {
      return this.storage.updateUsername(userId, username);
    }
  }

  async deleteUser(userId: string): Promise<string[]> {
    if (this.storeV2) {
      return this.storeV2.deleteUser(userId);
    }
    if (this.storage) {
      await this.storage.deleteUser(userId);
      return []; // PostgreSQL 使用级联删除
    }
    return [];
  }

  // ============================================================================
  // 浏览器管理 - 异步接口
  // ============================================================================

  async bindBrowser(
    userId: string,
    browserURL: string,
    tokenName?: string,
    description?: string
  ): Promise<BrowserRecordV2> {
    if (this.storeV2) {
      return this.storeV2.bindBrowser(userId, browserURL, tokenName, description);
    }
    if (this.storage) {
      const browserId = this.generateBrowserId();
      const token = this.generateToken();
      const browser: BrowserRecordV2 = {
        browserId,
        userId,
        browserURL,
        tokenName: tokenName || `browser-${Date.now()}`,
        token,
        createdAt: Date.now(),
      };
      if (description) {
        browser.metadata = {description};
      }
      await this.storage.bindBrowser(browser);
      return browser;
    }
    throw new StorageNotInitializedError();
  }

  async getUserBrowsersAsync(userId: string): Promise<BrowserRecordV2[]> {
    if (this.storeV2) {
      return this.storeV2.listUserBrowsers(userId);
    }
    if (this.storage) {
      return this.storage.getUserBrowsers(userId);
    }
    return [];
  }

  async getBrowserAsync(browserId: string): Promise<BrowserRecordV2 | null> {
    if (this.storeV2) {
      return this.storeV2.getBrowserById(browserId);
    }
    if (this.storage) {
      return this.storage.getBrowser(browserId);
    }
    return null;
  }

  async getBrowserByTokenAsync(token: string): Promise<BrowserRecordV2 | null> {
    if (this.storeV2) {
      return this.storeV2.getBrowserByToken(token);
    }
    if (this.storage) {
      return this.storage.getBrowserByToken(token);
    }
    return null;
  }

  async updateBrowser(
    browserId: string,
    data: {browserURL?: string; description?: string}
  ): Promise<void> {
    if (this.storeV2) {
      return this.storeV2.updateBrowser(browserId, data);
    }
    if (this.storage) {
      return this.storage.updateBrowser(browserId, data);
    }
  }

  async updateLastConnected(browserId: string): Promise<void> {
    if (this.storeV2) {
      return this.storeV2.updateLastConnected(browserId);
    }
    if (this.storage) {
      return this.storage.updateLastConnected(browserId);
    }
  }

  async incrementToolCallCount(browserId: string): Promise<void> {
    if (this.storeV2) {
      return this.storeV2.incrementToolCallCount(browserId);
    }
    if (this.storage) {
      return this.storage.incrementToolCallCount(browserId);
    }
  }

  async unbindBrowser(browserId: string): Promise<void> {
    if (this.storeV2) {
      return this.storeV2.unbindBrowser(browserId);
    }
    if (this.storage) {
      return this.storage.unbindBrowser(browserId);
    }
  }

  // ============================================================================
  // 统计信息
  // ============================================================================

  async getStatsAsync(): Promise<{users: number; browsers: number}> {
    if (this.storeV2) {
      return this.storeV2.getStats();
    }
    if (this.storage) {
      return this.storage.getStats();
    }
    return {users: 0, browsers: 0};
  }

  // ============================================================================
  // 生命周期
  // ============================================================================

  async initialize(): Promise<void> {
    if (this.storeV2) {
      return this.storeV2.initialize();
    }
    if (this.storage) {
      return this.storage.initialize();
    }
  }

  async close(): Promise<void> {
    if (this.storeV2) {
      return this.storeV2.close();
    }
    if (this.storage) {
      return this.storage.close();
    }
  }

  // ============================================================================
  // 辅助方法
  // ============================================================================

  private generateBrowserId(): string {
    return crypto.randomUUID();
  }

  private generateToken(): string {
    const randomBytes = crypto.getRandomValues(new Uint8Array(32));
    const hex = Array.from(randomBytes)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    return `mcp_${hex}`;
  }
}
