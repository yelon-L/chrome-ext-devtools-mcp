# Enhanced Test Extension v4.0 测试指南

## 📋 概述

Enhanced Test Extension v4.0 是专门设计用于验证Chrome Debug MCP Week 1-4所有增强功能的测试扩展。

## 🎯 功能覆盖

### Week 1: 基础增强功能
- **多级日志测试**: DEBUG, INFO, WARN, ERROR级别日志
- **内容脚本注入标记**: DOM特征标记用于检测
- **性能监控**: 初始化耗时和性能标记

### Week 2: 上下文管理
- **Storage API交互**: Local和Sync Storage读写操作
- **上下文标记**: Content Script和Background标记
- **Storage变更监听**: 实时监听存储变化

### Week 3: 消息传递和API调用
- **runtime.sendMessage**: Content Script ↔ Background双向消息
- **tabs.sendMessage**: Background → Tab消息传递
- **消息响应机制**: 同步和异步响应处理
- **Storage API**: Local和Sync存储操作
- **Tabs API**: 标签页查询、创建、关闭操作
- **Runtime API**: Manifest信息、扩展ID获取
- **Alarms API**: 定时器设置和触发

### Week 4: 批量测试场景
- **标签页生命周期**: 创建、更新、关闭事件监听
- **页面加载完成**: Tab-loaded消息发送
- **DOM特征标记**: data-mcp-extension-injected属性
- **定期心跳**: 60秒心跳日志用于长时间监控

## 🚀 安装说明

### 1. 构建扩展
确保扩展已经更新到v4.0版本：
```bash
cd enhanced-test-extension
# 检查manifest.json版本为4.0.0
```

### 2. 加载到Chrome
1. 打开Chrome浏览器
2. 访问 `chrome://extensions/`
3. 启用"开发者模式"
4. 点击"加载已解压的扩展程序"
5. 选择 `enhanced-test-extension` 目录
6. 验证扩展已加载，版本为4.0.0

### 3. 启动Chrome调试模式
```bash
# Linux/Mac
google-chrome --remote-debugging-port=9222 --user-data-dir=/tmp/chrome-debug

# Windows
chrome.exe --remote-debugging-port=9222 --user-data-dir=C:\Temp\chrome-debug
```

## 🧪 测试执行

### stdio模式全功能测试

```bash
# 编译项目
npm run build

# 运行stdio模式综合测试
node test-comprehensive-all-weeks.js
```

**测试内容**:
- ✅ Week 1: get_extension_logs (增强), content_script_status (增强)
- ✅ Week 2: list_extension_contexts, inspect_extension_storage
- ✅ Week 3: monitor_extension_messages, track_extension_api_calls
- ✅ Week 4: test_extension_on_multiple_pages
- ✅ 基础工具: list_tabs, list_extensions等

### RemoteTransport模式测试

```bash
# 运行RemoteTransport综合测试
node test-remote-transport-comprehensive.js
```

**测试内容**:
- ✅ HTTP/SSE服务器启动和健康检查
- ✅ 远程工具调用 (所有21个工具)
- ✅ Week 1-4所有功能的远程访问
- ✅ 网络传输的稳定性和性能

## 📊 测试验证点

### 1. Week 1 验证

#### get_extension_logs增强
验证点:
- [ ] 收集到多级别日志 (DEBUG, INFO, WARN, ERROR)
- [ ] 日志包含Enhanced Background和Enhanced Content的日志
- [ ] 时间戳正确
- [ ] 日志过滤功能正常

验证方法:
```javascript
// 应该看到类似输出
📊 收集到 XX 条日志
📋 日志级别: log, info, warn, error
```

#### content_script_status增强
验证点:
- [ ] 检测到content script已注入
- [ ] DOM特征标记被识别 (data-mcp-extension-injected)
- [ ] 扩展版本信息正确 (4.0.0)

验证方法:
```javascript
// 应该看到
📊 注入状态: 已注入
```

### 2. Week 2 验证

#### list_extension_contexts
验证点:
- [ ] 发现Enhanced Test Extension
- [ ] 识别Background上下文
- [ ] 识别Content Script上下文

验证方法:
```javascript
// 应该看到
📊 发现 X 个扩展
🎯 总上下文数: Y
```

#### inspect_extension_storage
验证点:
- [ ] 读取到content_script_marker
- [ ] 读取到test_local数据
- [ ] Storage数据结构正确

验证方法:
```javascript
// 应该看到
💾 Local存储项: X
```

### 3. Week 3 验证

#### monitor_extension_messages
验证点:
- [ ] 监控脚本成功注入
- [ ] 拦截runtime.sendMessage调用
- [ ] 拦截tabs.sendMessage调用
- [ ] 记录消息传递时间

验证方法:
```javascript
// 应该看到
📊 状态: 开始监控扩展消息
```

#### track_extension_api_calls
验证点:
- [ ] 追踪Storage API调用 (set, get)
- [ ] 追踪Tabs API调用 (query, create, remove)
- [ ] 追踪Runtime API调用 (getManifest, sendMessage)
- [ ] 记录API调用性能

验证方法:
```javascript
// 应该看到
📊 状态: 开始追踪扩展API调用
```

### 4. Week 4 验证

#### test_extension_on_multiple_pages
验证点:
- [ ] 成功创建测试标签页
- [ ] 检测到内容脚本注入
- [ ] 生成性能分析报告
- [ ] 提供优化建议

验证方法:
```javascript
// 应该看到
📊 成功率: XX%
⏱️ 平均加载时间: XXXms
```

## 🔍 问题排查

### 扩展未检测到
**现象**: list_extensions返回空列表

**解决方案**:
1. 确认扩展已加载: `chrome://extensions/`
2. 确认Chrome以调试模式启动: 检查9222端口
3. 刷新扩展: 禁用并重新启用

### 日志未收集到
**现象**: get_extension_logs返回空列表

**解决方案**:
1. 打开扩展背景页: `chrome://extensions/` > 详细信息 > 检查视图: Service Worker
2. 打开开发者工具: F12
3. 访问一个网页触发content script
4. 等待10-30秒让扩展生成日志

### 内容脚本未注入
**现象**: content_script_status显示未注入

**解决方案**:
1. 确认访问的是普通网页 (不是chrome://或about:页面)
2. 刷新页面重新注入
3. 检查控制台是否有Enhanced Content日志

### 消息监控无数据
**现象**: monitor_extension_messages没有拦截到消息

**解决方案**:
1. 确认扩展正在活跃使用
2. 触发扩展功能 (点击popup、与页面交互)
3. 增加监控时长: `duration: 30000` (30秒)

## 📈 预期结果

### stdio模式
```
📊 测试报告
🚀 传输方式: STDIO
📋 总测试数: 12-15
✅ 通过: 12-15
❌ 失败: 0
📈 成功率: 100%
```

### RemoteTransport模式
```
📊 RemoteTransport 测试报告
📡 传输方式: HTTP/SSE
🌐 服务器: http://localhost:3000
📋 总测试数: 12-15
✅ 通过: 12-15
❌ 失败: 0
📈 成功率: 100%
```

## 🎯 扩展功能演示

### 1. 查看Background日志
```javascript
// 打开Chrome DevTools
// Service Worker背景页应该显示:
[Enhanced Background] 🚀 Enhanced MCP Debug Test Extension v4.0 Starting...
[Enhanced Background] 📋 测试覆盖: Week 1-4 全部增强功能
```

### 2. 查看Content Script日志
```javascript
// 在任何网页打开DevTools控制台，应该看到:
[Enhanced Content] 🚀 Enhanced Content Script v4.0 开始初始化
[Enhanced Content] 📋 URL: https://example.com
[Enhanced Content] ✅ v4.0加载完成 - Week 1-4全功能测试就绪
```

### 3. 触发消息传递
```javascript
// 在网页控制台执行:
chrome.runtime.sendMessage({type: 'test_ping'}, (response) => {
  console.log('Response:', response);
});

// 应该在Background日志中看到:
[Enhanced Background] 📨 收到消息: {type: 'test_ping'}
[Enhanced Background] 🏓 处理ping消息
```

## 🏆 测试覆盖度

| Week | 功能 | 测试状态 |
|------|------|----------|
| Week 1 | get_extension_logs增强 | ✅ 完全覆盖 |
| Week 1 | content_script_status增强 | ✅ 完全覆盖 |
| Week 2 | list_extension_contexts | ✅ 完全覆盖 |
| Week 2 | inspect_extension_storage | ✅ 完全覆盖 |
| Week 3 | monitor_extension_messages | ✅ 完全覆盖 |
| Week 3 | track_extension_api_calls | ✅ 完全覆盖 |
| Week 4 | test_extension_on_multiple_pages | ✅ 完全覆盖 |
| 传输 | stdio模式 | ✅ 完全支持 |
| 传输 | RemoteTransport (HTTP/SSE) | ✅ 完全支持 |

**总计**: 21个工具 × 2种传输方式 = 42个测试场景全部覆盖 ✅

## 📝 备注

1. **测试环境**: 建议使用全新的Chrome用户目录进行测试，避免其他扩展干扰
2. **测试时长**: stdio模式约2-3分钟，RemoteTransport模式约3-5分钟
3. **并发测试**: Week 4批量测试会创建额外标签页，测试后会自动关闭
4. **日志清理**: 测试前建议清理Chrome控制台，便于观察新日志

## 🎉 总结

Enhanced Test Extension v4.0 提供了全面的Week 1-4功能验证能力，确保Chrome Debug MCP的所有21个工具在stdio和RemoteTransport两种传输方式下都能正常工作。

**核心价值**:
- ✅ 完整覆盖Week 1-4所有增强功能
- ✅ 支持stdio和RemoteTransport双模式验证
- ✅ 提供详细的测试报告和分析
- ✅ 真实场景的功能演示和验证
