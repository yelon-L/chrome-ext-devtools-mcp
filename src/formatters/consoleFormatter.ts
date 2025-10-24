/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  CDPSession,
  ConsoleMessage,
  JSHandle,
  ConsoleMessageLocation,
} from 'puppeteer-core';

import {EnhancedObjectSerializer} from './EnhancedObjectSerializer.js';

const serializer = new EnhancedObjectSerializer();

const logLevels: Record<string, string> = {
  log: 'Log',
  info: 'Info',
  warning: 'Warning',
  error: 'Error',
  exception: 'Exception',
  assert: 'Assert',
};

export async function formatConsoleEvent(
  event: ConsoleMessage | Error,
  cdpSession?: CDPSession
): Promise<string> {
  // Check if the event object has the .type() method, which is unique to ConsoleMessage
  if ('type' in event) {
    // 如果有 CDP session，使用增强序列化
    if (cdpSession) {
      return await formatConsoleMessageEnhanced(event, cdpSession);
    }
    return await formatConsoleMessage(event);
  }
  return `Error: ${event.message}`;
}

async function formatConsoleMessage(msg: ConsoleMessage): Promise<string> {
  const logLevel = logLevels[msg.type()];
  const args = msg.args();

  if (logLevel === 'Error') {
    let message = `${logLevel}> `;
    if (msg.text() === 'JSHandle@error') {
      const errorHandle = args[0] as JSHandle<Error>;
      message += await errorHandle
        .evaluate(error => {
          return error.toString();
        })
        .catch(() => {
          return 'Error occurred';
        });
      void errorHandle.dispose().catch();

      const formattedArgs = await formatArgs(args.slice(1));
      if (formattedArgs) {
        message += ` ${formattedArgs}`;
      }
    } else {
      message += msg.text();
      const formattedArgs = await formatArgs(args);
      if (formattedArgs) {
        message += ` ${formattedArgs}`;
      }
      for (const frame of msg.stackTrace()) {
        message += '\n' + formatStackFrame(frame);
      }
    }
    return message;
  }

  const formattedArgs = await formatArgs(args);
  const text = msg.text();

  return `${logLevel}> ${formatStackFrame(
    msg.location(),
  )}: ${text} ${formattedArgs}`.trim();
}

async function formatArgs(args: readonly JSHandle[]): Promise<string> {
  const argValues = await Promise.all(
    args.map(arg =>
      arg.jsonValue().catch(() => {
        // Ignore errors
      }),
    ),
  );

  return argValues
    .map(value => {
      return typeof value === 'object' ? JSON.stringify(value) : String(value);
    })
    .join(' ');
}

function formatStackFrame(stackFrame: ConsoleMessageLocation): string {
  if (!stackFrame?.url) {
    return '<unknown>';
  }
  const filename = stackFrame.url.replace(/^.*\//, '');
  return `${filename}:${stackFrame.lineNumber}:${stackFrame.columnNumber}`;
}

/**
 * 使用 CDP 增强序列化的格式化函数
 */
async function formatConsoleMessageEnhanced(
  msg: ConsoleMessage,
  session: CDPSession
): Promise<string> {
  const logLevel = logLevels[msg.type()];
  const args = msg.args();

  // 使用增强序列化器序列化所有参数
  const serializedArgs = await Promise.all(
    args.map(async (arg) => {
      try {
        // 获取 RemoteObject
        const remoteObject = arg.remoteObject();
        // 使用增强序列化
        return await serializer.serialize(remoteObject, session);
      } catch (error) {
        // 降级到原有逻辑
        return arg.jsonValue().catch(() => String(arg));
      }
    })
  );

  // 格式化参数
  const formattedArgs = serializedArgs
    .map(value => formatSerializedValue(value))
    .join(' ');

  return `${logLevel}> ${formatStackFrame(msg.location())}: ${msg.text()} ${formattedArgs}`.trim();
}

/**
 * 格式化序列化后的值
 */
function formatSerializedValue(value: any): string {
  if (value && typeof value === 'object' && value.__type) {
    // 特殊类型的友好显示
    switch (value.__type) {
      case 'Function':
        return `[Function: ${value.name}]`;
      case 'Error':
        return `[${value.name}: ${value.message}]`;
      case 'Map':
        return `Map(${value.size})`;
      case 'Set':
        return `Set(${value.size})`;
      case 'Date':
        return value.iso;
      case 'RegExp':
        return value.source;
      default:
        return JSON.stringify(value);
    }
  }
  return typeof value === 'object' ? JSON.stringify(value) : String(value);
}
