/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * 版本号注入脚本
 * 将 package.json 中的版本号注入到 src/version.ts
 */

import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, '..');

// 读取 package.json
const packageJsonPath = path.join(projectRoot, 'package.json');
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
const version = packageJson.version;

// 生成 version.ts
const versionTsPath = path.join(projectRoot, 'src', 'version.ts');
const versionTsContent = `/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * 版本号
 * 此文件由构建脚本自动生成，请勿手动修改
 */
export const VERSION = '${version}';
`;

fs.writeFileSync(versionTsPath, versionTsContent, 'utf-8');

console.log(`✅ 版本号已注入: ${version}`);
