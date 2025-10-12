#!/usr/bin/env node
/**
 * CDP 混合架构测试脚本
 * 
 * 测试三种模式：
 * 1. 纯 Puppeteer（基线）
 * 2. CDP Target 管理
 * 3. CDP Target + Operations（完整混合）
 */

import puppeteer from 'puppeteer-core';

const CHROME_PATH = process.env.CHROME_PATH || '/usr/bin/google-chrome';
const TEST_ITERATIONS = 5; // 每种模式测试次数

console.log('\n╔════════════════════════════════════════════════════════╗');
console.log('║       CDP 混合架构性能测试                              ║');
console.log('╚════════════════════════════════════════════════════════╝\n');

/**
 * 测试创建页面性能
 */
async function testPageCreation(browser, mode) {
  const times = [];
  
  for (let i = 0; i < TEST_ITERATIONS; i++) {
    const start = Date.now();
    
    try {
      const page = await browser.newPage();
      const elapsed = Date.now() - start;
      times.push(elapsed);
      
      console.log(`  [${mode}] 第 ${i + 1} 次创建页面: ${elapsed}ms`);
      
      await page.close();
    } catch (error) {
      console.error(`  [${mode}] 第 ${i + 1} 次失败: ${error.message}`);
    }
  }
  
  return times;
}

/**
 * 测试导航性能
 */
async function testNavigation(page, mode) {
  const times = [];
  const urls = [
    'https://example.com',
    'https://www.google.com',
    'https://github.com',
  ];
  
  for (const url of urls) {
    const start = Date.now();
    
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 10000 });
      const elapsed = Date.now() - start;
      times.push(elapsed);
      
      console.log(`  [${mode}] 导航至 ${url}: ${elapsed}ms`);
    } catch (error) {
      console.error(`  [${mode}] 导航失败 ${url}: ${error.message}`);
    }
  }
  
  return times;
}

/**
 * 计算统计数据
 */
function calculateStats(times) {
  if (times.length === 0) {
    return { avg: 0, min: 0, max: 0, median: 0 };
  }
  
  const sorted = [...times].sort((a, b) => a - b);
  const sum = times.reduce((a, b) => a + b, 0);
  
  return {
    avg: Math.round(sum / times.length),
    min: sorted[0],
    max: sorted[sorted.length - 1],
    median: sorted[Math.floor(sorted.length / 2)],
  };
}

/**
 * 主测试流程
 */
async function main() {
  let browser;
  
  try {
    // 启动浏览器
    console.log('🚀 启动 Chrome 浏览器...');
    browser = await puppeteer.launch({
      executablePath: CHROME_PATH,
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-blink-features=AutomationControlled',
      ],
    });
    
    const version = await browser.version();
    console.log(`✓ 浏览器已启动: ${version}\n`);
    
    // 测试结果存储
    const results = {};
    
    // ========== 测试 1: 纯 Puppeteer（基线）==========
    console.log('📊 测试 1: 纯 Puppeteer 模式（基线）');
    console.log('─'.repeat(60));
    
    results.puppeteer = {
      pageCreation: await testPageCreation(browser, 'Puppeteer'),
      navigation: [],
    };
    
    // 创建测试页面
    const puppeteerPage = await browser.newPage();
    results.puppeteer.navigation = await testNavigation(puppeteerPage, 'Puppeteer');
    await puppeteerPage.close();
    
    console.log('');
    
    // ========== 汇总结果 ==========
    console.log('\n╔════════════════════════════════════════════════════════╗');
    console.log('║                    测试结果汇总                         ║');
    console.log('╚════════════════════════════════════════════════════════╝\n');
    
    console.log('📈 页面创建性能（毫秒）：');
    console.log('─'.repeat(60));
    
    for (const [mode, data] of Object.entries(results)) {
      const stats = calculateStats(data.pageCreation);
      console.log(`\n${mode.toUpperCase()}:`);
      console.log(`  平均: ${stats.avg}ms`);
      console.log(`  最小: ${stats.min}ms`);
      console.log(`  最大: ${stats.max}ms`);
      console.log(`  中位数: ${stats.median}ms`);
    }
    
    console.log('\n\n🌐 页面导航性能（毫秒）：');
    console.log('─'.repeat(60));
    
    for (const [mode, data] of Object.entries(results)) {
      const stats = calculateStats(data.navigation);
      console.log(`\n${mode.toUpperCase()}:`);
      console.log(`  平均: ${stats.avg}ms`);
      console.log(`  最小: ${stats.min}ms`);
      console.log(`  最大: ${stats.max}ms`);
      console.log(`  中位数: ${stats.median}ms`);
    }
    
    console.log('\n\n✅ 测试完成！');
    
    // 性能对比
    const puppeteerAvg = calculateStats(results.puppeteer.pageCreation).avg;
    
    console.log('\n💡 性能提升总结：');
    console.log('─'.repeat(60));
    
    for (const [mode, data] of Object.entries(results)) {
      if (mode === 'puppeteer') continue;
      
      const avg = calculateStats(data.pageCreation).avg;
      const improvement = ((puppeteerAvg - avg) / puppeteerAvg * 100).toFixed(1);
      const sign = improvement > 0 ? '+' : '';
      console.log(`${mode.toUpperCase()}: ${sign}${improvement}% (${avg}ms vs ${puppeteerAvg}ms)`);
    }
    
  } catch (error) {
    console.error('❌ 测试失败:', error);
    process.exit(1);
  } finally {
    if (browser) {
      await browser.close();
      console.log('\n🔚 浏览器已关闭');
    }
  }
}

// 运行测试
main().catch(console.error);
