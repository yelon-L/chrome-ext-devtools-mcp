#!/usr/bin/env node
/**
 * 综合测试扩展调试功能
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

async function test() {
  log('\n╔════════════════════════════════════════════════╗', 'cyan');
  log('║   扩展调试完整测试                              ║', 'cyan');
  log('╚════════════════════════════════════════════════╝\n', 'cyan');

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

  // === 测试 1: 获取扩展 ID ===
  log('\n🧪 测试 1: 获取扩展信息', 'blue');
  const result = await cdp.send('Target.getTargets');
  const swTarget = result.targetInfos.find(
    t => t.type === 'service_worker' && t.url.startsWith('chrome-extension://'),
  );

  if (!swTarget) {
    log('❌ 未找到扩展', 'red');
    await browser.close();
    return;
  }

  const extensionId = swTarget.url.match(/chrome-extension:\/\/([a-z]{32})/)[1];
  const targetId = swTarget.targetId;
  log(`✅ 扩展 ID: ${extensionId}`, 'green');
  log(`   Target ID: ${targetId}`, 'yellow');

  // === 测试 2: 执行简单代码 ===
  log('\n🧪 测试 2: 执行简单表达式', 'blue');
  try {
    const attachResult = await cdp.send('Target.attachToTarget', {
      targetId,
      flatten: true,
    });

    const evalResult = await cdp.send('Runtime.evaluate', {
      expression: '1 + 1',
      returnByValue: true,
    });

    await cdp.send('Target.detachFromTarget', {
      sessionId: attachResult.sessionId,
    });

    log(`   结果: ${evalResult.result.value}`, 'yellow');
    log('   ✅ 成功', 'green');
  } catch (e) {
    log(`   ❌ 失败: ${e.message}`, 'red');
  }

  // === 测试 3: 检查 chrome.storage 可用性 ===
  log('\n🧪 测试 3: 检查 chrome.storage 可用性', 'blue');
  try {
    const attachResult = await cdp.send('Target.attachToTarget', {
      targetId,
      flatten: true,
    });

    const evalResult = await cdp.send('Runtime.evaluate', {
      expression: 'typeof chrome !== "undefined" && typeof chrome.storage !== "undefined"',
      returnByValue: true,
    });

    await cdp.send('Target.detachFromTarget', {
      sessionId: attachResult.sessionId,
    });

    const available = evalResult.result.value;
    if (available) {
      log('   ✅ chrome.storage 可用', 'green');
    } else {
      log('   ⚠️  chrome.storage 不可用（Service Worker 未激活）', 'yellow');
      log('   💡 提示: 手动触发扩展事件（如打开 popup）', 'yellow');
    }
  } catch (e) {
    log(`   ❌ 失败: ${e.message}`, 'red');
  }

  // === 测试 4: 尝试读取 Storage (带错误处理) ===
  log('\n🧪 测试 4: 读取 Storage (带容错)', 'blue');
  try {
    const attachResult = await cdp.send('Target.attachToTarget', {
      targetId,
      flatten: true,
    });

    const evalResult = await cdp.send('Runtime.evaluate', {
      expression: `
        (async () => {
          try {
            if (typeof chrome === 'undefined' || !chrome.storage) {
              return {error: 'chrome.storage not available'};
            }
            const data = await chrome.storage.local.get(null);
            return {data, keys: Object.keys(data)};
          } catch (e) {
            return {error: e.message};
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
    if (result.error) {
      log(`   ⚠️  ${result.error}`, 'yellow');
    } else {
      log(`   ✅ 读取成功，包含 ${result.keys.length} 个键`, 'green');
      if (result.keys.length > 0) {
        log(`   键: ${result.keys.join(', ')}`, 'yellow');
      }
    }
  } catch (e) {
    log(`   ❌ 失败: ${e.message}`, 'red');
  }

  // === 测试 5: 测试异步代码执行 ===
  log('\n🧪 测试 5: 异步代码执行', 'blue');
  try {
    const attachResult = await cdp.send('Target.attachToTarget', {
      targetId,
      flatten: true,
    });

    const evalResult = await cdp.send('Runtime.evaluate', {
      expression: '(async () => { return await Promise.resolve("async works!"); })()',
      returnByValue: true,
      awaitPromise: true,
    });

    await cdp.send('Target.detachFromTarget', {
      sessionId: attachResult.sessionId,
    });

    log(`   结果: "${evalResult.result.value}"`, 'yellow');
    log('   ✅ 异步代码执行成功', 'green');
  } catch (e) {
    log(`   ❌ 失败: ${e.message}`, 'red');
  }

  // === 测试 6: 测试各种表达式包装 ===
  log('\n🧪 测试 6: 表达式包装测试', 'blue');
  
  const testCases = [
    {name: '简单值', code: '"hello"', expected: 'hello'},
    {name: '对象', code: '({a: 1, b: 2})', expected: {a: 1, b: 2}},
    {name: '带 return', code: 'return "with return"', expected: 'with return'},
  ];

  for (const testCase of testCases) {
    try {
      const attachResult = await cdp.send('Target.attachToTarget', {
        targetId,
        flatten: true,
      });

      const wrappedCode = testCase.code.trim().startsWith('return ')
        ? `(async () => { ${testCase.code} })()`
        : `(async () => { return ${testCase.code} })()`;

      const evalResult = await cdp.send('Runtime.evaluate', {
        expression: wrappedCode,
        returnByValue: true,
        awaitPromise: true,
      });

      await cdp.send('Target.detachFromTarget', {
        sessionId: attachResult.sessionId,
      });

      const match = JSON.stringify(evalResult.result.value) === JSON.stringify(testCase.expected);
      if (match) {
        log(`   ✅ ${testCase.name}: 通过`, 'green');
      } else {
        log(`   ❌ ${testCase.name}: 不匹配`, 'red');
        log(`      期望: ${JSON.stringify(testCase.expected)}`, 'yellow');
        log(`      实际: ${JSON.stringify(evalResult.result.value)}`, 'yellow');
      }
    } catch (e) {
      log(`   ❌ ${testCase.name}: 失败 - ${e.message}`, 'red');
    }
  }

  log('\n╔════════════════════════════════════════════════╗', 'cyan');
  log('║   ✅ 测试完成                                  ║', 'cyan');
  log('╚════════════════════════════════════════════════╝\n', 'cyan');

  await browser.close();
}

test().catch(console.error);
