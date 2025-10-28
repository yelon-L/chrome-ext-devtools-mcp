#!/usr/bin/env node
/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

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
    console.log(`  ID:   ${(target as {_targetId?: string})._targetId}`);
    console.log('');
  }

  // 使用 CDP 直接查询
  console.log('📡 使用 CDP Target.getTargets 查询:\n');

  const browserWithConnection = browser as unknown as {
    _connection: {createSession: (targetId: string) => Promise<unknown>};
    _targetId: string;
  };
  const client = (await browserWithConnection._connection.createSession(
    browserWithConnection._targetId,
  )) as {send: (method: string) => Promise<{targetInfos: unknown[]}>};
  const result = await client.send('Target.getTargets');

  const cdpExtensionTargets = result.targetInfos.filter((t: unknown) => {
    const typedTarget = t as {url?: string};
    return typedTarget.url?.includes(EXTENSION_ID);
  });

  console.log(`🎯 CDP 扩展相关 targets (${cdpExtensionTargets.length}):\n`);

  for (const target of cdpExtensionTargets) {
    const typedTarget = target as {type: string; url: string; targetId: string};
    console.log(`  Type: ${typedTarget.type}`);
    console.log(`  URL:  ${typedTarget.url}`);
    console.log(`  ID:   ${typedTarget.targetId}`);
    console.log('');
  }

  await browser.disconnect();
  console.log('✅ 完成');
}

main().catch(console.error);
