# 远程 MCP 支持状态说明

## 问题：Streamable HTTP 是否支持单用户独立开发环境的远程 MCP？

---

## 简短回答

**✅ 支持：每个开发者独立部署**（推荐）  
**❌ 不支持：集中式 MCP + 分布式 Chrome**（需要改进代码）

---

## 详细说明

### 当前架构限制

查看 `src/server-http.ts` 代码：

```typescript
// line 59-72: 启动时连接 Chrome（全局）
const browser = args.browserUrl
  ? await ensureBrowserConnected({ browserURL: args.browserUrl })
  : await ensureBrowserLaunched({ ... });

// line 172: 所有会话共享同一个 browser
const context = await McpContext.from(browser, logger);  // ← 共享！
```

**问题**：
- MCP 服务器在**启动时**连接一个 Chrome（全局变量）
- 所有客户端会话**共享**这个 browser 实例
- 开发者 A 和开发者 B 连接同一个 MCP → 操作同一个 Chrome

**结果**：
```
开发者 A                     MCP 服务器
├─ IDE              ─────→   ├─ browser (全局) ← 共享！
└─ 期望用自己的 Chrome        └─ 所有会话都用这个

开发者 B
├─ IDE              ─────→   (连接同一个 browser)
└─ 期望用自己的 Chrome
```

❌ **互相干扰**、标签混乱、调试冲突

---

## 支持的方案

### ✅ 方案 1：每个开发者独立部署（当前支持）

**架构**：
```
开发者 A 机器（完整环境）
├─ IDE
├─ Chrome :9222
└─ MCP Server :32123 (本地)

开发者 B 机器（完整环境）
├─ IDE
├─ Chrome :9222
└─ MCP Server :32123 (本地)
```

**部署步骤**：

#### 每个开发者机器上：

```bash
# 1. 启动 Chrome
google-chrome --remote-debugging-port=9222 &

# 2. 启动 MCP（自动检测本地 Chrome）
cd /home/p/workspace/chrome-ext-devtools-mcp
./scripts/start-http-mcp.sh

# 3. IDE 配置（连接本地 MCP）
{
  "mcpServers": {
    "chrome-extension-debug": {
      "url": "http://localhost:32123/mcp"
    }
  }
}
```

**优点**：
- ✅ 完全隔离
- ✅ 无需网络配置
- ✅ 安全（本地通信）
- ✅ 无需修改代码
- ✅ `start-http-mcp.sh` 自动检测本地 Chrome

**缺点**：
- ❌ 每人需要部署一次
- ❌ 无法集中管理

**是否满足"单用户独立开发环境"？**  
✅ **是的！** 每个开发者有独立的环境（Chrome + MCP）

---

### ❌ 方案 2：集中式 MCP + 分布式 Chrome（不支持）

**期望架构**：
```
开发者 A (192.168.1.100)       MCP 服务器 (192.168.1.50)
├─ IDE              ─────→     ├─ Session A
└─ Chrome :9222     ←────      │  └─ browser A → 100:9222

开发者 B (192.168.1.101)
├─ IDE              ─────→     ├─ Session B
└─ Chrome :9222     ←────      │  └─ browser B → 101:9222
```

**当前状态**：❌ **不支持**

**需要的改进**（见 `MULTI_CHROME_IMPLEMENTATION.md`）：
1. 修改会话存储结构（增加 browser 字段）
2. 从客户端获取 Chrome URL（HTTP 头或环境变量）
3. 每个会话创建独立 browser 连接
4. 会话结束时断开 browser

**工作量**：约 2 小时

**是否计划实现？**  
可以实现，技术上没有障碍。如果需要，可以按照 `MULTI_CHROME_IMPLEMENTATION.md` 的方案实现。

---

## 快速验证

### 测试当前实现

#### 终端 1：启动 MCP 服务器
```bash
cd /home/p/workspace/chrome-ext-devtools-mcp
./scripts/start-http-mcp.sh
```

观察输出：
```
[HTTP] 🚀 初始化浏览器...
[HTTP] ✅ 浏览器已连接
```
→ 证明启动时连接了 Chrome（全局）

#### 终端 2：查看会话共享
```bash
# 健康检查
curl http://localhost:3000/health

# 预期输出
{
  "status": "ok",
  "sessions": 1,
  "browser": "connected",  # ← 注意：单个 browser
  "transport": "streamable-http"
}
```

#### 测试多客户端
1. 客户端 A 连接 MCP
2. 客户端 B 连接 MCP
3. A 打开一个标签
4. B 查看标签列表 → 能看到 A 打开的标签

**结论**：所有客户端共享同一个 Chrome

---

## 推荐方案对比

| 需求 | 方案 1（独立部署）| 方案 2（集中式）|
|------|-------------------|----------------|
| **是否支持** | ✅ 支持 | ❌ 不支持 |
| **需要改代码** | ❌ 不需要 | ✅ 需要 |
| **部署复杂度** | ⭐ 简单 | ⭐⭐⭐ 中等 |
| **隔离性** | ✅ 完全隔离 | ✅ 完全隔离 |
| **网络配置** | ❌ 不需要 | ✅ 需要 |
| **集中管理** | ❌ 不支持 | ✅ 支持 |

---

## 结论

### 单用户独立开发环境的远程 MCP

**定义理解 1**：每个开发者有独立的开发环境  
✅ **支持** - 使用方案 1（独立部署）

**定义理解 2**：一个远程 MCP 服务器，每个开发者用各自的 Chrome  
❌ **不支持** - 需要实现方案 2

---

## 快速开始（方案 1）

每个开发者只需 3 步：

```bash
# 1. 启动 Chrome
google-chrome --remote-debugging-port=9222 &

# 2. 启动 MCP（自动检测本地 Chrome）
cd /home/p/workspace/chrome-ext-devtools-mcp
./scripts/start-http-mcp.sh

# 3. 配置 IDE
# 在 Cline/Claude Desktop 配置中添加：
{
  "mcpServers": {
    "chrome-extension-debug": {
      "url": "http://localhost:32123/mcp"
    }
  }
}
```

完成！每个开发者有独立的环境。

---

## 相关文档

- **REMOTE_ARCHITECTURE_GUIDE.md** - 远程架构详细分析
- **MULTI_CHROME_IMPLEMENTATION.md** - 集中式 MCP 实现方案
- **scripts/start-http-mcp.sh** - 启动脚本（自动检测本地 Chrome）
- **SSE_VS_HTTP_COMPARISON.md** - 传输协议对比
- **STREAMABLE_HTTP_DEPLOYMENT.md** - HTTP 部署指南

---

## 总结

| 问题 | 答案 |
|------|------|
| **是否支持单用户独立开发环境？** | ✅ 是（方案 1） |
| **是否支持集中式 MCP？** | ❌ 否（需要改进） |
| **推荐方案** | 独立部署（每人一套环境） |
| **是否可以改进？** | ✅ 可以（约 2 小时工作量） |

**最终建议**：使用方案 1（独立部署），简单、稳定、无需修改代码。
