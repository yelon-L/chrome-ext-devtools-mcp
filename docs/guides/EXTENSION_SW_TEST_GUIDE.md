# Extension Service Worker 测试指南

**日期:** 2025-10-13  
**目的:** 测试扩展工具，特别是 Service Worker 失活后的激活功能  
**环境:** localhost:9222 Chrome + 192.168.239.1:32122 MCP Server

---

## 🔍 测试发现

### 当前状态

```
本地 Chrome (localhost:9222):
  - 状态: ✅ 运行中
  - 远程调试: ✅ 已启用
  - 扩展数量: ❌ 0 (未安装扩展)
  - 打开页面: 5 个
```

**问题:** 本地 Chrome 没有安装任何扩展，无法测试扩展相关工具。

---

## 📋 测试准备步骤

### 方法 1: 安装现有扩展 (推荐)

1. **打开 Chrome**
   ```bash
   # 访问本地 Chrome
   chromium --remote-debugging-port=9222 &
   ```

2. **安装测试扩展**
   - 访问: `chrome://extensions/`
   - 打开"开发者模式"
   - 推荐安装: 
     * uBlock Origin (有 Service Worker)
     * JSONView (简单扩展)
     * React DevTools (复杂扩展)

3. **验证安装**
   ```bash
   curl -s http://localhost:9222/json | jq -r '.[] | select(.url | contains("chrome-extension://"))'
   ```

### 方法 2: 创建最小测试扩展

创建一个简单的 MV3 扩展用于测试:

```bash
# 创建扩展目录
mkdir -p /tmp/test-extension
cd /tmp/test-extension

# 创建 manifest.json
cat > manifest.json << 'EOF'
{
  "manifest_version": 3,
  "name": "MCP Test Extension",
  "version": "1.0.0",
  "description": "Test extension for MCP Service Worker activation",
  "background": {
    "service_worker": "background.js"
  },
  "permissions": ["storage"]
}
EOF

# 创建 background.js (Service Worker)
cat > background.js << 'EOF'
// Service Worker for testing
console.log('MCP Test Extension: Service Worker started');

chrome.runtime.onInstalled.addListener(() => {
  console.log('MCP Test Extension: Installed');
  chrome.storage.local.set({ installedAt: new Date().toISOString() });
});

// Keep alive (optional)
setInterval(() => {
  console.log('MCP Test Extension: Heartbeat');
}, 30000);
EOF

echo "✅ Test extension created at /tmp/test-extension"
echo "   Load in Chrome: chrome://extensions/ → Load unpacked → /tmp/test-extension"
```

---

## 🧪 测试步骤

### 1. 确认扩展已安装

```bash
# 运行测试脚本
node test-extension-tools.mjs
```

**预期输出:**
```
Test 1: list_extensions
  ✅ list_extensions
     Found extension: abcdefghij123456...
```

### 2. 检查 Service Worker 状态

测试会自动执行以下检查:
1. List Extension Contexts - 查看 SW 是否活跃
2. Activate Service Worker - 尝试激活
3. Verify SW Activation - 确认激活成功

### 3. 测试 Service Worker 失活场景

**手动失活 Service Worker:**

```bash
# 方法 1: 等待自然失活 (Chrome 会在 30 秒无活动后停止 SW)
# 等待 30-60 秒，然后运行测试

# 方法 2: 在 Chrome DevTools 中手动停止
# 1. 打开 chrome://inspect/#service-workers
# 2. 找到你的扩展
# 3. 点击 "stop" 按钮
```

**然后运行测试:**
```bash
node test-extension-tools.mjs
```

**预期行为:**
1. `list_extension_contexts` 应该显示 SW 不活跃
2. `activate_extension_service_worker` 应该成功激活 SW
3. 再次 `list_extension_contexts` 应该显示 SW 已激活

---

## 📊 完整测试清单

测试脚本会执行以下 10 个测试:

- [x] **Test 1: list_extensions**
  - 目的: 发现已安装的扩展
  - 成功标准: 返回至少一个扩展 ID

- [x] **Test 2: get_extension_details**
  - 目的: 获取扩展详细信息
  - 成功标准: 返回名称、版本、manifest

- [x] **Test 3: list_extension_contexts (初始状态)**
  - 目的: 检查 SW 当前状态
  - 成功标准: 列出所有上下文 (可能不包含 SW)

- [x] **Test 4: activate_extension_service_worker (关键测试)**
  - 目的: 激活失活的 Service Worker
  - 成功标准: 成功激活消息
  - **这是测试的核心!**

- [x] **Test 5: verify_sw_activation**
  - 目的: 确认 SW 已被激活
  - 成功标准: SW 出现在上下文列表中

- [x] **Test 6: get_extension_logs**
  - 目的: 收集扩展日志
  - 成功标准: 返回日志条目

- [x] **Test 7: evaluate_in_extension**
  - 目的: 在扩展上下文中执行代码
  - 成功标准: 代码成功执行并返回结果

- [x] **Test 8: inspect_extension_storage**
  - 目的: 检查扩展存储
  - 成功标准: 返回存储内容或空状态

- [x] **Test 9: diagnose_extension_errors**
  - 目的: 诊断扩展错误
  - 成功标准: 分析并报告错误状态

- [x] **Test 10: inspect_extension_manifest**
  - 目的: 深度检查 manifest
  - 成功标准: 返回 manifest 分析和 MV3 兼容性

---

## 🎯 关键测试场景

### 场景 1: Service Worker 已激活

```
初始状态:
  - SW 正在运行
  - 上下文列表包含 service_worker

测试结果:
  ✅ list_extension_contexts → 显示 SW
  ✅ activate_extension_service_worker → 可能显示"已激活"或"保持激活"
```

### 场景 2: Service Worker 已失活 (重点测试)

```
初始状态:
  - SW 已停止 (30秒无活动)
  - 上下文列表不包含 service_worker

测试结果:
  ⚠️  list_extension_contexts → 不显示 SW (预期)
  ✅ activate_extension_service_worker → 激活 SW
  ✅ verify_sw_activation → SW 现在可见

关键验证:
  - activate 工具能否成功唤醒失活的 SW?
  - 激活后 SW 是否立即可用?
  - 激活过程是否稳定可靠?
```

### 场景 3: MV2 vs MV3 扩展

```
MV2 扩展:
  - 使用 background.page
  - 持久后台页面
  - 不会自动失活

MV3 扩展:
  - 使用 service_worker
  - 非持久
  - 会自动失活 → 需要激活工具

测试重点:
  - MV3 扩展的 SW 激活
```

---

## 📈 预期测试结果

### 理想情况 (SW 失活后激活)

```
╔════════════════════════════════════════════════════════════════╗
║                  EXTENSION TOOLS TEST SUMMARY                  ║
╚════════════════════════════════════════════════════════════════╝

📊 Total Tests: 10
✅ Passed: 10 (100%)
❌ Failed: 0 (0%)

Test Details:

1. ✅ list_extensions
   Found extension: abcdefghij123456...

2. ✅ get_extension_details
   MCP Test Extension v1.0.0

3. ✅ list_extension_contexts
   🔴 SW context NOT found (inactive?)

4. ✅ activate_extension_service_worker (KEY TEST)
   🟢 SW activated successfully

5. ✅ verify_sw_activation
   ✅ SW is now ACTIVE

6. ✅ get_extension_logs
   Retrieved 5 log entries

7. ✅ evaluate_in_extension
   Result: abcdefghij123456...

8. ✅ inspect_extension_storage
   Storage inspected

9. ✅ diagnose_extension_errors
   No errors detected

10. ✅ inspect_extension_manifest
    🟢 MV3 extension

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🔑 Key Findings:

✅ Service Worker activation tool is working
✅ Service Worker successfully activated and verified
```

---

## 🛠️ 故障排查

### 问题 1: 没有检测到扩展

```bash
# 检查 Chrome 是否启用了远程调试
curl http://localhost:9222/json/version

# 检查扩展是否已加载
curl -s http://localhost:9222/json | jq -r '.[] | .url' | grep chrome-extension

# 如果没有输出，需要:
# 1. 安装至少一个扩展
# 2. 确保扩展已启用
# 3. 重启 Chrome
```

### 问题 2: Service Worker 无法激活

**可能原因:**
1. 扩展没有 Service Worker (MV2 扩展)
2. Manifest 配置错误
3. Chrome 版本不支持

**解决方法:**
```bash
# 检查扩展类型
node test-extension-tools.mjs | grep "MV3\|MV2"

# 如果是 MV2，安装一个 MV3 扩展进行测试
```

### 问题 3: 测试超时

```bash
# 增加超时时间
# 修改 test-extension-tools.mjs 中的 timeout 值
# 默认: 30000 (30秒)
# 建议: 60000 (60秒)
```

---

## 🎓 测试最佳实践

### 1. 准备阶段

- ✅ 安装至少一个 MV3 扩展
- ✅ 确认 Chrome 远程调试已启用
- ✅ 确认 MCP 服务器运行正常

### 2. 执行阶段

- ✅ 先运行一次测试作为基准
- ✅ 等待 SW 自然失活 (30-60秒)
- ✅ 再次运行测试观察激活过程

### 3. 验证阶段

- ✅ 检查所有 10 个测试是否通过
- ✅ 特别关注 Test 4 (activate_extension_service_worker)
- ✅ 确认 Test 5 (verify_sw_activation) 显示 SW 已激活

---

## 📝 当前测试运行结果

**执行时间:** 2025-10-13 22:13  
**状态:** ⚠️ 无法完成 - 本地 Chrome 未安装扩展

```
测试状态: 未完成
原因: 本地 Chrome (localhost:9222) 没有安装扩展
建议: 按照上述步骤安装测试扩展后重新运行
```

---

## 🚀 快速开始

**最快的测试方法:**

```bash
# 1. 创建测试扩展
mkdir -p /tmp/test-extension && cd /tmp/test-extension
cat > manifest.json << 'EOF'
{
  "manifest_version": 3,
  "name": "MCP Test",
  "version": "1.0.0",
  "background": {"service_worker": "bg.js"}
}
EOF
echo "console.log('SW started');" > bg.js

# 2. 在 Chrome 中加载
# chrome://extensions/ → Load unpacked → /tmp/test-extension

# 3. 运行测试
node test-extension-tools.mjs

# 4. 等待 SW 失活后再次测试
sleep 60 && node test-extension-tools.mjs
```

---

## 📚 相关文档

- [Service Worker 激活工具文档](docs/guides/ACTIVATE_SERVICE_WORKER_GUIDE.md)
- [扩展工具完整列表](docs/guides/tool-reference.md)
- [Multi-Tenant 测试指南](docs/guides/MULTI_TENANT_COMPLETE_TEST.md)

---

**下一步:** 安装测试扩展并重新运行测试  
**测试脚本:** `node test-extension-tools.mjs`  
**预期时间:** 5-10 分钟

---

## 🔬 Background/Offscreen 日志工具调试报告

**调试日期:** 2025-10-25  
**调试环境:** ext-debug-stream9222 (Chrome 9225)  
**测试扩展:** Video SRT Ext (Rebuilt) v0.4.263  
**调试内容:** Background 和 Offscreen Document 日志捕获功能

### 测试结果总结

| 工具 | 状态 | 日志捕获 | 备注 |
|------|------|----------|------|
| `get_background_logs` | ✅ **正常** | ✅ 成功捕获 10 条 | 实时捕获机制工作正常 |
| `get_offscreen_logs` | ❌ **有Bug** | ❌ 返回 0 条 | Target 匹配失败 |

### Background 日志工具验证 ✅

**测试流程:**
1. 在 Service Worker 中启动定时器，每秒打印 3 条不同级别的日志
2. 调用 `getBackgroundLogs({capture: true, duration: 6000})`
3. **成功捕获 10 条日志**，包含:
   - 日志类型: log, warning, error
   - 时间戳
   - Stack trace
   - 源文件信息

**关键发现:**
- 工具采用**实时捕获机制**
- **必须先启动捕获，再产生日志**（时机很重要）
- 捕获期间的日志才能被记录
- 历史日志需要扩展在 `globalThis.__logs` 中存储

**示例输出:**
```
📊 Total: 10 entries
- 📝 log: 4 entries
- 📋 warning: 3 entries
- ❌ error: 3 entries

[MCP][TEST][1761365116161] Background log test 8
[MCP][WARN][1761365116162] Warning test 8
[MCP][ERROR][1761365116162] Error test 8
...
```

### Offscreen 日志工具问题 ❌

**问题描述:**
- Offscreen Document 确实存在（`list_extension_contexts` 可见）
- Offscreen 有在打印日志（通过页面方式可见 5 条历史日志）
- 但 `getOffscreenLogs` 始终返回 0 条日志

**验证步骤:**
1. 通过 `list_extension_contexts` 确认 Offscreen target 存在
   - Target ID: `DE80498E7E154C40D6C9F47EF3CB037A`
   - URL: `chrome-extension://obbhgfjghnnodmekfkfffojnkbdbfpbh/offscreen/offscreen.html`

2. 直接导航到 Offscreen 页面，成功获取到 5 条历史日志:
   ```
   [04:06:33] [Offscreen] Document loaded (v0.4.263)
   [04:06:33] [Offscreen] ✅ Ready to handle WebSocket connections
   [04:06:33] [Offscreen] Disconnecting WebSocket
   [04:06:33] [Offscreen] ✅ Disconnected and all state cleared
   [04:06:33] [Offscreen] 📨 Received message from Background
   ```

3. 通过 SW 创建真正的 Offscreen Document，并发送消息触发日志
4. 调用 `getOffscreenLogs({capture: true, duration: 10000})`
5. **返回 0 条日志**

### 问题根因分析

**代码审查 (`ExtensionHelper.ts:1630-1644`)**:

```typescript
// 第一步：通过 CDP 查找 Offscreen target
const offscreenTarget = await this.getExtensionOffscreenTarget(extensionId);

// 第二步：通过 Puppeteer API 匹配 target
const targets = await this.browser.targets();
const offTarget = targets.find(
  t => (t as unknown as {_targetId: string})._targetId === offscreenTarget.targetId
);

if (!offTarget) {
  this.logError('[ExtensionHelper] 未找到 Offscreen Document 的 Puppeteer Target');
  return {logs: [], isActive: false};
}
```

**问题点:**
1. **使用私有属性** `_targetId` 进行 target 匹配
2. 这种匹配方式对 Offscreen Document 不可靠
3. Background logs 使用相同的模式但能工作，说明 Offscreen target 的特性不同

### 修复方案

#### 方案 A: 修复 Target 匹配逻辑（推荐）

```typescript
// ❌ 修改前：使用私有属性
const offTarget = targets.find(
  t => (t as unknown as {_targetId: string})._targetId === offscreenTarget.targetId
);

// ✅ 修改后：使用 URL 匹配
const offTarget = targets.find(t => {
  const url = t.url();
  return url.includes(extensionId) && url.includes('/offscreen');
});
```

**优点:**
- 使用公开 API
- 更可靠
- 与 `getExtensionOffscreenTarget` 的查找逻辑一致

#### 方案 B: 直接使用 CDP API

```typescript
// 绕过 Puppeteer Target API，直接使用 CDP
const cdp = await this.getCDPSession();
const session = await cdp.send('Target.attachToTarget', {
  targetId: offscreenTarget.targetId,
  flatten: true
});
```

**优点:**
- 更底层，更直接
- 避免 Puppeteer 封装的问题

#### 方案 C: 添加详细调试日志

在修复前，先添加调试日志以确认问题:

```typescript
this.log(`[Debug] Found offscreen CDP target: ${offscreenTarget.targetId}`);
this.log(`[Debug] Puppeteer targets count: ${targets.length}`);
targets.forEach(t => {
  this.log(`[Debug] Target: ${t.url()}, _targetId: ${(t as any)._targetId}`);
});
this.log(`[Debug] Found matching target: ${!!offTarget}`);
```

### 对比分析

| 特性 | Background Logs | Offscreen Logs |
|------|-----------------|----------------|
| Target 查找 | `getExtensionBackgroundTarget` | `getExtensionOffscreenTarget` |
| Target 匹配 | 使用 `_targetId` | 使用 `_targetId` |
| CDP Session | ✅ 成功创建 | ❌ 可能失败 |
| 日志捕获 | ✅ 正常工作 | ❌ 返回空 |
| 代码模式 | 完全相同 | 完全相同 |

**结论:** 相同的代码模式，但 Offscreen 失败，说明问题在于 Offscreen target 的特性与 Background 不同。

### 工作区解决方案

**临时方案:** 使用页面方式访问 Offscreen

```bash
# 1. 导航到 Offscreen 页面
navigate_page('chrome-extension://ID/offscreen/offscreen.html')

# 2. 使用普通的页面日志工具
get_page_console_logs({limit: 100})

# 3. 在页面中执行测试代码
evaluate_script(() => {
  console.log('[TEST] Offscreen log test');
})
```

**优点:**
- 可以立即使用
- 能获取完整的历史日志
- 支持实时监听

**缺点:**
- 不是真正的 Offscreen Document（是作为普通页面打开的）
- 生命周期不同

### 后续行动

1. **立即可做**:
   - ✅ 在文档中记录问题和临时方案
   - ✅ 为 Offscreen 日志工具添加警告说明

2. **短期修复** (推荐方案 A):
   - 修改 Target 匹配逻辑，使用 URL 匹配
   - 添加完整的错误处理和调试日志
   - 测试修复效果

3. **长期优化**:
   - 统一 Background 和 Offscreen 的日志捕获实现
   - 考虑使用更可靠的 CDP API
   - 添加单元测试覆盖

### 测试数据

**扩展信息:**
- ID: `obbhgfjghnnodmekfkfffojnkbdbfpbh`
- 名称: Video SRT Ext (Rebuilt)
- 版本: 0.4.263
- Manifest: MV3
- Service Worker: ✅ Active
- Offscreen Document: ✅ Exists

**测试时间:**
- 开始: 2025-10-25 12:03
- 结束: 2025-10-25 12:20
- 总计: ~17 分钟

**测试次数:**
- Background logs: 3 次测试，全部成功
- Offscreen logs: 5 次测试，全部失败
- 页面方式访问 Offscreen: 1 次测试，成功

---

**更新日期:** 2025-10-25 12:17  
**状态:** ✅ Background 工具已修复，✅ Offscreen 工具已修复  
**Git Commits:** 289c858 (Offscreen), 3d2e6e2 (Background)

---

## 🎉 修复完成与验证报告

### 修复日期
- Offscreen 修复: 2025-10-25 12:14
- Background 修复: 2025-10-25 12:17

### 最终测试结果

| 工具 | 状态 | 捕获日志 | 验证方法 |
|------|------|----------|----------|
| **get_background_logs** | ✅ **正常** | 15 条 | 定时器打印 log/warn/error |
| **get_offscreen_logs** | ✅ **正常** | 156 条 | 实际扩展使用场景 |

### 修复内容详解

#### 第一阶段：Offscreen Target 匹配修复

**Git Commit:** 289c858

**问题:**
- 使用私有属性 `_targetId` 匹配不可靠
- Offscreen Document 的 target 特性与 Background 不同

**修复:**
```typescript
// ❌ 修改前
const offTarget = targets.find(
  t => (t as unknown as {_targetId: string})._targetId === offscreenTarget.targetId
);

// ✅ 修改后
const offTarget = targets.find(t => {
  const url = t.url();
  const matches = url.includes(extensionId) && url.includes('/offscreen');
  this.log(`[ExtensionHelper] Checking target: ${url} -> ${matches}`);
  return matches;
});
```

**验证结果:**
- ✅ 成功捕获 156 条 Offscreen 日志
- 日志内容：`[Offscreen] 📨 Received message from Background Object`

#### 第二阶段：Background Target 匹配修复

**Git Commit:** 3d2e6e2

**问题:**
- 第一次修复使用了错误的 `url.includes(backgroundTarget.url)` 逻辑
- `backgroundTarget.url` 是完整 URL，不应该用 includes

**修复:**
```typescript
// ❌ 第一次修复（错误）
const swTarget = targets.find(t => {
  const url = t.url();
  const matches = url.includes(extensionId) && url.includes(backgroundTarget.url);
  return matches;
});

// ✅ 第二次修复（正确）
const swTarget = targets.find(t => {
  const url = t.url();
  const matches = url === backgroundTarget.url;
  this.log(`[ExtensionHelper] Checking target: ${url} -> ${matches}`);
  return matches;
});
```

**验证结果:**
- ✅ 成功捕获 15 条 Background 日志
- 日志类型：5 log + 5 warning + 5 error

### 完整测试流程

#### Background 日志测试

**步骤:**
```javascript
// 1. 在 Service Worker 中启动定时器
let count = 0;
const interval = setInterval(() => {
  count++;
  console.log(`[TEST][BG] Log ${count}`);
  console.warn(`[TEST][BG] Warn ${count}`);
  console.error(`[TEST][BG] Error ${count}`);
  if (count >= 5) clearInterval(interval);
}, 1000);

// 2. 立即捕获日志
get_background_logs({capture: true, duration: 10000})
```

**结果:**
```
📊 Total: 15 entries
- 📝 log: 5 entries
- 📋 warning: 5 entries
- ❌ error: 5 entries

[TEST][BG][1761365821161] Log 1
[TEST][BG][1761365821161] Warn 1
[TEST][BG][1761365821162] Error 1
...
```

#### Offscreen 日志测试

**步骤:**
1. 打开 HLS 测试页面
2. Hover 到视频，点击"字幕"按钮
3. 播放视频，等待状态变为"运行中"
4. 捕获 Offscreen 日志

**结果:**
```
📊 Total: 156 entries
- 📝 log: 156 entries

[04:14:35] [Offscreen] 📨 Received message from Background Object
[04:14:36] [Offscreen] 📨 Received message from Background Object
...
```

### 技术要点总结

#### Background vs Offscreen 匹配策略差异

**为什么使用不同的匹配方式？**

| Target 类型 | 匹配方式 | 原因 |
|------------|---------|------|
| **Background** | `url === backgroundTarget.url` | CDP 返回完整准确的 URL，直接比较最可靠 |
| **Offscreen** | `url.includes('/offscreen')` | 需要模式匹配，因为 URL 路径可能变化 |

**核心区别:**
- Background target 通过 `type === 'service_worker'` 唯一确定，URL 固定
- Offscreen target 没有专用 type，需要通过 URL 模式识别

#### 最佳实践

1. **优先使用公开 API**: 避免依赖私有属性（如 `_targetId`）
2. **根据场景选择匹配方式**:
   - 已知准确 URL → 直接比较 (`===`)
   - 需要模式匹配 → 使用 includes
3. **添加详细调试日志**: 便于排查匹配失败问题
4. **实际测试验证**: 不依赖假设，用真实场景测试

### 遗留问题与改进

#### 已解决 ✅
- ✅ Offscreen target 匹配失败
- ✅ Background target 匹配失败
- ✅ 私有属性依赖问题
- ✅ 调试日志缺失

#### 后续优化建议
1. 考虑添加 fallback 机制（URL 匹配失败时尝试其他方式）
2. 优化调试日志级别（production 环境可关闭）
3. 添加单元测试覆盖 target 匹配逻辑
4. 文档补充不同扩展类型的日志捕获差异

---

**最终状态:** ✅ 两个工具均已修复并通过验证  
**测试扩展:** Video SRT Ext v0.4.263  
**测试环境:** ext-debug-stdio (Chrome 9225)  
**总耗时:** ~30 分钟（包含调试、修复、验证）
