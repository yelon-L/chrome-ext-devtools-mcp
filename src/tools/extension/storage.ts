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
    } catch {
      // ✅ Following navigate_page_history pattern: simple error message
      response.appendResponseLine(
        'Unable to inspect extension storage. The extension may be inactive or lack storage permission.',
      );
    }

    response.setIncludePages(true);
  },
});
