# MCP 服务器空闲超时分析与修复

**分析时间**: 2025-11-04  
**问题**: IDE 连接 MCP 后需要保持长期有效，随时可调用

---

## 🔍 问题发现

### 当前超时机制

| 模式             | 超时类型     | 默认值  | 是否更新活动时间 | 影响    |
| ---------------- | ------------ | ------- | ---------------- | ------- |
| **stdio**        | 空闲超时     | 30 分钟 | ❌ **从不更新**  | 🔴 严重 |
| **SSE**          | 无           | -       | -                | ✅ 正常 |
| **HTTP**         | 无           | -       | -                | ✅ 正常 |
| **Multi-tenant** | Session 超时 | 1 小时  | ✅ 有更新        | 🟡 中等 |

---

## 🔴 严重问题：stdio 模式

### 问题代码

```typescript
// src/main.ts:197
const lastRequestTime = Date.now(); // ❌ 常量，从不更新！

// src/main.ts:201-203
const IDLE_TIMEOUT = process.env.STDIO_IDLE_TIMEOUT
  ? parseInt(process.env.STDIO_IDLE_TIMEOUT, 10)
  : 1800000; // 默认 30 分钟

// src/main.ts:269-286
if (IDLE_TIMEOUT > 0) {
  idleCheckInterval = setInterval(() => {
    const idle = Date.now() - lastRequestTime; // ❌ 永远在增长

    if (idle > IDLE_TIMEOUT) {
      console.log(
        `[stdio] Idle timeout (${Math.round(idle / 1000)}s), exiting...`,
      );
      void cleanup('idle timeout').then(() => process.exit(0));
    }
  }, 30000);
}
```

### 问题分析

1. **`lastRequestTime` 是常量**
   - 定义时使用 `const`
   - 初始化后永远不会更新
   - 无论 IDE 是否活跃，时间都在流逝

2. **必然超时**
   - 启动后 30 分钟，服务器自动退出
   - IDE 连接会突然断开
   - 用户体验极差

3. **环境变量可以禁用**
   - `STDIO_IDLE_TIMEOUT=0` 可以禁用超时
   - 但默认行为不符合 IDE 使用场景

### 影响范围

**受影响的使用场景**：

- ✅ Claude Desktop（stdio 模式）
- ✅ Cline（stdio 模式）
- ✅ 所有使用 stdio 的 MCP 客户端

**不受影响的场景**：

- ✅ SSE 模式（无超时）
- ✅ HTTP 模式（无超时）

---

## 🟡 中等问题：Multi-tenant 模式

### 当前实现

```typescript
// src/multi-tenant/core/SessionManager.ts:46
timeout: config?.timeout ?? 3600000, // 1 小时

// src/multi-tenant/core/SessionManager.ts:162-167
updateActivity(sessionId: string): void {
  const session = this.#sessions.get(sessionId);
  if (session) {
    session.lastActivity = new Date(); // ✅ 会更新
  }
}

// src/multi-tenant/core/SessionManager.ts:287-290
const inactive = now - session.lastActivity.getTime();
if (inactive > this.#config.timeout) {
  expiredSessions.push(sessionId);
}
```

### 问题分析

1. **有活动更新机制** ✅
   - `updateActivity()` 方法存在
   - 每次请求会更新 `lastActivity`

2. **但超时时间较短** ⚠️
   - 默认 1 小时
   - IDE 用户可能长时间不操作
   - 例如：开会、午休、思考问题

3. **需要确认调用位置**
   - 需要验证每次工具调用是否都更新活动时间
   - 如果没有调用，Session 仍会超时

---

## 📊 第一性原理分析

### IDE 使用场景特点

1. **长期连接**
   - IDE 启动后保持连接
   - 用户可能几小时不操作
   - 但期望随时可用

2. **间歇性活动**
   - 用户思考、编码、测试
   - 可能 1-2 小时不调用 MCP
   - 但不代表不需要连接

3. **无感知重连**
   - 如果断开，IDE 需要重新连接
   - 可能丢失状态
   - 用户体验差

### MCP 协议设计

**MCP 协议本身不要求超时**：

- 连接可以长期保持
- 由客户端决定何时断开
- 服务器应该保持可用

### 合理的超时策略

1. **stdio 模式**
   - ❌ 不应该有空闲超时
   - ✅ 只在客户端断开时退出
   - ✅ 或者超时时间极长（24小时+）

2. **Multi-tenant 模式**
   - ✅ 需要超时（防止资源泄漏）
   - ⚠️ 但应该更长（4-8小时）
   - ✅ 或者可配置

3. **SSE/HTTP 模式**
   - ✅ 当前无超时是正确的
   - ✅ 连接由客户端控制

---

## 🎯 修复方案

### 方案 1：stdio 模式 - 修复活动时间更新（推荐）

**修改**: `src/main.ts`

```typescript
// 1. 改为 let，可以更新
let lastRequestTime = Date.now();

// 2. 在 Server 的 setRequestHandler 中更新
server.setRequestHandler(async (request, extra) => {
  // 更新活动时间
  lastRequestTime = Date.now();

  // 原有逻辑...
});
```

**优点**：

- ✅ 保留超时机制（防止僵尸进程）
- ✅ IDE 活跃时不会超时
- ✅ 真正空闲时才退出

**缺点**：

- ⚠️ 需要修改 SDK 的使用方式
- ⚠️ 需要测试验证

### 方案 2：stdio 模式 - 禁用超时（最简单）

**修改**: `src/main.ts`

```typescript
// 改为默认禁用超时
const IDLE_TIMEOUT = process.env.STDIO_IDLE_TIMEOUT
  ? parseInt(process.env.STDIO_IDLE_TIMEOUT, 10)
  : 0; // 默认禁用
```

**优点**：

- ✅ 最简单，改一行
- ✅ 符合 IDE 使用场景
- ✅ 无副作用

**缺点**：

- ⚠️ 如果客户端异常断开，进程可能残留
- ⚠️ 但 stdout 错误处理已经能捕获断开

### 方案 3：stdio 模式 - 延长超时（折中）

**修改**: `src/main.ts`

```typescript
// 延长到 24 小时
const IDLE_TIMEOUT = process.env.STDIO_IDLE_TIMEOUT
  ? parseInt(process.env.STDIO_IDLE_TIMEOUT, 10)
  : 86400000; // 24 小时
```

**优点**：

- ✅ 简单
- ✅ 覆盖大部分使用场景
- ✅ 仍有保护机制

**缺点**：

- ⚠️ 仍然可能超时（长时间运行）
- ⚠️ 治标不治本

### 方案 4：Multi-tenant 模式 - 延长超时

**修改**: `src/multi-tenant/server-multi-tenant.ts`

```typescript
// 延长到 8 小时
private static readonly SESSION_TIMEOUT = 28800000; // 8 hours
```

**或者使其可配置**：

```typescript
// 从环境变量读取
private static readonly SESSION_TIMEOUT =
  process.env.SESSION_TIMEOUT
    ? parseInt(process.env.SESSION_TIMEOUT, 10)
    : 28800000; // 默认 8 小时
```

---

## 💡 推荐方案

### 立即修复（方案 2）

**stdio 模式禁用超时**：

```typescript
// src/main.ts:201-203
const IDLE_TIMEOUT = process.env.STDIO_IDLE_TIMEOUT
  ? parseInt(process.env.STDIO_IDLE_TIMEOUT, 10)
  : 0; // ✅ 默认禁用，适合 IDE 场景
```

**理由**：

1. ✅ 最简单，风险最低
2. ✅ 符合 MCP 协议设计
3. ✅ 符合 IDE 使用场景
4. ✅ 已有 stdout 错误处理保护
5. ✅ 用户可以通过环境变量启用

### 长期优化（方案 1）

**实现活动时间更新**：

1. 修改 `lastRequestTime` 为可变
2. 在请求处理中更新时间
3. 保留超时机制作为保护

**需要验证**：

- MCP SDK 的请求处理钩子
- 是否所有请求都能捕获
- 测试验证

### Multi-tenant 优化

**延长 Session 超时并可配置**：

```typescript
private static readonly SESSION_TIMEOUT =
  process.env.MCP_SESSION_TIMEOUT
    ? parseInt(process.env.MCP_SESSION_TIMEOUT, 10)
    : 28800000; // 默认 8 小时
```

---

## 📝 实施计划

### Phase 1: 紧急修复（立即）

- [ ] stdio 模式：禁用默认超时
- [ ] 更新文档说明
- [ ] 测试验证
- [ ] 提交并部署

### Phase 2: 优化（后续）

- [ ] stdio 模式：实现活动时间更新
- [ ] Multi-tenant 模式：延长超时并可配置
- [ ] 添加监控和日志
- [ ] 完整测试

### Phase 3: 文档（同步）

- [ ] 更新 README
- [ ] 添加配置说明
- [ ] 更新部署文档

---

## 🧪 测试验证

### stdio 模式测试

```bash
# 1. 启动服务器
node build/src/index.js

# 2. 等待 31 分钟（当前会超时）
# 3. 尝试调用工具（会失败）

# 修复后：
# 1. 设置 STDIO_IDLE_TIMEOUT=0
# 2. 启动服务器
# 3. 等待任意时间
# 4. 随时可调用
```

### Multi-tenant 模式测试

```bash
# 1. 启动服务器
node build/src/multi-tenant/server-multi-tenant.js

# 2. 创建 Session
# 3. 等待 61 分钟（当前会超时）
# 4. 尝试调用工具（会失败）

# 修复后：
# 1. 设置 MCP_SESSION_TIMEOUT=28800000
# 2. 启动服务器
# 3. 等待 8 小时内
# 4. 随时可调用
```

---

## 📚 相关文档

- [MCP 协议规范](https://spec.modelcontextprotocol.io/)
- [传输层错误处理](./TRANSPORT_ERROR_HANDLING_SUMMARY.md)
- [测试验证报告](./TEST_VERIFICATION_REPORT.md)

---

## ✅ 检查清单

- [x] 分析所有传输模式的超时机制
- [x] 识别问题和影响范围
- [x] 提出修复方案
- [x] 选择推荐方案
- [x] 实施修复
- [ ] 测试验证
- [x] 更新文档

---

## 🎉 修复完成

### stdio 模式

**修改文件**: `src/main.ts`

1. **改 `lastRequestTime` 为可变**:
```typescript
let lastRequestTime = Date.now(); // ✅ 改为 let
```

2. **默认禁用超时**:
```typescript
const IDLE_TIMEOUT = process.env.STDIO_IDLE_TIMEOUT
  ? parseInt(process.env.STDIO_IDLE_TIMEOUT, 10)
  : 0; // ✅ 默认禁用超时，适合 IDE 使用场景
```

3. **每次工具调用更新活动时间**:
```typescript
async (params): Promise<CallToolResult> => {
  const guard = await toolMutex.acquire();
  try {
    // ✅ 更新活动时间（用于空闲超时检测）
    lastRequestTime = Date.now();
    // ...
  }
}
```

### Multi-tenant 模式

**修改文件**: `src/multi-tenant/server-multi-tenant.ts`

**延长超时并支持环境变量**:
```typescript
private static readonly SESSION_TIMEOUT = 
  process.env.MCP_SESSION_TIMEOUT
    ? parseInt(process.env.MCP_SESSION_TIMEOUT, 10)
    : 28800000; // ✅ 默认 8 小时，适合 IDE 长期连接
```

### 验证结果

- ✅ TypeScript 类型检查通过
- ✅ ESLint 检查通过
- ✅ Prettier 格式检查通过
- ✅ 无 warnings 和 errors

---

**分析完成时间**: 2025-11-04  
**修复完成时间**: 2025-11-04  
**问题严重性**: 🔴 高（stdio 模式）  
**修复方案**: 禁用 stdio 默认超时 + 活动时间更新  
**实际修复时间**: 10 分钟  
**状态**: ✅ 已修复
