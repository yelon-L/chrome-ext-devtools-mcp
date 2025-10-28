/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {describe, it, beforeEach, afterEach} from 'node:test';

import sinon from 'sinon';

import {SessionManager} from '../../src/multi-tenant/core/SessionManager.js';

describe('SessionManager', () => {
  let sessionManager: SessionManager;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockTransport: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockServer: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockContext: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockBrowser: any;

  beforeEach(() => {
    sessionManager = new SessionManager({
      timeout: 1000, // 1 秒用于测试
      cleanupInterval: 500,
    });

    // 创建 mock 对象
    mockTransport = {
      sessionId: 'test-session-id',
      close: sinon.stub().resolves(),
    };

    mockServer = {};
    mockContext = {};
    mockBrowser = {
      isConnected: () => true,
    };
  });

  afterEach(() => {
    sessionManager.stop();
    sinon.restore();
  });

  describe('createSession', () => {
    it('应该成功创建新会话', () => {
      const session = sessionManager.createSession(
        'session-1',
        'user-1',
        mockTransport,
        mockServer,
        mockContext,
        mockBrowser,
      );

      assert.strictEqual(session.sessionId, 'session-1');
      assert.strictEqual(session.userId, 'user-1');
      assert.ok(session.createdAt instanceof Date);
      assert.ok(session.lastActivity instanceof Date);
    });

    it('应该为会话分配正确的属性', () => {
      const session = sessionManager.createSession(
        'session-2',
        'user-2',
        mockTransport,
        mockServer,
        mockContext,
        mockBrowser,
      );

      assert.strictEqual(session.transport, mockTransport);
      assert.strictEqual(session.server, mockServer);
      assert.strictEqual(session.context, mockContext);
      assert.strictEqual(session.browser, mockBrowser);
    });

    it('应该在达到最大会话数时抛出错误', () => {
      const limitedManager = new SessionManager({
        timeout: 1000,
        cleanupInterval: 500,
        maxSessions: 2,
      });

      // 创建 2 个会话
      limitedManager.createSession(
        's1',
        'u1',
        mockTransport,
        mockServer,
        mockContext,
        mockBrowser,
      );
      limitedManager.createSession(
        's2',
        'u2',
        mockTransport,
        mockServer,
        mockContext,
        mockBrowser,
      );

      // 第 3 个应该失败
      assert.throws(() => {
        limitedManager.createSession(
          's3',
          'u3',
          mockTransport,
          mockServer,
          mockContext,
          mockBrowser,
        );
      }, /达到最大会话数限制/);

      limitedManager.stop();
    });
  });

  describe('getSession', () => {
    it('应该返回存在的会话', () => {
      const created = sessionManager.createSession(
        'session-1',
        'user-1',
        mockTransport,
        mockServer,
        mockContext,
        mockBrowser,
      );

      const retrieved = sessionManager.getSession('session-1');

      assert.strictEqual(retrieved, created);
    });

    it('应该在会话不存在时返回 undefined', () => {
      const result = sessionManager.getSession('non-existent');
      assert.strictEqual(result, undefined);
    });
  });

  describe('updateActivity', () => {
    it('应该更新会话的最后活跃时间', async () => {
      sessionManager.createSession(
        'session-1',
        'user-1',
        mockTransport,
        mockServer,
        mockContext,
        mockBrowser,
      );

      const session = sessionManager.getSession('session-1')!;
      const originalTime = session.lastActivity.getTime();

      // 等待一点时间
      await new Promise(resolve => setTimeout(resolve, 10));

      sessionManager.updateActivity('session-1');

      const updatedTime = session.lastActivity.getTime();
      assert.ok(updatedTime > originalTime);
    });
  });

  describe('deleteSession', () => {
    it('应该成功删除会话', async () => {
      sessionManager.createSession(
        'session-1',
        'user-1',
        mockTransport,
        mockServer,
        mockContext,
        mockBrowser,
      );

      const result = await sessionManager.deleteSession('session-1');

      assert.strictEqual(result, true);
      assert.strictEqual(sessionManager.getSession('session-1'), undefined);
    });

    it('应该调用 transport.close', async () => {
      sessionManager.createSession(
        'session-1',
        'user-1',
        mockTransport,
        mockServer,
        mockContext,
        mockBrowser,
      );

      await sessionManager.deleteSession('session-1');

      sinon.assert.calledOnce(mockTransport.close);
    });

    it('应该在删除不存在的会话时返回 false', async () => {
      const result = await sessionManager.deleteSession('non-existent');
      assert.strictEqual(result, false);
    });
  });

  describe('getUserSessions', () => {
    it('应该返回用户的所有会话', () => {
      sessionManager.createSession(
        's1',
        'user-1',
        mockTransport,
        mockServer,
        mockContext,
        mockBrowser,
      );
      sessionManager.createSession(
        's2',
        'user-1',
        mockTransport,
        mockServer,
        mockContext,
        mockBrowser,
      );
      sessionManager.createSession(
        's3',
        'user-2',
        mockTransport,
        mockServer,
        mockContext,
        mockBrowser,
      );

      const user1Sessions = sessionManager.getUserSessions('user-1');
      assert.strictEqual(user1Sessions.length, 2);
      assert.ok(user1Sessions.every(s => s.userId === 'user-1'));
    });

    it('应该在用户无会话时返回空数组', () => {
      const sessions = sessionManager.getUserSessions('non-existent');
      assert.strictEqual(sessions.length, 0);
    });
  });

  describe('cleanupUserSessions', () => {
    it('应该清理用户的所有会话', async () => {
      sessionManager.createSession(
        's1',
        'user-1',
        mockTransport,
        mockServer,
        mockContext,
        mockBrowser,
      );
      sessionManager.createSession(
        's2',
        'user-1',
        mockTransport,
        mockServer,
        mockContext,
        mockBrowser,
      );

      await sessionManager.cleanupUserSessions('user-1');

      const sessions = sessionManager.getUserSessions('user-1');
      assert.strictEqual(sessions.length, 0);
    });
  });

  describe('cleanupExpiredSessions', () => {
    it('应该删除超时的会话', async () => {
      sessionManager.createSession(
        's1',
        'user-1',
        mockTransport,
        mockServer,
        mockContext,
        mockBrowser,
      );

      // 等待超过超时时间
      await new Promise(resolve => setTimeout(resolve, 1100));

      await sessionManager.cleanupExpiredSessions();

      assert.strictEqual(sessionManager.getSession('s1'), undefined);
    });

    it('应该保留活跃的会话', async () => {
      sessionManager.createSession(
        's1',
        'user-1',
        mockTransport,
        mockServer,
        mockContext,
        mockBrowser,
      );

      // 短暂等待但不超时
      await new Promise(resolve => setTimeout(resolve, 100));

      await sessionManager.cleanupExpiredSessions();

      assert.ok(sessionManager.getSession('s1'));
    });
  });

  describe('getStats', () => {
    it('应该返回正确的统计信息', () => {
      sessionManager.createSession(
        's1',
        'user-1',
        mockTransport,
        mockServer,
        mockContext,
        mockBrowser,
      );
      sessionManager.createSession(
        's2',
        'user-1',
        mockTransport,
        mockServer,
        mockContext,
        mockBrowser,
      );
      sessionManager.createSession(
        's3',
        'user-2',
        mockTransport,
        mockServer,
        mockContext,
        mockBrowser,
      );

      const stats = sessionManager.getStats();

      assert.strictEqual(stats.total, 3);
      assert.strictEqual(stats.active, 3);
      assert.strictEqual(stats.byUser.get('user-1'), 2);
      assert.strictEqual(stats.byUser.get('user-2'), 1);
    });
  });

  describe('hasSession', () => {
    it('应该正确检查会话是否存在', () => {
      sessionManager.createSession(
        's1',
        'user-1',
        mockTransport,
        mockServer,
        mockContext,
        mockBrowser,
      );

      assert.strictEqual(sessionManager.hasSession('s1'), true);
      assert.strictEqual(sessionManager.hasSession('non-existent'), false);
    });
  });

  describe('getAllSessionIds', () => {
    it('应该返回所有会话 ID', () => {
      sessionManager.createSession(
        's1',
        'user-1',
        mockTransport,
        mockServer,
        mockContext,
        mockBrowser,
      );
      sessionManager.createSession(
        's2',
        'user-2',
        mockTransport,
        mockServer,
        mockContext,
        mockBrowser,
      );

      const ids = sessionManager.getAllSessionIds();

      assert.strictEqual(ids.length, 2);
      assert.ok(ids.includes('s1'));
      assert.ok(ids.includes('s2'));
    });
  });
});
