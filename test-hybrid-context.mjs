#!/usr/bin/env node
/**
 * McpContext CDP 混合架构测试
 * 
 * 测试混合架构的实际功能：
 * 1. CDP Target 管理
 * 2. CDP 高频操作（navigate, evaluate）
 * 3. 与 Puppeteer 的对比
 */

import puppeteer from 'puppeteer-core';
import debugLib from 'debug';

const debug = debugLib('test:hybrid');

const CHROME_PATH = process.env.CHROME_PATH || '/usr/bin/google-chrome';

console.log('\n╔════════════════════════════════════════════════════════╗');
console.log('║    McpContext CDP 混合架构功能测试                      ║');
console.log('╚════════════════════════════════════════════════════════╝\n');

/**
 * 动态导入 McpContext
 */
async function loadMcpContext() {
  try {
    const module = await import('./build/src/McpContext.js');
    return module.McpContext;
  } catch (error) {
    console.error('❌ 无法加载 McpContext，请先编译：npm run build');
    console.error('错误详情:', error.message);
    process.exit(1);
  }
}

/**
 * 测试 1: CDP Target 管理
 */
async function testCdpTargetManagement(browser, McpContext) {
  console.log('📊 测试 1: CDP Target 管理');
  console.log('─'.repeat(60));
  
  try {
    // 创建启用 CDP Target 管理的上下文
    const start = Date.now();
    const context = await McpContext.fromMinimal(browser, debug, {
      useCdpForTargets: true,
    });
    const createTime = Date.now() - start;
    
    console.log(`✓ 上下文创建时间: ${createTime}ms`);
    
    // 检查 CDP Target 管理是否启用
    const isEnabled = context.isCdpTargetManagementEnabled();
    console.log(`✓ CDP Target 管理状态: ${isEnabled ? '已启用' : '未启用'}`);
    
    if (!isEnabled) {
      console.warn('⚠️  CDP Target 管理未启用，可能初始化失败');
    }
    
    // 触发延迟初始化（创建页面）
    const initStart = Date.now();
    await context.ensureInitialized();
    const initTime = Date.now() - initStart;
    
    console.log(`✓ 延迟初始化完成: ${initTime}ms`);
    
    // 创建新页面
    const newPageStart = Date.now();
    const newPage = await context.newPage();
    const newPageTime = Date.now() - newPageStart;
    
    console.log(`✓ 新页面创建时间: ${newPageTime}ms`);
    
    // 清理
    await context.dispose();
    console.log('✓ 资源已清理\n');
    
    return { createTime, initTime, newPageTime, enabled: isEnabled };
  } catch (error) {
    console.error('❌ 测试失败:', error.message);
    return null;
  }
}

/**
 * 测试 2: CDP 高频操作
 */
async function testCdpOperations(browser, McpContext) {
  console.log('📊 测试 2: CDP 高频操作');
  console.log('─'.repeat(60));
  
  try {
    // 创建启用 CDP 操作的上下文
    const context = await McpContext.fromMinimal(browser, debug, {
      useCdpForTargets: true,
      useCdpForOperations: true,
    });
    
    console.log(`✓ CDP Target 管理: ${context.isCdpTargetManagementEnabled() ? '已启用' : '未启用'}`);
    console.log(`✓ CDP 操作: ${context.isCdpOperationsEnabled() ? '已启用' : '未启用'}`);
    
    // 初始化上下文
    await context.ensureInitialized();
    
    // 获取 CDP 操作实例
    const cdpOps = context.getCdpOperations();
    
    if (!cdpOps) {
      console.warn('⚠️  CDP 操作未启用');
      await context.dispose();
      return null;
    }
    
    // 测试导航
    console.log('\n🌐 测试 CDP 导航:');
    const navStart = Date.now();
    const navResult = await cdpOps.navigate('https://example.com', {
      waitUntil: 'load',
      timeout: 10000,
    });
    const navTime = Date.now() - navStart;
    
    if (navResult.success) {
      console.log(`  ✓ 导航成功: ${navTime}ms`);
    } else {
      console.error(`  ❌ 导航失败: ${navResult.errorText}`);
    }
    
    // 测试脚本执行
    console.log('\n📜 测试 CDP evaluate:');
    const evalStart = Date.now();
    const evalResult = await cdpOps.evaluate('document.title', {
      awaitPromise: true,
      returnByValue: true,
    });
    const evalTime = Date.now() - evalStart;
    
    if (evalResult.success) {
      console.log(`  ✓ 执行成功: ${evalTime}ms`);
      console.log(`  结果: "${evalResult.result}"`);
    } else {
      console.error(`  ❌ 执行失败`);
    }
    
    // 清理
    await context.dispose();
    console.log('\n✓ 资源已清理\n');
    
    return {
      navTime: navResult.success ? navTime : null,
      evalTime: evalResult.success ? evalTime : null,
      enabled: true,
    };
  } catch (error) {
    console.error('❌ 测试失败:', error.message);
    return null;
  }
}

/**
 * 测试 3: 纯 Puppeteer 对比（基线）
 */
async function testPuppeteerBaseline(browser, McpContext) {
  console.log('📊 测试 3: 纯 Puppeteer 基线');
  console.log('─'.repeat(60));
  
  try {
    // 创建不启用 CDP 的上下文
    const start = Date.now();
    const context = await McpContext.fromMinimal(browser, debug, {
      useCdpForTargets: false,
      useCdpForOperations: false,
    });
    const createTime = Date.now() - start;
    
    console.log(`✓ 上下文创建时间: ${createTime}ms`);
    
    // 初始化
    const initStart = Date.now();
    await context.ensureInitialized();
    const initTime = Date.now() - initStart;
    
    console.log(`✓ 延迟初始化完成: ${initTime}ms`);
    
    // 创建新页面
    const newPageStart = Date.now();
    const newPage = await context.newPage();
    const newPageTime = Date.now() - newPageStart;
    
    console.log(`✓ 新页面创建时间: ${newPageTime}ms`);
    
    // 测试导航（使用 Puppeteer）
    const navStart = Date.now();
    await newPage.goto('https://example.com', { waitUntil: 'load', timeout: 10000 });
    const navTime = Date.now() - navStart;
    console.log(`✓ Puppeteer 导航时间: ${navTime}ms`);
    
    // 测试脚本执行（使用 Puppeteer）
    const evalStart = Date.now();
    const title = await newPage.evaluate(() => document.title);
    const evalTime = Date.now() - evalStart;
    console.log(`✓ Puppeteer evaluate 时间: ${evalTime}ms`);
    console.log(`  结果: "${title}"`);
    
    // 清理
    await context.dispose();
    console.log('\n✓ 资源已清理\n');
    
    return { createTime, initTime, newPageTime, navTime, evalTime };
  } catch (error) {
    console.error('❌ 测试失败:', error.message);
    return null;
  }
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
    
    // 启动浏览器
    console.log('🚀 启动 Chrome 浏览器...');
    browser = await puppeteer.launch({
      executablePath: CHROME_PATH,
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--remote-debugging-port=9222',
      ],
    });
    
    const version = await browser.version();
    console.log(`✓ 浏览器已启动: ${version}\n`);
    
    // 运行测试
    const results = {
      cdpTarget: await testCdpTargetManagement(browser, McpContext),
      cdpOperations: await testCdpOperations(browser, McpContext),
      puppeteer: await testPuppeteerBaseline(browser, McpContext),
    };
    
    // 汇总结果
    console.log('\n╔════════════════════════════════════════════════════════╗');
    console.log('║                    测试结果汇总                         ║');
    console.log('╚════════════════════════════════════════════════════════╝\n');
    
    console.log('📈 性能对比：');
    console.log('─'.repeat(60));
    
    if (results.puppeteer && results.cdpTarget) {
      const baseline = results.puppeteer.newPageTime;
      const hybrid = results.cdpTarget.newPageTime;
      const improvement = ((baseline - hybrid) / baseline * 100).toFixed(1);
      console.log(`\n页面创建性能:`);
      console.log(`  Puppeteer 基线: ${baseline}ms`);
      console.log(`  CDP Target: ${hybrid}ms (${improvement > 0 ? '+' : ''}${improvement}%)`);
    }
    
    if (results.puppeteer && results.cdpOperations) {
      const baselineNav = results.puppeteer.navTime;
      const hybridNav = results.cdpOperations.navTime;
      
      if (baselineNav && hybridNav) {
        const navImprovement = ((baselineNav - hybridNav) / baselineNav * 100).toFixed(1);
        console.log(`\n页面导航性能:`);
        console.log(`  Puppeteer 基线: ${baselineNav}ms`);
        console.log(`  CDP Operations: ${hybridNav}ms (${navImprovement > 0 ? '+' : ''}${navImprovement}%)`);
      }
      
      const baselineEval = results.puppeteer.evalTime;
      const hybridEval = results.cdpOperations.evalTime;
      
      if (baselineEval && hybridEval) {
        const evalImprovement = ((baselineEval - hybridEval) / baselineEval * 100).toFixed(1);
        console.log(`\n脚本执行性能:`);
        console.log(`  Puppeteer 基线: ${baselineEval}ms`);
        console.log(`  CDP Operations: ${hybridEval}ms (${evalImprovement > 0 ? '+' : ''}${evalImprovement}%)`);
      }
    }
    
    console.log('\n\n✅ 所有测试完成！');
    
  } catch (error) {
    console.error('\n❌ 测试失败:', error);
    console.error(error.stack);
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
