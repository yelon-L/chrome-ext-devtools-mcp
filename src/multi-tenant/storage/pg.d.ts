
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
    constructor(config: any);
    connect(): Promise<PoolClient>;
    query(queryText: string, values?: any[]): Promise<QueryResult>;
    end(): Promise<void>;
  }

  export interface PoolClient {
    query(queryText: string, values?: any[]): Promise<QueryResult>;
    release(): void;
  }

  export interface QueryResult {
    rows: any[];
    rowCount: number;
  }
}
