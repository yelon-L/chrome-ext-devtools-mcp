# MCP 多租户代理架构设计

## 1. 架构概览

### 1.1 系统架构图

```
┌─────────────────────────────────────────────────────────────────┐
│                    MCP Multi-Tenant Proxy                       │
│                     (192.168.1.50:3000)                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────┐ │
│  │  Session Manager │  │  Router Manager  │  │  Auth Manager│ │
│  │  会话管理         │  │  路由管理         │  │  认证管理     │ │
│  └────────┬─────────┘  └────────┬─────────┘  └──────┬───────┘ │
│           │                     │                    │         │
│  ┌────────┴─────────────────────┴────────────────────┴──────┐  │
│  │              Browser Connection Pool                     │  │
│  │              浏览器连接池                                 │  │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐    │  │
│  │  │Browser A│  │Browser B│  │Browser C│  │Browser N│    │  │
│  │  └─────────┘  └─────────┘  └─────────┘  └─────────┘    │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
└──────────┬──────────────────┬──────────────────┬───────────────┘
           │                  │                  │
           ▼                  ▼                  ▼
    ┌──────────┐       ┌──────────┐       ┌──────────┐
    │ User A   │       │ User B   │       │ User C   │
    │ IDE      │       │ IDE      │       │ IDE      │
    │ Chrome A │       │ Chrome B │       │ Chrome C │
    └──────────┘       └──────────┘       └──────────┘
```

### 1.2 核心组件

#### 1.2.1 Session Manager (会话管理器)
**职责**：
- 管理每个客户端的 SSE 连接会话
- 跟踪会话状态和生命周期
- 关联会话与用户和浏览器

**数据结构**：
```typescript
interface Session {
  sessionId: string;
  userId: string;
  transport: SSEServerTransport;
  server: McpServer;
  context: McpContext;
  browser: Browser;
  createdAt: Date;
  lastActivity: Date;
}
```

#### 1.2.2 Router Manager (路由管理器)
**职责**：
- 根据用户标识路由请求到正确的浏览器
- 管理用户到浏览器的映射关系
- 处理动态路由规则

**数据结构**：
```typescript
interface UserBrowserMapping {
  userId: string;
  browserURL: string;
  registeredAt: Date;
  metadata?: {
    ip?: string;
    userAgent?: string;
  };
}
```

#### 1.2.3 Auth Manager (认证管理器)
**职责**：
- 验证用户身份
- 管理 Token 和权限
- 防止未授权访问

**数据结构**：
```typescript
interface AuthToken {
  token: string;
  userId: string;
  permissions: string[];
  expiresAt: Date;
}
```

#### 1.2.4 Browser Connection Pool (浏览器连接池)
**职责**：
- 管理多个浏览器连接
- 连接健康检查
- 自动重连机制
- 连接复用

**数据结构**：
```typescript
interface BrowserConnection {
  browserId: string;
  browserURL: string;
  browser: Browser;
  userId: string;
  status: 'connected' | 'disconnected' | 'reconnecting';
  lastHealthCheck: Date;
  reconnectAttempts: number;
}
```

## 2. API 设计

### 2.1 用户注册 API

**端点**: `POST /api/register`

**请求头**:
```
Authorization: Bearer <token>
Content-Type: application/json
```

**请求体**:
```json
{
  "userId": "developer-a",
  "browserURL": "http://192.168.1.100:9222",
  "metadata": {
    "name": "Developer A",
    "email": "dev-a@example.com"
  }
}
```

**响应**:
```json
{
  "success": true,
  "userId": "developer-a",
  "sessionToken": "sess_xxx",
  "message": "User registered successfully"
}
```

### 2.2 健康检查 API

**端点**: `GET /health`

**响应**:
```json
{
  "status": "ok",
  "activeSessions": 3,
  "registeredUsers": 5,
  "browserConnections": 5,
  "uptime": 3600
}
```

### 2.3 用户状态 API

**端点**: `GET /api/users/:userId/status`

**响应**:
```json
{
  "userId": "developer-a",
  "browserURL": "http://192.168.1.100:9222",
  "browserStatus": "connected",
  "activeSessions": 1,
  "lastActivity": "2025-01-12T10:30:00Z"
}
```

### 2.4 SSE 连接端点

**端点**: `GET /sse`

**请求头**:
```
X-User-Id: developer-a
Authorization: Bearer <token>
```

### 2.5 消息发送端点

**端点**: `POST /message?sessionId=<sessionId>`

## 3. 数据流

### 3.1 用户注册流程

```
1. 用户启动本地 Chrome (端口 9222)
2. 发送注册请求到代理服务器
   POST /api/register
   {userId: "user-a", browserURL: "http://ip:9222"}
3. Auth Manager 验证 Token
4. Router Manager 保存用户-浏览器映射
5. Browser Pool 尝试连接浏览器
6. 返回注册结果
```

### 3.2 SSE 连接建立流程

```
1. IDE 发起 SSE 连接
   GET /sse
   Headers: X-User-Id, Authorization
2. Auth Manager 验证身份
3. Router Manager 查找用户的浏览器 URL
4. Browser Pool 获取或创建浏览器连接
5. Session Manager 创建新会话
6. 返回 SSE 流
```

### 3.3 工具调用流程

```
1. IDE 发送工具调用请求
   POST /message?sessionId=xxx
   {method: "tools/call", params: {...}}
2. Session Manager 根据 sessionId 找到会话
3. 转发到对应的 MCP Server
4. MCP Server 在用户的浏览器上执行
5. 结果通过 SSE 返回给 IDE
```

## 4. 隔离机制

### 4.1 会话隔离
- 每个用户有独立的 SSE 会话
- 会话 ID 唯一标识
- 会话间不共享状态

### 4.2 浏览器隔离
- 每个用户连接到自己的浏览器
- 浏览器连接独立管理
- 操作不会影响其他用户

### 4.3 上下文隔离
- 每个会话有独立的 McpContext
- Tab 操作限制在会话范围内
- 扩展调试限制在用户浏览器范围

## 5. 安全设计

### 5.1 认证机制
- Token 基于认证
- Token 定期轮换
- 支持多种认证方式（Basic Auth, API Key, OAuth）

### 5.2 授权控制
- 基于用户的权限管理
- 工具级别的访问控制
- 速率限制

### 5.3 网络安全
- HTTPS 支持
- CORS 配置
- IP 白名单
- 防火墙规则

### 5.4 数据安全
- 敏感数据加密
- 日志脱敏
- 会话超时自动清理

## 6. 可靠性设计

### 6.1 健康检查
- 浏览器连接健康检查（每 30 秒）
- 会话活跃度检查
- 自动清理过期会话

### 6.2 重连机制
- 浏览器断开自动重连
- 指数退避策略
- 最大重连次数限制

### 6.3 错误处理
- 详细错误日志
- 用户友好的错误消息
- 故障转移策略

### 6.4 监控指标
- 活跃会话数
- 浏览器连接状态
- API 调用频率
- 错误率统计

## 7. 性能优化

### 7.1 连接复用
- 同一用户的多个会话共享浏览器连接
- 连接池管理

### 7.2 请求优化
- 并发请求支持
- 请求队列管理
- 超时控制

### 7.3 资源管理
- 会话自动清理
- 内存使用监控
- 连接数限制

## 8. 扩展性

### 8.1 水平扩展
- 支持多代理服务器部署
- 负载均衡
- 分布式会话管理

### 8.2 配置化
- 环境变量配置
- 配置文件支持
- 动态配置更新

### 8.3 插件机制
- 认证插件
- 日志插件
- 监控插件

## 9. 部署架构

### 9.1 单机部署
```
MCP Proxy Server (standalone)
├── All components in one process
└── Suitable for small teams
```

### 9.2 分布式部署
```
Load Balancer
  ├── MCP Proxy Server 1
  ├── MCP Proxy Server 2
  └── MCP Proxy Server N
       ├── Shared Session Store (Redis)
       └── Shared Config Store
```

## 10. 技术栈

- **运行时**: Node.js 20+
- **语言**: TypeScript
- **MCP SDK**: @modelcontextprotocol/sdk
- **浏览器控制**: Puppeteer
- **传输协议**: Server-Sent Events (SSE)
- **认证**: JWT / API Key
- **日志**: Winston / Pino
- **监控**: Prometheus + Grafana (可选)
