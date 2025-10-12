/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

/**
 * 读取 package.json 获取版本号
 */
export function readPackageJson(): {version?: string; name?: string} {
  const currentDir = import.meta.dirname;
  const packageJsonPath = path.join(currentDir, '..', '..', '..', 'package.json');
  if (!fs.existsSync(packageJsonPath)) {
    return {};
  }
  try {
    const json = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
    assert.strict(json['name'], 'chrome-extension-debug-mcp');
    return json;
  } catch {
    return {};
  }
}

/**
 * 检查 Node.js 版本是否满足要求
 * 需要 Node 20.19.0+ 或 22.12.0+ 或 23+
 */
export function checkNodeVersion(): void {
  const version = process.version;
  const [major, minor] = version.substring(1).split('.').map(Number);

  if (major === 20 && minor < 19) {
    console.error(
      `ERROR: \`chrome-extension-debug-mcp\` does not support Node ${version}. Please upgrade to Node 20.19.0 LTS or a newer LTS.`,
    );
    process.exit(1);
  }

  if (major === 22 && minor < 12) {
    console.error(
      `ERROR: \`chrome-extension-debug-mcp\` does not support Node ${version}. Please upgrade to Node 22.12.0 LTS or a newer LTS.`,
    );
    process.exit(1);
  }

  if (major < 20) {
    console.error(
      `ERROR: \`chrome-extension-debug-mcp\` does not support Node ${version}. Please upgrade to Node 20.19.0 LTS or a newer LTS.`,
    );
    process.exit(1);
  }
}
