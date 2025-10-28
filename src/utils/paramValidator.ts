/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * 参数验证器 - 提供友好的错误提示
 */

interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

interface ParsedArgs {
  browserUrl?: string;
  channel?: string;
  executablePath?: string;
  transport?: 'stdio' | 'sse' | 'streamable';
  port?: number;
  headless?: boolean;
  isolated?: boolean;
  viewport?: {width: number; height: number};
  proxyServer?: string;
  chromeArg?: string[];
  acceptInsecureCerts?: boolean;
  [key: string]: unknown;
}

const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const BLUE = '\x1b[34m';
const GREEN = '\x1b[32m';
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';

export class ParameterValidator {
  /**
   * 验证参数配置
   */
  static validate(args: ParsedArgs): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // 规则 1: 浏览器来源互斥
    this.checkBrowserSourceConflicts(args, errors);

    // 规则 2: stdio 模式不需要端口
    this.checkStdioPortConflict(args, warnings);

    // 规则 3: browserUrl 时浏览器控制选项无效
    this.checkBrowserControlOptions(args, warnings);

    // 规则 4: 端口范围验证
    this.checkPortRange(args, errors, warnings);

    // 规则 5: headless 模式 viewport 限制
    this.checkHeadlessViewport(args, warnings);

    // 规则 6: URL 格式验证（已在 cli.ts 中处理）

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * 检查浏览器来源冲突
   */
  private static checkBrowserSourceConflicts(
    args: ParsedArgs,
    errors: string[],
  ): void {
    const sources: Array<{name: string; value: unknown}> = [
      {name: '--browserUrl', value: args.browserUrl},
      {name: '--channel', value: args.channel},
      {name: '--executablePath', value: args.executablePath},
    ];

    const activeSources = sources.filter(s => s.value);

    if (activeSources.length > 1) {
      errors.push(this.formatConflictError(activeSources));
    }
  }

  /**
   * 格式化冲突错误消息
   */
  private static formatConflictError(
    sources: Array<{name: string; value: unknown}>,
  ): string {
    const sourceList = sources.map(s => `  ${s.name}`).join('\n');

    return `
${RED}${BOLD}❌ 配置冲突${RESET}

不能同时使用以下选项：
${sourceList}

${BOLD}原因：${RESET}
  --browserUrl      用于${BLUE}连接现有的浏览器${RESET}
  --channel         用于${BLUE}启动指定渠道的新浏览器${RESET}
  --executablePath  用于${BLUE}启动自定义路径的新浏览器${RESET}

${BOLD}解决方案（选择其一）：${RESET}

  ${GREEN}方案1: 连接现有浏览器${RESET}
    $ chrome-extension-debug-mcp --browserUrl http://localhost:9222

  ${GREEN}方案2: 启动Chrome Stable${RESET}
    $ chrome-extension-debug-mcp

  ${GREEN}方案3: 启动Chrome Canary${RESET}
    $ chrome-extension-debug-mcp --channel canary

  ${GREEN}方案4: 使用自定义Chrome路径${RESET}
    $ chrome-extension-debug-mcp --executablePath /path/to/chrome
`;
  }

  /**
   * 检查 stdio 模式的端口配置
   */
  private static checkStdioPortConflict(
    args: ParsedArgs,
    warnings: string[],
  ): void {
    const transport = args.transport || 'stdio';

    if (transport === 'stdio' && args.port) {
      warnings.push(`
${YELLOW}${BOLD}⚠️  配置警告${RESET}

当前配置：
  --transport stdio ${BLUE}(默认)${RESET}
  --port ${args.port}

${BOLD}问题：${RESET}
  stdio 模式${RED}不需要${RESET} --port 参数

${BOLD}说明：${RESET}
  stdio 使用标准输入输出进行通信，不是HTTP服务器。
  --port 参数仅在 HTTP 传输模式下有效。

${BOLD}建议（选择其一）：${RESET}

  ${GREEN}方案1: 使用 stdio 模式（移除 --port）${RESET}
    $ chrome-extension-debug-mcp

  ${GREEN}方案2: 使用 SSE 模式${RESET}
    $ chrome-extension-debug-mcp --transport sse --port ${args.port}

  ${GREEN}方案3: 使用 Streamable HTTP 模式${RESET}
    $ chrome-extension-debug-mcp --transport streamable --port ${args.port}
`);
    }
  }

  /**
   * 检查 browserUrl 时浏览器控制选项
   */
  private static checkBrowserControlOptions(
    args: ParsedArgs,
    warnings: string[],
  ): void {
    if (!args.browserUrl) {
      return;
    }

    const controlOptions = [
      {name: '--headless', value: args.headless},
      {name: '--isolated', value: args.isolated},
      {name: '--viewport', value: args.viewport},
      {name: '--proxyServer', value: args.proxyServer},
      {name: '--chromeArg', value: args.chromeArg && args.chromeArg.length > 0},
      {name: '--acceptInsecureCerts', value: args.acceptInsecureCerts},
    ];

    const activeOptions = controlOptions.filter(o => o.value);

    if (activeOptions.length === 0) {
      return;
    }

    const optionList = activeOptions.map(o => `  ${o.name}`).join('\n');

    warnings.push(`
${YELLOW}${BOLD}⚠️  配置警告${RESET}

当前配置：
  --browserUrl ${args.browserUrl}
${activeOptions.map(o => `  ${o.name}`).join('\n')}

${BOLD}问题：${RESET}
  使用 --browserUrl 连接现有浏览器时，
  以下选项将${RED}被忽略${RESET}：

${optionList}

${BOLD}说明：${RESET}
  这些选项仅在${BLUE}启动新浏览器${RESET}时有效。
  连接到现有浏览器时，浏览器已经在运行，
  无法更改这些启动参数。

${BOLD}建议：${RESET}

  ${GREEN}方案1: 仅连接现有浏览器（移除无效选项）${RESET}
    $ chrome-extension-debug-mcp --browserUrl ${args.browserUrl}

  ${GREEN}方案2: 启动新浏览器（移除 --browserUrl）${RESET}
    $ chrome-extension-debug-mcp --headless --isolated
`);
  }

  /**
   * 检查端口范围
   */
  private static checkPortRange(
    args: ParsedArgs,
    errors: string[],
    warnings?: string[],
  ): void {
    if (!args.port) {
      return;
    }

    if (args.port < 1 || args.port > 65535) {
      errors.push(`
${RED}${BOLD}❌ 无效的端口号${RESET}

当前配置：
  --port ${args.port}

${BOLD}问题：${RESET}
  端口号必须在 ${BLUE}1-65535${RESET} 之间

${BOLD}建议：${RESET}
  使用常见端口：
    32122  - SSE 模式默认端口
    32123  - Streamable HTTP 模式默认端口
    3000   - 常用开发端口
    8080   - 常用服务端口
`);
    }

    // 检查常见的保留端口
    const reservedPorts = [22, 25, 80, 443, 3306, 5432, 6379, 27017];
    if (warnings && args.port < 1024 && reservedPorts.includes(args.port)) {
      warnings.push(`
${YELLOW}${BOLD}⚠️  使用保留端口${RESET}

当前配置：
  --port ${args.port}

${BOLD}警告：${RESET}
  端口 ${args.port} 是系统保留端口，可能需要管理员权限。

${BOLD}建议：${RESET}
  使用 1024 以上的端口：
    $ chrome-extension-debug-mcp --transport sse --port 32122
`);
    }
  }

  /**
   * 检查 headless 模式的 viewport 限制
   */
  private static checkHeadlessViewport(
    args: ParsedArgs,
    warnings: string[],
  ): void {
    if (!args.headless || !args.viewport) {
      return;
    }

    const {width, height} = args.viewport;
    const maxWidth = 3840;
    const maxHeight = 2160;

    if (width > maxWidth || height > maxHeight) {
      warnings.push(`
${YELLOW}${BOLD}⚠️  viewport 超出限制${RESET}

当前配置：
  --headless
  --viewport ${width}x${height}

${BOLD}问题：${RESET}
  headless 模式下，viewport 最大为 ${BLUE}${maxWidth}x${maxHeight}${RESET}
  当前设置超出限制

${BOLD}建议：${RESET}
  调整 viewport 大小：
    $ chrome-extension-debug-mcp --headless --viewport 1920x1080
    $ chrome-extension-debug-mcp --headless --viewport 2560x1440
    $ chrome-extension-debug-mcp --headless --viewport 3840x2160
`);
    }
  }

  /**
   * 显示验证结果
   */
  static displayResults(result: ValidationResult): void {
    // 显示错误
    if (result.errors.length > 0) {
      console.error('');
      result.errors.forEach(error => console.error(error));
      console.error('');
      console.error(
        `${RED}${BOLD}Startup failed${RESET}: Please fix the configuration errors above\n`,
      );
    }

    // 显示警告
    if (result.warnings.length > 0) {
      console.warn('');
      result.warnings.forEach(warning => console.warn(warning));
      console.warn('');
    }
  }

  /**
   * 显示配置摘要（成功时）
   */
  static displayConfigSummary(args: ParsedArgs): void {
    const transport = args.transport || 'stdio';

    console.log(`${BOLD}📋 Configuration Summary${RESET}`);
    console.log('');

    // 传输模式
    console.log(`${BOLD}Transport:${RESET} ${GREEN}${transport}${RESET}`);
    if (transport !== 'stdio' && args.port) {
      console.log(`${BOLD}Port:${RESET} ${GREEN}${args.port}${RESET}`);
    }

    // 浏览器配置
    console.log('');
    console.log(`${BOLD}Browser Configuration:${RESET}`);
    if (args.browserUrl) {
      console.log(`  ${BLUE}Connect to:${RESET} ${args.browserUrl}`);
    } else if (args.executablePath) {
      console.log(`  ${BLUE}Using:${RESET} ${args.executablePath}`);
    } else {
      const channel = args.channel || 'stable';
      console.log(`  ${BLUE}Launch:${RESET} Chrome ${channel}`);

      if (args.headless) {
        console.log(`  ${BLUE}Mode:${RESET} headless`);
      }
      if (args.isolated) {
        console.log(`  ${BLUE}Profile:${RESET} Temporary (auto-cleanup)`);
      }
      if (args.viewport) {
        console.log(
          `  ${BLUE}viewport:${RESET} ${args.viewport.width}x${args.viewport.height}`,
        );
      }
    }

    console.log('');
  }
}
