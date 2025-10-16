# 错误详细程度配置指南

## 概述

Chrome Extension Debug MCP支持配置错误消息的详细程度，以适应不同的使用场景：

- **开发阶段**：显示完整技术细节（stack trace、错误类型等），帮助快速定位问题
- **生产部署**：仅显示用户友好消息，避免暴露技术细节

---

## 配置方式

### 环境变量

通过 `ERROR_VERBOSITY` 环境变量控制：

```bash
# 最小（生产环境）
ERROR_VERBOSITY=minimal npm start

# 标准（显示错误类型）
ERROR_VERBOSITY=standard npm start

# 详细（开发环境，显示stack trace）
ERROR_VERBOSITY=verbose npm start
```

### .env 文件

创建 `.env` 文件：

```env
# 开发环境配置
NODE_ENV=development
ERROR_VERBOSITY=verbose

# 或生产环境配置
# NODE_ENV=production
# ERROR_VERBOSITY=minimal
```

---

## 详细程度级别

### MINIMAL（最小）

**适用场景**：生产环境、面向最终用户

**显示内容**：
- ✅ 用户友好的错误消息
- ❌ 不显示技术细节
- ❌ 不显示stack trace

**示例输出**：
```
Unable to reload extension. The operation failed or timed out.
```

---

### STANDARD（标准）

**适用场景**：测试环境、内部使用

**显示内容**：
- ✅ 用户友好的错误消息
- ✅ 错误类型（Error name）
- ❌ 不显示stack trace

**示例输出**：
```
Unable to reload extension. The operation failed or timed out.

**Error Type**: TimeoutError
```

---

### VERBOSE（详细）

**适用场景**：开发环境、调试阶段

**显示内容**：
- ✅ 用户友好的错误消息
- ✅ 错误类型
- ✅ 技术错误消息
- ✅ 上下文信息
- ✅ 完整stack trace

**示例输出**：
```
Unable to reload extension. The operation failed or timed out.

**Error Type**: TimeoutError
**Technical Message**: Operation timeout after 30000ms (limit: 30000ms)

**Context**:
- extensionId: "abcdefghijklmnopqrstuvwxyz123456"
- timeout: 30000
- elapsed: 30042

**Stack Trace**:
```
Error: Operation timeout after 30000ms
    at checkTimeout (/path/to/file.ts:120:15)
    at Timeout._onTimeout (/path/to/file.ts:125:9)
    ...
```
```

---

## 默认行为

### 开发环境（默认）

```bash
# 自动使用 VERBOSE
npm run dev
```

### 生产环境

```bash
# 自动使用 MINIMAL
NODE_ENV=production npm start
```

---

## 在代码中使用

### 使用通用错误报告

```typescript
import {reportGenericError} from './tools/utils/ErrorReporting.js';

try {
  await someOperation();
} catch (error) {
  reportGenericError(
    response,
    error,
    'reload extension',  // 操作名称
    {  // 可选的上下文信息
      extensionId,
      timeout: TIMEOUT_MS,
      elapsed: Date.now() - startTime
    }
  );
}
```

### 检查当前模式

```typescript
import {isDevelopmentMode, isProductionMode} from '../config/ErrorVerbosity.js';

if (isDevelopmentMode()) {
  console.log('Running in development mode with verbose errors');
}

if (isProductionMode()) {
  console.log('Running in production mode with minimal errors');
}
```

### 运行时修改配置

```typescript
import {errorVerbosityConfig, ErrorVerbosity} from '../config/ErrorVerbosity.js';

// 临时切换到详细模式
errorVerbosityConfig.setVerbosity(ErrorVerbosity.VERBOSE);

// 执行需要详细日志的操作
await debugOperation();

// 恢复到最小模式
errorVerbosityConfig.setVerbosity(ErrorVerbosity.MINIMAL);
```

---

## 最佳实践

### 1. 开发阶段

**推荐配置**:
```env
NODE_ENV=development
ERROR_VERBOSITY=verbose
```

**优势**:
- 快速定位问题
- 完整的调试信息
- 看到所有技术细节

### 2. 测试环境

**推荐配置**:
```env
NODE_ENV=test
ERROR_VERBOSITY=standard
```

**优势**:
- 平衡可读性和信息量
- 不会过于冗长

### 3. 生产部署

**推荐配置**:
```env
NODE_ENV=production
ERROR_VERBOSITY=minimal
```

**优势**:
- 用户友好
- 不暴露技术实现细节
- 更安全

### 4. 用户支持调试

当用户报告问题时，可以要求他们临时启用详细模式：

```bash
# 让用户运行这个命令获取详细日志
ERROR_VERBOSITY=verbose npm start
```

然后发送完整的错误信息用于分析。

---

## 安全考虑

### ⚠️ 生产环境注意事项

1. **不要在生产环境使用VERBOSE模式**
   - Stack trace可能暴露文件路径
   - 错误消息可能包含敏感信息
   - 增加响应大小

2. **敏感信息脱敏**
   - 即使在VERBOSE模式，也不应该记录密码、token等
   - 上下文信息应该经过筛选

3. **日志分离**
   - 详细的技术日志应该记录到console（开发者可见）
   - 用户可见的消息应该简洁友好

---

## 故障排查

### 问题：看不到stack trace

**检查**:
1. `ERROR_VERBOSITY` 是否设置为 `verbose`
2. `NODE_ENV` 是否不是 `production`
3. 错误是否真的是Error对象（不是字符串）

**解决**:
```bash
ERROR_VERBOSITY=verbose npm run dev
```

### 问题：生产环境显示了太多技术细节

**检查**:
1. `NODE_ENV` 是否设置为 `production`
2. `ERROR_VERBOSITY` 是否被错误设置为 `verbose`

**解决**:
```bash
NODE_ENV=production npm start
```

---

## 示例场景

### 场景1：开发新功能

```bash
# 启用详细错误信息
ERROR_VERBOSITY=verbose npm run dev

# 看到完整的stack trace和上下文
# 快速定位bug
```

### 场景2：发布到生产

```bash
# 构建生产版本
NODE_ENV=production npm run build

# 启动生产服务
NODE_ENV=production npm start

# 用户只看到友好消息，不会看到技术细节
```

### 场景3：用户报告bug

```bash
# 要求用户临时启用详细模式
ERROR_VERBOSITY=verbose npm start

# 获取完整错误信息
# 分析问题后恢复正常模式
```

---

## 总结

**关键原则**：
- ✅ 开发阶段：**技术细节帮助调试** → VERBOSE
- ✅ 生产部署：**用户友好优先** → MINIMAL
- ✅ 根据场景灵活配置
- ✅ 安全第一，不暴露敏感信息

**默认值设计**：
- 智能检测环境（NODE_ENV）
- 开发环境自动启用详细模式
- 生产环境自动使用最小模式
- 可以手动覆盖

