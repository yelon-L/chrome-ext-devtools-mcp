/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {HTTPRequest, ResourceType} from 'puppeteer-core';
import z from 'zod';

import {ToolCategories} from './categories.js';
import {defineTool} from './ToolDefinition.js';

const FILTERABLE_RESOURCE_TYPES: readonly [ResourceType, ...ResourceType[]] = [
  'document',
  'stylesheet',
  'image',
  'media',
  'font',
  'script',
  'texttrack',
  'xhr',
  'fetch',
  'prefetch',
  'eventsource',
  'websocket',
  'manifest',
  'signedexchange',
  'ping',
  'cspviolationreport',
  'preflight',
  'fedcm',
  'other',
];

export const listNetworkRequests = defineTool({
  name: 'list_network_requests',
  description: `List all requests for the currently selected page since the last navigation.`,
  annotations: {
    category: ToolCategories.NETWORK,
    readOnlyHint: true,
  },
  schema: {
    pageSize: z
      .number()
      .int()
      .positive()
      .optional()
      .describe(
        'Maximum number of requests to return. When omitted, returns all requests.',
      ),
    pageIdx: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe(
        'Page number to return (0-based). When omitted, returns the first page.',
      ),
    resourceTypes: z
      .array(z.enum(FILTERABLE_RESOURCE_TYPES))
      .optional()
      .describe(
        'Filter requests to only return requests of the specified resource types. When omitted or empty, returns all requests.',
      ),
  },
  handler: async (request, response) => {
    response.setIncludeNetworkRequests(true, {
      pageSize: request.params.pageSize,
      pageIdx: request.params.pageIdx,
      resourceTypes: request.params.resourceTypes,
    });
  },
});

export const getNetworkRequest = defineTool({
  name: 'get_network_request',
  description: `Gets a network request by stable ID or URL.

**Stable Request ID** (Recommended):
- Format: reqid-{pageIdx}-{internalId}
- Example: reqid-0-12345
- Persists across tool calls
- Get IDs from ${listNetworkRequests.name}

**URL** (Legacy):
- Direct URL string
- May match multiple requests

You can get all requests by calling ${listNetworkRequests.name}.`,
  annotations: {
    category: ToolCategories.NETWORK,
    readOnlyHint: true,
  },
  schema: {
    id: z
      .string()
      .optional()
      .describe(
        'The stable request ID (format: reqid-{pageIdx}-{internalId}). Recommended for precise matching.',
      ),
    url: z
      .string()
      .optional()
      .describe(
        'The URL of the request. Legacy parameter, may match multiple requests.',
      ),
  },
  handler: async (request, response, context) => {
    // Prefer ID over URL
    if (request.params.id) {
      const {parseStableRequestId} = await import(
        '../formatters/networkFormatter.js'
      );
      const parsed = parseStableRequestId(request.params.id);

      if (!parsed) {
        response.appendResponseLine(
          `Invalid request ID format. Expected format: reqid-{pageIdx}-{internalId}`,
        );
        return;
      }

      // Find request by internal ID using McpContext method
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const requests = (context as any).getNetworkRequests() as HTTPRequest[];
      const targetRequest = requests.find((req: HTTPRequest) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const internalId = (req as any)._requestId || req.url();
        return internalId === parsed.internalId;
      });

      if (!targetRequest) {
        response.appendResponseLine(
          `Request not found with ID: ${request.params.id}. The request may have been cleared by navigation.`,
        );
        return;
      }

      response.attachNetworkRequest(targetRequest.url());
    } else if (request.params.url) {
      response.attachNetworkRequest(request.params.url);
    } else {
      response.appendResponseLine(
        'Please provide either "id" (recommended) or "url" parameter.',
      );
    }
  },
});

// Re-export WebSocket monitoring tool
export {monitorWebSocketTraffic} from './websocket-monitor.js';
