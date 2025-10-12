# MCP 服务器管理指南

## 🎯 服务特性

### ✅ 连接已有 Chrome 浏览器
当使用 `--browserUrl` 参数连接到已有的 Chrome 实例时：
- ✅ **服务关闭时不会关闭 Chrome 浏览器**
- ✅ Chrome 保持运行，数据和标签页保持不变
- ✅ 可以安全地重启 MCP 服务

### 🔒 自动启动 Chrome 浏览器
当不使用 `--browserUrl` 参数时：
- 🔒 MCP 会启动新的 Chrome 实例
- 🔒 服务关闭时**会**关闭 Chrome 浏览器

---

## 🚀 快速启动

### 方式一：使用启动脚本（推荐）

```bash
# 启动服务（连接到 localhost:9222）
./start-mcp-streamable.sh

# 停止服务（不关闭 Chrome）
./stop-mcp.sh
```

### 方式二：手动启动

```bash
# 后台启动
nohup node build/src/index.js \
  --transport streamable \
  --browserUrl http://localhost:9222 \
  --port 32123 \
  > /tmp/mcp-streamable.log 2>&1 &

# 记录进程 ID
echo $! > /tmp/mcp-server.pid
```

---

## 📋 服务管理

### 启动服务

```bash
./start-mcp-streamable.sh
```

**输出示例**:
```
✅ Chrome 连接正常
🚀 启动 MCP 服务...
   端口: 32123
   浏览器: http://localhost:9222
✅ 服务已启动
   进程 ID: 12345

📡 端点:
   - Health: http://localhost:32123/health
   - MCP:    http://localhost:32123/mcp
   - Test:   http://localhost:32123/test
```

### 停止服务

```bash
./stop-mcp.sh
```

**输出示例**:
```
🛑 停止 MCP 服务 (PID: 12345)...
✅ 服务已停止
✅ Chrome 浏览器保持运行（未关闭）
```

### 查看状态

```bash
# 检查服务是否运行
ps -p $(cat /tmp/mcp-server.pid) 2>/dev/null && echo "运行中" || echo "未运行"

# 健康检查
curl http://localhost:32123/health

# 查看实时日志
tail -f /tmp/mcp-streamable.log
```

---

## 🔧 配置选项

### 环境变量

```bash
# 自定义端口
export MCP_PORT=8080
./start-mcp-streamable.sh

# 自定义 Chrome URL
export BROWSER_URL=http://192.168.1.100:9222
./start-mcp-streamable.sh
```

### 命令行参数

```bash
node build/src/index.js \
  --transport streamable \        # 传输方式：streamable | sse | stdio
  --browserUrl http://localhost:9222 \  # Chrome 调试端口
  --port 32123                    # MCP 服务端口
```

---

## 📊 端点说明

### Health Check（健康检查）
```bash
curl http://localhost:32123/health
```
返回服务状态和版本信息

### MCP Endpoint（MCP 协议端点）
```
http://localhost:32123/mcp
```
用于 MCP 客户端连接

### Test Page（测试页面）
```
http://localhost:32123/test
```
打开浏览器访问，测试服务是否正常

---

## 🛡️ 安全保护机制

### 浏览器关闭保护

代码实现：`src/browser.ts`

```typescript
let isExternalBrowser = false; // 标记是否为外部浏览器

export async function ensureBrowserConnected(options) {
  // 连接到外部浏览器
  browser = await puppeteer.connect({ browserURL: options.browserURL });
  isExternalBrowser = true; // 标记为外部浏览器
  return browser;
}

export function shouldCloseBrowser(): boolean {
  return !isExternalBrowser; // 外部浏览器返回 false
}
```

### 优雅关闭处理

代码实现：`src/server-http.ts`

```typescript
process.on('SIGINT', async () => {
  console.log('\n[HTTP] 🛑 正在关闭...');
  
  // 关闭所有 MCP 会话
  for (const [id, session] of sessions) {
    await session.transport.close();
  }
  
  // 仅关闭自己启动的浏览器
  if (browser && shouldCloseBrowser()) {
    console.log('[HTTP] 🔒 关闭浏览器...');
    await browser.close();
  } else if (browser) {
    console.log('[HTTP] ✅ 保持外部浏览器运行');
  }
  
  httpServer.close(() => process.exit(0));
});
```

---

## 🧪 测试验证

### 1. 启动 Chrome
```bash
chrome --remote-debugging-port=9222
```

### 2. 启动 MCP 服务
```bash
./start-mcp-streamable.sh
```

### 3. 验证连接
```bash
# 健康检查
curl http://localhost:32123/health

# 查看 Chrome 标签页（应该能看到）
curl http://localhost:9222/json
```

### 4. 停止 MCP 服务
```bash
./stop-mcp.sh
```

### 5. 验证 Chrome 仍在运行
```bash
# Chrome 应该仍然可以访问
curl http://localhost:9222/json

# 或打开浏览器，标签页应该都还在
```

---

## 📝 日志管理

### 日志位置
```
/tmp/mcp-streamable.log
```

### 查看日志
```bash
# 实时查看
tail -f /tmp/mcp-streamable.log

# 查看最后 50 行
tail -50 /tmp/mcp-streamable.log

# 搜索错误
grep -i error /tmp/mcp-streamable.log
```

### 日志轮转
```bash
# 手动清理旧日志
> /tmp/mcp-streamable.log

# 或归档
mv /tmp/mcp-streamable.log /tmp/mcp-streamable-$(date +%Y%m%d).log
```

---

## ⚠️ 常见问题

### Q1: 端口被占用
```
❌ 端口 32123 已被占用
```

**解决方案**:
```bash
# 查找占用进程
lsof -i :32123

# 停止旧服务
./stop-mcp.sh

# 或使用其他端口
export MCP_PORT=32124
./start-mcp-streamable.sh
```

### Q2: Chrome 连接失败
```
❌ 无法连接到 Chrome: http://localhost:9222
```

**解决方案**:
```bash
# 确保 Chrome 已启动调试端口
chrome --remote-debugging-port=9222

# 检查端口是否开放
curl http://localhost:9222/json
```

### Q3: 服务启动失败
```
❌ 服务启动失败！
```

**解决方案**:
```bash
# 查看详细日志
tail -50 /tmp/mcp-streamable.log

# 检查是否已编译
npm run build

# 检查依赖
npm install
```

---

## 🎯 最佳实践

### 1. 开发环境
```bash
# 使用独立的 Chrome 配置
chrome --remote-debugging-port=9222 --user-data-dir=/tmp/chrome-dev

# 启动 MCP
./start-mcp-streamable.sh

# 开发结束后
./stop-mcp.sh  # MCP 停止
# Chrome 继续运行，保留调试状态
```

### 2. 生产环境
```bash
# 使用进程管理器（如 PM2）
pm2 start build/src/index.js --name mcp-server -- \
  --transport streamable \
  --browserUrl http://localhost:9222 \
  --port 32123

# 查看状态
pm2 status

# 停止服务（Chrome 不关闭）
pm2 stop mcp-server
```

### 3. 远程调试
```bash
# Chrome 在远程机器上
export BROWSER_URL=http://192.168.1.100:9222
./start-mcp-streamable.sh

# 停止服务（远程 Chrome 不关闭）
./stop-mcp.sh
```

---

## ✅ 功能验证清单

- [x] 服务启动连接到外部 Chrome
- [x] 服务正常运行和响应
- [x] 健康检查端点可访问
- [x] MCP 协议端点可用
- [x] 停止服务时 Chrome 保持运行
- [x] 日志正常记录
- [x] 进程管理正常

---

## 📚 相关文档

- `start-mcp-streamable.sh` - 启动脚本
- `stop-mcp.sh` - 停止脚本
- `src/browser.ts` - 浏览器管理逻辑
- `src/server-http.ts` - HTTP 服务器实现
- `STREAMABLE_HTTP_SETUP.md` - Streamable HTTP 配置指南

---

**更新时间**: 2025-10-12  
**版本**: v0.8.1
