/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Tool categories for organizing and filtering MCP tools.
 * Categories help AI assistants discover and select appropriate tools.
 */
export enum ToolCategories {
  // Original categories (from chrome-devtools-mcp)
  INPUT_AUTOMATION = 'input_automation',
  NAVIGATION_AUTOMATION = 'navigation_automation',
  EMULATION = 'emulation',
  PERFORMANCE = 'performance',
  NETWORK = 'network',
  DEBUGGING = 'debugging',

  // Extension-specific categories
  EXTENSION_DISCOVERY = 'extension_discovery',
  EXTENSION_LIFECYCLE = 'extension_lifecycle',
  EXTENSION_DEBUGGING = 'extension_debugging',
  EXTENSION_INTERACTION = 'extension_interaction',
  EXTENSION_MONITORING = 'extension_monitoring',
  EXTENSION_INSPECTION = 'extension_inspection',
  BROWSER_INFO = 'browser_info',
}

/**
 * Human-readable labels for tool categories.
 */
export const TOOL_CATEGORY_LABELS: Record<ToolCategories, string> = {
  [ToolCategories.INPUT_AUTOMATION]: 'Input automation',
  [ToolCategories.NAVIGATION_AUTOMATION]: 'Navigation automation',
  [ToolCategories.EMULATION]: 'Emulation',
  [ToolCategories.PERFORMANCE]: 'Performance',
  [ToolCategories.NETWORK]: 'Network',
  [ToolCategories.DEBUGGING]: 'Debugging',

  [ToolCategories.EXTENSION_DISCOVERY]: 'Extension Discovery',
  [ToolCategories.EXTENSION_LIFECYCLE]: 'Extension Lifecycle',
  [ToolCategories.EXTENSION_DEBUGGING]: 'Extension Debugging',
  [ToolCategories.EXTENSION_INTERACTION]: 'Extension Interaction',
  [ToolCategories.EXTENSION_MONITORING]: 'Extension Monitoring',
  [ToolCategories.EXTENSION_INSPECTION]: 'Extension Inspection',
  [ToolCategories.BROWSER_INFO]: 'Browser Information',
};

/**
 * Descriptions for each tool category to help AI understand when to use them.
 */
export const TOOL_CATEGORY_DESCRIPTIONS: Record<ToolCategories, string> = {
  [ToolCategories.INPUT_AUTOMATION]:
    'Tools for simulating user input (click, type, drag, etc.)',
  [ToolCategories.NAVIGATION_AUTOMATION]:
    'Tools for page navigation and browser control',
  [ToolCategories.EMULATION]:
    'Tools for emulating network conditions, CPU throttling, etc.',
  [ToolCategories.PERFORMANCE]: 'Tools for performance analysis and tracing',
  [ToolCategories.NETWORK]:
    'Tools for network request inspection and monitoring',
  [ToolCategories.DEBUGGING]:
    'Tools for debugging web pages (console, snapshots, etc.)',

  [ToolCategories.EXTENSION_DISCOVERY]:
    'Discover and inspect installed Chrome extensions',
  [ToolCategories.EXTENSION_LIFECYCLE]:
    'Manage extension lifecycle (reload, activate Service Worker)',
  [ToolCategories.EXTENSION_DEBUGGING]:
    'Debug extension errors and runtime issues',
  [ToolCategories.EXTENSION_INTERACTION]:
    'Interact with extension UI (popup, options page)',
  [ToolCategories.EXTENSION_MONITORING]:
    'Monitor extension logs, messages, and storage changes',
  [ToolCategories.EXTENSION_INSPECTION]:
    'Inspect extension configuration, storage, and manifest',
  [ToolCategories.BROWSER_INFO]:
    'Get information about the connected browser instance',
};
