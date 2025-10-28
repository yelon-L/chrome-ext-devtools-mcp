/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * 统一的错误报告工具
 * 
 * 第一性原理：工具应该返回信息，而不是抛出异常
 * - 异常（Exception）：程序无法继续执行的错误（如参数类型错误）
 * - 失败（Failure）：操作未能达到目标，但可以处理和恢复
 * 
 * 错误详细程度：
 * - 开发环境：显示技术细节（stack trace等）
 * - 生产环境：仅显示用户友好消息
 */

import {errorVerbosityConfig, formatErrorForUser} from '../../config/ErrorVerbosity.js';
import type {Response} from '../ToolDefinition.js';

/**
 * 错误类型
 */
export enum ErrorType {
  /** 资源未找到（如扩展、页面不存在） */
  NOT_FOUND = 'Not Found',
  /** 前置条件不满足（如Service Worker未激活） */
  PRECONDITION_FAILED = 'Precondition Failed',
  /** 操作超时 */
  TIMEOUT = 'Timeout',
  /** 权限不足 */
  PERMISSION_DENIED = 'Permission Denied',
  /** 资源不可用（如manifest数据加载中） */
  UNAVAILABLE = 'Unavailable',
  /** 操作失败 */
  OPERATION_FAILED = 'Operation Failed',
}

/**
 * 错误严重程度
 */
export enum ErrorSeverity {
  /** 错误：操作失败 */
  ERROR = '❌',
  /** 警告：可能有问题 */
  WARNING = '⚠️',
  /** 信息：正常状态说明 */
  INFO = 'ℹ️',
}

/**
 * 错误报告选项
 */
export interface ErrorReportOptions {
  /** 错误类型 */
  type: ErrorType;
  /** 错误严重程度 */
  severity?: ErrorSeverity;
  /** 错误消息 */
  message: string;
  /** 详细信息（可选） */
  details?: Record<string, any>;
  /** 可能的原因 */
  causes?: string[];
  /** 建议的解决方案 */
  suggestions?: string[];
  /** 相关的命令或工具 */
  relatedTools?: string[];
}

/**
 * 扩展未找到错误
 */
export function reportExtensionNotFound(
  response: Response,
  extensionId: string,
  availableExtensions: Array<{id: string; name: string; version: string; enabled: boolean}>
): void {
  response.appendResponseLine(`${ErrorSeverity.ERROR} **${ErrorType.NOT_FOUND}**: Extension not found\n`);
  response.appendResponseLine(`**Requested ID**: \`${extensionId}\`\n`);
  
  if (availableExtensions.length === 0) {
    response.appendResponseLine('⚠️ **No extensions installed** in this Chrome instance\n');
    response.appendResponseLine('**Suggestions**:');
    response.appendResponseLine('1. Install the extension in Chrome');
    response.appendResponseLine('2. Make sure Chrome is connected via remote debugging');
    response.appendResponseLine('3. Check if the extension is loaded in chrome://extensions\n');
  } else {
    response.appendResponseLine(`**Available extensions** (${availableExtensions.length} total):\n`);
    
    availableExtensions.forEach(ext => {
      const status = ext.enabled ? '✅ Enabled' : '❌ Disabled';
      response.appendResponseLine(`**${ext.name}** (${status})`);
      response.appendResponseLine(`  - ID: \`${ext.id}\``);
      response.appendResponseLine(`  - Version: ${ext.version}\n`);
    });
    
    // 智能建议：查找相似的扩展ID
    const similar = availableExtensions.find(ext => 
      ext.id.startsWith(extensionId.substring(0, 8))
    );
    
    if (similar) {
      response.appendResponseLine(`💡 **Did you mean**: \`${similar.id}\` (${similar.name})?\n`);
    }
  }
  
  response.appendResponseLine('**Related tools**:');
  response.appendResponseLine('- `list_extensions` - See all installed extensions');
  response.appendResponseLine('- `get_extension_details` - Get detailed info about an extension');
}

/**
 * 通用错误报告（支持详细程度配置）
 */
export function reportGenericError(
  response: Response,
  error: unknown,
  operationName: string,
  context?: Record<string, any>
): void {
  const userMessage = `Unable to ${operationName}. The operation failed or encountered an error.`;
  const lines = formatErrorForUser(error, userMessage, context);
  
  lines.forEach(line => response.appendResponseLine(line));
}

/**
 * 背景上下文未找到错误
 */
export function reportNoBackgroundContext(
  response: Response,
  extensionId: string,
  extension?: {
    name: string;
    manifestVersion: number;
    serviceWorkerStatus?: string;
  }
): void {
  response.appendResponseLine(`${ErrorSeverity.ERROR} **${ErrorType.PRECONDITION_FAILED}**: Background context not available\n`);
  
  if (extension) {
    response.appendResponseLine(`**Extension**: ${extension.name}`);
    response.appendResponseLine(`**Manifest Version**: MV${extension.manifestVersion}`);
    
    if (extension.serviceWorkerStatus) {
      response.appendResponseLine(`**Service Worker Status**: ${extension.serviceWorkerStatus}\n`);
    }
  }
  
  response.appendResponseLine('\n**Possible causes**:');
  response.appendResponseLine('1. Service Worker is inactive (MV3 extensions sleep after ~30s)');
  response.appendResponseLine('2. Background page has crashed');
  response.appendResponseLine('3. Extension was just installed/updated and not fully loaded');
  response.appendResponseLine('4. Extension is disabled\n');
  
  response.appendResponseLine('**Recommended actions**:');
  
  if (extension?.manifestVersion === 3) {
    response.appendResponseLine('1. **Activate Service Worker**: `activate_extension_service_worker`');
    response.appendResponseLine('   - MV3 Service Workers become inactive after inactivity');
    response.appendResponseLine('   - This tool wakes them up automatically');
  }
  
  response.appendResponseLine('2. **Check contexts**: `list_extension_contexts`');
  response.appendResponseLine('   - Shows all active contexts (background, popup, content scripts)');
  response.appendResponseLine('3. **Diagnose errors**: `diagnose_extension_errors`');
  response.appendResponseLine('   - Checks for crash logs and startup failures');
  response.appendResponseLine('4. **Verify status**: `list_extensions`');
  response.appendResponseLine('   - Confirms extension is enabled and running');
}

/**
 * 超时错误
 */
export function reportTimeout(
  response: Response,
  operationName: string,
  elapsed: number,
  limit: number
): void {
  response.appendResponseLine(`⏱️ **${ErrorType.TIMEOUT}**: ${operationName} exceeded time limit\n`);
  response.appendResponseLine(`**Elapsed Time**: ${elapsed}ms`);
  response.appendResponseLine(`**Timeout Limit**: ${limit}ms`);
  response.appendResponseLine(`**Exceeded By**: ${elapsed - limit}ms\n`);
  
  response.appendResponseLine('**Possible causes**:');
  response.appendResponseLine('1. Operation is taking longer than expected (may still complete)');
  response.appendResponseLine('2. Extension is unresponsive or crashed');
  response.appendResponseLine('3. Chrome DevTools connection is slow');
  response.appendResponseLine('4. System is under heavy load\n');
  
  response.appendResponseLine('**Suggestions**:');
  response.appendResponseLine('1. Wait a few more seconds - operation may still complete');
  response.appendResponseLine('2. Check extension status with `list_extensions`');
  response.appendResponseLine('3. Try the operation again without the timeout option');
  response.appendResponseLine('4. Check system resources (CPU, memory)');
}

/**
 * 资源不可用错误
 */
export function reportResourceUnavailable(
  response: Response,
  resourceType: string,
  resourceId: string,
  reason?: string
): void {
  response.appendResponseLine(`${ErrorSeverity.WARNING} **${ErrorType.UNAVAILABLE}**: ${resourceType} not available\n`);
  response.appendResponseLine(`**Extension ID**: ${resourceId}\n`);
  
  if (reason) {
    response.appendResponseLine(`**Reason**: ${reason}\n`);
  }
  
  // 针对 Manifest 提供更具体的引导
  if (resourceType === 'Manifest') {
    response.appendResponseLine('**Why this happens**:');
    response.appendResponseLine('Extension manifest data is loaded asynchronously from Chrome. On first access, the data may not be ready yet.\n');
    
    response.appendResponseLine('**What you can do right now**:');
    response.appendResponseLine('1. ✅ Use `get_extension_details` - Shows basic extension info (always works)');
    response.appendResponseLine('2. ✅ Use `list_extensions` - Lists all extensions with key information');
    response.appendResponseLine('3. ✅ Use `diagnose_extension_errors` - Check extension health');
    response.appendResponseLine('4. ⏳ Wait 2-3 seconds and try `inspect_extension_manifest` again\n');
    
    response.appendResponseLine('**Alternative approach**:');
    response.appendResponseLine('```');
    response.appendResponseLine('# Step 1: Get basic info (works immediately)');
    response.appendResponseLine(`get_extension_details(extensionId="${resourceId}")`);
    response.appendResponseLine('');
    response.appendResponseLine('# Step 2: Wait a moment, then try detailed analysis');
    response.appendResponseLine(`inspect_extension_manifest(extensionId="${resourceId}")`);
    response.appendResponseLine('```');
  } else {
    // 通用建议（用于其他资源类型）
    response.appendResponseLine('**Possible causes**:');
    response.appendResponseLine('1. Resource is being loaded or initialized');
    response.appendResponseLine('2. Chrome DevTools connection issue');
    response.appendResponseLine('3. Data format error or parsing failure');
    response.appendResponseLine('4. Temporary network or system issue\n');
    
    response.appendResponseLine('**Suggestions**:');
    response.appendResponseLine('1. Wait a moment and try again');
    response.appendResponseLine('2. Refresh the extension or page');
    response.appendResponseLine('3. Check Chrome DevTools connection');
    response.appendResponseLine('4. Verify the resource exists and is accessible');
  }
}

/**
 * 通用错误报告
 */
export function reportError(
  response: Response,
  options: ErrorReportOptions
): void {
  const severity = options.severity || ErrorSeverity.ERROR;
  
  response.appendResponseLine(`${severity} **${options.type}**\n`);
  response.appendResponseLine(`**Message**: ${options.message}\n`);
  
  // 详细信息
  if (options.details && Object.keys(options.details).length > 0) {
    response.appendResponseLine('**Details**:');
    for (const [key, value] of Object.entries(options.details)) {
      response.appendResponseLine(`- ${key}: ${value}`);
    }
    response.appendResponseLine('');
  }
  
  // 可能的原因
  if (options.causes && options.causes.length > 0) {
    response.appendResponseLine('**Possible causes**:');
    options.causes.forEach((cause, index) => {
      response.appendResponseLine(`${index + 1}. ${cause}`);
    });
    response.appendResponseLine('');
  }
  
  // 建议的解决方案
  if (options.suggestions && options.suggestions.length > 0) {
    response.appendResponseLine('**Suggestions**:');
    options.suggestions.forEach((suggestion, index) => {
      response.appendResponseLine(`${index + 1}. ${suggestion}`);
    });
    response.appendResponseLine('');
  }
  
  // 相关工具
  if (options.relatedTools && options.relatedTools.length > 0) {
    response.appendResponseLine('**Related tools**:');
    options.relatedTools.forEach(tool => {
      response.appendResponseLine(`- \`${tool}\``);
    });
  }
}

/**
 * 无对话框信息
 */
export function reportNoDialog(response: Response): void {
  response.appendResponseLine(`${ErrorSeverity.INFO} **No open dialog found**\n`);
  response.appendResponseLine('There is currently no active browser dialog to handle.\n');
  
  response.appendResponseLine('**Browser dialogs include**:');
  response.appendResponseLine('- `alert()` - Simple message');
  response.appendResponseLine('- `confirm()` - Yes/No question');
  response.appendResponseLine('- `prompt()` - Text input');
  response.appendResponseLine('- `beforeunload` - Page leave confirmation\n');
  
  response.appendResponseLine('**When dialogs appear**:');
  response.appendResponseLine('1. They block page interaction');
  response.appendResponseLine('2. You must handle them before continuing');
  response.appendResponseLine('3. Use this tool to accept or dismiss them');
}

/**
 * 包装工具执行，捕获预期的失败并转换为信息返回
 */
export async function withErrorHandling<T>(
  response: Response,
  operation: () => Promise<T>,
  errorHandlers: Record<string, (error: Error) => void>
): Promise<T | null> {
  try {
    return await operation();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    
    // 查找匹配的错误处理器
    for (const [pattern, handler] of Object.entries(errorHandlers)) {
      if (message.includes(pattern)) {
        handler(error as Error);
        return null;
      }
    }
    
    // 未知错误，使用通用报告
    reportError(response, {
      type: ErrorType.OPERATION_FAILED,
      message: message,
      suggestions: [
        'Check the error message for details',
        'Try the operation again',
        'Contact support if the problem persists',
      ],
    });
    
    return null;
  }
}
