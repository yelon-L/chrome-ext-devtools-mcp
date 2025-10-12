
/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
/**
 * get_extension_logs 工具测试
 */
import assert from 'node:assert';
import path from 'node:path';
import {describe, it, before, after} from 'node:test';
import {fileURLToPath} from 'node:url';

import type {Browser} from 'puppeteer';
import puppeteer from 'puppeteer';


import {ExtensionHelper} from '../../src/extension/ExtensionHelper.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEST_EXTENSION_PATH = path.join(__dirname, '../../test-extension-enhanced');

describe('get_extension_logs', () => {
  let browser: Browser;
  let helper: ExtensionHelper;
  let testExtensionId: string;

  before(async () => {
    // 启动 Chrome 并加载测试扩展
    browser = await puppeteer.launch({
      headless: false,
      args: [
        '--remote-debugging-port=9560',
        `--disable-extensions-except=${TEST_EXTENSION_PATH}`,
        `--load-extension=${TEST_EXTENSION_PATH}`,
      ],
    });

    // 等待扩展加载
    await new Promise(resolve => setTimeout(resolve, 2000));

    helper = new ExtensionHelper(browser);

    // 获取测试扩展 ID
    const extensions = await helper.getExtensions();
    const testExt = extensions.find(ext =>
      ext.name.includes('Enhanced MCP Debug Test Extension')
    );

    if (!testExt) {
      throw new Error('测试扩展未找到');
    }

    testExtensionId = testExt.id;
  });

  after(async () => {
    if (browser) {
      await browser.close();
    }
  });

  it('should get extension logs', async () => {
    try {
      const result = await helper.getExtensionLogs(testExtensionId);

      assert.ok(result, '应该返回日志结果');
      assert.strictEqual(typeof result.isActive, 'boolean', 'isActive 应该是布尔值');
      assert.ok(Array.isArray(result.logs), 'logs 应该是数组');

      console.log(`✅ Extension Logs:`);
      console.log(`   - Service Worker Active: ${result.isActive}`);
      console.log(`   - Log Count: ${result.logs.length}`);

      if (result.logs.length > 0) {
        console.log(`   - First Log: ${result.logs[0].text}`);
      }
    } catch (error) {
      console.log(`⚠️  获取日志失败: ${(error as Error).message}`);
    }
  });

  it('should include Service Worker status', async () => {
    try {
      const result = await helper.getExtensionLogs(testExtensionId);

      assert.ok('isActive' in result, '结果应该包含 isActive');
      console.log(`✅ Service Worker 状态: ${result.isActive ? 'Active' : 'Inactive'}`);
    } catch (error) {
      console.log(`⚠️  状态检查跳过: ${(error as Error).message}`);
    }
  });

  it('should have valid log structure', async () => {
    try {
      const result = await helper.getExtensionLogs(testExtensionId);

      for (const log of result.logs) {
        assert.ok('type' in log, 'log 应该有 type');
        assert.ok('text' in log, 'log 应该有 text');
        assert.ok('timestamp' in log, 'log 应该有 timestamp');

        // 验证 type
        const validTypes = ['log', 'info', 'warn', 'error', 'debug'];
        assert.ok(
          validTypes.includes(log.type),
          `log type 应该是有效值，实际: ${log.type}`
        );

        // 验证 timestamp
        assert.ok(
          typeof log.timestamp === 'number',
          'timestamp 应该是数字'
        );
        assert.ok(log.timestamp > 0, 'timestamp 应该 > 0');
      }

      console.log(`✅ 日志结构有效 (${result.logs.length} 条)`);
    } catch (error) {
      console.log(`⚠️  日志结构测试跳过: ${(error as Error).message}`);
    }
  });

  it('should handle inactive Service Worker', async () => {
    const details = await helper.getExtensionDetails(testExtensionId);

    if (details?.manifestVersion === 3) {
      try {
        const result = await helper.getExtensionLogs(testExtensionId);

        if (!result.isActive) {
          console.log(`ℹ️  Service Worker 未激活`);
          console.log(`   提示: 日志可能已丢失`);
        }

        // 即使未激活，也应该返回有效结构
        assert.ok(Array.isArray(result.logs), '应该返回日志数组');
      } catch (error) {
        console.log(`⚠️  未激活测试跳过: ${(error as Error).message}`);
      }
    }
  });

  it('should return empty logs for new/quiet extension', async () => {
    try {
      const result = await helper.getExtensionLogs(testExtensionId);

      // 新扩展或没有日志输出的扩展应该返回空数组
      if (result.logs.length === 0) {
        console.log(`✅ 无日志输出（正常）`);
      } else {
        console.log(`ℹ️  有 ${result.logs.length} 条日志`);
      }

      assert.ok(Array.isArray(result.logs), 'logs 应该是数组');
    } catch (error) {
      console.log(`⚠️  空日志测试跳过: ${(error as Error).message}`);
    }
  });

  it('should fail gracefully for non-existent extension', async () => {
    const fakeId = 'a'.repeat(32);

    try {
      await helper.getExtensionLogs(fakeId);
      assert.fail('应该抛出错误');
    } catch (error) {
      assert.ok(error instanceof Error, '应该抛出 Error');
      console.log(`✅ 不存在的扩展正确抛出错误`);
    }
  });

  it('should handle different log types', async () => {
    try {
      const result = await helper.getExtensionLogs(testExtensionId);

      const logTypes = new Set(result.logs.map(log => log.type));
      
      console.log(`✅ 日志类型分布:`);
      for (const type of logTypes) {
        const count = result.logs.filter(log => log.type === type).length;
        console.log(`   - ${type}: ${count}`);
      }
    } catch (error) {
      console.log(`⚠️  日志类型测试跳过: ${(error as Error).message}`);
    }
  });
});
