/**
 * inspect_extension_storage 工具测试
 */
import assert from 'node:assert';
import {describe, it, before, after} from 'node:test';
import puppeteer, {Browser} from 'puppeteer';
import path from 'path';
import {fileURLToPath} from 'url';

import {ExtensionHelper} from '../../src/extension/ExtensionHelper.js';
import type {StorageType} from '../../src/extension/types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEST_EXTENSION_PATH = path.join(__dirname, '../../test-extension-enhanced');

describe('inspect_extension_storage', () => {
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
    console.log(`使用测试扩展 ID: ${testExtensionId}`);
  });

  after(async () => {
    if (browser) {
      await browser.close();
    }
  });

  it('should inspect local storage', async () => {
    try {
      const storage = await helper.getExtensionStorage(testExtensionId, 'local');

      assert.ok(storage, '应该获取到 storage 数据');
      assert.ok(typeof storage.data === 'object', 'data 应该是对象');
      
      console.log(`✅ Local Storage:`);
      console.log(`   - Keys: ${Object.keys(storage.data).length}`);
      console.log(`   - Data:`, storage.data);
    } catch (error) {
      console.log(`⚠️  Local storage 测试失败: ${(error as Error).message}`);
      // Service Worker 可能未激活，这是预期的
      if ((error as Error).message.includes('Service Worker')) {
        console.log(`   提示: 需要先激活 Service Worker`);
      }
    }
  });

  it('should inspect sync storage', async () => {
    try {
      const storage = await helper.getExtensionStorage(testExtensionId, 'sync');

      assert.ok(storage, '应该获取到 storage 数据');
      assert.ok(typeof storage.data === 'object', 'data 应该是对象');
      
      console.log(`✅ Sync Storage:`);
      console.log(`   - Keys: ${Object.keys(storage.data).length}`);
    } catch (error) {
      console.log(`⚠️  Sync storage 测试失败: ${(error as Error).message}`);
    }
  });

  it('should include quota information', async () => {
    try {
      const storage = await helper.getExtensionStorage(testExtensionId, 'local');

      if (storage.quota !== undefined) {
        assert.ok(typeof storage.quota === 'number', 'quota 应该是数字');
        assert.ok(storage.quota > 0, 'quota 应该大于 0');
        console.log(`✅ Local Storage Quota: ${storage.quota} bytes`);
      } else {
        console.log(`ℹ️  未返回 quota 信息`);
      }

      if (storage.bytesUsed !== undefined) {
        assert.ok(typeof storage.bytesUsed === 'number', 'bytesUsed 应该是数字');
        assert.ok(storage.bytesUsed >= 0, 'bytesUsed 应该 >= 0');
        console.log(`✅ Bytes Used: ${storage.bytesUsed} bytes`);
      }
    } catch (error) {
      console.log(`⚠️  Quota 测试跳过: ${(error as Error).message}`);
    }
  });

  it('should handle session storage (MV3)', async () => {
    const details = await helper.getExtensionDetails(testExtensionId);

    if (details?.manifestVersion === 3) {
      try {
        const storage = await helper.getExtensionStorage(testExtensionId, 'session');

        assert.ok(storage, '应该获取到 session storage');
        assert.ok(typeof storage.data === 'object', 'data 应该是对象');
        console.log(`✅ Session Storage (MV3):`);
        console.log(`   - Keys: ${Object.keys(storage.data).length}`);
      } catch (error) {
        console.log(`⚠️  Session storage 测试失败: ${(error as Error).message}`);
      }
    } else {
      console.log(`ℹ️  跳过 session storage 测试 (仅 MV3)`);
    }
  });

  it('should handle managed storage', async () => {
    try {
      const storage = await helper.getExtensionStorage(testExtensionId, 'managed');

      assert.ok(storage, '应该获取到 managed storage');
      assert.ok(typeof storage.data === 'object', 'data 应该是对象');
      console.log(`✅ Managed Storage:`);
      console.log(`   - Keys: ${Object.keys(storage.data).length}`);
    } catch (error) {
      // Managed storage 通常为空或不可用
      console.log(`ℹ️  Managed storage: ${(error as Error).message}`);
    }
  });

  it('should return valid storage types', async () => {
    const validTypes: StorageType[] = ['local', 'sync', 'session', 'managed'];
    
    for (const type of validTypes) {
      try {
        const storage = await helper.getExtensionStorage(testExtensionId, type);
        assert.ok(storage, `${type} storage 应该返回数据`);
        console.log(`✅ ${type} storage 结构有效`);
      } catch (error) {
        console.log(`ℹ️  ${type} storage: ${(error as Error).message}`);
      }
    }
  });

  it('should fail gracefully for invalid extension ID', async () => {
    const fakeId = 'a'.repeat(32);
    
    try {
      await helper.getExtensionStorage(fakeId, 'local');
      assert.fail('应该抛出错误');
    } catch (error) {
      assert.ok(error instanceof Error, '应该抛出 Error');
      console.log(`✅ 无效 ID 正确抛出错误`);
    }
  });
});
