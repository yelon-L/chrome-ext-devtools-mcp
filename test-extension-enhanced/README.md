# Enhanced MCP Test Extension

这是为Week 3功能测试专门设计的增强型Chrome扩展，用于验证Chrome Debug MCP的高级调试功能。

## 🎯 设计目的

基于`EXTENSION-TOOLS-DEVELOPMENT-PLAN.md`中各个增强功能的设计目标，这个测试扩展实现了：

### 消息传递测试 (monitor_extension_messages)

- **Background ↔ Content Script 双向消息**：定期消息交换和响应验证
- **Runtime.sendMessage 监控**：测试消息拦截和路径追踪
- **Tabs.sendMessage 追踪**：跨标签页消息传递监控
- **响应关联机制**：验证消息-响应配对和性能分析

### API调用测试 (track_extension_api_calls)

- **Storage API 监控**：Local/Sync storage操作追踪
- **Tabs API 追踪**：标签页创建、查询、消息发送监控
- **Runtime API 监控**：扩展信息获取、Alarm设置追踪
- **性能分析**：API调用耗时、内存使用监控

### Offscreen Document 测试 (get_offscreen_logs)

- **独立 Console 日志**：Offscreen Document 专用日志捕获
- **Canvas 操作测试**：后台 Canvas 渲染和 DataURL 转换
- **Audio 处理测试**：AudioContext 和 Oscillator 创建
- **心跳日志**：每 5 秒自动输出，验证持续运行

### 综合调试场景

- **多级日志输出**：Error、Warn、Info、Log不同级别日志
- **DOM操作监控**：内容脚本DOM变化检测
- **UI交互测试**：Popup和Options页面功能验证
- **存储操作测试**：跨存储类型数据管理

## 🚀 使用方法

### 1. 加载扩展

```bash
# 启动Chrome并加载测试扩展
chrome --load-extension=./enhanced-test-extension --remote-debugging-port=9222
```

### 2. 运行MCP测试

```bash
# 编译项目
npm run build

# 运行Week 3功能测试
node test-week3-message-tracker.js

# 运行综合验证测试
node test-week3-comprehensive-validation.js
```

## 📋 扩展组件

### Background Script (background.js)

- **消息处理器**：处理来自Content Script的各类消息
- **定期测试**：每10秒发送测试消息，每15秒执行API测试
- **Storage测试**：Local/Sync storage操作演示
- **Tabs API测试**：标签页管理和消息发送
- **Runtime API测试**：扩展信息获取和Alarm管理

### Content Script (content.js)

- **消息监听**：接收Background发送的测试消息
- **DOM监控**：实时DOM变化检测和报告
- **性能测试**：定期性能检查和数据收集
- **可视化指示器**：页面右上角测试状态显示

### Popup (popup.html)

- **交互控制台**：手动触发各类测试功能
- **实时状态**：显示扩展信息和消息计数
- **存储管理**：测试和清理扩展存储
- **性能监控**：内存使用和计算性能检查

### Options (options.html)

- **配置管理**：监控间隔、日志级别等设置
- **自定义脚本**：可执行自定义测试代码
- **实时日志**：监控过程的实时日志显示
- **完整测试**：一键启动全面功能验证

### Offscreen Document (offscreen.html)

- **日志测试**：多级别日志输出 (log, info, warn, error, debug)
- **Canvas 测试**：渐变背景、文字绘制、DataURL 转换
- **Audio 测试**：AudioContext 创建、Oscillator 配置
- **UI 界面**：可视化日志显示和交互按钮
- **消息通信**：与 Background 的双向消息传递

## 🔧 测试场景

### 基础功能验证

1. **list_extensions**：检测扩展并获取基础信息
2. **get_extension_logs**：收集Background和Content Script日志
3. **content_script_status**：分析内容脚本注入状态
4. **list_extension_contexts**：枚举扩展的各类上下文
5. **inspect_extension_storage**：检查扩展存储使用情况

### Week 3高级功能验证

1. **monitor_extension_messages**：
   - 监控Runtime messages (Background ↔ Content Script)
   - 监控Tabs messages (跨标签页通信)
   - 追踪消息响应和性能指标

2. **track_extension_api_calls**：
   - Storage API调用监控 (get/set/remove/clear)
   - Tabs API调用追踪 (query/create/remove/sendMessage)
   - Runtime API监控 (getManifest/id/alarms)

3. **get_offscreen_logs**：
   - Offscreen Document 日志捕获
   - Canvas/Audio 操作日志
   - 独立 Console 验证
   - 心跳日志持续监控

### 性能和稳定性验证

- **并发测试**：多个功能并行执行验证
- **内存监控**：扩展运行时内存使用分析
- **错误处理**：异常情况的优雅降级测试

## 📊 预期结果

### 正常工作状态

- ✅ 所有基础功能测试通过 (5/5)
- ✅ Week 3新功能正常工作 (2/2)
- ✅ Offscreen Document 日志捕获正常 (1/1)
- ✅ 监控脚本成功注入到扩展上下文
- ✅ API追踪机制正确包装Chrome API

### 日志输出示例

- **Background日志**：定期消息、API调用、性能指标
- **Content Script日志**：DOM变化、消息处理、状态报告
- **Offscreen Document日志**：Canvas/Audio操作、心跳日志、测试结果
- **MCP监控日志**：脚本注入、消息拦截、API包装

## 🎯 设计价值

这个Enhanced Test Extension体现了Chrome Debug MCP相比Chrome DevTools MCP的独特优势：

1. **扩展专业调试**：针对Chrome扩展开发的专业化调试工具
2. **消息传递监控**：实时分析扩展间通信模式
3. **API性能分析**：Chrome扩展API调用级别的性能洞察
4. **开发体验优化**：为扩展开发者量身定制的调试流程

通过这个测试扩展，开发者可以验证Chrome Debug MCP在扩展调试领域的技术领先性和实用价值。

## 🧪 Offscreen Document 测试

### 快速测试

使用自动化测试脚本：

```bash
./docs/examples/test-offscreen-logs.sh
```

### 手动测试步骤

1. **创建 Offscreen Document**

   ```bash
   # 在 Background 中执行
   globalThis.offscreenAPI.create()
   ```

2. **触发测试日志**

   ```bash
   # 测试普通日志
   globalThis.offscreenAPI.sendMessage({ type: 'test_logs' })

   # 测试错误日志
   globalThis.offscreenAPI.sendMessage({ type: 'test_error' })

   # 测试 Canvas 操作
   globalThis.offscreenAPI.sendMessage({ type: 'test_canvas' })

   # 测试 Audio 操作
   globalThis.offscreenAPI.sendMessage({ type: 'test_audio' })
   ```

3. **获取日志**

   ```bash
   npx @cloudflare/mcp-server-ext-debug get_offscreen_logs \
     --extensionId <EXTENSION_ID>
   ```

4. **清理**
   ```bash
   globalThis.offscreenAPI.close()
   ```

### 详细文档

参见 [Offscreen Logs 测试指南](../docs/guides/TEST_OFFSCREEN_LOGS_GUIDE.md)
