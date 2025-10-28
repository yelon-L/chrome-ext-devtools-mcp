/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  CDPSession,
  Page,
  Protocol,
  ConsoleMessage,
  JSHandle,
} from 'puppeteer-core';

import {EnhancedObjectSerializer} from '../formatters/EnhancedObjectSerializer.js';

/**
 * 控制台日志条目
 */
export interface ConsoleLog {
  type: string;
  args: unknown[];
  timestamp: number;
  executionContextId: number;
  stackTrace?: Protocol.Runtime.StackTrace;
  text: string;
  url?: string;
  lineNumber?: number;
  columnNumber?: number;
  source?: 'page' | 'worker' | 'service-worker' | 'iframe'; // 日志来源
}

/**
 * 增强的控制台日志收集器
 *
 * 使用 CDP Runtime.consoleAPICalled 捕获所有上下文的日志
 * 包括页面主上下文和 Content Script
 */
export class EnhancedConsoleCollector {
  private logs: ConsoleLog[] = [];
  private serializer = new EnhancedObjectSerializer();
  private isInitialized = false;
  private mainExecutionContextId: number | null = null;
  private frameExecutionContexts = new Map<number, string>(); // contextId -> frameUrl

  /**
   * 初始化日志收集
   */
  async init(page: Page, cdpSession: CDPSession): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      // 启用 Runtime domain
      await cdpSession.send('Runtime.enable');

      // 监听执行上下文创建（用于识别 iframe）
      cdpSession.on(
        'Runtime.executionContextCreated',
        (params: Protocol.Runtime.ExecutionContextCreatedEvent) => {
          const context = params.context;

          // 判断是否为 iframe
          // auxData.isDefault 为 true 表示主上下文，为 false 表示 iframe
          // auxData.frameId 存在且不等于主 frameId 也表示 iframe
          const isIframe =
            context.auxData && context.auxData.isDefault === false;

          if (isIframe) {
            // 这是 iframe 上下文
            this.frameExecutionContexts.set(
              context.id,
              context.origin || context.name || 'unknown',
            );
            console.log(
              `[EnhancedConsoleCollector] iframe context created: ${context.id}, origin: ${context.origin}, name: ${context.name}`,
            );
          } else {
            // 主上下文
            this.mainExecutionContextId = context.id;
            console.log(
              `[EnhancedConsoleCollector] Main context created: ${context.id}`,
            );
          }
        },
      );

      // 监听执行上下文销毁
      cdpSession.on(
        'Runtime.executionContextDestroyed',
        (params: Protocol.Runtime.ExecutionContextDestroyedEvent) => {
          this.frameExecutionContexts.delete(params.executionContextId);
        },
      );

      // 监听 console API 调用（页面主上下文 + Content Script + iframe）
      // Worker 日志由 Puppeteer 的 page.on('console') 处理
      cdpSession.on(
        'Runtime.consoleAPICalled',
        async (params: Protocol.Runtime.ConsoleAPICalledEvent) => {
          try {
            const log = await this.formatConsoleAPICall(params, cdpSession);

            // 判断日志来源
            if (this.frameExecutionContexts.has(params.executionContextId)) {
              // 来自 iframe
              log.source = 'iframe';
            } else {
              // 来自页面主上下文或 Content Script
              log.source = 'page';
            }

            this.logs.push(log);
          } catch (error) {
            console.error(
              '[EnhancedConsoleCollector] Failed to format log:',
              error,
            );
          }
        },
      );

      // 监听异常（页面主上下文）
      cdpSession.on(
        'Runtime.exceptionThrown',
        async (params: Protocol.Runtime.ExceptionThrownEvent) => {
          try {
            const log = await this.formatException(params, cdpSession);
            log.source = 'page';
            this.logs.push(log);
          } catch (error) {
            console.error(
              '[EnhancedConsoleCollector] Failed to format exception:',
              error,
            );
          }
        },
      );

      // 启用 Target domain 以监听 Worker
      try {
        await cdpSession.send('Target.setAutoAttach', {
          autoAttach: true,
          waitForDebuggerOnStart: false,
          flatten: true, // 使用 flatten 模式，Worker 日志会在主 session 上触发
        });

        // 监听 Worker 创建
        cdpSession.on(
          'Target.attachedToTarget',
          async (params: {
            targetInfo: {type: string; url: string};
            sessionId?: string;
            session?: CDPSession;
          }) => {
            const targetType = params.targetInfo.type;

            if (targetType === 'worker' || targetType === 'service_worker') {
              try {
                console.log(
                  `[EnhancedConsoleCollector] Worker detected: ${targetType}, URL: ${params.targetInfo.url}, sessionId: ${params.sessionId}`,
                );

                // Puppeteer 的 CDP 实现：params.session 可能不存在
                // 需要通过 sessionId 手动创建 session
                const workerSession = params.session;

                if (!workerSession && params.sessionId) {
                  // 尝试通过 sessionId 获取 session
                  // 注意：Puppeteer 的 CDPSession 不直接支持通过 sessionId 创建子 session
                  // 我们需要使用 flatten: true 模式，这样所有事件都会在主 session 上触发
                  console.log(
                    '[EnhancedConsoleCollector] Using flatten mode for worker logs',
                  );
                  return; // 在 flatten 模式下，Worker 日志会直接在主 session 上触发
                }

                if (!workerSession) {
                  console.error(
                    '[EnhancedConsoleCollector] No session for worker, skipping',
                  );
                  return;
                }

                // 为 Worker 启用 Runtime domain
                await workerSession.send('Runtime.enable');

                console.log(
                  `[EnhancedConsoleCollector] Worker attached successfully: ${targetType}`,
                );

                // 监听 Worker 的日志
                workerSession.on(
                  'Runtime.consoleAPICalled',
                  async (
                    workerParams: Protocol.Runtime.ConsoleAPICalledEvent,
                  ) => {
                    try {
                      const log = await this.formatConsoleAPICall(
                        workerParams,
                        workerSession,
                      );
                      log.source =
                        targetType === 'service_worker'
                          ? 'service-worker'
                          : 'worker';
                      this.logs.push(log);
                      console.log(
                        `[EnhancedConsoleCollector] Worker log captured: ${log.type} - ${log.text.substring(0, 50)}`,
                      );
                    } catch (error) {
                      console.error(
                        '[EnhancedConsoleCollector] Failed to format worker log:',
                        error,
                      );
                    }
                  },
                );

                // 监听 Worker 的异常
                workerSession.on(
                  'Runtime.exceptionThrown',
                  async (
                    workerParams: Protocol.Runtime.ExceptionThrownEvent,
                  ) => {
                    try {
                      const log = await this.formatException(
                        workerParams,
                        workerSession,
                      );
                      log.source =
                        targetType === 'service_worker'
                          ? 'service-worker'
                          : 'worker';
                      this.logs.push(log);
                      console.log(
                        `[EnhancedConsoleCollector] Worker exception captured: ${log.text.substring(0, 50)}`,
                      );
                    } catch (error) {
                      console.error(
                        '[EnhancedConsoleCollector] Failed to format worker exception:',
                        error,
                      );
                    }
                  },
                );
              } catch (error) {
                console.error(
                  '[EnhancedConsoleCollector] Failed to attach to worker:',
                  error,
                );
              }
            }
          },
        );
      } catch (error) {
        console.error(
          '[EnhancedConsoleCollector] Failed to enable Worker monitoring:',
          error,
        );
        // 继续执行，不影响页面日志收集
      }

      // 使用 Puppeteer 的 console 事件捕获 Worker 日志
      // 这是因为 Puppeteer 的 CDP 封装不会自动转发 Worker 的 CDP 事件
      page.on('console', async (msg: ConsoleMessage) => {
        try {
          const location = msg.location();

          // 只处理 Worker 日志（通过 URL 判断）
          if (this.isWorkerLog(location.url)) {
            const log = await this.formatPuppeteerConsoleMessage(msg);
            log.source = 'worker';
            this.logs.push(log);
            console.log(
              `[EnhancedConsoleCollector] Worker log captured via Puppeteer: ${location.url}`,
            );
          }
        } catch (error) {
          console.error(
            '[EnhancedConsoleCollector] Failed to format Puppeteer console message:',
            error,
          );
        }
      });

      this.isInitialized = true;
    } catch (error) {
      console.error('[EnhancedConsoleCollector] Failed to initialize:', error);
      throw error;
    }
  }

  /**
   * 格式化 console API 调用
   */
  private async formatConsoleAPICall(
    params: Protocol.Runtime.ConsoleAPICalledEvent,
    session: CDPSession,
  ): Promise<ConsoleLog> {
    // 序列化所有参数
    const args = await Promise.all(
      params.args.map(arg => this.serializer.serialize(arg, session)),
    );

    // 获取调用位置
    const stackTrace = params.stackTrace;
    const topFrame = stackTrace?.callFrames?.[0];

    return {
      type: params.type,
      args: args,
      timestamp: params.timestamp,
      executionContextId: params.executionContextId,
      stackTrace: stackTrace,
      text: this.formatArgs(args),
      url: topFrame?.url,
      lineNumber: topFrame?.lineNumber,
      columnNumber: topFrame?.columnNumber,
    };
  }

  /**
   * 格式化异常
   */
  private async formatException(
    params: Protocol.Runtime.ExceptionThrownEvent,
    session: CDPSession,
  ): Promise<ConsoleLog> {
    const exception = params.exceptionDetails.exception;
    const serialized = exception
      ? await this.serializer.serialize(exception, session)
      : {message: params.exceptionDetails.text};

    const stackTrace = params.exceptionDetails.stackTrace;
    const topFrame = stackTrace?.callFrames?.[0];

    return {
      type: 'error',
      args: [serialized],
      timestamp: params.timestamp,
      executionContextId: params.exceptionDetails.executionContextId || 0,
      stackTrace: stackTrace,
      text: `Uncaught ${(serialized as {name?: string; message?: string}).name || 'Error'}: ${(serialized as {name?: string; message?: string}).message || params.exceptionDetails.text}`,
      url: topFrame?.url || params.exceptionDetails.url,
      lineNumber: topFrame?.lineNumber ?? params.exceptionDetails.lineNumber,
      columnNumber:
        topFrame?.columnNumber ?? params.exceptionDetails.columnNumber,
    };
  }

  /**
   * 格式化参数为文本
   */
  private formatArgs(args: unknown[]): string {
    return args
      .map(arg => {
        if (arg && typeof arg === 'object') {
          const typedArg = arg as {
            __type?: string;
            name?: string;
            message?: string;
            size?: number;
            iso?: string;
            source?: string;
          };
          if (typedArg.__type) {
            switch (typedArg.__type) {
              case 'Function':
                return `[Function: ${typedArg.name}]`;
              case 'Error':
                return `[${typedArg.name}: ${typedArg.message}]`;
              case 'Map':
                return `Map(${typedArg.size})`;
              case 'Set':
                return `Set(${typedArg.size})`;
              case 'Date':
                return typedArg.iso;
              case 'RegExp':
                return typedArg.source;
              default:
                return JSON.stringify(arg);
            }
          }
        }
        return typeof arg === 'object' ? JSON.stringify(arg) : String(arg);
      })
      .join(' ');
  }

  /**
   * 获取所有日志
   */
  getLogs(): ConsoleLog[] {
    return this.logs;
  }

  /**
   * 清空日志
   */
  clear(): void {
    this.logs = [];
  }

  /**
   * 判断是否为 Worker 日志
   */
  private isWorkerLog(url: string | undefined): boolean {
    if (!url) return false;

    // Worker 脚本的 URL 特征：
    // 1. blob: URL (动态创建的 Worker)
    // 2. 独立的 .js 文件（不是 HTML 中的内联脚本，不是扩展的 content script）
    return (
      url.startsWith('blob:') ||
      (url.endsWith('.js') &&
        !url.includes('.html') &&
        !url.startsWith('chrome-extension://'))
    );
  }

  /**
   * 格式化 Puppeteer ConsoleMessage
   */
  private async formatPuppeteerConsoleMessage(
    msg: ConsoleMessage,
  ): Promise<ConsoleLog> {
    const location = msg.location();

    // 序列化参数
    const args = await Promise.all(
      msg.args().map(arg => this.serializePuppeteerHandle(arg)),
    );

    return {
      type: msg.type(),
      args: args,
      timestamp: Date.now(),
      executionContextId: 0, // Puppeteer 不提供
      text: this.formatArgs(args),
      url: location.url,
      lineNumber: location.lineNumber,
      columnNumber: location.columnNumber,
    };
  }

  /**
   * 序列化 Puppeteer JSHandle
   */
  private async serializePuppeteerHandle(handle: JSHandle): Promise<unknown> {
    try {
      // 先尝试直接序列化
      return await handle.jsonValue();
    } catch {
      // 无法直接序列化，尝试识别类型
      const str = handle.toString();

      // 识别 JSHandle 类型
      if (str.startsWith('JSHandle@')) {
        const type = str.substring(9);

        // 对于特殊类型，尝试提取更多信息
        try {
          switch (type) {
            case 'map': {
              // 获取 Map 的大小
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const mapSize = await handle.evaluate((m: any) => m.size);
              return {__type: 'Map', size: mapSize, preview: `Map(${mapSize})`};
            }

            case 'set': {
              // 获取 Set 的大小
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const setSize = await handle.evaluate((s: any) => s.size);
              return {__type: 'Set', size: setSize, preview: `Set(${setSize})`};
            }

            case 'date': {
              // 获取 Date 的 ISO 字符串
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const dateStr = await handle.evaluate((d: any) =>
                d.toISOString(),
              );
              return {__type: 'Date', value: dateStr, iso: dateStr};
            }

            case 'function': {
              // 获取函数名称和源码
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const funcInfo = await handle.evaluate((f: any) => ({
                name: f.name || 'anonymous',
                length: f.length,
                source: f.toString().substring(0, 100), // 限制长度
              }));
              return {__type: 'Function', ...funcInfo};
            }

            case 'error': {
              // 获取 Error 信息
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const errorInfo = await handle.evaluate((e: any) => ({
                name: e.name,
                message: e.message,
                stack: e.stack,
              }));
              return {__type: 'Error', ...errorInfo};
            }

            case 'regexp': {
              // 获取 RegExp 源码
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const regexpSource = await handle.evaluate((r: any) => r.source);
              return {__type: 'RegExp', source: regexpSource};
            }

            default:
              return {__type: type, __serialized: false};
          }
        } catch (_evalError) {
          // evaluate 失败，返回基本信息
          return {__type: type, __serialized: false};
        }
      }

      return str;
    }
  }

  /**
   * 获取日志数量
   */
  getLogCount(): number {
    return this.logs.length;
  }

  /**
   * 按类型过滤日志
   */
  getLogsByType(type: string): ConsoleLog[] {
    return this.logs.filter(log => log.type === type);
  }

  /**
   * 按来源过滤日志
   */
  getLogsBySource(
    source: 'page' | 'worker' | 'service-worker' | 'iframe',
  ): ConsoleLog[] {
    return this.logs.filter(log => log.source === source);
  }

  /**
   * 按时间范围过滤日志
   */
  getLogsSince(timestamp: number): ConsoleLog[] {
    return this.logs.filter(log => log.timestamp >= timestamp);
  }

  /**
   * 高级过滤日志
   */
  getFilteredLogs(options: {
    types?: string[];
    sources?: Array<'page' | 'worker' | 'service-worker' | 'iframe'>;
    since?: number;
    limit?: number;
  }): ConsoleLog[] {
    let filtered = this.logs;

    // 按类型过滤
    if (options.types && options.types.length > 0) {
      filtered = filtered.filter(log => options.types!.includes(log.type));
    }

    // 按来源过滤
    if (options.sources && options.sources.length > 0) {
      filtered = filtered.filter(
        log => log.source && options.sources!.includes(log.source),
      );
    }

    // 按时间过滤
    if (options.since) {
      filtered = filtered.filter(log => log.timestamp >= options.since!);
    }

    // 限制数量
    if (options.limit && options.limit > 0) {
      filtered = filtered.slice(-options.limit);
    }

    return filtered;
  }

  /**
   * 获取日志统计信息
   */
  getLogStats(): {
    total: number;
    byType: Record<string, number>;
    bySource: Record<string, number>;
  } {
    const byType: Record<string, number> = {};
    const bySource: Record<string, number> = {};

    for (const log of this.logs) {
      // 统计类型
      byType[log.type] = (byType[log.type] || 0) + 1;

      // 统计来源
      if (log.source) {
        bySource[log.source] = (bySource[log.source] || 0) + 1;
      }
    }

    return {
      total: this.logs.length,
      byType,
      bySource,
    };
  }
}
