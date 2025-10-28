# 配置选项兼容性 - 快速参考

## ✅ 回答你的问题

**是的，配置选项在不同模式下确实会有问题！**

### 关键发现

1. **stdio/SSE/Streamable 模式** - 共享相同的配置系统 ✅
   - 几乎所有 CLI 参数都通用
   - 唯一区别：`--port` 只在 HTTP 模式有效

2. **Multi-tenant 模式** - 完全不同的配置系统 ⚠️
   - **不使用 CLI 参数**
   - 使用**环境变量**配置服务器
   - 浏览器连接通过 **API 注册**，不是命令行

---

## 🎯 快速对比

### stdio/SSE/Streamable 模式（共享配置）

```bash
# ✅ 这些参数在 3 个模式中都有效
--browserUrl http://localhost:9222
--headless
--isolated
--channel canary
--executablePath /path/to/chrome
--viewport 1920x1080
--proxyServer "http://proxy:8080"
--acceptInsecureCerts
--chromeArg "--disable-gpu"
--logFile /tmp/mcp.log

# ⚠️ 这个只在 SSE 和 Streamable 有效
--port 3000
```

### Multi-tenant 模式（独立配置）

```bash
# ❌ 上面所有的 CLI 参数都无效！

# ✅ 使用环境变量
PORT=32122
AUTH_ENABLED=true
ALLOWED_ORIGINS='https://app.example.com'
MAX_SESSIONS=100

# ✅ 浏览器通过 API 注册
curl -X POST http://localhost:32122/api/register \
  -d '{"userId":"alice","browserURL":"http://localhost:9222"}'
```

---

## ⚠️ 常见错误

### 错误 1: 在 Multi-tenant 中使用 --browserUrl

```bash
# ❌ 错误
node ./build/src/multi-tenant/server-multi-tenant.js --browserUrl http://localhost:9222

# 原因：Multi-tenant 不解析 CLI 参数
# 解决：通过 API 注册浏览器
```

### 错误 2: 在 stdio 中使用 --port

```bash
# ❌ 错误
npx chrome-extension-debug-mcp@latest --port 3000

# 原因：stdio 不是 HTTP 服务器
# 解决：只在 SSE/Streamable 使用 --port
```

### 错误 3: 混合使用冲突选项

```bash
# ❌ 错误
npx chrome-extension-debug-mcp@latest \
  --browserUrl http://localhost:9222 \
  --channel canary

# 原因：--browserUrl 和 --channel 冲突
# 解决：选择其一
```

---

## 📊 兼容性矩阵

| 配置项                  | stdio | SSE | Streamable | Multi-tenant |
| ----------------------- | ----- | --- | ---------- | ------------ |
| **浏览器控制**          |
| `--browserUrl`          | ✅    | ✅  | ✅         | ❌ API注册   |
| `--headless`            | ✅    | ✅  | ✅         | ❌           |
| `--isolated`            | ✅    | ✅  | ✅         | ❌           |
| `--channel`             | ✅    | ✅  | ✅         | ❌           |
| `--executablePath`      | ✅    | ✅  | ✅         | ❌           |
| `--viewport`            | ✅    | ✅  | ✅         | ❌           |
| **网络配置**            |
| `--port`                | ❌    | ✅  | ✅         | ✅ ENV       |
| `--proxyServer`         | ✅    | ✅  | ✅         | ❌           |
| `--acceptInsecureCerts` | ✅    | ✅  | ✅         | ❌           |
| **其他**                |
| `--logFile`             | ✅    | ⚠️  | ⚠️         | ❌           |
| `--chromeArg`           | ✅    | ✅  | ✅         | ❌           |
| **环境变量**            | ⚠️    | ⚠️  | ⚠️         | ✅ 主要      |

**图例:**

- ✅ 完全支持
- ⚠️ 支持但不推荐
- ❌ 不支持
- ENV 通过环境变量

---

## 🎓 最佳实践

### 1. 选择合适的模式

```
本地开发 → stdio
Web集成 → SSE
生产环境 → Streamable
多租户SaaS → Multi-tenant
```

### 2. 不要混用配置方式

```bash
# ❌ 错误：在 Multi-tenant 中使用 CLI 参数
PORT=32122 node multi-tenant.js --browserUrl http://localhost:9222

# ✅ 正确：一致使用环境变量 + API
PORT=32122 node multi-tenant.js
curl -X POST .../api/register -d '{"userId":"alice","browserURL":"..."}'
```

### 3. 理解选项冲突

```bash
# ❌ 这些组合会失败
--browserUrl + --channel
--browserUrl + --executablePath
--channel + --executablePath

# ✅ 选择其一
--browserUrl http://localhost:9222  # 连接现有浏览器
# 或
--channel canary  # 启动新浏览器
```

---

## 📚 完整文档

详细的兼容性信息、示例和故障排除，请查看：

- **[CONFIG_COMPATIBILITY.md](./CONFIG_COMPATIBILITY.md)** - 完整兼容性指南
- **[README.md](./README.md)** - 主文档
- **[BINARY_TEST_REPORT.md](./BINARY_TEST_REPORT.md)** - 测试验证

---

## ✅ 总结

**你的观察完全正确！**

- ✅ stdio/SSE/Streamable 使用相同的 CLI 配置
- ❌ Multi-tenant 使用完全不同的配置系统
- ⚠️ 某些选项只在特定模式有效
- ⚠️ 存在选项冲突需要注意

**建议：**

1. 根据使用场景选择合适的模式
2. 查看 `CONFIG_COMPATIBILITY.md` 了解详细兼容性
3. 使用 `--help` 查看当前模式支持的选项
