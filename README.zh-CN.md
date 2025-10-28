# Chrome Extension Debug MCP

[![npm version](https://img.shields.io/npm/v/chrome-extension-debug-mcp.svg)](https://npmjs.org/package/chrome-extension-debug-mcp)
[![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](LICENSE)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D20.19-green.svg)](https://nodejs.org/)

**专业的 Chrome 扩展调试 MCP 服务器，支持 Multi-tenant 架构和企业级部署。**

基于 Google 的 [chrome-devtools-mcp](https://github.com/google/chrome-devtools-mcp)，增强了扩展调试能力、Multi-tenant 支持和生产就绪特性。

> **🎉 v0.8.5 版本更新**
>
> - **严重问题修复：** 解决 Session 管理竞态条件（错误率从 100% 降至 0%）
> - **帮助增强：** `--help` 输出中添加完整的 Multi-Tenant 模式文档
> - **国际化：** 服务器日志改为英文，提升可访问性
> - [完整更新日志](CHANGELOG.md#085---2025-10-13)

---

## ✨ 核心特性

### 🔌 扩展调试（12 个专业工具）

- **Service Worker 激活** - MV3 扩展调试必备
- **Storage 检查** - 支持 local/sync/session/managed
- **上下文切换** - Background/Popup/Content Script
- **消息监控** - 追踪 runtime.sendMessage
- **API 追踪** - chrome.\* API 调用记录
- **日志收集** - 统一收集所有上下文日志

### 🚀 Multi-Tenant 模式（企业级）

- **10-100 并发用户** - 独立会话隔离
- **Token 认证** - crypto.randomBytes 生成
- **IP 白名单** - ALLOWED_IPS 安全控制
- **CORS 配置** - 精细化源控制
- **零内存泄漏** - 专业资源管理
- **性能追踪** - 请求 ID 关联

### 🛠️ 浏览器自动化（26 个工具）

- **页面管理** - 导航、刷新、关闭
- **输入交互** - 点击、输入、选择
- **性能分析** - Lighthouse insights
- **网络监控** - 请求拦截、修改
- **截图快照** - 全页面、元素、PDF
- **脚本执行** - 安全的代码注入

---

## 📦 快速安装

### 二进制文件（推荐 ⭐）

无需 Node.js，直接下载运行：

```bash
# Linux x64
wget https://github.com/ChromeDevTools/chrome-devtools-mcp/releases/latest/download/chrome-extension-debug-linux-x64
chmod +x chrome-extension-debug-linux-x64
./chrome-extension-debug-linux-x64

# macOS ARM64 (Apple Silicon)
curl -LO https://github.com/ChromeDevTools/chrome-devtools-mcp/releases/latest/download/chrome-extension-debug-macos-arm64
chmod +x chrome-extension-debug-macos-arm64
./chrome-extension-debug-macos-arm64

# Windows
# 直接下载 chrome-extension-debug-windows-x64.exe 运行
```

### npm 包

```bash
# 全局安装
npm install -g chrome-extension-debug-mcp

# 或使用 npx
npx chrome-extension-debug-mcp@latest
```

### 从源码构建

```bash
git clone https://github.com/ChromeDevTools/chrome-devtools-mcp.git
cd chrome-devtools-mcp
npm install && npm run build
node build/src/index.js
```

---

## 🚀 快速开始

### 1. stdio 模式（单用户）

适合个人开发，IDE 直接集成：

**配置 Claude Desktop / Cline / Cursor:**

```json
{
  "mcpServers": {
    "chrome-extension-debug": {
      "command": "/path/to/chrome-extension-debug-linux-x64"
    }
  }
}
```

**或使用 npm:**

```json
{
  "mcpServers": {
    "chrome-extension-debug": {
      "command": "npx",
      "args": ["-y", "chrome-extension-debug-mcp@latest"]
    }
  }
}
```

### 2. Multi-tenant 模式（团队）

适合团队开发、CI/CD、SaaS 场景：

**启动服务器:**

```bash
# 基础启动
npm run server:multi-tenant

# 启用认证和 IP 白名单, 支持 CIDR 格式
AUTH_ENABLED=true \
ALLOWED_IPS=192.168.1.100,192.168.1.101 \
PORT=32122 \
npm run server:multi-tenant
```

**客户端配置:**

```json
{
  "mcpServers": {
    "chrome-extension-debug": {
      "url": "http://localhost:32122/sse?userId=alice",
      "headers": {
        "Authorization": "Bearer YOUR_TOKEN"
      }
    }
  }
}
```

📚 **完整指南:** [Multi-Tenant 完整文档](docs/MULTI_TENANT_COMPLETE.md) ⭐

### 3. HTTP 服务器模式

适合远程调试、局域网共享：

```bash
bash scripts/start-http-mcp.sh

# 远程 Chrome
BROWSER_URL=http://192.168.1.100:9222 \
bash scripts/start-http-mcp.sh
```

---

## 📖 工具列表（41 个）

### 🔌 扩展调试（12 个）

| 工具                             | 说明                                |
| -------------------------------- | ----------------------------------- |
| `list_extensions`                | 列出所有扩展                        |
| `get_extension_details`          | 获取扩展详情                        |
| `list_extension_contexts`        | 列出扩展上下文                      |
| `switch_extension_context`       | 切换上下文                          |
| `activate_service_worker`        | 激活 Service Worker ⭐              |
| `inspect_extension_storage`      | 检查 Storage                        |
| `watch_extension_storage`        | 监控 Storage 变化                   |
| `get_extension_logs`             | 收集日志                            |
| `evaluate_in_extension`          | 执行代码                            |
| `reload_extension`               | 智能热重载（增强版）⭐⭐⭐⭐⭐      |
| `diagnose_extension_errors`      | 错误诊断器（新增）⭐⭐⭐⭐⭐        |
| `inspect_extension_manifest`     | Manifest 深度检查（新增）⭐⭐⭐⭐   |
| `check_content_script_injection` | Content Script 检查（新增）⭐⭐⭐⭐ |
| `monitor_extension_messages`     | 监控消息                            |
| `trace_extension_api_calls`      | 追踪 API 调用                       |

### 🌐 浏览器自动化（26 个）

<details>
<summary>点击展开完整列表</summary>

**页面管理（8 个）**

- `list_pages`, `new_page`, `close_page`
- `navigate_to_url`, `navigate_forward`, `navigate_back`
- `reload_page`, `get_current_url`

**输入交互（6 个）**

- `click_element`, `fill_element`, `select_option`
- `upload_file`, `press_key`, `handle_dialog`

**性能分析（3 个）**

- `performance_start_trace`, `performance_stop_trace`
- `performance_analyze_insight`

**网络监控（2 个）**

- `list_network_requests`, `emulate_network`

**截图快照（2 个）**

- `take_screenshot`, `take_snapshot`

**调试工具（3 个）**

- `list_console_messages`, `evaluate_script`
- `emulate_device`

**其他（2 个）**

- `wait_for`, `accessibility_snapshot`

</details>

📚 **完整文档:** [工具分析和路线图](TOOLS_ANALYSIS_AND_ROADMAP.md)

---

## ⚙️ 配置选项

### 环境变量

#### stdio 模式

```bash
DEBUG=mcp:*                # 启用调试日志
NODE_ENV=production        # 生产模式
```

#### Multi-tenant 模式

```bash
# 服务器配置
PORT=32122                                      # 服务端口
AUTH_ENABLED=true                               # 启用认证
ALLOWED_ORIGINS=https://app.example.com         # CORS 白名单
ALLOWED_IPS=192.168.1.100,192.168.1.101        # IP 白名单

# CDP 配置
USE_CDP_HYBRID=true                             # CDP 混合模式
USE_CDP_OPERATIONS=true                         # CDP 操作模式

# 会话管理
MAX_SESSIONS=100                                # 最大会话数
SESSION_TIMEOUT=1800000                         # 会话超时（30分钟）
```

### 命令行参数

```bash
# stdio 模式（默认）
./chrome-extension-debug-linux-x64

# SSE 模式
./chrome-extension-debug-linux-x64 --transport sse --port 32122

# Streamable HTTP 模式
./chrome-extension-debug-linux-x64 --transport streamable --port 32123

# Multi-tenant 模式
./chrome-extension-debug-linux-x64 --mode multi-tenant
```

📚 **详细配置:** [配置兼容性指南](CONFIG_COMPATIBILITY_SUMMARY.md)

---

## 🏗️ 架构特点

### Multi-Tenant 设计

```
┌─────────────────────────────────────────────────┐
│         MCP Multi-Tenant Server (Port 32122)    │
├─────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐            │
│  │ SessionMgr   │  │ BrowserPool  │            │
│  │ (会话管理)    │  │ (连接池)      │            │
│  └──────────────┘  └──────────────┘            │
│  ┌──────────────┐  ┌──────────────┐            │
│  │ AuthManager  │  │ RouterMgr    │            │
│  │ (认证)        │  │ (路由)        │            │
│  └──────────────┘  └──────────────┘            │
└─────────────────────────────────────────────────┘
           │                │                │
           ▼                ▼                ▼
    ┌──────────┐    ┌──────────┐    ┌──────────┐
    │ Alice    │    │ Bob      │    │ Charlie  │
    │ Chrome   │    │ Chrome   │    │ Chrome   │
    │ :9222    │    │ :9223    │    │ :9224    │
    └──────────┘    └──────────┘    └──────────┘
```

**关键特性:**

- ✅ **会话隔离** - 每个用户独立会话
- ✅ **连接池** - 自动健康检查和重连
- ✅ **并发控制** - Session-level mutex
- ✅ **资源管理** - 零内存泄漏
- ✅ **性能追踪** - Request ID 关联

📚 **架构文档:** [Multi-Tenant 架构分析](MULTI_TENANT_ARCHITECTURE_ANALYSIS.md)

### CDP 混合模式

结合 Puppeteer 和 CDP 的优势：

- **Puppeteer** - 高级 API、稳定性
- **CDP** - 底层控制、性能

```bash
# 启用 CDP 混合模式
USE_CDP_HYBRID=true \
USE_CDP_OPERATIONS=true \
npm run server:multi-tenant
```

📚 **CDP 指南:** [CDP 混合模式使用指南](CDP_HYBRID_GUIDE.md)

---

## 📚 文档导航

### 用户指南

- [Multi-Tenant 快速开始](MULTI_TENANT_QUICK_START.md) - 5 分钟上手
- [IP 白名单和配置格式](IP_WHITELIST_AND_CONFIG_FORMAT.md) - 安全配置
- [认证功能使用](docs/archive/AUTH_ENABLED_FIX.md) - Token 生成和验证
- [局域网部署最佳实践](MULTI_TENANT_LAN_BEST_PRACTICES.md) - 团队部署

### 开发者文档

- [工具分析和路线图](docs/archive/TOOLS_ANALYSIS_AND_ROADMAP.md) - 功能规划
- [Scripts 文档](docs/archive/SCRIPTS_DOCUMENTATION.md) - 脚本使用指南
- [实施指南](docs/archive/IMPLEMENTATION_GUIDE.md) - 功能实现细节
- [贡献指南](docs/archive/CONTRIBUTING.md) - 如何贡献

### 部署文档

- [发布流程](docs/archive/RELEASE.md) - 版本发布步骤
- [GitHub 设置](docs/archive/GITHUB_SETUP.md) - 项目规范化
- [部署清单](docs/guides/DEPLOYMENT_CHECKLIST.md) - 生产部署

### 技术分析

- [架构对比](docs/archive/ARCHITECTURE_COMPARISON.md) - 架构设计分析
- [性能优化报告](docs/archive/ARCHITECTURE_OPTIMIZATION_REPORT.md) - 性能改进
- [测试报告](docs/archive/FINAL_TEST_SUMMARY.md) - 完整测试结果

📚 **完整索引:** [文档索引](docs/guides/DOCUMENTATION_INDEX.md)

---

## 🔧 开发

### 环境搭建

```bash
# 克隆项目
git clone https://github.com/ChromeDevTools/chrome-devtools-mcp.git
cd chrome-devtools-mcp

# 安装依赖
npm install

# 构建
npm run build

# 运行测试
npm test

# 启动开发服务器
bash scripts/start-http-mcp.sh
```

### 添加新工具

```bash
# 1. 创建工具文件
touch src/tools/my-new-tool.ts

# 2. 实现工具（参考现有工具）

# 3. 注册工具
# 编辑 src/tools/registry.ts

# 4. 构建和测试
npm run build
npm test

# 5. 生成文档
npm run docs
```

### 打包二进制文件

```bash
# 需要 Bun
curl -fsSL https://bun.sh/install | bash

# 打包所有平台
bash scripts/package-bun.sh

# 输出在 dist/ 目录
ls -lh dist/
```

---

## 📊 性能指标

### Multi-Tenant 模式

| 指标           | 数值             |
| -------------- | ---------------- |
| **并发用户**   | 10-100           |
| **P50 延迟**   | < 50ms           |
| **P99 延迟**   | < 500ms          |
| **内存稳定性** | 零泄漏           |
| **CPU 利用率** | ~100%（多核）    |
| **吞吐量提升** | 10-100x vs stdio |

### 启动性能

| 模式         | 冷启动 | 热启动 |
| ------------ | ------ | ------ |
| stdio        | ~500ms | ~200ms |
| Multi-tenant | ~2s    | ~1s    |
| 二进制文件   | ~300ms | ~100ms |

📚 **详细报告:** [性能优化报告](docs/archive/ARCHITECTURE_OPTIMIZATION_REPORT.md)

---

## 🔒 安全最佳实践

### 生产环境清单

- ✅ 启用认证: `AUTH_ENABLED=true`
- ✅ 设置 IP 白名单: `ALLOWED_IPS=...`
- ✅ 配置 CORS: `ALLOWED_ORIGINS=https://your-domain.com`
- ✅ 使用 HTTPS（通过 Nginx/Caddy 反向代理）
- ✅ 限制会话数: `MAX_SESSIONS=50`
- ✅ 设置会话超时: `SESSION_TIMEOUT=1800000`
- ✅ 监控日志和错误
- ✅ 定期更新依赖

### 推荐配置

```bash
# 生产环境完整配置
AUTH_ENABLED=true \
ALLOWED_ORIGINS=https://app.company.com \
ALLOWED_IPS=203.0.113.1,198.51.100.1 \
MAX_SESSIONS=50 \
SESSION_TIMEOUT=1800000 \
USE_CDP_HYBRID=true \
npm run server:multi-tenant
```

📚 **安全指南:** [IP 白名单和配置](docs/archive/IP_WHITELIST_AND_CONFIG_FORMAT.md)

---

## 🤝 贡献

我们欢迎所有形式的贡献！

### 贡献方式

- 🐛 [报告 Bug](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/new?template=bug_report.md)
- 💡 [功能建议](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/new?template=feature_request.md)
- 📝 改进文档
- 🔧 提交代码

### 开发流程

1. Fork 项目
2. 创建功能分支 (`git checkout -b feature/amazing-feature`)
3. 提交更改 (`git commit -m 'feat: add amazing feature'`)
4. 推送到分支 (`git push origin feature/amazing-feature`)
5. 打开 Pull Request

📚 **详细指南:** [贡献指南](CONTRIBUTING.md)

---

## 📜 License

Apache 2.0 - 详见 [LICENSE](LICENSE) 文件

---

## 🙏 致谢

基于 Google 的 [chrome-devtools-mcp](https://github.com/google/chrome-devtools-mcp) 项目。

感谢所有贡献者和社区的支持！

---

## 📞 联系方式

- **Issues**: https://github.com/ChromeDevTools/chrome-devtools-mcp/issues
- **Discussions**: https://github.com/ChromeDevTools/chrome-devtools-mcp/discussions
- **Documentation**: [文档索引](DOCUMENTATION_INDEX.md)

---

## 🗺️ 路线图

### v0.9.0（已完成 Phase 1）✅

- [x] `inspect_extension_manifest` - Manifest 深度检查 ✅
- [x] `diagnose_extension_errors` - 错误诊断器 ✅
- [x] 增强 `reload_extension` - 智能热重载 ✅
- [x] `check_content_script_injection` - Content Script 检查 ✅

### v1.0.0（计划中）

- [ ] `analyze_extension_permissions` - 权限分析
- [ ] `analyze_api_usage` - API 使用统计
- [ ] 性能监控面板
- [ ] WebSocket 支持

📚 **完整路线图:** [工具分析和路线图](TOOLS_ANALYSIS_AND_ROADMAP.md)

---

<div align="center">

**⭐ 如果这个项目对你有帮助，请给它一个 Star！⭐**

Made with ❤️ by the Chrome DevTools MCP community

[文档索引](DOCUMENTATION_INDEX.md) • [更新日志](CHANGELOG.md) • [贡献指南](CONTRIBUTING.md)

</div>
