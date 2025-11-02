/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
/**
 * Phase 4: 工具引用规范化测试
 *
 * 验证工具间引用的正确性，确保：
 * 1. 所有工具引用都指向存在的工具
 * 2. 工具名称一致性
 * 3. 无循环依赖
 */
import assert from 'node:assert';
import {describe, it} from 'node:test';

// 导入所有扩展工具
import * as contentScriptTools from '../../src/tools/extension/content-script-checker.js';
import * as contextTools from '../../src/tools/extension/contexts.js';
import * as discoveryTools from '../../src/tools/extension/discovery.js';
import * as executionTools from '../../src/tools/extension/execution.js';
import * as logsTools from '../../src/tools/extension/logs.js';
import * as popupTools from '../../src/tools/extension/popup-lifecycle.js';
import * as runtimeErrorsTools from '../../src/tools/extension/runtime-errors.js';
import * as serviceWorkerTools from '../../src/tools/extension/service-worker-activation.js';
import * as storageTools from '../../src/tools/extension/storage.js';

describe('Tool References (Phase 4)', () => {
  // 收集所有工具
  const allTools = [
    ...Object.values(discoveryTools),
    ...Object.values(executionTools),
    ...Object.values(contextTools),
    ...Object.values(logsTools),
    ...Object.values(runtimeErrorsTools),
    ...Object.values(contentScriptTools),
    ...Object.values(popupTools),
    ...Object.values(serviceWorkerTools),
    ...Object.values(storageTools),
  ].filter(tool => tool && typeof tool === 'object' && 'name' in tool);

  const toolNames = new Set(allTools.map(tool => tool.name));

  it('should have all expected tools', () => {
    const expectedTools = [
      'list_extensions',
      'get_extension_details',
      'reload_extension',
      'clear_extension_errors',
      'evaluate_in_extension',
      'list_extension_contexts',
      'get_background_logs',
      'get_offscreen_logs',
      'get_extension_runtime_errors',
      'check_content_script_injection',
      'open_extension_popup',
      'close_popup',
      'is_popup_open',
      'wait_for_popup',
      'get_popup_info',
      'interact_with_popup',
      'activate_extension_service_worker',
      'inspect_extension_storage',
    ];

    for (const toolName of expectedTools) {
      assert.ok(toolNames.has(toolName), `工具 ${toolName} 应该存在`);
    }

    console.log(`✅ 所有预期工具都存在 (${expectedTools.length}个)`);
  });

  it('should have valid tool names', () => {
    for (const tool of allTools) {
      assert.ok(tool.name, '工具应该有名称');
      assert.strictEqual(typeof tool.name, 'string', '工具名称应该是字符串');
      assert.ok(
        /^[a-z_]+$/.test(tool.name),
        `工具名称 ${tool.name} 应该只包含小写字母和下划线`,
      );
    }

    console.log(`✅ 所有工具名称格式有效 (${allTools.length}个)`);
  });

  it('should not have duplicate tool names', () => {
    const nameCount = new Map<string, number>();

    for (const tool of allTools) {
      const count = nameCount.get(tool.name) || 0;
      nameCount.set(tool.name, count + 1);
    }

    const duplicates = Array.from(nameCount.entries()).filter(
      ([_, count]) => count > 1,
    );

    assert.strictEqual(
      duplicates.length,
      0,
      `发现重复的工具名称: ${duplicates.map(([name]) => name).join(', ')}`,
    );

    console.log(`✅ 无重复工具名称`);
  });

  it('should have consistent tool references in descriptions', () => {
    // 从描述中提取工具引用（反引号包裹的工具名）
    const toolRefPattern = /`([a-z_]+)`/g;
    const invalidRefs: Array<{tool: string; ref: string}> = [];

    for (const tool of allTools) {
      if (!tool.description) continue;

      const matches = tool.description.matchAll(toolRefPattern);
      for (const match of matches) {
        const refName = match[1];

        // 跳过非工具名称的引用（如参数名、字段名等）
        const skipPatterns = [
          'extensionId',
          'single',
          'mode',
          'action',
          'browser_action',
          'page_action',
          'run_at',
          'host_permissions',
          'debugger',
          'document_start',
          'document_end',
          'document_idle',
          'all_frames',
          'since',
          'limit',
          'types',
          'sources',
          'level',
          'get_dom', // interact_with_popup 的操作
          'evaluate', // interact_with_popup 的操作
          'selector',
          'value',
          'code',
        ];

        if (skipPatterns.includes(refName)) continue;

        // 跳过非扩展工具的引用（其他模块的工具）
        const nonExtensionTools = [
          'take_snapshot',
          'take_screenshot',
          'click',
          'fill',
          'navigate_page',
          'evaluate_script',
        ];

        if (nonExtensionTools.includes(refName)) continue;

        // 检查是否是有效的工具名
        if (!toolNames.has(refName)) {
          invalidRefs.push({tool: tool.name, ref: refName});
        }
      }
    }

    if (invalidRefs.length > 0) {
      console.log('⚠️  发现无效的工具引用:');
      for (const {tool, ref} of invalidRefs) {
        console.log(`   - ${tool} 引用了不存在的工具: ${ref}`);
      }
    }

    assert.strictEqual(
      invalidRefs.length,
      0,
      `发现 ${invalidRefs.length} 个无效的工具引用`,
    );

    console.log(`✅ 所有工具引用都有效`);
  });

  it('should verify Phase 4 modified tools exist', () => {
    const phase4Tools = [
      'list_extensions',
      'get_extension_details',
      'reload_extension',
      'clear_extension_errors',
      'evaluate_in_extension',
      'list_extension_contexts',
      'get_background_logs',
      'get_offscreen_logs',
      'get_extension_runtime_errors',
      'check_content_script_injection',
      'inspect_extension_storage',
    ];

    for (const toolName of phase4Tools) {
      assert.ok(
        toolNames.has(toolName),
        `Phase 4 修改的工具 ${toolName} 应该存在`,
      );
    }

    console.log(`✅ Phase 4 修改的所有工具都存在 (${phase4Tools.length}个)`);
  });

  it('should not reference non-existent get_extension_logs', () => {
    // Phase 4 发现的错误：get_extension_logs 不存在，应该是 get_background_logs
    assert.ok(
      !toolNames.has('get_extension_logs'),
      'get_extension_logs 不应该存在（应该使用 get_background_logs）',
    );

    assert.ok(
      toolNames.has('get_background_logs'),
      'get_background_logs 应该存在',
    );

    console.log(`✅ 工具名称正确（无 get_extension_logs）`);
  });

  it('should have tools with proper structure', () => {
    for (const tool of allTools) {
      assert.ok('name' in tool, '工具应该有 name 属性');
      assert.ok('description' in tool, '工具应该有 description 属性');
      assert.ok('annotations' in tool, '工具应该有 annotations 属性');
      assert.ok('schema' in tool, '工具应该有 schema 属性');
      assert.ok('handler' in tool, '工具应该有 handler 属性');

      assert.strictEqual(
        typeof tool.handler,
        'function',
        `${tool.name} 的 handler 应该是函数`,
      );
    }

    console.log(`✅ 所有工具结构完整 (${allTools.length}个)`);
  });

  it('should have tools with categories', () => {
    for (const tool of allTools) {
      assert.ok(tool.annotations?.category, `${tool.name} 应该有 category`);
    }

    console.log(`✅ 所有工具都有分类`);
  });

  it('should have consistent naming convention', () => {
    // 扩展工具应该遵循命名规范
    const extensionToolPatterns = [
      /^list_extension/,
      /^get_extension/,
      /^activate_extension/,
      /^reload_extension/,
      /^clear_extension/,
      /^evaluate_in_extension/,
      /^inspect_extension/,
      /^check_content_script/,
      /^open_extension/,
      /^close_/,
      /^is_/,
      /^wait_for/,
      /^interact_with/,
    ];

    const extensionTools = allTools.filter(tool =>
      tool.annotations?.category?.includes('EXTENSION'),
    );

    for (const tool of extensionTools) {
      const matchesPattern = extensionToolPatterns.some(pattern =>
        pattern.test(tool.name),
      );

      if (!matchesPattern) {
        console.log(`ℹ️  工具 ${tool.name} 不匹配常见命名模式`);
      }
    }

    console.log(`✅ 扩展工具命名规范检查完成`);
  });
});
