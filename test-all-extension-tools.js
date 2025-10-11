#!/usr/bin/env node
/**
 * 完整的扩展调试工具测试脚本
 * 测试所有 10 个工具，包括新的自动激活功能
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

class ExtensionToolTester {
  constructor() {
    this.browser = null;
    this.page = null;
    this.cdp = null;
    this.extensionId = null;
    this.targetId = null;
    this.testResults = [];
  }

  async setup() {
    log('\n╔══════════════════════════════════════════════════════╗', 'cyan');
    log('║   扩展调试工具完整测试套件                            ║', 'cyan');
    log('╚══════════════════════════════════════════════════════╝\n', 'cyan');

    log('🚀 启动 Chrome...', 'blue');
    this.browser = await puppeteer.launch({
      headless: false,
      args: [
        '--remote-debugging-port=9444',
        `--disable-extensions-except=${TEST_EXTENSION_PATH}`,
        `--load-extension=${TEST_EXTENSION_PATH}`,
      ],
    });

    await new Promise(resolve => setTimeout(resolve, 2000));

    this.page = (await this.browser.pages())[0];
    this.cdp = await this.page.createCDPSession();

    // 获取扩展信息
    const result = await this.cdp.send('Target.getTargets');
    const swTarget = result.targetInfos.find(
      t => t.type === 'service_worker' && t.url.startsWith('chrome-extension://'),
    );

    if (!swTarget) {
      throw new Error('未找到测试扩展');
    }

    this.extensionId = swTarget.url.match(/chrome-extension:\/\/([a-z]{32})/)[1];
    this.targetId = swTarget.targetId;

    log(`✅ Chrome 已启动`, 'green');
    log(`   扩展 ID: ${this.extensionId}`, 'yellow');
    log(`   Target ID: ${this.targetId}`, 'yellow');
  }

  async recordTest(name, status, message, data = null) {
    this.testResults.push({name, status, message, data});
    const icon = status === 'pass' ? '✅' : status === 'fail' ? '❌' : '⚠️';
    const color = status === 'pass' ? 'green' : status === 'fail' ? 'red' : 'yellow';
    log(`${icon} ${name}: ${message}`, color);
    if (data) {
      log(`   数据: ${JSON.stringify(data).substring(0, 100)}...`, 'yellow');
    }
  }

  // ========== Tool 1: 检测 Service Worker 状态 ==========
  async testServiceWorkerState() {
    log('\n📊 Test 1: 检测 Service Worker 初始状态', 'blue');
    try {
      const attachResult = await this.cdp.send('Target.attachToTarget', {
        targetId: this.targetId,
        flatten: true,
      });

      const evalResult = await this.cdp.send('Runtime.evaluate', {
        expression: 'typeof chrome !== "undefined" && typeof chrome.storage !== "undefined"',
        returnByValue: true,
      });

      await this.cdp.send('Target.detachFromTarget', {
        sessionId: attachResult.sessionId,
      });

      const isActive = evalResult.result.value;
      await this.recordTest(
        'Service Worker 状态检测',
        'pass',
        isActive ? 'Active（已激活）' : 'Inactive（未激活）',
        {isActive}
      );

      return isActive;
    } catch (error) {
      await this.recordTest('Service Worker 状态检测', 'fail', error.message);
      throw error;
    }
  }

  // ========== Tool 2: 自动激活 Service Worker ==========
  async testAutoActivation() {
    log('\n📊 Test 2: 自动激活 Service Worker', 'blue');
    try {
      // 获取 manifest
      const manifestPage = await this.browser.newPage();
      await manifestPage.goto(
        `chrome-extension://${this.extensionId}/manifest.json`,
        {waitUntil: 'networkidle0'}
      );
      const manifestText = await manifestPage.evaluate(() => document.body.textContent);
      const manifest = JSON.parse(manifestText);
      await manifestPage.close();

      // 找到 popup 页面
      let popupUrl = null;
      if (manifest.action?.default_popup) {
        popupUrl = `chrome-extension://${this.extensionId}/${manifest.action.default_popup}`;
      } else if (manifest.browser_action?.default_popup) {
        popupUrl = `chrome-extension://${this.extensionId}/${manifest.browser_action.default_popup}`;
      }

      if (!popupUrl) {
        await this.recordTest('自动激活', 'warn', '扩展没有 popup 页面');
        return false;
      }

      // 打开 popup 触发激活
      log(`   打开: ${popupUrl}`, 'yellow');
      const popupPage = await this.browser.newPage();
      await popupPage.goto(popupUrl, {waitUntil: 'networkidle0', timeout: 5000});
      await popupPage.close();

      // 等待激活
      await new Promise(resolve => setTimeout(resolve, 1000));

      // 验证激活
      const attachResult = await this.cdp.send('Target.attachToTarget', {
        targetId: this.targetId,
        flatten: true,
      });

      const evalResult = await this.cdp.send('Runtime.evaluate', {
        expression: 'typeof chrome !== "undefined" && typeof chrome.storage !== "undefined"',
        returnByValue: true,
      });

      await this.cdp.send('Target.detachFromTarget', {
        sessionId: attachResult.sessionId,
      });

      const isNowActive = evalResult.result.value;
      await this.recordTest(
        '自动激活',
        isNowActive ? 'pass' : 'fail',
        isNowActive ? '激活成功' : '激活失败',
        {isNowActive}
      );

      return isNowActive;
    } catch (error) {
      await this.recordTest('自动激活', 'fail', error.message);
      return false;
    }
  }

  // ========== Tool 3: 读取日志 ==========
  async testGetLogs() {
    log('\n📊 Test 3: 获取扩展日志', 'blue');
    try {
      const attachResult = await this.cdp.send('Target.attachToTarget', {
        targetId: this.targetId,
        flatten: true,
      });

      // 尝试获取扩展自定义日志
      const evalResult = await this.cdp.send('Runtime.evaluate', {
        expression: `
          (() => {
            if (typeof globalThis.__logs !== 'undefined') {
              return globalThis.__logs;
            }
            return [];
          })()
        `,
        returnByValue: true,
      });

      await this.cdp.send('Target.detachFromTarget', {
        sessionId: attachResult.sessionId,
      });

      const logs = evalResult.result?.value || [];
      await this.recordTest(
        '获取日志',
        'pass',
        `找到 ${logs.length} 条日志`,
        {logCount: logs.length}
      );

      return logs;
    } catch (error) {
      await this.recordTest('获取日志', 'fail', error.message);
      return [];
    }
  }

  // ========== Tool 4: 写入 Storage ==========
  async testWriteStorage() {
    log('\n📊 Test 4: 写入 Storage', 'blue');
    try {
      const attachResult = await this.cdp.send('Target.attachToTarget', {
        targetId: this.targetId,
        flatten: true,
      });

      const testData = {
        test: 'MCP auto-test',
        timestamp: Date.now(),
        user: {name: 'tester', role: 'qa'},
        array: [1, 2, 3, 4, 5],
      };

      const evalResult = await this.cdp.send('Runtime.evaluate', {
        expression: `
          (async () => {
            try {
              if (typeof chrome === 'undefined' || !chrome.storage) {
                return {success: false, error: 'chrome.storage not available'};
              }
              await chrome.storage.local.set(${JSON.stringify(testData)});
              return {success: true};
            } catch (e) {
              return {success: false, error: e.message};
            }
          })()
        `,
        returnByValue: true,
        awaitPromise: true,
      });

      await this.cdp.send('Target.detachFromTarget', {
        sessionId: attachResult.sessionId,
      });

      const result = evalResult.result?.value;
      await this.recordTest(
        '写入 Storage',
        result?.success ? 'pass' : 'fail',
        result?.success ? '写入成功' : result?.error || '未知错误',
        testData
      );

      return result?.success;
    } catch (error) {
      await this.recordTest('写入 Storage', 'fail', error.message);
      return false;
    }
  }

  // ========== Tool 5: 读取 Storage ==========
  async testReadStorage() {
    log('\n📊 Test 5: 读取 Storage', 'blue');
    try {
      const attachResult = await this.cdp.send('Target.attachToTarget', {
        targetId: this.targetId,
        flatten: true,
      });

      const evalResult = await this.cdp.send('Runtime.evaluate', {
        expression: `
          (async () => {
            try {
              if (typeof chrome === 'undefined' || !chrome.storage) {
                return {success: false, error: 'chrome.storage not available'};
              }
              const data = await chrome.storage.local.get(null);
              return {success: true, data, keys: Object.keys(data)};
            } catch (e) {
              return {success: false, error: e.message};
            }
          })()
        `,
        returnByValue: true,
        awaitPromise: true,
      });

      await this.cdp.send('Target.detachFromTarget', {
        sessionId: attachResult.sessionId,
      });

      const result = evalResult.result?.value;
      await this.recordTest(
        '读取 Storage',
        result?.success ? 'pass' : 'fail',
        result?.success
          ? `读取成功，包含 ${result.keys.length} 个键`
          : result?.error || '未知错误',
        result?.success ? {keys: result.keys, sampleData: result.data.test} : null
      );

      return result;
    } catch (error) {
      await this.recordTest('读取 Storage', 'fail', error.message);
      return null;
    }
  }

  // ========== Tool 6: 测试 chrome.tabs API ==========
  async testTabsAPI() {
    log('\n📊 Test 6: 测试 chrome.tabs API', 'blue');
    try {
      const attachResult = await this.cdp.send('Target.attachToTarget', {
        targetId: this.targetId,
        flatten: true,
      });

      const evalResult = await this.cdp.send('Runtime.evaluate', {
        expression: `
          (async () => {
            try {
              const tabs = await chrome.tabs.query({});
              const activeTabs = await chrome.tabs.query({active: true});
              return {
                success: true,
                totalTabs: tabs.length,
                activeTabs: activeTabs.length,
              };
            } catch (e) {
              return {success: false, error: e.message};
            }
          })()
        `,
        returnByValue: true,
        awaitPromise: true,
      });

      await this.cdp.send('Target.detachFromTarget', {
        sessionId: attachResult.sessionId,
      });

      const result = evalResult.result?.value;
      await this.recordTest(
        'chrome.tabs API',
        result?.success ? 'pass' : 'fail',
        result?.success
          ? `查询成功：${result.totalTabs} 个标签页`
          : result?.error || '未知错误',
        result?.success ? {totalTabs: result.totalTabs, activeTabs: result.activeTabs} : null
      );

      return result?.success;
    } catch (error) {
      await this.recordTest('chrome.tabs API', 'fail', error.message);
      return false;
    }
  }

  // ========== Tool 7: 测试代码执行各种语法 ==========
  async testCodeExecution() {
    log('\n📊 Test 7: 测试代码执行（各种语法）', 'blue');
    
    const testCases = [
      {
        name: '简单表达式',
        code: '1 + 1',
        expected: 2,
      },
      {
        name: '对象字面量',
        code: '({a: 1, b: 2})',
        expected: {a: 1, b: 2},
      },
      {
        name: '字符串',
        code: '"hello world"',
        expected: 'hello world',
      },
      {
        name: 'Promise',
        code: 'await Promise.resolve("async works")',
        expected: 'async works',
      },
      {
        name: 'Array',
        code: '[1, 2, 3].map(x => x * 2)',
        expected: [2, 4, 6],
      },
    ];

    let passCount = 0;
    for (const test of testCases) {
      try {
        const attachResult = await this.cdp.send('Target.attachToTarget', {
          targetId: this.targetId,
          flatten: true,
        });

        const wrappedCode = test.code.trim().startsWith('return ')
          ? `(async () => { ${test.code} })()`
          : `(async () => { return ${test.code} })()`;

        const evalResult = await this.cdp.send('Runtime.evaluate', {
          expression: wrappedCode,
          returnByValue: true,
          awaitPromise: true,
        });

        await this.cdp.send('Target.detachFromTarget', {
          sessionId: attachResult.sessionId,
        });

        const result = evalResult.result?.value;
        const match = JSON.stringify(result) === JSON.stringify(test.expected);

        if (match) {
          passCount++;
          log(`   ✅ ${test.name}: 通过`, 'green');
        } else {
          log(`   ❌ ${test.name}: 不匹配`, 'red');
          log(`      期望: ${JSON.stringify(test.expected)}`, 'yellow');
          log(`      实际: ${JSON.stringify(result)}`, 'yellow');
        }
      } catch (error) {
        log(`   ❌ ${test.name}: 异常 - ${error.message}`, 'red');
      }
    }

    await this.recordTest(
      '代码执行测试',
      passCount === testCases.length ? 'pass' : 'warn',
      `${passCount}/${testCases.length} 个测试通过`,
      {passCount, totalCount: testCases.length}
    );

    return passCount === testCases.length;
  }

  // ========== 生成测试报告 ==========
  generateReport() {
    log('\n╔══════════════════════════════════════════════════════╗', 'cyan');
    log('║   测试报告                                            ║', 'cyan');
    log('╚══════════════════════════════════════════════════════╝\n', 'cyan');

    const totalTests = this.testResults.length;
    const passedTests = this.testResults.filter(t => t.status === 'pass').length;
    const failedTests = this.testResults.filter(t => t.status === 'fail').length;
    const warnTests = this.testResults.filter(t => t.status === 'warn').length;

    log(`总计: ${totalTests} 个测试`, 'white');
    log(`✅ 通过: ${passedTests}`, 'green');
    log(`❌ 失败: ${failedTests}`, 'red');
    log(`⚠️  警告: ${warnTests}`, 'yellow');

    if (failedTests > 0) {
      log('\n失败的测试:', 'red');
      this.testResults
        .filter(t => t.status === 'fail')
        .forEach(t => {
          log(`  - ${t.name}: ${t.message}`, 'red');
        });
    }

    const successRate = ((passedTests / totalTests) * 100).toFixed(1);
    log(`\n成功率: ${successRate}%`, successRate >= 80 ? 'green' : 'yellow');

    return {
      total: totalTests,
      passed: passedTests,
      failed: failedTests,
      warned: warnTests,
      successRate: parseFloat(successRate),
    };
  }

  async cleanup() {
    log('\n🔚 清理资源...', 'blue');
    if (this.browser) {
      await this.browser.close();
    }
    log('✅ 清理完成', 'green');
  }

  async runAllTests() {
    try {
      await this.setup();

      // 按顺序执行所有测试
      const initialState = await this.testServiceWorkerState();
      
      if (!initialState) {
        log('\n⚠️  Service Worker 未激活，开始自动激活测试...', 'yellow');
        await this.testAutoActivation();
      } else {
        log('\n✅ Service Worker 已激活，跳过激活测试', 'green');
      }

      await this.testGetLogs();
      await this.testWriteStorage();
      await this.testReadStorage();
      await this.testTabsAPI();
      await this.testCodeExecution();

      const report = this.generateReport();

      await this.cleanup();

      return report;
    } catch (error) {
      log(`\n❌ 测试执行失败: ${error.message}`, 'red');
      log(error.stack, 'red');
      await this.cleanup();
      throw error;
    }
  }
}

// 运行测试
const tester = new ExtensionToolTester();
tester.runAllTests()
  .then(report => {
    if (report.successRate >= 80) {
      process.exit(0);
    } else {
      process.exit(1);
    }
  })
  .catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
