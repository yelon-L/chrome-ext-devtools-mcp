# 🔍 自动激活故障排查

## 问题现象

根据你的反馈：
```
activate_service_worker：激活服务工作者
自动激活失败
建议手动在 chrome://extensions/ 中点击 "Service worker" 链接
```

## 🎯 诊断步骤

### 步骤 1: 验证生成器

✅ **已验证** - 生成器工作正常

```bash
node test-generator-only.js

# 结果：
🎉 所有测试通过！
✅ Helper Extension 生成功能正常
```

### 步骤 2: 检查 MCP 启动日志

**关键问题：** MCP 启动时是否有这些日志？

```
预期日志：
[Browser] 🔧 生成临时 Helper Extension（用户无感）...
[HelperGen] ✅ Helper Extension 已生成: /tmp/mcp-helper-extension-xxx
[Browser] ✨ 自动加载，激活成功率 95%+
```

### 步骤 3: 验证 Helper 是否被加载

打开 Chrome，访问 `chrome://extensions/`，应该看到：

```
✅ "MCP Service Worker Activator (Auto-Generated)"
```

如果没有，说明：
- MCP 启动时没有执行生成逻辑
- 或者 Chrome 启动参数没有正确传递

---

## 🐛 可能的原因

### 原因 1: MCP 入口点问题

**问题：** `src/browser.ts` 的 `launch()` 函数可能没有被调用

**验证：**
```bash
# 查看 MCP 启动方式
# 可能直接使用 puppeteer.connect 而不是 launch
```

**解决：**
需要确认 MCP 的启动流程是否使用了 `browser.ts` 的 `launch()` 函数

### 原因 2: 浏览器已经在运行

**问题：** 如果使用了 `--browser-url` 连接到已有浏览器，则不会执行 `launch()`

**验证：**
```bash
# 检查是否使用了 connect 而不是 launch
grep -r "puppeteer.connect" src/
```

**解决：**
如果使用 `connect`，需要在连接前先启动带 Helper Extension 的 Chrome

### 原因 3: 编译输出路径问题

**问题：** 代码可能引用了错误的路径

**验证：**
```bash
# 检查编译后的 browser.js
cat build/src/browser.js | grep "HelperExtensionGenerator"
```

---

## 🔧 立即修复方案

### 方案 A: 检查并修复 MCP 启动流程

<function_calls>
<invoke name="grep_search">
<parameter name="SearchPath">E:\developer\workspace\me\chrome-ext-devtools-mcp\src
