/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * 扩展 Storage 监控工具
 * 
 * 实时监控扩展 Storage 的变化
 */

import {z} from 'zod';

import {ToolCategories} from './categories.js';
import {defineTool} from './ToolDefinition.js';

/**
 * Storage 变化事件类型定义（匹配 Context 返回类型）
 */
interface ExtensionStorageChange {
  timestamp: number;
  storageArea: string;
  changes: Record<string, {oldValue?: unknown; newValue?: unknown}>;
}

/**
 * 监控扩展 Storage 变化
 * 实时捕获 chrome.storage.onChanged 事件
 */
export const watchExtensionStorage = defineTool({
  name: 'watch_extension_storage',
  description: `Watch extension storage changes in real-time.

Monitors chrome.storage.onChanged events to track data modifications.
Useful for debugging data persistence, state management, and synchronization issues.

**Supported storage types**:
- local: Local storage (5MB quota)
- sync: Sync storage (100KB quota, syncs across devices)
- session: Session storage (10MB quota, MV3 only)
- managed: Managed storage (enterprise, read-only)

**Captured information**:
- Timestamp of each change
- Storage area (local/sync/session/managed)
- Changed keys with old and new values

**Usage tips**:
- Start monitoring before making storage changes
- Default duration is 30 seconds
- Multiple storage types can be monitored simultaneously
- Changes are captured in real-time with timestamps`,
  annotations: {
    category: ToolCategories.EXTENSION_DEBUGGING,
    readOnlyHint: true,
  },
  schema: {
    extensionId: z
      .string()
      .regex(/^[a-z]{32}$/)
      .describe('Extension ID (32 lowercase letters)'),
    duration: z
      .number()
      .positive()
      .optional()
      .describe('Monitoring duration in milliseconds. Default is 30000 (30 seconds).'),
    storageTypes: z
      .array(z.enum(['local', 'sync', 'session', 'managed']))
      .optional()
      .describe('Storage types to monitor. Default is ["local"].'),
  },
  handler: async (request, response, context) => {
    const {
      extensionId,
      duration = 30000,
      storageTypes = ['local'],
    } = request.params;

    try {
      response.appendResponseLine(`# Extension Storage Monitoring\n`);
      response.appendResponseLine(`**Extension ID**: ${extensionId}`);
      response.appendResponseLine(`**Duration**: ${duration / 1000} seconds`);
      response.appendResponseLine(`**Storage Types**: ${storageTypes.join(', ')}\n`);
      response.appendResponseLine(`⏳ Monitoring started... Make storage changes in the extension.\n`);

      const changes = await context.watchExtensionStorage(
        extensionId,
        storageTypes,
        duration,
      );

      response.appendResponseLine(`\n## Captured Changes (${changes.length})\n`);

      if (changes.length === 0) {
        response.appendResponseLine('*No storage changes detected during the monitoring period*\n');
        response.appendResponseLine('**Suggestions**:');
        response.appendResponseLine('- Increase monitoring duration');
        response.appendResponseLine('- Trigger actions that modify storage');
        response.appendResponseLine('- Ensure the extension has write permissions for the storage type');
        response.appendResponseLine('- Check if Service Worker is active');
      } else {
        changes.forEach((change: ExtensionStorageChange, index: number) => {
          const time = new Date(change.timestamp).toLocaleTimeString();
          const changedKeys = Object.keys(change.changes);
          
          response.appendResponseLine(`### 🔄 Change ${index + 1} - ${change.storageArea} storage`);
          response.appendResponseLine(`**Time**: ${time}`);
          response.appendResponseLine(`**Keys Changed**: ${changedKeys.join(', ')}\n`);

          // 详细显示每个键的变化
          changedKeys.forEach(key => {
            const {oldValue, newValue} = change.changes[key];
            
            response.appendResponseLine(`#### Key: \`${key}\``);
            
            if (oldValue !== undefined) {
              response.appendResponseLine(`**Old Value**:`);
              response.appendResponseLine('```json');
              response.appendResponseLine(JSON.stringify(oldValue, null, 2));
              response.appendResponseLine('```');
            } else {
              response.appendResponseLine(`**Old Value**: *undefined (new key)*`);
            }
            
            if (newValue !== undefined) {
              response.appendResponseLine(`**New Value**:`);
              response.appendResponseLine('```json');
              response.appendResponseLine(JSON.stringify(newValue, null, 2));
              response.appendResponseLine('```');
            } else {
              response.appendResponseLine(`**New Value**: *undefined (key removed)*`);
            }
            
            response.appendResponseLine('');
          });
        });

        // 统计信息
        const byStorageType: Record<string, number> = {};
        changes.forEach((change: ExtensionStorageChange) => {
          byStorageType[change.storageArea] = (byStorageType[change.storageArea] || 0) + 1;
        });

        response.appendResponseLine(`\n## Statistics\n`);
        response.appendResponseLine(`- **Total Changes**: ${changes.length}`);
        response.appendResponseLine('- **By Storage Type**:');
        Object.entries(byStorageType).forEach(([type, count]) => {
          response.appendResponseLine(`  - ${type}: ${count} changes`);
        });

        // 分析频繁变化
        const allKeys: Record<string, number> = {};
        changes.forEach((change: ExtensionStorageChange) => {
          Object.keys(change.changes).forEach((key: string) => {
            allKeys[key] = (allKeys[key] || 0) + 1;
          });
        });

        const frequentKeys = Object.entries(allKeys)
          .filter(([, count]) => count > 1)
          .sort((a, b) => b[1] - a[1]);

        if (frequentKeys.length > 0) {
          response.appendResponseLine('\n- **Frequently Changed Keys**:');
          frequentKeys.forEach(([key, count]) => {
            response.appendResponseLine(`  - \`${key}\`: ${count} times`);
          });
        }
      }

      response.setIncludePages(true);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to watch storage: ${message}`);
    }
  },
});
