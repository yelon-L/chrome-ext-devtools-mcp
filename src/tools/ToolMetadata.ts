/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * 工具元数据扩展
 *
 * 为工具添加更丰富的元数据支持，用于：
 * - 工具发现和过滤
 * - 限流和权限控制
 * - 监控和统计
 */

import type {ToolCategories} from './categories.js';

/**
 * 工具优先级
 */
export enum ToolPriority {
  LOW = 0,
  NORMAL = 1,
  HIGH = 2,
  CRITICAL = 3,
}

/**
 * 工具稳定性级别
 */
export enum ToolStability {
  /** 实验性功能，可能会变更 */
  EXPERIMENTAL = 'experimental',
  /** 测试版本 */
  BETA = 'beta',
  /** 稳定版本 */
  STABLE = 'stable',
  /** 已弃用 */
  DEPRECATED = 'deprecated',
}

/**
 * 扩展的工具元数据
 */
export interface ExtendedToolMetadata {
  /** 工具分类 */
  category: ToolCategories;

  /** 是否只读（不修改环境） */
  readOnlyHint: boolean;

  /** 标签（用于搜索和过滤） */
  tags?: string[];

  /** 优先级 */
  priority?: ToolPriority;

  /** 稳定性级别 */
  stability?: ToolStability;

  /** 限流配置 */
  rateLimit?: {
    /** 每秒最大请求数 */
    requestsPerSecond?: number;
    /** 每分钟最大请求数 */
    requestsPerMinute?: number;
    /** 每小时最大请求数 */
    requestsPerHour?: number;
  };

  /** 超时配置（毫秒） */
  timeout?: number;

  /** 所需权限 */
  requiredPermissions?: string[];

  /** 是否需要浏览器实例 */
  requiresBrowser?: boolean;

  /** 是否需要页面实例 */
  requiresPage?: boolean;

  /** 是否需要扩展环境 */
  requiresExtension?: boolean;

  /** 性能影响等级 (1-5, 5为最高) */
  performanceImpact?: 1 | 2 | 3 | 4 | 5;

  /** 是否可在后台运行 */
  canRunInBackground?: boolean;

  /** 示例用法 */
  examples?: Array<{
    description: string;
    params: Record<string, unknown>;
    expectedResult?: string;
  }>;

  /** 相关工具（推荐配合使用） */
  relatedTools?: string[];

  /** 版本信息 */
  version?: string;

  /** 作者信息 */
  author?: string;

  /** 变更日志 */
  changelog?: Array<{
    version: string;
    date: string;
    changes: string[];
  }>;
}

/**
 * 工具过滤条件
 */
export interface ToolFilter {
  /** 分类过滤 */
  categories?: ToolCategories[];

  /** 标签过滤（包含任一标签） */
  tags?: string[];

  /** 是否只读 */
  readOnly?: boolean;

  /** 优先级过滤 */
  minPriority?: ToolPriority;

  /** 稳定性过滤 */
  stability?: ToolStability[];

  /** 排除实验性功能 */
  excludeExperimental?: boolean;

  /** 排除已弃用功能 */
  excludeDeprecated?: boolean;

  /** 搜索关键词（匹配名称或描述） */
  search?: string;
}

/**
 * 工具使用统计
 */
export interface ToolUsageStats {
  /** 工具名称 */
  toolName: string;

  /** 调用次数 */
  callCount: number;

  /** 成功次数 */
  successCount: number;

  /** 失败次数 */
  errorCount: number;

  /** 平均执行时间（毫秒） */
  avgExecutionTime: number;

  /** 最后调用时间 */
  lastCalled: number;

  /** 错误详情 */
  recentErrors?: Array<{
    timestamp: number;
    error: string;
    params?: Record<string, unknown>;
  }>;
}

/**
 * 工具注册表
 */
export class ToolRegistry {
  private metadata = new Map<string, ExtendedToolMetadata>();
  private stats = new Map<string, ToolUsageStats>();

  /**
   * 注册工具元数据
   */
  register(toolName: string, metadata: ExtendedToolMetadata): void {
    this.metadata.set(toolName, metadata);

    // 初始化统计
    if (!this.stats.has(toolName)) {
      this.stats.set(toolName, {
        toolName,
        callCount: 0,
        successCount: 0,
        errorCount: 0,
        avgExecutionTime: 0,
        lastCalled: 0,
        recentErrors: [],
      });
    }
  }

  /**
   * 获取工具元数据
   */
  getMetadata(toolName: string): ExtendedToolMetadata | undefined {
    return this.metadata.get(toolName);
  }

  /**
   * 获取所有工具名称
   */
  getAllToolNames(): string[] {
    return Array.from(this.metadata.keys());
  }

  /**
   * 根据过滤条件获取工具
   */
  filter(filter: ToolFilter): string[] {
    const tools = this.getAllToolNames();

    return tools.filter(toolName => {
      const metadata = this.metadata.get(toolName);
      if (!metadata) return false;

      // 分类过滤
      if (filter.categories && !filter.categories.includes(metadata.category)) {
        return false;
      }

      // 标签过滤
      if (filter.tags && metadata.tags) {
        const hasTag = filter.tags.some(tag => metadata.tags!.includes(tag));
        if (!hasTag) return false;
      }

      // 只读过滤
      if (
        filter.readOnly !== undefined &&
        metadata.readOnlyHint !== filter.readOnly
      ) {
        return false;
      }

      // 优先级过滤
      if (filter.minPriority !== undefined) {
        const priority = metadata.priority ?? ToolPriority.NORMAL;
        if (priority < filter.minPriority) {
          return false;
        }
      }

      // 稳定性过滤
      if (filter.stability) {
        const stability = metadata.stability ?? ToolStability.STABLE;
        if (!filter.stability.includes(stability)) {
          return false;
        }
      }

      // 排除实验性
      if (
        filter.excludeExperimental &&
        metadata.stability === ToolStability.EXPERIMENTAL
      ) {
        return false;
      }

      // 排除已弃用
      if (
        filter.excludeDeprecated &&
        metadata.stability === ToolStability.DEPRECATED
      ) {
        return false;
      }

      return true;
    });
  }

  /**
   * 搜索工具
   */
  search(keyword: string): string[] {
    const lowerKeyword = keyword.toLowerCase();
    return this.getAllToolNames().filter(toolName => {
      return toolName.toLowerCase().includes(lowerKeyword);
    });
  }

  /**
   * 记录工具调用
   */
  recordCall(
    toolName: string,
    success: boolean,
    executionTime: number,
    error?: string,
  ): void {
    let stats = this.stats.get(toolName);
    if (!stats) {
      stats = {
        toolName,
        callCount: 0,
        successCount: 0,
        errorCount: 0,
        avgExecutionTime: 0,
        lastCalled: 0,
        recentErrors: [],
      };
      this.stats.set(toolName, stats);
    }

    stats.callCount++;
    if (success) {
      stats.successCount++;
    } else {
      stats.errorCount++;

      // 记录最近的错误（最多保留10个）
      if (!stats.recentErrors) {
        stats.recentErrors = [];
      }
      stats.recentErrors.unshift({
        timestamp: Date.now(),
        error: error || 'Unknown error',
      });
      stats.recentErrors = stats.recentErrors.slice(0, 10);
    }

    // 更新平均执行时间
    stats.avgExecutionTime =
      (stats.avgExecutionTime * (stats.callCount - 1) + executionTime) /
      stats.callCount;

    stats.lastCalled = Date.now();
  }

  /**
   * 获取工具统计
   */
  getStats(toolName: string): ToolUsageStats | undefined {
    return this.stats.get(toolName);
  }

  /**
   * 获取所有统计
   */
  getAllStats(): ToolUsageStats[] {
    return Array.from(this.stats.values());
  }

  /**
   * 获取最常用的工具
   */
  getMostUsed(limit = 10): ToolUsageStats[] {
    return this.getAllStats()
      .sort((a, b) => b.callCount - a.callCount)
      .slice(0, limit);
  }

  /**
   * 获取成功率最高的工具
   */
  getMostReliable(limit = 10, minCalls = 10): ToolUsageStats[] {
    return this.getAllStats()
      .filter(stat => stat.callCount >= minCalls)
      .sort((a, b) => {
        const aRate = a.successCount / a.callCount;
        const bRate = b.successCount / b.callCount;
        return bRate - aRate;
      })
      .slice(0, limit);
  }

  /**
   * 重置统计
   */
  resetStats(toolName?: string): void {
    if (toolName) {
      this.stats.delete(toolName);
    } else {
      this.stats.clear();
    }
  }
}

/**
 * 全局工具注册表实例
 */
export const toolRegistry = new ToolRegistry();
