/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * 数据库Schema类型定义
 *
 * 使用Kysely提供编译时类型安全
 */

import type {ColumnType, Generated} from 'kysely';

/**
 * 数据库Schema
 */
export interface Database {
  mcp_users: UsersTable;
  mcp_browsers: BrowsersTable;
  pgmigrations: MigrationsTable;
}

/**
 * 用户表
 */
export interface UsersTable {
  user_id: string;
  email: string;
  username: string;
  registered_at: number;
  updated_at: number | null;
  metadata: ColumnType<unknown, string | undefined, string | undefined>;
  created_at: Generated<Date>;
}

/**
 * 浏览器表
 */
export interface BrowsersTable {
  browser_id: Generated<string>;
  user_id: string;
  browser_url: string;
  token_name: string;
  token: string;
  created_at_ts: number;
  last_connected_at: number | null;
  tool_call_count: Generated<number>;
  metadata: ColumnType<unknown, string | undefined, string | undefined>;
  created_at: Generated<Date>;
}

/**
 * 迁移历史表
 */
export interface MigrationsTable {
  id: Generated<number>;
  name: string;
  run_on: Generated<Date>;
}

/**
 * 用户插入类型（排除Generated字段）
 */
export type UserInsert = Omit<UsersTable, 'created_at'>;

/**
 * 用户更新类型（所有字段可选）
 */
export type UserUpdate = Partial<Omit<UsersTable, 'user_id' | 'created_at'>>;

/**
 * 浏览器插入类型（排除Generated字段）
 */
export type BrowserInsert = Omit<
  BrowsersTable,
  'browser_id' | 'tool_call_count' | 'created_at'
>;

/**
 * 浏览器更新类型（所有字段可选）
 */
export type BrowserUpdate = Partial<
  Omit<BrowsersTable, 'browser_id' | 'user_id' | 'created_at'>
>;
