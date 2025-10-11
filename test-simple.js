#!/usr/bin/env node

import puppeteer from 'puppeteer';

console.log('\n🧪 开始测试...\n');

try {
  const browser = await puppeteer.connect({
    browserURL: 'http://localhost:9222',
  });
  
  console.log('✅ 连接成功');
  
  const helperExtId = 'kppbmoiecmhnnhjnlkojlblanellmonp';
  const targetExtId = 'bekcbmopkiajilfliobihjgnghfcbido';
  
  const testPage = await browser.newPage();
  await testPage.goto('http://localhost:9222/json');
  
  console.log('\n📨 发送激活请求...');
  
  const result = await testPage.evaluate(
    (helperId, targetId) => {
      return new Promise((resolve) => {
        chrome.runtime.sendMessage(
          helperId,
          {action: 'activate', extensionId: targetId},
          (response) => {
            if (chrome.runtime.lastError) {
              resolve({success: false, error: chrome.runtime.lastError.message});
            } else {
              resolve(response);
            }
          }
        );
        setTimeout(() => resolve({success: false, error: 'Timeout'}), 3000);
      });
    },
    helperExtId,
    targetExtId
  );
  
  console.log('\n📊 结果:', JSON.stringify(result, null, 2));
  
  if (result.success) {
    console.log('\n🎉 成功！Helper Extension 工作正常！');
    console.log(`   方法: ${result.method}`);
    console.log(`   耗时: ${result.duration || 'N/A'}ms`);
  } else {
    console.log('\n❌ 失败:', result.error);
  }
  
  await testPage.close();
  await browser.disconnect();
  
} catch (error) {
  console.error('\n❌ 错误:', error.message);
  process.exit(1);
}
