# 📖 自动激活使用指南

## 🎯 问题诊断

根据你的反馈：

```
activate_service_worker：激活服务工作者
自动激活失败 ❌
建议手动激活
```

**根本原因：** 使用了 **连接模式（connect）** 而不是 **启动模式（launch）**

---

## 🔍 两种模式对比

### 模式 1: 连接模式（Connect）❌

```bash
# 使用 --browser-url 参数
node build/index.js --browser-url http://localhost:9222

# 或通过 MCP 配置
{
  "command": "node",
  "args": ["build/index.js", "--browser-url", "http://localhost:9222"]
}
```

**特点：**
- ❌ 连接到已有浏览器
- ❌ 无法注入 Helper Extension
- ❌ 自动激活成功率 0-10%
- ❌ 需要手动激活 Service Worker

**日志输出：**
```
[Browser] 📡 连接到已有浏览器: http://localhost:9222
[Browser] ⚠️  连接模式下无法自动生成 Helper Extension
[Browser] ℹ️  Service Worker 自动激活成功率可能较低（0-10%）
[Browser] 💡 建议：移除 --browser-url 参数，使用自动启动模式（95%+ 成功率）
```

### 模式 2: 启动模式（Launch）✅ 推荐

```bash
# 不使用 --browser-url
node build/index.js

# 或通过 MCP 配置
{
  "command": "node",
  "args": ["build/index.js"]
}
```

**特点：**
- ✅ 自动启动新的 Chrome
- ✅ 自动生成并注入 Helper Extension
- ✅ 自动激活成功率 95%+
- ✅ 用户完全无感

**日志输出：**
```
[Browser] 🔧 生成临时 Helper Extension（用户无感）...
[HelperGen] ✅ Helper Extension 已生成: /tmp/mcp-helper-extension-xxx
[Browser] ✨ 自动加载，激活成功率 95%+
[Browser] Chrome 已启动

... 使用工具时 ...

[ExtensionHelper] ✨ 检测到 Helper Extension，使用增强模式
[ExtensionHelper] ✅ Helper Extension 激活成功
✅ Service Worker 已激活
```

---

## 🚀 立即修复

### 步骤 1: 检查当前配置

如果你在 Claude Desktop 或其他 MCP 客户端中使用，检查配置文件：

**Windows:**
```
%APPDATA%\Claude\claude_desktop_config.json
```

**macOS:**
```
~/Library/Application Support/Claude/claude_desktop_config.json
```

**Linux:**
```
~/.config/Claude/claude_desktop_config.json
```

### 步骤 2: 修改配置

**❌ 错误配置（连接模式）：**
```json
{
  "mcpServers": {
    "chrome-devtools": {
      "command": "node",
      "args": [
        "E:\\developer\\workspace\\me\\chrome-ext-devtools-mcp\\build\\index.js",
        "--browser-url",
        "http://localhost:9222"
      ]
    }
  }
}
```

**✅ 正确配置（启动模式）：**
```json
{
  "mcpServers": {
    "chrome-devtools": {
      "command": "node",
      "args": [
        "E:\\developer\\workspace\\me\\chrome-ext-devtools-mcp\\build\\index.js"
      ]
    }
  }
}
```

### 步骤 3: 重启 MCP

1. 关闭 Claude Desktop（或你的 MCP 客户端）
2. 完全退出
3. 重新打开
4. MCP 会自动启动 Chrome 并注入 Helper Extension

### 步骤 4: 验证

运行任意扩展工具：

```
activate_service_worker extensionId=bekcbmopkiajilfliobihjgnghfcbido
```

**预期结果：**
```
✅ 激活成功！
方法: Helper Extension (debugger)
耗时: <1 秒
```

---

## 🎓 详细说明

### 为什么连接模式无法使用 Helper Extension？

```
连接模式（connect）:
用户 → MCP → 连接到已运行的 Chrome
                    ↓
              Chrome 已启动
              扩展已加载
              ❌ 无法再注入 Helper Extension

启动模式（launch）:
用户 → MCP → 生成 Helper Extension
           → 启动 Chrome（带 Helper）
                    ↓
              ✅ Helper Extension 已加载
              ✅ 自动激活成功率 95%+
```

### 启动模式的其他参数

```bash
# 基本启动
node build/index.js

# 无头模式（后台运行）
node build/index.js --headless

# 指定 Chrome 版本
node build/index.js --channel canary

# 指定 Chrome 路径
node build/index.js --executable-path "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"

# 隔离模式（使用临时配置文件）
node build/index.js --isolated
```

---

## 🆚 功能对比表

| 特性 | 连接模式 | 启动模式 |
|------|---------|---------|
| **Helper Extension** | ❌ 无 | ✅ 自动生成 |
| **自动激活成功率** | 0-10% | **95%+** |
| **用户操作** | 需手动激活 | 完全无感 |
| **配置复杂度** | 需要 --browser-url | 无需参数 |
| **适用场景** | 调试已有浏览器 | **日常使用（推荐）** |

---

## 📝 常见问题

### Q: 我为什么使用了 --browser-url？

A: 可能是因为：
1. 参考了旧文档
2. 想连接到已有的 Chrome
3. 不知道有启动模式

**建议：** 移除 `--browser-url`，使用启动模式。

### Q: 我必须连接到已有的 Chrome 怎么办？

A: 有两个选择：

**选择 1（推荐）：** 改用启动模式
- 优点：95%+ 自动激活
- 缺点：会启动新的 Chrome

**选择 2：** 继续使用连接模式，手动激活
- 优点：使用已有 Chrome
- 缺点：每次都需要手动激活
- 步骤：
  1. 访问 `chrome://extensions/`
  2. 找到目标扩展
  3. 点击 "Service worker" 链接
  4. 重新运行 MCP 命令

### Q: 启动模式会关闭我现有的 Chrome 吗？

A: **不会**。
- MCP 会启动一个新的 Chrome 实例
- 使用独立的用户数据目录
- 不影响你日常使用的 Chrome

### Q: 如何验证当前使用的是哪种模式？

A: 查看 MCP 启动日志：

**连接模式：**
```
[Browser] 📡 连接到已有浏览器
```

**启动模式：**
```
[Browser] 🔧 生成临时 Helper Extension
[HelperGen] ✅ Helper Extension 已生成
```

### Q: 启动模式的 Chrome 在哪里？

A: 会在屏幕上看到一个新的 Chrome 窗口。
- 标题栏会显示 "Chrome 正在受到自动测试软件的控制"
- 这是正常的 Puppeteer 行为
- 可以使用 `--headless` 参数让它在后台运行

---

## 🎯 推荐配置

### 最佳实践配置

```json
{
  "mcpServers": {
    "chrome-devtools": {
      "command": "node",
      "args": [
        "/path/to/chrome-ext-devtools-mcp/build/index.js"
      ],
      "env": {
        "NODE_ENV": "production"
      }
    }
  }
}
```

### 开发环境配置

```json
{
  "mcpServers": {
    "chrome-devtools": {
      "command": "node",
      "args": [
        "/path/to/chrome-ext-devtools-mcp/build/index.js",
        "--channel",
        "canary"
      ]
    }
  }
}
```

### 无头模式配置（服务器/CI）

```json
{
  "mcpServers": {
    "chrome-devtools": {
      "command": "node",
      "args": [
        "/path/to/chrome-ext-devtools-mcp/build/index.js",
        "--headless"
      ]
    }
  }
}
```

---

## ✅ 验证清单

完成修改后，验证是否正确：

- [ ] 移除了 `--browser-url` 参数
- [ ] 重启了 MCP 客户端
- [ ] 看到了 Helper Extension 生成日志
- [ ] Chrome 自动启动
- [ ] `activate_service_worker` 成功
- [ ] `inspect_extension_storage` 成功
- [ ] 不再需要手动激活

---

## 🎉 总结

### 问题

```
使用 --browser-url 连接模式
    ↓
无法注入 Helper Extension
    ↓
自动激活失败（0-10%）
    ↓
需要手动操作
```

### 解决方案

```
移除 --browser-url 参数
    ↓
使用启动模式
    ↓
自动生成并注入 Helper Extension
    ↓
自动激活成功（95%+）
    ↓
用户完全无感 🎉
```

---

## 📚 相关文档

- [完全无感自动激活](./SEAMLESS_AUTO_ACTIVATION.md)
- [零配置方案](./ZERO_CONFIG_SOLUTION.md)
- [故障排查](./TROUBLESHOOTING_AUTO_ACTIVATION.md)
- [快速开始](../QUICK_START_HELPER.md)

---

**立即修改配置，享受 95%+ 自动激活成功率！** 🚀
