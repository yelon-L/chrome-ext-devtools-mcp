# Multi-tenant 模式：第一性原理分析结论

## 核心结论

**Multi-tenant 是一个独立的 HTTP 服务器程序，内部使用 SSE (Server-Sent Events) 传输协议，设计用于支持多用户同时连接，每个用户操作自己的浏览器实例。**

---

## 第一性原理推导

### 1. Multi-tenant 的本质

```
需求：多用户 + 远程访问 + 用户隔离
  ↓
必须是 HTTP 服务（不能是 stdio）
  ↓
选择 SSE 传输（已在代码中实现）
  ↓
独立部署的服务器程序
```

### 2. 传输协议

**代码验证：**

```typescript
// src/multi-tenant/server-multi-tenant.ts:21
import {SSEServerTransport} from '@modelcontextprotocol/sdk/server/sse.js';

// src/multi-tenant/server-multi-tenant.ts:572
const transport = new SSEServerTransport('/message', res);
```

**结论：** Multi-tenant **硬编码使用 SSE 传输**，不支持 Streamable HTTP。

### 3. 架构模式

```
Multi-tenant Server (独立程序)
  ├─ HTTP Server (监听端口 32122)
  ├─ SSE 传输层 (硬编码)
  ├─ Session Manager (多用户会话管理)
  ├─ Browser Pool (浏览器连接池)
  └─ Auth Manager (认证管理)

每个用户：
  User → SSE Connection → MCP Server → User's Browser
```

**关键特点：**

- ✅ 每个用户有独立的 SSE 连接
- ✅ 每个用户有独立的 MCP Server 实例
- ✅ 每个用户连接自己的浏览器
- ✅ 用户之间完全隔离

---

## 正确的使用方式

### 启动服务器

```bash
# ✅ 正确方式 1
npm run server:multi-tenant

# ✅ 正确方式 2
node build/src/multi-tenant/server-multi-tenant.js

# ✅ 正确方式 3（带配置）
PORT=32122 AUTH_ENABLED=true node build/src/multi-tenant/server-multi-tenant.js
```

```bash
# ❌ 错误方式（参数不存在！）
npx chrome-extension-debug-mcp --mode multi-tenant
./chrome-extension-debug-mcp --mode multi-tenant
```

**为什么错误？**

- `--mode` 参数在 CLI 中不存在
- Multi-tenant 是独立程序，不是传输模式参数
- 需要直接运行编译后的 JavaScript 文件

### 部署架构

```
┌─────────────────────────────────────────────┐
│  Production Server (server.com)            │
│                                             │
│  ┌───────────────────────────────────────┐ │
│  │  Multi-tenant MCP Server              │ │
│  │  Port: 32122                          │ │
│  │  Transport: SSE (hardcoded)           │ │
│  └───────────────────────────────────────┘ │
│                                             │
│  Command:                                   │
│  node build/src/multi-tenant/               │
│       server-multi-tenant.js                │
└─────────────────────────────────────────────┘
              ↑           ↑
        HTTP/SSE    HTTP/SSE
              │           │
    ┌─────────┴───┐  ┌───┴─────────┐
    │ User: alice │  │ User: bob   │
    │             │  │             │
    │ Chrome:9222 │  │ Chrome:9222 │
    │ MCP Client  │  │ MCP Client  │
    └─────────────┘  └─────────────┘
```

### 用户使用流程

```bash
# 步骤 1: 用户在本地启动 Chrome
google-chrome --remote-debugging-port=9222 \
              --user-data-dir=/tmp/chrome-alice

# 步骤 2: 注册到服务器
curl -X POST http://server.com:32122/api/register \
  -d '{"userId":"alice","browserURL":"http://localhost:9222"}'

# 响应
{
  "sseEndpoint": "http://server.com:32122/sse?userId=alice"
}

# 步骤 3: 配置 MCP 客户端
# Claude Desktop config.json:
{
  "mcpServers": {
    "chrome-alice": {
      "transport": {
        "type": "sse",
        "url": "http://server.com:32122/sse?userId=alice"
      }
    }
  }
}
```

---

## 与其他模式的对比

### 传输方式对比表

| 特性           | stdio                            | SSE 服务器                            | Streamable 服务器                | Multi-tenant                                         |
| -------------- | -------------------------------- | ------------------------------------- | -------------------------------- | ---------------------------------------------------- |
| **启动命令**   | `npx chrome-extension-debug-mcp` | `npx ... --transport sse --port 3000` | `npx ... --transport streamable` | `node build/src/multi-tenant/server-multi-tenant.js` |
| **传输协议**   | 标准输入输出                     | SSE (HTTP)                            | Streamable HTTP                  | SSE (HTTP)                                           |
| **远程访问**   | ❌ 不可以                        | ✅ 可以                               | ✅ 可以                          | ✅ 可以                                              |
| **多用户**     | ❌ 单用户                        | ✅ 多用户                             | ✅ 多用户                        | ✅ 多用户                                            |
| **浏览器隔离** | N/A                              | ❌ 共享浏览器                         | ❌ 共享浏览器                    | ✅ 独立浏览器                                        |
| **用户注册**   | N/A                              | 无需注册                              | 无需注册                         | ✅ 需要注册                                          |
| **代码位置**   | `src/index.ts` (main)            | `src/server-sse.ts`                   | `src/server-http.ts`             | `src/multi-tenant/server-multi-tenant.ts`            |

### 核心区别

**stdio/SSE/Streamable 服务器：**

```
一个浏览器实例 ← 所有用户共享
```

**Multi-tenant 服务器：**

```
User A → Browser A
User B → Browser B
User C → Browser C
```

---

## 技术实现细节

### 1. Multi-tenant 使用的传输协议

**源码证据：**

```typescript
// src/multi-tenant/server-multi-tenant.ts
import {SSEServerTransport} from '@modelcontextprotocol/sdk/server/sse.js';

// 第 572 行
const transport = new SSEServerTransport('/message', res);
```

**结论：** 使用 **SSE (Server-Sent Events)**，不是 Streamable HTTP。

### 2. 为什么不能用 `--transport` 参数？

**原因：**

1. Multi-tenant 是独立程序，有自己的入口文件
2. 传输协议硬编码为 SSE，不支持配置
3. `--transport` 参数只用于 `src/index.ts`（stdio/SSE/Streamable 服务器）

**代码对比：**

```typescript
// src/index.ts - 支持 --transport 参数
if (args.transport === 'sse') {
  // SSE 服务器
} else if (args.transport === 'streamable') {
  // Streamable 服务器
} else {
  // stdio 模式
}

// src/multi-tenant/server-multi-tenant.ts - 硬编码 SSE
const transport = new SSEServerTransport('/message', res);
```

### 3. 环境变量配置

Multi-tenant 通过环境变量配置，不使用命令行参数：

```typescript
// src/multi-tenant/server-multi-tenant.ts
constructor() {
  this.port = parseInt(process.env.PORT || '32122', 10);
  const authEnabled = process.env.AUTH_ENABLED !== 'false';
  // ...
}
```

**支持的环境变量：**

- `PORT` - 服务器端口
- `AUTH_ENABLED` - 认证开关
- `TOKEN_EXPIRATION` - Token 过期时间
- `MAX_SESSIONS` - 最大会话数
- `SESSION_TIMEOUT` - 会话超时
- `ALLOWED_ORIGINS` - CORS 配置

---

## 为什么需要 Multi-tenant？

### 使用场景对比

**场景 1: 本地开发（单用户）**

```bash
# 使用 stdio 模式
npx chrome-extension-debug-mcp
```

✅ 适合：个人在 IDE 中使用

**场景 2: 团队共享访问（多用户，共享浏览器）**

```bash
# 使用 SSE 服务器
npx chrome-extension-debug-mcp --transport sse --port 3000
```

✅ 适合：团队成员访问同一个测试环境

**场景 3: SaaS 多租户（多用户，独立浏览器）**

```bash
# 使用 Multi-tenant
node build/src/multi-tenant/server-multi-tenant.js
```

✅ 适合：

- SaaS 产品提供浏览器自动化服务
- 每个客户需要独立的浏览器环境
- 需要用户隔离和安全性

### 典型应用

1. **浏览器自动化 SaaS**
   - 客户注册账号
   - 连接自己的浏览器
   - 完全隔离，互不干扰

2. **CI/CD 并行测试**
   - 每个测试任务使用独立浏览器
   - 避免状态污染

3. **远程开发团队**
   - 每个开发者连接自己的浏览器
   - 在远程服务器上调试

---

## 总结

### Multi-tenant 的正确理解

1. **独立程序** - 不是传输模式参数，是独立的服务器程序
2. **SSE 传输** - 硬编码使用 SSE，不支持 Streamable
3. **环境变量配置** - 通过环境变量配置，不用命令行参数
4. **用户隔离** - 每个用户有独立的会话和浏览器

### 正确的启动方式

```bash
# ✅ 正确
node build/src/multi-tenant/server-multi-tenant.js

# ✅ 带配置
PORT=32122 AUTH_ENABLED=true node build/src/multi-tenant/server-multi-tenant.js

# ❌ 错误（参数不存在）
npx chrome-extension-debug-mcp --mode multi-tenant
```

### README 需要修正

**已修正：**

- ✅ 删除了 `--mode multi-tenant` 的错误示例
- ✅ 使用正确的 `node build/src/multi-tenant/server-multi-tenant.js`
- ✅ 添加环境变量配置说明

---

## 相关文档

- **架构分析：** [MULTI_TENANT_ARCHITECTURE_ANALYSIS.md](./MULTI_TENANT_ARCHITECTURE_ANALYSIS.md)
- **快速开始：** [MULTI_TENANT_QUICK_START.md](./MULTI_TENANT_QUICK_START.md)
- **模式消息：** [STARTUP_MESSAGES_IMPROVEMENT.md](./STARTUP_MESSAGES_IMPROVEMENT.md)

---

**结论日期：** 2025-10-13  
**分析方法：** 第一性原理 + 代码验证  
**验证状态：** ✅ 已通过代码和实际测试验证
