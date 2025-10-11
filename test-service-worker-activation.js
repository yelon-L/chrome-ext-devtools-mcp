#!/usr/bin/env node
/**
 * Service Worker 激活状态诊断工具
 */

import puppeteer from 'puppeteer';
import path from 'path';
import {fileURLToPath} from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEST_EXTENSION_PATH = path.join(__dirname, 'test-extension-enhanced');

function log(message, color = 'white') {
  const colors = {
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m',
    white: '\x1b[37m',
  };
  console.log(`${colors[color]}${message}\x1b[0m`);
}

async function diagnose() {
  log('\n╔═══════════════════════════════════════════════════════╗', 'cyan');
  log('║   Service Worker 激活状态诊断工具                     ║', 'cyan');
  log('╚═══════════════════════════════════════════════════════╝\n', 'cyan');

  log('🚀 启动 Chrome...', 'blue');
  const browser = await puppeteer.launch({
    headless: false,
    args: [
      '--remote-debugging-port=9444',
      `--disable-extensions-except=${TEST_EXTENSION_PATH}`,
      `--load-extension=${TEST_EXTENSION_PATH}`,
    ],
  });

  await new Promise(resolve => setTimeout(resolve, 2000));

  const page = (await browser.pages())[0];
  const cdp = await page.createCDPSession();

  // 获取扩展信息
  const result = await cdp.send('Target.getTargets');
  const swTarget = result.targetInfos.find(
    t => t.type === 'service_worker' && t.url.startsWith('chrome-extension://'),
  );

  if (!swTarget) {
    log('❌ 未找到扩展 Service Worker', 'red');
    await browser.close();
    return;
  }

  const extensionId = swTarget.url.match(/chrome-extension:\/\/([a-z]{32})/)[1];
  log(`✅ 扩展 ID: ${extensionId}`, 'green');

  // 诊断 1: 检查 Service Worker 状态
  log('\n📊 诊断 1: Service Worker 基本状态', 'blue');
  log(`   URL: ${swTarget.url}`, 'yellow');
  log(`   Type: ${swTarget.type}`, 'yellow');
  log(`   Target ID: ${swTarget.targetId}`, 'yellow');

  // 诊断 2: 测试基本代码执行
  log('\n📊 诊断 2: 测试基本 JavaScript 执行', 'blue');
  try {
    const attachResult = await cdp.send('Target.attachToTarget', {
      targetId: swTarget.targetId,
      flatten: true,
    });

    const evalResult = await cdp.send('Runtime.evaluate', {
      expression: '1 + 1',
      returnByValue: true,
    });

    await cdp.send('Target.detachFromTarget', {
      sessionId: attachResult.sessionId,
    });

    if (evalResult.result.value === 2) {
      log('   ✅ 基本代码执行: 成功', 'green');
    } else {
      log('   ❌ 基本代码执行: 失败', 'red');
    }
  } catch (e) {
    log(`   ❌ 基本代码执行: 异常 - ${e.message}`, 'red');
  }

  // 诊断 3: 检查 chrome 对象
  log('\n📊 诊断 3: 检查 chrome 全局对象', 'blue');
  try {
    const attachResult = await cdp.send('Target.attachToTarget', {
      targetId: swTarget.targetId,
      flatten: true,
    });

    const evalResult = await cdp.send('Runtime.evaluate', {
      expression: 'typeof chrome',
      returnByValue: true,
    });

    await cdp.send('Target.detachFromTarget', {
      sessionId: attachResult.sessionId,
    });

    if (evalResult.result.value === 'object') {
      log('   ✅ chrome 对象: 可用', 'green');
    } else {
      log(`   ❌ chrome 对象: ${evalResult.result.value}`, 'red');
    }
  } catch (e) {
    log(`   ❌ chrome 对象: 异常 - ${e.message}`, 'red');
  }

  // 诊断 4: 检查 chrome.storage
  log('\n📊 诊断 4: 检查 chrome.storage API', 'blue');
  try {
    const attachResult = await cdp.send('Target.attachToTarget', {
      targetId: swTarget.targetId,
      flatten: true,
    });

    const evalResult = await cdp.send('Runtime.evaluate', {
      expression: `
        (() => {
          if (typeof chrome === 'undefined') {
            return {status: 'chrome_undefined'};
          }
          if (typeof chrome.storage === 'undefined') {
            return {status: 'storage_undefined', chrome_keys: Object.keys(chrome).slice(0, 10)};
          }
          return {status: 'available', storage_types: Object.keys(chrome.storage)};
        })()
      `,
      returnByValue: true,
    });

    await cdp.send('Target.detachFromTarget', {
      sessionId: attachResult.sessionId,
    });

    const result = evalResult.result.value;
    
    if (result.status === 'available') {
      log('   ✅ chrome.storage: 可用', 'green');
      log(`      Storage 类型: ${result.storage_types.join(', ')}`, 'yellow');
    } else if (result.status === 'storage_undefined') {
      log('   ⚠️  chrome.storage: 未定义（Service Worker 未激活）', 'yellow');
      log(`      chrome 对象可用，但 storage API 未激活`, 'yellow');
      if (result.chrome_keys) {
        log(`      可用的 chrome 属性: ${result.chrome_keys.join(', ')}...`, 'yellow');
      }
    } else {
      log('   ❌ chrome.storage: chrome 对象未定义', 'red');
    }
  } catch (e) {
    log(`   ❌ chrome.storage: 异常 - ${e.message}`, 'red');
  }

  // 诊断 5: 尝试读取 Storage
  log('\n📊 诊断 5: 尝试读取 Storage', 'blue');
  try {
    const attachResult = await cdp.send('Target.attachToTarget', {
      targetId: swTarget.targetId,
      flatten: true,
    });

    const evalResult = await cdp.send('Runtime.evaluate', {
      expression: `
        (async () => {
          try {
            if (typeof chrome === 'undefined' || !chrome.storage) {
              return {success: false, error: 'API not available'};
            }
            const data = await chrome.storage.local.get(null);
            return {success: true, keys: Object.keys(data), data};
          } catch (e) {
            return {success: false, error: e.message};
          }
        })()
      `,
      returnByValue: true,
      awaitPromise: true,
    });

    await cdp.send('Target.detachFromTarget', {
      sessionId: attachResult.sessionId,
    });

    const result = evalResult.result.value;
    
    if (result.success) {
      log('   ✅ Storage 读取: 成功', 'green');
      log(`      包含 ${result.keys.length} 个键`, 'yellow');
      if (result.keys.length > 0) {
        log(`      键: ${result.keys.join(', ')}`, 'yellow');
      }
    } else {
      log(`   ❌ Storage 读取: 失败 - ${result.error}`, 'red');
    }
  } catch (e) {
    log(`   ❌ Storage 读取: 异常 - ${e.message}`, 'red');
  }

  // 总结和建议
  log('\n╔═══════════════════════════════════════════════════════╗', 'cyan');
  log('║   诊断总结                                            ║', 'cyan');
  log('╚═══════════════════════════════════════════════════════╝\n', 'cyan');

  log('💡 如果 chrome.storage 不可用，请执行以下操作激活 Service Worker：\n', 'yellow');
  log('方法 1（推荐）：', 'cyan');
  log('  1. 打开 chrome://extensions/', 'white');
  log('  2. 找到 "Enhanced MCP Debug Test Extension"', 'white');
  log('  3. 点击 "Service worker" 蓝色链接', 'white');
  log('  4. 会自动打开 DevTools，Service Worker 激活\n', 'white');

  log('方法 2：', 'cyan');
  log(`  访问: chrome-extension://${extensionId}/popup.html\n`, 'white');

  log('方法 3：', 'cyan');
  log('  点击扩展图标（如果在工具栏可见）\n', 'white');

  log('激活后请重新运行 MCP 测试！', 'green');

  log('\n按 Ctrl+C 退出或等待浏览器关闭...', 'yellow');
  
  // 保持浏览器打开，方便手动激活
  await new Promise(resolve => {
    process.on('SIGINT', async () => {
      await browser.close();
      resolve();
    });
  });
}

diagnose().catch(console.error);
