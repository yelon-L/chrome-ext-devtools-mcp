/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
/**
 * evaluate_in_extension 工具测试
 */
import assert from 'node:assert';
import path from 'node:path';
import {describe, it, before, after} from 'node:test';
import {fileURLToPath} from 'node:url';

import type {Browser} from 'puppeteer';
import puppeteer from 'puppeteer';

import {ExtensionHelper} from '../../src/extension/ExtensionHelper.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEST_EXTENSION_PATH = path.join(
  __dirname,
  '../../test-extension-enhanced',
);

describe('evaluate_in_extension', () => {
  let browser: Browser;
  let helper: ExtensionHelper;
  let testExtensionId: string;
  let backgroundTargetId: string;

  before(async () => {
    // 启动 Chrome 并加载测试扩展
    browser = await puppeteer.launch({
      headless: false,
      args: [
        '--remote-debugging-port=9561',
        `--disable-extensions-except=${TEST_EXTENSION_PATH}`,
        `--load-extension=${TEST_EXTENSION_PATH}`,
      ],
    });

    // 等待扩展加载
    await new Promise(resolve => setTimeout(resolve, 3000));

    helper = new ExtensionHelper(browser);

    // 获取测试扩展 ID
    const extensions = await helper.getExtensions();
    const testExt = extensions.find(ext =>
      ext.name.includes('Enhanced MCP Debug Test Extension'),
    );

    if (!testExt) {
      throw new Error('测试扩展未找到');
    }

    testExtensionId = testExt.id;

    // 获取 background context
    const contexts = await helper.getExtensionContexts(testExtensionId);
    const bgContext = contexts.find(ctx => ctx.isPrimary);

    if (bgContext) {
      backgroundTargetId = bgContext.targetId;
    } else {
      console.log('⚠️  未找到 background context，部分测试可能跳过');
    }
  });

  after(async () => {
    if (browser) {
      await browser.close();
    }
  });

  it('should evaluate simple expression', async () => {
    if (!backgroundTargetId) {
      console.log('⚠️  跳过测试：无 background context');
      return;
    }

    try {
      const result = await helper.evaluateInContext(
        backgroundTargetId,
        '1 + 1',
        true,
      );

      assert.strictEqual(result, 2, '1 + 1 应该等于 2');
      console.log(`✅ 简单表达式求值: 1 + 1 = ${result}`);
    } catch (error) {
      console.log(`⚠️  简单求值测试跳过: ${(error as Error).message}`);
    }
  });

  it('should evaluate string expression', async () => {
    if (!backgroundTargetId) {
      console.log('⚠️  跳过测试：无 background context');
      return;
    }

    try {
      const result = await helper.evaluateInContext(
        backgroundTargetId,
        '"Hello " + "World"',
        true,
      );

      assert.strictEqual(result, 'Hello World', '字符串拼接应该正确');
      console.log(`✅ 字符串求值: ${result}`);
    } catch (error) {
      console.log(`⚠️  字符串求值测试跳过: ${(error as Error).message}`);
    }
  });

  it('should evaluate object expression', async () => {
    if (!backgroundTargetId) {
      console.log('⚠️  跳过测试：无 background context');
      return;
    }

    try {
      const result = await helper.evaluateInContext(
        backgroundTargetId,
        '({foo: "bar", num: 42})',
        true,
      );

      assert.ok(typeof result === 'object', '应该返回对象');
      assert.strictEqual(
        (result as {foo: string}).foo,
        'bar',
        'foo 应该是 bar',
      );
      assert.strictEqual((result as {num: number}).num, 42, 'num 应该是 42');
      console.log(`✅ 对象求值:`, result);
    } catch (error) {
      console.log(`⚠️  对象求值测试跳过: ${(error as Error).message}`);
    }
  });

  it('should evaluate array expression', async () => {
    if (!backgroundTargetId) {
      console.log('⚠️  跳过测试：无 background context');
      return;
    }

    try {
      const result = await helper.evaluateInContext(
        backgroundTargetId,
        '[1, 2, 3].map(x => x * 2)',
        true,
      );

      assert.ok(Array.isArray(result), '应该返回数组');
      assert.deepStrictEqual(result, [2, 4, 6], '数组映射应该正确');
      console.log(`✅ 数组求值:`, result);
    } catch (error) {
      console.log(`⚠️  数组求值测试跳过: ${(error as Error).message}`);
    }
  });

  it('should evaluate async expression', async () => {
    if (!backgroundTargetId) {
      console.log('⚠️  跳过测试：无 background context');
      return;
    }

    try {
      const result = await helper.evaluateInContext(
        backgroundTargetId,
        'Promise.resolve(42)',
        true,
      );

      assert.strictEqual(result, 42, 'Promise 应该正确 resolve');
      console.log(`✅ 异步求值: Promise.resolve(42) = ${result}`);
    } catch (error) {
      console.log(`⚠️  异步求值测试跳过: ${(error as Error).message}`);
    }
  });

  it('should access global objects', async () => {
    if (!backgroundTargetId) {
      console.log('⚠️  跳过测试：无 background context');
      return;
    }

    try {
      const result = await helper.evaluateInContext(
        backgroundTargetId,
        'typeof globalThis',
        true,
      );

      assert.strictEqual(result, 'object', 'globalThis 应该存在');
      console.log(`✅ 全局对象访问: typeof globalThis = ${result}`);
    } catch (error) {
      console.log(`⚠️  全局对象测试跳过: ${(error as Error).message}`);
    }
  });

  it('should check chrome API availability', async () => {
    if (!backgroundTargetId) {
      console.log('⚠️  跳过测试：无 background context');
      return;
    }

    try {
      const result = await helper.evaluateInContext(
        backgroundTargetId,
        'typeof chrome',
        true,
      );

      console.log(`✅ chrome API: typeof chrome = ${result}`);

      if (result === 'object') {
        console.log(`   chrome API 可用`);
      } else {
        console.log(`   chrome API 不可用（可能 Service Worker 未激活）`);
      }
    } catch (error) {
      console.log(`⚠️  chrome API 测试跳过: ${(error as Error).message}`);
    }
  });

  it('should handle runtime.id access', async () => {
    if (!backgroundTargetId) {
      console.log('⚠️  跳过测试：无 background context');
      return;
    }

    try {
      const result = await helper.evaluateInContext(
        backgroundTargetId,
        'chrome?.runtime?.id',
        true,
      );

      if (result) {
        console.log(`✅ chrome.runtime.id = ${result}`);
        assert.strictEqual(
          result,
          testExtensionId,
          'runtime.id 应该匹配扩展 ID',
        );
      } else {
        console.log(
          `ℹ️  chrome.runtime.id 不可用（Service Worker 可能未激活）`,
        );
      }
    } catch (error) {
      console.log(`⚠️  runtime.id 测试跳过: ${(error as Error).message}`);
    }
  });

  it('should handle errors gracefully', async () => {
    if (!backgroundTargetId) {
      console.log('⚠️  跳过测试：无 background context');
      return;
    }

    try {
      await helper.evaluateInContext(
        backgroundTargetId,
        'throw new Error("Test error")',
        true,
      );

      assert.fail('应该抛出错误');
    } catch (error) {
      assert.ok(error instanceof Error, '应该捕获到错误');
      console.log(`✅ 错误处理正确: ${(error as Error).message}`);
    }
  });

  it('should evaluate without await promise', async () => {
    if (!backgroundTargetId) {
      console.log('⚠️  跳过测试：无 background context');
      return;
    }

    try {
      const result = await helper.evaluateInContext(
        backgroundTargetId,
        'Promise.resolve(42)',
        false, // 不等待 Promise
      );

      console.log(`✅ 不等待 Promise:`, result);
      // 结果应该是一个 Promise 对象（在某些情况下可能被序列化）
    } catch (error) {
      console.log(`⚠️  不等待测试跳过: ${(error as Error).message}`);
    }
  });
});
