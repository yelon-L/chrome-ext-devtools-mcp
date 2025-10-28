# Multi-Tenant 模式启动修复

## 修复的问题

### 问题 1: `--mode multi-tenant` 启动后默认应是 SSE 模式

**原问题：**

```bash
$ ./chrome-extension-debug-linux-x64 --mode multi-tenant

⚠️  WARNING: The --mode parameter is not supported.
...
Continuing with default stdio mode...  # ❌ 错误：继续以 stdio 模式运行
```

**修复后：**

```bash
$ ./chrome-extension-debug-linux-x64 --mode multi-tenant

[MCP] Chrome Extension Debug MCP v0.8.2
[MCP] Mode: multi-tenant (SSE transport)  # ✅ 正确：说明使用 SSE 传输
[MCP] Starting Multi-tenant server...

✓ Server running on http://localhost:32122
✓ Each user connects to their OWN browser instance
...
```

---

### 问题 2: 启动异常

**原因：**
之前的代码逻辑有问题，检测到 `--mode multi-tenant` 后只显示警告，然后继续执行 stdio 模式启动，导致：

1. 用户困惑（以为启动了 multi-tenant，实际是 stdio）
2. 无法真正启动 multi-tenant 服务器

**修复方案：**
重构了 `src/index.ts` 的启动逻辑，使用分支控制确保只执行一种启动模式。

---

## 修复详情

### 修改文件：`src/index.ts`

#### 修改前（问题代码）

```typescript
// 检测 --mode 参数（已废弃）
const modeIndex = process.argv.indexOf('--mode');
if (modeIndex !== -1) {
  const modeValue = process.argv[modeIndex + 1];
  console.error('\n⚠️  WARNING: The --mode parameter is not supported.');

  if (modeValue === 'multi-tenant') {
    console.error('For Multi-tenant mode, please use:');
    console.error('  node build/src/multi-tenant/server-multi-tenant.js');
    // ... 只显示帮助信息
  }
  console.error('Continuing with default stdio mode...\n');
}

// 继续执行 stdio/sse/streamable 启动逻辑
const transport = (args as any).transport || 'stdio';
// ... 启动对应模式
```

**问题：**

- ❌ 只显示警告，不实际启动 multi-tenant
- ❌ 显示警告后继续执行其他模式
- ❌ 可能导致双重启动或逻辑混乱

---

#### 修改后（修复代码）

```typescript
// 检测 --mode 参数
const modeIndex = process.argv.indexOf('--mode');
if (modeIndex !== -1) {
  const modeValue = process.argv[modeIndex + 1];

  if (modeValue === 'multi-tenant') {
    // ✅ 直接启动 multi-tenant 服务器
    console.log(`[MCP] Chrome Extension Debug MCP v${VERSION}`);
    console.log('[MCP] Mode: multi-tenant (SSE transport)');
    console.log('[MCP] Starting Multi-tenant server...');
    console.log('');
    await import('./multi-tenant/server-multi-tenant.js');
    // Multi-tenant 服务器已启动，不再执行后续启动逻辑
  } else {
    console.error('\n⚠️  WARNING: Unknown --mode value.');
    // ... 显示帮助信息
    await startStandardMode(); // ✅ 执行标准模式
  }
} else {
  // 没有 --mode 参数，执行标准启动逻辑
  await startStandardMode(); // ✅ 执行标准模式
}

// ✅ 提取标准模式启动逻辑为独立函数
async function startStandardMode() {
  const transport = (args as any).transport || 'stdio';
  // ... stdio/sse/streamable 启动逻辑
}
```

**优势：**

- ✅ `--mode multi-tenant` 直接启动 multi-tenant 服务器
- ✅ 启动后不再执行其他模式逻辑（分支控制）
- ✅ 代码结构清晰，易于维护
- ✅ 避免了双重启动的问题

---

## 核心改进

### 1. 分支控制

```
用户输入
   ↓
检测 --mode 参数？
   ├─ 是 → multi-tenant ？
   │       ├─ 是 → 启动 multi-tenant（结束）
   │       └─ 否 → 显示警告 → 启动标准模式
   │
   └─ 否 → 启动标准模式
```

### 2. 统一标准模式

将 stdio/sse/streamable 的启动逻辑提取为 `startStandardMode()` 函数：

- 代码复用
- 逻辑清晰
- 易于维护

### 3. Multi-tenant 说明

在启动信息中明确说明使用 SSE 传输：

```
[MCP] Mode: multi-tenant (SSE transport)
```

---

## 验证测试

### 测试 1: 使用 Node.js 启动

```bash
$ node build/src/index.js --mode multi-tenant

[MCP] Chrome Extension Debug MCP v0.8.2
[MCP] Mode: multi-tenant (SSE transport)
[MCP] Starting Multi-tenant server...

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🏢 MULTI-TENANT MODE - Enterprise SaaS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✓ Server running on http://localhost:32122
✓ 10-100 concurrent users supported
✓ Each user connects to their OWN browser instance
✓ Session isolation and resource management
✓ Authentication and authorization support
...
```

✅ **验证通过**

---

### 测试 2: 使用打包后的二进制文件

```bash
$ ./dist/chrome-extension-debug-linux-x64 --mode multi-tenant

[MCP] Chrome Extension Debug MCP v0.8.2
[MCP] Mode: multi-tenant (SSE transport)
[MCP] Starting Multi-tenant server...

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🏢 MULTI-TENANT MODE - Enterprise SaaS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✓ Server running on http://localhost:32122
...
```

✅ **验证通过**

---

### 测试 3: 确认不会双重启动

**验证逻辑：**

- 启动 multi-tenant 后，不再执行 stdio/sse/streamable 的启动代码
- 通过分支控制确保只执行一个分支

**结果：** ✅ 无双重启动问题

---

## 使用方式对比

### 之前（错误）

```bash
# ❌ 这样不会启动 multi-tenant，只会显示警告然后启动 stdio
./chrome-extension-debug-linux-x64 --mode multi-tenant

# ✅ 必须这样才能启动 multi-tenant
node build/src/multi-tenant/server-multi-tenant.js
```

### 现在（正确）

```bash
# ✅ 现在两种方式都可以
./chrome-extension-debug-linux-x64 --mode multi-tenant
node build/src/multi-tenant/server-multi-tenant.js

# ✅ 或者使用 npm
npm run start:multi-tenant
```

---

## 打包脚本更新

**文件：** `scripts/package-bun.sh`

**新增使用说明：**

```bash
Multi-tenant server:
  ./dist/chrome-extension-debug-linux-x64 --mode multi-tenant
```

---

## Multi-Tenant 技术细节

### 传输协议

Multi-tenant 服务器**硬编码使用 SSE 传输**，原因：

1. **SSE 特性：**
   - 服务器主动推送
   - 长连接保持
   - 浏览器原生支持

2. **Multi-tenant 需求：**
   - 每个用户独立的 SSE 连接
   - 服务器需要主动通知客户端
   - 实时性要求高

3. **代码验证：**

```typescript
// src/multi-tenant/server-multi-tenant.ts:21
import {SSEServerTransport} from '@modelcontextprotocol/sdk/server/sse.js';

// 第 572 行
const transport = new SSEServerTransport('/message', res);
```

---

## 架构对比

### stdio/sse/streamable 模式

```
入口: src/index.js
  ↓
检测 --transport 参数
  ↓
├─ stdio → src/main.js
├─ sse → src/server-sse.js
└─ streamable → src/server-http.js
```

**特点：** 所有客户端共享一个浏览器实例

---

### multi-tenant 模式

```
入口: src/index.js --mode multi-tenant
  ↓
导入 src/multi-tenant/server-multi-tenant.js
  ↓
启动 Multi-tenant Server (内部使用 SSE)
  ↓
每个用户独立的:
  ├─ SSE 连接
  ├─ MCP Server 实例
  └─ 浏览器实例
```

**特点：** 每个用户有独立的浏览器实例

---

## 模式对比表

| 特性         | stdio     | sse               | streamable               | **multi-tenant**          |
| ------------ | --------- | ----------------- | ------------------------ | ------------------------- |
| **启动方式** | `npx ...` | `--transport sse` | `--transport streamable` | **`--mode multi-tenant`** |
| **传输协议** | stdio     | SSE               | Streamable HTTP          | **SSE (硬编码)**          |
| **浏览器**   | 1 个      | 1 个共享          | 1 个共享                 | **每用户 1 个**           |
| **用户隔离** | N/A       | ❌                | ❌                       | **✅**                    |
| **适用场景** | 本地开发  | 远程调试          | 生产 API                 | **SaaS 平台**             |

---

## 总结

### 修复成果

1. ✅ **`--mode multi-tenant` 现在可以正常启动**
2. ✅ **明确说明使用 SSE 传输**
3. ✅ **避免了启动异常和双重启动**
4. ✅ **代码逻辑清晰，易于维护**

### 技术改进

1. ✅ **分支控制** - 确保只执行一个启动模式
2. ✅ **代码提取** - `startStandardMode()` 函数复用
3. ✅ **异步处理** - 正确使用 `async/await`

### 用户体验

1. ✅ **简化启动** - `--mode multi-tenant` 一行搞定
2. ✅ **清晰提示** - 显示传输协议和端口
3. ✅ **文档完善** - 更新打包脚本使用说明

---

**修复日期：** 2025-10-13  
**版本：** v0.8.2  
**状态：** ✅ 已修复并验证通过
