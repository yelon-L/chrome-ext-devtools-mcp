/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {describe, it, beforeEach} from 'node:test';

import {AuthManager} from '../../src/multi-tenant/core/AuthManager.js';

describe('AuthManager', () => {
  let authManager: AuthManager;

  beforeEach(() => {
    authManager = new AuthManager({
      enabled: true,
      tokenExpiration: 60, // 60 秒
      type: 'token',
    });
  });

  describe('authenticate', () => {
    it('应该验证有效的 Token', async () => {
      const token = authManager.generateToken('user-1', ['read', 'write']);

      const result = await authManager.authenticate(token);

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.user?.userId, 'user-1');
      assert.deepStrictEqual(result.user?.permissions, ['read', 'write']);
    });

    it('应该拒绝无效的 Token', async () => {
      const result = await authManager.authenticate('invalid-token');

      assert.strictEqual(result.success, false);
      assert.ok(result.error);
    });

    it('应该拒绝空 Token', async () => {
      const result = await authManager.authenticate('');

      assert.strictEqual(result.success, false);
      assert.strictEqual(result.error, 'Token 不能为空');
    });

    it('应该拒绝被撤销的 Token', async () => {
      const token = authManager.generateToken('user-1', ['read']);
      authManager.revokeToken(token);

      const result = await authManager.authenticate(token);

      assert.strictEqual(result.success, false);
      assert.strictEqual(result.error, 'Token 已被撤销');
    });

    it('应该在认证未启用时返回成功', async () => {
      const disabledAuth = new AuthManager({ enabled: false });

      const result = await disabledAuth.authenticate('any-token');

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.user?.userId, 'anonymous');
    });
  });

  describe('authorize', () => {
    it('应该允许有权限的操作', () => {
      const user = {
        userId: 'user-1',
        permissions: ['read', 'write'],
      };

      assert.strictEqual(authManager.authorize(user, 'read'), true);
      assert.strictEqual(authManager.authorize(user, 'write'), true);
    });

    it('应该拒绝无权限的操作', () => {
      const user = {
        userId: 'user-1',
        permissions: ['read'],
      };

      assert.strictEqual(authManager.authorize(user, 'write'), false);
    });

    it('应该允许拥有 * 权限的用户所有操作', () => {
      const user = {
        userId: 'user-1',
        permissions: ['*'],
      };

      assert.strictEqual(authManager.authorize(user, 'read'), true);
      assert.strictEqual(authManager.authorize(user, 'write'), true);
      assert.strictEqual(authManager.authorize(user, 'delete'), true);
    });
  });

  describe('generateToken', () => {
    it('应该生成有效的 Token', () => {
      const token = authManager.generateToken('user-1', ['read']);

      assert.ok(token);
      assert.ok(typeof token === 'string');
      assert.ok(token.startsWith('mcp_'));
    });

    it('应该设置正确的过期时间', () => {
      const token = authManager.generateToken('user-1', ['read'], 120);

      const tokens = authManager.getUserTokens('user-1');
      const authToken = tokens[0];

      const expectedExpiry = Date.now() + 120 * 1000;
      const actualExpiry = authToken.expiresAt.getTime();

      // 允许 1 秒误差
      assert.ok(Math.abs(actualExpiry - expectedExpiry) < 1000);
    });
  });

  describe('revokeToken', () => {
    it('应该撤销指定 Token', () => {
      const token = authManager.generateToken('user-1', ['read']);

      const result = authManager.revokeToken(token);

      assert.strictEqual(result, true);
      assert.strictEqual(authManager.hasToken(token), false);
    });

    it('应该在撤销不存在的 Token 时返回 false', () => {
      const result = authManager.revokeToken('non-existent-token');
      assert.strictEqual(result, false);
    });
  });

  describe('revokeUserTokens', () => {
    it('应该撤销用户的所有 Token', () => {
      authManager.generateToken('user-1', ['read']);
      authManager.generateToken('user-1', ['write']);
      authManager.generateToken('user-2', ['read']);

      const count = authManager.revokeUserTokens('user-1');

      assert.strictEqual(count, 2);
      assert.strictEqual(authManager.getUserTokens('user-1').length, 0);
      assert.strictEqual(authManager.getUserTokens('user-2').length, 1);
    });
  });

  describe('getUserTokens', () => {
    it('应该返回用户的所有 Token', () => {
      authManager.generateToken('user-1', ['read']);
      authManager.generateToken('user-1', ['write']);
      authManager.generateToken('user-2', ['read']);

      const tokens = authManager.getUserTokens('user-1');

      assert.strictEqual(tokens.length, 2);
      assert.ok(tokens.every(t => t.userId === 'user-1'));
    });

    it('应该在用户无 Token 时返回空数组', () => {
      const tokens = authManager.getUserTokens('non-existent');
      assert.strictEqual(tokens.length, 0);
    });
  });

  describe('cleanupExpiredTokens', () => {
    it('应该清理过期 Token', async () => {
      // 生成短期 Token
      const shortAuth = new AuthManager({
        enabled: true,
        tokenExpiration: 0.1, // 0.1 秒
      });

      shortAuth.generateToken('user-1', ['read']);

      // 等待过期
      await new Promise(resolve => setTimeout(resolve, 150));

      shortAuth.cleanupExpiredTokens();

      assert.strictEqual(shortAuth.getTokenCount(), 0);
    });
  });

  describe('hasToken', () => {
    it('应该正确检查 Token 是否存在', () => {
      const token = authManager.generateToken('user-1', ['read']);

      assert.strictEqual(authManager.hasToken(token), true);
      assert.strictEqual(authManager.hasToken('non-existent'), false);
    });
  });

  describe('extractTokenFromHeader', () => {
    it('应该从 Bearer Token 提取', () => {
      const token = AuthManager.extractTokenFromHeader('Bearer abc123');
      assert.strictEqual(token, 'abc123');
    });

    it('应该从直接 Token 提取', () => {
      const token = AuthManager.extractTokenFromHeader('abc123');
      assert.strictEqual(token, 'abc123');
    });

    it('应该在无 Authorization 头时返回 undefined', () => {
      const token = AuthManager.extractTokenFromHeader(undefined);
      assert.strictEqual(token, undefined);
    });
  });

  describe('isEnabled', () => {
    it('应该返回正确的启用状态', () => {
      const enabledAuth = new AuthManager({ enabled: true });
      const disabledAuth = new AuthManager({ enabled: false });

      assert.strictEqual(enabledAuth.isEnabled(), true);
      assert.strictEqual(disabledAuth.isEnabled(), false);
    });
  });
});
