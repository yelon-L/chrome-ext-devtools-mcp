# list_extensions 优化总结

## 你的问题回答

### 1. list_extensions 是否依赖 SW 状态?

**答案**: ❌ **不依赖**

- `list_extensions` 通过 Chrome DevTools Protocol 扫描 targets
- **即使 SW 是 inactive,仍然可以检测到扩展**
- 但会显示 SW 的状态(🟢 Active / 🔴 Inactive)

### 2. 没有扫描到扩展时,是否应该提示跳转到 chrome://extensions/?

**答案**: ✅ **应该!已优化**

**优化前**:
```
No extensions found.
```

**优化后**:
```
# No Extensions Found

## Possible Reasons:
1. No extensions installed
2. All extensions are disabled  
3. Chrome started before extensions loaded
4. Wrong Chrome profile

## 🔍 Recommended Debugging Steps:
### Option 1: Visual Inspection (Recommended)
Navigate to chrome://extensions/ to see what Chrome actually shows:
```
1. navigate_to with url="chrome://extensions/"
2. screenshot
3. Analyze screenshot to identify installed extensions
```

### Option 2: Include Disabled Extensions
```
list_extensions with includeDisabled=true
```

💡 **For AI**: Use navigate_to + screenshot to visually inspect the chrome://extensions/ page
```

### 3. Ubuntu + Chrome 9222 + SW "无效"的影响?

**你的环境**:
- Ubuntu
- Chrome 运行在 9222
- 扩展 SW 显示"无效"(Inactive)

**影响分析**:

| 工具 | 是否可用 | 说明 |
|------|---------|------|
| ✅ list_extensions | 可用 | 可以检测扩展 |
| ✅ get_extension_details | 可用 | 读取 manifest |
| ✅ inspect_extension_manifest | 可用 | 静态分析 |
| ✅ check_content_script_injection | 可用 | 检查配置 |
| ❌ evaluate_in_extension | **不可用** | 需要 SW active |
| ❌ inspect_extension_storage | **不可用** | 需要 SW active |
| ⚠️ get_extension_logs | 部分可用 | 无 SW 日志 |
| ⚠️ list_extension_contexts | 部分可用 | 看不到 background |

**解决方案**:
```bash
# 激活 SW
activate_extension_service_worker mode="inactive"

# 或者重载扩展(自动激活 SW)
reload_extension extensionId="你的扩展ID"
```

---

## 优化内容

### 1. 空结果优化

**改进点**:
1. ✅ 提供 4 种可能原因
2. ✅ 提供 3 种解决方案
3. ✅ **特别推荐使用 navigate_to + screenshot**
4. ✅ 明确告诉 AI 可以跳转到 chrome://extensions/
5. ✅ 提供具体的操作步骤

**AI 工作流**:
```
AI: list_extensions
→ No extensions found.
  Recommended: navigate_to chrome://extensions/ + screenshot

AI: 好的,我来检查扩展页面
→ navigate_to url="chrome://extensions/"
→ screenshot

AI 分析截图:
→ 看到 3 个扩展,2 个启用,1 个禁用

AI: 发现有扩展,尝试包含禁用的
→ list_extensions includeDisabled=true
```

### 2. SW Inactive 智能提示

**优化前**:
```
## MyExtension
- **Service Worker**: 🔴 Inactive
```

**优化后**:
```
## MyExtension
- **Service Worker**: 🔴 Inactive
  - ⚠️  **Note**: Inactive SW blocks: evaluate_in_extension, inspect_extension_storage, etc.
  - **Quick fix**: Use `activate_extension_service_worker` with extensionId="abcd..."
```

**改进点**:
1. ✅ 明确说明 inactive 会影响哪些工具
2. ✅ 提供一键激活的命令
3. ✅ 包含具体的 extensionId 参数
4. ✅ 即时的、可操作的建议

---

## 实际使用场景

### 场景 1: Ubuntu + 9222 + 扩展 SW 无效

**你的情况**:
```bash
# 运行 Chrome
$ google-chrome --remote-debugging-port=9222

# MCP 连接成功,执行 list_extensions
list_extensions

# 输出:
## MyExtension  
- **Service Worker**: 🔴 Inactive
  - ⚠️  Note: Inactive SW blocks: evaluate_in_extension, inspect_extension_storage, etc.
  - **Quick fix**: Use `activate_extension_service_worker` with extensionId="abcd..."
```

**AI 的反应**:
```
AI: 我看到扩展的 SW 是 inactive,这会影响很多工具。
    让我先激活它。

activate_extension_service_worker extensionId="abcd..."

AI: SW 已激活,现在可以执行代码了。

evaluate_in_extension extensionId="abcd..." code="chrome.runtime.id"
→ ✅ 成功
```

### 场景 2: 没有检测到扩展

```bash
list_extensions

# 输出:
# No Extensions Found

## Possible Reasons:
1. No extensions installed
2. All extensions are disabled
...

## 🔍 Recommended Debugging Steps:
### Option 1: Visual Inspection (Recommended)
Navigate to chrome://extensions/ to see what Chrome actually shows:
```
1. navigate_to with url="chrome://extensions/"
2. screenshot
3. Analyze screenshot
```

💡 **For AI**: Use navigate_to + screenshot to visually inspect chrome://extensions/
```

**AI 的反应**:
```
AI: 没有检测到扩展,建议我去 chrome://extensions/ 检查。
    让我导航到那里并截图。

navigate_to url="chrome://extensions/"
screenshot

AI: [分析截图] 我看到有 3 个扩展,可能是被禁用了。
    让我尝试包含禁用的扩展。

list_extensions includeDisabled=true
→ ✅ 找到 3 个扩展
```

---

## SW Inactive 的根本原因

### MV3 的 Ephemeral Service Worker

**设计原理**:
1. **事件驱动**: 只在需要时运行
2. **自动休眠**: ~30秒无活动后自动 inactive
3. **资源优化**: 节省内存和 CPU

**激活时机**:
- 扩展安装/更新时
- 收到 chrome.runtime.onMessage
- Alarm 触发
- 用户点击 popup
- 手动激活(activate_extension_service_worker)

**为什么你看到"无效"**:
```
扩展刚安装 → SW Active
     ↓
30秒无活动
     ↓
SW 自动变为 Inactive  ← 你在这里
     ↓
需要执行代码 → 工具调用失败
     ↓
激活 SW → 工具调用成功
```

---

## 最佳实践

### 使用工具前的检查清单

```bash
# 1. 检查扩展是否存在
list_extensions

# 2. 查看 SW 状态
#    如果显示 🔴 Inactive → 需要激活

# 3. 激活 SW (如果需要)
activate_extension_service_worker mode="inactive"

# 4. 现在可以使用需要 SW 的工具
evaluate_in_extension extensionId="..." code="..."
inspect_extension_storage extensionId="..."
```

### AI 的智能工作流

```
1. 首先 list_extensions 检查扩展
   ├─ 有扩展 → 检查 SW 状态
   │   ├─ 🟢 Active → 直接使用工具
   │   └─ 🔴 Inactive → 先激活 SW
   │
   └─ 无扩展 → navigate_to chrome://extensions/ + screenshot
       └─ 分析截图 → 尝试 includeDisabled=true
```

---

## 文件修改

**文件**: `src/tools/extension/discovery.ts`

**修改内容**:
1. 优化空结果处理(57-92行)
2. 添加 SW Inactive 智能提示(129-136行)

**已编译** ✅

---

## 总结

### ✅ 解决的问题

1. **list_extensions 不依赖 SW** - 即使 inactive 也能检测
2. **空结果有友好提示** - 引导 AI 跳转到 chrome://extensions/
3. **SW Inactive 有明确说明** - 告知影响和解决方案

### 🎯 你的环境(Ubuntu + 9222 + SW 无效)

**现状**:
- ✅ list_extensions 可以检测扩展
- ❌ evaluate_in_extension 会失败
- ❌ inspect_extension_storage 会失败

**解决**:
```bash
activate_extension_service_worker mode="inactive"
```

执行后,所有工具都可以正常使用! 🎉
