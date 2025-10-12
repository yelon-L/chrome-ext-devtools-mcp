# Caddy 局域网 SSE 配置指南

## 目标

在局域网内部署 Chrome Extension Debug MCP，允许多个开发者通过 SSE 连接到同一个 MCP 服务器。

---

## 当前配置

### Caddyfile.dev

```caddy
# Chrome Extension Debug MCP - 局域网 SSE 访问配置
# 适用于局域网内多个开发者共享 MCP 服务

# 方式 1: 监听所有接口（推荐用于局域网）
:3000 {
    # 允许跨域访问（局域网内其他开发者）
    header {
        Access-Control-Allow-Origin "*"
        Access-Control-Allow-Methods "GET, POST, OPTIONS"
        Access-Control-Allow-Headers "Content-Type, Authorization"
    }
    
    # 反向代理到 MCP SSE 服务
    reverse_proxy localhost:32122 {
        # SSE 关键配置：禁用缓冲
        flush_interval -1
        
        # 超时设置（SSE 长连接）
        transport http {
            read_timeout 24h
            write_timeout 24h
        }
    }
    
    # 日志
    log {
        output file /var/log/caddy/mcp-sse.log
        format console
    }
}
```

**关键配置说明**：

1. **`:3000`** - 监听所有网络接口的 3000 端口
2. **`flush_interval -1`** - SSE 必需，禁用缓冲
3. **CORS headers** - 允许局域网内其他机器访问
4. **24h 超时** - SSE 是长连接，需要长超时

---

## 部署步骤

### 步骤 1: 配置 Caddy 导入

编辑主 Caddyfile：

```bash
sudo nano /etc/caddy/Caddyfile
```

添加导入：

```caddy
{
    log {
        output file /var/log/caddy/access.log
    }
}

# 导入 MCP 配置
import /home/p/workspace/chrome-ext-devtools-mcp/Caddyfile.dev
```

### 步骤 2: 创建日志目录

```bash
sudo mkdir -p /var/log/caddy
sudo chown caddy:caddy /var/log/caddy
```

### 步骤 3: 验证配置

```bash
sudo caddy validate --config /etc/caddy/Caddyfile
```

### 步骤 4: 重新加载 Caddy

```bash
# 平滑重载（不中断现有连接）
sudo systemctl reload caddy

# 或完全重启
sudo systemctl restart caddy
```

### 步骤 5: 检查状态

```bash
# 查看 Caddy 状态
sudo systemctl status caddy

# 查看日志
sudo journalctl -u caddy -f

# 查看 MCP SSE 日志
tail -f /var/log/caddy/mcp-sse.log
```

---

## 启动 MCP SSE 服务

### 方式 A: 使用脚本（推荐）

```bash
cd /home/p/workspace/chrome-ext-devtools-mcp
./scripts/start-remote-mcp.sh
```

### 方式 B: 手动启动

```bash
cd /home/p/workspace/chrome-ext-devtools-mcp

# 启动 Chrome（如果需要）
google-chrome --remote-debugging-port=9222 &

# 启动 MCP SSE 服务（端口 32122）
PORT=32122 node build/src/server-sse.js --browser-url http://localhost:9222
```

**注意**：MCP SSE 服务监听 `32122` 端口，Caddy 在 `3000` 端口代理。

---

## 验证部署

### 1. 本地测试

```bash
# 健康检查
curl http://localhost:3000/health

# SSE 连接测试
curl -N http://localhost:3000/sse
```

### 2. 局域网测试

在局域网内的另一台机器上：

```bash
# 获取服务器 IP（假设是 192.168.1.50）
# 健康检查
curl http://192.168.1.50:3000/health

# 应该返回
# {"status":"ok","sessions":0,"browser":"connected"}
```

### 3. 测试页面

在浏览器中访问：
```
http://192.168.1.50:3000/test
```

---

## 客户端配置

### 获取服务器 IP

```bash
# 在服务器上运行
hostname -I | awk '{print $1}'
# 或
ip route get 1.1.1.1 | awk '{print $7; exit}'
```

### 自动生成配置

```bash
# 在客户端机器上运行
./scripts/client-config-generator.sh 192.168.1.50:3000
```

### 手动配置

**Cline 配置**：
```json
{
  "mcpServers": {
    "chrome-extension-debug": {
      "url": "http://192.168.1.50:3000/sse"
    }
  }
}
```

**Claude Desktop 配置**：
```json
{
  "mcpServers": {
    "chrome-extension-debug": {
      "url": "http://192.168.1.50:3000/sse"
    }
  }
}
```

**VS Code 配置**：
```json
{
  "mcp.servers": {
    "chrome-extension-debug": {
      "url": "http://192.168.1.50:3000/sse"
    }
  }
}
```

---

## 网络配置

### 防火墙配置

如果启用了防火墙，需要开放 3000 端口：

```bash
# UFW
sudo ufw allow 3000/tcp

# firewalld
sudo firewall-cmd --add-port=3000/tcp --permanent
sudo firewall-cmd --reload

# iptables
sudo iptables -A INPUT -p tcp --dport 3000 -j ACCEPT
sudo iptables-save
```

### 限制访问（可选）

如果只想允许特定网段访问，修改 `Caddyfile.dev`：

```caddy
# 方式 2: 指定 IP（更安全，只允许特定网段）
:3000 {
    @lan {
        remote_ip 192.168.1.0/24
    }
    
    handle @lan {
        header {
            Access-Control-Allow-Origin "*"
            Access-Control-Allow-Methods "GET, POST, OPTIONS"
            Access-Control-Allow-Headers "Content-Type, Authorization"
        }
        
        reverse_proxy localhost:32122 {
            flush_interval -1
            transport http {
                read_timeout 24h
                write_timeout 24h
            }
        }
    }
    
    respond "Forbidden - Only accessible from LAN" 403
}
```

---

## 架构图

```
┌─────────────────────────────────────────────┐
│  开发者 A (192.168.1.100)                   │
│  ├─ IDE (Cline)                             │
│  └─ 连接 → http://192.168.1.50:3000/sse    │
└─────────────────────────────────────────────┘

┌─────────────────────────────────────────────┐
│  开发者 B (192.168.1.101)                   │
│  ├─ IDE (Claude Desktop)                    │
│  └─ 连接 → http://192.168.1.50:3000/sse    │
└─────────────────────────────────────────────┘

                    ↓
                    
┌─────────────────────────────────────────────┐
│  MCP Server (192.168.1.50)                  │
│                                              │
│  ┌──────────────────────────────────────┐  │
│  │  Caddy :3000                         │  │
│  │  ├─ CORS 配置                        │  │
│  │  ├─ SSE 缓冲禁用                     │  │
│  │  └─ 反向代理 ↓                       │  │
│  └──────────────────────────────────────┘  │
│                    ↓                         │
│  ┌──────────────────────────────────────┐  │
│  │  MCP SSE Service :32122              │  │
│  │  ├─ 会话管理                         │  │
│  │  └─ 连接 Chrome                      │  │
│  └──────────────────────────────────────┘  │
│                    ↓                         │
│  ┌──────────────────────────────────────┐  │
│  │  Chrome :9222                        │  │
│  │  └─ Extensions                       │  │
│  └──────────────────────────────────────┘  │
└─────────────────────────────────────────────┘
```

---

## 故障排查

### 问题 1: 无法连接

**检查清单**：
```bash
# 1. Caddy 是否运行
sudo systemctl status caddy

# 2. 端口是否监听
sudo netstat -tlnp | grep 3000
sudo netstat -tlnp | grep 32122

# 3. MCP SSE 服务是否运行
ps aux | grep server-sse

# 4. 防火墙是否开放
sudo ufw status

# 5. 测试本地连接
curl http://localhost:3000/health
```

### 问题 2: SSE 连接断开

**可能原因**：
- 缓冲未禁用 → 检查 `flush_interval -1`
- 超时太短 → 检查 `read_timeout` 和 `write_timeout`
- 网络不稳定 → 检查网络连接

**查看日志**：
```bash
# Caddy 日志
sudo journalctl -u caddy -f

# MCP SSE 日志
tail -f /var/log/caddy/mcp-sse.log

# 系统日志
dmesg | tail
```

### 问题 3: CORS 错误

确保 Caddyfile.dev 中包含：
```caddy
header {
    Access-Control-Allow-Origin "*"
    Access-Control-Allow-Methods "GET, POST, OPTIONS"
    Access-Control-Allow-Headers "Content-Type, Authorization"
}
```

---

## 生产环境建议

### 1. 使用 systemd 管理 MCP 服务

```bash
sudo tee /etc/systemd/system/chrome-extension-debug-mcp.service <<EOF
[Unit]
Description=Chrome Extension Debug MCP SSE Server
After=network.target

[Service]
Type=simple
User=$USER
WorkingDirectory=/home/p/workspace/chrome-ext-devtools-mcp
Environment="PORT=32122"
ExecStart=/usr/bin/node build/src/server-sse.js --browser-url http://localhost:9222
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable chrome-extension-debug-mcp
sudo systemctl start chrome-extension-debug-mcp
```

### 2. 添加认证

在 Caddyfile.dev 中添加 HTTP Basic Auth：

```caddy
:3000 {
    basicauth {
        developer1 $2a$14$...  # 使用 caddy hash-password 生成
        developer2 $2a$14$...
    }
    
    # ... 其他配置
}
```

### 3. 监控和告警

```bash
# 添加健康检查脚本
cat > /home/p/workspace/chrome-ext-devtools-mcp/health-check.sh <<'EOF'
#!/bin/bash
HEALTH=$(curl -s http://localhost:3000/health)
if [ $? -ne 0 ]; then
  echo "MCP Service is DOWN!"
  # 发送告警通知
fi
EOF

# 添加到 crontab
crontab -e
# */5 * * * * /home/p/workspace/chrome-ext-devtools-mcp/health-check.sh
```

---

## 总结

### 配置完成后的端口使用

| 端口 | 服务 | 说明 |
|------|------|------|
| 9222 | Chrome Debug | 本地 Chrome 调试端口 |
| 32122 | MCP SSE | MCP 内部服务端口 |
| 3000 | Caddy Proxy | 对外暴露的 SSE 端口 |

### 关键文件

- `/etc/caddy/Caddyfile` - 主 Caddy 配置
- `Caddyfile.dev` - MCP SSE 代理配置
- `scripts/start-remote-mcp.sh` - MCP 启动脚本
- `scripts/client-config-generator.sh` - 客户端配置生成器

### 快速命令

```bash
# 重启 Caddy
sudo systemctl reload caddy

# 启动 MCP
./scripts/start-remote-mcp.sh

# 查看状态
curl http://localhost:3000/health

# 生成客户端配置
./scripts/client-config-generator.sh 192.168.1.50:3000
```

---

**配置完成！局域网内的所有开发者现在可以连接到 MCP 服务了！** 🎉
