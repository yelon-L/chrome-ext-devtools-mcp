#!/usr/bin/env node
/**
 * 详细检测 Helper Extension
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
  log('║   详细检测 Helper Extension                          ║', 'cyan');
  log('╚══════════════════════════════════════════════════════╝\n', 'cyan');

  let browser;
  
  try {
    log('1️⃣  连接到 Chrome...', 'blue');
    browser = await puppeteer.connect({
      browserURL: 'http://localhost:9222',
      defaultViewport: null,
    });
    log('   ✅ 连接成功', 'green');
    
    const page = (await browser.pages())[0];
    const cdp = await page.createCDPSession();
    
    // 方法 1: 检查所有 targets
    log('\n2️⃣  检查所有 Chrome targets...', 'blue');
    const {targetInfos} = await cdp.send('Target.getTargets');
    
    log(`   总共找到 ${targetInfos.length} 个 targets`, 'yellow');
    
    // 列出所有扩展相关的 targets
    const extTargets = targetInfos.filter(t => 
      t.url.startsWith('chrome-extension://') || 
      t.type === 'service_worker'
    );
    
    log(`   其中 ${extTargets.length} 个与扩展相关\n`, 'yellow');
    
    for (const target of extTargets) {
      log(`   📦 Target:`, 'cyan');
      log(`      类型: ${target.type}`, 'cyan');
      log(`      URL: ${target.url}`, 'cyan');
      log(`      标题: ${target.title}`, 'cyan');
      log('');
    }
    
    // 方法 2: 直接访问你的 Helper Extension
    log('3️⃣  尝试直接访问你的 Helper Extension...', 'blue');
    const yourHelperId = 'kppbmoiecmhnnhjnlkojlblanellmonp';
    
    try {
      const helperPage = await browser.newPage();
      const manifestUrl = `chrome-extension://${yourHelperId}/manifest.json`;
      
      log(`   访问: ${manifestUrl}`, 'yellow');
      
      await helperPage.goto(manifestUrl, {
        waitUntil: 'networkidle0',
        timeout: 5000,
      });
      
      const manifestText = await helperPage.evaluate(() => document.body.textContent);
      await helperPage.close();
      
      if (manifestText) {
        const manifest = JSON.parse(manifestText);
        log('   ✅ 成功访问 Helper Extension！', 'green');
        log(`   名称: ${manifest.name}`, 'green');
        log(`   版本: ${manifest.version}`, 'green');
        log(`   权限: ${manifest.permissions.join(', ')}`, 'green');
        log(`   Service Worker: ${manifest.background?.service_worker || 'N/A'}`, 'green');
      }
    } catch (error) {
      log('   ❌ 无法访问 Helper Extension', 'red');
      log(`   错误: ${error.message}`, 'red');
      log('', 'red');
      log('   可能原因:', 'yellow');
      log('   1. Helper Extension 未安装', 'yellow');
      log('   2. Helper Extension ID 不正确', 'yellow');
      log('   3. Helper Extension 已禁用', 'yellow');
    }
    
    // 方法 3: 使用 chrome.management API
    log('\n4️⃣  使用 chrome.management API 查询...', 'blue');
    
    try {
      const extensions = await page.evaluate(() => {
        return new Promise((resolve) => {
          chrome.management.getAll((exts) => {
            resolve(exts.map(ext => ({
              id: ext.id,
              name: ext.name,
              version: ext.version,
              enabled: ext.enabled,
              type: ext.type,
            })));
          });
        });
      });
      
      log(`   找到 ${extensions.length} 个扩展:\n`, 'yellow');
      
      for (const ext of extensions) {
        const isHelper = ext.name.includes('MCP') || ext.name.includes('Service Worker Activator');
        const color = isHelper ? 'green' : 'cyan';
        
        log(`   ${isHelper ? '✅' : '📦'} ${ext.name}`, color);
        log(`      ID: ${ext.id}`, color);
        log(`      版本: ${ext.version}`, color);
        log(`      状态: ${ext.enabled ? '已启用' : '已禁用'}`, ext.enabled ? color : 'red');
        log(`      类型: ${ext.type}`, color);
        log('');
      }
      
      const helperExt = extensions.find(ext => ext.id === yourHelperId);
      
      if (helperExt) {
        log('🎉 找到你的 Helper Extension！', 'green');
        log(`   名称: ${helperExt.name}`, 'green');
        log(`   状态: ${helperExt.enabled ? '✅ 已启用' : '❌ 已禁用'}`, helperExt.enabled ? 'green' : 'red');
      } else {
        log('❌ 没有找到 ID 为 kppbmoiecmhnnhjnlkojlblanellmonp 的扩展', 'red');
        
        const possibleHelper = extensions.find(ext => 
          ext.name.includes('MCP') || 
          ext.name.includes('Service Worker Activator')
        );
        
        if (possibleHelper) {
          log('\n💡 但找到了类似的扩展:', 'yellow');
          log(`   名称: ${possibleHelper.name}`, 'yellow');
          log(`   ID: ${possibleHelper.id}`, 'yellow');
          log('   这可能是你的 Helper Extension，但 ID 不匹配', 'yellow');
        }
      }
    } catch (error) {
      log('   ❌ 无法使用 chrome.management API', 'red');
      log(`   错误: ${error.message}`, 'red');
    }
    
    // 方法 4: 测试消息通信
    log('\n5️⃣  测试与 Helper Extension 通信...', 'blue');
    
    try {
      const testPage = await browser.newPage();
      await testPage.goto('http://localhost:9222', {timeout: 5000});
      
      const pingResult = await testPage.evaluate((helperId) => {
        return new Promise((resolve) => {
          chrome.runtime.sendMessage(
            helperId,
            {action: 'ping'},
            (response) => {
              if (chrome.runtime.lastError) {
                resolve({
                  success: false,
                  error: chrome.runtime.lastError.message
                });
              } else {
                resolve({
                  success: true,
                  response
                });
              }
            }
          );
          
          // 超时处理
          setTimeout(() => {
            resolve({
              success: false,
              error: 'Timeout'
            });
          }, 3000);
        });
      }, yourHelperId);
      
      await testPage.close();
      
      if (pingResult.success) {
        log('   ✅ Helper Extension 响应正常！', 'green');
        log(`   响应: ${JSON.stringify(pingResult.response, null, 2)}`, 'green');
      } else {
        log('   ❌ Helper Extension 无响应', 'red');
        log(`   错误: ${pingResult.error}`, 'red');
      }
    } catch (error) {
      log('   ❌ 通信测试失败', 'red');
      log(`   错误: ${error.message}`, 'red');
    }
    
    log('\n╔══════════════════════════════════════════════════════╗', 'cyan');
    log('║   诊断完成                                            ║', 'cyan');
    log('╚══════════════════════════════════════════════════════╝\n', 'cyan');
    
    log('按 Ctrl+C 退出...', 'cyan');
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
