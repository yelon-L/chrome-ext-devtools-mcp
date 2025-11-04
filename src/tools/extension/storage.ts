/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Extension storage inspection tool
 */

import z from 'zod';

import {ToolCategories} from '../categories.js';
import {defineTool} from '../ToolDefinition.js';
import {
  reportExtensionNotFound,
  reportNoBackgroundContext,
} from '../utils/ErrorReporting.js';

export const inspectExtensionStorage = defineTool({
  name: 'inspect_extension_storage',
  description: `Inspect extension storage (local, sync, session, or managed).

🎯 **For AI**: Check Service Worker status with list_extensions first. Use activate_extension_service_worker if SW is 🔴 Inactive.

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
    category: ToolCategories.EXTENSION_INSPECTION,
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

    // ✅ Following reload_extension pattern: check preconditions first
    // 1. Check if extension exists
    const extensions = await context.getExtensions();
    const extension = extensions.find(e => e.id === extensionId);

    if (!extension) {
      reportExtensionNotFound(response, extensionId, extensions);
      response.setIncludePages(true);
      return;
    }

    // 2. Check Service Worker status (MV3 only)
    if (
      extension.manifestVersion === 3 &&
      extension.serviceWorkerStatus !== 'active'
    ) {
      reportNoBackgroundContext(response, extensionId, extension);
      response.setIncludePages(true);
      return;
    }

    try {
      const storage = await context.getExtensionStorage(
        extensionId,
        storageType,
      );

      response.appendResponseLine(`# Extension Storage: ${storageType}\n`);
      response.appendResponseLine(`**Extension ID**: ${extensionId}`);
      response.appendResponseLine(`**Extension Name**: ${extension.name}`);

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
    } catch (error) {
      // ✅ Following navigate_page_history pattern: distinguish error types
      const errorMsg = error instanceof Error ? error.message : String(error);

      if (
        errorMsg.includes('Storage type') &&
        errorMsg.includes('not available')
      ) {
        response.appendResponseLine(
          `❌ Storage type "${storageType}" is not available for this extension.\n`,
        );
        response.appendResponseLine('**Available types**:');
        response.appendResponseLine('- `local` - Local storage (5MB quota)');
        response.appendResponseLine(
          '- `sync` - Sync storage (100KB quota, syncs across devices)',
        );
        if (extension.manifestVersion === 3) {
          response.appendResponseLine(
            '- `session` - Session storage (10MB quota, MV3 only)',
          );
        }
        response.appendResponseLine(
          '- `managed` - Managed storage (enterprise policies only)',
        );
      } else if (errorMsg.includes('chrome.storage API not available')) {
        response.appendResponseLine(
          '❌ The extension does not have storage permission.\n',
        );
        response.appendResponseLine(
          '**Required permission**: Add `"storage"` to `permissions` array in manifest.json',
        );
        response.appendResponseLine('');
        response.appendResponseLine('**Related tools**:');
        response.appendResponseLine(
          '- `get_extension_details` - Check extension permissions',
        );
        response.appendResponseLine(
          '- `inspect_extension_manifest` - Inspect manifest.json',
        );
      } else {
        // Generic error message for other cases
        response.appendResponseLine(
          'Unable to inspect extension storage. The storage API may be unavailable or the operation failed.',
        );
      }
    }

    response.setIncludePages(true);
  },
});
