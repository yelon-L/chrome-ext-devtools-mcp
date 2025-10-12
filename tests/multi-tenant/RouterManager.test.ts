/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {describe, it, beforeEach, afterEach} from 'node:test';

import {RouterManager} from '../../src/multi-tenant/core/RouterManager.js';

describe('RouterManager', () => {
  let routerManager: RouterManager;

  beforeEach(() => {
    routerManager = new RouterManager();
  });

  describe('registerUser', () => {
    it('应该成功注册用户', () => {
      routerManager.registerUser('user-1', 'http://localhost:9222');

      const browserURL = routerManager.getUserBrowserURL('user-1');
      assert.strictEqual(browserURL, 'http://localhost:9222');
    });

    it('应该保存用户元数据', () => {
      routerManager.registerUser('user-1', 'http://localhost:9222', {
        name: 'Test User',
        email: 'test@example.com',
      });

      const mapping = routerManager.getUserMapping('user-1');
      assert.strictEqual(mapping?.metadata?.name, 'Test User');
      assert.strictEqual(mapping?.metadata?.email, 'test@example.com');
    });

    it('应该在重复注册时更新映射', () => {
      routerManager.registerUser('user-1', 'http://localhost:9222');
      routerManager.registerUser('user-1', 'http://localhost:9223');

      const browserURL = routerManager.getUserBrowserURL('user-1');
      assert.strictEqual(browserURL, 'http://localhost:9223');
    });

    it('应该在 browserURL 无效时抛出错误', () => {
      assert.throws(() => {
        routerManager.registerUser('user-1', 'invalid-url');
      }, /无效的浏览器 URL/);
    });

    it('应该在 userId 无效时抛出错误', () => {
      assert.throws(() => {
        routerManager.registerUser('', 'http://localhost:9222');
      }, /无效的用户 ID/);
    });
  });

  describe('unregisterUser', () => {
    it('应该成功注销用户', () => {
      routerManager.registerUser('user-1', 'http://localhost:9222');

      const result = routerManager.unregisterUser('user-1');

      assert.strictEqual(result, true);
      assert.strictEqual(routerManager.isUserRegistered('user-1'), false);
    });

    it('应该在注销不存在的用户时返回 false', () => {
      const result = routerManager.unregisterUser('non-existent');
      assert.strictEqual(result, false);
    });
  });

  describe('getUserBrowserURL', () => {
    it('应该返回已注册用户的浏览器 URL', () => {
      routerManager.registerUser('user-1', 'http://localhost:9222');

      const url = routerManager.getUserBrowserURL('user-1');
      assert.strictEqual(url, 'http://localhost:9222');
    });

    it('应该在用户未注册时返回 undefined', () => {
      const url = routerManager.getUserBrowserURL('non-existent');
      assert.strictEqual(url, undefined);
    });
  });

  describe('isUserRegistered', () => {
    it('应该正确检查用户是否已注册', () => {
      routerManager.registerUser('user-1', 'http://localhost:9222');

      assert.strictEqual(routerManager.isUserRegistered('user-1'), true);
      assert.strictEqual(routerManager.isUserRegistered('user-2'), false);
    });
  });

  describe('getAllUsers', () => {
    it('应该返回所有已注册用户', () => {
      routerManager.registerUser('user-1', 'http://localhost:9222');
      routerManager.registerUser('user-2', 'http://localhost:9223');

      const users = routerManager.getAllUsers();

      assert.strictEqual(users.length, 2);
      assert.ok(users.includes('user-1'));
      assert.ok(users.includes('user-2'));
    });

    it('应该在无用户时返回空数组', () => {
      const users = routerManager.getAllUsers();
      assert.strictEqual(users.length, 0);
    });
  });

  describe('updateUserMetadata', () => {
    it('应该成功更新用户元数据', () => {
      routerManager.registerUser('user-1', 'http://localhost:9222', {
        name: 'Old Name',
      });

      const result = routerManager.updateUserMetadata('user-1', {
        name: 'New Name',
        email: 'new@example.com',
      });

      assert.strictEqual(result, true);

      const mapping = routerManager.getUserMapping('user-1');
      assert.strictEqual(mapping?.metadata?.name, 'New Name');
      assert.strictEqual(mapping?.metadata?.email, 'new@example.com');
    });

    it('应该在用户不存在时返回 false', () => {
      const result = routerManager.updateUserMetadata('non-existent', {
        name: 'Test',
      });

      assert.strictEqual(result, false);
    });
  });

  describe('findUsersByBrowserURL', () => {
    it('应该找到使用指定浏览器 URL 的用户', () => {
      routerManager.registerUser('user-1', 'http://localhost:9222');
      routerManager.registerUser('user-2', 'http://localhost:9222');
      routerManager.registerUser('user-3', 'http://localhost:9223');

      const users = routerManager.findUsersByBrowserURL('http://localhost:9222');

      assert.strictEqual(users.length, 2);
      assert.ok(users.includes('user-1'));
      assert.ok(users.includes('user-2'));
    });
  });

  describe('export and import', () => {
    it('应该成功导出和导入映射数据', () => {
      routerManager.registerUser('user-1', 'http://localhost:9222', {
        name: 'User 1',
      });
      routerManager.registerUser('user-2', 'http://localhost:9223');

      const exported = routerManager.export();

      const newManager = new RouterManager();
      newManager.import(exported);

      assert.strictEqual(newManager.isUserRegistered('user-1'), true);
      assert.strictEqual(newManager.isUserRegistered('user-2'), true);
      assert.strictEqual(
        newManager.getUserMapping('user-1')?.metadata?.name,
        'User 1'
      );
    });

    it('应该在导入无效数据时抛出错误', () => {
      assert.throws(() => {
        routerManager.import('invalid json');
      }, /导入映射数据失败/);
    });
  });

  describe('getStats', () => {
    it('应该返回正确的统计信息', () => {
      routerManager.registerUser('user-1', 'http://localhost:9222');
      routerManager.registerUser('user-2', 'http://localhost:9223');

      const stats = routerManager.getStats();

      assert.strictEqual(stats.totalUsers, 2);
      assert.strictEqual(stats.users.length, 2);
    });
  });

  describe('clearAll', () => {
    it('应该清空所有映射', () => {
      routerManager.registerUser('user-1', 'http://localhost:9222');
      routerManager.registerUser('user-2', 'http://localhost:9223');

      routerManager.clearAll();

      assert.strictEqual(routerManager.getAllUsers().length, 0);
    });
  });
});
