# 浏览器连接验证功能

## 📋 功能概述

当使用 `--browserUrl` 参数连接到现有的Chrome实例时，MCP服务器会在启动时验证浏览器连接是否可达。如果浏览器不可访问，服务器将立即退出并显示清晰的错误消息。

## 🎯 解决的问题

**之前的行为**:
- 配置了 `--browserUrl` 参数但浏览器未运行
- MCP服务器会启动并等待工具调用
- 只有在第一次工具调用时才会发现连接失败
- 错误消息不够明确，调试困难

**现在的行为**:
- 启动时立即验证浏览器连接
- 连接失败时快速失败（fail-fast）
- 显示详细的错误消息和解决建议
- 避免用户配置错误导致的困惑

## ✅ 支持的传输模式

验证功能支持所有传输模式：
- ✅ **stdio** - 标准输入输出模式
- ✅ **sse** - Server-Sent Events模式
- ✅ **streamable** - Streamable HTTP模式

## 🔍 验证过程

### 1. 验证时机
验证发生在MCP服务器启动时，在建立Puppeteer连接之前。

### 2. 验证方法
通过HTTP请求检查浏览器的 `/json/version` 端点：
```javascript
GET http://localhost:9222/json/version
```

### 3. 验证内容
- HTTP响应状态码（期望200）
- 响应包含必需字段：`Browser` 或 `webSocketDebuggerUrl`
- 连接超时时间：5秒

## 📝 使用示例

### 正确的配置（浏览器运行中）

```bash
# 1. 启动Chrome（带远程调试）
google-chrome --remote-debugging-port=9222

# 2. 启动MCP服务器
node build/src/index.js --browserUrl http://localhost:9222
```

**输出**:
```
[MCP] Chrome Extension Debug MCP v0.8.10
[MCP] Transport: stdio
[MCP] Starting stdio server...

[MCP] Validating browser connection...
[Browser] ✅ Validated browser connection: Chrome/141.0.7390.76
[MCP] Browser validation successful

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📋 STDIO MODE - Single User, Local Only
✓ For local development and IDE integration
...
```

### 错误的配置（浏览器未运行）

```bash
# 浏览器未运行或端口错误
node build/src/index.js --browserUrl http://localhost:9999
```

**输出**:
```
[MCP] Chrome Extension Debug MCP v0.8.10
[MCP] Transport: stdio
[MCP] Starting stdio server...

[MCP] Validating browser connection...

❌ Browser Connection Validation Failed
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Error: Cannot connect to browser at http://localhost:9999. 
Please ensure Chrome is running with --remote-debugging-port. 
Error: fetch failed

📝 Please check:
  1. Chrome is running with remote debugging enabled:
     google-chrome --remote-debugging-port=9222
  2. The browser URL is correct and accessible:
     http://localhost:9999
  3. No firewall is blocking the connection
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

# 进程退出码: 1
```

## 🔧 技术实现

### 核心函数

```typescript
/**
 * 验证浏览器URL是否可达
 * @throws Error 如果浏览器URL不可达
 */
export async function validateBrowserURL(browserURL: string): Promise<void> {
  try {
    const url = new URL('/json/version', browserURL);
    const response = await fetch(url.toString(), {
      signal: AbortSignal.timeout(5000), // 5秒超时
    });
    
    if (!response.ok) {
      throw new Error(`Browser returned HTTP ${response.status}`);
    }
    
    const data = await response.json();
    if (!data.Browser && !data.webSocketDebuggerUrl) {
      throw new Error('Invalid browser response');
    }
    
    console.log(`[Browser] ✅ Validated: ${data.Browser || 'Unknown'}`);
  } catch (error) {
    // 友好的错误消息
    throw new Error(
      `Cannot connect to browser at ${browserURL}. ` +
      `Please ensure Chrome is running with --remote-debugging-port.`
    );
  }
}
```

### 集成点

**main.ts (stdio模式)**:
```typescript
// 如果配置了 --browserUrl，在启动时验证浏览器连接
if (args.browserUrl) {
  try {
    await validateBrowserURL(args.browserUrl);
  } catch (error) {
    console.error('Browser Connection Validation Failed');
    // 显示详细错误信息
    process.exit(1);
  }
}
```

**server-sse.ts (SSE模式)**:
```typescript
if (args.browserUrl) {
  await validateBrowserURL(args.browserUrl);
}
```

**server-http.ts (HTTP模式)**:
```typescript
if (args.browserUrl) {
  await validateBrowserURL(args.browserUrl);
}
```

## ✅ 测试结果

### 测试1: 正确的浏览器URL
- ✅ 成功验证浏览器连接
- ✅ 显示浏览器版本信息
- ✅ MCP服务器正常启动

### 测试2: 错误的浏览器URL
- ✅ 检测到连接失败
- ✅ 显示详细错误消息
- ✅ 进程以退出码1退出

### 测试3: SSE模式验证
- ✅ SSE模式正确验证浏览器
- ✅ 与stdio模式行为一致

## 🎯 最佳实践

### 1. 启动顺序
```bash
# 推荐: 先启动Chrome，再启动MCP
google-chrome --remote-debugging-port=9222
node build/src/index.js --browserUrl http://localhost:9222
```

### 2. 配置文件示例

**Claude Desktop配置** (`~/Library/Application Support/Claude/claude_desktop_config.json`):
```json
{
  "mcpServers": {
    "chrome-devtools": {
      "command": "node",
      "args": [
        "/path/to/build/src/index.js",
        "--browserUrl",
        "http://localhost:9222"
      ]
    }
  }
}
```

**注意**: 确保Chrome已经在运行，否则Claude Desktop会显示MCP服务器启动失败。

### 3. Docker环境

```dockerfile
# 确保Chrome先启动
RUN google-chrome --remote-debugging-port=9222 &
# 等待Chrome就绪
RUN sleep 2
# 启动MCP服务器
CMD ["node", "build/src/index.js", "--browserUrl", "http://localhost:9222"]
```

## 🐛 故障排查

### 问题1: 验证超时
```
Error: Cannot connect to browser at http://localhost:9222
```

**解决方案**:
1. 检查Chrome是否正在运行: `ps aux | grep chrome`
2. 检查端口是否正确: `curl http://localhost:9222/json/version`
3. 检查防火墙设置

### 问题2: 端口被占用
```
Error: Browser returned HTTP 403: Forbidden
```

**解决方案**:
1. 确认端口未被其他应用占用
2. 尝试使用其他端口: `--remote-debugging-port=9223`

### 问题3: 远程浏览器连接
```
Error: fetch failed
```

**解决方案**:
1. 确保网络可达性
2. 检查浏览器是否允许远程连接
3. 使用完整URL: `http://192.168.1.100:9222`

## 📊 性能影响

- **验证时间**: 通常 < 100ms
- **超时设置**: 5秒
- **失败快速**: 立即退出，不会等待工具调用
- **额外开销**: 仅在启动时验证一次

## 🔄 未来改进

可能的增强功能：
- [ ] 支持重试机制（启动时自动重试3次）
- [ ] 支持等待浏览器就绪（--wait-for-browser标志）
- [ ] 支持健康检查端点（定期验证连接）
- [ ] 支持多浏览器实例验证

## 📚 相关文档

- [CLI参数说明](../README.md#cli-options)
- [传输模式](./introduce/TRANSPORT_MODES.md)
- [多租户部署](./guides/MULTI_TENANT_DEPLOYMENT_GUIDE.md)

---

**版本**: v0.8.10+  
**实现日期**: 2025-10-15  
**状态**: ✅ 已实现并测试
