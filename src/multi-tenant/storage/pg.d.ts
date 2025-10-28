/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
/**
 * Type declarations for pg module
 */
declare module 'pg' {
  export class Pool {
    constructor(config: unknown);
    connect(): Promise<PoolClient>;
    query(queryText: string, values?: unknown[]): Promise<QueryResult>;
    end(): Promise<void>;
  }

  export interface PoolClient {
    query(queryText: string, values?: unknown[]): Promise<QueryResult>;
    release(): void;
  }

  export interface QueryResult {
    rows: unknown[];
    rowCount: number;
  }
}
