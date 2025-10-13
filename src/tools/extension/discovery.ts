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
      response.appendResponseLine('# No Extensions Found\n');
      response.appendResponseLine('No Chrome extensions were detected in this browser session.\n');
      
      response.appendResponseLine('## Possible Reasons:\n');
      response.appendResponseLine('1. **No extensions installed** - This is a fresh Chrome profile');
      response.appendResponseLine('2. **All extensions are disabled** - Try `list_extensions` with includeDisabled=true');
      response.appendResponseLine('3. **Chrome started before extensions loaded** - Restart Chrome with remote debugging');
      response.appendResponseLine('4. **Wrong Chrome profile** - Verify you\'re connected to the correct profile\n');
      
      response.appendResponseLine('## 🔍 Recommended Debugging Steps:\n');
      response.appendResponseLine('### Option 1: Visual Inspection (Recommended)');
      response.appendResponseLine('Navigate to chrome://extensions/ to see what Chrome actually shows:');
      response.appendResponseLine('```');
      response.appendResponseLine('1. navigate_to with url="chrome://extensions/"');
      response.appendResponseLine('2. screenshot');
      response.appendResponseLine('3. Analyze screenshot to identify installed extensions and their status');
      response.appendResponseLine('```');
      response.appendResponseLine('This will show all extensions, even if they weren\'t detected by the API.\n');
      
      response.appendResponseLine('### Option 2: Include Disabled Extensions');
      response.appendResponseLine('```');
      response.appendResponseLine('list_extensions with includeDisabled=true');
      response.appendResponseLine('```\n');
      
      response.appendResponseLine('### Option 3: Install Test Extension');
      response.appendResponseLine('1. Open chrome://extensions/');
      response.appendResponseLine('2. Enable "Developer mode"');
      response.appendResponseLine('3. Load an unpacked extension or install from Chrome Web Store');
      response.appendResponseLine('4. Retry list_extensions\n');
      
      response.appendResponseLine('💡 **For AI**: Use `navigate_to` + `screenshot` to visually inspect the chrome://extensions/ page and identify any extensions');
      
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

      // Service Worker 状态（仅 MV3）
      if (ext.manifestVersion === 3 && ext.serviceWorkerStatus) {
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
            `  - ⚠️  **Note**: Inactive SW blocks: evaluate_in_extension, inspect_extension_storage, etc.`,
          );
          response.appendResponseLine(
            `  - **Quick fix**: Use \`activate_extension_service_worker\` with extensionId="${ext.id}"`,
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
