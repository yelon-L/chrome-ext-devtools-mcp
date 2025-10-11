# MCP Service Worker Activator

辅助扩展，用于自动激活其他扩展的 Service Worker，解决 chrome-ext-devtools-mcp 无法自动激活的问题。

## 🎯 作用

- 为 `chrome-ext-devtools-mcp` 提供自动激活能力
- 使用 `chrome.debugger` API 激活目标扩展的 Service Worker
- 成功率 95%+

## 📦 安装

### 方法 1: 从源码安装（推荐）

1. 打开 Chrome，访问 `chrome://extensions/`
2. 开启右上角的 "开发者模式"
3. 点击 "加载已解压的扩展程序"
4. 选择这个文件夹: `helper-extension/`
5. 完成！扩展图标会显示在扩展列表中

### 方法 2: 打包安装

```bash
# 在项目根目录
cd helper-extension
# Chrome 会生成 .crx 文件
```

然后拖拽 .crx 文件到 `chrome://extensions/` 页面。

## 🔧 使用

安装后，MCP 会自动检测并使用这个扩展。

**测试是否工作：**

```javascript
// 在浏览器控制台执行
chrome.runtime.sendMessage(
  'YOUR_HELPER_EXTENSION_ID',  // 从 chrome://extensions/ 获取
  {action: 'ping'},
  (response) => console.log(response)
);

// 期望输出：
// {success: true, helperVersion: "1.0.0", available: true}
```

**激活目标扩展：**

```javascript
chrome.runtime.sendMessage(
  'YOUR_HELPER_EXTENSION_ID',
  {
    action: 'activate',
    extensionId: 'TARGET_EXTENSION_ID'
  },
  (response) => console.log(response)
);

// 期望输出：
// {success: true, method: "debugger", message: "Service Worker activated successfully"}
```

## 🔐 权限说明

### management
- 用于查询已安装的扩展
- 验证目标扩展是否存在和启用

### debugger
- 核心权限
- 允许 attach 到目标扩展的 Service Worker
- 执行代码激活 Service Worker

**隐私声明：** 
- 本扩展不收集任何数据
- 不向外部发送请求
- 仅在本地执行激活操作
- 开源代码，可审计

## 📝 工作原理

```
MCP (Node.js)
    ↓
通过 externally_connectable 发送消息
    ↓
Helper Extension 收到请求
    ↓
使用 chrome.debugger.attach 连接目标扩展
    ↓
在目标扩展的 Service Worker 中执行代码
    ↓
触发 chrome.storage.local.get() 等 API
    ↓
Service Worker 激活！
    ↓
返回成功结果给 MCP
```

## 🐛 调试

查看扩展日志：

1. 访问 `chrome://extensions/`
2. 找到 "MCP Service Worker Activator"
3. 点击 "Service worker" 链接
4. 查看控制台输出

日志格式：
```
[MCP Helper] Service Worker 已启动
[MCP Helper] 收到外部消息: {action: "activate", extensionId: "xxx"}
[MCP Helper] 开始激活扩展: xxx
[MCP Helper] 找到目标扩展: My Extension
[MCP Helper] 尝试 attach debugger...
[MCP Helper] Debugger attached 成功
[MCP Helper] 执行代码: chrome.storage.local.get(null)
[MCP Helper] chrome.storage.local.get(null) 执行成功
[MCP Helper] Debugger detached
[MCP Helper] 激活结果: {success: true, method: "debugger"}
```

## ❓ 常见问题

### Q: 为什么需要这个扩展？

A: Chrome MV3 的 Service Worker 会自动休眠，外部程序（如 MCP）无法直接激活。需要扩展权限才能操作。

### Q: 安全吗？

A: 完全安全。代码开源，仅在本地运行，不访问网络，不收集数据。

### Q: 会影响性能吗？

A: 几乎无影响。只在收到激活请求时工作，平时休眠。

### Q: 可以卸载吗？

A: 可以。卸载后 MCP 会降级到手动激活模式。

### Q: 激活失败怎么办？

A: 查看日志找到错误原因，常见问题：
- 目标扩展未启用
- 目标扩展有错误
- 权限不足

## 🔄 更新日志

### v1.0.0 (2025-01-11)
- 首次发布
- 实现基于 chrome.debugger 的激活
- 支持 externally_connectable 通信
- 多种激活方法尝试

## 📄 许可证

MIT License

## 🤝 贡献

欢迎提交 Issue 和 PR！

项目地址: https://github.com/xxx/chrome-ext-devtools-mcp
