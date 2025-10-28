/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
/**
 * get_extension_details 工具测试
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

describe('get_extension_details', () => {
  let browser: Browser;
  let helper: ExtensionHelper;
  let testExtensionId: string;

  before(async () => {
    // 启动 Chrome 并加载测试扩展
    browser = await puppeteer.launch({
      headless: false,
      args: [
        '--remote-debugging-port=9556',
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
  });

  after(async () => {
    if (browser) {
      await browser.close();
    }
  });

  it('should get extension details by ID', async () => {
    const details = await helper.getExtensionDetails(testExtensionId);

    assert.ok(details, '应该获取到扩展详情');
    assert.strictEqual(details?.id, testExtensionId, 'ID 应该匹配');
    assert.ok(details?.name, '应该有扩展名称');
    assert.ok(details?.version, '应该有版本号');

    console.log(`✅ 获取到扩展详情: ${details?.name} v${details?.version}`);
  });

  it('should include manifest information', async () => {
    const details = await helper.getExtensionDetails(testExtensionId);

    assert.ok(details, '应该获取到扩展详情');
    assert.ok(
      details?.manifestVersion === 2 || details?.manifestVersion === 3,
      'Manifest 版本应该是 2 或 3',
    );

    console.log(`✅ Manifest Version: ${details?.manifestVersion}`);
  });

  it('should include permissions', async () => {
    const details = await helper.getExtensionDetails(testExtensionId);

    assert.ok(details, '应该获取到扩展详情');

    if (details?.permissions && details.permissions.length > 0) {
      console.log(`✅ 权限: ${details.permissions.join(', ')}`);
      assert.ok(Array.isArray(details.permissions), '权限应该是数组');
    } else {
      console.log('ℹ️  扩展没有权限');
    }
  });

  it('should include host permissions', async () => {
    const details = await helper.getExtensionDetails(testExtensionId);

    assert.ok(details, '应该获取到扩展详情');

    if (details?.hostPermissions && details.hostPermissions.length > 0) {
      console.log(`✅ Host 权限: ${details.hostPermissions.join(', ')}`);
      assert.ok(Array.isArray(details.hostPermissions), 'Host 权限应该是数组');
    } else {
      console.log('ℹ️  扩展没有 Host 权限');
    }
  });

  it('should include background information', async () => {
    const details = await helper.getExtensionDetails(testExtensionId);

    assert.ok(details, '应该获取到扩展详情');

    if (details?.backgroundUrl) {
      console.log(`✅ Background: ${details.backgroundUrl}`);
      assert.ok(
        details.backgroundUrl.startsWith('chrome-extension://'),
        'Background URL 格式正确',
      );
    } else {
      console.log('ℹ️  扩展没有 background');
    }
  });

  it('should return null for non-existent extension', async () => {
    const fakeId = 'a'.repeat(32);
    const details = await helper.getExtensionDetails(fakeId);

    assert.strictEqual(details, null, '不存在的扩展应该返回 null');
    console.log(`✅ 不存在的扩展正确返回 null`);
  });

  it('should include enabled status', async () => {
    const details = await helper.getExtensionDetails(testExtensionId);

    assert.ok(details, '应该获取到扩展详情');
    assert.strictEqual(
      typeof details?.enabled,
      'boolean',
      'enabled 应该是布尔值',
    );

    console.log(`✅ 扩展状态: ${details?.enabled ? 'Enabled' : 'Disabled'}`);
  });
});
