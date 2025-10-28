# Chrome Extension Debug MCP

[![npm version](https://img.shields.io/npm/v/chrome-extension-debug-mcp.svg)](https://npmjs.org/package/chrome-extension-debug-mcp)
[![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](LICENSE)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D20.19-green.svg)](https://nodejs.org/)

[中文](README.zh-CN.md) | **English**

**Professional Chrome Extension Debug MCP Server with Multi-tenant Architecture and Enterprise Deployment Support.**

Enhanced from Google's [chrome-devtools-mcp](https://github.com/google/chrome-devtools-mcp) with improved extension debugging capabilities, multi-tenant support, and production-ready features.

> **🎉 What's New in v0.8.5**
>
> - **Critical Fix:** Resolved session management race condition (100% → 0% error rate)
> - **Enhanced Help:** Complete Multi-Tenant mode documentation in `--help`
> - **Internationalization:** English logging for better accessibility
> - [Full Changelog](CHANGELOG.md#085---2025-10-13)

---

## ✨ Core Features

### 🔌 Extension Debugging (12 Professional Tools)

- **Service Worker Activation** - Essential for MV3 extension debugging
- **Storage Inspection** - Supports local/sync/session/managed
- **Context Switching** - Background/Popup/Content Script
- **Message Monitoring** - Track runtime.sendMessage
- **API Tracing** - Chrome.\* API call logging
- **Log Collection** - Unified logs from all contexts

### 🚀 Multi-Tenant Mode (Enterprise-Grade)

- **10-100 Concurrent Users** - Isolated sessions
- **Token Authentication** - crypto.randomBytes generation
- **IP Whitelist** - ALLOWED_IPS security control
- **CORS Configuration** - Fine-grained origin control
- **Zero Memory Leaks** - Professional resource management
- **Performance Tracking** - Request ID correlation

### 🛠️ Browser Automation (26 Tools)

- **Page Management** - Navigate, refresh, close
- **Input Interaction** - Click, type, select
- **Performance Analysis** - Lighthouse insights
- **Network Monitoring** - HTTP requests & WebSocket frame inspection
- **Screenshot & Snapshot** - Full page, element, PDF
- **Script Execution** - Safe code injection

---

## 📦 Quick Installation

### Binary Files (Recommended ⭐)

No Node.js required, just download and run:

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
# Download chrome-extension-debug-windows-x64.exe and run
```

### npm Package

```bash
# Global installation
npm install -g chrome-extension-debug-mcp

# Or use npx
npx chrome-extension-debug-mcp@latest
```

### Build from Source

```bash
git clone https://github.com/ChromeDevTools/chrome-devtools-mcp.git
cd chrome-devtools-mcp
npm install && npm run build
node build/src/index.js
```

---

## 🚀 Quick Start

### 1. stdio Mode (Single User)

Suitable for personal development, IDE integration:

**Configure Claude Desktop / Cline / Cursor:**

```json
{
  "mcpServers": {
    "chrome-extension-debug": {
      "command": "/path/to/chrome-extension-debug-linux-x64"
    }
  }
}
```

**Or use npm:**

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

### 2. Multi-tenant Mode (Team)

Suitable for team development, CI/CD, SaaS scenarios:

**Start Server:**

```bash
# Basic start
npm run server:multi-tenant

# Enable authentication and IP whitelist, CIDR format, default port is 32122
AUTH_ENABLED=true \
ALLOWED_IPS=192.168.1.100,192.168.1.101 \
/path/to/chrome-extension-debug-linux-x64
```

**Client Configuration:**

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

📚 **Complete Guide:** [Multi-Tenant Quick Start](docs/guides/MULTI_TENANT_QUICK_START.md)

### 3. HTTP Server Mode

Suitable for remote debugging, LAN sharing:

```bash
bash scripts/start-http-mcp.sh

# Remote Chrome
BROWSER_URL=http://192.168.1.100:9222 \
bash scripts/start-http-mcp.sh
```

---

## 📖 Tool List (41 Tools)

### 🔌 Extension Debugging (12 Tools)

| Tool                             | Description                            |
| -------------------------------- | -------------------------------------- |
| `list_extensions`                | List all extensions                    |
| `get_extension_details`          | Get extension details                  |
| `list_extension_contexts`        | List extension contexts                |
| `switch_extension_context`       | Switch context                         |
| `activate_service_worker`        | Activate Service Worker ⭐             |
| `inspect_extension_storage`      | Inspect Storage                        |
| `watch_extension_storage`        | Watch Storage changes                  |
| `get_extension_logs`             | Collect logs                           |
| `evaluate_in_extension`          | Execute code                           |
| `reload_extension`               | Smart Hot Reload (Enhanced) ⭐⭐⭐⭐⭐ |
| `diagnose_extension_errors`      | Error Diagnostics (New) ⭐⭐⭐⭐⭐     |
| `inspect_extension_manifest`     | Deep Manifest Check (New) ⭐⭐⭐⭐     |
| `check_content_script_injection` | Content Script Check (New) ⭐⭐⭐⭐    |
| `monitor_extension_messages`     | Monitor messages                       |
| `trace_extension_api_calls`      | Trace API calls                        |

### 🌐 Browser Automation (26 Tools)

<details>
<summary>Click to expand full list</summary>

**Page Management (8 tools)**

- `list_pages`, `new_page`, `close_page`
- `navigate_to_url`, `navigate_forward`, `navigate_back`
- `reload_page`, `get_current_url`

**Input Interaction (6 tools)**

- `click_element`, `fill_element`, `select_option`
- `upload_file`, `press_key`, `handle_dialog`

**Performance Analysis (3 tools)**

- `performance_start_trace`, `performance_stop_trace`
- `performance_analyze_insight`

**Network Monitoring (3 tools)**

- `list_network_requests`, `emulate_network`
- `monitor_websocket_traffic` - Real-time WebSocket frame monitoring

**Screenshot & Snapshot (2 tools)**

- `take_screenshot`, `take_snapshot`

**Debugging Tools (3 tools)**

- `list_console_messages`, `evaluate_script`
- `emulate_device`

**Others (2 tools)**

- `wait_for`, `accessibility_snapshot`

</details>

---

## ⚙️ Configuration Options

### Environment Variables

#### stdio Mode

```bash
DEBUG=mcp:*                # Enable debug logs
NODE_ENV=production        # Production mode
```

#### Multi-tenant Mode

```bash
# Server Configuration
PORT=32122                                      # Server port
AUTH_ENABLED=true                               # Enable authentication
ALLOWED_ORIGINS=https://app.example.com         # CORS whitelist
ALLOWED_IPS=192.168.1.100,192.168.1.101        # IP whitelist

# CDP Configuration
USE_CDP_HYBRID=true                             # CDP hybrid mode
USE_CDP_OPERATIONS=true                         # CDP operations mode

# Session Management
MAX_SESSIONS=100                                # Max sessions
SESSION_TIMEOUT=1800000                         # Session timeout (30 min)
```

### Command Line Arguments

```bash
# stdio mode (default)
./chrome-extension-debug-linux-x64

# SSE mode
./chrome-extension-debug-linux-x64 --transport sse --port 32122

# Streamable HTTP mode
./chrome-extension-debug-linux-x64 --transport streamable --port 32123

# Multi-tenant mode
./chrome-extension-debug-linux-x64 --mode multi-tenant
```

---

## 🏗️ Architecture

### Multi-Tenant Design

```
┌─────────────────────────────────────────────────┐
│         MCP Multi-Tenant Server (Port 32122)    │
├─────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐            │
│  │ SessionMgr   │  │ BrowserPool  │            │
│  │ (Session)    │  │ (Pool)       │            │
│  └──────────────┘  └──────────────┘            │
│  ┌──────────────┐  ┌──────────────┐            │
│  │ AuthManager  │  │ RouterMgr    │            │
│  │ (Auth)       │  │ (Router)     │            │
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

**Key Features:**

- ✅ **Session Isolation** - Independent session per user
- ✅ **Connection Pool** - Auto health check and reconnect
- ✅ **Concurrency Control** - Session-level mutex
- ✅ **Resource Management** - Zero memory leaks
- ✅ **Performance Tracking** - Request ID correlation

📚 **Architecture Docs:** [Multi-Tenant Architecture](docs/guides/MULTI_TENANT_ARCHITECTURE_ANALYSIS.md)

### CDP Hybrid Mode

Combining the strengths of Puppeteer and CDP:

- **Puppeteer** - High-level API, stability
- **CDP** - Low-level control, performance

```bash
# Enable CDP hybrid mode
USE_CDP_HYBRID=true \
USE_CDP_OPERATIONS=true \
npm run server:multi-tenant
```

📚 **CDP Guide:** [CDP Hybrid Mode](docs/guides/CDP_HYBRID_GUIDE.md)

---

## 📚 Documentation

### User Guides

- [Multi-Tenant Quick Start](docs/guides/MULTI_TENANT_QUICK_START.md) - Get started in 5 minutes
- [Multi-Tenant Architecture](docs/guides/MULTI_TENANT_ARCHITECTURE.md) - System design
- [LAN Deployment Best Practices](docs/guides/MULTI_TENANT_LAN_BEST_PRACTICES.md) - Team deployment
- [Testing Instructions](docs/guides/TEST_INSTRUCTIONS.md) - How to test

### Developer Docs

- [Contributing Guide](CONTRIBUTING.md) - How to contribute
- [Release Guide](RELEASE.md) - Version release steps
- [Scripts Documentation](scripts/README.md) - Build scripts guide
- [Documentation Index](docs/README.md) - Full documentation index

### Deployment Docs

- [Deployment Checklist](docs/guides/DEPLOYMENT_CHECKLIST.md) - Production deployment
- [Security Best Practices](#-security-best-practices) - Security configuration

---

## 🔧 Development

### Environment Setup

```bash
# Clone repository
git clone https://github.com/ChromeDevTools/chrome-devtools-mcp.git
cd chrome-devtools-mcp

# Install dependencies
npm install

# Build
npm run build

# Run tests
npm test

# Start development server
bash scripts/start-http-mcp.sh
```

### Adding New Tools

```bash
# 1. Create tool file
touch src/tools/my-new-tool.ts

# 2. Implement tool (refer to existing tools)

# 3. Register tool
# Edit src/tools/registry.ts

# 4. Build and test
npm run build
npm test

# 5. Generate docs
npm run docs
```

### Package Binaries

```bash
# Requires Bun
curl -fsSL https://bun.sh/install | bash

# Package all platforms
bash scripts/package-bun.sh

# Output in dist/ directory
ls -lh dist/
```

---

## 📊 Performance Metrics

### Multi-Tenant Mode

| Metric               | Value              |
| -------------------- | ------------------ |
| **Concurrent Users** | 10-100             |
| **P50 Latency**      | < 50ms             |
| **P99 Latency**      | < 500ms            |
| **Memory Stability** | Zero leaks         |
| **CPU Utilization**  | ~100% (multi-core) |
| **Throughput Boost** | 10-100x vs stdio   |

### Startup Performance

| Mode         | Cold Start | Hot Start |
| ------------ | ---------- | --------- |
| stdio        | ~500ms     | ~200ms    |
| Multi-tenant | ~2s        | ~1s       |
| Binary       | ~300ms     | ~100ms    |

---

## 🔒 Security Best Practices

### Production Checklist

- ✅ Enable authentication: `AUTH_ENABLED=true`
- ✅ Set IP whitelist: `ALLOWED_IPS=...`
- ✅ Configure CORS: `ALLOWED_ORIGINS=https://your-domain.com`
- ✅ Use HTTPS (via Nginx/Caddy reverse proxy)
- ✅ Limit sessions: `MAX_SESSIONS=50`
- ✅ Set session timeout: `SESSION_TIMEOUT=1800000`
- ✅ Monitor logs and errors
- ✅ Regularly update dependencies

### Recommended Configuration

```bash
# Production environment full configuration
AUTH_ENABLED=true \
ALLOWED_ORIGINS=https://app.company.com \
ALLOWED_IPS=203.0.113.1,198.51.100.1 \
MAX_SESSIONS=50 \
SESSION_TIMEOUT=1800000 \
USE_CDP_HYBRID=true \
npm run server:multi-tenant
```

---

## 🤝 Contributing

We welcome all forms of contributions!

### How to Contribute

- 🐛 [Report Bugs](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/new?template=bug_report.md)
- 💡 [Feature Requests](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/new?template=feature_request.md)
- 📝 Improve documentation
- 🔧 Submit code

### Development Workflow

1. Fork the project
2. Create feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'feat: add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open Pull Request

📚 **Detailed Guide:** [Contributing Guide](CONTRIBUTING.md)

---

## 📜 License

Apache 2.0 - See [LICENSE](LICENSE) file

---

## 🙏 Acknowledgments

Based on Google's [chrome-devtools-mcp](https://github.com/google/chrome-devtools-mcp) project.

Thanks to all contributors and community support!

---

## 📞 Contact

- **Issues**: https://github.com/ChromeDevTools/chrome-devtools-mcp/issues
- **Discussions**: https://github.com/ChromeDevTools/chrome-devtools-mcp/discussions
- **Documentation**: [docs/README.md](docs/README.md)

---

## 🗺️ Roadmap

### v0.9.0 (Phase 1 Completed) ✅

- [x] `inspect_extension_manifest` - Deep manifest check ✅
- [x] `diagnose_extension_errors` - Error diagnostics ✅
- [x] Enhanced `reload_extension` - Smart hot reload ✅
- [x] `check_content_script_injection` - Content script check ✅

### v1.0.0 (Planned)

- [ ] `analyze_extension_permissions` - Permission analysis
- [ ] `analyze_api_usage` - API usage statistics
- [ ] Performance monitoring dashboard
- [ ] WebSocket support

---

<div align="center">

**⭐ If this project helps you, please give it a Star! ⭐**

Made with ❤️ by the Chrome DevTools MCP community

[Documentation](docs/README.md) • [Changelog](CHANGELOG.md) • [Contributing](CONTRIBUTING.md)

</div>
