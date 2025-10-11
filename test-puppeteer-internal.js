/**
 * 测试能否通过 Puppeteer Target 的内部属性访问真实类型
 */

import puppeteer from 'puppeteer-core';

async function testInternalAPI() {
  const browser = await puppeteer.connect({
    browserURL: 'http://localhost:9222',
  });

  console.log('=== 测试 Puppeteer Target 内部属性 ===\n');
  
  const targets = await browser.targets();
  
  for (const target of targets) {
    const type = target.type();
    
    if (type === 'other' || target.url().startsWith('chrome-extension://')) {
      console.log(`Target:`);
      console.log(`  Public type(): ${type}`);
      console.log(`  URL: ${target.url()}`);
      
      // 尝试访问内部属性
      console.log(`  Internal _targetInfo:`, target._targetInfo ? {
        type: target._targetInfo.type,
        targetId: target._targetInfo.targetId,
        url: target._targetInfo.url,
        title: target._targetInfo.title,
      } : 'undefined');
      
      console.log('');
    }
  }
  
  console.log('=== 结论 ===');
  console.log('如果 _targetInfo.type 显示正确的类型，说明：');
  console.log('  1. Puppeteer 内部有正确的类型信息');
  console.log('  2. 但 type() 方法的映射逻辑有问题');
  console.log('  3. 可以考虑访问 _targetInfo（但不推荐，因为是私有 API）');

  await browser.disconnect();
}

testInternalAPI().catch(console.error);
