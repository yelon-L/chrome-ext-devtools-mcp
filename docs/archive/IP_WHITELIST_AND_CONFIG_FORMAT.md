# IP 白名单和配置格式修复

## 问题 1: Multi-Tenant 是否支持 IP 范围限制

### ✅ 现在支持！

**功能：** 通过环境变量 `ALLOWED_IPS` 设置 IP 白名单。

---

## IP 白名单使用指南

### 配置方式

```bash
# 单个 IP
ALLOWED_IPS="192.168.1.100" node build/src/index.js --mode multi-tenant

# 多个 IP（逗号分隔）
ALLOWED_IPS="192.168.1.100,192.168.1.101,10.0.0.5" \
node build/src/index.js --mode multi-tenant

# 不设置（允许所有 IP）
node build/src/index.js --mode multi-tenant
```

### 二进制文件

```bash
# 启用 IP 白名单
ALLOWED_IPS="192.168.1.100,192.168.1.101" \
./dist/chrome-extension-debug-linux-x64 --mode multi-tenant

# 组合认证和 IP 白名单
AUTH_ENABLED=true \
ALLOWED_IPS="192.168.1.100,192.168.1.101" \
PORT=32122 \
./dist/chrome-extension-debug-linux-x64 --mode multi-tenant
```

---

## 工作原理

### 1. IP 提取

支持多种网络环境：

```typescript
// 代理场景（Nginx, Cloudflare 等）
X-Forwarded-For: 203.0.113.1, 198.51.100.1
→ 使用最原始 IP: 203.0.113.1

// 简单代理
X-Real-IP: 203.0.113.1
→ 使用: 203.0.113.1

// 直接连接
req.socket.remoteAddress
→ 使用: 192.168.1.100
```

### 2. 访问控制

```
请求到达
    ↓
检查路径
    ├─ /health → 允许（健康检查）
    └─ 其他 → IP 检查
          ├─ 未设置白名单 → 允许
          ├─ IP 在白名单 → 允许
          └─ IP 不在白名单 → 拒绝 (403)
```

### 3. 拒绝响应

```json
{
  "error": "Access denied",
  "message": "Your IP address is not allowed to access this server"
}
```

---

## 使用场景

### 场景 1: 开发环境（无限制）

```bash
# 不设置 ALLOWED_IPS，允许所有 IP
AUTH_ENABLED=false node build/src/index.js --mode multi-tenant
```

**输出：**

```
🌍 未设置 IP 白名单，允许所有 IP 访问
```

---

### 场景 2: 局域网部署

```bash
# 只允许局域网内的特定 IP
ALLOWED_IPS="192.168.1.100,192.168.1.101,192.168.1.102" \
AUTH_ENABLED=true \
node build/src/index.js --mode multi-tenant
```

**输出：**

```
🔒 IP 白名单已启用: 192.168.1.100, 192.168.1.101, 192.168.1.102
```

---

### 场景 3: 公网 + Nginx 反向代理

**Nginx 配置：**

```nginx
server {
    listen 80;
    server_name mcp.example.com;

    location / {
        proxy_pass http://localhost:32122;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header Host $host;
    }
}
```

**启动服务：**

```bash
# 只允许特定公网 IP
ALLOWED_IPS="203.0.113.1,198.51.100.1" \
AUTH_ENABLED=true \
node build/src/index.js --mode multi-tenant
```

---

### 场景 4: 开发 + 生产混合

```bash
# 允许本地 + 办公室 IP
ALLOWED_IPS="127.0.0.1,::1,192.168.1.0/24,203.0.113.1" \
node build/src/index.js --mode multi-tenant
```

**注意：** 当前版本只支持完整 IP，不支持 CIDR 格式（如 `192.168.1.0/24`）。

---

## 测试 IP 白名单

### 测试 1: 允许的 IP

```bash
# 服务器配置
ALLOWED_IPS="192.168.1.100" node build/src/index.js --mode multi-tenant

# 从允许的 IP 访问
curl -s http://localhost:32122/health | jq .
# ✅ 返回健康状态
```

### 测试 2: 拒绝的 IP

```bash
# 从不在白名单的 IP 访问
curl -s http://localhost:32122/api/users
# ❌ 返回 403 Forbidden
{
  "error": "Access denied",
  "message": "Your IP address is not allowed to access this server"
}
```

### 测试 3: /health 端点例外

```bash
# /health 端点不受 IP 限制
curl -s http://localhost:32122/health
# ✅ 任何 IP 都可以访问
```

---

## 环境变量完整列表

| 变量               | 默认值  | 说明                  |
| ------------------ | ------- | --------------------- |
| `ALLOWED_IPS`      | 无      | IP 白名单（逗号分隔） |
| `AUTH_ENABLED`     | `true`  | 是否启用认证          |
| `PORT`             | `32122` | 服务器端口            |
| `ALLOWED_ORIGINS`  | `*`     | CORS 允许的源         |
| `TOKEN_EXPIRATION` | `86400` | Token 有效期（秒）    |
| `MAX_SESSIONS`     | `100`   | 最大会话数            |

---

## 安全最佳实践

### 生产环境配置

```bash
# 完整安全配置
ALLOWED_IPS="203.0.113.1,198.51.100.1" \
ALLOWED_ORIGINS="https://app.example.com" \
AUTH_ENABLED=true \
TOKEN_EXPIRATION=3600 \
MAX_SESSIONS=50 \
PORT=32122 \
node build/src/index.js --mode multi-tenant
```

### 安全建议

1. ✅ **启用 IP 白名单** - 只允许已知 IP
2. ✅ **启用认证** - AUTH_ENABLED=true
3. ✅ **限制 CORS** - 设置具体的 ALLOWED_ORIGINS
4. ✅ **使用 HTTPS** - 通过 Nginx 反向代理
5. ✅ **限制会话数** - 设置 MAX_SESSIONS
6. ✅ **监控日志** - 关注被拒绝的 IP

---

## 问题 2: MCP 配置格式修正

### ❌ 错误格式（之前）

```json
{
  "mcpServers": {
    "chrome-extension-debug-alice": {
      "transport": {
        "type": "sse",
        "url": "http://localhost:32122/sse?userId=alice",
        "headers": {
          "Authorization": "Bearer mcp_[Token]"
        }
      }
    }
  }
}
```

**问题：**

- ❌ 不必要的 `transport` 嵌套
- ❌ 不需要显式指定 `type: "sse"`
- ❌ 不符合 MCP 规范

---

### ✅ 正确格式（修正后）

#### 启用认证时

```json
{
  "mcpServers": {
    "chrome-extension-debug-alice": {
      "url": "http://localhost:32122/sse?userId=alice",
      "headers": {
        "Authorization": "Bearer mcp_3Z4Fh4jHpzWSGiVFLOXAZsIugew4jOj_"
      }
    }
  }
}
```

#### 禁用认证时

```json
{
  "mcpServers": {
    "chrome-extension-debug-alice": {
      "url": "http://localhost:32122/sse?userId=alice"
    }
  }
}
```

---

## MCP 配置格式规范

### SSE Transport 配置

根据 [MCP 规范](https://modelcontextprotocol.io/)和主流 IDE（Cline, Claude Desktop）的实现：

```json
{
  "mcpServers": {
    "<server-name>": {
      "url": "<sse-endpoint-url>",
      "headers": {
        "<header-name>": "<header-value>"
      }
    }
  }
}
```

### 关键点

1. ✅ **扁平结构** - 直接在 server 对象下配置 `url` 和 `headers`
2. ✅ **自动识别** - IDE 通过 URL 格式自动识别 SSE transport
3. ✅ **可选 headers** - 认证时添加，无认证时省略

### STDIO Transport 配置

```json
{
  "mcpServers": {
    "<server-name>": {
      "command": "node",
      "args": ["/path/to/server.js"],
      "env": {
        "API_KEY": "your_key"
      }
    }
  }
}
```

---

## IDE 配置文件位置

### Claude Desktop

- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Linux**: `~/.config/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

### Cline (VS Code)

通过 VS Code 设置：

1. 打开命令面板 (Cmd/Ctrl+Shift+P)
2. 搜索 "Cline: Edit MCP Settings"
3. 添加配置

### Cursor

- **macOS**: `~/Library/Application Support/Cursor/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json`
- **Linux**: `~/.config/Cursor/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json`

---

## 完整示例

### 多用户配置

```json
{
  "mcpServers": {
    "chrome-debug-alice": {
      "url": "http://localhost:32122/sse?userId=alice",
      "headers": {
        "Authorization": "Bearer mcp_AliceToken123"
      }
    },
    "chrome-debug-bob": {
      "url": "http://localhost:32122/sse?userId=bob",
      "headers": {
        "Authorization": "Bearer mcp_BobToken456"
      }
    },
    "chrome-debug-charlie": {
      "url": "http://localhost:32122/sse?userId=charlie",
      "headers": {
        "Authorization": "Bearer mcp_CharlieToken789"
      }
    }
  }
}
```

---

## 验证测试

### 测试 1: 配置格式验证

使用 [MCP Inspector](https://github.com/modelcontextprotocol/inspector) 测试：

```bash
npx @modelcontextprotocol/inspector@latest
```

输入 URL：`http://localhost:32122/sse?userId=alice`

如果配置正确：

- ✅ 连接成功
- ✅ 显示可用工具列表

### 测试 2: Claude Desktop 集成

1. 编辑配置文件
2. 重启 Claude Desktop
3. 检查 MCP 服务器状态
4. 测试工具调用

---

## 故障排查

### 问题 1: "Invalid configuration format"

**原因：** 使用了错误的嵌套格式

**解决：** 移除 `transport` 对象包裹，使用扁平结构

### 问题 2: "Connection refused"

**原因：** IP 被白名单拒绝

**解决：**

1. 检查客户端 IP
2. 添加到 `ALLOWED_IPS`
3. 或临时移除 IP 限制

### 问题 3: "Authorization header is required"

**原因：** 服务器启用认证但配置中未提供 token

**解决：** 添加 `headers` 配置：

```json
"headers": {
  "Authorization": "Bearer <your-token>"
}
```

---

## 总结

### IP 白名单功能

✅ **已实现**

- 环境变量配置：`ALLOWED_IPS`
- 支持多个 IP（逗号分隔）
- 支持代理场景（X-Forwarded-For, X-Real-IP）
- /health 端点例外

### MCP 配置格式

✅ **已修正**

- README 更新为正确的扁平格式
- 符合 MCP 规范和 IDE 实现
- 区分认证和非认证场景

---

**更新日期：** 2025-10-13  
**版本：** v0.8.2  
**状态：** ✅ 功能完整，文档已更新
