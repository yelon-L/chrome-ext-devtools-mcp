/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * 扩展发现工具
 * 
 * 提供扩展列表和详情查询功能
 */

import z from 'zod';

import {ToolCategories} from '../categories.js';
import {defineTool} from '../ToolDefinition.js';

export const listExtensions = defineTool({
  name: 'list_extensions',
  description: `List all installed Chrome extensions with their metadata.

**Purpose**: Discover and enumerate all extensions in the current Chrome instance.

**What it shows**:
- Extension ID (32-character identifier needed for other tools)
- Name, version, and description
- Manifest version (MV2 or MV3)
- Enabled/disabled status
- Service Worker status (for MV3 extensions: Active 🟢 / Inactive 🔴)
- Permissions and host permissions
- Background script URL

**When to use**: This is typically the FIRST tool to call when working with extensions. Use it to:
- Get the extension ID for other debugging tools
- Check which extensions are installed
- Verify extension is enabled and Service Worker is active (MV3)
- Quick overview of extension permissions

**Example**: list_extensions returns "MyExtension" with ID "abcd..." and shows Service Worker is 🔴 Inactive, indicating you need to activate it first.`,
  annotations: {
    category: ToolCategories.EXTENSION_DEBUGGING,
    readOnlyHint: true,
  },
  schema: {
    includeDisabled: z
      .boolean()
      .optional()
      .describe(
        'Whether to include disabled extensions in the results. Default is false.',
      ),
  },
  handler: async (request, response, context) => {
    const extensions = await context.getExtensions(
      request.params.includeDisabled,
    );

    if (extensions.length === 0) {
      response.appendResponseLine('# 未检测到扩展\n');
      response.appendResponseLine('当前 Chrome 会话中没有检测到已启用的扩展。\n');
      
      response.appendResponseLine('## 💡 可能原因\n');
      response.appendResponseLine('1. **未安装扩展** - 这是一个全新的 Chrome 配置文件');
      response.appendResponseLine('2. **所有扩展都已禁用** - 扩展已安装但处于关闭状态');
      response.appendResponseLine('3. **Chrome 启动时机问题** - Chrome 在扩展加载前就启动了远程调试');
      response.appendResponseLine('4. **连接到错误的配置文件** - 请验证连接的是正确的 Chrome 实例\n');
      
      response.appendResponseLine('## 🔍 推荐排查步骤\n');
      
      response.appendResponseLine('### 方案 1: 可视化检查 (⭐ 推荐)');
      response.appendResponseLine('使用工具导航到扩展管理页面，直观查看所有扩展（包括禁用的）：');
      response.appendResponseLine('```javascript');
      response.appendResponseLine('// 步骤 1: 导航到扩展管理页面');
      response.appendResponseLine('navigate_to({ url: "chrome://extensions/" })');
      response.appendResponseLine('');
      response.appendResponseLine('// 步骤 2: 截图查看');
      response.appendResponseLine('screenshot()');
      response.appendResponseLine('');
      response.appendResponseLine('// 步骤 3: 分析截图');
      response.appendResponseLine('// - 查看是否有已安装但禁用的扩展');
      response.appendResponseLine('// - 如果有禁用的扩展，点击开关启用');
      response.appendResponseLine('// - 启用后，如果是 MV3 扩展，还需点击 "Service worker" 链接激活');
      response.appendResponseLine('```');
      response.appendResponseLine('**优势**: 可以看到 Chrome 实际的扩展列表，包括 API 无法检测的禁用扩展。\n');
      
      response.appendResponseLine('### 方案 2: 查询包含禁用扩展');
      response.appendResponseLine('尝试列出所有扩展（包括已禁用的）：');
      response.appendResponseLine('```javascript');
      response.appendResponseLine('list_extensions({ includeDisabled: true })');
      response.appendResponseLine('```');
      response.appendResponseLine('如果返回结果包含 "❌ Disabled" 状态的扩展，说明扩展已安装但被禁用。\n');
      
      response.appendResponseLine('### 方案 3: 手动启用扩展');
      response.appendResponseLine('如果确认扩展已安装但被禁用：');
      response.appendResponseLine('1. 导航到 `chrome://extensions/`');
      response.appendResponseLine('2. 找到目标扩展');
      response.appendResponseLine('3. **点击开关启用扩展** (这是关键步骤)');
      response.appendResponseLine('4. 如果是 Manifest V3 扩展：');
      response.appendResponseLine('   - 启用后，点击 "Service worker" 文字链接');
      response.appendResponseLine('   - 这会激活 Service Worker (必须步骤)');
      response.appendResponseLine('5. 重新运行 `list_extensions` 验证扩展已启用且 SW 为 🟢 Active\n');
      
      response.appendResponseLine('### 方案 4: 安装测试扩展');
      response.appendResponseLine('如果确实没有扩展：');
      response.appendResponseLine('1. 打开 chrome://extensions/');
      response.appendResponseLine('2. 启用"开发者模式"（右上角开关）');
      response.appendResponseLine('3. 点击"加载已解压的扩展程序"或从 Chrome 网上应用店安装');
      response.appendResponseLine('4. 安装后重新运行 `list_extensions`\n');
      
      response.appendResponseLine('## ⚠️  常见问题');
      response.appendResponseLine('**扩展被禁用的常见原因**:');
      response.appendResponseLine('- 用户手动禁用');
      response.appendResponseLine('- Chrome 策略自动禁用（企业环境）');
      response.appendResponseLine('- 扩展更新失败导致自动禁用');
      response.appendResponseLine('- 扩展崩溃次数过多被 Chrome 禁用\n');
      
      response.appendResponseLine('💡 **AI 提示**: 始终先使用 `navigate_to` 工具跳转到 chrome://extensions/ 页面并截图，这样可以直观看到所有扩展的状态，包括禁用的扩展。');
      
      response.setIncludePages(true);
      return;
    }

    response.appendResponseLine(
      `# Installed Extensions (${extensions.length})\n`,
    );

    for (const ext of extensions) {
      response.appendResponseLine(`## ${ext.name}`);
      response.appendResponseLine(`- **ID**: ${ext.id}`);
      response.appendResponseLine(`- **Version**: ${ext.version}`);
      response.appendResponseLine(
        `- **Manifest Version**: ${ext.manifestVersion}`,
      );
      if (ext.description) {
        response.appendResponseLine(`- **Description**: ${ext.description}`);
      }
      response.appendResponseLine(
        `- **Status**: ${ext.enabled ? '✅ Enabled' : '❌ Disabled'}`,
      );
      
      // 禁用扩展的详细提示
      if (!ext.enabled) {
        response.appendResponseLine(
          `  - ⚠️  **扩展已禁用**: 所有调试工具无法使用`
        );
        response.appendResponseLine(
          `  - **启用步骤**:`
        );
        response.appendResponseLine(
          `    1. 导航到 chrome://extensions/ 页面 (使用 \`navigate_to\` 工具)`
        );
        response.appendResponseLine(
          `    2. 找到 "${ext.name}" 扩展`
        );
        response.appendResponseLine(
          `    3. 点击开关启用该扩展`
        );
        response.appendResponseLine(
          `    4. 如果是 MV3 扩展，启用后需要激活 Service Worker`
        );
        response.appendResponseLine(
          `    5. 重新运行 \`list_extensions\` 验证状态`
        );
      }

      // Service Worker 状态（仅 MV3 且已启用）
      if (ext.enabled && ext.manifestVersion === 3 && ext.serviceWorkerStatus) {
        const statusEmoji = {
          active: '🟢',
          inactive: '🔴',
          not_found: '⚠️',
        }[ext.serviceWorkerStatus];
        const statusText = {
          active: 'Active',
          inactive: 'Inactive',
          not_found: 'Not Found',
        }[ext.serviceWorkerStatus];
        response.appendResponseLine(
          `- **Service Worker**: ${statusEmoji} ${statusText}`,
        );
        
        // Add helpful note for inactive SW
        if (ext.serviceWorkerStatus === 'inactive') {
          response.appendResponseLine(
            `  - ⚠️  **Service Worker 未激活**: 影响工具调用`,
          );
          response.appendResponseLine(
            `  - **影响范围**: evaluate_in_extension, inspect_extension_storage, get_extension_logs 等工具将无法使用`,
          );
          response.appendResponseLine(
            `  - **推荐方案**:`,
          );
          response.appendResponseLine(
            `    1. 使用 \`activate_extension_service_worker\` 工具 (extensionId="${ext.id}")`,
          );
          response.appendResponseLine(
            `    2. 或者导航到 chrome://extensions/，找到该扩展，点击 "Service worker" 链接激活`,
          );
          response.appendResponseLine(
            `    3. 激活后再次运行 \`list_extensions\` 验证状态为 🟢 Active`,
          );
        } else if (ext.serviceWorkerStatus === 'not_found') {
          response.appendResponseLine(
            `  - ⚠️  **Service Worker 未找到**: 可能是 manifest.json 配置问题`,
          );
          response.appendResponseLine(
            `  - **建议**: 检查扩展的 manifest.json 中 background.service_worker 配置`,
          );
        }
      }

      if (ext.permissions && ext.permissions.length > 0) {
        response.appendResponseLine(
          `- **Permissions**: ${ext.permissions.join(', ')}`,
        );
      }

      if (ext.hostPermissions && ext.hostPermissions.length > 0) {
        response.appendResponseLine(
          `- **Host Permissions**: ${ext.hostPermissions.join(', ')}`,
        );
      }

      if (ext.backgroundUrl) {
        response.appendResponseLine(`- **Background**: ${ext.backgroundUrl}`);
      }

      response.appendResponseLine('');
    }

    response.setIncludePages(true);
  },
});

export const getExtensionDetails = defineTool({
  name: 'get_extension_details',
  description: `Get detailed information about a specific Chrome extension.

**Purpose**: Retrieve comprehensive metadata and configuration for a single extension.

**What it provides**:
- Complete manifest information
- All permissions (API permissions + host permissions)
- Background script/Service Worker details
- Content script configurations
- Extension pages (popup, options, devtools)
- Installation and update information

**When to use**:
- After list_extensions to get full details about one extension
- To inspect permission requirements
- To verify manifest configuration
- To check background script setup

**Example**: get_extension_details with extensionId="abcd..." shows all 15 permissions, 3 content scripts, and Service Worker URL.`,
  annotations: {
    category: ToolCategories.EXTENSION_DEBUGGING,
    readOnlyHint: true,
  },
  schema: {
    extensionId: z
      .string()
      .regex(/^[a-z]{32}$/)
      .describe(
        'Extension ID (32 lowercase letters). Get this from list_extensions.',
      ),
  },
  handler: async (request, response, context) => {
    const {extensionId} = request.params;

    const ext = await context.getExtensionDetails(extensionId);

    if (!ext) {
      response.appendResponseLine(
        `Extension with ID ${extensionId} not found. It may be disabled or uninstalled.`,
      );
      response.appendResponseLine(
        '\nUse list_extensions with includeDisabled=true to see all extensions.',
      );
      response.setIncludePages(true);
      return;
    }

    response.appendResponseLine(`# Extension Details: ${ext.name}\n`);
    response.appendResponseLine(`## Basic Information`);
    response.appendResponseLine(`- **ID**: ${ext.id}`);
    response.appendResponseLine(`- **Name**: ${ext.name}`);
    response.appendResponseLine(`- **Version**: ${ext.version}`);
    response.appendResponseLine(
      `- **Manifest Version**: MV${ext.manifestVersion}`,
    );
    response.appendResponseLine(
      `- **Status**: ${ext.enabled ? '✅ Enabled' : '❌ Disabled'}`,
    );

    if (ext.description) {
      response.appendResponseLine(
        `- **Description**: ${ext.description}\n`,
      );
    }

    // Permissions
    if (ext.permissions && ext.permissions.length > 0) {
      response.appendResponseLine(`## Permissions`);
      ext.permissions.forEach((perm) => {
        response.appendResponseLine(`- ${perm}`);
      });
      response.appendResponseLine('');
    }

    // Host Permissions
    if (ext.hostPermissions && ext.hostPermissions.length > 0) {
      response.appendResponseLine(`## Host Permissions`);
      ext.hostPermissions.forEach((host) => {
        response.appendResponseLine(`- ${host}`);
      });
      response.appendResponseLine('');
    }

    // Background
    if (ext.backgroundUrl) {
      response.appendResponseLine(`## Background Script`);
      response.appendResponseLine(`- **URL**: ${ext.backgroundUrl}`);
      response.appendResponseLine('');
    }

    response.setIncludePages(true);
  },
});
