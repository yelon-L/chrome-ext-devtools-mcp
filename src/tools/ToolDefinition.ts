/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  Browser,
  CDPSession,
  Dialog,
  ElementHandle,
  Page,
} from 'puppeteer-core';
import z from 'zod';

import type {EnhancedConsoleCollector} from '../collectors/EnhancedConsoleCollector.js';
import type {
  ExtensionContext,
  ExtensionInfo,
  StorageData,
  StorageType,
} from '../extension/types.js';
import type {TraceResult} from '../trace-processing/parse.js';

import type {ToolCategories} from './categories.js';

export interface ToolDefinition<Schema extends z.ZodRawShape = z.ZodRawShape> {
  name: string;
  description: string;
  annotations: {
    title?: string;
    category: ToolCategories;
    /**
     * If true, the tool does not modify its environment.
     */
    readOnlyHint: boolean;
  };
  schema: Schema;
  handler: (
    request: Request<Schema>,
    response: Response,
    context: Context,
  ) => Promise<void>;
}

export interface Request<Schema extends z.ZodRawShape> {
  params: z.objectOutputType<Schema, z.ZodTypeAny>;
}

export interface ImageContentData {
  data: string;
  mimeType: string;
}

export interface Response {
  appendResponseLine(value: string): void;
  setIncludePages(value: boolean): void;
  setIncludeNetworkRequests(
    value: boolean,
    options?: {pageSize?: number; pageIdx?: number; resourceTypes?: string[]},
  ): void;
  setIncludeConsoleData(value: boolean): void;
  setIncludeSnapshot(value: boolean): void;
  attachImage(value: ImageContentData): void;
  attachNetworkRequest(url: string): void;
}

/**
 * Only add methods required by tools/*.
 */
export type Context = Readonly<{
  isRunningPerformanceTrace(): boolean;
  setIsRunningPerformanceTrace(x: boolean): void;
  recordedTraces(): TraceResult[];
  storeTraceRecording(result: TraceResult): void;
  getSelectedPage(): Page;
  getDialog(): Dialog | undefined;
  clearDialog(): void;
  getPageByIdx(idx: number): Page;
  newPage(): Promise<Page>;
  closePage(pageIdx: number): Promise<void>;
  setSelectedPageIdx(idx: number): void;
  getElementByUid(uid: string): Promise<ElementHandle<Element>>;
  setNetworkConditions(conditions: string | null): void;
  setCpuThrottlingRate(rate: number): void;
  saveTemporaryFile(
    data: Uint8Array<ArrayBufferLike>,
    mimeType: 'image/png' | 'image/jpeg' | 'image/webp',
  ): Promise<{filename: string}>;
  saveFile(
    data: Uint8Array<ArrayBufferLike>,
    filename: string,
  ): Promise<{filename: string}>;
  waitForEventsAfterAction(action: () => Promise<unknown>): Promise<void>;

  // Extension debugging methods
  getBrowser(): Browser;
  getExtensions(includeDisabled?: boolean): Promise<ExtensionInfo[]>;
  getExtensionDetails(extensionId: string): Promise<ExtensionInfo | null>;
  getExtensionContexts(extensionId: string): Promise<ExtensionContext[]>;
  switchToExtensionContext(contextId: string): Promise<Page>;
  evaluateInExtensionContext(
    contextId: string,
    code: string,
    awaitPromise?: boolean,
  ): Promise<unknown>;
  isServiceWorkerActive(extensionId: string): Promise<boolean>;
  activateServiceWorker(extensionId: string): Promise<{
    success: boolean;
    method?: string;
    url?: string;
    error?: string;
    suggestion?: string;
  }>;
  getExtensionLogs(
    extensionId: string,
    options?: {
      capture?: boolean;
      duration?: number;
      includeStored?: boolean;
    }
  ): Promise<{
    logs: Array<{
      type: string;
      text: string;
      timestamp: number;
      source: 'stored' | 'realtime';
      level?: string;
      stackTrace?: string;
      url?: string;
      lineNumber?: number;
    }>;
    isActive: boolean;
    captureInfo?: {
      started: number;
      ended: number;
      duration: number;
      messageCount: number;
    };
  }>;
  getExtensionStorage(
    extensionId: string,
    storageType: StorageType,
  ): Promise<StorageData>;
  getExtensionBackgroundTarget(
    extensionId: string,
  ): Promise<Page | null>;
  monitorExtensionMessages(
    extensionId: string,
    duration?: number,
    messageTypes?: Array<'runtime' | 'tabs' | 'external'>,
  ): Promise<Array<{
    timestamp: number;
    type: 'sent' | 'received';
    method: string;
    message: unknown;
    sender?: unknown;
    tabId?: number;
  }>>;
  watchExtensionStorage(
    extensionId: string,
    storageTypes?: Array<'local' | 'sync' | 'session' | 'managed'>,
    duration?: number,
  ): Promise<Array<{
    timestamp: number;
    storageArea: string;
    changes: Record<string, {oldValue?: unknown; newValue?: unknown}>;
  }>>;
  
  // CDP Session methods for enhanced logging
  getCDPSession(page: Page): CDPSession | undefined;
  getOrCreateCDPSession(page: Page): Promise<CDPSession>;
  getEnhancedConsoleCollector(page: Page): EnhancedConsoleCollector | undefined;
}>;

export function defineTool<Schema extends z.ZodRawShape>(
  definition: ToolDefinition<Schema>,
) {
  return definition;
}

export const CLOSE_PAGE_ERROR =
  'The last open page cannot be closed. It is fine to keep it open.';

export const timeoutSchema = {
  timeout: z
    .number()
    .int()
    .optional()
    .describe(
      `Maximum wait time in milliseconds. If set to 0, the default timeout will be used.`,
    )
    .transform(value => {
      return value && value <= 0 ? undefined : value;
    }),
};
