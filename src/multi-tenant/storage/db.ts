/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Kysely数据库实例工厂
 * 
 * 提供类型安全的数据库查询接口
 */

import {Kysely, PostgresDialect} from 'kysely';
import type {Pool} from 'pg';
import type {Database} from './schema.js';

/**
 * 创建Kysely数据库实例
 * 
 * @param pool PostgreSQL连接池
 * @returns 类型安全的Kysely实例
 */
export function createDB(pool: Pool): Kysely<Database> {
  return new Kysely<Database>({
    dialect: new PostgresDialect({
      pool: pool as any,  // Kysely的类型定义与pg的Pool不完全兼容，但运行时正常工作
    }),
    // 开发环境启用查询日志
    log(event) {
      if (event.level === 'query') {
        // console.log('Kysely Query:', event.query.sql);
        // console.log('Kysely Params:', event.query.parameters);
      }
    },
  });
}
