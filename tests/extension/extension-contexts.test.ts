
/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
/**
 * list_extension_contexts 和 switch_extension_context 工具测试
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

describe('extension_contexts', () => {
  let browser: Browser;
  let helper: ExtensionHelper;
  let testExtensionId: string;

  before(async () => {
    // 启动 Chrome 并加载测试扩展
    browser = await puppeteer.launch({
      headless: false,
      args: [
        '--remote-debugging-port=9557',
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

  it('should list extension contexts', async () => {
    const contexts = await helper.getExtensionContexts(testExtensionId);

    assert.ok(Array.isArray(contexts), 'contexts 应该是数组');
    console.log(`✅ 找到 ${contexts.length} 个上下文`);

    if (contexts.length > 0) {
      contexts.forEach(ctx => {
        console.log(`   - ${ctx.type}: ${ctx.title || ctx.url}`);
      });
    }
  });

  it('should include background context for MV3', async () => {
    const details = await helper.getExtensionDetails(testExtensionId);

    if (details?.manifestVersion === 3) {
      const contexts = await helper.getExtensionContexts(testExtensionId);
      const backgroundCtx = contexts.find(ctx => ctx.type === 'background');

      // MV3 扩展可能有 Service Worker
      if (backgroundCtx) {
        assert.ok(backgroundCtx.targetId, '应该有 target ID');
        assert.ok(backgroundCtx.url, '应该有 URL');
        console.log(`✅ 找到 background context: ${backgroundCtx.url}`);
      } else {
        console.log(`ℹ️  MV3 扩展但无活跃的 Service Worker`);
      }
    } else {
      console.log(`ℹ️  测试扩展是 MV${details?.manifestVersion}，跳过 MV3 测试`);
    }
  });

  it('should have valid context structure', async () => {
    const contexts = await helper.getExtensionContexts(testExtensionId);

    for (const ctx of contexts) {
      assert.ok(ctx.targetId, `上下文应该有 targetId`);
      assert.ok(ctx.type, `上下文应该有类型`);
      assert.ok(ctx.url, `上下文应该有 URL`);
      assert.ok(
        ctx.url.startsWith('chrome-extension://'),
        'URL 应该是扩展 URL'
      );
      
      // type 应该是有效值
      const validTypes = ['background', 'popup', 'options', 'devtools', 'content_script', 'other'];
      assert.ok(
        validTypes.includes(ctx.type),
        `上下文类型 ${ctx.type} 应该是有效值`
      );
    }

    console.log(`✅ 所有上下文结构有效`);
  });

  it('should identify primary context', async () => {
    const contexts = await helper.getExtensionContexts(testExtensionId);

    if (contexts.length > 0) {
      const primaryContexts = contexts.filter(ctx => ctx.isPrimary);
      
      // 应该最多有一个主要上下文
      assert.ok(
        primaryContexts.length <= 1,
        '应该最多有一个主要上下文'
      );

      if (primaryContexts.length === 1) {
        console.log(`✅ 主要上下文: ${primaryContexts[0].type}`);
      } else {
        console.log(`ℹ️  没有标记为主要的上下文`);
      }
    }
  });

  it('should return empty array for non-existent extension', async () => {
    const fakeId = 'a'.repeat(32);
    const contexts = await helper.getExtensionContexts(fakeId);

    assert.ok(Array.isArray(contexts), 'contexts 应该是数组');
    assert.strictEqual(contexts.length, 0, '不存在的扩展应该返回空数组');
    console.log(`✅ 不存在的扩展正确返回空数组`);
  });

  it('should group contexts by type', async () => {
    const contexts = await helper.getExtensionContexts(testExtensionId);

    if (contexts.length > 0) {
      const grouped = contexts.reduce((acc, ctx) => {
        acc[ctx.type] = (acc[ctx.type] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      console.log(`✅ 上下文分组:`);
      for (const [type, count] of Object.entries(grouped)) {
        console.log(`   - ${type}: ${count}`);
      }
    }
  });
});
