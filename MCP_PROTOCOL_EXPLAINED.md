# MCP 协议完整解释 - 从 HTTP 到扩展工具调用

**目的:** 让你完全理解测试脚本的每一步在做什么，这不是黑盒！

---

## 📋 整体流程图

```
┌─────────────────────────────────────────────────────────────────┐
│                     客户端 (你的脚本/Claude)                    │
└────────────┬────────────────────────────────────────────────────┘
             │
             │ ① GET /sse?userId=bob
             │    Header: Authorization: Bearer mcp_xxx
             │    Header: Accept: text/event-stream
             ↓
┌────────────────────────────────────────────────────────────────┐
│                  MCP 服务器 (192.168.239.1:32122)              │
├────────────────────────────────────────────────────────────────┤
│  1. 验证 Token                                                 │
│  2. 查找 userId=bob 的浏览器 URL                               │
│  3. 连接到 Bob 的浏览器 (localhost:9222)                       │
│  4. 创建 Session (分配 sessionId)                              │
│  5. 返回 Session ID (通过 SSE)                                 │
└────────────┬───────────────────────────────────────────────────┘
             │
             │ ② SSE: data: Use endpoint: /message?sessionId=abc-123
             ↓
┌────────────────────────────────────────────────────────────────┐
│                     客户端收到 Session ID                       │
└────────────┬───────────────────────────────────────────────────┘
             │
             │ ③ POST /message?sessionId=abc-123
             │    Body: {"jsonrpc":"2.0","id":1,"method":"initialize",...}
             ↓
┌────────────────────────────────────────────────────────────────┐
│                  MCP 服务器处理请求                             │
├────────────────────────────────────────────────────────────────┤
│  1. 根据 sessionId 找到对应的 MCP Server 实例                  │
│  2. 调用 initialize 方法                                       │
│  3. 返回服务器能力 (支持的工具列表)                            │
└────────────┬───────────────────────────────────────────────────┘
             │
             │ ④ SSE: data: {"jsonrpc":"2.0","id":1,"result":{...}}
             ↓
┌────────────────────────────────────────────────────────────────┐
│                     客户端收到初始化响应                        │
└────────────┬───────────────────────────────────────────────────┘
             │
             │ ⑤ POST /message?sessionId=abc-123
             │    Body: {"jsonrpc":"2.0","id":2,"method":"tools/call",
             │           "params":{"name":"list_extensions",...}}
             ↓
┌────────────────────────────────────────────────────────────────┐
│                  MCP 服务器调用扩展工具                         │
├────────────────────────────────────────────────────────────────┤
│  1. 找到 list_extensions 工具                                  │
│  2. 通过 CDP 连接到 Bob 的浏览器                               │
│  3. 尝试三种方法检测扩展：                                      │
│     a) chrome.management API                                   │
│     b) Target 扫描                                             │
│     c) 视觉检测 (导航到 chrome://extensions/)                  │
│  4. 返回扩展列表                                               │
└────────────┬───────────────────────────────────────────────────┘
             │
             │ ⑥ SSE: data: {"jsonrpc":"2.0","id":2,"result":{...}}
             ↓
┌────────────────────────────────────────────────────────────────┐
│                 客户端收到扩展列表并显示                        │
└────────────────────────────────────────────────────────────────┘
```

---

## 🔍 详细步骤解释

### 步骤 1: SSE 连接建立

**客户端操作:**
```javascript
const req = http.request({
  hostname: '192.168.239.1',
  port: 32122,
  path: '/sse?userId=bob',
  method: 'GET',
  headers: {
    'Authorization': 'Bearer mcp_HH2rQyRQYtOIEX7_4acBAxJCTTGnDUSz',
    'Accept': 'text/event-stream',
  },
});
```

**发送的 HTTP 请求（原始格式）:**
```http
GET /sse?userId=bob HTTP/1.1
Host: 192.168.239.1:32122
Authorization: Bearer mcp_HH2rQyRQYtOIEX7_4acBAxJCTTGnDUSz
Accept: text/event-stream
Connection: keep-alive
```

**服务器端发生了什么:**

1. **接收请求** (src/multi-tenant/server-sse.ts)
   ```typescript
   app.get('/sse', async (req, res) => {
     const userId = req.query.userId;
     const token = req.headers.authorization?.replace('Bearer ', '');
   ```

2. **验证 Token**
   ```typescript
   const authResult = authManager.validateToken(token);
   if (!authResult.success) {
     return res.status(401).json({error: 'Invalid token'});
   }
   ```

3. **查找用户路由**
   ```typescript
   const userRoute = routerManager.getUserRoute(userId);
   // 返回: {userId: 'bob', browserURL: 'http://localhost:9222'}
   ```

4. **连接浏览器**
   ```typescript
   const browser = await puppeteer.connect({
     browserURL: userRoute.browserURL,
   });
   ```

5. **创建 Session**
   ```typescript
   const sessionId = uuidv4();  // 生成唯一 ID
   sessionManager.createSession(sessionId, userId, transport, server, ...);
   ```

6. **返回 Session ID (通过 SSE)**
   ```http
   HTTP/1.1 200 OK
   Content-Type: text/event-stream
   Cache-Control: no-cache
   Connection: keep-alive

   data: Use this endpoint: POST http://192.168.239.1:32122/message?sessionId=abc-123-def

   ```

**客户端收到:**
```javascript
res.on('data', (chunk) => {
  // chunk = "data: Use this endpoint: POST http://...?sessionId=abc-123-def\n\n"
  const sessionId = extractSessionId(chunk);
  console.log('✅ Session ID:', sessionId);
});
```

---

### 步骤 2: MCP 初始化

**客户端操作:**
```javascript
const message = {
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: {name: 'test-client', version: '1.0.0'}
  }
};

await fetch('http://192.168.239.1:32122/message?sessionId=abc-123', {
  method: 'POST',
  headers: {'Content-Type': 'application/json'},
  body: JSON.stringify(message)
});
```

**发送的 HTTP 请求:**
```http
POST /message?sessionId=abc-123-def HTTP/1.1
Host: 192.168.239.1:32122
Content-Type: application/json
Content-Length: 156

{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test-client","version":"1.0.0"}}}
```

**服务器端处理:**

1. **接收消息** (src/multi-tenant/server-sse.ts)
   ```typescript
   app.post('/message', async (req, res) => {
     const sessionId = req.query.sessionId;
     const message = req.body;
   ```

2. **查找 Session**
   ```typescript
   const session = sessionManager.getSession(sessionId);
   if (!session) {
     return res.status(404).json({error: 'Session not found'});
   }
   ```

3. **转发给 MCP Server**
   ```typescript
   await session.server.handleRequest(message, session.context);
   ```

4. **MCP Server 处理** (@modelcontextprotocol/sdk)
   ```typescript
   // SDK 内部处理 initialize
   const result = {
     protocolVersion: '2024-11-05',
     capabilities: {
       tools: {...},  // 支持的工具列表
     },
     serverInfo: {
       name: 'chrome-extension-debug-mcp',
       version: '0.8.7'
     }
   };
   ```

5. **通过 SSE 返回响应**
   ```http
   (在之前的 SSE 连接中推送)

   data: {"jsonrpc":"2.0","id":1,"result":{"protocolVersion":"2024-11-05","capabilities":{...}}}

   ```

**客户端收到:**
```javascript
// SSE 的 data 事件
const response = JSON.parse(data);
console.log('初始化成功:', response.result);
```

---

### 步骤 3: 调用扩展工具

**客户端操作:**
```javascript
const message = {
  jsonrpc: '2.0',
  id: 2,
  method: 'tools/call',
  params: {
    name: 'list_extensions',
    arguments: {
      includeDisabled: true
    }
  }
};

await fetch('http://192.168.239.1:32122/message?sessionId=abc-123', {
  method: 'POST',
  body: JSON.stringify(message)
});
```

**服务器端处理 list_extensions:**

1. **找到工具定义** (src/tools/extension-tools.ts)
   ```typescript
   {
     name: 'list_extensions',
     description: 'List all installed Chrome extensions',
     inputSchema: {
       type: 'object',
       properties: {
         includeDisabled: {type: 'boolean'}
       }
     }
   }
   ```

2. **调用工具处理器** (src/extension/ExtensionHelper.ts)
   ```typescript
   async getExtensions(includeDisabled: boolean) {
     // 方法 1: chrome.management API
     try {
       const extensions = await page.evaluate(() => {
         return chrome.management.getAll();
       });
       if (extensions.length > 0) return extensions;
     } catch (e) {
       console.log('chrome.management API failed');
     }
     
     // 方法 2: Target 扫描
     const targets = await browser.targets();
     const extensionTargets = targets.filter(t => 
       t.type() === 'service_worker' && 
       t.url().startsWith('chrome-extension://')
     );
     if (extensionTargets.length > 0) {
       return parseExtensionsFromTargets(extensionTargets);
     }
     
     // 方法 3: 视觉检测（回退）
     console.log('🔍 尝试视觉检测...');
     return await this.getExtensionsViaVisualInspection();
   }
   ```

3. **视觉检测详细流程:**
   ```typescript
   async getExtensionsViaVisualInspection() {
     // 1. 创建新页面
     const page = await browser.newPage();
     
     // 2. 导航到扩展管理页面
     await page.goto('chrome://extensions/');
     
     // 3. 启用开发者模式（显示扩展ID）
     await page.evaluate(() => {
       const toggle = document.querySelector('extensions-manager')
         .shadowRoot.querySelector('#devMode');
       toggle.click();
     });
     
     // 4. 解析 Shadow DOM
     const extensions = await page.evaluate(() => {
       const manager = document.querySelector('extensions-manager');
       const itemList = manager.shadowRoot
         .querySelector('extensions-item-list');
       const items = itemList.shadowRoot
         .querySelectorAll('extensions-item');
       
       return Array.from(items).map(item => ({
         id: item.getAttribute('id'),
         name: item.shadowRoot.querySelector('#name').textContent,
         version: item.shadowRoot.querySelector('#version').textContent,
         enabled: !item.hasAttribute('disabled')
       }));
     });
     
     // 5. 获取每个扩展的 manifest
     for (const ext of extensions) {
       const manifestURL = `chrome-extension://${ext.id}/manifest.json`;
       const manifest = await fetch(manifestURL).then(r => r.json());
       ext.manifest = manifest;
     }
     
     return extensions;
   }
   ```

4. **返回结果 (通过 SSE)**
   ```http
   data: {"jsonrpc":"2.0","id":2,"result":{"content":[{"type":"text","text":"# list_extensions response\n## Enhanced MCP Debug Test Extension\n- **ID**: bekcbmopkiajilfliobihjgnghfcbido\n..."}]}}

   ```

---

## 🎯 关键验证点

### 如何验证不是黑盒？

**1. 查看 HTTP 请求日志**
```javascript
// 脚本中的日志
console.log(`📤 HTTP ${method} ${url}`);
console.log(`   Body: ${JSON.stringify(data)}`);
console.log(`📥 HTTP ${statusCode}`);
console.log(`   Response: ${body}`);
```

**2. 查看 SSE 消息流**
```javascript
// SSE 监听日志
console.log(`📨 SSE 消息: ${dataStr}`);
```

**3. 验证每个响应的内容**
```javascript
// 解析响应并验证
const extensions = parseExtensions(response.result.content[0].text);
console.log(`✅ 检测到 ${extensions.length} 个扩展`);
extensions.forEach(ext => {
  console.log(`   - ${ext.name} (${ext.id})`);
});
```

**4. 检查服务器端日志**
```bash
# 服务器日志会显示
[SessionManager] Creating session abc-123 for user bob
[RouterManager] Found route for bob: http://localhost:9222
[BrowserPool] Connecting to browser at http://localhost:9222
[ExtensionHelper] 获取所有扩展...
[ExtensionHelper] ⚠️  chrome.management API 不可用
[ExtensionHelper] ⚠️  targets 扫描未找到扩展
[ExtensionHelper] 🔍 尝试视觉检测
[ExtensionHelper] ✅ 视觉检测找到 2 个扩展
```

---

## 📊 完整的数据流示例

### 请求 1: SSE 连接

```
客户端 → 服务器
─────────────────
GET /sse?userId=bob
Authorization: Bearer mcp_HH2rQyRQYtOIEX7_4acBAxJCTTGnDUSz

服务器 → 客户端 (SSE 流)
────────────────────────
data: Use this endpoint: POST http://192.168.239.1:32122/message?sessionId=f3a1b2c4-d5e6-7890-abcd-ef1234567890

```

### 请求 2: 初始化

```
客户端 → 服务器
─────────────────
POST /message?sessionId=f3a1b2c4-d5e6-7890-abcd-ef1234567890
{"jsonrpc":"2.0","id":1,"method":"initialize",...}

服务器 → 客户端 (通过 SSE)
────────────────────────────
data: {"jsonrpc":"2.0","id":1,"result":{"protocolVersion":"2024-11-05",...}}

```

### 请求 3: 列出扩展

```
客户端 → 服务器
─────────────────
POST /message?sessionId=f3a1b2c4-d5e6-7890-abcd-ef1234567890
{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"list_extensions","arguments":{"includeDisabled":true}}}

服务器 → 客户端 (通过 SSE)
────────────────────────────
data: {"jsonrpc":"2.0","id":2,"result":{"content":[{"type":"text","text":"# list_extensions response\n# Installed Extensions (2)\n\n## Enhanced MCP Debug Test Extension\n- **ID**: bekcbmopkiajilfliobihjgnghfcbido\n- **Version**: 2.1.0\n- **Status**: ❌ Disabled\n\n## Video SRT Ext MVP\n- **ID**: egnlfhdfnakiibiecidlcooehojeagfa\n- **Version**: 0.9.0\n- **Status**: ❌ Disabled"}]}}

```

---

## ✅ 为什么这不是黑盒？

1. **每个 HTTP 请求都有日志**
   - 可以看到发送的 URL、Headers、Body
   - 可以看到返回的状态码和响应

2. **SSE 消息流完全可见**
   - 每条消息都打印出来
   - 可以验证 Session ID 的传递
   - 可以看到 MCP 响应的原始内容

3. **结果可以解析和验证**
   - 扩展列表是明文 Markdown
   - 可以提取扩展 ID 和名称
   - 可以验证目标扩展是否被检测到

4. **服务器端逻辑透明**
   - 源代码完全可见 (src/extension/ExtensionHelper.ts)
   - 三层回退策略清晰
   - 视觉检测的 DOM 解析步骤明确

5. **端到端可追踪**
   - 从 HTTP 请求到浏览器 CDP 调用
   - 从 Chrome 扩展页面到 Shadow DOM 解析
   - 从扩展信息到 MCP 响应

---

## 🔧 如何自己验证？

### 方法 1: 使用测试脚本（已提供详细日志）
```bash
node test-bob-extensions.mjs
# 查看每一步的HTTP请求和响应
```

### 方法 2: 使用 curl 手动测试
```bash
# 1. SSE 连接
curl -N -H "Authorization: Bearer mcp_xxx" \
  "http://192.168.239.1:32122/sse?userId=bob"
# 获取 Session ID

# 2. 初始化
curl -X POST "http://192.168.239.1:32122/message?sessionId=xxx" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize",...}'
# 通过 SSE 收到响应

# 3. 调用工具
curl -X POST "http://192.168.239.1:32122/message?sessionId=xxx" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"list_extensions",...}}'
# 通过 SSE 收到扩展列表
```

### 方法 3: 查看服务器日志
```bash
# 如果服务器启用了日志
DEBUG=* node dist/index.js --mode multi-tenant
# 可以看到所有内部操作
```

### 方法 4: 使用浏览器 DevTools
```javascript
// 在浏览器控制台
const es = new EventSource('http://192.168.239.1:32122/sse?userId=bob', {
  headers: {'Authorization': 'Bearer mcp_xxx'}
});
es.onmessage = (e) => console.log('SSE:', e.data);

// 然后发送 POST 请求
fetch('http://192.168.239.1:32122/message?sessionId=xxx', {
  method: 'POST',
  headers: {'Content-Type': 'application/json'},
  body: JSON.stringify({...})
});
```

---

## 🎓 总结

**测试脚本做的事情：**
1. ✅ 建立 SSE 连接（可见 HTTP 请求）
2. ✅ 接收 Session ID（可见 SSE 消息）
3. ✅ 发送 MCP 请求（可见 HTTP POST）
4. ✅ 接收 MCP 响应（可见 SSE 消息）
5. ✅ 解析并显示结果（可见扩展列表）

**每一步都可验证：**
- HTTP 请求和响应有日志
- SSE 消息流可见
- 服务器端代码开源
- 结果可以解析和检查

**这完全不是黑盒！** 🎉

所有通信都是标准的 HTTP/SSE 协议，所有数据都是可见的 JSON，所有逻辑都是可追踪的。
