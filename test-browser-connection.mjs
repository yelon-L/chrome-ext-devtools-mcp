#!/usr/bin/env node

/**
 * 测试浏览器连接
 */

import puppeteer from 'puppeteer-core';

const BROWSER_URL = 'http://localhost:9222';

console.log(`🧪 测试浏览器连接: ${BROWSER_URL}\n`);

async function testConnection() {
  try {
    console.log('正在连接...');
    const browser = await puppeteer.connect({
      browserURL: BROWSER_URL,
      defaultViewport: null,
    });

    console.log('✅ 浏览器连接成功!');
    console.log(`   已连接: ${browser.isConnected()}`);
    
    const version = await browser.version();
    console.log(`   版本: ${version}`);

    const pages = await browser.pages();
    console.log(`   页面数: ${pages.length}`);

    await browser.disconnect();
    console.log('\n✅ 测试完成');
  } catch (error) {
    console.error('\n❌ 连接失败:', error.message);
    console.error('\n💡 请确保:');
    console.error('   1. Chrome 已在 192.168.0.201 上启动');
    console.error('   2. 启动时使用了 --remote-debugging-port=9222');
    console.error('   3. 防火墙允许 9222 端口访问');
  }
}

testConnection();
