/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {beforeEach, describe, it} from 'node:test';

import {EnhancedConsoleCollector} from '../../src/collectors/EnhancedConsoleCollector.js';

describe('EnhancedConsoleCollector', () => {
  let collector: EnhancedConsoleCollector;

  beforeEach(() => {
    collector = new EnhancedConsoleCollector();
  });

  describe('getFilteredLogs', () => {
    beforeEach(() => {
      // 添加测试日志
      const now = Date.now();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const logs = (collector as any).logs;

      logs.push({
        type: 'log',
        timestamp: now - 5000,
        source: 'page',
        message: 'Log message 1',
        args: [],
      });

      logs.push({
        type: 'error',
        timestamp: now - 4000,
        source: 'page',
        message: 'Error message',
        args: [],
      });

      logs.push({
        type: 'warn',
        timestamp: now - 3000,
        source: 'worker',
        message: 'Warning message',
        args: [],
      });

      logs.push({
        type: 'log',
        timestamp: now - 2000,
        source: 'service-worker',
        message: 'Log message 2',
        args: [],
      });

      logs.push({
        type: 'info',
        timestamp: now - 1000,
        source: 'page',
        message: 'Info message',
        args: [],
      });
    });

    it('returns all logs when no filters provided', () => {
      const result = collector.getFilteredLogs({});
      assert.strictEqual(result.length, 5);
    });

    it('filters by single type', () => {
      const result = collector.getFilteredLogs({
        types: ['error'],
      });

      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].type, 'error');
    });

    it('filters by multiple types', () => {
      const result = collector.getFilteredLogs({
        types: ['log', 'info'],
      });

      assert.strictEqual(result.length, 3);
      assert.ok(result.every(log => log.type === 'log' || log.type === 'info'));
    });

    it('filters by single source', () => {
      const result = collector.getFilteredLogs({
        sources: ['worker'],
      });

      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].source, 'worker');
    });

    it('filters by multiple sources', () => {
      const result = collector.getFilteredLogs({
        sources: ['page', 'worker'],
      });

      assert.strictEqual(result.length, 4);
      assert.ok(
        result.every(log => log.source === 'page' || log.source === 'worker'),
      );
    });

    it('filters by timestamp', () => {
      const now = Date.now();
      const result = collector.getFilteredLogs({
        since: now - 2500,
      });

      assert.strictEqual(result.length, 2);
      assert.ok(result.every(log => log.timestamp >= now - 2500));
    });

    it('limits number of results', () => {
      const result = collector.getFilteredLogs({
        limit: 3,
      });

      assert.strictEqual(result.length, 3);
      // Should return last 3 logs
      assert.strictEqual(result[0].type, 'warn');
      assert.strictEqual(result[1].type, 'log');
      assert.strictEqual(result[2].type, 'info');
    });

    it('combines multiple filters', () => {
      const now = Date.now();
      const result = collector.getFilteredLogs({
        types: ['log', 'info'],
        sources: ['page'],
        since: now - 3000,
      });

      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].type, 'info');
      assert.strictEqual(result[0].source, 'page');
    });

    it('returns empty array when no logs match filters', () => {
      const result = collector.getFilteredLogs({
        types: ['debug'],
      });

      assert.strictEqual(result.length, 0);
    });

    it('handles empty filter arrays', () => {
      const result = collector.getFilteredLogs({
        types: [],
        sources: [],
      });

      assert.strictEqual(result.length, 5);
    });
  });

  describe('getLogStats', () => {
    beforeEach(() => {
      // 添加测试日志
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const logs = (collector as any).logs;

      logs.push(
        {type: 'log', source: 'page', message: 'msg1', args: []},
        {type: 'log', source: 'page', message: 'msg2', args: []},
        {type: 'error', source: 'page', message: 'msg3', args: []},
        {type: 'warn', source: 'worker', message: 'msg4', args: []},
        {type: 'info', source: 'service-worker', message: 'msg5', args: []},
      );
    });

    it('returns correct total count', () => {
      const stats = collector.getLogStats();
      assert.strictEqual(stats.total, 5);
    });

    it('returns correct type statistics', () => {
      const stats = collector.getLogStats();

      assert.strictEqual(stats.byType.log, 2);
      assert.strictEqual(stats.byType.error, 1);
      assert.strictEqual(stats.byType.warn, 1);
      assert.strictEqual(stats.byType.info, 1);
    });

    it('returns correct source statistics', () => {
      const stats = collector.getLogStats();

      assert.strictEqual(stats.bySource.page, 3);
      assert.strictEqual(stats.bySource.worker, 1);
      assert.strictEqual(stats.bySource['service-worker'], 1);
    });

    it('handles empty logs', () => {
      const emptyCollector = new EnhancedConsoleCollector();
      const stats = emptyCollector.getLogStats();

      assert.strictEqual(stats.total, 0);
      assert.deepStrictEqual(stats.byType, {});
      assert.deepStrictEqual(stats.bySource, {});
    });
  });

  describe('getLogsByType', () => {
    beforeEach(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const logs = (collector as any).logs;
      logs.push(
        {type: 'log', message: 'msg1', args: []},
        {type: 'error', message: 'msg2', args: []},
        {type: 'log', message: 'msg3', args: []},
      );
    });

    it('filters logs by type', () => {
      const result = collector.getLogsByType('log');
      assert.strictEqual(result.length, 2);
      assert.ok(result.every(log => log.type === 'log'));
    });

    it('returns empty array for non-existent type', () => {
      const result = collector.getLogsByType('debug');
      assert.strictEqual(result.length, 0);
    });
  });

  describe('getLogsBySource', () => {
    beforeEach(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const logs = (collector as any).logs;
      logs.push(
        {type: 'log', source: 'page', message: 'msg1', args: []},
        {type: 'log', source: 'worker', message: 'msg2', args: []},
        {type: 'log', source: 'page', message: 'msg3', args: []},
      );
    });

    it('filters logs by source', () => {
      const result = collector.getLogsBySource('page');
      assert.strictEqual(result.length, 2);
      assert.ok(result.every(log => log.source === 'page'));
    });

    it('returns empty array for non-existent source', () => {
      const result = collector.getLogsBySource('iframe');
      assert.strictEqual(result.length, 0);
    });
  });

  describe('getLogsSince', () => {
    beforeEach(() => {
      const now = Date.now();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const logs = (collector as any).logs;
      logs.push(
        {type: 'log', timestamp: now - 5000, message: 'msg1', args: []},
        {type: 'log', timestamp: now - 3000, message: 'msg2', args: []},
        {type: 'log', timestamp: now - 1000, message: 'msg3', args: []},
      );
    });

    it('filters logs by timestamp', () => {
      const now = Date.now();
      const result = collector.getLogsSince(now - 3500);

      assert.strictEqual(result.length, 2);
      assert.ok(result.every(log => log.timestamp >= now - 3500));
    });

    it('returns all logs when timestamp is very old', () => {
      const result = collector.getLogsSince(0);
      assert.strictEqual(result.length, 3);
    });

    it('returns empty array when timestamp is in future', () => {
      const result = collector.getLogsSince(Date.now() + 10000);
      assert.strictEqual(result.length, 0);
    });
  });

  describe('getLogs', () => {
    it('returns all logs', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const logs = (collector as any).logs;
      logs.push(
        {type: 'log', message: 'msg1', args: []},
        {type: 'error', message: 'msg2', args: []},
      );

      const result = collector.getLogs();
      assert.strictEqual(result.length, 2);
    });

    it('returns empty array when no logs', () => {
      const result = collector.getLogs();
      assert.strictEqual(result.length, 0);
    });
  });
});
