/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import path from 'node:path';

/**
 * 手动加载 .env 文件
 * 不依赖 dotenv 包，减少依赖
 */
export function loadEnvFile(envPath?: string): void {
  // 默认路径：当前工作目录的 .env
  const finalPath = envPath || path.join(process.cwd(), '.env');

  if (!fs.existsSync(finalPath)) {
    // .env 文件不存在是正常的（可能使用系统环境变量）
    return;
  }

  try {
    const content = fs.readFileSync(finalPath, 'utf-8');
    const lines = content.split('\n');

    for (const line of lines) {
      // 跳过空行和注释
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) {
        continue;
      }

      // 解析 KEY=VALUE
      const match = trimmed.match(/^([^=]+)=(.*)$/);
      if (!match) {
        continue;
      }

      const key = match[1].trim();
      let value = match[2].trim();

      // 移除引号
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }

      // 只在环境变量不存在时设置（环境变量优先级更高）
      if (process.env[key] === undefined) {
        process.env[key] = value;
      }
    }

    console.log(`✅ Loaded environment variables from: ${finalPath}`);
  } catch (error) {
    console.warn(`⚠️  Failed to load .env file from ${finalPath}:`, error);
  }
}
