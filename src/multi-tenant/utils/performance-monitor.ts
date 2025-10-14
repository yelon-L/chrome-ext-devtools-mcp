/**
 * 性能监控工具
 */

/**
 * API 调用统计
 */
export interface ApiStats {
  endpoint: string;
  method: string;
  count: number;
  totalTime: number;
  avgTime: number;
  minTime: number;
  maxTime: number;
  errors: number;
  lastCalled: number;
}

/**
 * 性能监控器
 */
export class PerformanceMonitor {
  private stats = new Map<string, ApiStats>();
  private maxEntries: number;

  constructor(maxEntries: number = 1000) {
    this.maxEntries = maxEntries;
  }

  /**
   * 记录 API 调用
   */
  record(endpoint: string, method: string, duration: number, isError: boolean = false): void {
    const key = `${method} ${endpoint}`;
    const existing = this.stats.get(key);

    if (existing) {
      existing.count++;
      existing.totalTime += duration;
      existing.avgTime = existing.totalTime / existing.count;
      existing.minTime = Math.min(existing.minTime, duration);
      existing.maxTime = Math.max(existing.maxTime, duration);
      existing.lastCalled = Date.now();
      if (isError) {
        existing.errors++;
      }
    } else {
      // 限制条目数量
      if (this.stats.size >= this.maxEntries) {
        // 删除最久未使用的条目
        let oldestKey: string | null = null;
        let oldestTime = Date.now();
        
        for (const [k, v] of this.stats.entries()) {
          if (v.lastCalled < oldestTime) {
            oldestTime = v.lastCalled;
            oldestKey = k;
          }
        }
        
        if (oldestKey) {
          this.stats.delete(oldestKey);
        }
      }

      this.stats.set(key, {
        endpoint,
        method,
        count: 1,
        totalTime: duration,
        avgTime: duration,
        minTime: duration,
        maxTime: duration,
        errors: isError ? 1 : 0,
        lastCalled: Date.now(),
      });
    }
  }

  /**
   * 获取所有统计
   */
  getStats(): ApiStats[] {
    return Array.from(this.stats.values());
  }

  /**
   * 获取热门端点（按调用次数排序）
   */
  getTopEndpoints(limit: number = 10): ApiStats[] {
    return this.getStats()
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);
  }

  /**
   * 获取最慢端点（按平均响应时间排序）
   */
  getSlowestEndpoints(limit: number = 10): ApiStats[] {
    return this.getStats()
      .sort((a, b) => b.avgTime - a.avgTime)
      .slice(0, limit);
  }

  /**
   * 获取错误率最高的端点
   */
  getHighErrorRateEndpoints(limit: number = 10): ApiStats[] {
    return this.getStats()
      .filter(s => s.errors > 0)
      .sort((a, b) => {
        const errorRateA = a.errors / a.count;
        const errorRateB = b.errors / b.count;
        return errorRateB - errorRateA;
      })
      .slice(0, limit);
  }

  /**
   * 清除所有统计
   */
  clear(): void {
    this.stats.clear();
  }

  /**
   * 获取统计摘要
   */
  getSummary(): {
    totalRequests: number;
    totalErrors: number;
    avgResponseTime: number;
    uniqueEndpoints: number;
  } {
    const stats = this.getStats();
    const totalRequests = stats.reduce((sum, s) => sum + s.count, 0);
    const totalErrors = stats.reduce((sum, s) => sum + s.errors, 0);
    const totalTime = stats.reduce((sum, s) => sum + s.totalTime, 0);
    
    return {
      totalRequests,
      totalErrors,
      avgResponseTime: totalRequests > 0 ? totalTime / totalRequests : 0,
      uniqueEndpoints: stats.length,
    };
  }
}
