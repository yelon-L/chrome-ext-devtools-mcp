# MCP 远程服务部署指南

## 场景说明

**目标**: 在一个节点运行 MCP 服务器，局域网的其他开发环境连接到这个 MCP 进行调试。

**架构**:
```
开发者 A (192.168.1.100)          开发者 B (192.168.1.101)
  ├─ IDE (Cline/Claude)              ├─ IDE (Cline/Claude)
  └─ 连接 → MCP Server              └─ 连接 → MCP Server
              ↓                                    ↓
         MCP Server (192.168.1.50:3000)
              ├─ HTTP/SSE 服务
              └─ 连接 → Chrome (各自的或共享的)
```

---

## 可行性分析

### ✅ 可以实现的场景

#### 场景 1: 共享 Chrome 实例
```
开发环境 A/B/C → MCP Server → Chrome (在 MCP Server 节点)
```
- ✅ 多个开发者共享同一个 Chrome
- ✅ 适合团队协作调试
- ⚠️ 需要协调操作

#### 场景 2: 各自 Chrome + 远程转发
```
开发环境 A → MCP Server → 转发 → Chrome A (192.168.1.100:9222)
开发环境 B → MCP Server → 转发 → Chrome B (192.168.1.101:9222)
```
- ✅ 每个开发者有自己的 Chrome
- ✅ 互不干扰
- ⚠️ 需要网络可达

#### 场景 3: 本地 Chrome + 远程 MCP 工具
```
开发环境 A:
  ├─ Chrome (本地 localhost:9222)
  ├─ SSH 隧道 → MCP Server
  └─ IDE 连接 MCP Server
```
- ✅ Chrome 在本地
- ✅ MCP 工具远程调用
- ⚠️ 需要端口转发

---

## 实现方案

### 方案 1: 使用 SSE 服务器模式（推荐）

MCP 已经内置了 SSE 服务器支持！

#### 步骤 1: 在服务器节点启动 MCP SSE 服务

```bash
# 在 192.168.1.50 上
cd chrome-ext-devtools-mcp

# 方式 A: 连接到本地 Chrome
node build/src/server-sse.js --browser-url http://localhost:9222

# 方式 B: 启动新的 Chrome
node build/src/server-sse.js --start-chrome

# 方式 C: 指定端口
PORT=3000 node build/src/server-sse.js --browser-url http://localhost:9222
```

**默认端口**: 3000 (可通过 PORT 环境变量修改)

#### 步骤 2: 验证服务运行

```bash
# 在任意机器上测试
curl http://192.168.1.50:3000/health

# 应该返回
{"status":"ok","version":"0.8.0"}
```

#### 步骤 3: 客户端连接配置

**Cline 配置**:
```json
{
  "mcpServers": {
    "chrome-devtools-remote": {
      "url": "http://192.168.1.50:3000/sse"
    }
  }
}
```

**Claude Desktop 配置**:
```json
{
  "mcpServers": {
    "chrome-devtools-remote": {
      "url": "http://192.168.1.50:3000/sse"
    }
  }
}
```

**VS Code 配置**:
```json
{
  "mcp.servers": {
    "chrome-devtools-remote": {
      "url": "http://192.168.1.50:3000/sse"
    }
  }
}
```

---

### 方案 2: 反向代理 + HTTPS (生产环境)

#### 使用 Nginx

```nginx
# /etc/nginx/sites-available/mcp-server

upstream mcp_backend {
    server 127.0.0.1:3000;
}

server {
    listen 80;
    server_name mcp.yourdomain.com;

    location / {
        proxy_pass http://mcp_backend;
        proxy_http_version 1.1;
        
        # SSE 必需的配置
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection '';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        
        # 禁用缓冲（SSE 必需）
        proxy_buffering off;
        proxy_cache off;
        
        # 超时设置
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
    }
}
```

#### 使用 Caddy（更简单）

```
mcp.yourdomain.com {
    reverse_proxy localhost:3000 {
        flush_interval -1
    }
}
```

---

### 方案 3: SSH 隧道（安全方式）

#### 场景：Chrome 在本地，MCP Server 在远程

**开发者 A 的配置**:

```bash
# 1. 转发本地 Chrome 到远程服务器
ssh -R 9222:localhost:9222 user@192.168.1.50

# 远程服务器上 Chrome 现在可以通过 localhost:9222 访问
```

**MCP Server (192.168.1.50)**:
```bash
# 连接到转发的 Chrome
node build/src/server-sse.js --browser-url http://localhost:9222
```

**客户端连接**:
```bash
# 建立到 MCP Server 的隧道
ssh -L 3000:localhost:3000 user@192.168.1.50
```

然后配置 IDE 连接到 `http://localhost:3000/sse`

---

## 具体实现：各自的浏览器和扩展

### 架构设计

```
开发者 A (192.168.1.100)
  ├─ Chrome A :9222
  ├─ 扩展 A
  └─ IDE → MCP Proxy → 路由到 Chrome A

开发者 B (192.168.1.101)
  ├─ Chrome B :9222
  ├─ 扩展 B
  └─ IDE → MCP Proxy → 路由到 Chrome B

MCP Proxy Server (192.168.1.50:3000)
  ├─ 会话管理
  ├─ 路由规则
  └─ 多 Chrome 连接池
```

### 实现方案

#### 创建 MCP 多租户代理

```javascript
// mcp-multi-tenant-proxy.js

import http from 'http';
import {SSEServerTransport} from '@modelcontextprotocol/sdk/server/sse.js';
import puppeteer from 'puppeteer-core';

class MCPMultiTenantProxy {
  constructor() {
    this.sessions = new Map(); // sessionId -> {browser, userId}
    this.userBrowsers = new Map(); // userId -> browserURL
  }

  async registerUser(userId, browserURL) {
    this.userBrowsers.set(userId, browserURL);
    console.log(`✅ 注册用户 ${userId} -> ${browserURL}`);
  }

  async connectToBrowser(userId) {
    const browserURL = this.userBrowsers.get(userId);
    if (!browserURL) {
      throw new Error(`用户 ${userId} 未注册`);
    }

    try {
      const browser = await puppeteer.connect({
        browserURL: browserURL
      });
      return browser;
    } catch (error) {
      throw new Error(`连接到 ${browserURL} 失败: ${error.message}`);
    }
  }

  async handleRequest(req, res, userId) {
    const browser = await this.connectToBrowser(userId);
    
    // 创建该用户专属的 MCP 会话
    const sessionId = `${userId}-${Date.now()}`;
    const transport = new SSEServerTransport('/sse', res);
    
    this.sessions.set(sessionId, {
      browser,
      userId,
      transport
    });

    // 返回 SSE 响应...
  }
}

const proxy = new MCPMultiTenantProxy();

// 启动服务器
const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  
  // 从请求中获取用户标识
  const userId = req.headers['x-user-id'] || 'default';
  
  if (url.pathname === '/register') {
    // 注册用户的 Chrome URL
    const browserURL = url.searchParams.get('browserURL');
    proxy.registerUser(userId, browserURL);
    res.writeHead(200);
    res.end(JSON.stringify({success: true}));
  } else if (url.pathname === '/sse') {
    proxy.handleRequest(req, res, userId);
  }
});

server.listen(3000);
```

#### 使用方式

**开发者 A 注册**:
```bash
# 开发者 A 先启动本地 Chrome
chrome --remote-debugging-port=9222

# 注册到 MCP Proxy
curl -H "X-User-Id: developer-a" \
  "http://192.168.1.50:3000/register?browserURL=http://192.168.1.100:9222"
```

**开发者 B 注册**:
```bash
# 开发者 B 启动本地 Chrome
chrome --remote-debugging-port=9222

# 注册
curl -H "X-User-Id: developer-b" \
  "http://192.168.1.50:3000/register?browserURL=http://192.168.1.101:9222"
```

**IDE 配置**:
```json
{
  "mcpServers": {
    "chrome-devtools-remote": {
      "url": "http://192.168.1.50:3000/sse",
      "headers": {
        "X-User-Id": "developer-a"
      }
    }
  }
}
```

---

## 安全考虑

### 1. 网络隔离

```bash
# 只允许特定 IP 访问
iptables -A INPUT -p tcp --dport 3000 -s 192.168.1.0/24 -j ACCEPT
iptables -A INPUT -p tcp --dport 3000 -j DROP
```

### 2. 认证

添加 Token 认证：

```javascript
// 在 MCP Proxy 中
const VALID_TOKENS = new Set([
  'token-developer-a',
  'token-developer-b'
]);

function authenticate(req) {
  const token = req.headers['authorization']?.replace('Bearer ', '');
  return VALID_TOKENS.has(token);
}
```

IDE 配置：
```json
{
  "mcpServers": {
    "chrome-devtools-remote": {
      "url": "http://192.168.1.50:3000/sse",
      "headers": {
        "Authorization": "Bearer token-developer-a"
      }
    }
  }
}
```

### 3. HTTPS

使用反向代理启用 HTTPS（见方案 2）

---

## 完整部署示例

### 服务器端 (192.168.1.50)

```bash
#!/bin/bash
# deploy-mcp-server.sh

# 1. 安装依赖
cd chrome-ext-devtools-mcp
npm install
npm run build

# 2. 启动 Chrome (如果需要共享 Chrome)
google-chrome --remote-debugging-port=9222 --no-first-run &

# 3. 启动 MCP SSE 服务器
PORT=3000 node build/src/server-sse.js --browser-url http://localhost:9222

# 或使用 systemd
sudo tee /etc/systemd/system/mcp-server.service <<EOF
[Unit]
Description=MCP SSE Server
After=network.target

[Service]
Type=simple
User=mcp
WorkingDirectory=/opt/chrome-ext-devtools-mcp
Environment="PORT=3000"
ExecStart=/usr/bin/node build/src/server-sse.js --browser-url http://localhost:9222
Restart=always

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl enable mcp-server
sudo systemctl start mcp-server
```

### 客户端配置

**自动配置脚本**:

```bash
#!/bin/bash
# configure-remote-mcp.sh

MCP_SERVER="192.168.1.50:3000"
USER_ID=$(whoami)

# 生成配置
cat > ~/.config/claude-desktop/mcp-remote.json <<EOF
{
  "mcpServers": {
    "chrome-devtools-remote": {
      "url": "http://${MCP_SERVER}/sse",
      "headers": {
        "X-User-Id": "${USER_ID}"
      }
    }
  }
}
EOF

echo "✅ 配置已生成: ~/.config/claude-desktop/mcp-remote.json"
```

---

## 测试和验证

### 1. 测试连接

```bash
# 健康检查
curl http://192.168.1.50:3000/health

# SSE 连接测试
curl -N http://192.168.1.50:3000/sse
```

### 2. 验证多用户

```bash
# 开发者 A
curl -H "X-User-Id: dev-a" http://192.168.1.50:3000/register?browserURL=http://192.168.1.100:9222

# 开发者 B
curl -H "X-User-Id: dev-b" http://192.168.1.50:3000/register?browserURL=http://192.168.1.101:9222

# 验证隔离
# 开发者 A 的操作不应影响开发者 B 的 Chrome
```

---

## 总结

### 可行性

✅ **完全可行** - MCP 已内置 SSE 服务器支持

### 推荐方案

| 场景 | 推荐方案 | 复杂度 |
|------|----------|--------|
| 团队共享 Chrome | SSE 服务器 + 共享 Chrome | 低 |
| 各自 Chrome | SSE 服务器 + 多租户代理 | 中 |
| 安全要求高 | SSH 隧道 + 认证 | 高 |
| 生产环境 | Nginx/Caddy + HTTPS | 中 |

### 快速开始

1. **最简单方式（共享 Chrome）**:
   ```bash
   # 服务器
   node build/src/server-sse.js --browser-url http://localhost:9222
   
   # 客户端
   配置 IDE 连接到 http://服务器IP:3000/sse
   ```

2. **各自 Chrome（需要实现多租户代理）**:
   - 参考上面的 `mcp-multi-tenant-proxy.js`
   - 或使用 SSH 端口转发

### 下一步

- 查看 `src/server-sse.ts` 了解 SSE 服务器实现
- 实现多租户代理（如需要）
- 配置反向代理和 HTTPS
- 添加认证和授权

---

**核心要点**: MCP 已经支持远程服务（SSE 模式），只需正确配置网络和路由即可实现局域网共享！
