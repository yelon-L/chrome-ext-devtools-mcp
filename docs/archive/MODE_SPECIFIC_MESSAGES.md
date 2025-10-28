# 启动信息 - 按模式区分显示

## 修复说明

启动提示信息现在根据不同的启动模式显示对应的内容，每种模式都有专门的显示函数。

---

## 📋 Stdio 模式 (默认)

### 启动方式

```bash
node build/src/index.js
# 或
npx chrome-extension-debug-mcp
```

### 显示信息

```
[MCP] Chrome Extension Debug MCP v0.8.2
[MCP] Transport: stdio
[MCP] Starting stdio server...

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔒 SECURITY NOTICE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
This MCP server provides full access to browser debugging capabilities.
Ensure you trust the MCP client before connecting.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📋 STDIO MODE - Single User, Local Only
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✓ For local development and IDE integration
✓ Connects to ONE browser instance
✓ Communication via standard input/output
✗ NOT accessible remotely
✗ NOT suitable for multi-user scenarios

💡 For different use cases:
   Remote access:      --transport sse --port 32122
   Production API:     --transport streamable --port 32123
   Multi-tenant SaaS:  node build/src/multi-tenant/server-multi-tenant.js
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

**特点：**

- ✅ 本地开发使用
- ✅ IDE 集成
- ❌ 无法远程访问
- ❌ 不适合多用户

---

## 🌐 SSE 模式

### 启动方式

```bash
node build/src/index.js --transport sse --port 32122
# 或
npx chrome-extension-debug-mcp --transport sse
```

### 显示信息

```
[MCP] Chrome Extension Debug MCP v0.8.2
[MCP] Transport: sse
[MCP] Starting SSE server...
[MCP] Port: 32122

[SSE] Initializing browser...
[SSE] Browser connected

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔒 SECURITY NOTICE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
This MCP server provides full access to browser debugging capabilities.
Ensure proper authentication and network security.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🌐 SSE MODE - HTTP Server
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✓ Server running on http://localhost:32122
✓ Accessible remotely (configure firewall as needed)
✓ Multiple clients can connect
✓ Single browser instance shared by all clients

📡 Available endpoints:
   Health check: http://localhost:32122/health
   SSE stream:   http://localhost:32122/sse
   Test page:    http://localhost:32122/test

⚠️  IMPORTANT:
   - All clients share the SAME browser instance
   - For isolated per-user browsers, use multi-tenant mode
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✅ Server started successfully
Press Ctrl+C to stop
```

**特点：**

- ✅ 远程访问
- ✅ 多客户端连接
- ⚠️ 共享一个浏览器实例
- ✅ Server-Sent Events 传输

---

## 🚀 Streamable HTTP 模式

### 启动方式

```bash
node build/src/index.js --transport streamable --port 32123
# 或
npx chrome-extension-debug-mcp --transport streamable
```

### 显示信息

```
[MCP] Chrome Extension Debug MCP v0.8.2
[MCP] Transport: streamable
[MCP] Starting Streamable HTTP server...
[MCP] Port: 32123

[HTTP] Initializing browser...
[HTTP] Browser connected

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔒 SECURITY NOTICE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
This MCP server provides full access to browser debugging capabilities.
Ensure proper authentication and network security.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🚀 STREAMABLE HTTP MODE - Production Ready
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✓ Server running on http://localhost:32123
✓ Accessible remotely (configure firewall as needed)
✓ Multiple clients can connect
✓ Single browser instance shared by all clients
✓ Latest MCP standard with streaming support

📡 Available endpoints:
   Health check: http://localhost:32123/health
   MCP endpoint: http://localhost:32123/mcp

⚠️  IMPORTANT:
   - All clients share the SAME browser instance
   - For isolated per-user browsers, use multi-tenant mode
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✅ Server started successfully
Press Ctrl+C to stop
```

**特点：**

- ✅ 生产环境就绪
- ✅ 远程访问
- ✅ 多客户端连接
- ⚠️ 共享一个浏览器实例
- ✅ 最新 MCP 标准
- ✅ 支持流式传输

---

## 🏢 Multi-Tenant 模式

### 启动方式

```bash
node build/src/multi-tenant/server-multi-tenant.js
# 或
npm run start:multi-tenant
# 或带环境变量
PORT=32122 AUTH_ENABLED=true node build/src/multi-tenant/server-multi-tenant.js
```

### 显示信息

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔒 SECURITY NOTICE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Multi-tenant production server with isolated user sessions.
Configure authentication and CORS for production use.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🏢 MULTI-TENANT MODE - Enterprise SaaS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✓ Server running on http://localhost:32122
✓ 10-100 concurrent users supported
✓ Each user connects to their OWN browser instance
✓ Session isolation and resource management
✓ Authentication and authorization support

📡 API Endpoints:
   Health:       http://localhost:32122/health
   Register:     POST http://localhost:32122/api/register
   User SSE:     http://localhost:32122/sse/:userId
   Test page:    http://localhost:32122/test

🔐 Configuration (via environment variables):
   PORT=32122                 # Server port
   AUTH_ENABLED=true          # Enable authentication
   TOKEN_EXPIRATION=86400000  # 24 hours
   MAX_SESSIONS=100           # Max concurrent users

📝 User Registration Example:
   curl -X POST http://localhost:32122/api/register \
        -H "Content-Type: application/json" \
        -d '{"userId":"alice","browserURL":"http://localhost:9222"}'

⚠️  REQUIREMENTS:
   - Users must start their OWN Chrome with remote debugging
   - Example: chrome --remote-debugging-port=9222
   - Each user needs a unique port (9222, 9223, 9224, etc.)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✅ Multi-tenant server started successfully
   Authentication: Enabled
   Press Ctrl+C to stop
```

**特点：**

- ✅ 企业级 SaaS
- ✅ 10-100 并发用户
- ✅ 每个用户独立浏览器实例
- ✅ 会话隔离
- ✅ 认证和授权
- ⚠️ 用户需要自己启动 Chrome

---

## 实现细节

### 文件结构

```
src/
├── utils/
│   └── modeMessages.ts          # 所有模式的显示函数
├── main.ts                      # Stdio 模式（调用 displayStdioModeInfo）
├── server-sse.ts                # SSE 模式（调用 displaySSEModeInfo）
├── server-http.ts               # Streamable 模式（调用 displayStreamableModeInfo）
└── multi-tenant/
    └── server-multi-tenant.ts   # Multi-tenant 模式（调用 displayMultiTenantModeInfo）
```

### 显示函数

```typescript
// src/utils/modeMessages.ts

export function displayStdioModeInfo(): void {
  // Stdio 模式专用信息
}

export function displaySSEModeInfo(port: number): void {
  // SSE 模式专用信息
}

export function displayStreamableModeInfo(port: number): void {
  // Streamable 模式专用信息
}

export function displayMultiTenantModeInfo(port: number): void {
  // Multi-tenant 模式专用信息
}
```

### 调用方式

```typescript
// src/main.ts (Stdio 模式)
import {displayStdioModeInfo} from './utils/modeMessages.js';
// ...
await server.connect(transport);
displayStdioModeInfo();

// src/server-sse.ts (SSE 模式)
import {displaySSEModeInfo} from './utils/modeMessages.js';
// ...
httpServer.listen(port, () => {
  displaySSEModeInfo(port);
});

// src/server-http.ts (Streamable 模式)
import {displayStreamableModeInfo} from './utils/modeMessages.js';
// ...
httpServer.listen(port, () => {
  displayStreamableModeInfo(port);
});

// src/multi-tenant/server-multi-tenant.ts (Multi-tenant 模式)
import {displayMultiTenantModeInfo} from '../utils/modeMessages.js';
// ...
this.httpServer!.listen(this.port, () => {
  displayMultiTenantModeInfo(this.port);
});
```

---

## 模式对比

| 特性           | Stdio    | SSE      | Streamable | Multi-Tenant |
| -------------- | -------- | -------- | ---------- | ------------ |
| **远程访问**   | ❌       | ✅       | ✅         | ✅           |
| **多客户端**   | ❌       | ✅       | ✅         | ✅           |
| **浏览器隔离** | N/A      | ❌ 共享  | ❌ 共享    | ✅ 独立      |
| **并发用户**   | 1        | 多个     | 多个       | 10-100       |
| **认证**       | 不需要   | 建议     | 建议       | ✅ 支持      |
| **使用场景**   | 本地开发 | 远程调试 | 生产 API   | 企业 SaaS    |
| **安全提示**   | 基础     | 网络安全 | 网络安全   | 多租户安全   |

---

## 修改清单

### 修改文件

1. ✅ `src/main.ts` - 删除硬编码的 `logDisclaimers()`，使用 `displayStdioModeInfo()`
2. ✅ `src/utils/modeMessages.ts` - 删除 `displayExtensionDebuggingTips()` 函数及所有调用
3. ✅ `src/server-sse.ts` - 已使用 `displaySSEModeInfo()`
4. ✅ `src/server-http.ts` - 已使用 `displayStreamableModeInfo()`
5. ✅ `src/multi-tenant/server-multi-tenant.ts` - 已使用 `displayMultiTenantModeInfo()`

### 删除的内容

- ❌ `logDisclaimers()` 函数（src/main.ts 中的硬编码版本）
- ❌ `displayExtensionDebuggingTips()` 函数（manually activate 提示）
- ❌ 所有模式中的 Chrome Extension Debugging 提示块

### 新增的内容

- ✅ 统一的模式特定显示函数（src/utils/modeMessages.ts）
- ✅ 每种模式都有自己的安全提示
- ✅ 每种模式都有自己的特性说明
- ✅ 清晰的端点和使用说明

---

## 优势

### 1. 信息准确性

每种模式显示与其实际功能匹配的信息，避免误导用户。

### 2. 用户体验

用户一眼就能看到当前模式的特点、限制和可用端点。

### 3. 可维护性

所有显示逻辑集中在 `src/utils/modeMessages.ts`，易于更新和维护。

### 4. 一致性

所有模式的显示格式保持一致，使用相同的视觉分隔符和 emoji 图标。

### 5. 安全意识

每种模式都有针对性的安全提示，提醒用户注意相应的安全风险。

---

**更新日期：** 2025-10-13  
**版本：** v0.8.2  
**状态：** ✅ 已实现并验证
