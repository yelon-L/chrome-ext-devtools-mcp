#!/usr/bin/env node
/**
 * 仅测试 Helper Extension 生成器
 */

import fs from 'fs';
import path from 'path';

function log(message, color = 'white') {
  const colors = {
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
  };
  console.log(`${colors[color]}${message}\x1b[0m`);
}

async function test() {
  log('\n╔══════════════════════════════════════════╗', 'blue');
  log('║   Helper Extension Generator 测试        ║', 'blue');
  log('╚══════════════════════════════════════════╝\n', 'blue');

  try {
    // 1. 导入模块
    log('1️⃣  导入 HelperExtensionGenerator...', 'yellow');
    const {HelperExtensionGenerator} = await import('./build/src/extension/HelperExtensionGenerator.js');
    log('   ✅ 导入成功', 'green');

    // 2. 清理旧文件
    log('\n2️⃣  清理旧的临时文件...', 'yellow');
    const cleanedCount = await HelperExtensionGenerator.cleanupAllTempDirs();
    log(`   ✅ 清理了 ${cleanedCount} 个旧目录`, 'green');

    // 3. 生成新的 Helper Extension
    log('\n3️⃣  生成新的 Helper Extension...', 'yellow');
    const generator = new HelperExtensionGenerator();
    const helperPath = await generator.generateHelperExtension();
    log(`   ✅ 已生成: ${helperPath}`, 'green');

    // 4. 验证文件
    log('\n4️⃣  验证生成的文件...', 'yellow');
    const files = {
      'manifest.json': fs.existsSync(path.join(helperPath, 'manifest.json')),
      'background.js': fs.existsSync(path.join(helperPath, 'background.js')),
      'icon16.png': fs.existsSync(path.join(helperPath, 'icon16.png')),
      'icon48.png': fs.existsSync(path.join(helperPath, 'icon48.png')),
      'icon128.png': fs.existsSync(path.join(helperPath, 'icon128.png')),
    };

    for (const [file, exists] of Object.entries(files)) {
      if (exists) {
        log(`   ✅ ${file}`, 'green');
      } else {
        log(`   ❌ ${file} 缺失`, 'red');
      }
    }

    const allFilesExist = Object.values(files).every(Boolean);

    // 5. 读取并验证 manifest.json
    if (files['manifest.json']) {
      log('\n5️⃣  验证 manifest.json 内容...', 'yellow');
      const manifestContent = fs.readFileSync(path.join(helperPath, 'manifest.json'), 'utf-8');
      const manifest = JSON.parse(manifestContent);

      log(`   名称: ${manifest.name}`, 'green');
      log(`   版本: ${manifest.version}`, 'green');
      log(`   权限: ${manifest.permissions.join(', ')}`, 'green');
      log(`   Service Worker: ${manifest.background.service_worker}`, 'green');
    }

    // 6. 验证 background.js
    if (files['background.js']) {
      log('\n6️⃣  验证 background.js 内容...', 'yellow');
      const backgroundContent = fs.readFileSync(path.join(helperPath, 'background.js'), 'utf-8');

      const checks = {
        '包含 activateExtensionServiceWorker': backgroundContent.includes('activateExtensionServiceWorker'),
        '包含 chrome.debugger': backgroundContent.includes('chrome.debugger'),
        '包含 chrome.management': backgroundContent.includes('chrome.management'),
        '包含 onMessageExternal': backgroundContent.includes('onMessageExternal'),
      };

      for (const [check, passed] of Object.entries(checks)) {
        log(`   ${passed ? '✅' : '❌'} ${check}`, passed ? 'green' : 'red');
      }
    }

    // 7. 最终结果
    log('\n╔══════════════════════════════════════════╗', 'blue');
    log('║   测试结果                                ║', 'blue');
    log('╚══════════════════════════════════════════╝\n', 'blue');

    if (allFilesExist) {
      log('🎉 所有测试通过！', 'green');
      log('✅ Helper Extension 生成功能正常', 'green');
      log(`✅ 生成路径: ${helperPath}`, 'green');
      log('\n下一步：测试在浏览器中加载', 'yellow');
      process.exit(0);
    } else {
      log('❌ 部分测试失败', 'red');
      process.exit(1);
    }

  } catch (error) {
    log(`\n❌ 测试失败: ${error.message}`, 'red');
    console.error(error);
    process.exit(1);
  }
}

test();
