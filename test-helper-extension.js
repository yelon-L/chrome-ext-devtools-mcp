#!/usr/bin/env node
/**
 * Helper Extension 端到端测试
 * 
 * 测试 MCP + Helper Extension 的完整流程
 */

import puppeteer from 'puppeteer';
import path from 'path';
import {fileURLToPath} from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEST_EXTENSION_PATH = path.join(__dirname, 'test-extension-enhanced');
const HELPER_EXTENSION_PATH = path.join(__dirname, 'helper-extension');

function log(message, color = 'white') {
  const colors = {
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m',
    white: '\x1b[37m',
    magenta: '\x1b[35m',
  };
  console.log(`${colors[color]}${message}\x1b[0m`);
}

class HelperExtensionTester {
  constructor() {
    this.browser = null;
    this.page = null;
    this.testExtensionId = null;
    this.helperExtensionId = null;
  }

  async setup() {
    log('\n╔══════════════════════════════════════════════════════╗', 'cyan');
    log('║   Helper Extension 完整测试                          ║', 'cyan');
    log('╚══════════════════════════════════════════════════════╝\n', 'cyan');

    log('🚀 启动 Chrome（加载两个扩展）...', 'blue');
    this.browser = await puppeteer.launch({
      headless: false,
      args: [
        '--remote-debugging-port=9445',
        `--disable-extensions-except=${TEST_EXTENSION_PATH},${HELPER_EXTENSION_PATH}`,
        `--load-extension=${TEST_EXTENSION_PATH},${HELPER_EXTENSION_PATH}`,
      ],
    });

    await new Promise(resolve => setTimeout(resolve, 2000));

    this.page = (await this.browser.pages())[0];
    const cdp = await this.page.createCDPSession();

    // 获取扩展信息
    const result = await cdp.send('Target.getTargets');
    const extensions = result.targetInfos.filter(
      t => t.type === 'service_worker' && t.url.startsWith('chrome-extension://'),
    );

    for (const ext of extensions) {
      const extId = ext.url.match(/chrome-extension:\/\/([a-z]{32})/)[1];
      
      // 获取 manifest 判断是哪个扩展
      try {
        const manifestPage = await this.browser.newPage();
        await manifestPage.goto(`chrome-extension://${extId}/manifest.json`, {
          waitUntil: 'networkidle0',
          timeout: 3000,
        });
        const manifestText = await manifestPage.evaluate(() => document.body.textContent);
        await manifestPage.close();
        
        const manifest = JSON.parse(manifestText);
        
        if (manifest.name === 'MCP Service Worker Activator') {
          this.helperExtensionId = extId;
          log(`✅ Helper Extension ID: ${extId}`, 'green');
        } else if (manifest.name.includes('Enhanced MCP Debug')) {
          this.testExtensionId = extId;
          log(`✅ Test Extension ID: ${extId}`, 'green');
        }
      } catch (e) {
        continue;
      }
    }

    if (!this.helperExtensionId) {
      log('❌ 未找到 Helper Extension！', 'red');
      throw new Error('Helper Extension not loaded');
    }

    if (!this.testExtensionId) {
      log('❌ 未找到 Test Extension！', 'red');
      throw new Error('Test Extension not loaded');
    }
  }

  async testHelperPing() {
    log('\n📊 Test 1: Helper Extension Ping', 'blue');
    
    try {
      const result = await this.page.evaluate((helperId) => {
        return new Promise((resolve) => {
          chrome.runtime.sendMessage(
            helperId,
            {action: 'ping'},
            (response) => {
              if (chrome.runtime.lastError) {
                resolve({success: false, error: chrome.runtime.lastError.message});
              } else {
                resolve(response);
              }
            }
          );
        });
      }, this.helperExtensionId);

      if (result.success) {
        log(`✅ Helper Extension 响应正常`, 'green');
        log(`   Version: ${result.helperVersion}`, 'yellow');
        return true;
      } else {
        log(`❌ Ping 失败: ${result.error}`, 'red');
        return false;
      }
    } catch (error) {
      log(`❌ Ping 异常: ${error.message}`, 'red');
      return false;
    }
  }

  async testServiceWorkerActivation() {
    log('\n📊 Test 2: Service Worker 自动激活', 'blue');
    
    try {
      log(`   目标扩展: ${this.testExtensionId}`, 'yellow');
      log(`   通过 Helper: ${this.helperExtensionId}`, 'yellow');
      
      const result = await this.page.evaluate(
        (helperId, targetId) => {
          return new Promise((resolve) => {
            const startTime = Date.now();
            
            chrome.runtime.sendMessage(
              helperId,
              {
                action: 'activate',
                extensionId: targetId
              },
              (response) => {
                const duration = Date.now() - startTime;
                
                if (chrome.runtime.lastError) {
                  resolve({
                    success: false,
                    error: chrome.runtime.lastError.message,
                    duration
                  });
                } else {
                  resolve({...response, duration});
                }
              }
            );
          });
        },
        this.helperExtensionId,
        this.testExtensionId
      );

      if (result.success) {
        log(`✅ 激活成功！`, 'green');
        log(`   方法: ${result.method}`, 'yellow');
        log(`   耗时: ${result.duration}ms`, 'yellow');
        return true;
      } else {
        log(`❌ 激活失败: ${result.error}`, 'red');
        return false;
      }
    } catch (error) {
      log(`❌ 激活异常: ${error.message}`, 'red');
      return false;
    }
  }

  async testStorageAccess() {
    log('\n📊 Test 3: Storage 访问（验证激活效果）', 'blue');
    
    try {
      // 通过 CDP 访问目标扩展的 Storage
      const cdp = await this.page.createCDPSession();
      const targets = await cdp.send('Target.getTargets');
      const targetSW = targets.targetInfos.find(
        t => t.url.includes(this.testExtensionId) && t.type === 'service_worker'
      );

      if (!targetSW) {
        log(`❌ 未找到目标扩展的 Service Worker`, 'red');
        return false;
      }

      const attachResult = await cdp.send('Target.attachToTarget', {
        targetId: targetSW.targetId,
        flatten: true,
      });

      // 测试 Storage API 是否可用
      const evalResult = await cdp.send('Runtime.evaluate', {
        expression: `
          (async () => {
            try {
              const data = await chrome.storage.local.get(null);
              return {
                success: true,
                keys: Object.keys(data),
                hasData: Object.keys(data).length > 0
              };
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
        log(`✅ Storage 访问成功！`, 'green');
        log(`   键数量: ${result.keys.length}`, 'yellow');
        if (result.hasData) {
          log(`   示例键: ${result.keys.slice(0, 3).join(', ')}`, 'yellow');
        }
        return true;
      } else {
        log(`❌ Storage 访问失败: ${result.error}`, 'red');
        return false;
      }
    } catch (error) {
      log(`❌ Storage 测试异常: ${error.message}`, 'red');
      return false;
    }
  }

  async testMultipleActivations() {
    log('\n📊 Test 4: 多次激活测试', 'blue');
    
    const results = [];
    
    for (let i = 0; i < 3; i++) {
      log(`   尝试 ${i + 1}/3...`, 'yellow');
      
      const result = await this.page.evaluate(
        (helperId, targetId) => {
          return new Promise((resolve) => {
            const startTime = Date.now();
            chrome.runtime.sendMessage(
              helperId,
              {action: 'activate', extensionId: targetId},
              (response) => {
                const duration = Date.now() - startTime;
                resolve({
                  ...response,
                  duration
                });
              }
            );
          });
        },
        this.helperExtensionId,
        this.testExtensionId
      );

      results.push(result);
      await new Promise(r => setTimeout(r, 500));
    }

    const successCount = results.filter(r => r.success).length;
    const avgDuration = results.reduce((sum, r) => sum + r.duration, 0) / results.length;

    log(`✅ 成功: ${successCount}/3`, 'green');
    log(`   平均耗时: ${avgDuration.toFixed(0)}ms`, 'yellow');

    return successCount === 3;
  }

  async generateReport(testResults) {
    log('\n╔══════════════════════════════════════════════════════╗', 'cyan');
    log('║   测试报告                                            ║', 'cyan');
    log('╚══════════════════════════════════════════════════════╝\n', 'cyan');

    const totalTests = testResults.length;
    const passedTests = testResults.filter(t => t).length;
    const failedTests = totalTests - passedTests;

    log(`总计: ${totalTests} 个测试`, 'white');
    log(`✅ 通过: ${passedTests}`, 'green');
    log(`❌ 失败: ${failedTests}`, 'red');

    const successRate = ((passedTests / totalTests) * 100).toFixed(1);
    log(`\n成功率: ${successRate}%`, successRate >= 80 ? 'green' : 'yellow');

    if (successRate >= 80) {
      log('\n🎉 Helper Extension 工作正常！', 'green');
      log('   推荐给所有用户安装！', 'green');
    } else {
      log('\n⚠️  Helper Extension 存在问题', 'yellow');
      log('   请检查扩展日志', 'yellow');
    }

    return {
      total: totalTests,
      passed: passedTests,
      failed: failedTests,
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

      const testResults = [];

      testResults.push(await this.testHelperPing());
      testResults.push(await this.testServiceWorkerActivation());
      testResults.push(await this.testStorageAccess());
      testResults.push(await this.testMultipleActivations());

      const report = await this.generateReport(testResults);

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
const tester = new HelperExtensionTester();
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
