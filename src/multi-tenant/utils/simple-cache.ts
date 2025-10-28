/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
/**
 * 简单的内存缓存，带TTL支持和LRU淘汰策略
 *
 * 特性：
 * - TTL（生存时间）支持
 * - LRU（最近最少使用）淘汰
 * - 命中率统计
 * - 自动过期清理
 */

export interface CacheEntry<T> {
  value: T;
  expires: number;
}

export class SimpleCache<T = unknown> {
  private cache = new Map<string, CacheEntry<T>>();
  private defaultTTL: number;
  private maxSize: number;

  // 命中率统计
  private hits = 0;
  private misses = 0;

  /**
   * @param defaultTTL 默认过期时间（毫秒）
   * @param maxSize 最大缓存条目数
   */
  constructor(defaultTTL = 60000, maxSize = 1000) {
    this.defaultTTL = defaultTTL;
    this.maxSize = maxSize;
  }

  /**
   * 设置缓存
   *
   * 如果key已存在，会先删除再插入（更新LRU顺序）
   * 如果缓存已满，删除最早插入的条目（Map的第一个元素）
   */
  set(key: string, value: T, ttl?: number): void {
    const expires = Date.now() + (ttl ?? this.defaultTTL);

    // 如果已存在，先删除（这样重新插入会移到末尾，实现LRU）
    if (this.cache.has(key)) {
      this.cache.delete(key);
    }

    // 如果超过最大大小，删除最早插入的条目（Map的第一个）
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) {
        this.cache.delete(firstKey);
      }
    }

    this.cache.set(key, {value, expires});
  }

  /**
   * 获取缓存
   *
   * 如果命中且未过期，会更新访问顺序（LRU）
   */
  get(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) {
      this.misses++;
      return null;
    }

    // 检查是否过期
    if (Date.now() > entry.expires) {
      this.cache.delete(key);
      this.misses++;
      return null;
    }

    this.hits++;

    // 删除后重新插入，维护LRU访问顺序
    // Map保证插入顺序，删除后重新插入会移到末尾
    this.cache.delete(key);
    this.cache.set(key, entry);

    return entry.value;
  }

  /**
   * 获取或设置缓存（如果缓存不存在，调用 factory 函数）
   */
  async getOrSet(
    key: string,
    factory: () => Promise<T>,
    ttl?: number,
  ): Promise<T> {
    const cached = this.get(key);
    if (cached !== null) {
      return cached;
    }

    const value = await factory();
    this.set(key, value, ttl);
    return value;
  }

  /**
   * 删除缓存
   */
  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  /**
   * 清除所有缓存
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * 清除过期的缓存
   */
  clearExpired(): number {
    const now = Date.now();
    let count = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expires) {
        this.cache.delete(key);
        count++;
      }
    }

    return count;
  }

  /**
   * 获取缓存大小
   */
  size(): number {
    return this.cache.size;
  }

  /**
   * 获取缓存统计信息
   */
  getStats(): {
    size: number;
    maxSize: number;
    utilization: number;
    hits: number;
    misses: number;
    hitRate: number;
    total: number;
  } {
    const total = this.hits + this.misses;
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      utilization: (this.cache.size / this.maxSize) * 100,
      hits: this.hits,
      misses: this.misses,
      hitRate: total > 0 ? (this.hits / total) * 100 : 0,
      total,
    };
  }

  /**
   * 重置统计信息
   */
  resetStats(): void {
    this.hits = 0;
    this.misses = 0;
  }
}
