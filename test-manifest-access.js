/**
 * 测试不同方式访问扩展 manifest
 */

import puppeteer from 'puppeteer';

async function testManifestAccess() {
  const browser = await puppeteer.launch({
    headless: false,
    args: [
      '--remote-debugging-port=9444',
      '--disable-extensions-except=E:/developer/workspace/me/chrome-ext-devtools-mcp/test-extension-enhanced',
      '--load-extension=E:/developer/workspace/me/chrome-ext-devtools-mcp/test-extension-enhanced',
    ],
  });

  await new Promise(resolve => setTimeout(resolve, 2000));

  const page = (await browser.pages())[0];
  const cdp = await page.createCDPSession();

  // 获取扩展 ID
  const result = await cdp.send('Target.getTargets');
  const swTarget = result.targetInfos.find(
    t => t.type === 'service_worker' && t.url.startsWith('chrome-extension://'),
  );

  const extensionId = swTarget.url.match(/chrome-extension:\/\/([a-z]{32})/)[1];
  console.log('Extension ID:', extensionId);

  // 方法 1: 在新标签页中打开扩展 URL 并读取
  console.log('\n=== 方法 1: 新标签页打开 manifest.json ===');
  try {
    const manifestPage = await browser.newPage();
    await manifestPage.goto(`chrome-extension://${extensionId}/manifest.json`);
    const content = await manifestPage.evaluate(() => document.body.textContent);
    const manifest = JSON.parse(content);
    console.log('✅ 成功！');
    console.log('Name:', manifest.name);
    console.log('Version:', manifest.version);
    await manifestPage.close();
  } catch (e) {
    console.log('❌ 失败:', e.message);
  }

  // 方法 2: 通过 fetch API
  console.log('\n=== 方法 2: 通过 fetch API ===');
  try {
    const manifest = await page.evaluate(async extId => {
      const response = await fetch(`chrome-extension://${extId}/manifest.json`);
      return await response.json();
    }, extensionId);
    console.log('✅ 成功！');
    console.log('Name:', manifest.name);
  } catch (e) {
    console.log('❌ 失败:', e.message);
  }

  // 方法 3: 创建扩展页面并在其中调用
  console.log('\n=== 方法 3: 扩展页面中调用 chrome.runtime.getManifest() ===');
  try {
    const extPage = await browser.newPage();
    await extPage.goto(`chrome-extension://${extensionId}/options.html`);
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    const manifest = await extPage.evaluate(() => {
      return chrome.runtime.getManifest();
    });
    console.log('✅ 成功！');
    console.log('Name:', manifest.name);
    await extPage.close();
  } catch (e) {
    console.log('❌ 失败:', e.message);
  }

  await browser.close();
}

testManifestAccess().catch(console.error);
