#!/usr/bin/env node
/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * 生成各种 IDE 的 MCP 配置文件
 */

import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, '..');

// 检测安装方式
const isGlobalInstall = process.env.npm_config_global === 'true';
const projectPath = rootDir;

function getCommand() {
  // 如果是全局安装，使用 chrome-devtools-mcp
  if (isGlobalInstall) {
    return {
      command: 'chrome-extension-debug-mcp',
      args: ['--browser-url', 'http://localhost:9222']
    };
  }
  
  // 本地开发，使用 node 运行
  return {
    command: 'node',
    args: [
      path.join(projectPath, 'build/src/index.js'),
      '--browser-url',
      'http://localhost:9222'
    ]
  };
}

const cmdConfig = getCommand();

const configs = {
  vscode: {
    name: 'VS Code',
    file: '.vscode/settings.json',
    content: {
      "mcpServers": {
        "chrome-extension-debug": cmdConfig
      }
    },
    description: '将此内容添加到 .vscode/settings.json'
  },
  
  cline: {
    name: 'Cline (VS Code Extension)',
    file: 'configs/cline_mcp_settings.json',
    content: {
      "mcpServers": {
        "chrome-extension-debug": {
          ...cmdConfig,
          "disabled": false
        }
      }
    },
    description: '在 Cline 扩展设置中导入此配置'
  },
  
  claude_desktop: {
    name: 'Claude Desktop',
    file: 'configs/claude_desktop_config.json',
    content: {
      "mcpServers": {
        "chrome-extension-debug": {
          ...cmdConfig,
          "env": {}
        }
      }
    },
    description: '复制到 Claude Desktop 配置文件'
  },

  cursor: {
    name: 'Cursor IDE',
    file: 'configs/cursor_mcp_settings.json',
    content: {
      "mcp": {
        "servers": {
          "chrome-extension-debug": cmdConfig
        }
      }
    },
    description: 'Cursor IDE MCP 配置'
  },

  npm_usage: {
    name: 'NPM 使用方式',
    file: 'configs/npm_usage.txt',
    content: `# Chrome Extension Debug MCP - NPM 使用方式

## 全局安装
npm install -g chrome-extension-debug-mcp

# 然后直接运行
chrome-extension-debug-mcp --browser-url http://localhost:9222

## 使用 npx（推荐，无需安装）
npx chrome-extension-debug-mcp --browser-url http://localhost:9222

## IDE 配置（使用 npx）
{
  "command": "npx",
  "args": ["-y", "chrome-extension-debug-mcp", "--browser-url", "http://localhost:9222"]
}

## 本地开发
git clone <repo>
cd chrome-extension-debug-mcp
npm install
npm run build
node build/src/index.js --browser-url http://localhost:9222
`,
    description: 'NPM 使用说明',
    raw: true
  }
};

console.log('╔═══════════════════════════════════════════════════════════╗');
console.log('║  生成 IDE MCP 配置文件                                   ║');
console.log('╚═══════════════════════════════════════════════════════════╝\n');

// 创建 configs 目录
const configsDir = path.join(rootDir, 'configs');
if (!fs.existsSync(configsDir)) {
  fs.mkdirSync(configsDir, {recursive: true});
}

Object.entries(configs).forEach(([key, config]) => {
  const filePath = path.join(rootDir, config.file);
  const dir = path.dirname(filePath);
  
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, {recursive: true});
  }
  
  const content = config.raw 
    ? config.content 
    : JSON.stringify(config.content, null, 2);
  
  fs.writeFileSync(filePath, content);
  console.log(`✅ ${config.name}`);
  console.log(`   文件: ${config.file}`);
  console.log(`   说明: ${config.description}\n`);
});

console.log('╔═══════════════════════════════════════════════════════════╗');
console.log('║  配置文件生成完成！                                      ║');
console.log('╚═══════════════════════════════════════════════════════════╝\n');

console.log('📁 输出目录: configs/\n');

console.log('快速使用：');
console.log('  1. VS Code: 复制 .vscode/settings.json 内容到项目设置');
console.log('  2. Cline: 在扩展设置中导入 configs/cline_mcp_settings.json');
console.log('  3. Claude Desktop: 复制 configs/claude_desktop_config.json');
console.log('  4. 查看 configs/npm_usage.txt 了解 NPM 使用方式\n');
