#!/usr/bin/env node
/**
 * AB 对照测试：CDP 混合架构 vs 纯 Puppeteer
 * 
 * 单用户场景，连接到指定端口的 Chrome
 */

import puppeteer from 'puppeteer-core';
import debugLib from 'debug';

const debug = debugLib('test:ab');

const BROWSER_URL = process.env.BROWSER_URL || 'http://localhost:9225';
const TEST_ITERATIONS = 5; // 每种模式测试次数

console.log('\n╔════════════════════════════════════════════════════════╗');
console.log('║          CDP 混合架构 AB 对照测试                       ║');
console.log('╚════════════════════════════════════════════════════════╝\n');

/**
 * 动态导入 McpContext
 */
async function loadMcpContext() {
  try {
    const module = await import('./build/src/McpContext.js');
    return module.McpContext;
  } catch (error) {
    console.error('❌ 无法加载 McpContext');
    console.error('错误详情:', error.message);
    process.exit(1);
  }
}

/**
 * 计算统计数据
 */
function calculateStats(times) {
  if (times.length === 0) {
    return { avg: 0, min: 0, max: 0, median: 0, stddev: 0 };
  }
  
  const sorted = [...times].sort((a, b) => a - b);
  const sum = times.reduce((a, b) => a + b, 0);
  const avg = sum / times.length;
  
  // 计算标准差
  const variance = times.reduce((acc, val) => acc + Math.pow(val - avg, 2), 0) / times.length;
  const stddev = Math.sqrt(variance);
  
  return {
    avg: Math.round(avg),
    min: sorted[0],
    max: sorted[sorted.length - 1],
    median: sorted[Math.floor(sorted.length / 2)],
    stddev: Math.round(stddev),
  };
}

/**
 * 测试组A：纯 Puppeteer（基线）
 */
async function testGroupA(browser, McpContext) {
  console.log('🔵 测试组 A: 纯 Puppeteer 基线');
  console.log('─'.repeat(60));
  
  const results = {
    contextCreate: [],
    initialization: [],
    newPage: [],
    navigate: [],
    evaluate: [],
  };
  
  for (let i = 0; i < TEST_ITERATIONS; i++) {
    console.log(`\n  第 ${i + 1}/${TEST_ITERATIONS} 次测试:`);
    
    try {
      // 1. 创建上下文
      const t1 = Date.now();
      const context = await McpContext.fromMinimal(browser, debug, {
        useCdpForTargets: false,
        useCdpForOperations: false,
      });
      const contextTime = Date.now() - t1;
      results.contextCreate.push(contextTime);
      console.log(`    上下文创建: ${contextTime}ms`);
      
      // 2. 初始化（触发页面创建）
      const t2 = Date.now();
      await context.ensureInitialized();
      const initTime = Date.now() - t2;
      results.initialization.push(initTime);
      console.log(`    延迟初始化: ${initTime}ms`);
      
      // 3. 创建新页面
      const t3 = Date.now();
      const newPage = await context.newPage();
      const newPageTime = Date.now() - t3;
      results.newPage.push(newPageTime);
      console.log(`    创建新页面: ${newPageTime}ms`);
      
      // 4. 导航
      const t4 = Date.now();
      await newPage.goto('https://example.com', { 
        waitUntil: 'domcontentloaded',
        timeout: 15000 
      });
      const navTime = Date.now() - t4;
      results.navigate.push(navTime);
      console.log(`    页面导航: ${navTime}ms`);
      
      // 5. 脚本执行
      const t5 = Date.now();
      const title = await newPage.evaluate(() => document.title);
      const evalTime = Date.now() - t5;
      results.evaluate.push(evalTime);
      console.log(`    脚本执行: ${evalTime}ms (结果: "${title}")`);
      
      // 清理
      await context.dispose();
      
    } catch (error) {
      console.error(`    ❌ 测试失败: ${error.message}`);
    }
  }
  
  return results;
}

/**
 * 测试组B：CDP 混合架构
 */
async function testGroupB(browser, McpContext) {
  console.log('\n\n🟢 测试组 B: CDP 混合架构');
  console.log('─'.repeat(60));
  
  const results = {
    contextCreate: [],
    initialization: [],
    newPage: [],
    navigate: [],
    evaluate: [],
  };
  
  for (let i = 0; i < TEST_ITERATIONS; i++) {
    console.log(`\n  第 ${i + 1}/${TEST_ITERATIONS} 次测试:`);
    
    try {
      // 1. 创建上下文（启用 CDP）
      const t1 = Date.now();
      const context = await McpContext.fromMinimal(browser, debug, {
        useCdpForTargets: true,
        useCdpForOperations: true,
      });
      const contextTime = Date.now() - t1;
      results.contextCreate.push(contextTime);
      console.log(`    上下文创建: ${contextTime}ms`);
      
      // 2. 初始化（触发页面创建）
      const t2 = Date.now();
      await context.ensureInitialized();
      const initTime = Date.now() - t2;
      results.initialization.push(initTime);
      console.log(`    延迟初始化: ${initTime}ms`);
      
      // 检查 CDP 是否启用
      const cdpEnabled = context.isCdpOperationsEnabled();
      console.log(`    CDP 状态: ${cdpEnabled ? '✓ 已启用' : '✗ 未启用'}`);
      
      // 3. 创建新页面
      const t3 = Date.now();
      const newPage = await context.newPage();
      const newPageTime = Date.now() - t3;
      results.newPage.push(newPageTime);
      console.log(`    创建新页面: ${newPageTime}ms`);
      
      // 4. 导航（尝试使用 CDP）
      const t4 = Date.now();
      const cdpOps = context.getCdpOperations();
      let navTime;
      
      if (cdpOps) {
        const navResult = await cdpOps.navigate('https://example.com', {
          waitUntil: 'domcontentloaded',
          timeout: 15000,
        });
        navTime = Date.now() - t4;
        
        if (navResult.success) {
          console.log(`    页面导航: ${navTime}ms (CDP)`);
        } else {
          console.log(`    页面导航: 失败 (CDP) - ${navResult.errorText}`);
        }
      } else {
        // 回退到 Puppeteer
        await newPage.goto('https://example.com', { 
          waitUntil: 'domcontentloaded',
          timeout: 15000 
        });
        navTime = Date.now() - t4;
        console.log(`    页面导航: ${navTime}ms (Puppeteer fallback)`);
      }
      results.navigate.push(navTime);
      
      // 5. 脚本执行（尝试使用 CDP）
      const t5 = Date.now();
      let evalTime;
      let title;
      
      if (cdpOps) {
        const evalResult = await cdpOps.evaluate('document.title', {
          awaitPromise: true,
          returnByValue: true,
        });
        evalTime = Date.now() - t5;
        
        if (evalResult.success) {
          title = evalResult.result;
          console.log(`    脚本执行: ${evalTime}ms (CDP, 结果: "${title}")`);
        } else {
          console.log(`    脚本执行: 失败 (CDP)`);
        }
      } else {
        // 回退到 Puppeteer
        title = await newPage.evaluate(() => document.title);
        evalTime = Date.now() - t5;
        console.log(`    脚本执行: ${evalTime}ms (Puppeteer fallback, 结果: "${title}")`);
      }
      results.evaluate.push(evalTime);
      
      // 清理
      await context.dispose();
      
    } catch (error) {
      console.error(`    ❌ 测试失败: ${error.message}`);
    }
  }
  
  return results;
}

/**
 * 打印对比结果
 */
function printComparison(groupA, groupB) {
  console.log('\n\n╔════════════════════════════════════════════════════════╗');
  console.log('║                   AB 对照测试结果                       ║');
  console.log('╚════════════════════════════════════════════════════════╝\n');
  
  const metrics = [
    { key: 'contextCreate', name: '上下文创建' },
    { key: 'initialization', name: '延迟初始化' },
    { key: 'newPage', name: '创建新页面' },
    { key: 'navigate', name: '页面导航' },
    { key: 'evaluate', name: '脚本执行' },
  ];
  
  console.log('┌─────────────────┬──────────┬──────────┬──────────┬──────────┐');
  console.log('│ 指标            │ 组A基线  │ 组B混合  │ 改善     │ 显著性   │');
  console.log('├─────────────────┼──────────┼──────────┼──────────┼──────────┤');
  
  const improvements = [];
  
  for (const metric of metrics) {
    const statsA = calculateStats(groupA[metric.key]);
    const statsB = calculateStats(groupB[metric.key]);
    
    if (statsA.avg === 0 || statsB.avg === 0) continue;
    
    const improvement = ((statsA.avg - statsB.avg) / statsA.avg * 100).toFixed(1);
    const improvementNum = parseFloat(improvement);
    improvements.push({ name: metric.name, value: improvementNum });
    
    const sign = improvementNum > 0 ? '+' : '';
    const significance = Math.abs(improvementNum) > 10 ? '***' : 
                        Math.abs(improvementNum) > 5 ? '**' :
                        Math.abs(improvementNum) > 2 ? '*' : '';
    
    console.log(`│ ${metric.name.padEnd(15)} │ ${String(statsA.avg).padStart(6)}ms │ ${String(statsB.avg).padStart(6)}ms │ ${(sign + improvement + '%').padStart(8)} │ ${significance.padEnd(8)} │`);
  }
  
  console.log('└─────────────────┴──────────┴──────────┴──────────┴──────────┘');
  
  console.log('\n📊 详细统计:');
  console.log('─'.repeat(60));
  
  for (const metric of metrics) {
    const statsA = calculateStats(groupA[metric.key]);
    const statsB = calculateStats(groupB[metric.key]);
    
    if (statsA.avg === 0 || statsB.avg === 0) continue;
    
    console.log(`\n${metric.name}:`);
    console.log(`  组A (Puppeteer): 平均=${statsA.avg}ms, 最小=${statsA.min}ms, 最大=${statsA.max}ms, 标准差=${statsA.stddev}ms`);
    console.log(`  组B (CDP混合):   平均=${statsB.avg}ms, 最小=${statsB.min}ms, 最大=${statsB.max}ms, 标准差=${statsB.stddev}ms`);
  }
  
  // 总体评估
  console.log('\n\n💡 总体评估:');
  console.log('─'.repeat(60));
  
  const avgImprovement = improvements.reduce((sum, item) => sum + item.value, 0) / improvements.length;
  const positiveImprovements = improvements.filter(item => item.value > 0).length;
  
  console.log(`平均性能提升: ${avgImprovement.toFixed(1)}%`);
  console.log(`正向改善指标: ${positiveImprovements}/${improvements.length}`);
  
  if (avgImprovement > 10) {
    console.log('✅ CDP 混合架构显著提升性能！');
  } else if (avgImprovement > 5) {
    console.log('✅ CDP 混合架构有明显提升');
  } else if (avgImprovement > 0) {
    console.log('👍 CDP 混合架构略有提升');
  } else {
    console.log('⚠️  CDP 混合架构未显示明显优势');
  }
  
  console.log('\n注: *** 表示非常显著 (>10%), ** 表示显著 (>5%), * 表示有改善 (>2%)');
}

/**
 * 主测试流程
 */
async function main() {
  let browser;
  
  try {
    // 加载 McpContext
    console.log('📦 加载 McpContext...');
    const McpContext = await loadMcpContext();
    console.log('✓ McpContext 已加载\n');
    
    // 连接到 Chrome
    console.log(`🔗 连接到 Chrome: ${BROWSER_URL}`);
    browser = await puppeteer.connect({ browserURL: BROWSER_URL });
    
    const version = await browser.version();
    console.log(`✓ 浏览器已连接: ${version}\n`);
    console.log(`📊 测试配置: 每组 ${TEST_ITERATIONS} 次迭代\n`);
    
    // 运行测试组A（基线）
    const groupA = await testGroupA(browser, McpContext);
    
    // 等待一下，让浏览器稳定
    console.log('\n⏸️  等待 2 秒...');
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // 运行测试组B（CDP混合）
    const groupB = await testGroupB(browser, McpContext);
    
    // 打印对比结果
    printComparison(groupA, groupB);
    
    console.log('\n✅ 测试完成！\n');
    
  } catch (error) {
    console.error('\n❌ 测试失败:', error);
    console.error(error.stack);
    process.exit(1);
  } finally {
    if (browser) {
      await browser.disconnect();
      console.log('🔌 浏览器连接已断开');
    }
  }
}

// 运行测试
main().catch(console.error);
