/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  UserBrowserMapping,
  UserMetadata,
  RouterStats,
} from '../types/router.types.js';
import {logger} from '../../logger.js';

/**
 * 路由管理器
 * 
 * 负责管理用户到浏览器的映射关系
 */
export class RouterManager {
  /** 用户浏览器映射 */
  #userMappings = new Map<string, UserBrowserMapping>();

  /**
   * 注册用户
   * 
   * @param userId - 用户 ID
   * @param browserURL - 浏览器调试 URL
   * @param metadata - 用户元数据
   * @throws {Error} 当 browserURL 格式无效时
   */
  registerUser(
    userId: string,
    browserURL: string,
    metadata?: UserMetadata
  ): void {
    // 验证 browserURL 格式
    if (!this.#isValidBrowserURL(browserURL)) {
      throw new Error(`无效的浏览器 URL: ${browserURL}`);
    }

    // 验证 userId
    if (!userId || typeof userId !== 'string') {
      throw new Error('无效的用户 ID');
    }

    const mapping: UserBrowserMapping = {
      userId,
      browserURL,
      registeredAt: new Date(),
      metadata,
    };

    const isUpdate = this.#userMappings.has(userId);
    this.#userMappings.set(userId, mapping);

    if (isUpdate) {
      logger(`[RouterManager] 用户映射已更新: ${userId} -> ${browserURL}`);
    } else {
      logger(`[RouterManager] 用户已注册: ${userId} -> ${browserURL}`);
    }
  }

  /**
   * 注销用户
   * 
   * @param userId - 用户 ID
   * @returns 是否注销成功
   */
  unregisterUser(userId: string): boolean {
    const deleted = this.#userMappings.delete(userId);
    
    if (deleted) {
      logger(`[RouterManager] 用户已注销: ${userId}`);
    }
    
    return deleted;
  }

  /**
   * 获取用户的浏览器 URL
   * 
   * @param userId - 用户 ID
   * @returns 浏览器 URL，如果用户未注册则返回 undefined
   */
  getUserBrowserURL(userId: string): string | undefined {
    return this.#userMappings.get(userId)?.browserURL;
  }

  /**
   * 获取用户映射信息
   * 
   * @param userId - 用户 ID
   * @returns 用户映射信息，如果用户未注册则返回 undefined
   */
  getUserMapping(userId: string): UserBrowserMapping | undefined {
    return this.#userMappings.get(userId);
  }

  /**
   * 检查用户是否已注册
   * 
   * @param userId - 用户 ID
   * @returns 是否已注册
   */
  isUserRegistered(userId: string): boolean {
    return this.#userMappings.has(userId);
  }

  /**
   * 获取所有已注册用户
   * 
   * @returns 用户 ID 列表
   */
  getAllUsers(): string[] {
    return Array.from(this.#userMappings.keys());
  }

  /**
   * 获取所有用户映射
   * 
   * @returns 用户映射列表
   */
  getAllMappings(): UserBrowserMapping[] {
    return Array.from(this.#userMappings.values());
  }

  /**
   * 更新用户元数据
   * 
   * @param userId - 用户 ID
   * @param metadata - 新的元数据
   * @returns 是否更新成功
   */
  updateUserMetadata(userId: string, metadata: UserMetadata): boolean {
    const mapping = this.#userMappings.get(userId);
    if (!mapping) {
      return false;
    }

    mapping.metadata = {
      ...mapping.metadata,
      ...metadata,
    };

    logger(`[RouterManager] 用户元数据已更新: ${userId}`);

    return true;
  }

  /**
   * 清空所有映射
   */
  clearAll(): void {
    logger('[RouterManager] 清空所有用户映射');
    this.#userMappings.clear();
  }

  /**
   * 获取路由统计信息
   * 
   * @returns 统计信息
   */
  getStats(): RouterStats {
    return {
      totalUsers: this.#userMappings.size,
      users: this.getAllUsers(),
    };
  }

  /**
   * 验证浏览器 URL 格式
   * 
   * @param browserURL - 浏览器 URL
   * @returns 是否有效
   */
  #isValidBrowserURL(browserURL: string): boolean {
    try {
      const url = new URL(browserURL);
      return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
      return false;
    }
  }

  /**
   * 根据浏览器 URL 查找用户
   * 
   * @param browserURL - 浏览器 URL
   * @returns 用户 ID 列表
   */
  findUsersByBrowserURL(browserURL: string): string[] {
    const users: string[] = [];
    
    for (const [userId, mapping] of this.#userMappings) {
      if (mapping.browserURL === browserURL) {
        users.push(userId);
      }
    }
    
    return users;
  }

  /**
   * 导出映射数据（用于持久化）
   * 
   * @returns 映射数据的 JSON 字符串
   */
  export(): string {
    const mappings = Array.from(this.#userMappings.entries());
    return JSON.stringify(mappings, null, 2);
  }

  /**
   * 导入映射数据（从持久化恢复）
   * 
   * @param data - JSON 字符串
   */
  import(data: string): void {
    try {
      const mappings = JSON.parse(data) as Array<[string, UserBrowserMapping]>;
      
      for (const [userId, mapping] of mappings) {
        // 恢复 Date 对象
        mapping.registeredAt = new Date(mapping.registeredAt);
        this.#userMappings.set(userId, mapping);
      }
      
      logger(`[RouterManager] 导入 ${mappings.length} 个用户映射`);
    } catch (error) {
      logger(`[RouterManager] 导入失败: ${error}`);
      throw new Error('导入映射数据失败');
    }
  }
}
