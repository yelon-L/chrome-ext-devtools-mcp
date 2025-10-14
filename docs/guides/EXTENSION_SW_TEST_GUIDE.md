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
