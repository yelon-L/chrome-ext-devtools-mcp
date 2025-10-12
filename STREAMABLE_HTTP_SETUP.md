# Streamable HTTP MCP 服务器配置指南

## 问题诊断

你遇到的问题是：IDE 配置了 MCP 客户端，但提示"没有工具或者 prompts 或者资源"。

### 根本原因

Streamable HTTP 协议要求客户端必须在请求头中包含：
```
Accept: application/json, text/event-stream
```

如果只发送 `Accept: application/json`，服务器会返回 406 错误。

## 正确的启动和配置步骤

### 1. 启动服务器

```bash
# 方式 1: 使用 npx
npx chrome-extension-debug-mcp@latest --transport streamable --browserUrl http://localhost:9222 --port 32123

# 方式 2: 使用本地构建
node build/src/index.js --transport streamable --browserUrl http://localhost:9222 --port 32123

# 方式 3: 使用打包的二进制文件
./chrome-extension-debug-mcp --transport streamable --browserUrl http://localhost:9222 --port 32123
```

### 2. 验证服务器状态

```bash
# 健康检查
curl http://localhost:32123/health

# 预期输出：
# {
#   "status": "ok",
#   "sessions": 0,
#   "browser": "connected",
#   "transport": "streamable-http"
# }
```

### 3. MCP 客户端配置

#### Claude Desktop 配置

编辑 `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) 或 `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "chrome-extension-debug": {
      "url": "http://localhost:32123/mcp"
    }
  }
}
```

**注意**：Claude Desktop 使用 Streamable HTTP 协议，会自动添加正确的 Accept 头。

#### Cline/Continue/Cursor 等 VSCode 扩展

这些扩展可能需要不同的配置格式：

**选项 A：如果支持 HTTP transport**
```json
{
  "mcpServers": {
    "chrome-extension-debug": {
      "transport": {
        "type": "streamable-http",
        "url": "http://localhost:32123/mcp"
      }
    }
  }
}
```

**选项 B：如果只支持 stdio，使用 stdio 模式**
```json
{
  "mcpServers": {
    "chrome-extension-debug": {
      "command": "npx",
      "args": [
        "chrome-extension-debug-mcp@latest",
        "--browserUrl",
        "http://localhost:9222"
      ]
    }
  }
}
```

### 4. 手动测试 MCP 协议

#### 测试 Initialize

```bash
curl -X POST http://localhost:32123/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "initialize",
    "params": {
      "protocolVersion": "2024-11-05",
      "capabilities": {},
      "clientInfo": {
        "name": "test-client",
        "version": "1.0"
      }
    }
  }'
```

**预期响应**：
```
HTTP/1.1 200 OK
Content-Type: text/event-stream
mcp-session-id: <uuid>

event: message
data: {"result":{"protocolVersion":"2024-11-05","capabilities":{"tools":{"listChanged":true}},"serverInfo":{"name":"chrome-devtools-mcp","version":"0.8.1"}},"jsonrpc":"2.0","id":1}
```

**重要**：从响应头提取 `mcp-session-id`，后续请求需要使用。

#### 测试 Tools/List

```bash
# 替换 <session-id> 为上一步获取的 Session ID
curl -X POST http://localhost:32123/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "Mcp-Session-Id: <session-id>" \
  -d '{
    "jsonrpc": "2.0",
    "id": 2,
    "method": "tools/list"
  }'
```

**预期响应**：
```
event: message
data: {"result":{"tools":[{"name":"list_extensions","description":"..."},...]},"jsonrpc":"2.0","id":2}
```

### 5. 常见问题排查

#### 问题 1：406 Not Acceptable

**错误信息**：
```json
{
  "jsonrpc": "2.0",
  "error": {
    "code": -32000,
    "message": "Not Acceptable: Client must accept both application/json and text/event-stream"
  }
}
```

**原因**：请求头缺少 `Accept: application/json, text/event-stream`

**解决方案**：
- 确保 MCP 客户端支持 Streamable HTTP 协议
- 或者改用 stdio 模式

#### 问题 2：Bad Request: Server not initialized

**错误信息**：
```json
{
  "jsonrpc": "2.0",
  "error": {
    "code": -32000,
    "message": "Bad Request: Server not initialized"
  }
}
```

**原因**：未先调用 `initialize` 方法，或 Session ID 不正确

**解决方案**：
1. 先调用 `initialize` 获取 Session ID
2. 后续请求带上正确的 `Mcp-Session-Id` 头

#### 问题 3：端口占用

**错误信息**：
```
❌ 端口 32123 已被占用
```

**解决方案**：
```bash
# 方案 1：使用其他端口
--port 8080

# 方案 2：查找占用端口的进程
# Windows
netstat -ano | findstr 32123

# Linux/Mac
lsof -i :32123

# 关闭占用进程
kill <PID>
```

## MCP 协议流程

### 标准连接流程

```
客户端                              服务器
  |                                   |
  |  POST /mcp (initialize)          |
  |---------------------------------->|
  |                                   | 创建会话
  |  200 OK + mcp-session-id         |
  |<----------------------------------|
  |                                   |
  |  POST /mcp (tools/list)          |
  |  Header: Mcp-Session-Id          |
  |---------------------------------->|
  |                                   |
  |  200 OK (工具列表)               |
  |<----------------------------------|
  |                                   |
  |  POST /mcp (tools/call)          |
  |  Header: Mcp-Session-Id          |
  |---------------------------------->|
  |                                   |
  |  200 OK (执行结果)               |
  |<----------------------------------|
```

### 会话管理

- 每个客户端连接创建一个会话
- Session ID 由服务器生成，通过响应头返回
- 客户端必须在后续请求中带上 Session ID
- 会话在连接关闭或超时后自动清理

## 测试脚本

我已经创建了测试脚本 `test-streamable.sh`：

```bash
chmod +x test-streamable.sh
./test-streamable.sh
```

这个脚本会：
1. 检查服务器健康状态
2. 执行 initialize 请求
3. 提取 Session ID
4. 执行 tools/list 请求

## 推荐的 IDE 配置

### Cursor

Cursor 支持 MCP stdio 传输，推荐使用：

```json
{
  "mcpServers": {
    "chrome-extension-debug": {
      "command": "npx",
      "args": [
        "chrome-extension-debug-mcp@latest",
        "--browserUrl",
        "http://localhost:9222"
      ]
    }
  }
}
```

### Windsurf

如果 Windsurf 支持 HTTP 传输：

```json
{
  "mcpServers": {
    "chrome-extension-debug": {
      "url": "http://localhost:32123/mcp",
      "transport": "streamable-http"
    }
  }
}
```

### 通用建议

1. **优先使用 stdio 模式**（最兼容）
2. 如果需要远程连接，才使用 HTTP 传输
3. 检查 IDE 的 MCP 实现是否符合标准

## 验证工具可用性

连接成功后，你应该能看到以下工具类别：

### Chrome Extension Debugging (8 tools)
- `list_extensions` - 列出所有扩展
- `get_extension_details` - 获取扩展详情
- `list_extension_contexts` - 列出执行上下文
- `switch_extension_context` - 切换上下文
- `inspect_extension_storage` - 检查存储
- `reload_extension` - 重新加载扩展
- `get_extension_logs` - 获取日志
- `evaluate_in_extension` - 执行代码

### 其他工具类别
- Input automation (7 tools)
- Navigation automation (7 tools)
- Emulation (3 tools)
- Performance (3 tools)
- Network (2 tools)
- Debugging (4 tools)

**总计**：约 34 个工具

## 日志调试

启动服务器时，你会看到详细日志：

```
[MCP] Chrome Extension Debug MCP v0.8.1
[MCP] Transport: streamable
[MCP] Starting Streamable HTTP server...
[MCP] Port: 32123

[HTTP] 🚀 初始化浏览器...
[Browser] 📡 连接到已有浏览器: http://localhost:9222
[HTTP] ✅ 浏览器已连接

╔════════════════════════════════════════════════════════╗
║   Chrome DevTools MCP - Streamable HTTP Server        ║
╚════════════════════════════════════════════════════════╝

[HTTP] 🌐 服务器已启动
[HTTP] 📡 端口: 32123
[HTTP] 🔗 端点:
       - Health: http://localhost:32123/health
       - MCP:    http://localhost:32123/mcp
       - Test:   http://localhost:32123/test

传输方式: Streamable HTTP (最新标准)
按 Ctrl+C 停止
```

每个请求会有日志输出：
```
[HTTP] POST /mcp, Session: new
[HTTP] ✅ 会话初始化: <uuid>
[HTTP] 📦 会话已保存: <uuid>, 总会话数: 1
```

## 下一步

1. 确认你的 IDE 支持哪种 MCP 传输方式
2. 使用对应的配置
3. 重启 IDE
4. 测试工具调用

如果还有问题，请提供：
- IDE 名称和版本
- MCP 客户端配置
- IDE 的错误日志
