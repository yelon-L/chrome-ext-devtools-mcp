# Chrome DevTools MCP 传输模式指南

**版本**: v0.8.10  
**最后更新**: 2025-10-14

---

## 📋 概述

Chrome DevTools MCP 服务器支持四种传输模式，每种模式适用于不同的场景：

| 模式 | 适用场景 | 网络要求 | 客户端类型 |
|------|---------|---------|-----------|
| **stdio** | MCP 客户端集成 | 本地进程 | Claude Desktop, Cline |
| **sse** | HTTP 访问（旧版） | 需要端口 | Web 应用, 自定义客户端 |
| **streamable** | HTTP 访问（新标准） | 需要端口 | 现代 MCP 客户端 |
| **multi-tenant** | 企业级部署 | 需要端口 | 多用户 SaaS |

---

## 🎯 模式 1: STDIO (Standard I/O)

### 概述

stdio 模式是 MCP 的标准传输协议，通过标准输入输出进行通信。

**优势**:
- ✅ MCP 标准协议，兼容所有 MCP 客户端
- ✅ 低延迟，直接进程通信
- ✅ 无需网络端口
- ✅ 简单可靠

**限制**:
- ❌ 一个进程只能服务一个客户端
- ❌ 不支持远程访问
- ❌ 需要持续的双向通信

### 启动方式

#### 使用二进制文件

```bash
# 基础启动
node build/src/index.js --browserUrl http://localhost:9222

# 指定传输模式（默认就是 stdio）
node build/src/index.js --browserUrl http://localhost:9222 --transport stdio
```

#### 使用 npm 包

```bash
npx chrome-extension-debug-mcp@latest --browserUrl http://localhost:9222
```

### 配置示例

#### Claude Desktop 配置

```json
{
  "mcpServers": {
    "chrome-devtools": {
      "command": "node",
      "args": [
        "/path/to/build/src/index.js",
        "--browserUrl",
        "http://localhost:9222"
      ]
    }
  }
}
```

#### Cline (VS Code) 配置

```json
{
  "mcpServers": {
    "chrome-devtools": {
      "command": "node",
      "args": [
        "/path/to/build/src/index.js",
        "--browserUrl",
        "http://localhost:9222"
      ]
    }
  }
}
```

### 测试方法

#### 使用 MCP Inspector

```bash
# 推荐的测试工具
npx @modelcontextprotocol/inspector node build/src/index.js --browserUrl http://localhost:9222
```

#### 测试脚本

```bash
# 运行 stdio 模式测试
./docs/examples/test-stdio-mode.sh
```

**测试输出示例**:

```
╔═══════════════════════════════════════════════════════════════════╗
║                     STDIO 模式测试                                ║
╚═══════════════════════════════════════════════════════════════════╝

✅ 浏览器已连接: http://localhost:9222

⚠️  stdio 模式需要持续的双向通信，无法使用简单的 shell 测试
   建议使用 MCP Inspector 或 Claude Desktop 进行完整测试

🔧 推荐工具:
   • MCP Inspector: npx @modelcontextprotocol/inspector <命令>
   • Claude Desktop: 配置 mcpServers
```

### 完整命令行参数

```bash
node build/src/index.js \
  --browserUrl http://localhost:9222 \  # Chrome 调试地址
  --transport stdio \                   # 传输模式（可选，默认）
  --headless false \                    # 是否无头模式
  --isolated false \                    # 是否隔离用户数据
  --viewport 1280x720                   # 视口大小
```

---

## 🌐 模式 2: SSE (Server-Sent Events)

### 概述

SSE 模式通过 HTTP 提供服务，使用服务器推送事件进行通信。

**优势**:
- ✅ 支持 HTTP 访问，可远程连接
- ✅ 适合 Web 应用集成
- ✅ 可通过反向代理部署
- ✅ 支持跨域配置

**限制**:
- ❌ 一个连接只能服务一个客户端
- ❌ 需要维护 SSE 连接 + POST 请求
- ❌ 比 stdio 多网络开销

### 启动方式

```bash
# 使用默认端口 32122
node build/src/index.js --browserUrl http://localhost:9222 --transport sse

# 自定义端口
node build/src/index.js --browserUrl http://localhost:9222 --transport sse --port 8080
```

### HTTP 端点

| 端点 | 方法 | 说明 |
|------|------|------|
| `/` | GET | 服务器信息和版本 |
| `/health` | GET | 健康检查 |
| `/sse` | GET | SSE 连接（长连接） |
| `/message` | POST | 发送 MCP 消息 |

### 测试方法

#### 使用测试脚本

```bash
# 运行 SSE 模式测试
./docs/examples/test-sse-mode.sh
```

**测试输出示例**:

```
╔═══════════════════════════════════════════════════════════════════╗
║                     SSE 模式测试                                  ║
╚═══════════════════════════════════════════════════════════════════╝

🚀 启动 SSE 服务器...
   端口: 32122
✅ SSE 服务器已就绪

测试 1: 健康检查端点
📤 GET http://localhost:32122/health
📥 响应:
{
  "status": "ok",
  "version": "0.8.10"
}
✅ 健康检查通过

测试 2: 服务器信息
📥 响应:
{
  "name": "chrome-extension-debug-mcp",
  "version": "0.8.10",
  "endpoint": "/sse"
}
✅ 服务器版本: 0.8.10
✅ SSE 端点: /sse

测试 3: SSE 连接测试
✅ SSE 连接可以建立
```

#### 使用 curl 手动测试

```bash
# 1. 健康检查
curl http://localhost:32122/health | jq .

# 2. 获取服务器信息
curl http://localhost:32122/ | jq .

# 3. 建立 SSE 连接（长连接）
curl -N http://localhost:32122/sse

# 4. 发送 MCP 消息
curl -X POST http://localhost:32122/message \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/list"
  }'
```

### 客户端实现示例

#### JavaScript / TypeScript

```typescript
// 1. 建立 SSE 连接
const eventSource = new EventSource('http://localhost:32122/sse');

eventSource.onmessage = (event) => {
  const response = JSON.parse(event.data);
  console.log('收到响应:', response);
};

// 2. 发送请求
async function sendMCPRequest(method, params) {
  const response = await fetch('http://localhost:32122/message', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: Date.now(),
      method,
      params
    })
  });
  
  // 响应会通过 SSE 连接返回
}

// 3. 使用示例
await sendMCPRequest('tools/list', {});
```

### 环境变量

```bash
# 启动时设置
PORT=8080 node build/src/index.js --browserUrl http://localhost:9222 --transport sse
```

---

## 🌊 模式 3: Streamable HTTP（新标准）

### 概述

Streamable HTTP 是 MCP 协议的最新标准传输方式，使用 HTTP 流式传输实现双向通信。

**优势**:
- ✅ MCP 官方推荐的 HTTP 传输标准
- ✅ 原生双向流式通信
- ✅ 更好的性能（相比 SSE）
- ✅ 标准化的协议设计
- ✅ 支持远程访问

**限制**:
- ❌ 一个服务器实例只能服务一个客户端
- ❌ 需要客户端支持 StreamableHTTP
- ❌ 相对较新，生态系统尚在发展

### 启动方式

```bash
# 使用默认端口 32123
node build/src/index.js --browserUrl http://localhost:9222 --transport streamable

# 自定义端口
node build/src/index.js --browserUrl http://localhost:9222 --transport streamable --port 8080
```

### HTTP 端点

| 端点 | 方法 | 说明 |
|------|------|------|
| `/` | GET | 服务器信息和健康检查 |
| `/mcp` | POST | MCP 流式通信端点 |

### 测试方法

#### 使用 curl 测试

```bash
# 1. 获取服务器信息
curl http://localhost:32123/

# 2. MCP 通信（需要支持流式响应的客户端）
curl -X POST http://localhost:32123/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json" \
  --data-binary '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "initialize",
    "params": {
      "protocolVersion": "2024-11-05",
      "capabilities": {},
      "clientInfo": {
        "name": "test-client",
        "version": "1.0.0"
      }
    }
  }'
```

### 特性对比：SSE vs Streamable

| 特性 | SSE | Streamable |
|------|-----|------------|
| 协议 | SSE + POST | HTTP Streaming |
| 双向通信 | 需要两个连接 | 单连接双向流 |
| MCP 标准 | 早期实现 | 官方推荐 |
| 性能 | 良好 | 更优 |
| 复杂度 | 中等 | 低 |

### 环境变量

```bash
# 启动时设置
PORT=8080 node build/src/index.js --browserUrl http://localhost:9222 --transport streamable
```

### 适用场景

- ✅ 需要 HTTP 访问的现代应用
- ✅ 支持 Streamable MCP 的新客户端
- ✅ 单用户远程调试场景
- ❌ 不适合多用户场景（使用 multi-tenant）

---

## 🏢 模式 4: Multi-Tenant（多租户）

### 概述

多租户模式是企业级部署方案，支持多用户同时连接，每个用户操作独立的浏览器实例。

**详细文档**: 参见 [MULTI_TENANT_GUIDE.md](./MULTI_TENANT_GUIDE.md)

**优势**:
- ✅ 支持多用户并发
- ✅ 用户和浏览器隔离
- ✅ Token 认证机制
- ✅ 双存储后端（JSONL / PostgreSQL）
- ✅ RESTful API

**限制**:
- ❌ 需要数据库（可选 PostgreSQL）
- ❌ 配置相对复杂
- ❌ 需要额外的资源管理

### 快速启动

```bash
# JSONL 模式（默认）
node build/src/multi-tenant/server-multi-tenant.js

# PostgreSQL 模式
STORAGE_TYPE=postgresql \
DB_HOST=localhost \
DB_PORT=5432 \
DB_NAME=mcp_devtools \
DB_USER=admin \
DB_PASSWORD=password \
node build/src/multi-tenant/server-multi-tenant.js
```

### 测试方法

```bash
# 运行多租户模式测试
./docs/examples/test-multi-tenant-mode.sh jsonl
```

---

## 📊 模式对比总结

### 性能对比

| 指标 | stdio | sse | streamable | multi-tenant |
|------|-------|-----|------------|--------------|
| 延迟 | 最低 (~1ms) | 低 (~5ms) | 最低 (~2ms) | 中 (~10ms) |
| 吞吐量 | 中 | 中 | 高 | 高 |
| 并发用户 | 1 | 1 | 1 | 100+ |
| 内存占用 | 低 | 低 | 低 | 中 |
| MCP标准 | ✅ 标准 | ⚠️ 早期 | ✅ 新标准 | ✅ 企业级 |

### 适用场景

#### stdio 模式
- ✅ 桌面应用集成（Claude Desktop）
- ✅ IDE 插件（Cline）
- ✅ 本地开发调试
- ❌ 不适合远程访问
- ❌ 不适合多用户

#### sse 模式
- ✅ Web 应用集成（旧项目）
- ✅ 远程访问需求
- ✅ 兼容性需求
- ⚠️ 建议升级到 streamable
- ❌ 不适合多用户

#### streamable 模式（推荐）
- ✅ 现代 Web 应用集成
- ✅ 远程访问需求
- ✅ 单用户高性能场景
- ✅ 符合 MCP 最新标准
- ❌ 不适合多用户

#### multi-tenant 模式
- ✅ 企业级部署
- ✅ SaaS 平台
- ✅ 多用户协作
- ✅ 需要用户管理
- ⚠️ 配置复杂
- ⚠️ 需要数据库

---

## 🔧 故障排查

### stdio 模式

**问题**: 客户端无法连接

**解决方案**:
1. 确认二进制文件路径正确
2. 确认浏览器正在运行: `curl http://localhost:9222/json/version`
3. 检查客户端配置文件

### sse 模式

**问题**: 无法访问 HTTP 端点

**解决方案**:
```bash
# 1. 检查端口是否被占用
lsof -i :32122

# 2. 检查防火墙
sudo ufw status

# 3. 尝试其他端口
node build/src/index.js --browserUrl http://localhost:9222 --transport sse --port 8080
```

### multi-tenant 模式

**问题**: PostgreSQL 连接失败

**解决方案**:
```bash
# 1. 测试数据库连接
psql -h localhost -p 5432 -U admin -d mcp_devtools

# 2. 检查环境变量
env | grep DB_

# 3. 使用 JSONL 模式作为备选
STORAGE_TYPE=jsonl node build/src/multi-tenant/server-multi-tenant.js
```

---

## 📚 相关资源

- [多租户模式详细指南](./MULTI_TENANT_GUIDE.md)
- [V2 API 文档](../MULTI_TENANT_COMPLETE.md)
- [测试脚本](../examples/)
- [MCP 协议规范](https://modelcontextprotocol.io)

---

**完成时间**: 2025-10-14  
**维护者**: Chrome DevTools MCP Team
