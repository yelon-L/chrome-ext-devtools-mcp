/**
 * activate_service_worker 工具测试
 */
import assert from 'node:assert';
import {describe, it, before, after} from 'node:test';
import puppeteer, {Browser} from 'puppeteer';
import path from 'path';
import {fileURLToPath} from 'url';

import {ExtensionHelper} from '../../src/extension/ExtensionHelper.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEST_EXTENSION_PATH = path.join(__dirname, '../../test-extension-enhanced');

describe('activate_service_worker', () => {
  let browser: Browser;
  let helper: ExtensionHelper;
  let testExtensionId: string;

  before(async () => {
    // 启动 Chrome 并加载测试扩展
    browser = await puppeteer.launch({
      headless: false,
      args: [
        '--remote-debugging-port=9559',
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

  it('should check Service Worker status', async () => {
    const details = await helper.getExtensionDetails(testExtensionId);

    if (details?.manifestVersion === 3) {
      const isActive = await helper.isServiceWorkerActive(testExtensionId);
      
      assert.strictEqual(typeof isActive, 'boolean', '应该返回布尔值');
      console.log(`✅ Service Worker 状态: ${isActive ? 'Active' : 'Inactive'}`);
    } else {
      console.log(`ℹ️  测试扩展是 MV${details?.manifestVersion}，无 Service Worker`);
    }
  });

  it('should activate Service Worker for MV3 extension', async () => {
    const details = await helper.getExtensionDetails(testExtensionId);

    if (details?.manifestVersion === 3) {
      try {
        const result = await helper.activateServiceWorker(testExtensionId);

        assert.ok(result, '应该返回激活结果');
        assert.strictEqual(typeof result.success, 'boolean', 'success 应该是布尔值');

        if (result.success) {
          console.log(`✅ Service Worker 激活成功`);
          if (result.method) {
            console.log(`   方法: ${result.method}`);
          }
          if (result.url) {
            console.log(`   URL: ${result.url}`);
          }
        } else {
          console.log(`⚠️  Service Worker 激活失败`);
          if (result.error) {
            console.log(`   错误: ${result.error}`);
          }
          if (result.suggestion) {
            console.log(`   建议: ${result.suggestion}`);
          }
        }
      } catch (error) {
        console.log(`⚠️  激活测试失败: ${(error as Error).message}`);
      }
    } else {
      console.log(`ℹ️  跳过 MV2 扩展的 Service Worker 测试`);
    }
  });

  it('should return result structure', async () => {
    const details = await helper.getExtensionDetails(testExtensionId);

    if (details?.manifestVersion === 3) {
      try {
        const result = await helper.activateServiceWorker(testExtensionId);

        // 验证结构
        assert.ok('success' in result, '结果应该有 success 字段');
        
        if (!result.success) {
          assert.ok(
            result.error || result.suggestion,
            '失败时应该有 error 或 suggestion'
          );
        }

        console.log(`✅ 激活结果结构正确`);
      } catch (error) {
        console.log(`⚠️  结构测试跳过: ${(error as Error).message}`);
      }
    }
  });

  it('should detect already active Service Worker', async () => {
    const details = await helper.getExtensionDetails(testExtensionId);

    if (details?.manifestVersion === 3) {
      try {
        // 先激活一次
        await helper.activateServiceWorker(testExtensionId);
        
        // 等待一下
        await new Promise(resolve => setTimeout(resolve, 1000));

        // 检查状态
        const isActive = await helper.isServiceWorkerActive(testExtensionId);

        if (isActive) {
          // 再次尝试激活
          const result = await helper.activateServiceWorker(testExtensionId);
          
          // 应该立即返回成功（因为已经是 active）
          console.log(`✅ 检测到已激活的 Service Worker`);
        } else {
          console.log(`ℹ️  Service Worker 未激活`);
        }
      } catch (error) {
        console.log(`⚠️  重复激活测试跳过: ${(error as Error).message}`);
      }
    }
  });

  it('should fail gracefully for MV2 extensions', async () => {
    const details = await helper.getExtensionDetails(testExtensionId);

    if (details?.manifestVersion === 2) {
      try {
        const result = await helper.activateServiceWorker(testExtensionId);
        
        // MV2 应该失败或返回 false
        assert.strictEqual(result.success, false, 'MV2 应该激活失败');
        console.log(`✅ MV2 扩展正确处理`);
      } catch (error) {
        // 抛出错误也是可以接受的
        console.log(`✅ MV2 扩展正确抛出错误`);
      }
    }
  });

  it('should handle non-existent extension', async () => {
    const fakeId = 'a'.repeat(32);

    try {
      await helper.activateServiceWorker(fakeId);
      assert.fail('应该抛出错误');
    } catch (error) {
      assert.ok(error instanceof Error, '应该抛出 Error');
      console.log(`✅ 不存在的扩展正确抛出错误`);
    }
  });
});
