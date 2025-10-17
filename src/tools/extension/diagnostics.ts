/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Extension error diagnosis tool
 * 
 * Provides one-click extension health diagnosis
 */

import z from 'zod';

import {ToolCategories} from '../categories.js';
import {defineTool} from '../ToolDefinition.js';
import {EXTENSION_NOT_FOUND} from './errors.js';
import {reportExtensionNotFound} from '../utils/ErrorReporting.js';

export const diagnoseExtensionErrors = defineTool({
  name: 'diagnose_extension_errors',
  description: `Get intelligent error analysis with fix recommendations (analyzes console logs).

**This is the tool you need when:**
- ✅ You want quick health check with actionable recommendations
- ✅ You need errors classified by type (JavaScript, API, Permission, Network)
- ✅ You want a health score (0-100) for the extension
- ✅ You need fix suggestions for detected errors

**Data source**: Console logs from all extension contexts (background, content scripts, popup)

**What you get**:
- Error classification (🐛 JavaScript, 🔌 Chrome API, 🔒 Permission, 🌐 Network)
- Error frequency analysis (which errors happen most often)
- Health score (0-100) with severity assessment
- Diagnostic recommendations with actionable solutions
- Service Worker status check

**This tool analyzes console logs, NOT chrome://extensions errors**:
- For chrome://extensions errors → use \`get_extension_runtime_errors\`
- This tool complements \`get_extension_runtime_errors\` by providing analysis

**Example scenarios**:
1. Quick health check: "Is my extension working correctly?"
   → Use this tool for overview and recommendations
   
2. Need fix suggestions: "How do I fix these errors?"
   → Use this tool for intelligent analysis and solutions

**Related tools**:
- \`get_extension_runtime_errors\` - See errors from chrome://extensions (different data source)
- \`get_extension_logs\` - Get raw console logs (this tool analyzes them)
- \`enhance_extension_error_capture\` - Inject listeners before using this tool`,
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
      // 1. Get extension details
      const extensions = await context.getExtensions();
      const extension = extensions.find(ext => ext.id === extensionId);

      // ✅ Following close_page pattern: return info instead of throwing
      if (!extension) {
        reportExtensionNotFound(response, extensionId, extensions);
        response.setIncludePages(true);
        return;
      }

      response.appendResponseLine(`# Extension Health Diagnosis\n`);
      response.appendResponseLine(`**Extension**: ${extension.name} (v${extension.version})`);
      response.appendResponseLine(`**ID**: ${extensionId}`);
      response.appendResponseLine(`**Manifest Version**: ${extension.manifestVersion}`);
      response.appendResponseLine(`**Status**: ${extension.enabled ? '✅ Enabled' : '❌ Disabled'}\n`);

      // 2. Collect error logs
      const sinceTime = Date.now() - timeRange * 60 * 1000;
      const logsResult = await context.getExtensionLogs(extensionId, {
        capture: true,
        duration: 5000,
        includeStored: true,
      });

      const logs = logsResult.logs.filter(log => log.timestamp >= sinceTime);
      
      // Filter errors and warnings
      const levels = includeWarnings ? ['error', 'warn'] : ['error'];
      const errorLogs = logs.filter(log => levels.includes(log.level || 'log'));

      response.appendResponseLine(`## Error Summary (Last ${timeRange} minutes)\n`);
      
      if (errorLogs.length === 0) {
        response.appendResponseLine('✅ **No errors detected!**\n');
        response.appendResponseLine('The extension appears to be running correctly.');
        
        // Check other potential issues
        await checkPotentialIssues(extension, context, response);
        
        // Suggest enhancement if needed
        response.appendResponseLine('\n💡 **Tip**: If issues persist but no errors appear:');
        response.appendResponseLine('Use `enhance_extension_error_capture` to catch uncaught errors and Promise rejections\n');
        
        response.setIncludePages(true);
        return;
      }

      response.appendResponseLine(`**Total Issues Found**: ${errorLogs.length}`);
      
      // 3. Classify errors by type
      const errorsByType = classifyErrors(errorLogs);
      
      response.appendResponseLine(`\n### Error Breakdown\n`);
      for (const [type, errors] of Object.entries(errorsByType)) {
        const icon = getErrorIcon(type);
        response.appendResponseLine(`- ${icon} **${type}**: ${errors.length} occurrences`);
      }

      // 4. Show most frequent errors
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

      // 5. Error details
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

      // 6. Diagnostic recommendations
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

      // 7. Health score
      const healthScore = calculateHealthScore(errorLogs.length, timeRange);
      response.appendResponseLine(`## Health Score: ${getHealthScoreEmoji(healthScore)} ${healthScore}/100\n`);
      response.appendResponseLine(getHealthScoreDescription(healthScore));

    } catch {
      // ✅ Following navigate_page_history pattern: simple error message
      response.appendResponseLine(
        'Unable to diagnose extension. The extension may be inactive or disabled.'
      );
    }
    
    response.setIncludePages(true);
  },
});

/**
 * Check other potential issues (even without error logs)
 */
async function checkPotentialIssues(
  extension: any,
  context: any,
  response: any,
): Promise<void> {
  response.appendResponseLine(`\n## Potential Issues Check\n`);
  
  // Check Service Worker status (MV3)
  if (extension.manifestVersion === 3) {
    if (extension.serviceWorkerStatus === 'inactive') {
      response.appendResponseLine('⚠️ **Service Worker Inactive**');
      response.appendResponseLine('The Service Worker is not running. This may cause functionality issues.');
      response.appendResponseLine('**Solution**: Use `activate_extension_service_worker` to activate it.\n');
    } else if (extension.serviceWorkerStatus === 'active') {
      response.appendResponseLine('✅ Service Worker is active\n');
    }
  }

  // Check contexts
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
 * Classify errors by type
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

  // Remove empty classifications
  return Object.fromEntries(
    Object.entries(classified).filter(([_, errors]) => errors.length > 0)
  );
}

/**
 * Get error type icon
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
 * Calculate error frequency
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
 * Generate diagnostic recommendations
 */
function generateRecommendations(
  extension: any,
  errorsByType: Record<string, any[]>,
  allErrors: any[],
): Array<{icon: string; title: string; description: string; solution?: string}> {
  const recommendations: Array<{icon: string; title: string; description: string; solution?: string}> = [];

  // Service Worker recommendations
  if (extension.manifestVersion === 3 && extension.serviceWorkerStatus !== 'active') {
    recommendations.push({
      icon: '🔄',
      title: 'Activate Service Worker',
      description: 'Your MV3 extension Service Worker is not active, which may prevent functionality.',
      solution: 'Run `activate_extension_service_worker` to activate it.',
    });
  }

  // JavaScript error recommendations
  if (errorsByType['JavaScript Errors']?.length > 0) {
    recommendations.push({
      icon: '🐛',
      title: 'Fix JavaScript Errors',
      description: `Found ${errorsByType['JavaScript Errors'].length} JavaScript errors.`,
      solution: 'Review the error messages above and check your code for syntax or logic errors.',
    });
  }

  // API error recommendations
  if (errorsByType['Chrome API Errors']?.length > 0) {
    recommendations.push({
      icon: '🔌',
      title: 'Review Chrome API Usage',
      description: `Found ${errorsByType['Chrome API Errors'].length} Chrome API errors.`,
      solution: 'Ensure APIs are available in your extension context and you have required permissions.',
    });
  }

  // Permission error recommendations
  if (errorsByType['Permission Errors']?.length > 0) {
    recommendations.push({
      icon: '🔒',
      title: 'Check Permissions',
      description: 'Permission-related errors detected.',
      solution: 'Add missing permissions to manifest.json and reload the extension.',
    });
  }

  // Network error recommendations
  if (errorsByType['Network Errors']?.length > 0) {
    recommendations.push({
      icon: '🌐',
      title: 'Review Network Requests',
      description: 'Network-related errors detected.',
      solution: 'Check host_permissions in manifest and verify CORS configurations.',
    });
  }

  // High frequency error recommendations
  if (allErrors.length > 50) {
    recommendations.push({
      icon: '🔥',
      title: 'High Error Rate',
      description: `Detected ${allErrors.length} errors in the last 10 minutes.`,
      solution: 'Consider reloading the extension with `reload_extension` and monitoring for new errors.',
    });
  }

  // Default recommendations
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
 * Calculate health score
 */
function calculateHealthScore(errorCount: number, timeRangeMinutes: number): number {
  // Base score 100
  let score = 100;
  
  // Deduct points per error (adjusted by time range)
  const errorPenalty = Math.min(errorCount * (10 / timeRangeMinutes), 80);
  score -= errorPenalty;
  
  return Math.max(0, Math.round(score));
}

/**
 * Get health score emoji
 */
function getHealthScoreEmoji(score: number): string {
  if (score >= 90) return '🟢';
  if (score >= 70) return '🟡';
  if (score >= 50) return '🟠';
  return '🔴';
}

/**
 * Get health score description
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
