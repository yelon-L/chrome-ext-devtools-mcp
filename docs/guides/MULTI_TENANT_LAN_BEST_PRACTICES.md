> ⚠️ **文档已废弃** - 本文档已合并到 [Multi-Tenant 完整文档](../MULTI_TENANT_COMPLETE.md)
> 请使用新的统一文档以获取最新信息。

# Multi-Tenant 局域网部署最佳实践

## 场景分析

**场景：** 局域网服务器（192.168.1.100）运行 Multi-Tenant Server，局域网内其他用户需要连接使用。

**目标：** 简化用户接入流程，降低技术门槛。

---

## 当前流程的问题

### ❌ 当前流程（复杂）

```
用户 → 启动自己的Chrome → 手动API注册 → 编辑JSON配置 → 使用
```

**痛点：**
1. 用户需要懂如何启动 Chrome 的 remote debugging
2. 需要使用 curl 命令注册（技术门槛高）
3. 需要手动编辑 JSON 配置文件
4. 对于普通用户来说太复杂

---

## ✅ 最佳实践方案

### 方案对比

| 方案 | 浏览器位置 | 用户复杂度 | 适用场景 |
|------|-----------|----------|---------|
| **方案 A（推荐）** | 服务器统一管理 | ⭐ 简单 | 局域网、内部团队 |
| **方案 B（当前）** | 用户自己管理 | ⭐⭐⭐ 复杂 | 外网、高安全要求 |

---

## 🎯 方案 A：服务器管理浏览器（推荐）

### 架构

```
局域网服务器 (192.168.1.100:32122)
  │
  ├─ Multi-Tenant Server
  ├─ Web 管理界面 (/admin)
  │
  └─ Docker 容器池
      ├─ Chrome Container (User: alice)
      ├─ Chrome Container (User: bob)
      └─ Chrome Container (User: carol)
```

### 用户流程（3步）

```
步骤1: 访问管理界面
  http://192.168.1.100:32122/admin

步骤2: 注册并下载配置
  输入用户名 → 点击"开始使用" → 下载配置文件

步骤3: 导入配置到 Claude Desktop
  复制配置内容 → 粘贴到 config.json
```

**用户体验：** ⭐⭐⭐⭐⭐ 非常简单！

---

## 实现方案 A

### 1. 添加 Web 管理界面

在 Multi-Tenant Server 中添加 `/admin` 路由：

```typescript
// src/multi-tenant/routes/admin.ts

export function setupAdminRoutes(server: MultiTenantMCPServer) {
  // 管理界面首页
  server.app.get('/admin', (req, res) => {
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Multi-Tenant MCP - 用户管理</title>
        <style>
          body { font-family: sans-serif; max-width: 600px; margin: 50px auto; }
          input, button { padding: 10px; margin: 10px 0; font-size: 16px; }
          button { background: #4CAF50; color: white; border: none; cursor: pointer; }
        </style>
      </head>
      <body>
        <h1>🏢 Chrome Extension Debug MCP</h1>
        <h2>用户注册</h2>
        
        <form id="registerForm">
          <input type="text" id="userId" placeholder="输入用户名（如：alice）" required>
          <button type="submit">开始使用</button>
        </form>
        
        <div id="result" style="display:none; margin-top: 20px;">
          <h3>✅ 注册成功！</h3>
          <p><strong>SSE 端点：</strong> <code id="sseEndpoint"></code></p>
          <button onclick="downloadConfig()">📥 下载配置文件</button>
          <button onclick="copyConfig()">📋 复制配置</button>
        </div>
        
        <script>
          let userId = '';
          let config = null;
          
          document.getElementById('registerForm').onsubmit = async (e) => {
            e.preventDefault();
            userId = document.getElementById('userId').value;
            
            // 注册用户（服务器会自动创建Chrome容器）
            const response = await fetch('/api/register', {
              method: 'POST',
              headers: {'Content-Type': 'application/json'},
              body: JSON.stringify({ userId })
            });
            
            const data = await response.json();
            
            if (data.success) {
              document.getElementById('sseEndpoint').textContent = data.sseEndpoint;
              document.getElementById('result').style.display = 'block';
              
              // 生成配置
              config = {
                mcpServers: {
                  [\`chrome-extension-debug-\${userId}\`]: {
                    transport: {
                      type: 'sse',
                      url: data.sseEndpoint
                    }
                  }
                }
              };
            }
          };
          
          function downloadConfig() {
            const blob = new Blob([JSON.stringify(config, null, 2)], 
              {type: 'application/json'});
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = \`mcp-config-\${userId}.json\`;
            a.click();
          }
          
          function copyConfig() {
            navigator.clipboard.writeText(JSON.stringify(config, null, 2));
            alert('配置已复制到剪贴板！');
          }
        </script>
      </body>
      </html>
    `);
  });
}
```

### 2. 服务器自动管理 Chrome 容器

修改注册逻辑，自动为用户启动 Chrome 容器：

```typescript
// src/multi-tenant/core/BrowserConnectionPool.ts

export class BrowserConnectionPool {
  async createUserBrowser(userId: string): Promise<Browser> {
    const port = 9222 + this.getUserIndex(userId);
    
    // 启动 Docker 容器运行 Chrome
    await this.startChromeContainer(userId, port);
    
    // 连接到容器中的 Chrome
    const browser = await puppeteer.connect({
      browserURL: `http://localhost:${port}`,
    });
    
    return browser;
  }
  
  private async startChromeContainer(userId: string, port: number): Promise<void> {
    const { exec } = require('child_process');
    
    const containerName = `chrome-${userId}`;
    
    // 使用 Docker 启动 Chrome 容器
    const command = `
      docker run -d \
        --name ${containerName} \
        --rm \
        -p ${port}:9222 \
        --shm-size=2gb \
        zenika/alpine-chrome:latest \
        --remote-debugging-address=0.0.0.0 \
        --remote-debugging-port=9222 \
        --no-first-run \
        --user-data-dir=/data/${userId}
    `;
    
    return new Promise((resolve, reject) => {
      exec(command, (error: any) => {
        if (error) reject(error);
        else setTimeout(resolve, 2000); // 等待容器启动
      });
    });
  }
}
```

### 3. 修改注册 API

```typescript
// src/multi-tenant/server-multi-tenant.ts

async handleRegister(req, res) {
  const { userId } = req.body;
  
  // 自动创建 Chrome 容器
  const browser = await this.browserPool.createUserBrowser(userId);
  
  // 创建会话
  const session = await this.sessionManager.createSession(
    userId,
    browser,
    // ... 其他参数
  );
  
  res.json({
    success: true,
    userId,
    sseEndpoint: `http://${req.headers.host}/sse?userId=${userId}`,
    message: '已为您创建专属浏览器环境'
  });
}
```

### 4. 提供配置下载端点

```typescript
// GET /api/config/:userId
router.get('/api/config/:userId', (req, res) => {
  const { userId } = req.params;
  const serverHost = req.headers.host;
  
  const config = {
    mcpServers: {
      [`chrome-extension-debug-${userId}`]: {
        transport: {
          type: 'sse',
          url: `http://${serverHost}/sse?userId=${userId}`
        }
      }
    }
  };
  
  res.json(config);
});
```

---

## 🎯 方案 B：用户自管理浏览器（当前实现）

### 适用场景

- 外网环境（用户不在同一局域网）
- 高安全要求（浏览器必须在用户本地）
- 用户需要使用特定的浏览器配置或扩展

### 简化流程

#### 提供一键注册脚本

```bash
#!/bin/bash
# scripts/register-user.sh

SERVER="http://192.168.1.100:32122"
USER_ID="$1"

# 1. 启动 Chrome
echo "启动 Chrome..."
google-chrome \
  --remote-debugging-port=9222 \
  --user-data-dir=/tmp/chrome-$USER_ID &

sleep 2

# 2. 注册到服务器
echo "注册用户..."
RESPONSE=$(curl -s -X POST $SERVER/api/register \
  -H "Content-Type: application/json" \
  -d "{\"userId\":\"$USER_ID\",\"browserURL\":\"http://localhost:9222\"}")

echo "$RESPONSE"

# 3. 生成配置
SSE_ENDPOINT=$(echo "$RESPONSE" | jq -r '.sseEndpoint')

cat > ~/mcp-config-$USER_ID.json <<EOF
{
  "mcpServers": {
    "chrome-extension-debug-$USER_ID": {
      "transport": {
        "type": "sse",
        "url": "$SSE_ENDPOINT"
      }
    }
  }
}
EOF

echo "✅ 配置文件已保存到: ~/mcp-config-$USER_ID.json"
echo "请将内容复制到 Claude Desktop 配置文件中"
```

**使用：**
```bash
bash register-user.sh alice
```

---

## 📊 方案对比总结

### 方案 A：服务器管理（推荐局域网）

**优点：**
- ⭐⭐⭐⭐⭐ 用户体验极简（3步完成）
- ✅ 服务器统一管理，便于维护
- ✅ 用户无需懂技术细节
- ✅ 适合内部团队、培训场景

**缺点：**
- ⚠️ 服务器资源消耗较大（每用户一个Chrome容器）
- ⚠️ 需要 Docker 环境
- ⚠️ 不适合外网环境

**实现成本：**
- 需要开发 Web 管理界面
- 需要集成 Docker 容器管理
- 估计 2-3 天开发时间

---

### 方案 B：用户自管理（当前实现）

**优点：**
- ✅ 服务器资源消耗小
- ✅ 适合外网环境
- ✅ 更高的安全性和隔离性
- ✅ 用户可以使用自己的浏览器配置

**缺点：**
- ⭐⭐ 用户需要一定技术能力
- ⚠️ 接入流程较复杂
- ⚠️ 需要用户自己管理 Chrome

**改进方案：**
- 提供一键注册脚本
- 提供图形化配置生成工具
- 提供详细的分步指南

---

## 🚀 快速实施建议

### 局域网环境（推荐方案 A）

```bash
# 1. 服务器部署
docker-compose up -d

# 2. 用户访问
http://192.168.1.100:32122/admin

# 3. 自助注册
输入用户名 → 下载配置 → 完成
```

### 外网环境（方案 B + 脚本）

```bash
# 1. 服务器部署
node build/src/multi-tenant/server-multi-tenant.js

# 2. 提供注册脚本
curl -O http://server.com/scripts/register-user.sh
bash register-user.sh alice

# 3. 导入配置
按提示操作
```

---

## 📋 Docker Compose 示例（方案 A）

```yaml
# docker-compose.yml
version: '3.8'

services:
  mcp-server:
    build: .
    ports:
      - "32122:32122"
    environment:
      - PORT=32122
      - AUTH_ENABLED=false
      - MAX_SESSIONS=50
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock  # 用于启动 Chrome 容器
    networks:
      - mcp-network

networks:
  mcp-network:
    driver: bridge
```

---

## 🎯 最终推荐

### 局域网场景（如题主）

**推荐：方案 A（服务器管理浏览器）**

**理由：**
1. 用户在局域网内，安全性已有保障
2. 简化用户接入流程最重要
3. 服务器可以统一管理和监控
4. 用户体验最好

**实施步骤：**
1. 开发 Web 管理界面（/admin）
2. 集成 Docker 容器管理
3. 提供配置自动下载
4. 用户自助注册，3步完成

---

### 外网/高安全场景

**推荐：方案 B（用户自管理）+ 脚本辅助**

**理由：**
1. 浏览器在用户本地，安全性更高
2. 服务器资源消耗小
3. 适合分布式团队

**实施步骤：**
1. 提供一键注册脚本
2. 提供配置生成工具
3. 编写详细的使用文档
4. 提供技术支持

---

## 参考资料

- [Multi-Tenant Architecture Analysis](./MULTI_TENANT_ARCHITECTURE_ANALYSIS.md)
- [Multi-Tenant Quick Start](./MULTI_TENANT_QUICK_START.md)
- [Docker Chrome Container](https://github.com/Zenika/alpine-chrome)

---

**更新日期：** 2025-10-13  
**适用版本：** v0.8.2+
