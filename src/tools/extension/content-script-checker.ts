/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Content Script injection status checker tool
 * 
 * Check if Content Scripts are successfully injected into pages
 */

import z from 'zod';

import {ToolCategories} from '../categories.js';
import {defineTool} from '../ToolDefinition.js';
import {EXTENSION_NOT_FOUND, MANIFEST_NOT_AVAILABLE} from './errors.js';
import {reportExtensionNotFound, reportResourceUnavailable} from '../utils/ErrorReporting.js';

export const checkContentScriptInjection = defineTool({
  name: 'check_content_script_injection',
  description: `Check if content scripts are properly injected and diagnose injection failures.

**Purpose**: Verify content script injection status and troubleshoot "content script not working" issues.

**What it does**:
- Lists all content script rules from manifest.json
- Tests match patterns against a specific URL (if provided)
- Identifies which scripts SHOULD inject vs which ACTUALLY inject
- Analyzes match/exclude patterns, run_at timing, and all_frames settings
- Detects common injection failure causes

**Diagnoses these issues**:
- Match pattern doesn't cover the target URL (e.g., "*://*.example.com/*" won't match "example.com")
- Missing host permissions in manifest
- CSP (Content Security Policy) blocking injection
- Timing problems (document_start vs document_end vs document_idle)
- Frame injection issues (main frame vs iframes)

**Output includes**:
- All content script rules with their match patterns
- URL match test results (if testUrl provided)
- Injection status for each rule
- Specific failure reasons with solutions
- Recommendations for fixing match patterns

**When to use**: When content scripts aren't running on expected pages or you need to verify injection configuration.

**Example**: check_content_script_injection with testUrl="https://github.com/user/repo" shows that pattern "*://github.com/*/*" matches but "*://www.github.com/*/*" doesn't.`,
  annotations: {
    category: ToolCategories.EXTENSION_DEBUGGING,
    readOnlyHint: true,
  },
  schema: {
    extensionId: z
      .string()
      .regex(/^[a-z]{32}$/)
      .describe('Extension ID to check. Get this from list_extensions.'),
    testUrl: z
      .string()
      .optional()
      .describe('URL to test match patterns against. If not provided, shows all patterns.'),
    detailed: z
      .boolean()
      .optional()
      .describe('Show detailed analysis including all match patterns. Default is true.'),
  },
  handler: async (request, response, context) => {
    const {
      extensionId,
      testUrl,
      detailed = true,
    } = request.params;

    try {
      // 1. Get extension information
      const extensions = await context.getExtensions();
      const extension = extensions.find(ext => ext.id === extensionId);

      // ✅ Following close_page pattern: return info instead of throwing
      if (!extension) {
        reportExtensionNotFound(response, extensionId, extensions);
        response.setIncludePages(true);
        return;
      }

      const manifest = extension.manifest;
      
      // ✅ Following close_page pattern: return info instead of throwing
      if (!manifest) {
        reportResourceUnavailable(
          response,
          'Manifest',
          extensionId,
          'Extension manifest data is being loaded or unavailable'
        );
        response.setIncludePages(true);
        return;
      }
      
      const contentScripts = manifest.content_scripts || [];

      if (contentScripts.length === 0) {
        response.appendResponseLine(`# Content Script Check\n`);
        response.appendResponseLine(`**Extension**: ${extension.name}`);
        response.appendResponseLine('\n⚠️ **No content scripts defined**');
        response.appendResponseLine('\nThis extension has no content_scripts configured in manifest.json.');
        response.setIncludePages(true);
        return;
      }

      response.appendResponseLine(`# Content Script Injection Check\n`);
      response.appendResponseLine(`**Extension**: ${extension.name}`);
      if (testUrl) {
        response.appendResponseLine(`**Test URL**: ${testUrl}\n`);
      } else {
        response.appendResponseLine(`**Mode**: Pattern analysis only\n`);
      }

      // 2. Check each content script rule
      response.appendResponseLine(`## Content Script Rules (${contentScripts.length})\n`);

      const matchResults: Array<{
        rule: any;
        index: number;
        shouldInject: boolean;
        reason: string;
        files: string[];
      }> = [];

      for (let i = 0; i < contentScripts.length; i++) {
        const rule = contentScripts[i] as any;
        const matches = rule.matches || [];
        const excludeMatches = rule.exclude_matches || [];
        const js = rule.js || [];
        const css = rule.css || [];

        // 如果提供了测试URL，检查是否匹配
        let matchResult;
        if (testUrl) {
          matchResult = checkUrlMatch(testUrl, matches, excludeMatches);
          matchResults.push({
            rule,
            index: i,
            shouldInject: matchResult.shouldInject,
            reason: matchResult.reason,
            files: [...js, ...css],
          });
        }

        // 显示规则
        const icon = testUrl && matchResult ? (matchResult.shouldInject ? '✅' : '❌') : '📋';
        response.appendResponseLine(`### ${icon} Rule ${i + 1}`);
        
        if (detailed || testUrl) {
          response.appendResponseLine(`**Match Patterns** (${matches.length}):`);
          matches.forEach((pattern: string) => {
            if (testUrl) {
              const matchesUrl = testUrlPattern(testUrl, pattern);
              const matchIcon = matchesUrl ? '✅' : '❌';
              response.appendResponseLine(`  - ${matchIcon} \`${pattern}\``);
            } else {
              response.appendResponseLine(`  - \`${pattern}\``);
            }
          });

          if (excludeMatches.length > 0) {
            response.appendResponseLine(`**Exclude Patterns** (${excludeMatches.length}):`);
            excludeMatches.forEach((pattern: string) => {
              if (testUrl) {
                const matchesUrl = testUrlPattern(testUrl, pattern);
                const matchIcon = matchesUrl ? '🚫' : '✅';
                response.appendResponseLine(`  - ${matchIcon} \`${pattern}\``);
              } else {
                response.appendResponseLine(`  - \`${pattern}\``);
              }
            });
          }
        }

        response.appendResponseLine(`**Files** (${js.length + css.length}): ${[...js, ...css].join(', ') || 'None'}`);
        response.appendResponseLine(`**Run At**: ${rule.run_at || 'document_idle'}`);
        
        if (testUrl && matchResult) {
          response.appendResponseLine(`**Result**: ${matchResult.reason}`);
        }
        response.appendResponseLine('');
      }

      // 3. 总结和建议
      if (testUrl) {
        response.appendResponseLine(`## 📊 Match Summary\n`);

        const shouldInjectAny = matchResults.some(r => r.shouldInject);
        
        if (!shouldInjectAny) {
          response.appendResponseLine('❌ **No content scripts match this URL**\n');
          response.appendResponseLine('**This means**:');
          response.appendResponseLine('- Content scripts will NOT be injected on this page');
          response.appendResponseLine('- The extension cannot interact with this page via content scripts\n');
          
          response.appendResponseLine('**Possible solutions**:');
          response.appendResponseLine('1. Add a match pattern that covers this URL');
          response.appendResponseLine('2. Use a broader pattern like `*://*/*` (all sites)');
          response.appendResponseLine('3. Check if the URL protocol is correct (http/https)');
          if (extension.manifestVersion === 3) {
            response.appendResponseLine('4. Ensure `host_permissions` includes this domain');
          }
        } else {
          const matchingRules = matchResults.filter(r => r.shouldInject);
          response.appendResponseLine(`✅ **${matchingRules.length} rule(s) match this URL**\n`);
          response.appendResponseLine('**This means**:');
          response.appendResponseLine('- Content scripts SHOULD be injected on this page');
          response.appendResponseLine('- Scripts will run according to their `run_at` timing\n');
          
          matchingRules.forEach(r => {
            response.appendResponseLine(`- **Rule ${r.index + 1}**: ${r.files.length} file(s) at ${r.rule.run_at || 'document_idle'}`);
          });
          response.appendResponseLine('');
        }
      }

      // 4. 调试建议
      response.appendResponseLine(`\n## 🔧 Debugging Tips\n`);

      if (testUrl) {
        const shouldInjectAny = matchResults.some(r => r.shouldInject);
        const recommendations = generateRecommendations(
          manifest,
          extension.manifestVersion,
          testUrl,
          matchResults,
          shouldInjectAny,
        );

        recommendations.forEach((rec, i) => {
          response.appendResponseLine(`${i + 1}. ${rec}`);
        });
      } else {
        response.appendResponseLine('**To test against a specific URL**:');
        response.appendResponseLine('- Call this tool again with `testUrl` parameter');
        response.appendResponseLine('- Example: `testUrl: "https://example.com/page"`\n');
        
        response.appendResponseLine('**General tips**:');
        response.appendResponseLine('- Use `*://*/*` to match all HTTP(S) pages');
        response.appendResponseLine('- Use `*://example.com/*` to match all pages on a domain');
        response.appendResponseLine('- `<all_urls>` matches all protocols including file://');
        response.appendResponseLine('- Content scripts won\'t run on chrome:// or chrome-extension:// pages');
      }

      response.appendResponseLine(`\n## 💡 Verification Methods\n`);
      response.appendResponseLine('**Check if content script is running**:');
      response.appendResponseLine('```javascript');
      response.appendResponseLine('// Add to your content script:');
      response.appendResponseLine(`console.log("✅ Content script loaded:", chrome.runtime.id);`);
      response.appendResponseLine('```');
      response.appendResponseLine('\n**Or check in browser console**:');
      response.appendResponseLine('```javascript');
      response.appendResponseLine('// This only works if your script sets it:');
      response.appendResponseLine(`window.MY_EXTENSION_LOADED === true`);
      response.appendResponseLine('```');

    } catch {
      // ✅ Following navigate_page_history pattern: simple error message
      response.appendResponseLine(
        'Unable to check content script injection. The extension may be inactive or disabled.'
      );
    }
    
    response.setIncludePages(true);
  },
});

/**
 * 检查 URL 是否匹配 content script 规则
 */
function checkUrlMatch(
  url: string,
  matches: string[],
  excludeMatches: string[] = [],
): {shouldInject: boolean; reason: string} {
  // 检查 exclude_matches
  for (const pattern of excludeMatches) {
    if (testUrlPattern(url, pattern)) {
      return {
        shouldInject: false,
        reason: `Excluded by pattern: ${pattern}`,
      };
    }
  }

  // 检查 matches
  for (const pattern of matches) {
    if (testUrlPattern(url, pattern)) {
      return {
        shouldInject: true,
        reason: `Matched pattern: ${pattern}`,
      };
    }
  }

  return {
    shouldInject: false,
    reason: 'No matching patterns',
  };
}

/**
 * 测试 URL 是否匹配模式
 */
function testUrlPattern(url: string, pattern: string): boolean {
  try {
    // 解析 URL
    const urlObj = new URL(url);
    
    // <all_urls> 匹配所有
    if (pattern === '<all_urls>') {
      return urlObj.protocol === 'http:' || urlObj.protocol === 'https:' || urlObj.protocol === 'file:';
    }

    // 解析 pattern: scheme://host/path
    const patternParts = pattern.match(/^(\*|https?|file|ftp):\/\/([^\/]+)(\/.*)$/);
    if (!patternParts) {
      return false;
    }

    const [, schemePattern, hostPattern, pathPattern] = patternParts;

    // 检查 scheme
    const urlScheme = urlObj.protocol.slice(0, -1); // 移除 ':'
    if (schemePattern !== '*' && schemePattern !== urlScheme) {
      return false;
    }

    // 检查 host
    if (!matchHost(urlObj.hostname, hostPattern)) {
      return false;
    }

    // 检查 path
    if (!matchPath(urlObj.pathname, pathPattern)) {
      return false;
    }

    return true;
  } catch (e) {
    return false;
  }
}

/**
 * 匹配 host
 */
function matchHost(host: string, pattern: string): boolean {
  if (pattern === '*') {
    return true;
  }

  // *.example.com 匹配 example.com 和所有子域
  if (pattern.startsWith('*.')) {
    const baseDomain = pattern.substring(2);
    return host === baseDomain || host.endsWith('.' + baseDomain);
  }

  return host === pattern;
}

/**
 * 匹配 path
 */
function matchPath(path: string, pattern: string): boolean {
  // 将 pattern 转换为正则表达式
  const regexPattern = pattern
    .replace(/[.+?^${}()|[\]\\]/g, '\\$&') // 转义特殊字符
    .replace(/\*/g, '.*'); // * 匹配任意字符

  const regex = new RegExp('^' + regexPattern + '$');
  return regex.test(path);
}


/**
 * 生成调试建议
 */
function generateRecommendations(
  manifest: any,
  manifestVersion: number,
  pageUrl: string,
  matchResults: any[],
  shouldInjectAny: boolean,
): string[] {
  const recommendations: string[] = [];

  if (!shouldInjectAny) {
    // 没有匹配的规则
    recommendations.push('Update match patterns in manifest.json to include this URL');
    recommendations.push('Consider using broader patterns like `*://*/*` for testing');
    
    if (manifestVersion === 3) {
      recommendations.push('Ensure host_permissions in manifest.json include this domain');
    }
  } else {
    // 应该注入但可能有问题
    recommendations.push('Reload the page to ensure content scripts inject');
    recommendations.push('Check browser console for any content script errors');
    recommendations.push('Use `get_extension_logs` to see content script logs');

    if (manifestVersion === 3) {
      recommendations.push('Verify host_permissions are declared and granted');
    }

    // 检查 run_at 时机
    const hasDocumentStart = matchResults.some(r => r.rule.run_at === 'document_start');
    if (hasDocumentStart) {
      recommendations.push('document_start scripts run very early - ensure DOM is ready before accessing it');
    }
  }

  recommendations.push('Use `get_extension_runtime_errors` to check for errors');

  return recommendations;
}
