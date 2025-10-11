/**
 * 测试 Puppeteer API vs CDP API 在扩展检测上的差异
 */

import puppeteer from 'puppeteer-core';

async function testExtensionDetection() {
  const browser = await puppeteer.connect({
    browserURL: 'http://localhost:9222',
  });

  console.log('=== Puppeteer 高级 API ===\n');
  
  const targets = await browser.targets();
  console.log(`总共 ${targets.length} 个 targets`);
  
  // 按类型分组
  const byType = {};
  for (const target of targets) {
    const type = target.type();
    byType[type] = (byType[type] || 0) + 1;
    
    // 打印扩展相关的 target
    if (type === 'service_worker' || target.url().startsWith('chrome-extension://')) {
      console.log(`- Type: ${type}`);
      console.log(`  URL: ${target.url()}`);
      console.log(`  Available methods:`, Object.getOwnPropertyNames(Object.getPrototypeOf(target)));
      console.log('');
    }
  }
  
  console.log('\nTarget 类型统计:');
  for (const [type, count] of Object.entries(byType)) {
    console.log(`  ${type}: ${count}`);
  }

  console.log('\n\n=== CDP 底层 API ===\n');
  
  const page = (await browser.pages())[0];
  const cdp = await page.createCDPSession();
  
  const result = await cdp.send('Target.getTargets');
  console.log(`总共 ${result.targetInfos.length} 个 targets`);
  
  // 按类型分组
  const byTypeCDP = {};
  for (const target of result.targetInfos) {
    byTypeCDP[target.type] = (byTypeCDP[target.type] || 0) + 1;
    
    // 打印扩展相关的 target
    if (target.type === 'service_worker' || 
        target.type === 'background_page' ||
        target.url?.startsWith('chrome-extension://')) {
      console.log(`- Type: ${target.type}`);
      console.log(`  URL: ${target.url}`);
      console.log(`  Title: ${target.title}`);
      console.log(`  TargetId: ${target.targetId}`);
      console.log('');
    }
  }
  
  console.log('\nTarget 类型统计:');
  for (const [type, count] of Object.entries(byTypeCDP)) {
    console.log(`  ${type}: ${count}`);
  }

  await browser.disconnect();
}

testExtensionDetection().catch(console.error);
