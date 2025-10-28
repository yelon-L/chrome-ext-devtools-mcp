/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * 错误详细程度配置
 *
 * 开发阶段：显示技术细节，帮助调试
 * 生产部署：隐藏技术细节，用户友好
 */

/**
 * 错误详细程度级别
 */
export enum ErrorVerbosity {
  /** 最小：仅显示用户友好消息 */
  MINIMAL = 'minimal',
  /** 标准：显示错误类型和基本信息 */
  STANDARD = 'standard',
  /** 详细：显示stack trace等技术细节 */
  VERBOSE = 'verbose',
}

/**
 * 错误详细程度配置
 */
class ErrorVerbosityConfig {
  private verbosity: ErrorVerbosity;

  constructor() {
    // 从环境变量读取配置
    const envVerbosity = process.env.ERROR_VERBOSITY?.toLowerCase();

    // 默认值：开发环境VERBOSE，生产环境MINIMAL
    const defaultVerbosity = this.isProduction()
      ? ErrorVerbosity.MINIMAL
      : ErrorVerbosity.VERBOSE;

    // 解析环境变量
    switch (envVerbosity) {
      case 'minimal':
        this.verbosity = ErrorVerbosity.MINIMAL;
        break;
      case 'standard':
        this.verbosity = ErrorVerbosity.STANDARD;
        break;
      case 'verbose':
        this.verbosity = ErrorVerbosity.VERBOSE;
        break;
      default:
        this.verbosity = defaultVerbosity;
    }
  }

  /**
   * 检查是否为生产环境
   */
  private isProduction(): boolean {
    return process.env.NODE_ENV === 'production';
  }

  /**
   * 获取当前详细程度
   */
  getVerbosity(): ErrorVerbosity {
    return this.verbosity;
  }

  /**
   * 设置详细程度（运行时修改）
   */
  setVerbosity(level: ErrorVerbosity): void {
    this.verbosity = level;
  }

  /**
   * 是否应该显示技术细节（如stack trace）
   */
  shouldShowTechnicalDetails(): boolean {
    return this.verbosity === ErrorVerbosity.VERBOSE;
  }

  /**
   * 是否应该显示错误类型
   */
  shouldShowErrorType(): boolean {
    return this.verbosity !== ErrorVerbosity.MINIMAL;
  }

  /**
   * 是否应该显示详细的错误消息
   */
  shouldShowDetailedMessage(): boolean {
    return this.verbosity === ErrorVerbosity.VERBOSE;
  }
}

// 单例实例
export const errorVerbosityConfig = new ErrorVerbosityConfig();

/**
 * 格式化错误信息（根据详细程度配置）
 */
export function formatErrorForUser(
  error: unknown,
  userFriendlyMessage: string,
  context?: Record<string, unknown>,
): string[] {
  const lines: string[] = [];
  const config = errorVerbosityConfig;

  // 1. 用户友好消息（始终显示）
  lines.push(userFriendlyMessage);

  // 2. 错误类型（STANDARD及以上）
  if (config.shouldShowErrorType() && error instanceof Error) {
    lines.push(`\n**Error Type**: ${error.name}`);
  }

  // 3. 详细错误消息（VERBOSE）
  if (config.shouldShowDetailedMessage() && error instanceof Error) {
    lines.push(`**Technical Message**: ${error.message}`);
  }

  // 4. 上下文信息（VERBOSE）
  if (config.shouldShowTechnicalDetails() && context) {
    lines.push(`\n**Context**:`);
    Object.entries(context).forEach(([key, value]) => {
      lines.push(`- ${key}: ${JSON.stringify(value)}`);
    });
  }

  // 5. Stack Trace（仅VERBOSE）
  if (
    config.shouldShowTechnicalDetails() &&
    error instanceof Error &&
    error.stack
  ) {
    lines.push(`\n**Stack Trace**:\n\`\`\`\n${error.stack}\n\`\`\``);
  }

  return lines;
}

/**
 * 快捷函数：检查是否为开发模式
 */
export function isDevelopmentMode(): boolean {
  return errorVerbosityConfig.getVerbosity() === ErrorVerbosity.VERBOSE;
}

/**
 * 快捷函数：检查是否为生产模式
 */
export function isProductionMode(): boolean {
  return errorVerbosityConfig.getVerbosity() === ErrorVerbosity.MINIMAL;
}
