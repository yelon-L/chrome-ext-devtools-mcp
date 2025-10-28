# 参数验证强化 - 完成总结

## ✅ 已实现的功能

### 1. 友好的错误提示系统

创建了完整的参数验证器（`src/utils/paramValidator.ts`），提供：

- ❌ **错误消息** - 阻止启动，必须修正
- ⚠️ **警告消息** - 显示但继续运行
- 💡 **解决方案** - 提供具体的修正命令

---

## 📋 验证规则

### 规则 1: 浏览器来源互斥 ❌

**检测**:

```bash
❌ --browserUrl + --channel
❌ --browserUrl + --executablePath
❌ --channel + --executablePath
```

**示例错误**:

```bash
$ chrome-extension-debug-mcp --browserUrl http://localhost:9222 --channel canary

❌ 配置冲突

不能同时使用以下选项：
  --browserUrl
  --channel

原因：
  --browserUrl      用于连接现有的浏览器
  --channel         用于启动指定渠道的新浏览器

解决方案（选择其一）：

  方案1: 连接现有浏览器
    $ chrome-extension-debug-mcp --browserUrl http://localhost:9222

  方案2: 启动Chrome Stable
    $ chrome-extension-debug-mcp

  方案3: 启动Chrome Canary
    $ chrome-extension-debug-mcp --channel canary
```

---

### 规则 2: stdio 模式不需要端口 ⚠️

**检测**:

```bash
⚠️ --transport stdio (默认) + --port
```

**示例警告**:

```bash
$ chrome-extension-debug-mcp --port 3000

⚠️  配置警告

当前配置：
  --transport stdio (默认)
  --port 3000

问题：
  stdio 模式不需要 --port 参数

说明：
  stdio 使用标准输入输出进行通信，不是HTTP服务器。
  --port 参数仅在 HTTP 传输模式下有效。

建议（选择其一）：

  方案1: 使用 stdio 模式（移除 --port）
    $ chrome-extension-debug-mcp

  方案2: 使用 SSE 模式
    $ chrome-extension-debug-mcp --transport sse --port 3000

  方案3: 使用 Streamable HTTP 模式
    $ chrome-extension-debug-mcp --transport streamable --port 3000
```

---

### 规则 3: browserUrl 时浏览器控制选项无效 ⚠️

**检测**:

```bash
⚠️ --browserUrl + --headless
⚠️ --browserUrl + --isolated
⚠️ --browserUrl + --viewport
⚠️ --browserUrl + --proxyServer
⚠️ --browserUrl + --chromeArg
⚠️ --browserUrl + --acceptInsecureCerts
```

**示例警告**:

```bash
$ chrome-extension-debug-mcp --browserUrl http://localhost:9222 --headless --isolated

⚠️  配置警告

当前配置：
  --browserUrl http://localhost:9222
  --headless
  --isolated

问题：
  使用 --browserUrl 连接现有浏览器时，
  以下选项将被忽略：

  --headless
  --isolated

说明：
  这些选项仅在启动新浏览器时有效。
  连接到现有浏览器时，浏览器已经在运行，
  无法更改这些启动参数。

建议：

  方案1: 仅连接现有浏览器（移除无效选项）
    $ chrome-extension-debug-mcp --browserUrl http://localhost:9222

  方案2: 启动新浏览器（移除 --browserUrl）
    $ chrome-extension-debug-mcp --headless --isolated
```

---

### 规则 4: 端口范围验证 ❌/⚠️

**检测**:

```bash
❌ 端口 < 1 或 > 65535
⚠️ 端口 < 1024（保留端口）
```

**示例错误**:

```bash
$ chrome-extension-debug-mcp --transport sse --port 99999

❌ 无效的端口号

当前配置：
  --port 99999

问题：
  端口号必须在 1-65535 之间

建议：
  使用常见端口：
    32122  - SSE 模式默认端口
    32123  - Streamable HTTP 模式默认端口
    3000   - 常用开发端口
    8080   - 常用服务端口
```

---

### 规则 5: headless 模式 viewport 限制 ⚠️

**检测**:

```bash
⚠️ --headless + --viewport 超过 3840x2160
```

**示例警告**:

```bash
$ chrome-extension-debug-mcp --headless --viewport 5000x3000

⚠️  viewport 超出限制

当前配置：
  --headless
  --viewport 5000x3000

问题：
  headless 模式下，viewport 最大为 3840x2160
  当前设置超出限制

建议：
  调整 viewport 大小：
    $ chrome-extension-debug-mcp --headless --viewport 1920x1080
    $ chrome-extension-debug-mcp --headless --viewport 2560x1440
    $ chrome-extension-debug-mcp --headless --viewport 3840x2160
```

---

## 🎯 设计原则

### 1. 清晰说明问题

- 显示当前配置
- 指出具体问题

### 2. 解释原因

- 为什么这是问题
- 背后的技术原因

### 3. 提供解决方案

- 给出多个方案
- 提供完整的命令示例

### 4. 使用友好的格式

- ❌ 红色 - 严重错误
- ⚠️ 黄色 - 警告
- ✅ 绿色 - 建议
- 📋 蓝色 - 说明

### 5. 分级处理

- **错误（❌）**: 阻止启动，必须修正
- **警告（⚠️）**: 显示提示，但继续运行
- **提示（💡）**: 优化建议

---

## 📁 相关文件

### 新增文件

1. **`src/utils/paramValidator.ts`** - 参数验证器实现
2. **`PARAMETER_RELATIONSHIPS.md`** - 参数关系文档
3. **`PARAM_VALIDATION_SUMMARY.md`** - 本文档

### 修改文件

1. **`src/cli.ts`** - 集成验证器
   - 导入 `ParameterValidator`
   - 在解析后执行验证
   - 显示验证结果

---

## 🧪 测试结果

### 测试 1: 浏览器来源冲突 ✅

```bash
$ node build/src/index.js --browserUrl http://localhost:9222 --channel canary
# 结果: ❌ 显示友好错误，阻止启动
```

### 测试 2: stdio + port 警告 ✅

```bash
$ node build/src/index.js --port 3000
# 结果: ⚠️ 显示警告，继续运行
```

### 测试 3: browserUrl + headless 警告 ✅

```bash
$ node build/src/index.js --browserUrl http://localhost:9222 --headless
# 结果: ⚠️ 显示警告，继续运行
```

### 测试 4: 无效端口 ✅

```bash
$ node build/src/index.js --transport sse --port 99999
# 结果: ❌ 显示友好错误，阻止启动
```

### 测试 5: 正确配置 ✅

```bash
$ node build/src/index.js --browserUrl http://localhost:9222
# 结果: 无错误或警告，正常启动
```

---

## 💡 使用示例

### 场景 1: 新用户不熟悉参数

**错误配置**:

```bash
$ chrome-extension-debug-mcp --browserUrl http://localhost:9222 --channel canary
```

**结果**:

- 显示清晰的错误消息
- 解释为什么不能同时使用
- 提供4个可选方案
- 用户快速学习正确用法

### 场景 2: 忘记 stdio 不需要端口

**配置**:

```bash
$ chrome-extension-debug-mcp --port 3000
```

**结果**:

- 显示警告（不阻止启动）
- 解释 stdio 的工作原理
- 建议改用 SSE 或 Streamable
- 用户理解不同模式的差异

### 场景 3: 配置参数但连接现有浏览器

**配置**:

```bash
$ chrome-extension-debug-mcp --browserUrl http://localhost:9222 --headless --isolated
```

**结果**:

- 显示警告（不阻止启动）
- 说明这些参数会被忽略
- 解释原因
- 建议移除无效参数

---

## 📊 统计

- **验证规则数**: 5个
- **错误检查**: 2个（浏览器来源冲突、端口范围）
- **警告检查**: 3个（stdio+port、browserUrl+控制选项、headless+viewport）
- **代码行数**: ~350行
- **测试场景**: 5个

---

## 🚀 下一步增强建议

### 可选增强

1. **配置文件验证**
   - 验证 JSON 配置文件格式
   - 检查 Multi-tenant 环境变量

2. **运行时验证**
   - 检查端口是否被占用
   - 验证 Chrome 是否可访问

3. **自动修复建议**
   - `--fix` 参数自动修正配置
   - 交互式配置向导

4. **配置模板**
   - 常见场景的配置模板
   - `--preset dev|test|prod`

---

## 相关文档

- [PARAMETER_RELATIONSHIPS.md](./PARAMETER_RELATIONSHIPS.md) - 参数关系图
- [CONFIG_COMPATIBILITY.md](./CONFIG_COMPATIBILITY.md) - 配置兼容性指南
- [README.md](./README.md) - 主文档

---

## ✅ 完成状态

- ✅ 参数关系梳理
- ✅ 验证器实现
- ✅ CLI 集成
- ✅ 友好错误消息
- ✅ 测试验证
- ✅ 文档完善

**任务完成！** 参数验证强化已全面实现，提供友好的错误提示和解决方案。
