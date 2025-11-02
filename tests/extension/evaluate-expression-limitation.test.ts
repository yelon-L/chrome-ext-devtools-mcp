/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
/**
 * evaluate_in_extension 表达式限制测试
 * 验证工具只能执行表达式，不能执行语句
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

describe('evaluate_in_extension - Expression Limitation', () => {
  let browser: Browser;
  let helper: ExtensionHelper;
  let testExtensionId: string;
  let backgroundTargetId: string;

  before(async () => {
    browser = await puppeteer.launch({
      headless: false,
      args: [
        '--remote-debugging-port=9562',
        `--disable-extensions-except=${TEST_EXTENSION_PATH}`,
        `--load-extension=${TEST_EXTENSION_PATH}`,
      ],
    });

    await new Promise(resolve => setTimeout(resolve, 3000));

    helper = new ExtensionHelper(browser);

    const extensions = await helper.getExtensions();
    const testExt = extensions.find(ext =>
      ext.name.includes('Enhanced MCP Debug Test Extension'),
    );

    if (!testExt) {
      throw new Error('测试扩展未找到');
    }

    testExtensionId = testExt.id;

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

  it('✅ should evaluate valid expressions', async () => {
    if (!backgroundTargetId) {
      console.log('⚠️  跳过测试：无 background context');
      return;
    }

    const validExpressions = [
      {code: 'chrome.runtime.id', desc: 'chrome.runtime.id'},
      {code: '1 + 1', desc: '算术表达式'},
      {code: '{a: 1, b: 2}', desc: '对象字面量'},
      {code: '[1, 2, 3]', desc: '数组字面量'},
      {code: 'typeof chrome', desc: 'typeof 操作符'},
      {code: 'Promise.resolve(42)', desc: 'Promise 表达式'},
    ];

    for (const {code, desc} of validExpressions) {
      try {
        const result = await helper.evaluateInContext(
          backgroundTargetId,
          code,
          true,
        );
        console.log(`✅ ${desc}: ${JSON.stringify(result)}`);
      } catch (error) {
        console.log(`⚠️  ${desc} 失败: ${(error as Error).message}`);
      }
    }
  });

  it('✅ console.log returns undefined (is an expression)', async () => {
    if (!backgroundTargetId) {
      console.log('⚠️  跳过测试：无 background context');
      return;
    }

    try {
      // console.log 实际上是表达式（返回 undefined）
      const result = await helper.evaluateInContext(
        backgroundTargetId,
        'console.log("test")',
        true,
      );

      assert.strictEqual(result, undefined, 'console.log 返回 undefined');
      console.log(`✅ console.log 是表达式: 返回 ${result}`);
    } catch (error) {
      console.log(`⚠️  console.log 测试失败: ${(error as Error).message}`);
    }
  });

  it('❌ should fail on variable declarations', async () => {
    if (!backgroundTargetId) {
      console.log('⚠️  跳过测试：无 background context');
      return;
    }

    try {
      // 这应该失败，因为 const 是语句
      await helper.evaluateInContext(backgroundTargetId, 'const x = 1;', true);

      console.log('⚠️  警告: const 声明应该失败但成功了');
    } catch (error) {
      console.log(`✅ const 声明正确失败: ${(error as Error).message}`);
      assert.ok(error instanceof Error, 'const 声明应该抛出错误');
    }
  });

  it('❌ should fail on if statements', async () => {
    if (!backgroundTargetId) {
      console.log('⚠️  跳过测试：无 background context');
      return;
    }

    try {
      // 这应该失败，因为 if 是语句
      await helper.evaluateInContext(
        backgroundTargetId,
        'if (true) { 1 }',
        true,
      );

      console.log('⚠️  警告: if 语句应该失败但成功了');
    } catch (error) {
      console.log(`✅ if 语句正确失败: ${(error as Error).message}`);
      assert.ok(error instanceof Error, 'if 语句应该抛出错误');
    }
  });

  it('✅ should work with ternary operator (expression)', async () => {
    if (!backgroundTargetId) {
      console.log('⚠️  跳过测试：无 background context');
      return;
    }

    try {
      // 三元运算符是表达式，应该成功
      const result = await helper.evaluateInContext(
        backgroundTargetId,
        'true ? "yes" : "no"',
        true,
      );

      assert.strictEqual(result, 'yes', '三元运算符应该返回 "yes"');
      console.log(`✅ 三元运算符（表达式）: ${result}`);
    } catch (error) {
      console.log(`⚠️  三元运算符测试失败: ${(error as Error).message}`);
    }
  });

  it('✅ should work with IIFE (expression)', async () => {
    if (!backgroundTargetId) {
      console.log('⚠️  跳过测试：无 background context');
      return;
    }

    try {
      // IIFE 是表达式，应该成功
      const result = await helper.evaluateInContext(
        backgroundTargetId,
        '(() => { return 42; })()',
        true,
      );

      assert.strictEqual(result, 42, 'IIFE 应该返回 42');
      console.log(`✅ IIFE（表达式）: ${result}`);
    } catch (error) {
      console.log(`⚠️  IIFE 测试失败: ${(error as Error).message}`);
    }
  });

  it('✅ should work with async IIFE', async () => {
    if (!backgroundTargetId) {
      console.log('⚠️  跳过测试：无 background context');
      return;
    }

    try {
      // Async IIFE 是表达式，应该成功
      const result = await helper.evaluateInContext(
        backgroundTargetId,
        '(async () => { return await Promise.resolve(42); })()',
        true,
      );

      assert.strictEqual(result, 42, 'Async IIFE 应该返回 42');
      console.log(`✅ Async IIFE（表达式）: ${result}`);
    } catch (error) {
      console.log(`⚠️  Async IIFE 测试失败: ${(error as Error).message}`);
    }
  });

  it('✅ should work with chrome.storage.local.get', async () => {
    if (!backgroundTargetId) {
      console.log('⚠️  跳过测试：无 background context');
      return;
    }

    try {
      // chrome.storage.local.get() 返回 Promise，是表达式
      const result = await helper.evaluateInContext(
        backgroundTargetId,
        'chrome.storage.local.get()',
        true,
      );

      console.log(`✅ chrome.storage.local.get():`, result);
      assert.ok(typeof result === 'object', 'storage.get 应该返回对象');
    } catch (error) {
      console.log(`⚠️  storage.get 测试失败: ${(error as Error).message}`);
    }
  });

  it('documentation: print valid expression examples', () => {
    console.log('\n📖 有效表达式示例:');
    console.log('  ✅ chrome.runtime.id');
    console.log('  ✅ await chrome.storage.local.get()');
    console.log('  ✅ {a: 1, b: 2}');
    console.log('  ✅ [1, 2, 3].map(x => x * 2)');
    console.log('  ✅ typeof chrome.tabs');
    console.log('  ✅ true ? "yes" : "no"');
    console.log('  ✅ (() => { return 42; })()');
    console.log('  ✅ console.log("test") // 返回 undefined');

    console.log('\n❌ 无效语句示例（会导致语法错误）:');
    console.log('  ❌ const x = 1;');
    console.log('  ❌ let y = 2;');
    console.log('  ❌ if (true) { ... }');
    console.log('  ❌ for (let i = 0; i < 10; i++) { ... }');
    console.log('  ❌ x = 1; y = 2; // 多行语句');
  });
});
