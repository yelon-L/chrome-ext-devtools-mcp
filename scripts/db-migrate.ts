#!/usr/bin/env node

/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * 数据库迁移管理脚本
 *
 * 使用 node-pg-migrate 管理PostgreSQL数据库的Schema版本
 */

import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import {Pool} from 'pg';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 迁移文件目录
const MIGRATIONS_DIR = path.join(
  __dirname,
  '../src/multi-tenant/storage/migrations',
);

// PostgreSQL配置
const getPostgresConfig = () => {
  return {
    host: process.env.POSTGRES_HOST || 'localhost',
    port: parseInt(process.env.POSTGRES_PORT || '5432', 10),
    database: process.env.POSTGRES_DB || 'extdebugdb',
    user: process.env.POSTGRES_USER || 'postgres',
    password: process.env.POSTGRES_PASSWORD || 'postgres',
  };
};

// 迁移历史表名
const MIGRATIONS_TABLE = 'pgmigrations';

/**
 * 创建迁移历史表
 */
async function ensureMigrationsTable(pool: Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${MIGRATIONS_TABLE} (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL UNIQUE,
      run_on TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);
}

/**
 * 获取已应用的迁移
 */
async function getAppliedMigrations(pool: Pool): Promise<Set<string>> {
  const result = await pool.query(
    `SELECT name FROM ${MIGRATIONS_TABLE} ORDER BY id`,
  );
  return new Set(result.rows.map(row => row.name));
}

/**
 * 获取所有迁移文件
 */
function getMigrationFiles(): string[] {
  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith('.sql'))
    .sort();
  return files;
}

/**
 * 应用迁移
 */
async function runMigration(pool: Pool, filename: string): Promise<void> {
  const filePath = path.join(MIGRATIONS_DIR, filename);
  const sql = fs.readFileSync(filePath, 'utf-8');

  console.log(`⏳ 应用迁移: ${filename}`);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 执行迁移SQL
    await client.query(sql);

    // 记录迁移历史
    await client.query(`INSERT INTO ${MIGRATIONS_TABLE} (name) VALUES ($1)`, [
      filename,
    ]);

    await client.query('COMMIT');
    console.log(`✅ 迁移成功: ${filename}`);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error(`❌ 迁移失败: ${filename}`);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * 回滚迁移
 */
async function rollbackMigration(pool: Pool, filename: string): Promise<void> {
  console.log(`⏳ 回滚迁移: ${filename}`);

  // 注意: 这是简化版本，实际应该读取DOWN迁移
  console.warn(`⚠️  简化版本：需要手动编写回滚逻辑`);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 删除迁移历史记录
    await client.query(`DELETE FROM ${MIGRATIONS_TABLE} WHERE name = $1`, [
      filename,
    ]);

    await client.query('COMMIT');
    console.log(`✅ 回滚成功: ${filename}`);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error(`❌ 回滚失败: ${filename}`);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * 显示迁移状态
 */
async function showStatus(pool: Pool): Promise<void> {
  const appliedMigrations = await getAppliedMigrations(pool);
  const allFiles = getMigrationFiles();

  console.log('\n📊 迁移状态:\n');
  console.log('| 状态 | 迁移文件 |');
  console.log('|------|----------|');

  for (const file of allFiles) {
    const status = appliedMigrations.has(file) ? '✅' : '⏳';
    console.log(`| ${status}   | ${file} |`);
  }

  console.log(
    `\n总计: ${allFiles.length} 个迁移, ${appliedMigrations.size} 个已应用\n`,
  );
}

/**
 * 应用所有未应用的迁移
 */
async function migrateUp(pool: Pool): Promise<void> {
  const appliedMigrations = await getAppliedMigrations(pool);
  const allFiles = getMigrationFiles();

  const pendingMigrations = allFiles.filter(f => !appliedMigrations.has(f));

  if (pendingMigrations.length === 0) {
    console.log('✅ 没有待应用的迁移');
    return;
  }

  console.log(`📦 发现 ${pendingMigrations.length} 个待应用的迁移\n`);

  for (const file of pendingMigrations) {
    await runMigration(pool, file);
  }

  console.log(`\n✅ 所有迁移已应用完成`);
}

/**
 * 回滚最后N个迁移
 */
async function migrateDown(pool: Pool, count = 1): Promise<void> {
  const appliedMigrations = await getAppliedMigrations(pool);
  const appliedArray = Array.from(appliedMigrations).sort().reverse();

  if (appliedArray.length === 0) {
    console.log('⚠️  没有已应用的迁移可以回滚');
    return;
  }

  const toRollback = appliedArray.slice(0, count);

  console.log(`📦 将回滚 ${toRollback.length} 个迁移\n`);

  for (const file of toRollback) {
    await rollbackMigration(pool, file);
  }

  console.log(`\n✅ 回滚完成`);
}

/**
 * 主函数
 */
async function main() {
  const command = process.argv[2] || 'up';
  const arg = process.argv[3];

  const config = getPostgresConfig();
  console.log('🔗 连接数据库:', {
    host: config.host,
    port: config.port,
    database: config.database,
    user: config.user,
  });

  const pool = new Pool(config);

  try {
    // 测试连接
    await pool.query('SELECT 1');
    console.log('✅ 数据库连接成功\n');

    // 确保迁移历史表存在
    await ensureMigrationsTable(pool);

    // 执行命令
    switch (command) {
      case 'up':
        await migrateUp(pool);
        break;
      case 'down': {
        const count = arg ? parseInt(arg, 10) : 1;
        await migrateDown(pool, count);
        break;
      }
      case 'status':
        await showStatus(pool);
        break;
      default:
        console.error(`❌ 未知命令: ${command}`);
        console.log('\n用法:');
        console.log('  npm run migrate:up       - 应用所有未应用的迁移');
        console.log('  npm run migrate:down [N] - 回滚最后N个迁移（默认1个）');
        console.log('  npm run migrate:status   - 显示迁移状态');
        process.exit(1);
    }
  } catch (error) {
    console.error('❌ 错误:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// 执行
main().catch(console.error);
