# 本地多租户 MCP 服务器 - 设置完成

**日期:** 2025-10-13  
**状态:** ✅ 就绪

---

## 🎯 已完成的设置

### 1. 服务器配置

```
地址:      http://localhost:32122
版本:      0.8.7 (包含持久化修复)
认证:      已启用
状态:      运行中
进程ID:    查看 ps aux | grep multi-tenant
日志:      /tmp/mcp-server.log
```

### 2. 用户注册

```json
{
  "userId": "local-dev",
  "browserURL": "http://localhost:9222",
  "metadata": {
    "name": "Local Development",
    "description": "本地开发环境"
  }
}
```

### 3. Token 信息

```
Token:     mcp_awn9TKPoePuz751m4QndJ918-bKaTNhX
用户:      local-dev
权限:      * (全部)
过期:      永不过期
名称:      local-chrome-debug
```

### 4. Chrome 状态

```
调试端口:   9222
版本:       Chrome/141.0.7390.54
状态:       ✅ 运行中
WebSocket:  ws://localhost:9222/devtools/browser/...
```

---

## 📋 Claude Desktop 配置

### 配置文件路径

**macOS:**
```bash
~/Library/Application Support/Claude/claude_desktop_config.json
```

**Linux:**
```bash
~/.config/Claude/claude_desktop_config.json
```

**Windows:**
```
%APPDATA%\Claude\claude_desktop_config.json
```

### 配置内容

```json
{
  "mcpServers": {
    "local-chrome-debug": {
      "url": "http://localhost:32122/sse?userId=local-dev",
      "headers": {
        "Authorization": "Bearer mcp_awn9TKPoePuz751m4QndJ918-bKaTNhX",
        "Accept": "text/event-stream"
      }
    }
  }
}
```

### 快速配置命令

```bash
# 查看配置（已保存）
cat /tmp/local-mcp-config.json

# 复制到 Claude Desktop 配置（macOS）
# 手动复制上面的内容到配置文件
```

---

## 🧪 测试验证

### 1. 服务器健康检查

```bash
curl -s http://localhost:32122/health | jq .
```

**预期结果:**
```json
{
  "status": "ok",
  "version": "0.8.7",
  "users": {
    "totalUsers": 1,
    "users": ["local-dev"]
  }
}
```

### 2. Chrome 连接测试

```bash
curl -s http://localhost:9222/json/version | jq .
```

**预期结果:**
```json
{
  "Browser": "Chrome/141.0.7390.54",
  "Protocol-Version": "1.3",
  ...
}
```

### 3. Token 验证

```bash
curl -s -X POST http://localhost:32122/api/auth/validate \
  -H "Authorization: Bearer mcp_awn9TKPoePuz751m4QndJ918-bKaTNhX" \
  -H "Content-Type: application/json" \
  -d '{"token":"mcp_awn9TKPoePuz751m4QndJ918-bKaTNhX"}' | jq .
```

### 4. SSE 连接测试

```bash
timeout 3 curl -N -s \
  -H "Authorization: Bearer mcp_awn9TKPoePuz751m4QndJ918-bKaTNhX" \
  -H "Accept: text/event-stream" \
  "http://localhost:32122/sse?userId=local-dev" | head -3
```

**预期看到:**
```
event: endpoint
data: /message?sessionId=xxx-xxx-xxx
```

---

## 🛠️ 可用的扩展工具

连接成功后，在 Claude 中可以使用以下工具：

### 基础工具
1. **list_extensions** - 列出所有扩展（包括禁用的）
2. **get_extension_details** - 获取扩展详细信息
3. **list_extension_contexts** - 列出扩展执行上下文
4. **reload_extension** - 重新加载扩展

### Service Worker 管理
5. **activate_extension_service_worker** - 激活 Service Worker
6. **switch_extension_context** - 切换到指定上下文

### 存储和配置
7. **inspect_extension_storage** - 检查扩展存储（local/sync/session）
8. **inspect_extension_manifest** - 深度分析 manifest.json
9. **watch_extension_storage** - 实时监控存储变化

### 调试和诊断
10. **get_extension_logs** - 获取控制台日志
11. **evaluate_in_extension** - 在扩展上下文中执行代码
12. **diagnose_extension_errors** - 全面健康检查和错误诊断

### 高级监控
13. **trace_extension_api_calls** - 追踪 chrome.* API 调用
14. **monitor_extension_messages** - 监控消息传递

---

## 💬 在 Claude 中使用示例

配置完成后，重启 Claude Desktop，然后可以这样使用：

### 示例 1: 列出扩展
```
你: 请列出我的所有 Chrome 扩展，包括禁用的
```

Claude 会调用 `list_extensions` 工具并返回结果。

### 示例 2: 获取扩展详情
```
你: 查看 Enhanced MCP Debug Test Extension 的详细信息
```

### 示例 3: 激活 Service Worker
```
你: 激活我的扩展的 Service Worker
```

### 示例 4: 检查扩展存储
```
你: 查看 Video SRT Ext MVP 的本地存储
```

---

## 🔧 管理命令

### 查看服务器状态
```bash
# 检查进程
ps aux | grep multi-tenant

# 查看日志（实时）
tail -f /tmp/mcp-server.log

# 健康检查
curl -s http://localhost:32122/health | jq .
```

### 重启服务器
```bash
# 停止
pkill -f 'chrome-extension-debug.*multi-tenant'

# 启动
cd /home/p/workspace/chrome-ext-devtools-mcp
PORT=32122 AUTH_ENABLED=true \
./dist/chrome-extension-debug-linux-x64 --mode multi-tenant > /tmp/mcp-server.log 2>&1 &
```

### 管理 Token
```bash
# 列出所有 Token
curl -s http://localhost:32122/api/auth/tokens/local-dev | jq .

# 生成新 Token
curl -s -X POST http://localhost:32122/api/auth/token \
  -H "Content-Type: application/json" \
  -d '{"userId":"local-dev","tokenName":"new-token"}' | jq .
```

### 查看用户
```bash
# 所有用户
curl -s http://localhost:32122/health | jq .users

# 特定用户
curl -s http://localhost:32122/api/users/local-dev | jq .
```

---

## ⚠️ 故障排查

### 问题 1: Claude 无法连接

**检查清单:**
1. ✅ 服务器运行中？`curl http://localhost:32122/health`
2. ✅ Chrome 运行中？`curl http://localhost:9222/json/version`
3. ✅ Token 有效？见上面的验证命令
4. ✅ 配置文件正确？检查 JSON 格式
5. ✅ Claude Desktop 已重启？完全退出后重新打开

### 问题 2: 无法检测到扩展

**可能原因:**
- 扩展被禁用（使用 `includeDisabled: true`）
- Service Worker 未激活（使用 `activate_extension_service_worker`）
- Chrome 未安装扩展

**解决:**
```
在 Claude 中说: "列出所有扩展，包括禁用的"
```

### 问题 3: Service Worker 无响应

**解决:**
```
在 Claude 中说: "激活所有扩展的 Service Worker"
```

### 问题 4: Token 过期

**重新生成:**
```bash
curl -s -X POST http://localhost:32122/api/auth/token \
  -H "Content-Type: application/json" \
  -d '{"userId":"local-dev","tokenName":"renewed"}' | jq .token
```

然后更新 Claude Desktop 配置中的 Token。

---

## 📊 系统信息

```
服务器版本:   0.8.7
Chrome版本:   141.0.7390.54
Node.js:      v20+
操作系统:     Linux x86_64
工作目录:     /home/p/workspace/chrome-ext-devtools-mcp
```

---

## 🎯 下一步

1. ✅ 服务器已运行
2. ✅ 用户已注册
3. ✅ Token 已生成
4. ✅ Chrome 已连接
5. ⏳ **配置 Claude Desktop** - 复制上面的配置
6. ⏳ **重启 Claude Desktop**
7. ⏳ **测试连接** - 说 "列出我的扩展"

---

**状态:** ✅ 所有组件就绪  
**配置:** /tmp/local-mcp-config.json  
**文档:** LOCAL_SETUP_COMPLETE.md

🎉 **设置完成！享受扩展调试吧！**
