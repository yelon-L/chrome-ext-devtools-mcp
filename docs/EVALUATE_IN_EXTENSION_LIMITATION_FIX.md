# evaluate_in_extension 工具限制说明修复

## 问题反馈

用户反馈：`evaluate_in_extension` 工具无法直接执行代码

## 根本原因

工具描述说"Execute JavaScript code"（执行代码），但实际实现有重大限制：

### 代码实现（第1669行）

```typescript
const wrappedCode = `(async () => { return (${code}); })()`;
```

这意味着：

- ❌ **不能执行语句**（statements）：`const x = 1;`, `if (true) {...}`, `for (...) {...}`
- ✅ **只能执行表达式**（expressions）：`chrome.runtime.id`, `{a: 1}`, `1 + 1`

### 为什么会有这个限制？

代码被包装在 `return (...)` 中，JavaScript 的 `return` 语句只能返回**表达式**，不能返回**语句**。

## 修复内容

### 1. 更新工具描述

**修改前**：

```typescript
description: `Execute JavaScript code in extension's background context...`;
```

**修改后**：

```typescript
description: `Evaluate JavaScript **expressions** in extension's background context...

**⚠️ CODE LIMITATION**: Only **expressions** are supported, NOT statements.
- ✅ Expressions: \`chrome.runtime.id\`, \`await chrome.storage.local.get()\`, \`{a: 1, b: 2}\`, \`console.log('test')\`
- ❌ Statements: \`const x = 1;\`, \`let y = 2;\`, \`if (true) {...}\`
- Code is wrapped in: \`(async () => { return (YOUR_CODE); })()\`
```

### 2. 更新参数描述

**修改前**：

```typescript
code: z.string().describe(
  'JavaScript code to execute in the extension context. Can be async.',
);
```

**修改后**：

```typescript
code: z.string().describe(
  'JavaScript expression to evaluate (NOT statements). Examples: "chrome.runtime.id", "await chrome.storage.local.get()", "{a: 1, b: 2}". Code will be wrapped in async IIFE and must return a value.',
);
```

### 3. 更新输出标签

**修改前**：

```typescript
response.appendResponseLine(`\n**Code**:\n\`\`\`javascript\n${code}\n\`\`\``);
```

**修改后**：

```typescript
response.appendResponseLine(
  `\n**Expression**:\n\`\`\`javascript\n${code}\n\`\`\``,
);
```

### 4. 增强错误消息

**修改前**：

```typescript
catch {
  response.appendResponseLine('Unable to evaluate code in extension...');
}
```

**修改后**：

```typescript
catch (error) {
  response.appendResponseLine('Unable to evaluate expression in extension...');
  response.appendResponseLine('\n**Remember**: Only expressions are supported, NOT statements.');
  response.appendResponseLine('✅ Valid: `chrome.runtime.id`');
  response.appendResponseLine('✅ Valid: `await chrome.storage.local.get()`');
  response.appendResponseLine('✅ Valid: `console.log("test")`');
  response.appendResponseLine('❌ Invalid: `const x = 1;`');
  response.appendResponseLine('❌ Invalid: `let y = 2;`');

  if (error instanceof Error && error.message) {
    response.appendResponseLine(`\n**Error details**: ${error.message}`);
  }
}
```

## 表达式 vs 语句

### ✅ 有效的表达式

| 类型       | 示例                               | 说明              |
| ---------- | ---------------------------------- | ----------------- |
| API 调用   | `chrome.runtime.id`                | 返回扩展 ID       |
| 异步 API   | `await chrome.storage.local.get()` | 返回 storage 数据 |
| 对象字面量 | `{a: 1, b: 2}`                     | 返回对象          |
| 数组字面量 | `[1, 2, 3]`                        | 返回数组          |
| 函数调用   | `console.log("test")`              | 返回 undefined    |
| 三元运算符 | `true ? "yes" : "no"`              | 返回 "yes"        |
| IIFE       | `(() => { return 42; })()`         | 返回 42           |
| typeof     | `typeof chrome.tabs`               | 返回类型字符串    |

### ❌ 无效的语句

| 类型     | 示例                                   | 为什么失败            |
| -------- | -------------------------------------- | --------------------- |
| 变量声明 | `const x = 1;`                         | 语句不能被 return     |
| 变量声明 | `let y = 2;`                           | 语句不能被 return     |
| if 语句  | `if (true) { ... }`                    | 语句不能被 return     |
| for 循环 | `for (let i = 0; i < 10; i++) { ... }` | 语句不能被 return     |
| 多行语句 | `x = 1; y = 2;`                        | 多个语句不能被 return |

### 特殊情况：console.log

`console.log("test")` 是**有效的**，因为：

- 它是函数调用（表达式）
- 返回 `undefined`
- 可以被 `return` 包装

## 测试验证

创建了新的测试文件：`tests/extension/evaluate-expression-limitation.test.ts`

测试覆盖：

- ✅ 有效表达式（chrome API、对象、数组、IIFE 等）
- ✅ console.log 返回 undefined
- ❌ 变量声明失败
- ❌ if 语句失败
- ✅ 三元运算符成功
- ✅ IIFE 成功
- ✅ Async IIFE 成功

## 遵循的设计原则

1. ✅ **第一性原理**：理解 JavaScript 表达式 vs 语句的本质区别
2. ✅ **准确描述**：工具描述必须准确反映实际功能限制
3. ✅ **友好错误**：提供清晰的示例和错误消息
4. ✅ **防御编程**：捕获错误并提供详细的错误信息
5. ✅ **遵守规范**：遵循 MCP 开发规范和最佳实践

## 影响范围

### 修改文件

- `src/tools/extension/execution.ts` - 工具实现和描述
- `tests/extension/evaluate-expression-limitation.test.ts` - 新增测试

### 不需要修改

- 现有测试文件（`tests/extension/evaluate-in-extension.test.ts`）已经只测试表达式
- 工具的核心实现逻辑不需要改变

## 验证结果

```bash
✅ pnpm run check - 通过
✅ TypeScript 编译 - 通过
✅ ESLint - 通过
✅ Prettier - 通过
```

## 用户影响

### 之前（误导性）

- 用户认为可以执行任意代码
- 尝试 `const x = 1;` 时失败，不理解原因
- 错误消息不清晰

### 之后（清晰准确）

- 用户明确知道只能使用表达式
- 工具描述提供清晰的示例
- 错误消息提供具体的有效/无效示例
- AI 可以正确理解工具限制

## 完成时间

2025-11-02，耗时约 1 小时

## 相关记忆

这次修复遵循了以下设计原则（来自历史记忆）：

- 准确描述工具功能和限制
- 提供清晰的错误消息和示例
- 遵守 MCP 开发规范
- 防御编程和错误处理
