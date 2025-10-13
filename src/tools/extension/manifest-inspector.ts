/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Manifest 深度检查工具
 * 
 * 提供 MV2/MV3 兼容性分析、权限检查和最佳实践建议
 */

import z from 'zod';

import {ToolCategories} from '../categories.js';
import {defineTool} from '../ToolDefinition.js';

export const inspectExtensionManifest = defineTool({
  name: 'inspect_extension_manifest',
  description: `Deep analysis of extension manifest.json with security and compatibility checks.

**Purpose**: Comprehensive manifest inspection for MV2/MV3 compatibility, security audit, and best practices.

**What it checks**:
- Manifest version (MV2 vs MV3) and structure validation
- MV3 migration readiness for MV2 extensions (identifies blocking issues)
- Permission analysis: required vs optional, host permissions, API permissions
- Content Security Policy (CSP) validation and security risks
- Match patterns for content scripts and host permissions
- Common misconfigurations (missing icons, invalid URLs, etc.)
- Chrome Web Store policy compliance

**Output includes**:
- Detailed manifest breakdown with explanations
- MV3 migration checklist (for MV2 extensions)
- Security warnings and permission minimization suggestions
- Quality score (0-100) based on best practices
- Actionable recommendations for improvement

**Essential for**:
- MV2 → MV3 migration planning
- Pre-submission Chrome Web Store review
- Security audits and permission reduction
- Troubleshooting manifest-related errors

**Example**: inspect_extension_manifest finds that MV2 extension uses deprecated webRequest blocking and suggests using declarativeNetRequest for MV3.`,
  annotations: {
    category: ToolCategories.EXTENSION_DEBUGGING,
    readOnlyHint: true,
  },
  schema: {
    extensionId: z
      .string()
      .regex(/^[a-z]{32}$/)
      .describe('Extension ID to inspect. Get this from list_extensions.'),
    checkMV3Compatibility: z
      .boolean()
      .optional()
      .describe('Check MV2 to MV3 migration compatibility. Default is true for MV2 extensions.'),
    checkPermissions: z
      .boolean()
      .optional()
      .describe('Perform detailed permission security audit. Default is true.'),
    checkBestPractices: z
      .boolean()
      .optional()
      .describe('Check against manifest best practices. Default is true.'),
  },
  handler: async (request, response, context) => {
    const {
      extensionId,
      checkMV3Compatibility = true,
      checkPermissions = true,
      checkBestPractices = true,
    } = request.params;

    try {
      // 获取扩展详情（包含 manifest）
      const extensions = await context.getExtensions();
      const extension = extensions.find(ext => ext.id === extensionId);

      if (!extension) {
        throw new Error(`Extension ${extensionId} not found`);
      }

      const manifest = extension.manifest;
      const manifestVersion = extension.manifestVersion;

      if (!manifest) {
        throw new Error(`Manifest data not available for extension ${extensionId}`);
      }

      response.appendResponseLine(`# Manifest Inspection Report\n`);
      response.appendResponseLine(`**Extension**: ${extension.name}`);
      response.appendResponseLine(`**Version**: ${extension.version}`);
      response.appendResponseLine(`**Manifest Version**: ${manifestVersion}\n`);

      // 1. 基本信息
      response.appendResponseLine(`## Basic Information\n`);
      response.appendResponseLine(`**Name**: ${manifest.name}`);
      response.appendResponseLine(`**Version**: ${manifest.version}`);
      if (manifest.description) {
        response.appendResponseLine(`**Description**: ${manifest.description}`);
      }
      response.appendResponseLine('');

      // 2. Manifest 结构分析
      response.appendResponseLine(`## Manifest Structure\n`);
      
      if (manifestVersion === 2) {
        analyzeMV2Structure(manifest, response);
      } else if (manifestVersion === 3) {
        analyzeMV3Structure(manifest, response);
      }

      // 3. 权限分析
      if (checkPermissions) {
        response.appendResponseLine(`## 🔒 Permission Analysis\n`);
        analyzePermissions(manifest, manifestVersion, response);
      }

      // 4. MV3 兼容性检查（仅 MV2）
      if (checkMV3Compatibility && manifestVersion === 2) {
        response.appendResponseLine(`## 🔄 MV3 Migration Compatibility\n`);
        checkMV3MigrationIssues(manifest, response);
      }

      // 5. 安全审计
      response.appendResponseLine(`## 🛡️ Security Audit\n`);
      performSecurityAudit(manifest, manifestVersion, response);

      // 6. 最佳实践检查
      if (checkBestPractices) {
        response.appendResponseLine(`## ✨ Best Practices\n`);
        checkBestPracticesCompliance(manifest, manifestVersion, response);
      }

      // 7. 完整的 manifest JSON
      response.appendResponseLine(`## 📄 Complete Manifest\n`);
      response.appendResponseLine('```json');
      response.appendResponseLine(JSON.stringify(manifest, null, 2));
      response.appendResponseLine('```\n');

      // 8. 总体评估
      response.appendResponseLine(`## 📊 Overall Assessment\n`);
      const score = calculateManifestScore(manifest, manifestVersion);
      response.appendResponseLine(`**Manifest Quality Score**: ${getScoreEmoji(score)} ${score}/100`);
      response.appendResponseLine(getScoreDescription(score));

      response.setIncludePages(true);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to inspect manifest: ${message}`);
    }
  },
});

/**
 * 分析 MV2 Manifest 结构
 */
function analyzeMV2Structure(manifest: any, response: any): void {
  response.appendResponseLine('**Type**: Manifest V2 (Legacy)');
  response.appendResponseLine('⚠️ **Warning**: MV2 is deprecated. Migrate to MV3 by June 2024.\n');

  // Background
  if (manifest.background) {
    response.appendResponseLine('**Background**:');
    if (manifest.background.scripts) {
      response.appendResponseLine(`- Scripts: ${manifest.background.scripts.length} file(s)`);
    }
    if (manifest.background.page) {
      response.appendResponseLine(`- Page: ${manifest.background.page}`);
    }
    if (manifest.background.persistent !== undefined) {
      response.appendResponseLine(`- Persistent: ${manifest.background.persistent}`);
    }
    response.appendResponseLine('');
  }

  // Browser Action / Page Action
  if (manifest.browser_action) {
    response.appendResponseLine('**Browser Action**: ✅ Configured');
  }
  if (manifest.page_action) {
    response.appendResponseLine('**Page Action**: ✅ Configured');
  }

  // Content Scripts
  if (manifest.content_scripts) {
    response.appendResponseLine(`**Content Scripts**: ${manifest.content_scripts.length} rule(s)`);
  }

  response.appendResponseLine('');
}

/**
 * 分析 MV3 Manifest 结构
 */
function analyzeMV3Structure(manifest: any, response: any): void {
  response.appendResponseLine('**Type**: Manifest V3 (Current)');
  response.appendResponseLine('✅ Using the latest manifest version.\n');

  // Background (Service Worker)
  if (manifest.background) {
    response.appendResponseLine('**Background Service Worker**:');
    if (manifest.background.service_worker) {
      response.appendResponseLine(`- Service Worker: ${manifest.background.service_worker}`);
    }
    if (manifest.background.type) {
      response.appendResponseLine(`- Type: ${manifest.background.type}`);
    }
    response.appendResponseLine('');
  }

  // Action
  if (manifest.action) {
    response.appendResponseLine('**Action**: ✅ Configured (replaces browser_action)');
  }

  // Content Scripts
  if (manifest.content_scripts) {
    response.appendResponseLine(`**Content Scripts**: ${manifest.content_scripts.length} rule(s)`);
  }

  response.appendResponseLine('');
}

/**
 * 分析权限
 */
function analyzePermissions(manifest: any, manifestVersion: number, response: any): void {
  // Regular permissions
  const permissions = manifest.permissions || [];
  response.appendResponseLine(`**Declared Permissions** (${permissions.length}):`);
  
  if (permissions.length === 0) {
    response.appendResponseLine('- *None*');
  } else {
    permissions.forEach((perm: string) => {
      const analysis = analyzePermission(perm);
      response.appendResponseLine(`- ${analysis.icon} \`${perm}\` - ${analysis.description}`);
    });
  }
  response.appendResponseLine('');

  // Host permissions (MV3)
  if (manifestVersion === 3 && manifest.host_permissions) {
    const hostPerms = manifest.host_permissions;
    response.appendResponseLine(`**Host Permissions** (${hostPerms.length}):`);
    hostPerms.forEach((host: string) => {
      const risk = analyzeHostPermission(host);
      response.appendResponseLine(`- ${risk.icon} \`${host}\` - ${risk.description}`);
    });
    response.appendResponseLine('');
  }

  // Optional permissions
  if (manifest.optional_permissions && manifest.optional_permissions.length > 0) {
    response.appendResponseLine(`**Optional Permissions** (${manifest.optional_permissions.length}):`);
    manifest.optional_permissions.forEach((perm: string) => {
      response.appendResponseLine(`- ✅ \`${perm}\` (User can grant)`);
    });
    response.appendResponseLine('');
  }

  // Permission warnings
  const warnings = getPermissionWarnings(permissions, manifest.host_permissions || []);
  if (warnings.length > 0) {
    response.appendResponseLine(`**⚠️ Permission Warnings**:`);
    warnings.forEach((warning: string) => {
      response.appendResponseLine(`- ${warning}`);
    });
    response.appendResponseLine('');
  }
}

/**
 * 检查 MV3 迁移问题
 */
function checkMV3MigrationIssues(manifest: any, response: any): void {
  const issues: string[] = [];
  const recommendations: string[] = [];

  // 检查 background.scripts
  if (manifest.background?.scripts) {
    issues.push('❌ `background.scripts` must be migrated to `background.service_worker`');
    recommendations.push('Combine background scripts into a single service worker file');
  }

  // 检查 background.persistent
  if (manifest.background?.persistent === true) {
    issues.push('❌ `background.persistent: true` is not supported in MV3');
    recommendations.push('Remove persistent property and design for event-driven architecture');
  }

  // 检查 browser_action / page_action
  if (manifest.browser_action || manifest.page_action) {
    issues.push('❌ `browser_action` and `page_action` must be replaced with `action`');
    recommendations.push('Rename to `action` and update references in code');
  }

  // 检查 blocking web request
  if (manifest.permissions?.includes('webRequest') && manifest.permissions?.includes('webRequestBlocking')) {
    issues.push('❌ `webRequestBlocking` is deprecated in MV3');
    recommendations.push('Migrate to declarativeNetRequest API');
  }

  // 检查 content_security_policy 格式
  if (manifest.content_security_policy && typeof manifest.content_security_policy === 'string') {
    issues.push('❌ CSP format changed in MV3 (must be object)');
    recommendations.push('Change CSP from string to object format');
  }

  // 检查远程代码
  const csp = manifest.content_security_policy;
  if (typeof csp === 'string' && csp.includes('unsafe-eval')) {
    issues.push('⚠️ `unsafe-eval` is not allowed in MV3');
    recommendations.push('Remove eval() and Function() from code');
  }

  // 显示结果
  if (issues.length === 0) {
    response.appendResponseLine('✅ **No major migration issues detected!**');
    response.appendResponseLine('This MV2 extension should be relatively easy to migrate to MV3.\n');
  } else {
    response.appendResponseLine(`**Migration Issues Found** (${issues.length}):\n`);
    issues.forEach(issue => response.appendResponseLine(issue));
    response.appendResponseLine('');
    
    response.appendResponseLine(`**Recommended Actions**:\n`);
    recommendations.forEach((rec, i) => {
      response.appendResponseLine(`${i + 1}. ${rec}`);
    });
    response.appendResponseLine('');
  }

  // 迁移资源
  response.appendResponseLine(`**Migration Resources**:`);
  response.appendResponseLine('- [Chrome MV3 Migration Guide](https://developer.chrome.com/docs/extensions/migrating/)');
  response.appendResponseLine('- [MV3 Migration Checklist](https://developer.chrome.com/docs/extensions/mv3/mv3-migration-checklist/)');
  response.appendResponseLine('');
}

/**
 * 执行安全审计
 */
function performSecurityAudit(manifest: any, manifestVersion: number, response: any): void {
  const findings: Array<{level: string; message: string}> = [];

  // 检查过度权限
  const permissions = manifest.permissions || [];
  const dangerousPerms = ['<all_urls>', 'tabs', 'webRequest', 'webRequestBlocking', 'debugger'];
  const foundDangerous = permissions.filter((p: string) => dangerousPerms.includes(p));
  
  if (foundDangerous.length > 0) {
    findings.push({
      level: 'warning',
      message: `Potentially excessive permissions: ${foundDangerous.join(', ')}`,
    });
  }

  // 检查 host_permissions <all_urls>
  const hostPerms = manifest.host_permissions || [];
  if (hostPerms.includes('<all_urls>')) {
    findings.push({
      level: 'warning',
      message: '`<all_urls>` grants access to all websites. Consider limiting to specific domains.',
    });
  }

  // 检查 CSP
  const csp = manifest.content_security_policy;
  if (!csp) {
    findings.push({
      level: 'info',
      message: 'No Content Security Policy defined. Consider adding one for security.',
    });
  } else if (typeof csp === 'string' && (csp.includes('unsafe-inline') || csp.includes('unsafe-eval'))) {
    findings.push({
      level: 'error',
      message: 'CSP contains unsafe directives (`unsafe-inline` or `unsafe-eval`).',
    });
  }

  // 检查外部资源
  if (manifest.web_accessible_resources) {
    findings.push({
      level: 'info',
      message: 'Extension exposes web-accessible resources. Ensure they are necessary.',
    });
  }

  // 显示结果
  if (findings.length === 0) {
    response.appendResponseLine('✅ **No security concerns detected.**\n');
  } else {
    findings.forEach(finding => {
      const icon = finding.level === 'error' ? '❌' : finding.level === 'warning' ? '⚠️' : 'ℹ️';
      response.appendResponseLine(`${icon} ${finding.message}`);
    });
    response.appendResponseLine('');
  }
}

/**
 * 检查最佳实践
 */
function checkBestPracticesCompliance(manifest: any, manifestVersion: number, response: any): void {
  const recommendations: string[] = [];

  // 检查图标
  if (!manifest.icons || Object.keys(manifest.icons).length === 0) {
    recommendations.push('Add icons (16x16, 48x48, 128x128) for better user experience');
  }

  // 检查描述
  if (!manifest.description || manifest.description.length < 10) {
    recommendations.push('Add a detailed description (required for Chrome Web Store)');
  }

  // 检查 optional_permissions
  const permissions = manifest.permissions || [];
  const optionalizable = ['tabs', 'cookies', 'history'];
  const shouldBeOptional = permissions.filter((p: string) => optionalizable.includes(p));
  
  if (shouldBeOptional.length > 0) {
    recommendations.push(`Consider making these permissions optional: ${shouldBeOptional.join(', ')}`);
  }

  // 检查 content_scripts 的 run_at
  if (manifest.content_scripts) {
    const missingRunAt = manifest.content_scripts.filter((cs: any) => !cs.run_at);
    if (missingRunAt.length > 0) {
      recommendations.push('Specify `run_at` for content_scripts (document_start, document_end, document_idle)');
    }
  }

  // MV3 特定建议
  if (manifestVersion === 3) {
    if (!manifest.action) {
      recommendations.push('Consider adding an `action` for user interaction');
    }
  }

  // 显示结果
  if (recommendations.length === 0) {
    response.appendResponseLine('✅ **Manifest follows all best practices!**\n');
  } else {
    recommendations.forEach((rec, i) => {
      response.appendResponseLine(`${i + 1}. ${rec}`);
    });
    response.appendResponseLine('');
  }
}

/**
 * 分析单个权限
 */
function analyzePermission(permission: string): {icon: string; description: string} {
  const highRisk = ['<all_urls>', 'debugger', 'webRequestBlocking'];
  const mediumRisk = ['tabs', 'webRequest', 'cookies', 'history'];
  
  if (highRisk.includes(permission)) {
    return {icon: '🔴', description: 'High risk - requires strong justification'};
  } else if (mediumRisk.includes(permission)) {
    return {icon: '🟡', description: 'Medium risk - ensure necessary'};
  } else {
    return {icon: '🟢', description: 'Low risk'};
  }
}

/**
 * 分析 host permission
 */
function analyzeHostPermission(host: string): {icon: string; description: string} {
  if (host === '<all_urls>') {
    return {icon: '🔴', description: 'All websites - very broad access'};
  } else if (host.includes('*://*/*') || host.includes('*://*/')) {
    return {icon: '🟠', description: 'Broad pattern - consider limiting'};
  } else {
    return {icon: '🟢', description: 'Specific domain'};
  }
}

/**
 * 获取权限警告
 */
function getPermissionWarnings(permissions: string[], hostPermissions: string[]): string[] {
  const warnings: string[] = [];
  
  if (permissions.includes('<all_urls>') || hostPermissions.includes('<all_urls>')) {
    warnings.push('`<all_urls>` requires additional justification for Chrome Web Store');
  }
  
  if (permissions.includes('debugger')) {
    warnings.push('`debugger` permission is rarely approved by Chrome Web Store');
  }
  
  return warnings;
}

/**
 * 计算 Manifest 评分
 */
function calculateManifestScore(manifest: any, manifestVersion: number): number {
  let score = 100;
  
  // MV2 扣分
  if (manifestVersion === 2) {
    score -= 20;
  }
  
  // 缺少图标
  if (!manifest.icons) {
    score -= 10;
  }
  
  // 缺少描述
  if (!manifest.description) {
    score -= 10;
  }
  
  // 过度权限
  const permissions = manifest.permissions || [];
  if (permissions.includes('<all_urls>')) {
    score -= 15;
  }
  
  // 不安全的 CSP
  const csp = manifest.content_security_policy;
  if (typeof csp === 'string' && csp.includes('unsafe-eval')) {
    score -= 20;
  }
  
  return Math.max(0, score);
}

/**
 * 获取评分表情
 */
function getScoreEmoji(score: number): string {
  if (score >= 90) return '🟢';
  if (score >= 70) return '🟡';
  if (score >= 50) return '🟠';
  return '🔴';
}

/**
 * 获取评分描述
 */
function getScoreDescription(score: number): string {
  if (score >= 90) {
    return '**Excellent!** Manifest is well-configured and follows best practices.';
  } else if (score >= 70) {
    return '**Good.** Manifest is solid with minor improvements recommended.';
  } else if (score >= 50) {
    return '**Fair.** Several areas need attention.';
  } else {
    return '**Poor.** Significant issues require immediate attention.';
  }
}
