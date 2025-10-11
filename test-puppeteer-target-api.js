/**
 * 深度测试 Puppeteer Target API 对扩展的支持
 */

import puppeteer from 'puppeteer-core';

async function testTargetAPI() {
  const browser = await puppeteer.connect({
    browserURL: 'http://localhost:9222',
  });

  console.log('=== Puppeteer Target API 详细分析 ===\n');
  console.log('Puppeteer 版本:', puppeteer.version);
  
  const targets = await browser.targets();
  
  console.log(`\n总共 ${targets.length} 个 targets\n`);
  
  for (const target of targets) {
    const type = target.type();
    const url = target.url();
    
    // 只看可能与扩展相关的 target
    if (type === 'other' || type === 'service_worker' || url.startsWith('chrome-extension://')) {
      console.log(`Target 详情:`);
      console.log(`  Type: ${type}`);
      console.log(`  URL: ${url}`);
      
      // 尝试获取内部的 _targetInfo
      if (target._targetInfo) {
        console.log(`  _targetInfo.type: ${target._targetInfo.type}`);
        console.log(`  _targetInfo.targetId: ${target._targetInfo.targetId}`);
      }
      
      // 测试是否能访问页面
      try {
        const page = await target.page();
        console.log(`  ✅ 可以访问 page:`, !!page);
        if (page) {
          console.log(`     Page URL: ${page.url()}`);
        }
      } catch (e) {
        console.log(`  ❌ 无法访问 page: ${e.message}`);
      }
      
      // 测试是否能创建 CDP session
      try {
        const session = await target.createCDPSession();
        console.log(`  ✅ 可以创建 CDP session`);
        
        // 尝试在这个 session 中获取信息
        try {
          const result = await session.send('Runtime.evaluate', {
            expression: 'typeof chrome !== "undefined" && chrome.runtime ? chrome.runtime.getManifest() : null',
            returnByValue: true,
          });
          if (result.result?.value) {
            console.log(`  ✅ 可以访问 chrome.runtime.getManifest()`);
            console.log(`     Extension name: ${result.result.value.name}`);
            console.log(`     Extension version: ${result.result.value.version}`);
          }
        } catch (e) {
          console.log(`  ❌ 无法访问 manifest: ${e.message}`);
        }
        
        await session.detach();
      } catch (e) {
        console.log(`  ❌ 无法创建 CDP session: ${e.message}`);
      }
      
      console.log('');
    }
  }
  
  console.log('\n=== 对比 CDP 原始数据 ===\n');
  
  const page = (await browser.pages())[0];
  const cdp = await page.createCDPSession();
  const result = await cdp.send('Target.getTargets');
  
  const extensionTargets = result.targetInfos.filter(t => 
    t.type === 'service_worker' || 
    t.type === 'background_page' ||
    t.url?.startsWith('chrome-extension://')
  );
  
  console.log(`CDP 检测到 ${extensionTargets.length} 个扩展相关 targets:`);
  for (const t of extensionTargets) {
    console.log(`  - ${t.type}: ${t.title}`);
  }

  await browser.disconnect();
}

testTargetAPI().catch(console.error);
