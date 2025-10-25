#!/usr/bin/env node
/**
 * 调试脚本：查看 Offscreen Document 的实际 CDP target type
 */

import puppeteer from 'puppeteer-core';

const EXTENSION_ID = 'pjeiljkehgiabmjmfjohffbihlopdabn';
const CDP_PORT = 9225;

async function main() {
  console.log('🔍 连接到 Chrome...');
  
  const browser = await puppeteer.connect({
    browserURL: `http://localhost:${CDP_PORT}`,
    defaultViewport: null,
  });

  console.log('✅ 已连接\n');

  // 获取所有 targets
  const targets = await browser.targets();
  
  console.log(`📋 找到 ${targets.length} 个 targets\n`);

  // 过滤扩展相关的 targets
  const extensionTargets = targets.filter(t => {
    const url = t.url();
    return url.includes(EXTENSION_ID);
  });

  console.log(`🎯 扩展相关 targets (${extensionTargets.length}):\n`);

  for (const target of extensionTargets) {
    const url = target.url();
    const type = target.type();
    
    console.log(`  Type: ${type}`);
    console.log(`  URL:  ${url}`);
    console.log(`  ID:   ${(target as any)._targetId}`);
    console.log('');
  }

  // 使用 CDP 直接查询
  console.log('📡 使用 CDP Target.getTargets 查询:\n');
  
  const client = await (browser as any)._connection.createSession((browser as any)._targetId);
  const result = await client.send('Target.getTargets');
  
  const cdpExtensionTargets = result.targetInfos.filter((t: any) => 
    t.url?.includes(EXTENSION_ID)
  );

  console.log(`🎯 CDP 扩展相关 targets (${cdpExtensionTargets.length}):\n`);

  for (const target of cdpExtensionTargets) {
    console.log(`  Type: ${target.type}`);
    console.log(`  URL:  ${target.url}`);
    console.log(`  ID:   ${target.targetId}`);
    console.log('');
  }

  await browser.disconnect();
  console.log('✅ 完成');
}

main().catch(console.error);
