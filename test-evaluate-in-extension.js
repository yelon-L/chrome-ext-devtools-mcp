#!/usr/bin/env node
/**
 * 测试 evaluate_in_extension 工具
 */

import puppeteer from 'puppeteer';
import path from 'path';
import {fileURLToPath} from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEST_EXTENSION_PATH = path.join(__dirname, 'test-extension-enhanced');

async function test() {
  console.log('🚀 启动 Chrome 并加载测试扩展...');
  
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
  
  // 获取扩展 ID
  const result = await cdp.send('Target.getTargets');
  const swTarget = result.targetInfos.find(
    t => t.type === 'service_worker' && t.url.startsWith('chrome-extension://'),
  );
  
  if (!swTarget) {
    console.log('❌ 未找到扩展 Service Worker');
    await browser.close();
    return;
  }
  
  const extensionId = swTarget.url.match(/chrome-extension:\/\/([a-z]{32})/)[1];
  console.log(`✅ 找到扩展: ${extensionId}`);
  console.log(`   Service Worker: ${swTarget.url}`);
  
  // 测试执行代码
  console.log('\n🧪 测试 1: 执行简单代码');
  try {
    const attachResult = await cdp.send('Target.attachToTarget', {
      targetId: swTarget.targetId,
      flatten: true,
    });
    
    const evalResult = await cdp.send('Runtime.evaluate', {
      expression: '1 + 1',
      returnByValue: true,
      awaitPromise: false,
    });
    
    await cdp.send('Target.detachFromTarget', {
      sessionId: attachResult.sessionId,
    });
    
    console.log(`   结果: ${evalResult.result.value}`);
    console.log('   ✅ 成功');
  } catch (e) {
    console.log(`   ❌ 失败: ${e.message}`);
  }
  
  // 测试访问 self
  console.log('\n🧪 测试 2: 访问 Service Worker 全局对象');
  try {
    const attachResult = await cdp.send('Target.attachToTarget', {
      targetId: swTarget.targetId,
      flatten: true,
    });
    
    const evalResult = await cdp.send('Runtime.evaluate', {
      expression: 'typeof self',
      returnByValue: true,
    });
    
    await cdp.send('Target.detachFromTarget', {
      sessionId: attachResult.sessionId,
    });
    
    console.log(`   typeof self = ${evalResult.result.value}`);
    console.log('   ✅ 成功');
  } catch (e) {
    console.log(`   ❌ 失败: ${e.message}`);
  }
  
  // 测试异步代码
  console.log('\n🧪 测试 3: 执行异步代码');
  try {
    const attachResult = await cdp.send('Target.attachToTarget', {
      targetId: swTarget.targetId,
      flatten: true,
    });
    
    const evalResult = await cdp.send('Runtime.evaluate', {
      expression: '(async () => { return "async result"; })()',
      returnByValue: true,
      awaitPromise: true,
    });
    
    await cdp.send('Target.detachFromTarget', {
      sessionId: attachResult.sessionId,
    });
    
    console.log(`   结果: ${evalResult.result.value}`);
    console.log('   ✅ 成功');
  } catch (e) {
    console.log(`   ❌ 失败: ${e.message}`);
  }
  
  console.log('\n✅ 所有测试完成');
  await browser.close();
}

test().catch(console.error);
