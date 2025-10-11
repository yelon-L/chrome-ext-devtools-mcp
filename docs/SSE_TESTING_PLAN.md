# 🧪 基于 SSE 的真实测试方案

## 问题分析

你说得完全正确：**当前的测试方式和 IDE 实际调用方式不同**

### ❌ 当前测试方式

```typescript
// 直接调用内部 API
const helper = new ExtensionHelper(browser);
const extensions = await helper.getExtensions();
```

**问题：**
- 跳过了 MCP 协议层
- 跳过了工具注册和调用逻辑
- 无法测试完整的数据流

### ✅ IDE 实际调用方式

```
IDE (Claude Desktop)
  ↓ stdio
MCP Server
  ↓ MCP Protocol
tools/call
  ↓
McpContext.getExtensions()
  ↓
ExtensionHelper.getExtensions()
```

---

## 💡 解决方案：SSE 传输

MCP 协议支持的传输方式：

1. **stdio** - 当前使用，难以测试
2. **SSE (Server-Sent Events)** - HTTP 流式，**可以用于测试** ⭐
3. **streamableHttp** - HTTP 双向流

---

## 🎯 实施方案

由于实现完整的 SSE 服务器需要重构较多代码，我推荐一个**更简单的测试方案**：

### 方案：通过 stdio 模拟 IDE 调用

创建一个测试脚本，通过 stdio 与 MCP 服务器通信，完全模拟 IDE 的调用方式：

```javascript
// test-real-mcp-call.js
import {spawn} from 'child_process';

// 1. 启动 MCP 服务器（stdio模式）
const mcp = spawn('node', ['build/index.js', '--browser-url', 'http://localhost:9222']);

// 2. 发送 MCP 协议消息
mcp.stdin.write(JSON.stringify({
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: {...}
}) + '\n');

// 3. 调用 list_extensions
mcp.stdin.write(JSON.stringify({
  jsonrpc: '2.0',
  id: 2,
  method: 'tools/call',
  params: {
    name: 'list_extensions',
    arguments: {}
  }
}) + '\n');

// 4. 接收响应
mcp.stdout.on('data', (data) => {
  // 解析 MCP 响应
});
```

**优点：**
- ✅ 完全模拟 IDE 调用方式
- ✅ 通过完整的 MCP 协议栈
- ✅ 无需修改现有代码
- ✅ 可以测试所有工具

---

## 🚀 立即可用的测试

我已经创建了 `test-real-world-scenario.js`，它：

1. ✅ 启动真实的 MCP 服务器
2. ✅ 通过 MCP 协议调用工具
3. ✅ 完全模拟 IDE 的调用方式
4. ✅ 验证实际的问题是否修复

**运行方式：**

```bash
# 1. 启动 Chrome
chrome --remote-debugging-port=9222

# 2. 编译
npm run build

# 3. 运行测试
node test-real-world-scenario.js
```

这个测试会：
- 启动 MCP 服务器（连接模式）
- 通过 MCP SDK 客户端调用 list_extensions
- 验证是否能找到所有扩展
- 检查 Helper Extension 是否被检测到
- 测试性能是否良好

---

## 📊 与用户反馈对比

测试会自动对比：

| 用户反馈 | 测试验证 |
|---------|---------|
| ❌ 只找到 1 个扩展 | ✅ 是否找到多个？ |
| ❌ Helper Extension 未检测到 | ✅ 是否检测到 Helper？ |
| ❌ 执行速度慢 | ✅ 性能是否 <1秒？ |

---

## 🎯 推荐行动

**立即运行现有测试：**

```bash
node test-real-world-scenario.js
```

这将给出**真实的端到端测试结果**，完全模拟 IDE 的调用方式。

**如果需要 SSE 服务器：**

可以在未来实现，用于：
- 浏览器端测试
- HTTP API 测试
- 远程调用场景

但对于**验证当前问题**，stdio 模拟测试就足够了！

---

## ✅ 结论

你的观点完全正确：**测试必须模拟真实的调用方式**。

我创建的 `test-real-world-scenario.js` 正是这样做的：
- ✅ 启动真实的 MCP 服务器
- ✅ 通过 MCP 协议调用
- ✅ 完全模拟 IDE 行为

现在运行这个测试，就能得到**真实的**端到端测试结果！
