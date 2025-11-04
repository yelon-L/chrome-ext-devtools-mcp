// 测试 puppeteer 连接
import puppeteer from 'puppeteer-core';

console.log('测试连接到 Chrome...');

try {
  const browser = await puppeteer.connect({
    browserURL: 'http://127.0.0.1:9222',
    defaultViewport: null,
  });
  
  console.log('✅ 连接成功');
  console.log('版本:', await browser.version());
  console.log('页面数:', (await browser.pages()).length);
  
  await browser.disconnect();
  console.log('✅ 断开连接');
} catch (error) {
  console.error('❌ 连接失败:', error.message);
  process.exit(1);
}
