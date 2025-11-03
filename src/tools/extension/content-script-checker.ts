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
import {reportExtensionNotFound} from '../utils/ErrorReporting.js';

export const checkContentScriptInjection = defineTool({
  name: 'check_content_script_injection',
  description: `Check if content scripts are properly injected and diagnose injection failures.

**Verifies**: Match patterns, host permissions, and actual DOM injection status. Tests URL patterns if testUrl provided.

**Note**: Content scripts run in page contexts (not listed in \`list_extension_contexts\`). This tool checks both manifest configuration and actual page injection.

**When to use**: Content scripts not working on expected pages or need to verify injection configuration.`,
  annotations: {
    category: ToolCategories.EXTENSION_INSPECTION,
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
      .describe(
        'URL to test match patterns against. If not provided, shows all patterns.',
      ),
    detailed: z
      .boolean()
      .optional()
      .describe(
        'Show detailed analysis including all match patterns. Default is true.',
      ),
  },
  handler: async (request, response, context) => {
    const {extensionId, testUrl, detailed = true} = request.params;

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
        // 使用备用方案：检查页面实际注入状态
        response.appendResponseLine(`# Content Script Injection Check\n`);
        response.appendResponseLine(`**Extension**: ${extension.name}`);
        response.appendResponseLine(
          '⚠️ **Manifest data temporarily unavailable**\n',
        );
        response.appendResponseLine(
          '**Using fallback method**: Checking actual injection status on current page...\n',
        );

        // 检查当前页面的实际注入状态
        try {
          const browser = context.getBrowser();
          const pages = await browser.pages();
          const currentPage = pages.find(p => p.url() === testUrl) || pages[0];

          if (currentPage) {
            const injectionStatus = await currentPage.evaluate(
              (_extId: string) => {
                // 检查扩展注入的元素
                const allElements = document.querySelectorAll('*');
                const extensionElements: Array<{
                  tag: string;
                  id: string;
                  className: string;
                }> = [];

                allElements.forEach(el => {
                  const className = el.className?.toString() || '';
                  const id = el.id || '';

                  // 检查是否包含扩展相关的类名或ID
                  if (
                    className.includes('extension') ||
                    className.includes('capture') ||
                    className.includes('inject') ||
                    id.includes('extension') ||
                    id.includes('capture')
                  ) {
                    extensionElements.push({
                      tag: el.tagName,
                      id: el.id,
                      className: className,
                    });
                  }
                });

                // 检查扩展脚本
                const scripts = Array.from(document.querySelectorAll('script'));
                const extensionScripts = scripts.filter(
                  s => s.src && s.src.includes('chrome-extension://'),
                );

                return {
                  hasElements: extensionElements.length > 0,
                  elementCount: extensionElements.length,
                  elements: extensionElements.slice(0, 10), // 只返回前10个
                  hasScripts: extensionScripts.length > 0,
                  scriptCount: extensionScripts.length,
                };
              },
              extensionId,
            );

            if (injectionStatus.hasElements || injectionStatus.hasScripts) {
              response.appendResponseLine(
                `## ✅ Content Script Injection Detected\n`,
              );
              response.appendResponseLine(
                `**Status**: Content scripts appear to be injected and working\n`,
              );
              response.appendResponseLine('**Evidence**:');
              response.appendResponseLine(
                `- Found ${injectionStatus.elementCount} injected DOM elements`,
              );
              response.appendResponseLine(
                `- Found ${injectionStatus.scriptCount} extension scripts\n`,
              );

              if (injectionStatus.elements.length > 0) {
                response.appendResponseLine('**Sample injected elements**:');
                injectionStatus.elements.forEach(
                  (el: {tag: string; className: string; id: string}) => {
                    const idStr = el.id ? ` id="${el.id}"` : '';
                    const classStr = el.className
                      ? ` class="${el.className.substring(0, 50)}..."`
                      : '';
                    response.appendResponseLine(
                      `- <${el.tag}${idStr}${classStr}>`,
                    );
                  },
                );
                response.appendResponseLine('');
              }

              response.appendResponseLine(
                '💡 **Note**: Manifest data is loading asynchronously. Wait 2-3 seconds and try `inspect_extension_manifest` for detailed configuration.',
              );
            } else {
              response.appendResponseLine(
                `## ❌ No Content Script Injection Detected\n`,
              );
              response.appendResponseLine(
                '**Status**: No evidence of content script injection found on current page\n',
              );
              response.appendResponseLine('**Possible reasons**:');
              response.appendResponseLine(
                '1. Match patterns do not cover this URL',
              );
              response.appendResponseLine(
                '2. Extension does not have content scripts configured',
              );
              response.appendResponseLine('3. Content scripts failed to load');
              response.appendResponseLine(
                '4. Page loaded before extension was ready\n',
              );
              response.appendResponseLine('**Recommended actions**:');
              response.appendResponseLine('1. Reload the page');
              response.appendResponseLine(
                '2. Check extension permissions and host_permissions',
              );
              response.appendResponseLine(
                '3. Wait for manifest data and retry with `inspect_extension_manifest`',
              );
            }
          } else {
            response.appendResponseLine(
              '⚠️ No active page found to check injection status.',
            );
          }
        } catch (error) {
          response.appendResponseLine(
            '⚠️ Unable to check actual injection status on current page.',
          );
          response.appendResponseLine(
            `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
          );
        }

        response.appendResponseLine('\n**Alternative approach**:');
        response.appendResponseLine(
          '1. Use `get_extension_details` - Shows basic extension info (always works)',
        );
        response.appendResponseLine(
          '2. Use `evaluate_in_extension` with `chrome.runtime.getManifest()` to get manifest directly',
        );
        response.appendResponseLine(
          '3. Wait 2-3 seconds and try `inspect_extension_manifest` again',
        );

        response.setIncludePages(true);
        return;
      }

      const contentScripts = manifest.content_scripts || [];

      if (contentScripts.length === 0) {
        response.appendResponseLine(`# Content Script Check\n`);
        response.appendResponseLine(`**Extension**: ${extension.name}`);
        response.appendResponseLine('\n⚠️ **No content scripts defined**');
        response.appendResponseLine(
          '\nThis extension has no content_scripts configured in manifest.json.',
        );
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
      response.appendResponseLine(
        `## Content Script Rules (${contentScripts.length})\n`,
      );

      const matchResults: Array<{
        rule: unknown;
        index: number;
        shouldInject: boolean;
        reason: string;
        files: string[];
      }> = [];

      for (let i = 0; i < contentScripts.length; i++) {
        const rule = contentScripts[i] as {
          matches?: string[];
          exclude_matches?: string[];
          js?: string[];
          css?: string[];
          run_at?: string;
        };
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
        const icon =
          testUrl && matchResult
            ? matchResult.shouldInject
              ? '✅'
              : '❌'
            : '📋';
        response.appendResponseLine(`### ${icon} Rule ${i + 1}`);

        if (detailed || testUrl) {
          response.appendResponseLine(
            `**Match Patterns** (${matches.length}):`,
          );
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
            response.appendResponseLine(
              `**Exclude Patterns** (${excludeMatches.length}):`,
            );
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

        response.appendResponseLine(
          `**Files** (${js.length + css.length}): ${[...js, ...css].join(', ') || 'None'}`,
        );
        response.appendResponseLine(
          `**Run At**: ${rule.run_at || 'document_idle'}`,
        );

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
          response.appendResponseLine(
            '❌ **No content scripts match this URL**\n',
          );
          response.appendResponseLine('**This means**:');
          response.appendResponseLine(
            '- Content scripts will NOT be injected on this page',
          );
          response.appendResponseLine(
            '- The extension cannot interact with this page via content scripts\n',
          );

          response.appendResponseLine('**Possible solutions**:');
          response.appendResponseLine(
            '1. Add a match pattern that covers this URL',
          );
          response.appendResponseLine(
            '2. Use a broader pattern like `*://*/*` (all sites)',
          );
          response.appendResponseLine(
            '3. Check if the URL protocol is correct (http/https)',
          );
          if (extension.manifestVersion === 3) {
            response.appendResponseLine(
              '4. Ensure `host_permissions` includes this domain',
            );
          }
        } else {
          const matchingRules = matchResults.filter(r => r.shouldInject);
          response.appendResponseLine(
            `✅ **${matchingRules.length} rule(s) match this URL**\n`,
          );
          response.appendResponseLine('**This means**:');
          response.appendResponseLine(
            '- Content scripts SHOULD be injected on this page',
          );
          response.appendResponseLine(
            '- Scripts will run according to their `run_at` timing\n',
          );

          matchingRules.forEach(r => {
            const typedRule = r.rule as {run_at?: string};
            response.appendResponseLine(
              `- **Rule ${r.index + 1}**: ${r.files.length} file(s) at ${typedRule.run_at || 'document_idle'}`,
            );
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
        response.appendResponseLine(
          '- Call this tool again with `testUrl` parameter',
        );
        response.appendResponseLine(
          '- Example: `testUrl: "https://example.com/page"`\n',
        );

        response.appendResponseLine('**General tips**:');
        response.appendResponseLine(
          '- Use `*://*/*` to match all HTTP(S) pages',
        );
        response.appendResponseLine(
          '- Use `*://example.com/*` to match all pages on a domain',
        );
        response.appendResponseLine(
          '- `<all_urls>` matches all protocols including file://',
        );
        response.appendResponseLine(
          "- Content scripts won't run on chrome:// or chrome-extension:// pages",
        );
      }

      response.appendResponseLine(`\n## 💡 Verification Methods\n`);
      response.appendResponseLine('**Check if content script is running**:');
      response.appendResponseLine('```javascript');
      response.appendResponseLine('// Add to your content script:');
      response.appendResponseLine(
        `console.log("✅ Content script loaded:", chrome.runtime.id);`,
      );
      response.appendResponseLine('```');
      response.appendResponseLine('\n**Or check in browser console**:');
      response.appendResponseLine('```javascript');
      response.appendResponseLine('// This only works if your script sets it:');
      response.appendResponseLine(`window.MY_EXTENSION_LOADED === true`);
      response.appendResponseLine('```');
    } catch {
      // ✅ Following navigate_page_history pattern: simple error message
      response.appendResponseLine(
        'Unable to check content script injection. The extension may be inactive or disabled.',
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
      return (
        urlObj.protocol === 'http:' ||
        urlObj.protocol === 'https:' ||
        urlObj.protocol === 'file:'
      );
    }

    // 解析 pattern: scheme://host/path
    const patternParts = pattern.match(
      /^(\*|https?|file|ftp):\/\/([^/]+)(\/.*)$/,
    );
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
  } catch (_e) {
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
  manifest: unknown,
  manifestVersion: number,
  pageUrl: string,
  matchResults: Array<{rule: unknown; shouldInject: boolean}>,
  shouldInjectAny: boolean,
): string[] {
  const recommendations: string[] = [];

  if (!shouldInjectAny) {
    // 没有匹配的规则
    recommendations.push(
      'Update match patterns in manifest.json to include this URL',
    );
    recommendations.push(
      'Consider using broader patterns like `*://*/*` for testing',
    );

    if (manifestVersion === 3) {
      recommendations.push(
        'Ensure host_permissions in manifest.json include this domain',
      );
    }
  } else {
    // 应该注入但可能有问题
    recommendations.push('Reload the page to ensure content scripts inject');
    recommendations.push('Check browser console for any content script errors');
    recommendations.push(
      'Use `get_background_logs` to see content script logs',
    );

    if (manifestVersion === 3) {
      recommendations.push('Verify host_permissions are declared and granted');
    }

    // 检查 run_at 时机
    const hasDocumentStart = matchResults.some(
      r => (r.rule as {run_at?: string}).run_at === 'document_start',
    );
    if (hasDocumentStart) {
      recommendations.push(
        'document_start scripts run very early - ensure DOM is ready before accessing it',
      );
    }
  }

  recommendations.push(
    'Use `get_extension_runtime_errors` to check for errors',
  );

  return recommendations;
}
