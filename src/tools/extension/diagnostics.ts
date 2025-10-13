/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * 扩展错误诊断工具
 * 
 * 提供一键诊断扩展健康状况的功能
 */

import z from 'zod';

import {ToolCategories} from '../categories.js';
import {defineTool} from '../ToolDefinition.js';

export const diagnoseExtensionErrors = defineTool({
  name: 'diagnose_extension_errors',
  description: `Comprehensive health check and error diagnosis for Chrome extensions.

**Purpose**: One-click diagnostic scan to identify and analyze all extension errors and issues.

**What it analyzes**:
- Error messages across all contexts (background, content scripts, popup, devtools)
- JavaScript runtime errors and exceptions  
- Chrome API errors (permissions, API failures, quota exceeded)
- Service Worker activation failures (MV3 extensions)
- Common misconfigurations and anti-patterns

**Output includes**:
- Error classification by type (API, runtime, permission, etc.) and severity
- Error frequency statistics and patterns
- Actionable solutions for each detected issue
- Overall health score (0-100) with improvement recommendations

**When to use**: This should be your FIRST tool when debugging extension problems or investigating user reports.

**Example**: diagnose_extension_errors with extensionId="abcd..." finds 3 permission errors and suggests adding "tabs" permission to manifest.`,
  annotations: {
    category: ToolCategories.EXTENSION_DEBUGGING,
    readOnlyHint: true,
  },
  schema: {
    extensionId: z
      .string()
      .regex(/^[a-z]{32}$/)
      .describe('Extension ID to diagnose. Get this from list_extensions.'),
    timeRange: z
      .number()
      .positive()
      .optional()
      .describe('Time range in minutes to analyze errors. Default is 10 minutes.'),
    includeWarnings: z
      .boolean()
      .optional()
      .describe('Include warning-level messages in diagnosis. Default is false.'),
  },
  handler: async (request, response, context) => {
    const {
      extensionId,
      timeRange = 10,
      includeWarnings = false,
    } = request.params;

    try {
      // 1. 获取扩展详情
      const extensions = await context.getExtensions();
      const extension = extensions.find(ext => ext.id === extensionId);

      if (!extension) {
        throw new Error(`Extension ${extensionId} not found`);
      }

      response.appendResponseLine(`# Extension Health Diagnosis\n`);
      response.appendResponseLine(`**Extension**: ${extension.name} (v${extension.version})`);
      response.appendResponseLine(`**ID**: ${extensionId}`);
      response.appendResponseLine(`**Manifest Version**: ${extension.manifestVersion}`);
      response.appendResponseLine(`**Status**: ${extension.enabled ? '✅ Enabled' : '❌ Disabled'}\n`);

      // 2. 收集错误日志
      const sinceTime = Date.now() - timeRange * 60 * 1000;
      const logsResult = await context.getExtensionLogs(extensionId, {
        capture: true,
        duration: 5000,
        includeStored: true,
      });

      const logs = logsResult.logs.filter(log => log.timestamp >= sinceTime);
      
      // 过滤错误和警告
      const levels = includeWarnings ? ['error', 'warn'] : ['error'];
      const errorLogs = logs.filter(log => levels.includes(log.level || 'log'));

      response.appendResponseLine(`## Error Summary (Last ${timeRange} minutes)\n`);
      
      if (errorLogs.length === 0) {
        response.appendResponseLine('✅ **No errors detected!**\n');
        response.appendResponseLine('The extension appears to be running correctly.');
        
        // 检查其他潜在问题
        await checkPotentialIssues(extension, context, response);
        response.setIncludePages(true);
        return;
      }

      response.appendResponseLine(`**Total Issues Found**: ${errorLogs.length}`);
      
      // 3. 按类型分类错误
      const errorsByType = classifyErrors(errorLogs);
      
      response.appendResponseLine(`\n### Error Breakdown\n`);
      for (const [type, errors] of Object.entries(errorsByType)) {
        const icon = getErrorIcon(type);
        response.appendResponseLine(`- ${icon} **${type}**: ${errors.length} occurrences`);
      }

      // 4. 显示最频繁的错误
      response.appendResponseLine(`\n## Most Frequent Errors\n`);
      const errorFrequency = getErrorFrequency(errorLogs);
      const topErrors = errorFrequency.slice(0, 5);

      topErrors.forEach((item, index) => {
        response.appendResponseLine(`### ${index + 1}. Error (${item.count} times)`);
        response.appendResponseLine(`**Message**: ${item.message}`);
        if (item.source) {
          response.appendResponseLine(`**Source**: ${item.source}`);
        }
        response.appendResponseLine('');
      });

      // 5. 错误详情
      response.appendResponseLine(`## Detailed Error Log\n`);
      errorLogs.slice(0, 20).forEach(log => {
        const time = new Date(log.timestamp).toLocaleTimeString();
        const icon = log.level === 'error' ? '❌' : '⚠️';
        
        response.appendResponseLine(`### ${icon} ${time}`);
        response.appendResponseLine(`**Level**: ${log.level?.toUpperCase()}`);
        if (log.source) {
          response.appendResponseLine(`**Source**: ${log.source}`);
        }
        response.appendResponseLine(`**Message**: ${log.text}`);
        
        if (log.stackTrace) {
          response.appendResponseLine(`<details><summary>Stack Trace</summary>\n\n\`\`\`\n${log.stackTrace}\n\`\`\`\n</details>`);
        }
        
        response.appendResponseLine('');
      });

      if (errorLogs.length > 20) {
        response.appendResponseLine(`\n*...and ${errorLogs.length - 20} more errors*\n`);
      }

      // 6. 诊断建议
      response.appendResponseLine(`## 🔧 Diagnostic Recommendations\n`);
      const recommendations = generateRecommendations(extension, errorsByType, errorLogs);
      recommendations.forEach(rec => {
        response.appendResponseLine(`### ${rec.icon} ${rec.title}`);
        response.appendResponseLine(rec.description);
        if (rec.solution) {
          response.appendResponseLine(`**Solution**: ${rec.solution}`);
        }
        response.appendResponseLine('');
      });

      // 7. 健康评分
      const healthScore = calculateHealthScore(errorLogs.length, timeRange);
      response.appendResponseLine(`## Health Score: ${getHealthScoreEmoji(healthScore)} ${healthScore}/100\n`);
      response.appendResponseLine(getHealthScoreDescription(healthScore));

      response.setIncludePages(true);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to diagnose extension: ${message}`);
    }
  },
});

/**
 * 检查其他潜在问题（即使没有错误日志）
 */
async function checkPotentialIssues(
  extension: any,
  context: any,
  response: any,
): Promise<void> {
  response.appendResponseLine(`\n## Potential Issues Check\n`);
  
  // 检查 Service Worker 状态（MV3）
  if (extension.manifestVersion === 3) {
    if (extension.serviceWorkerStatus === 'inactive') {
      response.appendResponseLine('⚠️ **Service Worker Inactive**');
      response.appendResponseLine('The Service Worker is not running. This may cause functionality issues.');
      response.appendResponseLine('**Solution**: Use `activate_extension_service_worker` to activate it.\n');
    } else if (extension.serviceWorkerStatus === 'active') {
      response.appendResponseLine('✅ Service Worker is active\n');
    }
  }

  // 检查上下文
  try {
    const contexts = await context.getExtensionContexts(extension.id);
    if (contexts.length === 0) {
      response.appendResponseLine('⚠️ **No Active Contexts**');
      response.appendResponseLine('Extension has no active contexts. It may not be functioning.\n');
    } else {
      response.appendResponseLine(`✅ ${contexts.length} active context(s)\n`);
    }
  } catch (e) {
    // Ignore context check errors
  }
}

/**
 * 按类型分类错误
 */
function classifyErrors(logs: any[]): Record<string, any[]> {
  const classified: Record<string, any[]> = {
    'JavaScript Errors': [],
    'Chrome API Errors': [],
    'Permission Errors': [],
    'Network Errors': [],
    'Other Errors': [],
  };

  for (const log of logs) {
    const message = log.text || '';
    
    if (message.includes('Uncaught') || message.includes('SyntaxError') || message.includes('TypeError')) {
      classified['JavaScript Errors'].push(log);
    } else if (message.includes('chrome.') || message.includes('Extension')) {
      classified['Chrome API Errors'].push(log);
    } else if (message.includes('permission') || message.includes('not allowed')) {
      classified['Permission Errors'].push(log);
    } else if (message.includes('fetch') || message.includes('network') || message.includes('CORS')) {
      classified['Network Errors'].push(log);
    } else {
      classified['Other Errors'].push(log);
    }
  }

  // 移除空分类
  return Object.fromEntries(
    Object.entries(classified).filter(([_, errors]) => errors.length > 0)
  );
}

/**
 * 获取错误类型图标
 */
function getErrorIcon(type: string): string {
  const icons: Record<string, string> = {
    'JavaScript Errors': '🐛',
    'Chrome API Errors': '🔌',
    'Permission Errors': '🔒',
    'Network Errors': '🌐',
    'Other Errors': '❓',
  };
  return icons[type] || '❓';
}

/**
 * 统计错误频率
 */
function getErrorFrequency(logs: any[]): Array<{message: string; source?: string; count: number}> {
  const frequency = new Map<string, {message: string; source?: string; count: number}>();

  for (const log of logs) {
    const key = log.text || 'Unknown error';
    const existing = frequency.get(key);
    
    if (existing) {
      existing.count++;
    } else {
      frequency.set(key, {
        message: key,
        source: log.source,
        count: 1,
      });
    }
  }

  return Array.from(frequency.values()).sort((a, b) => b.count - a.count);
}

/**
 * 生成诊断建议
 */
function generateRecommendations(
  extension: any,
  errorsByType: Record<string, any[]>,
  allErrors: any[],
): Array<{icon: string; title: string; description: string; solution?: string}> {
  const recommendations: Array<{icon: string; title: string; description: string; solution?: string}> = [];

  // Service Worker 建议
  if (extension.manifestVersion === 3 && extension.serviceWorkerStatus !== 'active') {
    recommendations.push({
      icon: '🔄',
      title: 'Activate Service Worker',
      description: 'Your MV3 extension Service Worker is not active, which may prevent functionality.',
      solution: 'Run `activate_extension_service_worker` to activate it.',
    });
  }

  // JavaScript 错误建议
  if (errorsByType['JavaScript Errors']?.length > 0) {
    recommendations.push({
      icon: '🐛',
      title: 'Fix JavaScript Errors',
      description: `Found ${errorsByType['JavaScript Errors'].length} JavaScript errors.`,
      solution: 'Review the error messages above and check your code for syntax or logic errors.',
    });
  }

  // API 错误建议
  if (errorsByType['Chrome API Errors']?.length > 0) {
    recommendations.push({
      icon: '🔌',
      title: 'Review Chrome API Usage',
      description: `Found ${errorsByType['Chrome API Errors'].length} Chrome API errors.`,
      solution: 'Ensure APIs are available in your extension context and you have required permissions.',
    });
  }

  // 权限错误建议
  if (errorsByType['Permission Errors']?.length > 0) {
    recommendations.push({
      icon: '🔒',
      title: 'Check Permissions',
      description: 'Permission-related errors detected.',
      solution: 'Add missing permissions to manifest.json and reload the extension.',
    });
  }

  // 网络错误建议
  if (errorsByType['Network Errors']?.length > 0) {
    recommendations.push({
      icon: '🌐',
      title: 'Review Network Requests',
      description: 'Network-related errors detected.',
      solution: 'Check host_permissions in manifest and verify CORS configurations.',
    });
  }

  // 高频错误建议
  if (allErrors.length > 50) {
    recommendations.push({
      icon: '🔥',
      title: 'High Error Rate',
      description: `Detected ${allErrors.length} errors in the last 10 minutes.`,
      solution: 'Consider reloading the extension with `reload_extension` and monitoring for new errors.',
    });
  }

  // 默认建议
  if (recommendations.length === 0 && allErrors.length > 0) {
    recommendations.push({
      icon: '💡',
      title: 'Review Error Details',
      description: 'Errors detected but no specific pattern identified.',
      solution: 'Review the detailed error log above for more context.',
    });
  }

  return recommendations;
}

/**
 * 计算健康评分
 */
function calculateHealthScore(errorCount: number, timeRangeMinutes: number): number {
  // 基础分数 100
  let score = 100;
  
  // 每个错误扣分（根据时间范围调整）
  const errorPenalty = Math.min(errorCount * (10 / timeRangeMinutes), 80);
  score -= errorPenalty;
  
  return Math.max(0, Math.round(score));
}

/**
 * 获取健康评分表情
 */
function getHealthScoreEmoji(score: number): string {
  if (score >= 90) return '🟢';
  if (score >= 70) return '🟡';
  if (score >= 50) return '🟠';
  return '🔴';
}

/**
 * 获取健康评分描述
 */
function getHealthScoreDescription(score: number): string {
  if (score >= 90) {
    return '**Excellent!** Extension is running smoothly with minimal issues.';
  } else if (score >= 70) {
    return '**Good.** Extension is functional but has some minor issues to address.';
  } else if (score >= 50) {
    return '**Fair.** Extension has moderate issues that should be fixed.';
  } else {
    return '**Poor.** Extension has serious issues requiring immediate attention.';
  }
}
