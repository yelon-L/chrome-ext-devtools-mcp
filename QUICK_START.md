# Chrome DevTools MCP - 快速开始

## 3 种使用方式

### 方式 1: NPM 全局安装（推荐）

```bash
# 安装
npm install -g chrome-devtools-mcp

# 使用
chrome-devtools-mcp --browser-url http://localhost:9222
```

### 方式 2: NPX（无需安装）

```bash
npx chrome-devtools-mcp --browser-url http://localhost:9222
```

### 方式 3: 本地开发

```bash
# 克隆项目
git clone https://github.com/your-repo/chrome-ext-devtools-mcp.git
cd chrome-ext-devtools-mcp

# 安装依赖并编译
npm install
npm run build

# 方式 A: 使用快捷脚本
./scripts/start-mcp.sh --browser-url http://localhost:9222

# 方式 B: 直接运行
node build/src/index.js --browser-url http://localhost:9222
```

---

## IDE 集成配置

### 自动生成配置

```bash
# 生成所有 IDE 配置文件
npm run generate-config

# 配置文件位置：
# - .vscode/settings.json (VS Code)
# - configs/cline_mcp_settings.json (Cline)
# - configs/claude_desktop_config.json (Claude Desktop)
# - configs/cursor_mcp_settings.json (Cursor)
```

### VS Code

**方式 1: 使用生成的配置**

复制 `.vscode/settings.json` 内容到你的项目设置。

**方式 2: 使用 NPX（推荐）**

在 VS Code 设置中添加：

```json
{
  "mcp.servers": {
    "chrome-devtools": {
      "command": "npx",
      "args": ["-y", "chrome-devtools-mcp", "--browser-url", "http://localhost:9222"]
    }
  }
}
```

### Cline (VS Code Extension)

1. 打开 Cline 扩展设置
2. 找到 MCP Servers 配置
3. 添加服务器：

```json
{
  "chrome-devtools": {
    "command": "npx",
    "args": ["-y", "chrome-devtools-mcp", "--browser-url", "http://localhost:9222"],
    "disabled": false
  }
}
```

或导入 `configs/cline_mcp_settings.json`

### Claude Desktop

配置文件位置：
- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
- **Linux**: `~/.config/Claude/claude_desktop_config.json`

添加配置：

```json
{
  "mcpServers": {
    "chrome-devtools": {
      "command": "npx",
      "args": ["-y", "chrome-devtools-mcp", "--browser-url", "http://localhost:9222"]
    }
  }
}
```

或复制 `configs/claude_desktop_config.json`

### Cursor IDE

在 Cursor 设置中添加：

```json
{
  "mcp": {
    "servers": {
      "chrome-devtools": {
        "command": "npx",
        "args": ["-y", "chrome-devtools-mcp", "--browser-url", "http://localhost:9222"]
      }
    }
  }
}
```

---

## 启动 Chrome

MCP 服务器需要连接到已启动的 Chrome：

```bash
# Linux
google-chrome --remote-debugging-port=9222

# macOS
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --remote-debugging-port=9222

# Windows
"C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222
```

**加载扩展**：

```bash
chrome --remote-debugging-port=9222 --load-extension=/path/to/your/extension
```

---

## 验证安装

### 测试连接

```bash
# 检查 Chrome 是否运行
curl http://localhost:9222/json/version

# 测试 MCP 服务器
npx chrome-devtools-mcp --browser-url http://localhost:9222
```

### 可用工具

MCP 服务器提供以下工具：

**浏览器控制**:
- `new_tab` - 打开新标签页
- `close_tab` - 关闭标签页
- `navigate` - 导航到 URL
- `screenshot` - 截图
- `click` - 点击元素
- `type` - 输入文本

**扩展调试**:
- `list_extensions` - 列出所有扩展
- `get_extension_details` - 获取扩展详情
- `evaluate_in_extension` - 在扩展中执行代码
- `inspect_extension_storage` - 检查扩展存储
- `get_extension_logs` - 获取扩展日志
- `activate_service_worker` - 激活 Service Worker

**调试工具**:
- `get_console_logs` - 获取控制台日志
- `evaluate` - 执行 JavaScript

---

## 常见问题

### Q: 如何更新到最新版本？

```bash
# 如果是全局安装
npm update -g chrome-devtools-mcp

# 如果使用 npx，自动使用最新版
npx chrome-devtools-mcp@latest --browser-url http://localhost:9222
```

### Q: Chrome 未启动怎么办？

启动 Chrome 时添加调试端口：

```bash
chrome --remote-debugging-port=9222
```

### Q: 连接失败怎么办？

检查：
1. Chrome 是否在 9222 端口运行
2. 防火墙是否阻止连接
3. 尝试使用 `http://127.0.0.1:9222` 而不是 `localhost`

### Q: 如何在 Docker 中使用？

参见 `PACKAGING_GUIDE.md` 中的 Docker 部分。

---

## 下一步

- 查看 `PACKAGING_GUIDE.md` 了解更多打包选项
- 查看 `PRACTICAL_EXTENSION_TESTING_GUIDE.md` 学习扩展测试
- 查看 `EXTENSION_TOOLS_TEST_RESULTS.md` 查看工具测试结果

---

## 支持

- GitHub: https://github.com/your-repo/chrome-ext-devtools-mcp
- Issues: https://github.com/your-repo/chrome-ext-devtools-mcp/issues
- Docs: https://github.com/your-repo/chrome-ext-devtools-mcp/tree/main/docs
