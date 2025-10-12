#!/usr/bin/env tsx
/**
 * 诊断 reloadExtension 问题
 * Service Worker 已激活，但 chrome.runtime.reload() 不可用
 */

import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import path from 'path';
import {fileURLToPath} from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function diagnose() {
  console.log('🔍 诊断 reloadExtension 问题\n');

  const serverPath = path.join(__dirname, 'build/src/index.js');
  
  const transport = new StdioClientTransport({
    command: 'node',
    args: [serverPath, '--browser-url', 'http://localhost:9222'],
  });

  const client = new Client(
    {name: 'diagnose-client', version: '1.0.0'},
    {capabilities: {}}
  );

  try {
    await client.connect(transport);
    const extensionId = 'pjeiljkehgiabmjmfjohffbihlopdabn';

    console.log('步骤 1: 检查 Service Worker 状态');
    console.log('━'.repeat(60));
    
    const detailsResult = await client.callTool({
      name: 'get_extension_details',
      arguments: {extensionId},
    });

    const detailsText = detailsResult.content
      ?.filter((c: any) => c.type === 'text')
      .map((c: any) => c.text)
      .join('\n') || '';

    console.log(detailsText.substring(0, 600));
    console.log('\n');

    console.log('步骤 2: 测试 chrome.runtime 可用性');
    console.log('━'.repeat(60));

    const tests = [
      {name: 'chrome 对象', code: 'typeof chrome'},
      {name: 'chrome.runtime', code: 'typeof chrome.runtime'},
      {name: 'chrome.runtime.reload', code: 'typeof chrome.runtime?.reload'},
      {name: 'chrome.runtime.id', code: 'chrome.runtime?.id'},
      {name: 'chrome.runtime.getManifest', code: 'typeof chrome.runtime?.getManifest'},
    ];

    for (const test of tests) {
      try {
        const result = await client.callTool({
          name: 'evaluate_in_extension',
          arguments: {
            extensionId,
            code: test.code,
            awaitPromise: true,
          },
        });

        const text = result.content
          ?.filter((c: any) => c.type === 'text')
          .map((c: any) => c.text)
          .join('\n') || '';

        const resultMatch = text.match(/Result: (.+)/);
        const resultValue = resultMatch ? resultMatch[1] : text;

        console.log(`✓ ${test.name}: ${resultValue.substring(0, 50)}`);
      } catch (error) {
        console.log(`✗ ${test.name}: 错误 - ${error}`);
      }
    }

    console.log('\n步骤 3: 尝试不同的 reload 方法');
    console.log('━'.repeat(60));

    // 方法 1: 直接调用 reload
    console.log('\n方法 1: chrome.runtime.reload()');
    try {
      const result1 = await client.callTool({
        name: 'evaluate_in_extension',
        arguments: {
          extensionId,
          code: 'chrome.runtime.reload(); "reload called"',
          awaitPromise: false,
        },
      });

      const text1 = result1.content
        ?.filter((c: any) => c.type === 'text')
        .map((c: any) => c.text)
        .join('\n') || '';

      console.log(`结果: ${text1.substring(0, 200)}`);
    } catch (error) {
      console.log(`错误: ${error}`);
    }

    // 方法 2: 使用 chrome.management
    console.log('\n方法 2: chrome.management.setEnabled (toggle)');
    try {
      const result2 = await client.callTool({
        name: 'evaluate_in_extension',
        arguments: {
          extensionId,
          code: `
            if (chrome.management && chrome.management.setEnabled) {
              chrome.management.setEnabled('${extensionId}', false, () => {
                setTimeout(() => {
                  chrome.management.setEnabled('${extensionId}', true);
                }, 100);
              });
              "toggle called"
            } else {
              "chrome.management not available"
            }
          `,
          awaitPromise: true,
        },
      });

      const text2 = result2.content
        ?.filter((c: any) => c.type === 'text')
        .map((c: any) => c.text)
        .join('\n') || '';

      console.log(`结果: ${text2.substring(0, 200)}`);
    } catch (error) {
      console.log(`错误: ${error}`);
    }

    // 方法 3: 检查权限
    console.log('\n方法 3: 检查权限');
    try {
      const result3 = await client.callTool({
        name: 'evaluate_in_extension',
        arguments: {
          extensionId,
          code: `
            const manifest = chrome.runtime.getManifest();
            JSON.stringify({
              permissions: manifest.permissions || [],
              host_permissions: manifest.host_permissions || [],
              hasManagement: !!chrome.management
            }, null, 2)
          `,
          awaitPromise: true,
        },
      });

      const text3 = result3.content
        ?.filter((c: any) => c.type === 'text')
        .map((c: any) => c.text)
        .join('\n') || '';

      console.log(`结果:\n${text3}`);
    } catch (error) {
      console.log(`错误: ${error}`);
    }

    console.log('\n步骤 4: 分析问题');
    console.log('━'.repeat(60));
    console.log(`
可能的原因：
1. Service Worker 上下文中 chrome.runtime.reload() 不可用
2. 需要特定的权限（management）
3. CDP evaluateInExtensionContext 的执行环境限制
4. 扩展配置问题

建议的解决方案：
1. 使用 chrome.management.setEnabled() toggle 方法
2. 或者使用 CDP 命令直接操作扩展
3. 或者提供清晰的错误提示和手动步骤
    `);

    await client.close();
  } catch (error) {
    console.error('诊断失败:', error);
  }
}

diagnose();
