# 浏览器绑定验证改进

## 概述

本次改进增强了多租户模式下的浏览器绑定验证，并添加了新的工具让 IDE 能够获取当前连接的浏览器信息。

## 改进内容

### 1. 多租户模式：严格的浏览器验证

**问题**：

- 之前注册用户时，即使浏览器不可访问，仍然会返回 `success: true`
- 更新浏览器 URL 时，检测失败也会返回成功
- 这导致用户配置了无效的浏览器，在实际使用时才会报错

**改进**：

- ✅ 注册时强制验证浏览器可访问性
- ✅ 浏览器检测失败时返回 `400` 错误，拒绝注册
- ✅ 提供详细的错误信息和友好的解决建议
- ✅ 更新浏览器 URL 时同样进行验证

#### API 变化

**注册用户 - 浏览器不可访问**

```bash
POST /api/register
{
  "userId": "alice",
  "browserURL": "http://invalid-host:9999"
}
```

**旧行为**（错误）：

```json
{
  "success": true,
  "userId": "alice",
  "browserURL": "http://invalid-host:9999",
  "browser": {
    "connected": false,
    "error": "...",
    "message": "Browser not accessible. You can still use the service..."
  }
}
```

**新行为**（正确）：

```json
{
  "error": "BROWSER_NOT_ACCESSIBLE",
  "message": "Cannot connect to the specified browser. Please ensure Chrome is running with remote debugging enabled.",
  "browserURL": "http://invalid-host:9999",
  "details": "fetch failed",
  "suggestions": [
    "Start Chrome with: chrome --remote-debugging-port=9999 --remote-debugging-address=0.0.0.0",
    "Verify the browser URL is correct and accessible",
    "Check firewall settings allow connections to the debugging port",
    "Ensure Chrome is running on the specified host and port"
  ]
}
```

**注册用户 - 浏览器可访问**

```bash
POST /api/register
{
  "userId": "alice",
  "browserURL": "http://localhost:9222"
}
```

**响应**（简化）：

```json
{
  "success": true,
  "userId": "alice",
  "browserURL": "http://localhost:9222",
  "browser": {
    "connected": true,
    "info": {
      "browser": "Chrome/131.0.6778.86",
      "protocolVersion": "1.3",
      "userAgent": "Mozilla/5.0 ...",
      "v8Version": "13.1.201.13"
    }
  },
  "message": "User registered successfully. Browser connected."
}
```

#### 影响

- 🔒 **更严格**：确保注册的用户都有可访问的浏览器
- 💡 **更清晰**：错误信息明确，建议具体
- 🛡️ **更可靠**：避免配置无效浏览器导致后续操作失败

### 2. 新工具：获取浏览器信息

**问题**：

- 非多租户模式（stdio/SSE）下，IDE 不知道连接的是哪个浏览器
- 用户可能有多个 Chrome 实例（不同端口），无法区分
- 调试时需要确认当前操作的是哪个浏览器

**解决方案**：
添加了两个新工具让 IDE 能够获取浏览器信息。

#### 工具 1: `get_connected_browser`

获取当前连接的浏览器信息。

**输入**：无参数

**输出示例**：

```
# Connected Browser Information

**Browser URL**: http://localhost:9222
**Version**: Chrome/131.0.6778.86
**Host**: localhost
**Port**: 9222
**WebSocket Endpoint**: ws://localhost:9222/devtools/browser/...
**Open Pages**: 5

You are currently debugging Chrome at **http://localhost:9222**.
```

**使用场景**：

```
User: 我现在连接的是哪个浏览器？
AI: 使用 get_connected_browser 工具查询

AI: 你当前连接的是 http://localhost:9222 的 Chrome（版本 131.0），
    该浏览器有 5 个打开的页面。
```

#### 工具 2: `list_browser_capabilities`

列出浏览器支持的 Chrome DevTools Protocol (CDP) 功能。

**输入**：无参数

**输出示例**：

```
# Browser Capabilities

**Supported CDP Domains**: 78

**Available Domains**:
- Accessibility
- Animation
- Audits
- BackgroundService
- Browser
- CacheStorage
- Console
- DOM
- DOMDebugger
- DOMStorage
...

These domains represent the Chrome DevTools Protocol features
available for automation and debugging.
```

**使用场景**：

- 检查浏览器是否支持特定的 CDP 功能
- 调试 CDP 相关问题
- 了解可用的自动化能力

### 3. 工具分类更新

添加了新的工具分类：

```typescript
export enum ToolCategories {
  // ... 其他分类
  BROWSER_INFO = 'Browser information',
}
```

这使得浏览器信息相关的工具更易于发现和管理。

## 使用示例

### 多租户模式：浏览器绑定验证

```bash
# 测试脚本
bash docs/examples/test-browser-binding.sh

# 或者手动测试
curl -X POST http://localhost:32136/api/register \
  -H "Content-Type: application/json" \
  -d '{"userId":"test-user","browserURL":"http://invalid:9999"}'

# 预期：返回 400 错误和友好的错误提示
```

### 使用新工具

**在 MCP 客户端中**：

```
User: 告诉我当前连接的浏览器信息

AI: [调用 get_connected_browser 工具]

    你当前连接的是 http://localhost:9222 的 Chrome (版本 131.0)。
    这个浏览器有 3 个打开的页面。
```

## 技术细节

### 代码变更

1. **浏览器检测逻辑**（`detectBrowser` 方法）
   - 保持不变，返回连接状态和浏览器信息

2. **注册处理**（`handleRegister` 方法）

   ```typescript
   // 检测浏览器连接
   const browserDetection = await this.detectBrowser(browserURL);

   // 如果浏览器检测失败，拒绝注册
   if (!browserDetection.connected) {
     res.writeHead(400, { 'Content-Type': 'application/json' });
     res.end(JSON.stringify({
       error: 'BROWSER_NOT_ACCESSIBLE',
       message: '...',
       suggestions: [...]
     }));
     return;
   }
   ```

3. **浏览器更新**（`handleUpdateBrowser` 方法）
   - 同样的验证逻辑
   - 检测失败时不更新存储

4. **新工具实现**（`src/tools/browser-info.ts`）
   - `get_connected_browser`: 从 Puppeteer Browser 对象获取信息
   - `list_browser_capabilities`: 通过 CDP 获取支持的 domains

### 数据流

```
用户注册请求
    ↓
检测浏览器（HTTP GET /json/version）
    ↓
┌─────────────┬────────────────┐
│  成功       │    失败        │
├─────────────┼────────────────┤
│ 注册用户    │ 返回 400 错误  │
│ 返回浏览器  │ 包含建议       │
│ 信息        │ 不创建用户     │
└─────────────┴────────────────┘
```

## 迁移指南

### 现有用户

如果你已经注册了浏览器不可访问的用户，需要：

1. **删除无效用户**（未来版本会提供 API）
2. **确保浏览器运行**
3. **重新注册用户**

### API 客户端

如果你编写了自动化脚本调用注册 API：

**旧代码**：

```bash
# 总是检查 success 字段
response=$(curl ... /api/register)
if [ "$(echo $response | jq -r '.success')" == "true" ]; then
  # 但 browser.connected 可能是 false！
fi
```

**新代码**：

```bash
# 检查 HTTP 状态码
response=$(curl -w "%{http_code}" ... /api/register)
http_code=$(echo "$response" | tail -n1)
body=$(echo "$response" | sed '$d')

if [ "$http_code" == "200" ]; then
  echo "注册成功"
else
  echo "注册失败: $(echo $body | jq -r '.error')"
  echo "建议: $(echo $body | jq -r '.suggestions[]')"
fi
```

## 最佳实践

### 1. 先启动浏览器，再注册用户

```bash
# 1. 启动 Chrome
google-chrome \
  --remote-debugging-port=9222 \
  --remote-debugging-address=0.0.0.0 \
  --user-data-dir=/tmp/chrome-debug &

# 2. 等待浏览器启动
sleep 2

# 3. 注册用户
curl -X POST http://localhost:32136/api/register \
  -H "Content-Type: application/json" \
  -d '{"userId":"alice","browserURL":"http://localhost:9222"}'
```

### 2. 使用工具确认连接

在开始调试前，使用 `get_connected_browser` 确认连接的浏览器：

```
User: 确认当前浏览器连接

AI: [调用 get_connected_browser]
    已确认连接到 http://localhost:9222 (Chrome 131.0)
```

### 3. 错误处理

注册失败时，查看建议并逐项检查：

```json
{
  "suggestions": [
    "Start Chrome with: chrome --remote-debugging-port=9222 ...",
    "Verify the browser URL is correct and accessible",
    "Check firewall settings ...",
    "Ensure Chrome is running ..."
  ]
}
```

## 未来改进

### 短期计划

- [ ] 提供 DELETE /api/users/{userId} 删除用户
- [ ] 注册时提供 `skipBrowserCheck` 选项（用于特殊场景）
- [ ] 浏览器健康检查定时任务

### 长期计划

- [ ] 支持浏览器自动重连
- [ ] 浏览器连接池管理
- [ ] 多浏览器负载均衡

## 相关文档

- [多租户架构分析](../analysis/BROWSER_TOKEN_BINDING_ARCHITECTURE.md)
- [多租户快速开始](../guides/MULTI_TENANT_QUICK_START.md)
- [API 参考](../api/MULTI_TENANT_API.md)

## 反馈

如有问题或建议，请：

- 提交 Issue: https://github.com/ChromeDevTools/chrome-devtools-mcp/issues
- 讨论: https://github.com/ChromeDevTools/chrome-devtools-mcp/discussions
