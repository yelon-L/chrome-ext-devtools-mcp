#!/usr/bin/env node
/**
 * 测试动态生成的 Helper Extension
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
    magenta: '\x1b[35m',
  };
  console.log(`${colors[color]}${message}\x1b[0m`);
}

async function testDynamicHelper() {
  log('\n╔══════════════════════════════════════════════════════╗', 'cyan');
  log('║   动态生成 Helper Extension 测试                     ║', 'cyan');
  log('╚══════════════════════════════════════════════════════╝\n', 'cyan');

  let browser;
  
  try {
    log('🚀 启动 Chrome（应该自动生成 Helper Extension）...', 'blue');
    
    // 导入动态生成模块
    const {HelperExtensionGenerator} = await import('./build/src/extension/HelperExtensionGenerator.js');
    
    log('🔧 手动测试生成流程...', 'blue');
    
    // 1. 清理旧文件
    log('   1. 清理旧的临时文件...', 'yellow');
    const cleanedCount = await HelperExtensionGenerator.cleanupAllTempDirs();
    log(`   ✅ 清理了 ${cleanedCount} 个旧目录`, 'green');
    
    // 2. 生成新的 Helper Extension
    log('   2. 生成新的 Helper Extension...', 'yellow');
    const generator = new HelperExtensionGenerator();
    const helperPath = await generator.generateHelperExtension();
    log(`   ✅ 已生成: ${helperPath}`, 'green');
    
    // 3. 验证文件
    log('   3. 验证生成的文件...', 'yellow');
    const fs = await import('fs');
    const manifestExists = fs.existsSync(path.join(helperPath, 'manifest.json'));
    const backgroundExists = fs.existsSync(path.join(helperPath, 'background.js'));
    const iconExists = fs.existsSync(path.join(helperPath, 'icon16.png'));
    
    if (manifestExists && backgroundExists && iconExists) {
      log('   ✅ 所有文件已生成', 'green');
    } else {
      log('   ❌ 某些文件缺失', 'red');
      log(`      manifest.json: ${manifestExists ? '✅' : '❌'}`, 'yellow');
      log(`      background.js: ${backgroundExists ? '✅' : '❌'}`, 'yellow');
      log(`      icon16.png: ${iconExists ? '✅' : '❌'}`, 'yellow');
      throw new Error('文件生成不完整');
    }
    
    // 4. 启动 Chrome 并加载两个扩展
    log('\n🚀 启动 Chrome 并加载扩展...', 'blue');
    browser = await puppeteer.launch({
      headless: false,
      args: [
        '--remote-debugging-port=9446',
        `--disable-extensions-except=${TEST_EXTENSION_PATH},${helperPath}`,
        `--load-extension=${TEST_EXTENSION_PATH},${helperPath}`,
      ],
    });
    
    await new Promise(resolve => setTimeout(resolve, 3000));
    log('✅ Chrome 已启动', 'green');
    
    // 5. 检测扩展
    log('\n📊 检测已加载的扩展...', 'blue');
    const page = (await browser.pages())[0];
    const cdp = await page.createCDPSession();
    
    const result = await cdp.send('Target.getTargets');
    const extensions = result.targetInfos.filter(
      t => t.type === 'service_worker' && t.url.startsWith('chrome-extension://'),
    );
    
    log(`   找到 ${extensions.length} 个扩展`, 'yellow');
    
    let helperFound = false;
    let testExtFound = false;
    let helperExtId = null;
    let testExtId = null;
    
    for (const ext of extensions) {
      const extId = ext.url.match(/chrome-extension:\/\/([a-z]{32})/)?.[1];
      if (!extId) continue;
      
      try {
        const manifestPage = await browser.newPage();
        await manifestPage.goto(`chrome-extension://${extId}/manifest.json`, {
          waitUntil: 'networkidle0',
          timeout: 3000,
        });
        const manifestText = await manifestPage.evaluate(() => document.body.textContent);
        await manifestPage.close();
        
        if (!manifestText) continue;
        
        const manifest = JSON.parse(manifestText);
        
        if (manifest.name.includes('MCP Service Worker Activator')) {
          helperFound = true;
          helperExtId = extId;
          log(`   ✅ 找到 Helper Extension`, 'green');
          log(`      ID: ${extId}`, 'yellow');
          log(`      名称: ${manifest.name}`, 'yellow');
        } else if (manifest.name.includes('Enhanced MCP Debug')) {
          testExtFound = true;
          testExtId = extId;
          log(`   ✅ 找到测试扩展`, 'green');
          log(`      ID: ${extId}`, 'yellow');
        }
      } catch (e) {
        continue;
      }
    }
    
    // 6. 测试 Helper 功能
    if (helperFound && testExtFound) {
      log('\n📊 测试 Helper Extension 激活功能...', 'blue');
      
      try {
        const activateResult = await page.evaluate(
          (helperId, targetId) => {
            return new Promise((resolve) => {
              const startTime = Date.now();
              chrome.runtime.sendMessage(
                helperId,
                {action: 'activate', extensionId: targetId},
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
          helperExtId,
          testExtId
        );
        
        if (activateResult.success) {
          log(`   ✅ 激活成功！`, 'green');
          log(`      方法: ${activateResult.method}`, 'yellow');
          log(`      耗时: ${activateResult.duration}ms`, 'yellow');
        } else {
          log(`   ❌ 激活失败: ${activateResult.error}`, 'red');
        }
      } catch (error) {
        log(`   ❌ 测试失败: ${error.message}`, 'red');
      }
    } else {
      if (!helperFound) {
        log('\n❌ Helper Extension 未找到！', 'red');
        log('   可能原因：', 'yellow');
        log('   1. Chrome 启动参数未生效', 'yellow');
        log('   2. 扩展文件有问题', 'yellow');
        log('   3. Chrome 版本不支持', 'yellow');
      }
      if (!testExtFound) {
        log('\n❌ 测试扩展未找到！', 'red');
      }
    }
    
    // 7. 报告
    log('\n╔══════════════════════════════════════════════════════╗', 'cyan');
    log('║   测试结果                                            ║', 'cyan');
    log('╚══════════════════════════════════════════════════════╝\n', 'cyan');
    
    log(`文件生成: ${manifestExists && backgroundExists ? '✅ 成功' : '❌ 失败'}`, manifestExists && backgroundExists ? 'green' : 'red');
    log(`Helper 加载: ${helperFound ? '✅ 成功' : '❌ 失败'}`, helperFound ? 'green' : 'red');
    log(`测试扩展加载: ${testExtFound ? '✅ 成功' : '❌ 失败'}`, testExtFound ? 'green' : 'red');
    
    if (helperFound && testExtFound) {
      log('\n🎉 动态生成 Helper Extension 工作正常！', 'green');
      log('   推荐集成到 MCP 启动流程', 'green');
    } else {
      log('\n⚠️  动态生成存在问题，需要调试', 'yellow');
    }
    
    log('\n按 Ctrl+C 退出...', 'cyan');
    await new Promise(() => {}); // 保持运行
    
  } catch (error) {
    log(`\n❌ 测试失败: ${error.message}`, 'red');
    console.error(error);
    if (browser) {
      await browser.close();
    }
    process.exit(1);
  }
}

testDynamicHelper();
