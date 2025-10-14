/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * 统一的工具注册中心
 * 
 * 所有 MCP 工具在此处统一导出，避免在不同服务器实现中重复导入
 * 这确保了所有传输模式（stdio、SSE、Streamable HTTP）都使用相同的工具集
 */

import * as browserInfoTools from './browser-info.js';
import * as consoleTools from './console.js';
import * as emulationTools from './emulation.js';
import * as extensionTools from './extension/index.js';
import * as extensionMessaging from './extension-messaging.js';
import * as extensionStorageWatch from './extension-storage-watch.js';
import * as inputTools from './input.js';
import * as networkTools from './network.js';
import * as pagesTools from './pages.js';
import * as performanceTools from './performance.js';
import * as screenshotTools from './screenshot.js';
import * as scriptTools from './script.js';
import * as snapshotTools from './snapshot.js';
import type {ToolDefinition} from './ToolDefinition.js';

/**
 * 所有可用工具的统一列表
 * 
 * 工具模块分类：
 * - browserInfo: 浏览器信息工具
 * - console: 控制台日志工具
 * - emulation: CPU/网络模拟工具
 * - extension: Chrome 扩展调试工具（核心）
 * - extensionMessaging: 扩展消息监控工具
 * - extensionStorageWatch: 扩展存储监控工具
 * - input: 页面交互工具（点击、填充等）
 * - network: 网络请求工具
 * - pages: 页面管理工具
 * - performance: 性能追踪工具
 * - screenshot: 截图工具
 * - script: 脚本执行工具
 * - snapshot: 页面快照工具
 */
export function getAllTools(): ToolDefinition[] {
  return [
    ...Object.values(browserInfoTools),
    ...Object.values(consoleTools),
    ...Object.values(emulationTools),
    ...Object.values(extensionTools),
    ...Object.values(extensionMessaging),
    ...Object.values(extensionStorageWatch),
    ...Object.values(inputTools),
    ...Object.values(networkTools),
    ...Object.values(pagesTools),
    ...Object.values(performanceTools),
    ...Object.values(screenshotTools),
    ...Object.values(scriptTools),
    ...Object.values(snapshotTools),
  ] as unknown as ToolDefinition[];
}

/**
 * 获取工具总数
 */
export function getToolCount(): number {
  return getAllTools().length;
}

/**
 * 获取工具名称列表
 */
export function getToolNames(): string[] {
  return getAllTools().map(tool => tool.name).sort();
}

/**
 * 按类别获取工具统计
 */
export function getToolStatsByCategory(): Record<string, number> {
  return {
    browserInfo: Object.keys(browserInfoTools).length,
    console: Object.keys(consoleTools).length,
    emulation: Object.keys(emulationTools).length,
    extension: Object.keys(extensionTools).length,
    extensionMessaging: Object.keys(extensionMessaging).length,
    extensionStorageWatch: Object.keys(extensionStorageWatch).length,
    input: Object.keys(inputTools).length,
    network: Object.keys(networkTools).length,
    pages: Object.keys(pagesTools).length,
    performance: Object.keys(performanceTools).length,
    screenshot: Object.keys(screenshotTools).length,
    script: Object.keys(scriptTools).length,
    snapshot: Object.keys(snapshotTools).length,
  };
}
