/**
 * list_extensions 工具测试
 */
import assert from 'node:assert';
import {describe, it, before, after} from 'node:test';
import puppeteer, {Browser} from 'puppeteer';
import path from 'path';
import {fileURLToPath} from 'url';

import {ExtensionHelper} from '../../src/extension/ExtensionHelper.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEST_EXTENSION_PATH = path.join(__dirname, '../../test-extension-enhanced');

describe('list_extensions', () => {
  let browser: Browser;
  let helper: ExtensionHelper;

  before(async () => {
    // 启动 Chrome 并加载测试扩展
    browser = await puppeteer.launch({
      headless: false,
      args: [
        '--remote-debugging-port=9555',
        `--disable-extensions-except=${TEST_EXTENSION_PATH}`,
        `--load-extension=${TEST_EXTENSION_PATH}`,
      ],
    });

    // 等待扩展加载
    await new Promise(resolve => setTimeout(resolve, 2000));

    helper = new ExtensionHelper(browser);
  });

  after(async () => {
    if (browser) {
      await browser.close();
    }
  });

  it('should find at least one extension', async () => {
    const extensions = await helper.getExtensions();
    
    assert.ok(extensions.length > 0, '应该至少找到 1 个扩展');
    console.log(`✅ 找到 ${extensions.length} 个扩展`);
  });

  it('should find the test extension', async () => {
    const extensions = await helper.getExtensions();
    
    const testExt = extensions.find(ext => 
      ext.name.includes('Enhanced MCP Debug Test Extension')
    );
    
    assert.ok(testExt, '应该找到测试扩展');
    assert.strictEqual(testExt?.manifestVersion, 3, '应该是 MV3 扩展');
    console.log(`✅ 找到测试扩展: ${testExt?.name}`);
  });

  it('should detect Service Worker status', async () => {
    const extensions = await helper.getExtensions();
    
    for (const ext of extensions) {
      if (ext.manifestVersion === 3) {
        assert.ok(
          ext.serviceWorkerStatus,
          `扩展 ${ext.name} 应该有 SW 状态`
        );
        
        assert.ok(
          ['active', 'inactive', 'not_found'].includes(ext.serviceWorkerStatus!),
          'SW 状态应该是有效值'
        );
        
        console.log(`✅ ${ext.name}: SW = ${ext.serviceWorkerStatus}`);
      }
    }
  });

  it('should include extension details', async () => {
    const extensions = await helper.getExtensions();
    
    for (const ext of extensions) {
      assert.ok(ext.id, '应该有扩展 ID');
      assert.ok(ext.name, '应该有扩展名称');
      assert.ok(ext.version, '应该有版本号');
      assert.ok(ext.manifestVersion, '应该有 manifest 版本');
      
      console.log(`✅ ${ext.name} 包含完整信息`);
    }
  });

  it('should detect Helper Extension if installed', async () => {
    const extensions = await helper.getExtensions();
    
    const helperExt = extensions.find(ext => 
      ext.name.includes('MCP Service Worker Activator')
    );
    
    if (helperExt) {
      console.log(`✅ 检测到 Helper Extension: ${helperExt.id}`);
      assert.ok(helperExt.permissions?.includes('management'), '应该有 management 权限');
      assert.ok(helperExt.permissions?.includes('debugger'), '应该有 debugger 权限');
    } else {
      console.log(`ℹ️  Helper Extension 未安装（预期行为）`);
    }
  });
});
