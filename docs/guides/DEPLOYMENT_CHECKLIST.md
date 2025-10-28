# Chrome Extension Debug MCP - 局域网部署检查清单

## 已完成 ✅

### 1. 名称更新

- [x] package.json → `chrome-extension-debug-mcp`
- [x] 所有脚本更新
- [x] IDE 配置生成器更新
- [x] 配置名称 → `chrome-extension-debug`

### 2. Caddy 配置

- [x] Caddyfile.dev 创建
- [x] 监听 :3000（所有接口）
- [x] 反向代理到 localhost:32122
- [x] CORS 配置
- [x] SSE 优化（flush_interval -1）
- [x] 超时配置（24h）

### 3. 文档

- [x] CADDY_LAN_SETUP.md - 完整部署指南
- [x] REMOTE_MCP_GUIDE.md - 远程服务指南
- [x] 本检查清单

---

## 部署步骤

### 步骤 1: 编译项目 ✅

```bash
cd /home/p/workspace/chrome-ext-devtools-mcp
npm install
npm run build
```

### 步骤 2: 配置 Caddy

```bash
# 验证 Caddyfile 导入
sudo caddy validate --config /etc/caddy/Caddyfile

# 重新加载配置
sudo systemctl reload caddy

# 检查状态
sudo systemctl status caddy
```

**预期输出**: Active (running)

### 步骤 3: 启动 Chrome

```bash
# 启动 Chrome（后台运行）
google-chrome --remote-debugging-port=9222 \
  --no-first-run \
  --no-default-browser-check &

# 验证 Chrome 运行
curl http://localhost:9222/json/version
```

**预期输出**: JSON with Chrome version info

### 步骤 4: 启动 MCP SSE 服务

```bash
cd /home/p/workspace/chrome-ext-devtools-mcp

# 方式 A: 使用脚本（推荐）
PORT=32122 ./scripts/start-remote-mcp.sh

# 方式 B: 手动启动
PORT=32122 node build/src/server-sse.js --browser-url http://localhost:9222
```

**预期输出**:

```
[SSE] 🚀 初始化浏览器...
[SSE] ✅ 浏览器已连接
[SSE] 📡 SSE 服务启动于端口 32122
```

### 步骤 5: 验证本地访问

```bash
# 健康检查
curl http://localhost:3000/health

# 预期输出
# {"status":"ok","sessions":0,"browser":"connected"}

# SSE 连接测试
curl -N http://localhost:3000/sse
```

### 步骤 6: 验证局域网访问

在另一台局域网机器上：

```bash
# 获取服务器 IP
SERVER_IP=$(hostname -I | awk '{print $1}')
echo "Server IP: $SERVER_IP"

# 健康检查
curl http://$SERVER_IP:3000/health

# 浏览器测试
# 访问 http://$SERVER_IP:3000/test
```

### 步骤 7: 客户端配置

在客户端机器上运行：

```bash
# 方式 A: 自动生成配置
./scripts/client-config-generator.sh 192.168.1.50:3000

# 方式 B: 手动配置
# 编辑 IDE 配置文件，添加：
{
  "mcpServers": {
    "chrome-extension-debug-remote": {
      "url": "http://192.168.1.50:3000/sse"
    }
  }
}
```

---

## 验证清单

### 网络检查

- [ ] Caddy 监听 3000 端口

  ```bash
  sudo netstat -tlnp | grep 3000
  ```

- [ ] MCP SSE 监听 32122 端口

  ```bash
  sudo netstat -tlnp | grep 32122
  ```

- [ ] Chrome 监听 9222 端口

  ```bash
  sudo netstat -tlnp | grep 9222
  ```

- [ ] 防火墙允许 3000 端口
  ```bash
  sudo ufw status | grep 3000
  ```

### 服务检查

- [ ] Caddy 运行正常

  ```bash
  sudo systemctl status caddy
  ```

- [ ] MCP SSE 服务运行

  ```bash
  ps aux | grep server-sse
  ```

- [ ] Chrome 运行
  ```bash
  ps aux | grep chrome
  ```

### 功能检查

- [ ] 本地健康检查通过

  ```bash
  curl http://localhost:3000/health
  ```

- [ ] 局域网健康检查通过

  ```bash
  curl http://服务器IP:3000/health
  ```

- [ ] SSE 连接正常

  ```bash
  curl -N http://localhost:3000/sse
  # 应该保持连接，不立即返回
  ```

- [ ] 测试页面可访问
  ```
  浏览器访问: http://服务器IP:3000/test
  ```

---

## 故障排查

### 问题 1: 无法连接到 3000 端口

**检查**:

```bash
# 1. Caddy 是否运行
sudo systemctl status caddy

# 2. 端口是否被占用
sudo lsof -i :3000

# 3. 查看 Caddy 日志
sudo journalctl -u caddy -n 50

# 4. 测试 Caddy 配置
sudo caddy validate --config /etc/caddy/Caddyfile
```

**解决**:

```bash
# 重启 Caddy
sudo systemctl restart caddy

# 或重新加载配置
sudo systemctl reload caddy
```

### 问题 2: MCP SSE 服务无法启动

**检查**:

```bash
# 1. 端口是否被占用
sudo lsof -i :32122

# 2. Chrome 是否运行
curl http://localhost:9222/json/version

# 3. 项目是否编译
ls -la build/src/server-sse.js
```

**解决**:

```bash
# 重新编译
npm run build

# 确保 Chrome 运行
google-chrome --remote-debugging-port=9222 &

# 重启 MCP 服务
PORT=32122 node build/src/server-sse.js --browser-url http://localhost:9222
```

### 问题 3: SSE 连接断开

**检查**:

```bash
# 查看 Caddy 日志
tail -f /var/log/caddy/mcp-sse.log

# 查看系统日志
dmesg | tail

# 网络连接
netstat -an | grep 3000
```

**解决**:

- 确认 Caddyfile.dev 中 `flush_interval -1` 配置
- 确认超时设置为 24h
- 检查网络稳定性

### 问题 4: CORS 错误

**检查 Caddyfile.dev**:

```caddy
header {
    Access-Control-Allow-Origin "*"
    Access-Control-Allow-Methods "GET, POST, OPTIONS"
    Access-Control-Allow-Headers "Content-Type, Authorization"
}
```

**重新加载**:

```bash
sudo systemctl reload caddy
```

---

## 生产环境建议

### 1. 使用 systemd 管理 MCP 服务

```bash
sudo tee /etc/systemd/system/chrome-extension-debug-mcp.service <<EOF
[Unit]
Description=Chrome Extension Debug MCP SSE Server
After=network.target caddy.service

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

# 启用并启动
sudo systemctl daemon-reload
sudo systemctl enable chrome-extension-debug-mcp
sudo systemctl start chrome-extension-debug-mcp

# 查看状态
sudo systemctl status chrome-extension-debug-mcp
```

### 2. 添加监控

```bash
# 健康检查脚本
cat > /home/p/workspace/chrome-ext-devtools-mcp/health-check.sh <<'EOF'
#!/bin/bash
HEALTH=$(curl -s http://localhost:3000/health)
if [ $? -ne 0 ]; then
  echo "MCP Service is DOWN!" | mail -s "Alert: MCP Down" admin@example.com
  systemctl restart chrome-extension-debug-mcp
fi
EOF

chmod +x health-check.sh

# 添加到 crontab
crontab -e
# */5 * * * * /home/p/workspace/chrome-ext-devtools-mcp/health-check.sh
```

### 3. 日志轮转

```bash
sudo tee /etc/logrotate.d/mcp-sse <<EOF
/var/log/caddy/mcp-sse.log {
    daily
    rotate 7
    compress
    missingok
    notifempty
    postrotate
        systemctl reload caddy
    endscript
}
EOF
```

---

## 快速命令参考

```bash
# 重启所有服务
sudo systemctl restart caddy
sudo systemctl restart chrome-extension-debug-mcp

# 查看日志
sudo journalctl -u caddy -f
sudo journalctl -u chrome-extension-debug-mcp -f
tail -f /var/log/caddy/mcp-sse.log

# 测试连接
curl http://localhost:3000/health
curl http://$(hostname -I | awk '{print $1}'):3000/health

# 生成客户端配置
./scripts/client-config-generator.sh $(hostname -I | awk '{print $1}'):3000

# 查看端口使用
sudo netstat -tlnp | grep -E '3000|32122|9222'
```

---

## 成功标志

✅ Caddy 运行并监听 3000  
✅ MCP SSE 运行并监听 32122  
✅ Chrome 运行并监听 9222  
✅ 本地 health 检查通过  
✅ 局域网 health 检查通过  
✅ 客户端可以连接并使用 MCP 工具

---

**部署完成后，局域网内所有开发者都可以通过 `http://服务器IP:3000/sse` 连接到 MCP 服务！** 🎉
