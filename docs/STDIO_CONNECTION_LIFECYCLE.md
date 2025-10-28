# Stdio 连接生命周期说明

**文档版本**: v1.0  
**更新时间**: 2025-10-16

---

## 📋 问题描述

**用户反馈**:

> "IDE 连接 stdio，在一个会话完成后，会话结束再次请求 MCP 工具时会提示连接断开"

---

## 🔍 根本原因

### Stdio 模式的设计特点

Stdio（Standard Input/Output）模式是 MCP 的一种传输协议，其设计特点是：

1. **进程级生命周期** - MCP 服务作为子进程启动
2. **单一连接** - 一个进程服务一个客户端（IDE）
3. **持久连接** - 理论上应该保持连接直到进程终止

### 当前实现的行为

**文件**: `src/main.ts:169-218`

```typescript
const IDLE_TIMEOUT = 300000; // 5 分钟空闲超时
let lastRequestTime = Date.now();

// 每 30 秒检查一次空闲时间
const idleCheckInterval = setInterval(() => {
  const idle = Date.now() - lastRequestTime;
  if (idle > IDLE_TIMEOUT) {
    console.log(
      `[stdio] Idle timeout (${Math.round(idle / 1000)}s), exiting...`,
    );
    cleanup('idle timeout').then(() => process.exit(0));
  }
}, 30000);
```

**问题**:

- ❌ 实现了 5 分钟空闲超时
- ❌ 超时后自动终止进程
- ❌ 导致会话间隔较长时连接断开

---

## 🎯 设计意图 vs 实际行为

### 设计意图

**空闲超时的目的**:

1. 防止僵尸进程占用资源
2. IDE 崩溃后自动清理
3. 避免资源泄漏

### 实际行为

**正常使用场景被误杀**:

1. 用户执行一系列工具调用
2. 会话结束，停止操作
3. 5 分钟后思考下一步操作
4. 再次调用工具 → ❌ 连接已断开

---

## 🔧 解决方案

### 方案 1: 增加空闲超时时间（推荐）

**修改**: `src/main.ts`

```typescript
// 从 5 分钟改为 30 分钟
const IDLE_TIMEOUT = 1800000; // 30 minutes
```

**优点**:

- ✅ 简单直接
- ✅ 保持清理机制
- ✅ 给用户更多思考时间

**缺点**:

- ⚠️ 僵尸进程存活时间更长

### 方案 2: 禁用空闲超时（适合开发环境）

**修改**: `src/main.ts`

```typescript
// 通过环境变量控制
const IDLE_TIMEOUT = process.env.STDIO_IDLE_TIMEOUT
  ? parseInt(process.env.STDIO_IDLE_TIMEOUT)
  : 0; // 0 表示永不超时

if (IDLE_TIMEOUT > 0) {
  const idleCheckInterval = setInterval(() => {
    const idle = Date.now() - lastRequestTime;
    if (idle > IDLE_TIMEOUT) {
      console.log(
        `[stdio] Idle timeout (${Math.round(idle / 1000)}s), exiting...`,
      );
      cleanup('idle timeout').then(() => process.exit(0));
    }
  }, 30000);
  idleCheckInterval.unref();
}
```

**配置**:

```bash
# .env
# 禁用空闲超时
STDIO_IDLE_TIMEOUT=0

# 或设置更长的超时（毫秒）
STDIO_IDLE_TIMEOUT=1800000  # 30 分钟
```

**优点**:

- ✅ 灵活配置
- ✅ 开发环境可以禁用
- ✅ 生产环境保持清理机制

### 方案 3: 智能检测（最优方案）

**思路**: 区分正常空闲和异常空闲

```typescript
// 记录 IDE 连接状态
let ideConnected = true;

// 监听 stdin 关闭（IDE 断开）
process.stdin.on('end', () => {
  ideConnected = false;
  console.log('[stdio] IDE disconnected, initiating cleanup...');
  cleanup('IDE disconnected').then(() => process.exit(0));
});

// 空闲超时仅在 IDE 断开后生效
const idleCheckInterval = setInterval(() => {
  if (!ideConnected) {
    const idle = Date.now() - lastRequestTime;
    if (idle > 60000) {
      // 断开后 1 分钟清理
      cleanup('idle after disconnect').then(() => process.exit(0));
    }
  }
}, 30000);
```

**优点**:

- ✅ 正常使用永不超时
- ✅ IDE 崩溃后快速清理
- ✅ 最佳用户体验

---

## 📊 不同模式的连接管理

### Stdio 模式

**特点**:

- 进程级连接
- 单一客户端
- 长连接

**生命周期**:

```
IDE 启动
  ↓
启动 stdio 子进程
  ↓
建立连接（stdin/stdout）
  ↓
[持续通信]
  ↓
IDE 关闭 或 空闲超时
  ↓
进程退出
```

**连接断开原因**:

1. IDE 主动关闭
2. 空闲超时（当前 5 分钟）
3. 进程崩溃
4. 系统信号（SIGTERM）

### Streamable (HTTP/SSE) 模式

**特点**:

- HTTP 长连接
- 多客户端
- 会话管理

**生命周期**:

```
服务器启动
  ↓
[持续运行]
  ↓
客户端 A 连接 → 创建会话 A
客户端 B 连接 → 创建会话 B
  ↓
会话 A 超时 → 清理会话 A
会话 B 继续使用
  ↓
[服务器持续运行，不会因会话结束而退出]
```

**连接断开原因**:

1. 会话超时（1 小时）
2. 客户端主动断开
3. 服务器重启

### Multi-Tenant 模式

**特点**:

- 独立的 HTTP 服务器
- 多用户/多会话
- Token 认证

**生命周期**:

```
服务器启动（独立进程）
  ↓
[持续运行]
  ↓
用户 1/会话 1 连接
用户 2/会话 2 连接
用户 1/会话 3 连接
  ↓
会话超时 → 仅清理该会话
  ↓
[服务器永不退出，除非手动停止]
```

**连接断开原因**:

1. Token 过期
2. 会话超时
3. 服务器重启
4. 网络问题

---

## 🎯 推荐配置

### 开发环境

```bash
# .env.development
# 禁用 stdio 空闲超时
STDIO_IDLE_TIMEOUT=0
```

**原因**: 开发时经常需要长时间思考和调试

### 生产环境

```bash
# .env.production
# 30 分钟空闲超时
STDIO_IDLE_TIMEOUT=1800000
```

**原因**: 平衡用户体验和资源清理

### CI/CD 环境

```bash
# .env.ci
# 1 分钟空闲超时（快速清理）
STDIO_IDLE_TIMEOUT=60000
```

**原因**: 自动化测试后快速释放资源

---

## 🔍 诊断和调试

### 查看连接状态

```bash
# 查看 MCP 进程
ps aux | grep chrome-extension-debug

# 查看进程启动时间
ps -p <PID> -o pid,lstart,etime
```

### 启用详细日志

```bash
# 环境变量
DEBUG=mcp:* node build/src/main.js

# 查看日志
# [stdio] Idle timeout (320s), exiting...  ← 空闲超时
# [stdio] Received SIGTERM                 ← 进程被杀
# [stdio] IDE disconnected                 ← IDE 断开
```

### IDE 配置检查

某些 IDE 可能有自己的超时设置：

**VS Code / Windsurf**:

```json
// settings.json
{
  "mcp.timeout": 600000, // 10 分钟
  "mcp.keepAlive": true
}
```

---

## ✅ 最佳实践

### 1. 根据使用场景配置超时

```bash
# 交互式开发（长时间思考）
STDIO_IDLE_TIMEOUT=0

# 生产环境（定期清理）
STDIO_IDLE_TIMEOUT=1800000

# 自动化测试（快速清理）
STDIO_IDLE_TIMEOUT=60000
```

### 2. 实现健康检查

```typescript
// 定期输出心跳日志
setInterval(() => {
  const idle = Date.now() - lastRequestTime;
  console.log(`[stdio] Status: idle=${Math.round(idle / 1000)}s`);
}, 60000);
```

### 3. 优雅退出

```typescript
// 给用户警告
if (idle > IDLE_TIMEOUT * 0.8) {
  console.warn('[stdio] ⚠️  Approaching idle timeout, will exit in 1 minute');
}
```

### 4. 监听 IDE 断开

```typescript
process.stdin.on('end', () => {
  console.log('[stdio] IDE disconnected');
  cleanup('IDE disconnect');
});
```

---

## 🐛 已知问题

### Issue 1: 空闲超时误杀正常会话

**状态**: ✅ 已识别  
**影响**: 中等  
**解决方案**: 实施方案 2 或方案 3

### Issue 2: IDE 未正确关闭连接

**状态**: ⚠️ IDE 侧问题  
**表现**: 僵尸进程残留  
**临时方案**: 手动清理进程

```bash
# 查找僵尸进程
ps aux | grep chrome-extension-debug | grep defunct

# 强制杀死
kill -9 <PID>
```

### Issue 3: 多个 stdio 实例同时运行

**状态**: ⚠️ 用户配置问题  
**表现**: 端口冲突、资源竞争  
**解决**: 确保 IDE 只启动一个实例

---

## 📖 参考资料

- [MCP Specification - Transport](https://spec.modelcontextprotocol.io/specification/transport/)
- [stdio 模式最佳实践](https://github.com/modelcontextprotocol/servers)
- [Node.js Process API](https://nodejs.org/api/process.html)

---

## 🔧 待实施改进

### 短期（v0.8.12）

- [ ] 添加 `STDIO_IDLE_TIMEOUT` 环境变量
- [ ] 默认超时从 5 分钟改为 30 分钟
- [ ] 添加超时前警告日志

### 中期（v0.9.0）

- [ ] 实现智能空闲检测（方案 3）
- [ ] 监听 stdin 关闭事件
- [ ] 优雅退出前发送警告

### 长期（v1.0.0）

- [ ] 实现心跳机制
- [ ] IDE 主动 keep-alive
- [ ] 连接状态监控和报告

---

**文档完成**: 2025-10-16  
**状态**: 问题已识别，解决方案已提供
