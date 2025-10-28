# Chrome Extension Debug MCP - 工程审查 Prompt

**版本**: 1.0  
**创建日期**: 2025-10-26  
**目的**: 系统化审查项目开发是否符合工程规范、效率、高效、优雅等标准

---

## 📋 审查清单概览

本prompt用于审查 Chrome Extension Debug MCP 项目的开发质量。审查分为7个维度，每个维度包含具体的检查项和评分标准。

### 审查维度

1. **代码设计模式** (30%) - 是否遵循第一性原理和六大设计原则
2. **错误处理规范** (25%) - 业务失败处理是否符合标准
3. **工具开发标准** (15%) - 新工具是否符合模式
4. **架构一致性** (10%) - 代码是否保持统一风格
5. **性能与效率** (10%) - 是否避免过度工程化
6. **文档质量** (5%) - 文档是否清晰完整
7. **测试覆盖** (5%) - 是否有充分测试

---

## 🎯 核心原则

### 第一性原理 ⭐⭐⭐⭐⭐

**工具调用应该永远成功，只有结果可以失败**

```typescript
// ❌ 错误：业务失败抛异常 → MCP崩溃
if (!extension) {
  throw new Error('Extension not found');
}

// ✅ 正确：业务失败返回信息 → AI继续并自动修正
if (!extension) {
  reportExtensionNotFound(response, extensionId, availableExtensions);
  response.setIncludePages(true);
  return; // AI可以继续
}
```

### 六大设计原则

1. **极简主义** - 一行代码能完成的不写两行
2. **防御编程** - 预期错误必须捕获，意外错误继续抛出
3. **参数验证优先** - 在handler开头验证，参数错误立即抛出
4. **职责单一** - 一个工具只做一件事
5. **业务失败不抛异常** - 区分Exception和Failure
6. **明确副作用** - 使用readOnlyHint标记

---

## 1️⃣ 代码设计模式 (30分)

### 1.1 第一性原理遵循度 ⭐⭐⭐⭐⭐

**检查命令**:

```bash
# 检查是否有业务异常未处理
grep -r "throw new Error" src/tools/extension/ | grep -v "Parameter validation" | grep -v "// "
```

**评分标准**:

- **优秀 (27-30分)**: 100%业务失败返回信息，0%抛异常
- **良好 (24-26分)**: >90%符合标准，少数遗留问题
- **及格 (21-23分)**: >70%符合标准，需要改进
- **不及格 (<21分)**: <70%符合标准，大量抛异常

### 1.2 黄金标准 - close_page模式

**参考文件**: `src/tools/pages.ts`

```typescript
// 定义错误常量
const CLOSE_PAGE_ERROR = 'Cannot close the last page';

export const closePage = defineTool({
  handler: async (request, response, context) => {
    try {
      await context.closePage(request.params.pageIdx);
    } catch (err) {
      if (err.message === CLOSE_PAGE_ERROR) {
        // 预期的业务失败 → 返回信息
        response.appendResponseLine(err.message);
      } else {
        // 意外的系统错误 → 继续抛出
        throw err;
      }
    }
    response.setIncludePages(true);
  },
});
```

**检查清单**:

- [ ] 定义错误常量
- [ ] try-catch捕获特定错误
- [ ] 预期错误返回信息
- [ ] 意外错误继续抛出
- [ ] setIncludePages在合适位置

### 1.3 六大原则实施检查

#### 原则1: 极简主义

```typescript
// ✅ 优秀 - 委托给MCP层
handler: async (_request, response) => {
  response.setIncludePages(true);
};

// ❌ 错误 - 手动拼接50+行
handler: async (_request, response) => {
  let output = '# Pages\n';
  for (const page of pages) {
    output += `## Page ${page.index}\n`;
    // ... 50+ lines
  }
};
```

**评分**: handler < 50行(5分), < 100行(3分), > 100行(0分)

#### 原则2: 防御编程

**检查项**:

- [ ] 定义错误常量（如需要）
- [ ] 捕获特定错误（不盲目catch all）
- [ ] 意外错误继续抛出

#### 原则3: 参数验证优先

**标准Handler结构**:

```typescript
handler: async (request, response, context) => {
  // 1️⃣ 参数验证(在开头，抛异常)
  if (conflictingParams) {
    throw new Error('Parameter conflict');
  }

  // 2️⃣ 获取资源(捕获业务失败，返回信息)
  const resource = await getResource();
  if (!resource) {
    reportResourceNotFound(response);
    return;
  }

  // 3️⃣ 执行操作
  await doSomething(resource);

  // 4️⃣ 设置输出
  response.setIncludePages(true);
};
```

**评分**: 完全符合(5分), 基本符合(3分), 不符合(0分)

#### 原则4: 职责单一

**检查项**:

- [ ] 工具名称清晰（动词+名词）
- [ ] 只做一件事
- [ ] 不混合多个职责（如reload_and_clear）

#### 原则5: 业务失败不抛异常

**核心区别**:

- **异常(Exception)**: 调用者无法预期的错误（参数类型错误）
- **失败(Failure)**: 操作未达目标但可预期（资源不存在）

**检查项**:

- [ ] 资源不存在 → 返回信息（不抛异常）
- [ ] 前置条件不满足 → 返回信息+建议
- [ ] 操作超时 → 返回信息
- [ ] 参数错误 → 允许抛异常

#### 原则6: 明确副作用

**检查项**:

- [ ] 所有工具都有readOnlyHint标记
- [ ] 读操作=true, 写操作=false
- [ ] 标记准确无误

---

## 2️⃣ 错误处理规范 (25分)

### 2.1 统一错误处理框架 (10分)

**检查文件**:

- `src/tools/extension/errors.ts` - 错误常量
- `src/tools/utils/ErrorReporting.ts` - 报告函数

**应该存在的常量**:

```typescript
export const EXTENSION_NOT_FOUND = 'EXTENSION_NOT_FOUND';
export const NO_BACKGROUND_CONTEXT = 'NO_BACKGROUND_CONTEXT';
export const RELOAD_TIMEOUT = 'RELOAD_TIMEOUT';
// ... 其他
```

**应该存在的报告函数**:

```typescript
reportExtensionNotFound(response, extensionId, availableExtensions);
reportNoBackgroundContext(response, extensionId);
reportTimeout(response, operationName, elapsed, limit);
```

**评分**:

- 有统一框架(10分)
- 部分使用(5分)
- 无框架(0分)

### 2.2 Catch块简洁性 (8分)

**标准模式** (来自navigate_page_history):

```typescript
try {
  await page.goBack();
} catch {} // 空catch

response.appendResponseLine('Navigation completed');
```

**评分标准**:

- Catch块平均<5行(8分)
- <10行(5分)
- > 10行(0分)

### 2.3 Try块范围最小化 (7分)

**正确示例**:

```typescript
// 获取资源(不需要try-catch)
const extension = await getExtension(id);
if (!extension) {
  reportExtensionNotFound(response, id);
  return;
}

// 只包裹真正危险的操作
try {
  await context.reloadExtension(id);
} catch (err) {
  if (err.message === RELOAD_TIMEOUT) {
    reportTimeout(response, 'Reload', elapsed, limit);
    return;
  }
  throw err;
}
```

**评分**: 只包含必要操作(7分), 包含部分不必要操作(3分), 过大(0分)

---

## 3️⃣ 工具开发标准 (15分)

### 3.1 工具描述规范 (5分)

**长度标准**: 12-20行为最佳

**优秀描述结构**:

```typescript
description: `List all installed Chrome extensions.

**🎯 For AI: START HERE** - First tool for extension debugging.

**Returns**:
- Extension ID (required for ALL other tools)
- Service Worker status: 🟢 Active / 🔴 Inactive

**Typical workflow**:
1. \`list_extensions\` → Get ID and check SW status
2. If 🔴 Inactive → \`activate_extension_service_worker\`
3. Then proceed with other tools

**Related tools**: \`activate_extension_service_worker\``,
```

**必需元素**:

- [ ] 🎯 AI标记
- [ ] 功能说明
- [ ] 典型工作流
- [ ] 相关工具

**评分**: 12-20行且结构完整(5分), 20-30行(3分), >30行或结构不完整(0分)

### 3.2 Handler结构规范 (5分)

**检查项**:

- [ ] 参数验证在开头
- [ ] 逻辑顺序清晰（验证→获取→执行）
- [ ] 无混乱跳转

### 3.3 资源管理 (5分)

**标准**: 需要清理的资源使用try-finally

```typescript
const client = await browser.createCDPSession();
try {
  await client.send('Input.dispatchKeyEvent', {...});
} finally {
  void client.detach(); // 确保释放
}
```

**检查项**:

- [ ] CDP Session使用finally
- [ ] 文件句柄正确关闭
- [ ] 事件监听器正确清理

---

## 4️⃣ 架构一致性 (10分)

### 4.1 代码模式一致性 (7分)

**检查项**:

- [ ] 所有扩展工具遵循原始工具模式
- [ ] 错误处理统一使用ErrorReporting
- [ ] 所有工具有readOnlyHint
- [ ] setIncludePages位置统一

**审查命令**:

```bash
# 检查readOnlyHint
grep -r "defineTool" src/tools/ | wc -l
grep -r "readOnlyHint" src/tools/ | wc -l
# 两个数字应该相等
```

### 4.2 文件组织 (3分)

**标准结构**:

```
src/tools/
├── extension/          # 扩展工具
│   ├── discovery.ts    # 发现类
│   ├── execution.ts    # 执行类
│   ├── contexts.ts     # 上下文类
│   ├── errors.ts       # 错误常量
│   └── index.ts        # 导出
├── utils/
│   └── ErrorReporting.ts
└── ...
```

**检查项**:

- [ ] 按功能分类
- [ ] 文件职责单一
- [ ] 导出统一管理

---

## 5️⃣ 性能与效率 (10分)

### 5.1 避免过度工程化 (4分)

**检查命令**:

```bash
# 检查handler行数分布
find src/tools -name "*.ts" -exec grep -c "handler:" {} \; | sort -rn
```

**评分**: 平均<50行(4分), <100行(2分), >100行(0分)

### 5.2 代码复用 (3分)

**检查项**:

- [ ] 错误处理使用统一函数
- [ ] 日志捕获使用统一函数
- [ ] 常用验证逻辑抽取为helper

### 5.3 智能特性 (3分)

**示例**: reload_extension的缓存策略

```typescript
cacheStrategy: 'auto' | 'force-clear' | 'preserve' | 'disable';
```

**检查项**:

- [ ] 有智能策略（如适用）
- [ ] 提供用户控制
- [ ] 默认值合理

---

## 6️⃣ 文档质量 (5分)

### 6.1 代码注释 (3分)

**好的注释**:

```typescript
// Following close_page pattern: return info instead of throwing
if (!extension) {
  reportExtensionNotFound(response, extensionId);
  return;
}
```

**评分**: 关键逻辑有注释(3分), 部分有(1分), 无注释(0分)

### 6.2 工具文档 (2分)

**必需文档**:

- [ ] 核心工具有使用指南
- [ ] 有架构文档
- [ ] 有故障排查指南

---

## 7️⃣ 测试覆盖 (5分)

### 7.1 单元测试 (3分)

**检查命令**:

```bash
npm test
```

**评分**: >80%覆盖率(3分), >60%(2分), <60%(0分)

### 7.2 集成测试 (2分)

**应该有的测试场景**:

- [ ] 扩展调试完整流程
- [ ] 错误处理场景
- [ ] 边界条件

---

## 📊 综合评分

### 计分规则

| 维度         | 满分    | 得分       |
| ------------ | ------- | ---------- |
| 代码设计模式 | 30      | \_\_\_     |
| 错误处理规范 | 25      | \_\_\_     |
| 工具开发标准 | 15      | \_\_\_     |
| 架构一致性   | 10      | \_\_\_     |
| 性能与效率   | 10      | \_\_\_     |
| 文档质量     | 5       | \_\_\_     |
| 测试覆盖     | 5       | \_\_\_     |
| **总分**     | **100** | **\_\_\_** |

### 等级划分

- **A (90-100)**: 优秀，可作为最佳实践参考
- **B (80-89)**: 良好，符合工程标准
- **C (70-79)**: 及格，需要一些改进
- **D (60-69)**: 不及格，需要重大改进
- **F (<60)**: 严重不合格，需要重写

---

## 🚀 使用方法

### 快速审查（5分钟）

```bash
# 运行自动化检查
./scripts/quick-review.sh src/tools/extension/new-tool.ts

# 核心检查项：
# 1. 业务失败是否抛异常？
# 2. 是否有readOnlyHint？
# 3. handler结构是否清晰？
# 4. 是否使用ErrorReporting？
```

### 完整审查（30分钟）

```bash
# 1. 阅读各个维度的详细检查清单
# 2. 逐项检查代码
# 3. 填写审查报告（使用REVIEW_REPORT_TEMPLATE.md）
# 4. 给出改进建议
```

### 自动化审查

```bash
# 全局审查
./scripts/engineering-review.sh --full

# 增量审查（只审查变更）
./scripts/engineering-review.sh --incremental

# 特定模块审查
./scripts/engineering-review.sh --module extension
```

---

## ✅ 快速自查清单

提交代码前，请确认：

### 必需项（10项全部✅）

- [ ] **业务失败返回信息**，不抛异常
- [ ] **参数验证在handler开头**
- [ ] **使用try-finally清理资源**（CDP Session等）
- [ ] **有readOnlyHint标记**
- [ ] **handler结构清晰**（验证→获取→执行）
- [ ] **catch块简洁**（<5行）
- [ ] **工具描述适中**（12-20行）
- [ ] **有错误常量定义**（如需要）
- [ ] **使用ErrorReporting统一报告**
- [ ] **有单元测试**（核心逻辑）

### 推荐项

- [ ] 有集成测试
- [ ] 有使用文档
- [ ] 代码有关键注释
- [ ] 遵循命名规范

---

## 📈 质量提升路径

### Phase 1: 基础合规（必须）

1. 修复所有业务异常 → 返回信息
2. 添加readOnlyHint标记
3. 使用ErrorReporting统一报告
4. 参数验证移到handler开头

**目标**: C级（70分）

### Phase 2: 模式优化（推荐）

1. 简化catch块（<5行）
2. 最小化try块范围
3. 统一setIncludePages位置
4. 优化工具描述（12-20行）

**目标**: B级（80分）

### Phase 3: 卓越实践（可选）

1. 添加智能缓存策略
2. 完善测试覆盖
3. 编写详细文档
4. 代码注释关键决策

**目标**: A级（90+分）

---

## 🔍 常见问题

### Q1: 什么时候可以抛异常？

**A**: 只有参数验证失败时可以抛异常。业务失败必须返回信息。

```typescript
// ✅ 可以抛异常：参数验证
if (fullPage && uid) {
  throw new Error('fullPage and uid are mutually exclusive');
}

// ❌ 不能抛异常：资源不存在
if (!extension) {
  reportExtensionNotFound(response, extensionId);
  return;
}
```

### Q2: readOnlyHint如何判断？

**A**:

- `true`: 只读操作（list, get, inspect, check）
- `false`: 写操作（reload, clear, activate, switch）

### Q3: 工具描述多长合适？

**A**: 12-20行最佳。包含：🎯AI标记、功能、前置条件、工作流、相关工具。

### Q4: 何时需要try-finally？

**A**: 需要清理的资源：CDP Session、文件句柄、事件监听器。

### Q5: 如何区分Exception和Failure？

**A**:

- **Exception**: 调用者无法预期（参数类型错误）→ 抛异常
- **Failure**: 可预期的失败（资源不存在）→ 返回信息

---

## 📚 参考文档

### 内部文档

- [错误处理修复报告](../archive/error-handling/ERROR_HANDLING_FIX_REPORT.md)
- [第一性原理分析](../TOOL_ERROR_HANDLING_ANALYSIS.md)
- [Phase 4优化完成](../PHASE4_OPTIMIZATION_COMPLETE.md)

### 最佳实践示例

**原始工具**（黄金标准）:

- `src/tools/pages.ts` - close_page模式
- `src/tools/input.ts` - try-finally模式
- `src/tools/navigation.ts` - navigate_page_history模式

**扩展工具**（优化后）:

- `src/tools/extension/execution.ts` - reload_extension
- `src/tools/extension/discovery.ts` - list_extensions
- `src/tools/extension/runtime-errors.ts` - get_extension_runtime_errors

---

## 🎓 学习路径

### 新手（0-1周）

1. 阅读[第一性原理分析](../TOOL_ERROR_HANDLING_ANALYSIS.md)
2. 学习close_page模式（`src/tools/pages.ts`）
3. 对比原始工具vs扩展工具
4. 完成第一个PR

### 进阶（1-2周）

1. 理解六大设计原则
2. 掌握ErrorReporting使用
3. 学习资源管理（try-finally）
4. 优化现有工具

### 专家（2周+）

1. 设计新工具
2. 编写最佳实践文档
3. Code Review其他PR
4. 提出架构改进

---

## 📞 反馈

如果本prompt有不清楚或需要改进的地方，请：

1. 提交Issue：描述问题和建议
2. 提交PR：直接改进文档
3. 讨论区：与团队讨论

---

**版本历史**:

- v1.0 (2025-10-26): 初始版本，基于Phase 1-4优化经验总结

**维护者**: AI Assistant + Community
