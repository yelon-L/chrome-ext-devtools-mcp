#!/usr/bin/env node
/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * 数据迁移工具：JSONL → PostgreSQL
 */

import fs from 'node:fs';
import path from 'node:path';

import pg from 'pg';

const {Pool} = pg;

interface MigrationConfig {
  jsonlPath: string;
  dbHost: string;
  dbPort: number;
  dbName: string;
  dbUser: string;
  dbPassword: string;
}

async function migrate(config: MigrationConfig) {
  console.log('🔄 开始数据迁移：JSONL → PostgreSQL\n');

  // 1. 连接数据库
  console.log('📡 连接数据库...');
  const pool = new Pool({
    host: config.dbHost,
    port: config.dbPort,
    database: config.dbName,
    user: config.dbUser,
    password: config.dbPassword,
  });

  try {
    await pool.query('SELECT 1');
    console.log('✅ 数据库连接成功\n');
  } catch (error) {
    console.error('❌ 数据库连接失败:', error);
    process.exit(1);
  }

  // 2. 检查 JSONL 文件
  if (!fs.existsSync(config.jsonlPath)) {
    console.error(`❌ JSONL 文件不存在: ${config.jsonlPath}`);
    process.exit(1);
  }

  console.log(`📖 读取 JSONL 文件: ${config.jsonlPath}`);
  const data = fs.readFileSync(config.jsonlPath, 'utf8');
  const lines = data.split('\n').filter(line => line.trim());
  console.log(`📊 找到 ${lines.length} 条记录\n`);

  // 3. 统计
  let userCount = 0;
  let browserCount = 0;
  let errorCount = 0;

  // 4. 迁移数据
  console.log('🚀 开始导入数据...\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    try {
      const op = JSON.parse(line);

      if (op.op === 'register_user') {
        await pool.query(
          `INSERT INTO mcp_users (user_id, email, username, registered_at, updated_at, metadata)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (user_id) DO UPDATE SET
             username = EXCLUDED.username,
             updated_at = EXCLUDED.updated_at`,
          [
            op.data.userId,
            op.data.email,
            op.data.username,
            op.data.registeredAt,
            op.data.updatedAt || null,
            JSON.stringify(op.data.metadata || {}),
          ],
        );
        userCount++;
        process.stdout.write(
          `\r用户: ${userCount}, 浏览器: ${browserCount}, 错误: ${errorCount}`,
        );
      } else if (op.op === 'bind_browser') {
        await pool.query(
          `INSERT INTO mcp_browsers (browser_id, user_id, browser_url, token_name, token, created_at_ts, last_connected_at, tool_call_count, metadata)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           ON CONFLICT (browser_id) DO UPDATE SET
             browser_url = EXCLUDED.browser_url,
             last_connected_at = EXCLUDED.last_connected_at,
             tool_call_count = EXCLUDED.tool_call_count`,
          [
            op.data.browserId,
            op.data.userId,
            op.data.browserURL,
            op.data.tokenName,
            op.data.token,
            op.data.createdAt,
            op.data.lastConnectedAt || null,
            op.data.toolCallCount || 0,
            JSON.stringify(op.data.metadata || {}),
          ],
        );
        browserCount++;
        process.stdout.write(
          `\r用户: ${userCount}, 浏览器: ${browserCount}, 错误: ${errorCount}`,
        );
      } else if (op.op === 'update_username') {
        await pool.query(
          `UPDATE mcp_users SET username = $1, updated_at = $2 WHERE user_id = $3`,
          [op.username, op.timestamp, op.userId],
        );
      } else if (op.op === 'update_browser') {
        const setParts: string[] = [];
        const values: any[] = [];

        if (op.browserURL) {
          setParts.push('browser_url = $1');
          values.push(op.browserURL);
        }
        if (op.description) {
          const paramIndex = values.length + 1;
          setParts.push(
            `metadata = jsonb_set(COALESCE(metadata, '{}'), '{description}', $${paramIndex})`,
          );
          values.push(JSON.stringify(op.description));
        }

        if (setParts.length > 0) {
          values.push(op.browserId);
          await pool.query(
            `UPDATE mcp_browsers SET ${setParts.join(', ')} WHERE browser_id = $${values.length}`,
            values,
          );
        }
      } else if (op.op === 'delete_user') {
        await pool.query('DELETE FROM mcp_users WHERE user_id = $1', [
          op.userId,
        ]);
      } else if (op.op === 'unbind_browser') {
        await pool.query('DELETE FROM mcp_browsers WHERE browser_id = $1', [
          op.browserId,
        ]);
      } else if (op.op === 'update_last_connected') {
        await pool.query(
          'UPDATE mcp_browsers SET last_connected_at = $1 WHERE browser_id = $2',
          [op.timestamp, op.browserId],
        );
      } else if (op.op === 'increment_tool_call') {
        await pool.query(
          'UPDATE mcp_browsers SET tool_call_count = tool_call_count + 1 WHERE browser_id = $1',
          [op.browserId],
        );
      }
    } catch (error) {
      errorCount++;
      console.error(
        `\n⚠️  导入失败 (行 ${i + 1}):`,
        error instanceof Error ? error.message : error,
      );
    }
  }

  console.log('\n\n✅ 迁移完成！\n');
  console.log('📊 迁移统计:');
  console.log(`   - 用户数: ${userCount}`);
  console.log(`   - 浏览器数: ${browserCount}`);
  console.log(`   - 错误数: ${errorCount}\n`);

  // 5. 验证
  console.log('🔍 验证数据...');
  const userResult = await pool.query('SELECT COUNT(*) FROM mcp_users');
  const browserResult = await pool.query('SELECT COUNT(*) FROM mcp_browsers');

  console.log(`   - 数据库用户数: ${userResult.rows[0].count}`);
  console.log(`   - 数据库浏览器数: ${browserResult.rows[0].count}\n`);

  await pool.end();
}

// 命令行参数
const args = process.argv.slice(2);
const config: MigrationConfig = {
  jsonlPath: process.env.JSONL_PATH || '.mcp-data/store-v2.jsonl',
  dbHost: process.env.DB_HOST || 'localhost',
  dbPort: parseInt(process.env.DB_PORT || '5432'),
  dbName: process.env.DB_NAME || 'mcp_devtools',
  dbUser: process.env.DB_USER || 'admin',
  dbPassword: process.env.DB_PASSWORD || 'admin',
};

// 帮助信息
if (args.includes('--help') || args.includes('-h')) {
  console.log(`
数据迁移工具 - JSONL → PostgreSQL

使用方法:
  node scripts/migrate-to-postgres.js [选项]

环境变量:
  JSONL_PATH     - JSONL 文件路径 (默认: .mcp-data/store-v2.jsonl)
  DB_HOST        - 数据库主机 (默认: localhost)
  DB_PORT        - 数据库端口 (默认: 5432)
  DB_NAME        - 数据库名称 (默认: mcp_devtools)
  DB_USER        - 数据库用户 (默认: admin)
  DB_PASSWORD    - 数据库密码 (默认: admin)

示例:
  # 使用默认配置
  node scripts/migrate-to-postgres.js

  # 使用环境变量
  DB_HOST=192.168.0.205 DB_PASSWORD=mypassword node scripts/migrate-to-postgres.js

  # 使用自定义 JSONL 文件
  JSONL_PATH=/path/to/store.jsonl node scripts/migrate-to-postgres.js
`);
  process.exit(0);
}

// 执行迁移
console.log('配置信息:');
console.log(`  JSONL 文件: ${config.jsonlPath}`);
console.log(
  `  数据库: ${config.dbUser}@${config.dbHost}:${config.dbPort}/${config.dbName}\n`,
);

migrate(config).catch(error => {
  console.error('❌ 迁移失败:', error);
  process.exit(1);
});
