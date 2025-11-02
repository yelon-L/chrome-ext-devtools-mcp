# Phase 4: 手动测试步骤

## 前提条件

需要在 Chrome 浏览器中手动加载测试扩展，因为无法通过命令行自动加载。

## 步骤 1: 手动加载测试扩展

1. 打开 Chrome 浏览器（连接到 9222 端口的实例）
2. 访问 `chrome://extensions/`
3. 启用"开发者模式"
4. 点击"加载已解压的扩展程序"
5. 选择目录: `/home/p/workspace/chrome-ext-devtools-mcp/test-extension-enhanced`
6. 确认扩展已加载，记录扩展 ID

## 步骤 2: 验证扩展加载

```bash
# 检查扩展是否出现在 CDP 中
curl -s http://localhost:9222/json | jq -r '.[] | select(.url | contains("chrome-extension://")) | .title' | grep "Enhanced MCP Debug Test"
```

## 步骤 3: 运行自动化测试

```bash
# 运行 MCP 客户端测试
node test-extension-tools-mcp.mjs
```

## 测试工具列表

测试将覆盖以下 16 个扩展工具：

1. **list_extensions** - 列出所有扩展
2. **get_extension_details** - 获取扩展详情
3. **activate_extension_service_worker** - 激活 Service Worker
4. **list_extension_contexts** - 列出扩展上下文
5. **get_background_logs** - 获取 background 日志
6. **get_offscreen_logs** - 获取 offscreen 日志
7. **get_extension_runtime_errors** - 获取运行时错误
8. **inspect_extension_storage** - 检查扩展存储
9. **check_content_script_injection** - 检查内容脚本
10. **evaluate_in_extension** - 执行代码
11. **open_extension_popup** - 打开 popup
12. **is_popup_open** - 检查 popup 状态
13. **get_popup_info** - 获取 popup 信息
14. **close_popup** - 关闭 popup
15. **reload_extension** - 重载扩展
16. **clear_extension_errors** - 清除扩展错误

## 预期结果

- 所有工具应该成功执行
- 成功率应该达到 100%
- 每个工具的响应时间应该在合理范围内（< 5秒）

## 问题排查

### 问题 1: 扩展未加载

**症状**: `list_extensions` 找不到测试扩展

**解决**:

1. 检查扩展是否在 `chrome://extensions/` 中
2. 确认扩展已启用
3. 重新加载扩展

### 问题 2: Service Worker 未激活

**症状**: `activate_extension_service_worker` 失败

**解决**:

1. 在 `chrome://extensions/` 中点击"Service Worker"链接
2. 检查 Service Worker 状态
3. 手动激活 Service Worker

### 问题 3: Popup 测试失败

**症状**: `open_extension_popup` 或相关工具失败

**解决**:

1. 确认扩展有 popup 配置
2. 检查 manifest.json 中的 `action.default_popup`
3. 尝试手动点击扩展图标打开 popup

## 测试环境

- **浏览器**: Chrome 141.0.7390.107
- **调试端口**: 9222
- **MCP 服务器**: v0.9.19
- **测试扩展**: Enhanced MCP Debug Test Extension v2.3.0

## 自动化限制

由于环境限制（无头服务器，无 X server），无法自动化以下操作：

1. ❌ 自动启动 Chrome 并加载扩展
2. ❌ 自动打开 `chrome://extensions/`
3. ❌ 自动点击 UI 元素

需要手动执行这些步骤后，才能运行自动化测试脚本。

## 替代方案

如果无法手动操作浏览器，可以考虑：

1. **使用已有扩展**: 测试浏览器中已安装的其他扩展
2. **远程桌面**: 通过 VNC 或 RDP 访问服务器的图形界面
3. **本地测试**: 在本地机器上运行测试

---

**文档版本**: v1.0  
**创建日期**: 2025-10-29  
**最后更新**: 2025-10-29  
**状态**: 等待手动加载测试扩展
