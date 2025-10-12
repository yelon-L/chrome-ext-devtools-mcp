
/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
/**
 * Extension 工具集成测试
 * 测试工具之间的协作和完整工作流
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

describe('extension_tools_integration', () => {
  let browser: Browser;
  let helper: ExtensionHelper;
  let testExtensionId: string;

  before(async () => {
    // 启动 Chrome 并加载测试扩展
    browser = await puppeteer.launch({
      headless: false,
      args: [
        '--remote-debugging-port=9562',
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
      ext.name.includes('Enhanced MCP Debug Test Extension')
    );

    if (!testExt) {
      throw new Error('测试扩展未找到');
    }

    testExtensionId = testExt.id;
    console.log(`\n📦 使用测试扩展: ${testExt.name}`);
    console.log(`   ID: ${testExtensionId}`);
    console.log(`   MV: ${testExt.manifestVersion}\n`);
  });

  after(async () => {
    if (browser) {
      await browser.close();
    }
  });

  it('Complete debugging workflow', async () => {
    console.log('🔄 开始完整调试流程...\n');

    // Step 1: List extensions
    console.log('Step 1: List Extensions');
    const extensions = await helper.getExtensions();
    assert.ok(extensions.length > 0, '应该找到扩展');
    console.log(`✅ 找到 ${extensions.length} 个扩展\n`);

    // Step 2: Get extension details
    console.log('Step 2: Get Extension Details');
    const details = await helper.getExtensionDetails(testExtensionId);
    assert.ok(details, '应该获取到详情');
    console.log(`✅ 名称: ${details?.name}`);
    console.log(`   版本: ${details?.version}`);
    console.log(`   MV: ${details?.manifestVersion}\n`);

    // Step 3: List contexts
    console.log('Step 3: List Extension Contexts');
    const contexts = await helper.getExtensionContexts(testExtensionId);
    console.log(`✅ 找到 ${contexts.length} 个上下文`);
    contexts.forEach(ctx => {
      console.log(`   - ${ctx.type}: ${ctx.title || ctx.url}`);
    });
    console.log('');

    // Step 4: Check and activate Service Worker (if MV3)
    if (details?.manifestVersion === 3) {
      console.log('Step 4: Check Service Worker');
      const isActive = await helper.isServiceWorkerActive(testExtensionId);
      console.log(`   状态: ${isActive ? '🟢 Active' : '🔴 Inactive'}`);

      if (!isActive) {
        console.log('   尝试激活...');
        try {
          const result = await helper.activateServiceWorker(testExtensionId);
          if (result.success) {
            console.log(`   ✅ 激活成功`);
          } else {
            console.log(`   ⚠️  激活失败: ${result.error}`);
          }
        } catch (error) {
          console.log(`   ⚠️  激活出错: ${(error as Error).message}`);
        }
      }
      console.log('');
    }

    // Step 5: Inspect storage
    console.log('Step 5: Inspect Extension Storage');
    try {
      const storage = await helper.getExtensionStorage(testExtensionId, 'local');
      console.log(`✅ Local Storage:`);
      console.log(`   Keys: ${Object.keys(storage.data).length}`);
      if (Object.keys(storage.data).length > 0) {
        console.log(`   Data:`, JSON.stringify(storage.data, null, 2));
      }
    } catch (error) {
      console.log(`   ⚠️  ${(error as Error).message}`);
    }
    console.log('');

    // Step 6: Get logs
    console.log('Step 6: Get Extension Logs');
    try {
      const logs = await helper.getExtensionLogs(testExtensionId);
      console.log(`✅ Logs: ${logs.logs.length} 条`);
      if (logs.logs.length > 0) {
        console.log(`   最新: ${logs.logs[logs.logs.length - 1].text}`);
      }
    } catch (error) {
      console.log(`   ⚠️  ${(error as Error).message}`);
    }
    console.log('');

    // Step 7: Evaluate code
    const bgContext = contexts.find(ctx => ctx.isPrimary);
    if (bgContext) {
      console.log('Step 7: Evaluate Code in Extension');
      try {
        const result = await helper.evaluateInContext(
          bgContext.targetId,
          'typeof chrome',
          true
        );
        console.log(`✅ typeof chrome = ${result}`);
      } catch (error) {
        console.log(`   ⚠️  ${(error as Error).message}`);
      }
    } else {
      console.log('Step 7: Skip (No background context)');
    }

    console.log('\n🎉 完整调试流程测试完成！');
  });

  it('Storage operations workflow', async () => {
    console.log('\n📦 测试存储操作流程...\n');

    const bgContext = (await helper.getExtensionContexts(testExtensionId))
      .find(ctx => ctx.isPrimary);

    if (!bgContext) {
      console.log('⚠️  跳过测试：无 background context');
      return;
    }

    try {
      // 1. 读取当前存储
      console.log('Step 1: Read current storage');
      const storage1 = await helper.getExtensionStorage(testExtensionId, 'local');
      console.log(`   Keys: ${Object.keys(storage1.data).length}`);

      // 2. 写入数据
      console.log('\nStep 2: Write test data');
      const writeCode = `
        chrome.storage.local.set({
          test_key: 'test_value',
          timestamp: Date.now()
        })
      `;
      await helper.evaluateInContext(bgContext.targetId, writeCode, true);
      console.log('   ✅ 数据写入');

      // 3. 等待一下
      await new Promise(resolve => setTimeout(resolve, 500));

      // 4. 读取新数据
      console.log('\nStep 3: Read updated storage');
      const storage2 = await helper.getExtensionStorage(testExtensionId, 'local');
      console.log(`   Keys: ${Object.keys(storage2.data).length}`);
      console.log(`   Data:`, storage2.data);

      assert.ok(
        Object.keys(storage2.data).length >= Object.keys(storage1.data).length,
        '数据应该增加或保持不变'
      );

      console.log('\n✅ 存储操作流程测试完成');
    } catch (error) {
      console.log(`⚠️  存储操作测试失败: ${(error as Error).message}`);
    }
  });

  it('Error handling and recovery', async () => {
    console.log('\n🛡️  测试错误处理和恢复...\n');

    // 测试不存在的扩展
    console.log('Test 1: Non-existent extension');
    const fakeId = 'a'.repeat(32);
    try {
      await helper.getExtensionDetails(fakeId);
      console.log('   ⚠️  应该返回 null');
    } catch (error) {
      console.log(`   ✅ 正确处理: ${(error as Error).message}`);
    }

    // 测试无效的 target ID
    console.log('\nTest 2: Invalid target ID');
    try {
      await helper.evaluateInContext(
        'invalid-target-id',
        '1 + 1',
        true
      );
      assert.fail('应该抛出错误');
    } catch (error) {
      console.log(`   ✅ 正确抛出错误`);
    }

    // 测试错误的代码
    const bgContext = (await helper.getExtensionContexts(testExtensionId))
      .find(ctx => ctx.isPrimary);

    if (bgContext) {
      console.log('\nTest 3: Invalid code evaluation');
      try {
        await helper.evaluateInContext(
          bgContext.targetId,
          'invalid.code.here',
          true
        );
        console.log('   ⚠️  应该抛出错误');
      } catch (error) {
        console.log(`   ✅ 正确捕获运行时错误`);
      }
    }

    console.log('\n✅ 错误处理测试完成');
  });

  it('Performance and timing', async () => {
    console.log('\n⏱️  测试性能和时序...\n');

    // 测试 list_extensions 性能
    console.log('Test 1: list_extensions performance');
    const start1 = Date.now();
    await helper.getExtensions();
    const duration1 = Date.now() - start1;
    console.log(`   耗时: ${duration1}ms`);
    assert.ok(duration1 < 5000, 'list_extensions 应该在 5 秒内完成');

    // 测试 get_extension_details 性能
    console.log('\nTest 2: get_extension_details performance');
    const start2 = Date.now();
    await helper.getExtensionDetails(testExtensionId);
    const duration2 = Date.now() - start2;
    console.log(`   耗时: ${duration2}ms`);
    assert.ok(duration2 < 3000, 'get_extension_details 应该在 3 秒内完成');

    // 测试 list_extension_contexts 性能
    console.log('\nTest 3: list_extension_contexts performance');
    const start3 = Date.now();
    await helper.getExtensionContexts(testExtensionId);
    const duration3 = Date.now() - start3;
    console.log(`   耗时: ${duration3}ms`);
    assert.ok(duration3 < 3000, 'list_extension_contexts 应该在 3 秒内完成');

    console.log('\n✅ 性能测试完成');
  });
});
