# evaluate_in_extension 工具限制修复总结

## 问题
用户反馈：`evaluate_in_extension` 工具无法直接执行代码

## 根本原因
工具描述说"Execute code"，但实际只能执行**表达式**，不能执行**语句**。

代码实现（第1669行）：
```typescript
const wrappedCode = `(async () => { return (${code}); })()`;
```

`return (...)` 只能返回表达式，不能返回语句。

## 修复内容

### 1. 工具描述
- ❌ 修改前：`Execute JavaScript code`
- ✅ 修改后：`Evaluate JavaScript **expressions**`
- ➕ 添加：`⚠️ CODE LIMITATION` 警告和示例

### 2. 参数描述
- ❌ 修改前：`JavaScript code to execute`
- ✅ 修改后：`JavaScript expression to evaluate (NOT statements)`

### 3. 输出标签
- ❌ 修改前：`**Code**:`
- ✅ 修改后：`**Expression**:`

### 4. 错误消息
- ➕ 添加：表达式 vs 语句的清晰示例
- ➕ 添加：有效/无效代码示例

### 5. README
- 更新英文版：`Evaluate expressions (not statements)`
- 更新中文版：`执行表达式（非语句）`

## 表达式 vs 语句

### ✅ 有效表达式
- `chrome.runtime.id`
- `await chrome.storage.local.get()`
- `{a: 1, b: 2}`
- `console.log("test")` // 返回 undefined
- `true ? "yes" : "no"`

### ❌ 无效语句
- `const x = 1;`
- `let y = 2;`
- `if (true) { ... }`
- `for (let i = 0; i < 10; i++) { ... }`

## 验证结果

```bash
✅ pnpm run check - 通过
✅ TypeScript 编译 - 通过
✅ ESLint - 通过
✅ Prettier - 通过
```

## 修改文件

1. `src/tools/extension/execution.ts` - 工具实现
2. `tests/extension/evaluate-expression-limitation.test.ts` - 新增测试
3. `README.md` - 英文文档
4. `README.zh-CN.md` - 中文文档
5. `docs/EVALUATE_IN_EXTENSION_LIMITATION_FIX.md` - 详细文档

## 影响

### 用户体验改善
- ✅ 工具描述准确反映实际功能
- ✅ 清晰的限制说明和示例
- ✅ 友好的错误消息
- ✅ AI 可以正确理解工具限制

### 无破坏性变更
- ✅ 核心实现逻辑未改变
- ✅ 现有测试无需修改
- ✅ 向后兼容

## 完成时间
2025-11-02
