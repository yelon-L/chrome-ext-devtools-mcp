/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * 循环缓冲区（固定大小）
 *
 * 用于高效存储最近的 N 个数据点，避免数组 shift() 的 O(n) 开销
 * 适用场景：性能监控、滑动窗口统计
 */
export class CircularBuffer<T> {
  private buffer: T[];
  private index = 0;
  private count = 0;
  private readonly capacity: number;

  /**
   * @param capacity 缓冲区容量（最多存储多少个元素）
   */
  constructor(capacity: number) {
    if (capacity <= 0) {
      throw new Error('Capacity must be positive');
    }
    this.capacity = capacity;
    this.buffer = new Array(capacity);
  }

  /**
   * 添加元素到缓冲区
   *
   * 时间复杂度: O(1)
   */
  push(item: T): void {
    this.buffer[this.index] = item;
    this.index = (this.index + 1) % this.capacity;

    if (this.count < this.capacity) {
      this.count++;
    }
  }

  /**
   * 获取所有有效元素（按插入顺序）
   *
   * 时间复杂度: O(n)
   */
  getAll(): T[] {
    if (this.count < this.capacity) {
      // 未满：直接返回前 count 个元素
      return this.buffer.slice(0, this.count);
    } else {
      // 已满：需要重新排序
      return [
        ...this.buffer.slice(this.index),
        ...this.buffer.slice(0, this.index),
      ];
    }
  }

  /**
   * 遍历所有元素
   *
   * 时间复杂度: O(n)
   */
  forEach(callback: (item: T, index: number) => void): void {
    for (let i = 0; i < this.count; i++) {
      callback(this.buffer[i], i);
    }
  }

  /**
   * 计算平均值（仅适用于数字类型）
   *
   * 时间复杂度: O(n)
   */
  average(): number {
    if (this.count === 0) return 0;

    let sum = 0;
    for (let i = 0; i < this.count; i++) {
      sum += this.buffer[i] as number;
    }

    return sum / this.count;
  }

  /**
   * 计算总和（仅适用于数字类型）
   */
  sum(): number {
    let sum = 0;
    for (let i = 0; i < this.count; i++) {
      sum += this.buffer[i] as number;
    }
    return sum;
  }

  /**
   * 计算最小值（仅适用于数字类型）
   */
  min(): number {
    if (this.count === 0) return NaN;

    let min = this.buffer[0] as number;
    for (let i = 1; i < this.count; i++) {
      const val = this.buffer[i] as number;
      if (val < min) min = val;
    }
    return min;
  }

  /**
   * 计算最大值（仅适用于数字类型）
   */
  max(): number {
    if (this.count === 0) return NaN;

    let max = this.buffer[0] as number;
    for (let i = 1; i < this.count; i++) {
      const val = this.buffer[i] as number;
      if (val > max) max = val;
    }
    return max;
  }

  /**
   * 获取当前元素数量
   */
  size(): number {
    return this.count;
  }

  /**
   * 获取缓冲区容量
   */
  getCapacity(): number {
    return this.capacity;
  }

  /**
   * 检查缓冲区是否已满
   */
  isFull(): boolean {
    return this.count === this.capacity;
  }

  /**
   * 检查缓冲区是否为空
   */
  isEmpty(): boolean {
    return this.count === 0;
  }

  /**
   * 清空缓冲区
   */
  clear(): void {
    this.index = 0;
    this.count = 0;
  }

  /**
   * 获取统计信息
   */
  getStats(): {
    count: number;
    capacity: number;
    utilization: number;
    average?: number;
    min?: number;
    max?: number;
  } {
    const stats = {
      count: this.count,
      capacity: this.capacity,
      utilization: (this.count / this.capacity) * 100,
    };

    // 如果是数字类型，添加统计信息
    if (this.count > 0 && typeof this.buffer[0] === 'number') {
      return {
        ...stats,
        average: this.average(),
        min: this.min(),
        max: this.max(),
      };
    }

    return stats;
  }
}
