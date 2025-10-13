# 参数关系和验证规则

## 参数依赖关系图

```
浏览器来源（三选一）
├─ --browserUrl        ← 连接现有浏览器
├─ --channel           ← 启动指定渠道的Chrome
└─ --executablePath    ← 使用自定义Chrome路径

传输模式
├─ --transport stdio      → --port 无效
├─ --transport sse        → --port 有效（默认32122）
└─ --transport streamable → --port 有效（默认32123）

浏览器控制（仅在启动新浏览器时有效）
├─ --headless
├─ --isolated
├─ --viewport
├─ --proxyServer
├─ --acceptInsecureCerts
└─ --chromeArg
```

## 互斥关系

### 1. 浏览器来源互斥
```
--browserUrl ⊗ --channel
--browserUrl ⊗ --executablePath
--channel ⊗ --executablePath
```

**原因**: 不能同时"连接现有浏览器"和"启动新浏览器"

### 2. 浏览器控制选项依赖
```
--headless       ⟹ 需要启动新浏览器
--isolated       ⟹ 需要启动新浏览器
--viewport       ⟹ 需要启动新浏览器
--proxyServer    ⟹ 需要启动新浏览器
--chromeArg      ⟹ 需要启动新浏览器
```

**警告**: 当使用 `--browserUrl` 时，这些选项无效

### 3. 传输模式和端口
```
--transport stdio ⊗ --port
--transport sse   ✓ --port
--transport streamable ✓ --port
```

## 验证规则

### 规则 1: 浏览器来源唯一性
```javascript
if (browserUrl && channel) {
  ❌ "不能同时指定 --browserUrl 和 --channel"
}
if (browserUrl && executablePath) {
  ❌ "不能同时指定 --browserUrl 和 --executablePath"
}
if (channel && executablePath) {
  ❌ "不能同时指定 --channel 和 --executablePath"
}
```

### 规则 2: 浏览器控制选项警告
```javascript
if (browserUrl && (headless || isolated || viewport || proxyServer || chromeArg)) {
  ⚠️ "使用 --browserUrl 连接现有浏览器时，以下选项将被忽略：
      --headless, --isolated, --viewport, --proxyServer, --chromeArg
      这些选项仅在启动新浏览器时有效"
}
```

### 规则 3: stdio 模式端口检查
```javascript
if (transport === 'stdio' && port) {
  ⚠️ "stdio 模式不需要 --port 参数（stdio 使用标准输入输出，不是HTTP服务器）
      提示：如需HTTP服务器，使用 --transport sse 或 --transport streamable"
}
```

### 规则 4: URL 格式验证
```javascript
if (browserUrl && !isValidUrl(browserUrl)) {
  ❌ "无效的 --browserUrl: ${browserUrl}
      示例: http://localhost:9222"
}
```

### 规则 5: viewport 格式验证
```javascript
if (viewport && !viewport.match(/^\d+x\d+$/)) {
  ❌ "无效的 --viewport: ${viewport}
      格式: 宽度x高度（例如: 1920x1080）"
}
```

### 规则 6: 端口范围验证
```javascript
if (port && (port < 1 || port > 65535)) {
  ❌ "无效的端口号: ${port}
      端口号必须在 1-65535 之间"
}
```

### 规则 7: headless 模式 viewport 限制
```javascript
if (headless && viewport) {
  const {width, height} = viewport;
  if (width > 3840 || height > 2160) {
    ⚠️ "headless 模式下，viewport 最大为 3840x2160"
  }
}
```

## 错误消息模板

### 互斥错误
```
❌ 配置冲突

不能同时使用以下选项：
  --browserUrl http://localhost:9222
  --channel canary

原因：
  --browserUrl 用于连接现有的浏览器
  --channel 用于启动新的浏览器
  
解决方案：
  方案1: 连接现有浏览器
    chrome-extension-debug-mcp --browserUrl http://localhost:9222
    
  方案2: 启动新浏览器
    chrome-extension-debug-mcp --channel canary
```

### 无效选项警告
```
⚠️  配置警告

当前配置：
  --browserUrl http://localhost:9222
  --headless
  --isolated
  
问题：
  使用 --browserUrl 连接现有浏览器时，
  以下选项将被忽略：--headless, --isolated
  
说明：
  这些选项仅在启动新浏览器时有效。
  连接到现有浏览器时，浏览器已经在运行，
  无法更改这些设置。
  
建议：
  如需控制浏览器启动参数，请移除 --browserUrl，
  让 MCP 服务器自动启动浏览器。
```

### stdio + port 警告
```
⚠️  配置警告

当前配置：
  --transport stdio (默认)
  --port 3000
  
问题：
  stdio 模式不需要 --port 参数
  
说明：
  stdio 使用标准输入输出进行通信，不是HTTP服务器。
  --port 参数仅在 HTTP 传输模式下有效。
  
建议：
  方案1: 使用 stdio（移除 --port）
    chrome-extension-debug-mcp
    
  方案2: 使用 HTTP 传输（SSE）
    chrome-extension-debug-mcp --transport sse --port 3000
```

## 验证时机

### 启动时验证（必须）
- 互斥关系检查
- URL 格式验证
- 端口范围验证
- viewport 格式验证

### 运行时警告（建议）
- 无效选项组合
- 被忽略的参数

## 友好提示原则

1. **清晰说明问题**: 什么配置有问题
2. **解释原因**: 为什么这是问题
3. **提供解决方案**: 如何修正（给出具体命令）
4. **使用示例**: 展示正确的用法
5. **分级处理**: 
   - ❌ 严重错误 → 阻止启动
   - ⚠️ 警告 → 显示但继续运行
   - ℹ️ 提示 → 优化建议
