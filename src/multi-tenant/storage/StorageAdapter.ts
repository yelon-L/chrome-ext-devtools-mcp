/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * 存储适配器接口
 *
 * 定义统一的存储接口，支持多种后端：
 * - JSONL 文件存储（默认）
 * - PostgreSQL 数据库
 * - 其他数据库（未来扩展）
 */

import type {UserRecordV2, BrowserRecordV2} from './PersistentStoreV2.js';

/**
 * 存储适配器接口
 */
export interface StorageAdapter {
  /**
   * 初始化存储
   */
  initialize(): Promise<void>;

  /**
   * 关闭存储
   */
  close(): Promise<void>;

  // ============================================================================
  // 用户管理
  // ============================================================================

  /**
   * 注册用户
   */
  registerUser(user: UserRecordV2): Promise<void>;

  /**
   * 获取用户（通过 userId）
   */
  getUser(userId: string): Promise<UserRecordV2 | null>;

  /**
   * 获取用户（通过邮箱）
   */
  getUserByEmail(email: string): Promise<UserRecordV2 | null>;

  /**
   * 获取所有用户
   */
  getAllUsers(): Promise<UserRecordV2[]>;

  /**
   * 更新用户名
   */
  updateUsername(userId: string, username: string): Promise<void>;

  /**
   * 删除用户
   */
  deleteUser(userId: string): Promise<void>;

  // ============================================================================
  // 浏览器管理
  // ============================================================================

  /**
   * 绑定浏览器
   */
  bindBrowser(browser: BrowserRecordV2): Promise<void>;

  /**
   * 获取浏览器（通过 browserId）
   */
  getBrowser(browserId: string): Promise<BrowserRecordV2 | null>;

  /**
   * 获取浏览器（通过 token）
   */
  getBrowserByToken(token: string): Promise<BrowserRecordV2 | null>;

  /**
   * 获取用户的所有浏览器
   */
  getUserBrowsers(userId: string): Promise<BrowserRecordV2[]>;

  /**
   * 获取所有浏览器
   */
  getAllBrowsers(): Promise<BrowserRecordV2[]>;

  /**
   * 更新浏览器
   */
  updateBrowser(
    browserId: string,
    updates: {
      browserURL?: string;
      description?: string;
    },
  ): Promise<void>;

  /**
   * 更新最后连接时间
   */
  updateLastConnected(browserId: string): Promise<void>;

  /**
   * 增加工具调用计数
   */
  incrementToolCallCount(browserId: string): Promise<void>;

  /**
   * 解绑浏览器
   */
  unbindBrowser(browserId: string): Promise<void>;

  // ============================================================================
  // 统计信息
  // ============================================================================

  /**
   * 获取统计信息
   */
  getStats(): Promise<{
    users: number;
    browsers: number;
  }>;
}

/**
 * 存储适配器工厂
 */
export class StorageAdapterFactory {
  /**
   * 创建存储适配器
   *
   * @param type 存储类型 ('jsonl' | 'postgresql')
   * @param config 配置
   */
  static async create(
    type: 'jsonl' | 'postgresql',
    config: unknown,
  ): Promise<StorageAdapter> {
    switch (type) {
      case 'jsonl': {
        const {JSONLStorageAdapter} = await import('./JSONLStorageAdapter.js');
        return new JSONLStorageAdapter(config as never);
      }
      case 'postgresql': {
        const {PostgreSQLStorageAdapter} = await import(
          './PostgreSQLStorageAdapter.js'
        );
        return new PostgreSQLStorageAdapter(config as never);
      }
      default:
        throw new Error(`Unsupported storage type: ${type}`);
    }
  }
}
