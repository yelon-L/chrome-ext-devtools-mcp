# Scripts 目录文档

## 📁 目录结构

```
scripts/
├── 构建和发布 (Build & Release)
│   ├── inject-version.ts          # 版本号注入
│   ├── post-build.ts               # 构建后处理
│   ├── prepare.ts                  # 发布前准备
│   ├── package-bun.sh              # 二进制打包
│   └── sync-server-json-version.ts # 版本同步
│
├── 文档生成 (Documentation)
│   └── generate-docs.ts            # 工具文档生成
│
├── 开发工具 (Development)
│   ├── generate-ide-config.js      # IDE 配置生成
│   └── install.sh                  # 安装脚本
│
├── 服务启动 (Server Startup)
│   ├── start-mcp.sh                # 本地启动（stdio）
│   ├── start-mcp.bat               # Windows 启动
│   ├── start-http-mcp.sh           # HTTP 服务启动
│   ├── start-remote-mcp.sh         # 远程服务启动
│   ├── client-config-generator.sh  # 客户端配置生成
│   └── setup-caddy-privileges.sh   # Caddy 权限设置
│
└── 代码质量 (Code Quality)
    └── eslint_rules/                # ESLint 规则
        ├── index.js
        └── README.md
```

---

## 🔨 脚本分类说明

### 1. 构建和发布（5 个脚本）

#### `inject-version.ts`

**用途：** 在构建前将 package.json 中的版本号注入到源代码

**调用时机：** `npm run build` 第一步

**实现功能：**
```typescript
// 读取 package.json 的 version
// 生成 src/version.ts
export const VERSION = '0.8.2';
```

**关键代码：**
```bash
npm run build  # 自动调用
```

---

#### `post-build.ts`

**用途：** 构建后的清理和优化工作

**调用时机：** `npm run build` 最后一步

**实现功能：**
- 清理临时文件
- 验证构建输出
- 复制必要资源
- 生成构建报告

**使用方式：**
```bash
# 自动执行，无需手动调用
npm run build
```

---

#### `prepare.ts`

**用途：** npm 发布前的准备工作

**调用时机：** `npm publish` 之前自动执行

**实现功能：**
- 验证构建完整性
- 检查版本号一致性
- 确认所有测试通过
- 生成发布清单

**使用方式：**
```bash
# npm 自动调用
npm publish
```

---

#### `package-bun.sh` ⭐

**用途：** 使用 Bun 打包跨平台二进制文件

**支持平台：**
- Linux x64 / ARM64
- macOS x64 / ARM64
- Windows x64

**使用方式：**
```bash
# 打包所有平台
bash scripts/package-bun.sh

# 输出目录
ls -lh dist/
# chrome-extension-debug-linux-x64
# chrome-extension-debug-linux-arm64
# chrome-extension-debug-macos-x64
# chrome-extension-debug-macos-arm64
# chrome-extension-debug-windows-x64.exe
```

**前置条件：**
```bash
# 安装 Bun
curl -fsSL https://bun.sh/install | bash

# 验证安装
bun --version
```

**执行流程：**
1. 编译 TypeScript → `build/`
2. 使用 Bun 打包 → `dist/`
3. 显示文件列表和使用说明

**输出示例：**
```
✅ 打包完成！

📁 输出目录: dist/

📦 文件列表:
-rwxr-xr-x 1 user user 52M chrome-extension-debug-linux-x64
-rwxr-xr-x 1 user user 54M chrome-extension-debug-macos-arm64
...

🚀 使用方法:
./dist/chrome-extension-debug-linux-x64
```

---

#### `sync-server-json-version.ts`

**用途：** 同步 package.json 和其他配置文件的版本号

**实现功能：**
- 读取 package.json 版本
- 更新 server.json 版本
- 确保版本一致性

**使用方式：**
```bash
npm run sync-server-json-version
```

---

### 2. 文档生成（1 个脚本）

#### `generate-docs.ts` ⭐

**用途：** 自动生成工具参考文档

**实现功能：**
- 扫描所有工具定义
- 提取工具名称、描述、参数
- 生成 Markdown 格式文档
- 更新 README.md

**使用方式：**
```bash
npm run docs

# 或单独执行
npm run docs:generate
```

**生成文件：**
- `tool-reference.md` - 完整工具参考
- README.md 更新 - 工具列表章节

**输出示例：**
```markdown
## list_extensions

List all installed Chrome extensions

**Parameters:**
- `includeDisabled` (boolean, optional): Include disabled extensions

**Returns:** Markdown table with extension information
```

---

### 3. 开发工具（2 个脚本）

#### `generate-ide-config.js` ⭐

**用途：** 为不同 IDE 生成 MCP 配置文件

**支持 IDE：**
- Claude Desktop
- Cline (VS Code)
- Cursor
- Windsurf

**实现功能：**
- 检测项目路径
- 生成标准 MCP 配置
- 输出到控制台供复制

**使用方式：**
```bash
npm run generate-config

# 或直接执行
node scripts/generate-ide-config.js
```

**输出示例：**
```json
{
  "mcpServers": {
    "chrome-extension-debug": {
      "command": "node",
      "args": ["/path/to/build/src/index.js"],
      "env": {
        "DEBUG": "mcp:*"
      }
    }
  }
}
```

**配置文件位置：**
- **Claude Desktop**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Cline**: VS Code 设置 → "Cline: Edit MCP Settings"
- **Cursor**: `~/.config/Cursor/User/globalStorage/.../cline_mcp_settings.json`

---

#### `install.sh`

**用途：** 一键安装和配置脚本

**实现功能：**
- 检查 Node.js 版本
- 安装依赖
- 构建项目
- 生成配置
- 运行测试

**使用方式：**
```bash
bash scripts/install.sh
```

**执行流程：**
1. 环境检查
2. `npm install`
3. `npm run build`
4. `npm test`
5. 显示下一步提示

---

### 4. 服务启动（6 个脚本）

#### `start-mcp.sh`

**用途：** 启动本地 stdio 模式 MCP 服务器

**模式：** stdio（标准输入输出）

**使用场景：** IDE 直接调用

**使用方式：**
```bash
bash scripts/start-mcp.sh
```

**配置：**
```json
{
  "command": "/path/to/scripts/start-mcp.sh"
}
```

---

#### `start-mcp.bat`

**用途：** Windows 版本的 stdio 启动脚本

**使用方式：**
```cmd
scripts\start-mcp.bat
```

---

#### `start-http-mcp.sh` ⭐⭐⭐

**用途：** 启动 Streamable HTTP 服务器（推荐方式）

**模式：** Streamable HTTP

**优势：**
- 更简单、更稳定
- 比 SSE 节省 75% 资源
- 更好的兼容性

**使用方式：**
```bash
# 本地模式（MCP 和 Chrome 在同一机器）
bash scripts/start-http-mcp.sh

# 远程模式（Chrome 在远程机器）
BROWSER_URL=http://192.168.1.100:9222 \
bash scripts/start-http-mcp.sh
```

**环境变量：**
```bash
PORT=32123                              # 服务端口（默认 32123）
BROWSER_URL=http://localhost:9222       # Chrome 调试地址
REMOTE_MODE=auto                        # auto/local/remote
```

**输出：**
```
╔═══════════════════════════════════════════════════════════╗
║  Chrome Extension Debug MCP - Streamable HTTP 启动       ║
║  （推荐方式：更简单、更稳定、节省 75% 资源）            ║
╚═══════════════════════════════════════════════════════════╝

✅ 服务已启动
📡 监听地址: http://0.0.0.0:32123
🌐 Chrome 调试: http://localhost:9222

📝 MCP 客户端配置:
{
  "url": "http://localhost:32123/sse"
}
```

---

#### `start-remote-mcp.sh`

**用途：** 在服务器节点启动 MCP SSE 服务

**使用场景：** 局域网多开发者共享

**使用方式：**
```bash
# 在服务器上启动
PORT=3000 \
BROWSER_URL=http://localhost:9222 \
bash scripts/start-remote-mcp.sh
```

**输出：**
```
✅ MCP 远程服务已启动

服务器地址:
  本地: http://localhost:3000
  局域网: http://192.168.1.50:3000

客户端配置:
{
  "url": "http://192.168.1.50:3000/sse"
}
```

---

#### `client-config-generator.sh` ⭐

**用途：** 为开发者生成连接远程 MCP 服务器的配置

**使用场景：** 团队开发，连接共享 MCP 服务器

**使用方式：**
```bash
# 生成配置
bash scripts/client-config-generator.sh 192.168.1.50:3000

# 指定用户 ID
bash scripts/client-config-generator.sh 192.168.1.50:3000 developer-a
```

**输出配置：**
```json
{
  "mcpServers": {
    "chrome-extension-debug-remote": {
      "url": "http://192.168.1.50:3000/sse?userId=developer-a",
      "headers": {
        "X-User-Id": "developer-a"
      }
    }
  }
}
```

**执行流程：**
1. 测试连接 MCP 服务器
2. 验证健康检查 `/health`
3. 生成客户端配置
4. 显示配置位置

---

#### `setup-caddy-privileges.sh`

**用途：** 为 Caddy 反向代理设置权限

**使用场景：** 生产环境 HTTPS 部署

**使用方式：**
```bash
sudo bash scripts/setup-caddy-privileges.sh
```

**实现功能：**
- 设置 Caddy 绑定 80/443 端口权限
- 配置 systemd 服务
- 设置自动启动

---

### 5. 代码质量（1 个目录）

#### `eslint_rules/`

**用途：** 自定义 ESLint 规则

**包含：**
- 项目特定规则
- 规则文档
- 配置示例

**使用方式：**
```javascript
// .eslintrc.js
module.exports = {
  rules: {
    './scripts/eslint_rules': ['error']
  }
};
```

---

## 📊 脚本使用频率

### 高频使用 ⭐⭐⭐⭐⭐

| 脚本 | 使用场景 | 频率 |
|------|---------|------|
| `package-bun.sh` | 打包二进制文件 | 每次发布 |
| `start-http-mcp.sh` | 启动开发服务器 | 每天多次 |
| `generate-docs.ts` | 更新文档 | 添加新工具时 |
| `client-config-generator.sh` | 团队配置 | 新成员加入 |

### 中频使用 ⭐⭐⭐

| 脚本 | 使用场景 | 频率 |
|------|---------|------|
| `start-remote-mcp.sh` | 共享服务器 | 启动服务器时 |
| `generate-ide-config.js` | IDE 配置 | 首次设置 |
| `install.sh` | 项目安装 | 首次克隆项目 |

### 低频使用 ⭐

| 脚本 | 使用场景 | 频率 |
|------|---------|------|
| `setup-caddy-privileges.sh` | 生产部署 | 一次性 |
| `sync-server-json-version.ts` | 版本同步 | 自动执行 |

### 自动执行（无需手动调用）

| 脚本 | 触发时机 |
|------|---------|
| `inject-version.ts` | `npm run build` |
| `post-build.ts` | `npm run build` |
| `prepare.ts` | `npm publish` |

---

## 🔄 典型工作流

### 1. 首次设置

```bash
# 1. 克隆项目
git clone https://github.com/your-org/chrome-ext-devtools-mcp.git
cd chrome-ext-devtools-mcp

# 2. 运行安装脚本
bash scripts/install.sh

# 3. 生成 IDE 配置
npm run generate-config

# 4. 启动开发服务器
bash scripts/start-http-mcp.sh
```

---

### 2. 日常开发

```bash
# 启动服务器
bash scripts/start-http-mcp.sh

# 修改代码...

# 重新构建
npm run build

# 运行测试
npm test
```

---

### 3. 添加新工具

```bash
# 1. 创建工具文件
touch src/tools/my-new-tool.ts

# 2. 实现工具...

# 3. 构建项目
npm run build

# 4. 生成文档
npm run docs

# 5. 提交代码
git add .
git commit -m "feat: add my_new_tool"
```

---

### 4. 发布新版本

```bash
# 1. 更新版本号
vim package.json  # version: "0.8.3"
vim CHANGELOG.md  # 添加变更记录

# 2. 构建和测试
npm run build
npm test

# 3. 打包二进制文件
bash scripts/package-bun.sh

# 4. 提交并打标签
git add .
git commit -m "chore: bump version to 0.8.3"
git tag -a v0.8.3 -m "Release v0.8.3"
git push origin main v0.8.3

# 5. GitHub Actions 自动发布
# 等待 5-10 分钟
```

---

### 5. 团队部署

**服务器端（管理员）：**
```bash
# 在服务器上启动 MCP 服务
cd chrome-ext-devtools-mcp
PORT=3000 bash scripts/start-remote-mcp.sh

# 获取服务器 IP
hostname -I
# 输出: 192.168.1.50
```

**客户端（开发者）：**
```bash
# 生成配置
bash scripts/client-config-generator.sh 192.168.1.50:3000 alice

# 复制配置到 IDE
# 粘贴到 Claude Desktop/Cline 配置文件
```

---

## 🛠️ 脚本维护指南

### 添加新脚本

1. **选择合适的分类**
   - 构建和发布
   - 文档生成
   - 开发工具
   - 服务启动
   - 代码质量

2. **遵循命名规范**
   - 使用 kebab-case: `my-script.sh`
   - 描述性名称: `start-http-mcp.sh` 而非 `run.sh`
   - 加扩展名: `.sh`, `.ts`, `.js`

3. **添加脚本头部**
```bash
#!/bin/bash

# 脚本名称 - 简短描述
# 详细说明脚本用途、参数、环境变量等

set -e  # 遇到错误立即退出
```

4. **更新文档**
   - 在本文档添加说明
   - 更新 README.md（如需要）
   - 添加使用示例

### 脚本最佳实践

**✅ 推荐：**
- 使用 `set -e` 确保错误处理
- 提供详细的帮助信息
- 检查前置条件（依赖、权限等）
- 输出清晰的进度信息
- 使用颜色和表格美化输出
- 提供示例用法

**❌ 避免：**
- 硬编码路径
- 缺少错误处理
- 无提示静默执行
- 缺少文档说明
- 过度复杂的逻辑

---

## 📚 相关文档

- [RELEASE.md](RELEASE.md) - 发布流程文档
- [GITHUB_SETUP.md](GITHUB_SETUP.md) - GitHub 规范化指南
- [README.md](README.md) - 项目主文档

---

## 🎯 快速参考

### 常用命令

```bash
# 构建
npm run build                           # 完整构建
npm run typecheck                       # 仅类型检查

# 测试
npm test                                # 运行所有测试
npm run test:multi-tenant               # 多租户测试

# 文档
npm run docs                            # 生成文档
npm run generate-config                 # 生成 IDE 配置

# 打包
bash scripts/package-bun.sh             # 打包二进制

# 启动
bash scripts/start-http-mcp.sh          # 启动 HTTP 服务
bash scripts/start-remote-mcp.sh        # 启动远程服务
```

### 环境变量

```bash
# 通用
DEBUG=mcp:*                             # 启用调试日志
NODE_ENV=production                     # 生产模式

# HTTP/SSE 服务器
PORT=32122                              # 服务端口
BROWSER_URL=http://localhost:9222       # Chrome 调试地址

# Multi-tenant
AUTH_ENABLED=true                       # 启用认证
ALLOWED_IPS=192.168.1.100,192.168.1.101 # IP 白名单
ALLOWED_ORIGINS=https://app.example.com # CORS 白名单
```

---

**最后更新：** 2025-10-13  
**文档版本：** 1.0  
**脚本数量：** 15 个
