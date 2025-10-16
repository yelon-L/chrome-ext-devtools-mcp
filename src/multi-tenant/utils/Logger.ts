/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * 统一日志框架
 * 
 * 提供分级日志、格式化、可配置输出等功能
 */

/**
 * 日志级别
 */
export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  NONE = 999, // 禁用所有日志
}

/**
 * 日志级别名称映射
 */
const LOG_LEVEL_NAMES: Record<LogLevel, string> = {
  [LogLevel.DEBUG]: 'DEBUG',
  [LogLevel.INFO]: 'INFO',
  [LogLevel.WARN]: 'WARN',
  [LogLevel.ERROR]: 'ERROR',
  [LogLevel.NONE]: 'NONE',
};

/**
 * 日志级别颜色（ANSI）
 */
const LOG_LEVEL_COLORS: Record<LogLevel, string> = {
  [LogLevel.DEBUG]: '\x1b[36m', // Cyan
  [LogLevel.INFO]: '\x1b[32m',  // Green
  [LogLevel.WARN]: '\x1b[33m',  // Yellow
  [LogLevel.ERROR]: '\x1b[31m', // Red
  [LogLevel.NONE]: '',
};

const RESET_COLOR = '\x1b[0m';

/**
 * 日志格式化选项
 */
export interface LoggerOptions {
  /** 日志级别 */
  level?: LogLevel;
  /** 日志前缀 */
  prefix?: string;
  /** 是否启用颜色 */
  colors?: boolean;
  /** 是否显示时间戳 */
  timestamp?: boolean;
  /** 是否显示级别 */
  showLevel?: boolean;
  /** 自定义输出函数 */
  output?: (message: string, level: LogLevel) => void;
}

/**
 * 日志器类
 */
export class Logger {
  private level: LogLevel;
  private prefix: string;
  private colors: boolean;
  private timestamp: boolean;
  private showLevel: boolean;
  private output?: (message: string, level: LogLevel) => void;

  constructor(options: LoggerOptions = {}) {
    this.level = options.level ?? LogLevel.INFO;
    this.prefix = options.prefix ?? '';
    this.colors = options.colors ?? true;
    this.timestamp = options.timestamp ?? false;
    this.showLevel = options.showLevel ?? true;
    this.output = options.output;
  }

  /**
   * 设置日志级别
   */
  setLevel(level: LogLevel): void {
    this.level = level;
  }

  /**
   * 获取当前日志级别
   */
  getLevel(): LogLevel {
    return this.level;
  }

  /**
   * 格式化日志消息
   */
  private formatMessage(level: LogLevel, message: string, args: any[]): string {
    const parts: string[] = [];

    // 时间戳
    if (this.timestamp) {
      const now = new Date();
      const timeStr = now.toISOString();
      parts.push(`[${timeStr}]`);
    }

    // 日志级别
    if (this.showLevel) {
      const levelName = LOG_LEVEL_NAMES[level];
      if (this.colors) {
        const color = LOG_LEVEL_COLORS[level];
        parts.push(`${color}[${levelName}]${RESET_COLOR}`);
      } else {
        parts.push(`[${levelName}]`);
      }
    }

    // 前缀
    if (this.prefix) {
      parts.push(`[${this.prefix}]`);
    }

    // 消息
    parts.push(message);

    // 格式化参数
    if (args.length > 0) {
      const formattedArgs = args.map(arg => {
        if (typeof arg === 'object') {
          try {
            return JSON.stringify(arg, null, 2);
          } catch {
            return String(arg);
          }
        }
        return String(arg);
      });
      parts.push(...formattedArgs);
    }

    return parts.join(' ');
  }

  /**
   * 输出日志
   */
  private log(level: LogLevel, message: string, args: any[]): void {
    if (level < this.level) {
      return;
    }

    const formattedMessage = this.formatMessage(level, message, args);

    if (this.output) {
      this.output(formattedMessage, level);
    } else {
      // 默认输出到控制台
      switch (level) {
        case LogLevel.DEBUG:
          console.debug(formattedMessage);
          break;
        case LogLevel.INFO:
          console.log(formattedMessage);
          break;
        case LogLevel.WARN:
          console.warn(formattedMessage);
          break;
        case LogLevel.ERROR:
          console.error(formattedMessage);
          break;
      }
    }
  }

  /**
   * DEBUG 级别日志
   */
  debug(message: string, ...args: any[]): void {
    this.log(LogLevel.DEBUG, message, args);
  }

  /**
   * INFO 级别日志
   */
  info(message: string, ...args: any[]): void {
    this.log(LogLevel.INFO, message, args);
  }

  /**
   * WARN 级别日志
   */
  warn(message: string, ...args: any[]): void {
    this.log(LogLevel.WARN, message, args);
  }

  /**
   * ERROR 级别日志
   */
  error(message: string, error?: Error | any, ...args: any[]): void {
    if (error instanceof Error) {
      this.log(LogLevel.ERROR, message, [
        `\n  Error: ${error.message}`,
        `\n  Stack: ${error.stack}`,
        ...args,
      ]);
    } else if (error) {
      this.log(LogLevel.ERROR, message, [error, ...args]);
    } else {
      this.log(LogLevel.ERROR, message, args);
    }
  }

  /**
   * 创建子日志器（继承配置，添加新前缀）
   */
  child(prefix: string): Logger {
    return new Logger({
      level: this.level,
      prefix: this.prefix ? `${this.prefix}:${prefix}` : prefix,
      colors: this.colors,
      timestamp: this.timestamp,
      showLevel: this.showLevel,
      output: this.output,
    });
  }
}

/**
 * 全局日志器工厂
 */
class LoggerFactory {
  private defaultOptions: LoggerOptions = {
    level: LogLevel.INFO,
    colors: true,
    timestamp: false,
    showLevel: true,
  };

  /**
   * 设置全局默认选项
   */
  setDefaults(options: Partial<LoggerOptions>): void {
    this.defaultOptions = { ...this.defaultOptions, ...options };
  }

  /**
   * 创建日志器
   */
  create(prefix: string, options?: Partial<LoggerOptions>): Logger {
    return new Logger({
      ...this.defaultOptions,
      prefix,
      ...options,
    });
  }

  /**
   * 从环境变量获取日志级别
   */
  getLevelFromEnv(envVar: string = 'LOG_LEVEL'): LogLevel {
    const levelStr = process.env[envVar]?.toUpperCase();
    switch (levelStr) {
      case 'DEBUG':
        return LogLevel.DEBUG;
      case 'INFO':
        return LogLevel.INFO;
      case 'WARN':
        return LogLevel.WARN;
      case 'ERROR':
        return LogLevel.ERROR;
      case 'NONE':
        return LogLevel.NONE;
      default:
        return LogLevel.INFO;
    }
  }
}

/**
 * 全局日志器工厂实例
 */
export const loggerFactory = new LoggerFactory();

/**
 * 创建日志器的快捷方法
 */
export function createLogger(prefix: string, options?: Partial<LoggerOptions>): Logger {
  return loggerFactory.create(prefix, options);
}

/**
 * 设置全局日志级别
 */
export function setGlobalLogLevel(level: LogLevel): void {
  loggerFactory.setDefaults({ level });
}

/**
 * 从环境变量设置全局日志级别
 */
export function setLogLevelFromEnv(envVar: string = 'LOG_LEVEL'): void {
  const level = loggerFactory.getLevelFromEnv(envVar);
  setGlobalLogLevel(level);
}
