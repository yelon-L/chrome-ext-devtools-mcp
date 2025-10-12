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

Retrieves data from the specified storage area of a Chrome extension using chrome.storage API.
Shows storage quota, usage, and all stored key-value pairs. This is essential for debugging
data persistence issues in extensions.

Storage types:
- local: 5MB quota, persists across browser restarts
- sync: 100KB quota, syncs across devices signed into same account
- session: 10MB quota, cleared when browser closes (MV3 only)
- managed: Enterprise-managed storage (read-only for extension)

⚠️ **Prerequisites for MV3 extensions**:
- Service Worker MUST be active to access chrome.storage API
- If SW is inactive, this tool may fail or return incomplete data
- Use 'activate_extension_service_worker' first if SW status is 🔴 Inactive`,
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
      throw new Error(`Failed to inspect storage: ${message}`);
    }
  },
});
