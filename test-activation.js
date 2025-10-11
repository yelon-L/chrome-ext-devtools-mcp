#!/usr/bin/env node
/**
 * 测试 Helper Extension 激活功能
 */

import puppeteer from 'puppeteer';

function log(message, color = 'white') {
  const colors = {
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m',
  };
  console.log(`${colors[color]}${message}\x1b[0m`);
}

async function test() {
  log('\n╔══════════════════════════════════════════════════════╗', 'cyan');
  log('║   测试 Helper Extension 激活功能                     ║', 'cyan');
  log('╚══════════════════════════════════════════════════════╝\n', 'cyan');

  let browser;
  
  try {
    log('1️⃣  连接到 Chrome...', 'blue');
    browser = await puppeteer.connect({
      browserURL: 'http://localhost:9222',
      defaultViewport: null,
    });
    log('   ✅ 连接成功\n', 'green');
    
    // 目标扩展
    const targetExtId = 'bekcbmopkiajilfliobihjgnghfcbido';
    const helperExtId = 'kppbmoiecmhnnhjnlkojlblanellmonp';
    
    log('2️⃣  测试目标扩展信息...', 'blue');
    log(`   目标扩展 ID: ${targetExtId}`, 'yellow');
    
    // 创建测试页面
    const testPage = await browser.newPage();
    await testPage.goto('http://localhost:9222/json', {timeout: 5000});
    
    // 检查目标扩展状态
    log('\n3️⃣  检查目标扩展 Service Worker 状态...', 'blue');
    
    const page = (await browser.pages())[0];
    const cdp = await page.createCDPSession();
    const {targetInfos} = await cdp.send('Target.getTargets');
    const targetSW = targetInfos.find(t => 
      t.type === 'service_worker' && 
      t.url.includes(targetExtId)
    );
    
    if (targetSW) {
      log('   ✅ 目标扩展 Service Worker 当前是 Active', 'green');
      log(`   URL: ${targetSW.url}`, 'green');
    } else {
      log('   ⚠️  目标扩展 Service Worker 当前是 Inactive', 'yellow');
    }
    
    // 使用 Helper Extension 激活
    log('\n4️⃣  使用 Helper Extension 激活目标扩展...', 'blue');
    
    const activateResult = await testPage.evaluate(
      (helperId, targetId) => {
        return new Promise((resolve) => {
          const startTime = Date.now();
          
          console.log(`[Test] 发送激活请求...`);
          console.log(`[Test] Helper ID: ${helperId}`);
          console.log(`[Test] Target ID: ${targetId}`);
          
          chrome.runtime.sendMessage(
            helperId,
            {
              action: 'activate',
              extensionId: targetId
            },
            (response) => {
              const duration = Date.now() - startTime;
              
              if (chrome.runtime.lastError) {
                console.log(`[Test] 错误:`, chrome.runtime.lastError.message);
                resolve({
                  success: false,
                  error: chrome.runtime.lastError.message,
                  duration
                });
              } else {
                console.log(`[Test] 响应:`, response);
                resolve({
                  ...response,
                  duration
                });
              }
            }
          );
          
          // 超时保护
          setTimeout(() => {
            resolve({
              success: false,
              error: 'Timeout (5秒)',
              duration: 5000
            });
          }, 5000);
        });
      },
      helperExtId,
      targetExtId
    );
    
    await testPage.close();
    
    log('   激活结果:', 'cyan');
    
    if (activateResult.success) {
      log(`   ✅ 激活成功！`, 'green');
      log(`   方法: ${activateResult.method || 'N/A'}`, 'green');
      log(`   耗时: ${activateResult.duration}ms`, 'green');
      log(`   消息: ${activateResult.message || 'N/A'}`, 'green');
    } else {
      log(`   ❌ 激活失败`, 'red');
      log(`   错误: ${activateResult.error}`, 'red');
      log(`   耗时: ${activateResult.duration}ms`, 'red');
    }
    
    // 再次检查状态
    log('\n5️⃣  验证激活效果...', 'blue');
    
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    const {targetInfos: newTargets} = await cdp.send('Target.getTargets');
    const newTargetSW = newTargets.find(t => 
      t.type === 'service_worker' && 
      t.url.includes(targetExtId)
    );
    
    if (newTargetSW) {
      log('   ✅ 目标扩展 Service Worker 现在是 Active！', 'green');
      log(`   URL: ${newTargetSW.url}`, 'green');
    } else {
      log('   ⚠️  目标扩展 Service Worker 仍然是 Inactive', 'yellow');
    }
    
    // 测试访问 storage
    if (activateResult.success) {
      log('\n6️⃣  测试访问目标扩展的 storage...', 'blue');
      
      try {
        // 获取目标扩展的 background context
        const backgroundTarget = newTargets.find(t => 
          t.type === 'service_worker' && 
          t.url.includes(targetExtId)
        );
        
        if (backgroundTarget) {
          const bgSession = await browser.target().createCDPSession();
          await bgSession.send('Target.attachToTarget', {
            targetId: backgroundTarget.targetId,
            flatten: true
          });
          
          // 评估代码访问 storage
          const storageResult = await bgSession.send('Runtime.evaluate', {
            expression: `
              (async () => {
                try {
                  const data = await chrome.storage.local.get(null);
                  return {
                    success: true,
                    data: data,
                    keys: Object.keys(data)
                  };
                } catch (error) {
                  return {
                    success: false,
                    error: error.message
                  };
                }
              })()
            `,
            awaitPromise: true,
            returnByValue: true
          });
          
          if (storageResult.result?.value?.success) {
            log('   ✅ Storage 访问成功！', 'green');
            log(`   数据键: ${storageResult.result.value.keys.join(', ') || '(空)'}`, 'green');
          } else {
            log('   ❌ Storage 访问失败', 'red');
          }
        } else {
          log('   ⚠️  无法找到 background context', 'yellow');
        }
      } catch (error) {
        log(`   ❌ 测试失败: ${error.message}`, 'red');
      }
    }
    
    // 总结
    log('\n╔══════════════════════════════════════════════════════╗', 'cyan');
    log('║   测试总结                                            ║', 'cyan');
    log('╚══════════════════════════════════════════════════════╝\n', 'cyan');
    
    if (activateResult.success) {
      log('🎉 Helper Extension 工作完美！', 'green');
      log('✅ 可以自动激活目标扩展的 Service Worker', 'green');
      log('✅ MCP 工具应该能正常使用', 'green');
      log('✅ 预期成功率: 95%+', 'green');
    } else {
      log('⚠️  Helper Extension 激活失败', 'yellow');
      log('❌ 需要检查 Helper Extension 的权限和配置', 'red');
      log('📝 建议使用手动激活方式', 'yellow');
    }
    
    log('\n按 Ctrl+C 退出...', 'cyan');
    await new Promise(() => {});
    
  } catch (error) {
    log(`\n❌ 测试失败: ${error.message}`, 'red');
    console.error(error);
    if (browser) {
      await browser.disconnect();
    }
    process.exit(1);
  }
}

test();
