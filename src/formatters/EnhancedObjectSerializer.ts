/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {CDPSession, Protocol} from 'puppeteer-core';

/**
 * Enhanced Object Serializer
 * 
 * 使用 CDP Runtime.getProperties 完整序列化对象
 * 支持函数、Error、Map、Set 等复杂类型
 */
export class EnhancedObjectSerializer {
  /**
   * 序列化 RemoteObject 为可读的 JSON
   */
  async serialize(
    obj: Protocol.Runtime.RemoteObject,
    session: CDPSession,
    depth = 0,
    maxDepth = 3,
  ): Promise<any> {
    // 深度限制（防止无限递归）
    if (depth > maxDepth) {
      return '[Max Depth Reached]';
    }

    // 基本类型
    if (['string', 'number', 'boolean'].includes(obj.type)) {
      return obj.value;
    }

    // undefined 和 null
    if (obj.type === 'undefined') return undefined;
    if (obj.subtype === 'null') return null;

    // 函数
    if (obj.type === 'function') {
      return await this.serializeFunction(obj, session);
    }

    // Error 对象
    if (obj.subtype === 'error') {
      return await this.serializeError(obj, session);
    }

    // Date 对象
    if (obj.subtype === 'date') {
      return {
        __type: 'Date',
        value: obj.description,
        iso: obj.description,  // description 包含完整日期字符串
      };
    }

    // RegExp 对象
    if (obj.subtype === 'regexp') {
      return {
        __type: 'RegExp',
        source: obj.description,
      };
    }

    // Map 对象
    if (obj.subtype === 'map') {
      return await this.serializeMap(obj, session, depth, maxDepth);
    }

    // Set 对象
    if (obj.subtype === 'set') {
      return await this.serializeSet(obj, session, depth, maxDepth);
    }

    // 数组
    if (obj.subtype === 'array') {
      return await this.serializeArray(obj, session, depth, maxDepth);
    }

    // 普通对象
    if (obj.type === 'object' && obj.objectId) {
      return await this.serializeObject(obj, session, depth, maxDepth);
    }

    // 其他情况返回原值
    return obj.value;
  }

  /**
   * 序列化函数
   */
  private async serializeFunction(
    obj: Protocol.Runtime.RemoteObject,
    session: CDPSession,
  ): Promise<any> {
    if (!obj.objectId) {
      return {__type: 'Function', name: 'unknown'};
    }

    try {
      const props = await session.send('Runtime.getProperties', {
        objectId: obj.objectId,
        ownProperties: true,
      });

      const nameMatch = obj.description?.match(/^(?:async\s+)?function\s+(\w+)/);
      const name =
        nameMatch?.[1] ||
        props.result.find(p => p.name === 'name')?.value?.value ||
        'anonymous';

      return {
        __type: 'Function',
        name: name,
        async: obj.description?.startsWith('async') || false,
        length: props.result.find(p => p.name === 'length')?.value?.value || 0,
        source:
          obj.description?.substring(0, 100) +
          (obj.description && obj.description.length > 100 ? '...' : ''),
      };
    } catch {
      return {__type: 'Function', name: 'unknown'};
    }
  }

  /**
   * 序列化 Error 对象
   */
  private async serializeError(
    obj: Protocol.Runtime.RemoteObject,
    session: CDPSession,
  ): Promise<any> {
    if (!obj.objectId) {
      return {__type: 'Error', message: obj.description || 'Unknown error'};
    }

    try {
      const props = await session.send('Runtime.getProperties', {
        objectId: obj.objectId,
        ownProperties: true,
      });

      const getProp = (name: string) =>
        props.result.find(p => p.name === name)?.value?.value;

      return {
        __type: 'Error',
        name: getProp('name') || 'Error',
        message: getProp('message') || '',
        stack: getProp('stack') || '',
      };
    } catch {
      return {__type: 'Error', message: obj.description || 'Unknown error'};
    }
  }

  /**
   * 序列化 Map 对象
   */
  private async serializeMap(
    obj: Protocol.Runtime.RemoteObject,
    session: CDPSession,
    depth: number,
    maxDepth: number,
  ): Promise<any> {
    // 从 description 解析大小（如 "Map(2)"）
    const sizeMatch = obj.description?.match(/Map\((\d+)\)/);
    const size = sizeMatch ? parseInt(sizeMatch[1]) : 0;

    return {
      __type: 'Map',
      size: size,
      preview: obj.description || 'Map',
    };
  }

  /**
   * 序列化 Set 对象
   */
  private async serializeSet(
    obj: Protocol.Runtime.RemoteObject,
    session: CDPSession,
    depth: number,
    maxDepth: number,
  ): Promise<any> {
    // 从 description 解析大小（如 "Set(5)"）
    const sizeMatch = obj.description?.match(/Set\((\d+)\)/);
    const size = sizeMatch ? parseInt(sizeMatch[1]) : 0;

    return {
      __type: 'Set',
      size: size,
      preview: obj.description || 'Set',
    };
  }

  /**
   * 序列化数组
   */
  private async serializeArray(
    obj: Protocol.Runtime.RemoteObject,
    session: CDPSession,
    depth: number,
    maxDepth: number,
  ): Promise<any> {
    if (!obj.objectId) {
      return [];
    }

    try {
      const props = await session.send('Runtime.getProperties', {
        objectId: obj.objectId,
        ownProperties: true,
      });

      // 过滤出数组元素（数字索引）
      const elements = props.result
        .filter(p => /^\d+$/.test(p.name))
        .sort((a, b) => parseInt(a.name) - parseInt(b.name));

      const serialized = await Promise.all(
        elements.map(async elem => {
          if (elem.value) {
            return await this.serialize(elem.value, session, depth + 1, maxDepth);
          }
          return undefined;
        }),
      );

      return serialized;
    } catch {
      return [];
    }
  }

  /**
   * 序列化普通对象
   */
  private async serializeObject(
    obj: Protocol.Runtime.RemoteObject,
    session: CDPSession,
    depth: number,
    maxDepth: number,
  ): Promise<any> {
    if (!obj.objectId) {
      return {};
    }

    try {
      const props = await session.send('Runtime.getProperties', {
        objectId: obj.objectId,
        ownProperties: true,
      });

      const result: Record<string, any> = {};

      for (const prop of props.result) {
        // 跳过内部属性和 Symbol
        if (prop.name.startsWith('[[') || typeof prop.name === 'symbol') {
          continue;
        }

        if (prop.value) {
          result[prop.name] = await this.serialize(
            prop.value,
            session,
            depth + 1,
            maxDepth,
          );
        }
      }

      return result;
    } catch {
      return {};
    }
  }
}
