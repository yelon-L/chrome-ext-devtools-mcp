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

import type * as pg from 'pg';
import {logger} from '../../logger.js';
import type {StorageAdapter} from './StorageAdapter.js';
import type {UserRecordV2, BrowserRecordV2} from './PersistentStoreV2.js';

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
  }

  /**
   * 初始化存储（创建表）
   */
  async initialize(): Promise<void> {
    logger('[PostgreSQLAdapter] 初始化数据库连接');

    try {
      // 测试连接
      const client = await this.pool.connect();
      logger('[PostgreSQLAdapter] 数据库连接成功');
      client.release();

      // 创建表
      await this.createTables();
      logger('[PostgreSQLAdapter] 表结构初始化完成');
    } catch (error) {
      logger(`[PostgreSQLAdapter] ❌ 初始化失败: ${error}`);
      throw error;
    }
  }

  /**
   * 创建数据库表
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
      logger('[PostgreSQLAdapter] 表创建成功');
    } catch (error) {
      await client.query('ROLLBACK');
      logger(`[PostgreSQLAdapter] ⚠️  表创建失败: ${error}`);
      // 不抛出错误，表可能已存在
    } finally {
      client.release();
    }
  }

  /**
   * 关闭连接池
   */
  async close(): Promise<void> {
    logger('[PostgreSQLAdapter] 关闭数据库连接');
    await this.pool.end();
  }

  // ============================================================================
  // 用户管理
  // ============================================================================

  async registerUser(user: UserRecordV2): Promise<void> {
    await this.pool.query(
      `INSERT INTO mcp_users (user_id, email, username, registered_at, updated_at, metadata)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        user.userId,
        user.email,
        user.username,
        user.registeredAt,
        user.updatedAt || null,
        JSON.stringify(user.metadata || {}),
      ]
    );
  }

  async getUser(userId: string): Promise<UserRecordV2 | null> {
    const result = await this.pool.query(
      'SELECT * FROM mcp_users WHERE user_id = $1',
      [userId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapUserRow(result.rows[0]);
  }

  async getUserByEmail(email: string): Promise<UserRecordV2 | null> {
    const result = await this.pool.query(
      'SELECT * FROM mcp_users WHERE email = $1',
      [email]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapUserRow(result.rows[0]);
  }

  async getAllUsers(): Promise<UserRecordV2[]> {
    const result = await this.pool.query(
      'SELECT * FROM mcp_users ORDER BY registered_at DESC'
    );

    return result.rows.map((row: any) => this.mapUserRow(row));
  }

  async updateUsername(userId: string, username: string): Promise<void> {
    await this.pool.query(
      `UPDATE mcp_users 
       SET username = $1, updated_at = $2 
       WHERE user_id = $3`,
      [username, Date.now(), userId]
    );
  }

  async deleteUser(userId: string): Promise<void> {
    // 使用显式事务确保数据一致性
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      
      // CASCADE 会自动删除关联的浏览器，但使用显式事务更安全
      await client.query(
        'DELETE FROM mcp_users WHERE user_id = $1',
        [userId]
      );
      
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  // ============================================================================
  // 浏览器管理
  // ============================================================================

  async bindBrowser(browser: BrowserRecordV2): Promise<void> {
    await this.pool.query(
      `INSERT INTO mcp_browsers 
       (browser_id, user_id, browser_url, token_name, token, created_at_ts, last_connected_at, tool_call_count, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        browser.browserId,
        browser.userId,
        browser.browserURL,
        browser.tokenName,
        browser.token,
        browser.createdAt,
        browser.lastConnectedAt || null,
        browser.toolCallCount || 0,
        JSON.stringify(browser.metadata || {}),
      ]
    );
  }

  async getBrowser(browserId: string): Promise<BrowserRecordV2 | null> {
    const result = await this.pool.query(
      'SELECT * FROM mcp_browsers WHERE browser_id = $1',
      [browserId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapBrowserRow(result.rows[0]);
  }

  async getBrowserByToken(token: string): Promise<BrowserRecordV2 | null> {
    const result = await this.pool.query(
      'SELECT * FROM mcp_browsers WHERE token = $1',
      [token]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapBrowserRow(result.rows[0]);
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
