/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * PostgreSQL 存储适配器
 * 
 * 使用 PostgreSQL 数据库作为存储后端
 */

import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import type {Kysely} from 'kysely';
import type * as pg from 'pg';
import type {StorageAdapter} from './StorageAdapter.js';
import type {UserRecordV2, BrowserRecordV2} from './PersistentStoreV2.js';
import {createLogger} from '../utils/Logger.js';
import {StorageOperationError} from '../errors/index.js';
import {createDB} from './db.js';
import type {Database} from './schema.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// @ts-ignore - pg module loaded at runtime
let Pool: typeof pg.Pool;
try {
  // @ts-ignore
  const pgModule = await import('pg');
  Pool = pgModule.default?.Pool || pgModule.Pool;
} catch {
  // pg not installed, will fail at runtime if postgresql storage is used
}

/**
 * PostgreSQL 配置
 */
export interface PostgreSQLConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  max?: number;              // 最大连接数
  idleTimeoutMillis?: number;
  connectionTimeoutMillis?: number;
}

/**
 * PostgreSQL 存储适配器
 */
export class PostgreSQLStorageAdapter implements StorageAdapter {
  private pool: pg.Pool;
  private config: PostgreSQLConfig;
  private logger = createLogger('PostgreSQL');
  private migrationsDir = path.join(__dirname, 'migrations');
  private migrationsTable = 'pgmigrations';
  private db: Kysely<Database>;

  constructor(config: PostgreSQLConfig) {
    this.config = config;
    this.pool = new Pool({
      host: config.host,
      port: config.port,
      database: config.database,
      user: config.user,
      password: config.password,
      max: config.max || 10,
      idleTimeoutMillis: config.idleTimeoutMillis || 30000,
      connectionTimeoutMillis: config.connectionTimeoutMillis || 5000,
    });
    
    // 创建Kysely实例
    this.db = createDB(this.pool);
  }

  /**
   * 初始化存储（运行迁移）
   */
  async initialize(): Promise<void> {
    this.logger.info('初始化数据库连接', {
      host: this.config.host,
      port: this.config.port,
      database: this.config.database,
    });

    try {
      // 测试连接
      const client = await this.pool.connect();
      this.logger.info('数据库连接成功');
      client.release();

      // 运行迁移（替代createTables）
      await this.runMigrations();
      this.logger.info('数据库迁移完成');
    } catch (error) {
      this.logger.error('初始化失败', error as Error);
      throw new StorageOperationError('initialize', (error as Error).message, {
        host: this.config.host,
        database: this.config.database,
      });
    }
  }

  /**
   * 运行数据库迁移
   */
  private async runMigrations(): Promise<void> {
    // 确保迁移历史表存在
    await this.ensureMigrationsTable();

    // 获取已应用的迁移
    const appliedMigrations = await this.getAppliedMigrations();

    // 获取所有迁移文件
    const allFiles = this.getMigrationFiles();

    // 过滤待应用的迁移
    const pendingMigrations = allFiles.filter(f => !appliedMigrations.has(f));

    if (pendingMigrations.length === 0) {
      this.logger.info('没有待应用的迁移');
      return;
    }

    this.logger.info(`发现 ${pendingMigrations.length} 个待应用的迁移`);

    // 应用每个待应用的迁移
    for (const file of pendingMigrations) {
      await this.runMigration(file);
    }
  }

  /**
   * 确保迁移历史表存在
   */
  private async ensureMigrationsTable(): Promise<void> {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS ${this.migrationsTable} (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL UNIQUE,
        run_on TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
  }

  /**
   * 获取已应用的迁移
   */
  private async getAppliedMigrations(): Promise<Set<string>> {
    const result = await this.pool.query(
      `SELECT name FROM ${this.migrationsTable} ORDER BY id`
    );
    return new Set(result.rows.map(row => row.name));
  }

  /**
   * 获取所有迁移文件
   */
  private getMigrationFiles(): string[] {
    if (!fs.existsSync(this.migrationsDir)) {
      this.logger.warn(`迁移目录不存在: ${this.migrationsDir}`);
      return [];
    }

    const files = fs.readdirSync(this.migrationsDir)
      .filter(f => f.endsWith('.sql'))
      .sort();
    return files;
  }

  /**
   * 运行单个迁移
   */
  private async runMigration(filename: string): Promise<void> {
    const filePath = path.join(this.migrationsDir, filename);
    const sql = fs.readFileSync(filePath, 'utf-8');

    this.logger.info(`应用迁移: ${filename}`);

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // 执行迁移SQL
      await client.query(sql);

      // 记录迁移历史
      await client.query(
        `INSERT INTO ${this.migrationsTable} (name) VALUES ($1)`,
        [filename]
      );

      await client.query('COMMIT');
      this.logger.info(`迁移成功: ${filename}`);
    } catch (error) {
      await client.query('ROLLBACK');
      this.logger.error(`迁移失败: ${filename}`, error as Error);
      throw new StorageOperationError('migration', `Failed to apply ${filename}`, error);
    } finally {
      client.release();
    }
  }

  /**
   * 创建数据库表（废弃，仅用于向后兼容）
   * @deprecated 使用 runMigrations() 替代
   */
  private async createTables(): Promise<void> {
    const client = await this.pool.connect();
    
    try {
      await client.query('BEGIN');

      // 创建用户表
      await client.query(`
        CREATE TABLE IF NOT EXISTS mcp_users (
          user_id VARCHAR(255) PRIMARY KEY,
          email VARCHAR(255) UNIQUE NOT NULL,
          username VARCHAR(255) NOT NULL,
          registered_at BIGINT NOT NULL,
          updated_at BIGINT,
          metadata JSONB,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      
      // 创建用户表索引
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_email ON mcp_users(email)
      `);

      // 创建浏览器表
      await client.query(`
        CREATE TABLE IF NOT EXISTS mcp_browsers (
          browser_id UUID PRIMARY KEY,
          user_id VARCHAR(255) NOT NULL,
          browser_url VARCHAR(2048) NOT NULL,
          token_name VARCHAR(255) NOT NULL,
          token VARCHAR(255) UNIQUE NOT NULL,
          created_at_ts BIGINT NOT NULL,
          last_connected_at BIGINT,
          tool_call_count INTEGER DEFAULT 0,
          metadata JSONB,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES mcp_users(user_id) ON DELETE CASCADE
        )
      `);
      
      // 创建浏览器表索引
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_token ON mcp_browsers(token)
      `);
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_user_id ON mcp_browsers(user_id)
      `);
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_last_connected ON mcp_browsers(last_connected_at DESC)
      `);

      await client.query('COMMIT');
      this.logger.warn('⚠️  使用了废弃的createTables方法，请使用迁移框架');
    } catch (error) {
      await client.query('ROLLBACK');
      this.logger.warn('表创建失败（可能已存在）', error as Error);
      // 不抛出错误，表可能已存在
    } finally {
      client.release();
    }
  }

  /**
   * 关闭连接池
   */
  async close(): Promise<void> {
    this.logger.info('关闭数据库连接');
    await this.pool.end();
  }

  // ============================================================================
  // 用户管理
  // ============================================================================

  async registerUser(user: UserRecordV2): Promise<void> {
    await this.db
      .insertInto('mcp_users')
      .values({
        user_id: user.userId,
        email: user.email,
        username: user.username,
        registered_at: user.registeredAt,
        updated_at: user.updatedAt || null,
        metadata: JSON.stringify(user.metadata || {}),
      })
      .execute();
  }

  async getUser(userId: string): Promise<UserRecordV2 | null> {
    const row = await this.db
      .selectFrom('mcp_users')
      .selectAll()
      .where('user_id', '=', userId)
      .executeTakeFirst();

    if (!row) {
      return null;
    }

    return this.mapUserRow(row);
  }

  async getUserByEmail(email: string): Promise<UserRecordV2 | null> {
    const row = await this.db
      .selectFrom('mcp_users')
      .selectAll()
      .where('email', '=', email)
      .executeTakeFirst();

    if (!row) {
      return null;
    }

    return this.mapUserRow(row);
  }

  async getAllUsers(): Promise<UserRecordV2[]> {
    const rows = await this.db
      .selectFrom('mcp_users')
      .selectAll()
      .orderBy('registered_at', 'desc')
      .execute();

    return rows.map(row => this.mapUserRow(row));
  }

  async updateUsername(userId: string, username: string): Promise<void> {
    await this.db
      .updateTable('mcp_users')
      .set({
        username,
        updated_at: Date.now(),
      })
      .where('user_id', '=', userId)
      .execute();
  }

  async deleteUser(userId: string): Promise<void> {
    // CASCADE 会自动删除关联的浏览器
    await this.db
      .deleteFrom('mcp_users')
      .where('user_id', '=', userId)
      .execute();
  }

  // ============================================================================
  // 浏览器管理
  // ============================================================================

  async bindBrowser(browser: BrowserRecordV2): Promise<void> {
    await this.db
      .insertInto('mcp_browsers')
      .values({
        browser_id: browser.browserId,
        user_id: browser.userId,
        browser_url: browser.browserURL,
        token_name: browser.tokenName,
        token: browser.token,
        created_at_ts: browser.createdAt,
        last_connected_at: browser.lastConnectedAt || null,
        tool_call_count: browser.toolCallCount || 0,
        metadata: JSON.stringify(browser.metadata || {}),
      })
      .execute();
  }

  async getBrowser(browserId: string): Promise<BrowserRecordV2 | null> {
    const row = await this.db
      .selectFrom('mcp_browsers')
      .selectAll()
      .where('browser_id', '=', browserId)
      .executeTakeFirst();

    if (!row) {
      return null;
    }

    return this.mapBrowserRow(row);
  }

  async getBrowserByToken(token: string): Promise<BrowserRecordV2 | null> {
    const row = await this.db
      .selectFrom('mcp_browsers')
      .selectAll()
      .where('token', '=', token)
      .executeTakeFirst();

    if (!row) {
      return null;
    }

    return this.mapBrowserRow(row);
  }

  async getUserBrowsers(userId: string): Promise<BrowserRecordV2[]> {
    const result = await this.pool.query(
      'SELECT * FROM mcp_browsers WHERE user_id = $1 ORDER BY created_at_ts DESC',
      [userId]
    );

    return result.rows.map((row: any) => this.mapBrowserRow(row));
  }

  async getAllBrowsers(): Promise<BrowserRecordV2[]> {
    const result = await this.pool.query(
      'SELECT * FROM mcp_browsers ORDER BY created_at_ts DESC'
    );

    return result.rows.map((row: any) => this.mapBrowserRow(row));
  }

  async updateBrowser(
    browserId: string,
    updates: { browserURL?: string; description?: string }
  ): Promise<void> {
    const setParts: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (updates.browserURL !== undefined) {
      setParts.push(`browser_url = $${paramIndex++}`);
      values.push(updates.browserURL);
    }

    if (updates.description !== undefined) {
      setParts.push(`metadata = jsonb_set(COALESCE(metadata, '{}'), '{description}', $${paramIndex++})`);
      values.push(JSON.stringify(updates.description));
    }

    if (setParts.length === 0) {
      return;
    }

    values.push(browserId);

    await this.pool.query(
      `UPDATE mcp_browsers SET ${setParts.join(', ')} WHERE browser_id = $${paramIndex}`,
      values
    );
  }

  async updateLastConnected(browserId: string): Promise<void> {
    await this.pool.query(
      'UPDATE mcp_browsers SET last_connected_at = $1 WHERE browser_id = $2',
      [Date.now(), browserId]
    );
  }

  async incrementToolCallCount(browserId: string): Promise<void> {
    await this.pool.query(
      'UPDATE mcp_browsers SET tool_call_count = tool_call_count + 1 WHERE browser_id = $2',
      [browserId]
    );
  }

  async unbindBrowser(browserId: string): Promise<void> {
    await this.pool.query(
      'DELETE FROM mcp_browsers WHERE browser_id = $1',
      [browserId]
    );
  }

  // ============================================================================
  // 统计信息
  // ============================================================================

  async getStats(): Promise<{ users: number; browsers: number }> {
    const usersResult = await this.pool.query('SELECT COUNT(*) FROM mcp_users');
    const browsersResult = await this.pool.query('SELECT COUNT(*) FROM mcp_browsers');

    return {
      users: parseInt(usersResult.rows[0].count),
      browsers: parseInt(browsersResult.rows[0].count),
    };
  }

  // ============================================================================
  // 辅助方法
  // ============================================================================

  private mapUserRow(row: any): UserRecordV2 {
    return {
      userId: row.user_id,
      email: row.email,
      username: row.username,
      registeredAt: parseInt(row.registered_at),
      updatedAt: row.updated_at ? parseInt(row.updated_at) : undefined,
      metadata: row.metadata || undefined,
    };
  }

  private mapBrowserRow(row: any): BrowserRecordV2 {
    return {
      browserId: row.browser_id,
      userId: row.user_id,
      browserURL: row.browser_url,
      tokenName: row.token_name,
      token: row.token,
      createdAt: parseInt(row.created_at_ts),
      lastConnectedAt: row.last_connected_at ? parseInt(row.last_connected_at) : undefined,
      toolCallCount: row.tool_call_count || 0,
      metadata: row.metadata || undefined,
    };
  }
}
