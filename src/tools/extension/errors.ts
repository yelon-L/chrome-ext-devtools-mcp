/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Extension tool error constants
 * 
 * Following the pattern from pages.ts (CLOSE_PAGE_ERROR)
 * These are expected errors that should be caught and converted to user messages
 */

// Extension discovery errors
export const EXTENSION_NOT_FOUND = 'EXTENSION_NOT_FOUND';
export const EXTENSION_DISABLED = 'EXTENSION_DISABLED';

// Context errors
export const NO_BACKGROUND_CONTEXT = 'NO_BACKGROUND_CONTEXT';
export const NO_ACTIVE_CONTEXTS = 'NO_ACTIVE_CONTEXTS';
export const CONTEXT_SWITCH_FAILED = 'CONTEXT_SWITCH_FAILED';

// Service Worker errors
export const SERVICE_WORKER_INACTIVE = 'SERVICE_WORKER_INACTIVE';
export const SERVICE_WORKER_ACTIVATION_FAILED = 'SERVICE_WORKER_ACTIVATION_FAILED';

// Operation errors
export const RELOAD_TIMEOUT = 'RELOAD_TIMEOUT';
export const OPERATION_TIMEOUT = 'OPERATION_TIMEOUT';

// Storage errors
export const STORAGE_ACCESS_FAILED = 'STORAGE_ACCESS_FAILED';

// Manifest errors
export const MANIFEST_NOT_AVAILABLE = 'MANIFEST_NOT_AVAILABLE';

/**
 * Helper to create an error with additional data
 */
export function createExtensionError(
  type: string,
  message: string,
  data?: Record<string, any>
): Error {
  const error = new Error(type);
  (error as any).userMessage = message;
  (error as any).data = data;
  return error;
}

/**
 * Check if an error is an expected extension error
 */
export function isExpectedError(error: Error, type: string): boolean {
  return error.message === type;
}
