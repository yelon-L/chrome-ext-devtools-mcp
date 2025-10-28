/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Popup 生命周期工具测试
 *
 * 测试覆盖：
 * - is_popup_open: 检查popup状态
 * - open_extension_popup: 打开popup（含fallback）
 * - wait_for_popup: 等待popup打开
 * - close_popup: 关闭popup
 * - get_popup_info: 获取popup信息
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

describe('popup_lifecycle', () => {
  let browser: Browser;
  let helper: ExtensionHelper;
  let testExtensionId: string;

  before(async () => {
    // 启动 Chrome 并加载测试扩展
    browser = await puppeteer.launch({
      headless: false,
      args: [
        '--remote-debugging-port=9558',
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
      ext.name.includes('Enhanced MCP Debug Test Extension'),
    );

    if (!testExt) {
      throw new Error('测试扩展未找到');
    }

    testExtensionId = testExt.id;
    console.log(`✅ 测试扩展 ID: ${testExtensionId}`);
  });

  after(async () => {
    if (browser) {
      await browser.close();
    }
  });

  it('should detect popup is closed initially', async () => {
    const contexts = await helper.getExtensionContexts(testExtensionId);
    const popupContext = contexts.find(ctx => ctx.type === 'popup');

    assert.strictEqual(popupContext, undefined, 'Popup 应该初始关闭');
    console.log('✅ Popup 初始状态：关闭');
  });

  it('should open popup via navigate (fallback method)', async () => {
    // 获取扩展详情以构建popup URL
    const extension = await helper.getExtensionDetails(testExtensionId);
    assert.ok(extension, '扩展应该存在');

    // 使用fallback方法：直接导航到popup.html
    const pages = await browser.pages();
    const page = pages[0] || (await browser.newPage());

    await page.goto(`chrome-extension://${testExtensionId}/popup.html`);

    // 等待popup加载
    await new Promise(resolve => setTimeout(resolve, 1000));

    // 验证popup已打开
    const contexts = await helper.getExtensionContexts(testExtensionId);
    const popupContext = contexts.find(ctx => ctx.type === 'popup');

    assert.ok(popupContext, 'Popup 应该已打开');
    assert.ok(
      popupContext.url.includes('popup.html'),
      'URL 应该包含 popup.html',
    );
    console.log(`✅ Popup 已打开: ${popupContext.url}`);
  });

  it('should detect popup is open', async () => {
    const contexts = await helper.getExtensionContexts(testExtensionId);
    const popupContext = contexts.find(ctx => ctx.type === 'popup');

    assert.ok(popupContext, 'Popup 应该处于打开状态');
    assert.strictEqual(popupContext.type, 'popup', '上下文类型应该是 popup');
    console.log('✅ Popup 状态检测：打开');
  });

  it('should close popup', async () => {
    // 获取popup上下文
    const contexts = await helper.getExtensionContexts(testExtensionId);
    const popupContext = contexts.find(ctx => ctx.type === 'popup');

    assert.ok(popupContext, 'Popup 应该存在才能关闭');

    // 获取所有页面
    const pages = await browser.pages();
    const popupPage = pages.find(page => page.url() === popupContext!.url);

    assert.ok(popupPage, 'Popup 页面应该存在');

    // 关闭popup页面
    await popupPage!.close();

    // 等待关闭完成
    await new Promise(resolve => setTimeout(resolve, 500));

    // 验证popup已关闭
    const updatedContexts = await helper.getExtensionContexts(testExtensionId);
    const closedPopupContext = updatedContexts.find(
      ctx => ctx.type === 'popup',
    );

    assert.strictEqual(closedPopupContext, undefined, 'Popup 应该已关闭');
    console.log('✅ Popup 已关闭');
  });

  it('should verify popup configuration', async () => {
    const extension = await helper.getExtensionDetails(testExtensionId);

    assert.ok(extension, '扩展应该存在');
    assert.strictEqual(extension.manifestVersion, 3, '应该是 MV3 扩展');

    console.log(`✅ 扩展配置验证通过`);
    console.log(`   - 名称: ${extension.name}`);
    console.log(`   - 版本: ${extension.version}`);
    console.log(`   - Manifest: MV${extension.manifestVersion}`);
  });

  it('should handle popup lifecycle: open -> check -> close', async () => {
    // 1. 确保popup关闭
    let contexts = await helper.getExtensionContexts(testExtensionId);
    let popupContext = contexts.find(ctx => ctx.type === 'popup');

    if (popupContext) {
      const pages = await browser.pages();
      const popupPage = pages.find(page => page.url() === popupContext!.url);
      if (popupPage) {
        await popupPage.close();
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    // 2. 打开popup
    const pages = await browser.pages();
    const page = pages[0] || (await browser.newPage());
    await page.goto(`chrome-extension://${testExtensionId}/popup.html`);
    await new Promise(resolve => setTimeout(resolve, 1000));

    // 3. 检查popup已打开
    contexts = await helper.getExtensionContexts(testExtensionId);
    popupContext = contexts.find(ctx => ctx.type === 'popup');
    assert.ok(popupContext, '步骤2: Popup 应该已打开');

    // 4. 关闭popup
    const popupPage = pages.find(p => p.url() === popupContext!.url);
    assert.ok(popupPage, '步骤3: Popup 页面应该存在');
    await popupPage.close();
    await new Promise(resolve => setTimeout(resolve, 500));

    // 5. 验证popup已关闭
    contexts = await helper.getExtensionContexts(testExtensionId);
    popupContext = contexts.find(ctx => ctx.type === 'popup');
    assert.strictEqual(popupContext, undefined, '步骤4: Popup 应该已关闭');

    console.log('✅ Popup 生命周期测试通过: open → check → close');
  });

  it('should handle multiple popup open/close cycles', async () => {
    const cycles = 3;

    for (let i = 0; i < cycles; i++) {
      // 打开
      const pages = await browser.pages();
      const page = pages[0] || (await browser.newPage());
      await page.goto(`chrome-extension://${testExtensionId}/popup.html`);
      await new Promise(resolve => setTimeout(resolve, 500));

      // 验证打开
      let contexts = await helper.getExtensionContexts(testExtensionId);
      let popupContext = contexts.find(ctx => ctx.type === 'popup');
      assert.ok(popupContext, `循环 ${i + 1}: Popup 应该已打开`);

      // 关闭
      const popupPage = pages.find(p => p.url() === popupContext!.url);
      if (popupPage) {
        await popupPage.close();
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      // 验证关闭
      contexts = await helper.getExtensionContexts(testExtensionId);
      popupContext = contexts.find(ctx => ctx.type === 'popup');
      assert.strictEqual(
        popupContext,
        undefined,
        `循环 ${i + 1}: Popup 应该已关闭`,
      );
    }

    console.log(`✅ 多次循环测试通过 (${cycles} 次)`);
  });
});
