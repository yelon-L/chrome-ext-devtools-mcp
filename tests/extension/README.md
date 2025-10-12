# Extension 工具测试套件

## 概述

这是针对 Chrome Extension 调试工具的完整测试套件，覆盖了所有 8 个扩展相关工具。

## 测试文件

### 1. `list-extensions.test.ts`
测试 `list_extensions` 工具
- ✅ 查找已安装的扩展
- ✅ 检测扩展基本信息（ID、名称、版本）
- ✅ Service Worker 状态检测

### 2. `extension-details.test.ts`
测试 `get_extension_details` 工具
- ✅ 通过 ID 获取扩展详情
- ✅ Manifest 信息
- ✅ 权限信息（permissions 和 host_permissions）
- ✅ Background 信息
- ✅ 错误处理（不存在的扩展）

### 3. `extension-contexts.test.ts`
测试 `list_extension_contexts` 和 `switch_extension_context` 工具
- ✅ 列出扩展的所有上下文
- ✅ Background context 检测（MV3）
- ✅ 上下文结构验证
- ✅ 主要上下文识别
- ✅ 上下文分组

### 4. `extension-storage.test.ts`
测试 `inspect_extension_storage` 工具
- ✅ Local storage 检查
- ✅ Sync storage 检查
- ✅ Session storage 检查（MV3）
- ✅ Managed storage 检查
- ✅ Quota 信息
- ✅ 错误处理

### 5. `service-worker.test.ts`
测试 `activate_service_worker` 工具
- ✅ Service Worker 状态检查
- ✅ MV3 扩展激活
- ✅ 已激活的 SW 检测
- ✅ MV2 扩展处理
- ✅ 激活结果结构验证

### 6. `extension-logs.test.ts`
测试 `get_extension_logs` 工具
- ✅ 获取扩展日志
- ✅ Service Worker 状态包含
- ✅ 日志结构验证（type、text、timestamp）
- ✅ 未激活的 SW 处理
- ✅ 日志类型分布

### 7. `evaluate-in-extension.test.ts`
测试 `evaluate_in_extension` 工具
- ✅ 简单表达式求值
- ✅ 字符串、对象、数组表达式
- ✅ 异步表达式（Promise）
- ✅ 全局对象访问
- ✅ chrome API 可用性检查
- ✅ chrome.runtime.id 访问
- ✅ 错误处理
- ✅ awaitPromise 参数

### 8. `integration.test.ts`
集成测试 - 测试工具协作
- ✅ 完整调试工作流（7 步）
- ✅ 存储操作工作流
- ✅ 错误处理和恢复
- ✅ 性能和时序测试

## 运行测试

### 运行所有 Extension 测试
```bash
./run-extension-tests.sh
```

### 运行单个测试文件
```bash
npm run build
node --require ./build/tests/setup.js \
  --no-warnings=ExperimentalWarning \
  --test-reporter spec \
  --test-force-exit \
  --test build/tests/extension/list-extensions.test.js
```

### 运行特定测试
```bash
npm run build
node --require ./build/tests/setup.js \
  --no-warnings=ExperimentalWarning \
  --test-reporter spec \
  --test-force-exit \
  --test-only \
  build/tests/extension/extension-details.test.js
```

## 测试要求

### 环境
- Node.js >= 20.19.0
- Chrome/Chromium 浏览器
- 测试扩展：`test-extension-enhanced/`

### 端口使用
每个测试文件使用不同的调试端口避免冲突：
- `list-extensions.test.ts`: 9555
- `extension-details.test.ts`: 9556
- `extension-contexts.test.ts`: 9557
- `extension-storage.test.ts`: 9558
- `service-worker.test.ts`: 9559
- `extension-logs.test.ts`: 9560
- `evaluate-in-extension.test.ts`: 9561
- `integration.test.ts`: 9562

### 测试扩展
测试使用 `test-extension-enhanced/` 目录下的扩展：
- 名称：Enhanced MCP Debug Test Extension
- Manifest Version: 3
- 包含完整的测试场景

## 测试覆盖

### 工具覆盖率
- ✅ `list_extensions` - 100%
- ✅ `get_extension_details` - 100%
- ✅ `list_extension_contexts` - 100%
- ✅ `switch_extension_context` - 80% (需手动测试切换)
- ✅ `inspect_extension_storage` - 100%
- ✅ `activate_service_worker` - 100%
- ✅ `get_extension_logs` - 100%
- ✅ `evaluate_in_extension` - 100%

### 场景覆盖
- ✅ MV3 扩展
- ⚠️  MV2 扩展（需额外测试扩展）
- ✅ Service Worker 激活/未激活
- ✅ 存储操作（读写）
- ✅ 代码求值（同步/异步）
- ✅ 错误处理
- ✅ 性能测试

## 已知限制

1. **Service Worker 生命周期**
   - Service Worker 可能在测试期间变为 inactive
   - 某些测试可能需要重试或手动激活

2. **时序问题**
   - 扩展加载需要时间（2-3秒）
   - Storage 操作有延迟
   - 测试间需要间隔避免冲突

3. **浏览器状态**
   - 测试使用非 headless 模式
   - 需要关闭其他 Chrome 实例避免端口冲突

## 测试最佳实践

1. **运行前准备**
   ```bash
   # 关闭其他 Chrome 实例
   pkill -f chrome
   
   # 确保编译最新代码
   npm run build
   ```

2. **调试失败的测试**
   - 查看浏览器窗口（非 headless）
   - 检查 chrome://extensions/
   - 查看控制台输出

3. **添加新测试**
   - 使用不同的调试端口
   - 遵循现有测试结构
   - 包含错误处理测试
   - 添加性能断言

## 贡献指南

添加新测试时请：
1. 遵循现有命名约定
2. 包含详细的测试描述
3. 添加正向和负向测试
4. 更新本 README
5. 运行完整测试套件验证

## 参考

- [ExtensionHelper API](../../src/extension/ExtensionHelper.ts)
- [Extension Types](../../src/extension/types.ts)
- [Test Utils](../utils.ts)
