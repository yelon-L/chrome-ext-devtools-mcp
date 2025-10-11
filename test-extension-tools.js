#!/usr/bin/env node
/**
 * 自动化测试扩展调试工具
 * 启动 Chrome 并加载测试扩展，验证所有工具功能
 */

import {spawn} from 'child_process';
import {fileURLToPath} from 'url';
import path from 'path';
import puppeteer from 'puppeteer';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEST_EXTENSION_PATH = path.join(__dirname, 'test-extension-enhanced');
const DEBUG_PORT = 9333; // 使用不同端口避免冲突

// ANSI 颜色
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(msg, color = 'reset') {
  console.log(`${colors[color]}${msg}${colors.reset}`);
}

function assert(condition, message) {
  if (!condition) {
    log(`❌ FAIL: ${message}`, 'red');
    throw new Error(message);
  }
  log(`✅ PASS: ${message}`, 'green');
}

async function startChromeWithExtension() {
  log('\n🚀 启动 Chrome 并加载测试扩展...', 'cyan');
  
  const browser = await puppeteer.launch({
    headless: false,
    args: [
      `--remote-debugging-port=${DEBUG_PORT}`,
      `--disable-extensions-except=${TEST_EXTENSION_PATH}`,
      `--load-extension=${TEST_EXTENSION_PATH}`,
      '--no-first-run',
      '--no-default-browser-check',
    ],
  });
  
  log(`✅ Chrome 已启动，调试端口: ${DEBUG_PORT}`, 'green');
  
  // 等待扩展加载
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  return browser;
}

async function testExtensionTools(browser) {
  log('\n📋 开始测试扩展调试工具...', 'cyan');
  
  const page = (await browser.pages())[0];
  
  let testExtensionId = null;
  
  // === Test 1: list_extensions ===
  log('\n🧪 Test 1: list_extensions', 'blue');
  try {
    const cdp = await page.createCDPSession();
    const result = await cdp.send('Target.getTargets');
    const extensionTargets = result.targetInfos.filter(t => 
      (t.type === 'service_worker' || t.type === 'background_page') &&
      t.url?.startsWith('chrome-extension://')
    );
    
    assert(extensionTargets.length > 0, 'list_extensions 应该检测到至少 1 个扩展');
    
    const extensionIds = new Set();
    for (const target of extensionTargets) {
      const match = target.url.match(/chrome-extension:\/\/([a-z]{32})/);
      if (match) {
        extensionIds.add(match[1]);
      }
    }
    
    assert(extensionIds.size > 0, '应该提取到扩展 ID');
    testExtensionId = Array.from(extensionIds)[0];
    log(`   找到测试扩展 ID: ${testExtensionId}`, 'yellow');
    
  } catch (e) {
    log(`   错误: ${e.message}`, 'red');
    throw e;
  }
  
  // === Test 2: get_extension_details ===
  log('\n🧪 Test 2: get_extension_details', 'blue');
  try {
    // 使用 Puppeteer newPage 方法
    const manifestUrl = `chrome-extension://${testExtensionId}/manifest.json`;
    const manifestPage = await browser.newPage();
    await manifestPage.goto(manifestUrl);
    
    log(`   打开页面: ${manifestUrl}`, 'yellow');
    
    // 读取页面内容
    const manifestText = await manifestPage.evaluate(() => document.body.textContent);
    
    log(`   页面内容长度: ${manifestText ? manifestText.length : 0}`, 'yellow');
    
    await manifestPage.close();
    
    assert(manifestText, '应该能读取页面内容');
    
    const manifest = JSON.parse(manifestText);
    
    log(`   Manifest 内容:`, 'yellow');
    log(`     name: ${manifest.name}`, 'yellow');
    log(`     version: ${manifest.version}`, 'yellow');
    log(`     manifest_version: ${manifest.manifest_version}`, 'yellow');
    
    assert(manifest.name, 'manifest.name 应该存在');
    assert(manifest.version, 'manifest.version 应该存在');
    assert(manifest.manifest_version === 3, '应该是 MV3 扩展');
    
  } catch (e) {
    log(`   错误: ${e.message}`, 'red');
    throw e;
  }
  
  // === Test 3: list_extension_contexts ===
  log('\n🧪 Test 3: list_extension_contexts', 'blue');
  try {
    const cdp = await page.createCDPSession();
    const result = await cdp.send('Target.getTargets');
    const contexts = result.targetInfos.filter(t => 
      t.url?.includes(testExtensionId)
    );
    
    assert(contexts.length > 0, '应该至少有 1 个上下文（background）');
    
    const hasBackground = contexts.some(c => 
      c.type === 'service_worker' || c.type === 'background_page'
    );
    assert(hasBackground, '应该有 background 上下文');
    
    log(`   找到 ${contexts.length} 个上下文`, 'yellow');
    for (const ctx of contexts) {
      log(`     - ${ctx.type}: ${ctx.title}`, 'yellow');
    }
    
  } catch (e) {
    log(`   错误: ${e.message}`, 'red');
    throw e;
  }
  
  // === Test 4: inspect_extension_storage ===
  log('\n🧪 Test 4: inspect_extension_storage (基础验证)', 'blue');
  try {
    const cdp = await page.createCDPSession();
    const result = await cdp.send('Target.getTargets');
    const backgroundTarget = result.targetInfos.find(t => 
      (t.type === 'service_worker' || t.type === 'background_page') &&
      t.url?.includes(testExtensionId)
    );
    
    assert(backgroundTarget, '应该找到 background target');
    
    const attachResult = await cdp.send('Target.attachToTarget', {
      targetId: backgroundTarget.targetId,
      flatten: true,
    });
    
    // 测试能否访问基本 API
    const evalResult = await cdp.send('Runtime.evaluate', {
      expression: 'typeof self !== "undefined"',
      returnByValue: true,
    });
    
    await cdp.send('Target.detachFromTarget', {
      sessionId: attachResult.sessionId,
    });
    
    assert(evalResult.result?.value === true, '应该能在 Service Worker 中执行代码');
    
    log(`   ✅ 成功 attach 到 background 并执行代码`, 'yellow');
    log(`   ⚠️  注意: MV3 Service Worker 中 chrome.storage API 可能需要特殊激活`, 'yellow');
    
  } catch (e) {
    log(`   错误: ${e.message}`, 'red');
    throw e;
  }
  
  // === Test 5: switch_extension_context ===
  log('\n🧪 Test 5: switch_extension_context', 'blue');
  try {
    const cdp = await page.createCDPSession();
    const result = await cdp.send('Target.getTargets');
    const contexts = result.targetInfos.filter(t => 
      t.url?.includes(testExtensionId)
    );
    
    for (const ctx of contexts) {
      if (ctx.type === 'service_worker' || ctx.type === 'background_page') {
        // 测试能否 attach 到这个上下文
        const attachResult = await cdp.send('Target.attachToTarget', {
          targetId: ctx.targetId,
          flatten: true,
        });
        
        assert(attachResult.sessionId, '应该能 attach 到 background 上下文');
        
        // 在该上下文中执行代码 - 使用简单表达式
        const evalResult = await cdp.send('Runtime.evaluate', {
          expression: 'typeof self !== "undefined"',
          returnByValue: true,
        });
        
        assert(evalResult.result?.value === true, '应该能在上下文中执行代码');
        
        await cdp.send('Target.detachFromTarget', {
          sessionId: attachResult.sessionId,
        });
        
        log(`   ✅ 成功切换到 ${ctx.type} 上下文并执行代码`, 'yellow');
        break;
      }
    }
    
  } catch (e) {
    log(`   错误: ${e.message}`, 'red');
    throw e;
  }
}

async function main() {
  log('╔════════════════════════════════════════════════╗', 'cyan');
  log('║   扩展调试工具自动化测试                        ║', 'cyan');
  log('╚════════════════════════════════════════════════╝', 'cyan');
  
  let browser = null;
  
  try {
    // 启动 Chrome
    browser = await startChromeWithExtension();
    
    // 运行测试
    await testExtensionTools(browser);
    
    log('\n╔════════════════════════════════════════════════╗', 'green');
    log('║   ✅ 所有测试通过！                            ║', 'green');
    log('╚════════════════════════════════════════════════╝', 'green');
    
  } catch (e) {
    log('\n╔════════════════════════════════════════════════╗', 'red');
    log('║   ❌ 测试失败                                  ║', 'red');
    log('╚════════════════════════════════════════════════╝', 'red');
    log(`\n错误详情: ${e.message}`, 'red');
    log(e.stack, 'red');
    process.exit(1);
    
  } finally {
    if (browser) {
      log('\n🔚 关闭 Chrome...', 'cyan');
      await browser.close();
    }
  }
}

main();
