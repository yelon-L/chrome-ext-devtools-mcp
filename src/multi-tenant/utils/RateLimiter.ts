/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * 限流器
 *
 * 使用令牌桶算法实现限流功能
 */

import {RateLimitError} from '../errors/AppError.js';

/**
 * 限流器选项
 */
export interface RateLimiterOptions {
  /** 最大令牌数（桶容量） */
  maxTokens: number;
  /** 令牌补充速率（tokens/second） */
  refillRate: number;
  /** 是否在无令牌时等待（默认：抛出错误） */
  waitOnExhaustion?: boolean;
}

/**
 * 令牌桶限流器
 */
export class RateLimiter {
  private tokens: number;
  private readonly maxTokens: number;
  private readonly refillRate: number;
  private readonly waitOnExhaustion: boolean;
  private lastRefill: number;

  constructor(options: RateLimiterOptions) {
    this.maxTokens = options.maxTokens;
    this.refillRate = options.refillRate;
    this.waitOnExhaustion = options.waitOnExhaustion ?? false;
    this.tokens = options.maxTokens;
    this.lastRefill = Date.now();
  }

  /**
   * 补充令牌
   */
  private refill(): void {
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000; // 转换为秒
    const tokensToAdd = elapsed * this.refillRate;

    this.tokens = Math.min(this.maxTokens, this.tokens + tokensToAdd);
    this.lastRefill = now;
  }

  /**
   * 尝试获取令牌
   *
   * @param tokens 需要的令牌数（默认：1）
   * @returns 是否成功获取
   */
  tryAcquire(tokens = 1): boolean {
    this.refill();

    if (this.tokens >= tokens) {
      this.tokens -= tokens;
      return true;
    }

    return false;
  }

  /**
   * 获取令牌（如果配置了等待，则会等待直到有令牌）
   *
   * @param tokens 需要的令牌数（默认：1）
   */
  async acquire(tokens = 1): Promise<void> {
    this.refill();

    if (this.tokens >= tokens) {
      this.tokens -= tokens;
      return;
    }

    if (!this.waitOnExhaustion) {
      throw new RateLimitError(
        this.maxTokens,
        Math.round(1000 / this.refillRate),
        {requested: tokens, available: this.tokens},
      );
    }

    // 等待令牌补充
    const waitTime = ((tokens - this.tokens) / this.refillRate) * 1000;
    await new Promise(resolve => setTimeout(resolve, waitTime));
    return this.acquire(tokens);
  }

  /**
   * 重置限流器
   */
  reset(): void {
    this.tokens = this.maxTokens;
    this.lastRefill = Date.now();
  }

  /**
   * 获取当前可用令牌数
   */
  getAvailableTokens(): number {
    this.refill();
    return Math.floor(this.tokens);
  }

  /**
   * 获取统计信息
   */
  getStats(): {
    maxTokens: number;
    availableTokens: number;
    utilization: number;
    refillRate: number;
  } {
    const availableTokens = this.getAvailableTokens();
    return {
      maxTokens: this.maxTokens,
      availableTokens,
      utilization: ((this.maxTokens - availableTokens) / this.maxTokens) * 100,
      refillRate: this.refillRate,
    };
  }
}

/**
 * 滑动窗口限流器
 *
 * 基于时间窗口的限流，精确控制时间窗口内的请求数
 */
export class SlidingWindowRateLimiter {
  private requests: number[] = [];
  private readonly maxRequests: number;
  private readonly windowMs: number;

  constructor(maxRequests: number, windowMs: number) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
  }

  /**
   * 清理过期的请求记录
   */
  private cleanup(): void {
    const now = Date.now();
    const cutoff = now - this.windowMs;
    this.requests = this.requests.filter(timestamp => timestamp > cutoff);
  }

  /**
   * 尝试获取许可
   */
  tryAcquire(): boolean {
    this.cleanup();

    if (this.requests.length < this.maxRequests) {
      this.requests.push(Date.now());
      return true;
    }

    return false;
  }

  /**
   * 获取许可（如果超限则抛出错误）
   */
  async acquire(): Promise<void> {
    if (!this.tryAcquire()) {
      throw new RateLimitError(this.maxRequests, this.windowMs);
    }
  }

  /**
   * 重置限流器
   */
  reset(): void {
    this.requests = [];
  }

  /**
   * 获取统计信息
   */
  getStats(): {
    maxRequests: number;
    currentRequests: number;
    utilization: number;
    windowMs: number;
  } {
    this.cleanup();
    return {
      maxRequests: this.maxRequests,
      currentRequests: this.requests.length,
      utilization: (this.requests.length / this.maxRequests) * 100,
      windowMs: this.windowMs,
    };
  }
}

/**
 * 每用户限流器
 *
 * 为每个用户维护独立的限流器
 */
export class PerUserRateLimiter {
  private limiters = new Map<string, RateLimiter | SlidingWindowRateLimiter>();
  private readonly createLimiter: () => RateLimiter | SlidingWindowRateLimiter;
  private readonly cleanupInterval: NodeJS.Timeout;

  constructor(
    limiterFactory: () => RateLimiter | SlidingWindowRateLimiter,
    cleanupIntervalMs = 60000, // 1分钟
  ) {
    this.createLimiter = limiterFactory;

    // 定期清理长时间未使用的限流器
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, cleanupIntervalMs);
  }

  /**
   * 获取或创建用户的限流器
   */
  private getLimiter(userId: string): RateLimiter | SlidingWindowRateLimiter {
    let limiter = this.limiters.get(userId);
    if (!limiter) {
      limiter = this.createLimiter();
      this.limiters.set(userId, limiter);
    }
    return limiter;
  }

  /**
   * 为用户获取许可
   */
  async acquire(userId: string): Promise<void> {
    const limiter = this.getLimiter(userId);
    await limiter.acquire();
  }

  /**
   * 为用户尝试获取许可
   */
  tryAcquire(userId: string): boolean {
    const limiter = this.getLimiter(userId);
    return limiter.tryAcquire();
  }

  /**
   * 重置用户的限流器
   */
  reset(userId: string): void {
    const limiter = this.limiters.get(userId);
    if (limiter) {
      limiter.reset();
    }
  }

  /**
   * 清理长时间未使用的限流器
   */
  private cleanup(): void {
    // 简单实现：清除所有限流器（可以优化为只清除闲置的）
    this.limiters.clear();
  }

  /**
   * 停止清理定时器
   */
  stop(): void {
    clearInterval(this.cleanupInterval);
  }

  /**
   * 获取统计信息
   */
  getStats(): {
    totalUsers: number;
    limiters: Map<string, unknown>;
  } {
    const stats = new Map<string, unknown>();
    for (const [userId, limiter] of this.limiters.entries()) {
      stats.set(userId, limiter.getStats());
    }
    return {
      totalUsers: this.limiters.size,
      limiters: stats,
    };
  }
}
