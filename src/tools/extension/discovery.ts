/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Extension discovery tool
 * 
 * Provides extension listing and details query functionality
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
      response.appendResponseLine('# No Extensions Detected\n');
      response.appendResponseLine('No enabled extensions detected in the current Chrome session.\n');
      
      response.appendResponseLine('## 💡 Possible Reasons\n');
      response.appendResponseLine('1. **No Extensions Installed** - This is a fresh Chrome profile');
      response.appendResponseLine('2. **All Extensions Disabled** - Extensions are installed but turned off');
      response.appendResponseLine('3. **Chrome Startup Timing** - Chrome remote debugging started before extensions loaded');
      response.appendResponseLine('4. **Wrong Profile** - Verify you are connected to the correct Chrome instance\n');
      
      response.appendResponseLine('## 🔍 Recommended Troubleshooting Steps\n');
      
      response.appendResponseLine('### Option 1: Visual Inspection (⭐ Recommended)');
      response.appendResponseLine('Navigate to the extensions management page to visually see all extensions (including disabled ones):');
      response.appendResponseLine('```javascript');
      response.appendResponseLine('// Step 1: Navigate to extensions page');
      response.appendResponseLine('navigate_to({ url: "chrome://extensions/" })');
      response.appendResponseLine('');
      response.appendResponseLine('// Step 2: Take a screenshot');
      response.appendResponseLine('screenshot()');
      response.appendResponseLine('');
      response.appendResponseLine('// Step 3: Analyze the screenshot');
      response.appendResponseLine('// - Check if there are installed but disabled extensions');
      response.appendResponseLine('// - If disabled extensions exist, toggle the switch to enable');
      response.appendResponseLine('// - For MV3 extensions, also click "Service worker" link to activate');
      response.appendResponseLine('```');
      response.appendResponseLine('**Advantage**: Shows the actual Chrome extensions list, including disabled extensions that API cannot detect.\n');
      
      response.appendResponseLine('### Option 2: Query Including Disabled Extensions');
      response.appendResponseLine('Try listing all extensions (including disabled ones):');
      response.appendResponseLine('```javascript');
      response.appendResponseLine('list_extensions({ includeDisabled: true })');
      response.appendResponseLine('```');
      response.appendResponseLine('If the result includes extensions with "❌ Disabled" status, they are installed but disabled.\n');
      
      response.appendResponseLine('### Option 3: Manually Enable Extensions');
      response.appendResponseLine('If extensions are confirmed to be installed but disabled:');
      response.appendResponseLine('1. Navigate to `chrome://extensions/`');
      response.appendResponseLine('2. Find the target extension');
      response.appendResponseLine('3. **Click the toggle to enable** (critical step)');
      response.appendResponseLine('4. For Manifest V3 extensions:');
      response.appendResponseLine('   - After enabling, click the "Service worker" text link');
      response.appendResponseLine('   - This activates the Service Worker (required)');
      response.appendResponseLine('5. Re-run `list_extensions` to verify the extension is enabled and SW is 🟢 Active\n');
      
      response.appendResponseLine('### Option 4: Install a Test Extension');
      response.appendResponseLine('If no extensions are installed:');
      response.appendResponseLine('1. Open chrome://extensions/');
      response.appendResponseLine('2. Enable "Developer mode" (toggle in top-right corner)');
      response.appendResponseLine('3. Click "Load unpacked" or install from Chrome Web Store');
      response.appendResponseLine('4. Re-run `list_extensions` after installation\n');
      
      response.appendResponseLine('## ⚠️  Common Issues');
      response.appendResponseLine('**Common reasons for disabled extensions**:');
      response.appendResponseLine('- Manually disabled by user');
      response.appendResponseLine('- Automatically disabled by Chrome policy (enterprise environment)');
      response.appendResponseLine('- Update failure causing automatic disable');
      response.appendResponseLine('- Too many crashes causing Chrome to disable it\n');
      
      response.appendResponseLine('💡 **AI Tip**: Always use the `navigate_to` tool to jump to chrome://extensions/ and take a screenshot first. This provides a visual view of all extension states, including disabled ones.');
      
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
      
      // Detailed hint for disabled extensions
      if (!ext.enabled) {
        response.appendResponseLine(
          `  - ⚠️  **Extension Disabled**: All debugging tools unavailable`
        );
        response.appendResponseLine(
          `  - **Enable Steps**:`
        );
        response.appendResponseLine(
          `    1. Navigate to chrome://extensions/ page (use \`navigate_to\` tool)`
        );
        response.appendResponseLine(
          `    2. Find "${ext.name}" extension`
        );
        response.appendResponseLine(
          `    3. Click the toggle to enable the extension`
        );
        response.appendResponseLine(
          `    4. For MV3 extensions, activate Service Worker after enabling`
        );
        response.appendResponseLine(
          `    5. Re-run \`list_extensions\` to verify status`
        );
      }

      // Service Worker status (MV3 and enabled only)
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
            `  - ⚠️  **Service Worker Not Activated**: Affects tool calls`,
          );
          response.appendResponseLine(
            `  - **Affected Tools**: evaluate_in_extension, inspect_extension_storage, get_extension_logs, etc.`,
          );
          response.appendResponseLine(
            `  - **Recommended Solutions**:`,
          );
          response.appendResponseLine(
            `    1. Use \`activate_extension_service_worker\` tool (extensionId="${ext.id}")`,
          );
          response.appendResponseLine(
            `    2. Or navigate to chrome://extensions/, find the extension, click "Service worker" link`,
          );
          response.appendResponseLine(
            `    3. Re-run \`list_extensions\` to verify status is 🟢 Active`,
          );
        } else if (ext.serviceWorkerStatus === 'not_found') {
          response.appendResponseLine(
            `  - ⚠️  **Service Worker Not Found**: Possible manifest.json configuration issue`,
          );
          response.appendResponseLine(
            `  - **Suggestion**: Check the background.service_worker configuration in manifest.json`,
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
