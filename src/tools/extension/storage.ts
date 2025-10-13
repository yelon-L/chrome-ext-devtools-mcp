/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * 扩展存储检查工具
 */

import z from 'zod';

import {ToolCategories} from '../categories.js';
import {defineTool} from '../ToolDefinition.js';

export const inspectExtensionStorage = defineTool({
  name: 'inspect_extension_storage',
  description: `Inspect extension storage (local, sync, session, or managed).

**Purpose**: Read and inspect data stored by an extension using chrome.storage API.

**Storage types**:
- **local**: 5MB quota, persists across restarts, not synced
- **sync**: 100KB quota, syncs across devices (same Google account)
- **session**: 10MB quota, cleared on browser close (MV3 only)
- **managed**: Enterprise policies (read-only for extension)

**What it shows**:
- All key-value pairs in the storage area
- Storage quota and current usage
- Data size per key
- Storage type and limits

**When to use**:
- Debug data persistence issues
- Verify extension is saving/loading data correctly
- Check storage quota usage
- Inspect synced data across devices
- Troubleshoot "data not persisting" bugs

**⚠️ MV3 prerequisite**:
- Service Worker MUST be active to access chrome.storage
- Check SW status with list_extensions first
- Use activate_extension_service_worker if SW is 🔴 Inactive
- Inactive SW will cause this tool to fail

**Example**: inspect_extension_storage with storageType="local" shows 15 keys totaling 2.3MB of 5MB quota.`,
  annotations: {
    category: ToolCategories.EXTENSION_DEBUGGING,
    readOnlyHint: true,
  },
  schema: {
    extensionId: z
      .string()
      .regex(/^[a-z]{32}$/)
      .describe('Extension ID (32 lowercase letters)'),
    storageType: z
      .enum(['local', 'sync', 'session', 'managed'])
      .optional()
      .describe(
        'Storage type to inspect. Default is "local". session is only available in MV3.',
      ),
  },
  handler: async (request, response, context) => {
    const {extensionId, storageType = 'local'} = request.params;

    try {
      const storage = await context.getExtensionStorage(
        extensionId,
        storageType,
      );

      response.appendResponseLine(`# Extension Storage: ${storageType}\n`);
      response.appendResponseLine(`**Extension ID**: ${extensionId}`);

      // Display quota information
      if (storage.bytesUsed !== undefined && storage.quota !== undefined) {
        const usagePercent = (
          (storage.bytesUsed / storage.quota) *
          100
        ).toFixed(2);
        response.appendResponseLine(
          `**Storage Usage**: ${storage.bytesUsed} / ${storage.quota} bytes (${usagePercent}%)`,
        );
      }

      response.appendResponseLine('\n## Stored Data\n');

      if (Object.keys(storage.data).length === 0) {
        response.appendResponseLine('*No data stored*');
      } else {
        // Format JSON output
        const formatted = JSON.stringify(storage.data, null, 2);
        response.appendResponseLine('```json');
        response.appendResponseLine(formatted);
        response.appendResponseLine('```');
      }

      response.setIncludePages(true);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      
      response.appendResponseLine(`# ❌ Storage Inspection Failed\n`);
      response.appendResponseLine(`**Extension ID**: ${extensionId}`);
      response.appendResponseLine(`**Storage Type**: ${storageType}\n`);
      response.appendResponseLine(`**Error**: ${message}\n`);
      
      // Smart detection of Service Worker related errors
      if (
        message.includes('No background context') ||
        message.includes('Service Worker') ||
        message.includes('inactive') ||
        message.includes('not running') ||
        message.includes('context') ||
        message.toLowerCase().includes('sw')
      ) {
        response.appendResponseLine(`## 🔴 Service Worker Issue Detected\n`);
        response.appendResponseLine(`For MV3 extensions, chrome.storage API requires an active Service Worker.\n`);
        response.appendResponseLine(`**Solution**:`);
        response.appendResponseLine(`1. Check SW status: \`list_extensions\` (look for 🔴 Inactive)`);
        response.appendResponseLine(`2. Activate SW: \`activate_extension_service_worker\` with extensionId="${extensionId}"`);
        response.appendResponseLine(`3. Retry: \`inspect_extension_storage\` with extensionId="${extensionId}"\n`);
        response.appendResponseLine(`**Why this happens**: MV3 Service Workers become inactive after ~30 seconds of inactivity.`);
      } else {
        response.appendResponseLine(`**Possible causes**:`);
        response.appendResponseLine(`- Extension is disabled or uninstalled`);
        response.appendResponseLine(`- Extension ID is incorrect`);
        response.appendResponseLine(`- Storage type "${storageType}" is not supported by this extension`);
        response.appendResponseLine(`- Extension lacks storage permissions in manifest`);
      }
      
      response.setIncludePages(true);
    }
  },
});
