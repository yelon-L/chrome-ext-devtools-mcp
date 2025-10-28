# extensions.ts 拆分计划

## 📊 当前文件分析

**总行数**: 742 行  
**工具数量**: 8 个

### 工具行数分布

| 工具名称                  | 行数范围 | 行数 | 复杂度   |
| ------------------------- | -------- | ---- | -------- |
| `listExtensions`          | 12-99    | 88   | 中等     |
| `getExtensionDetails`     | 100-182  | 83   | 中等     |
| `listExtensionContexts`   | 183-260  | 78   | 中等     |
| `switchExtensionContext`  | 261-333  | 73   | 中等     |
| `inspectExtensionStorage` | 334-405  | 72   | 中等     |
| `reloadExtension`         | 406-469  | 64   | 简单     |
| `getExtensionLogs`        | 470-663  | 194  | **复杂** |
| `evaluateInExtension`     | 664-742  | 79   | 中等     |

---

## 🎯 拆分方案

### 方案 A: 按功能分组（推荐）

```
src/tools/extension/
├── discovery.ts              # 扩展发现 (171行)
│   ├── listExtensions
│   └── getExtensionDetails
│
├── contexts.ts               # 上下文管理 (151行)
│   ├── listExtensionContexts
│   └── switchExtensionContext
│
├── storage.ts                # 存储检查 (72行) ⚠️ 已存在，需要整合
│   └── inspectExtensionStorage
│
├── logs.ts                   # 日志收集 (194行)
│   └── getExtensionLogs
│
├── execution.ts              # 执行和重载 (143行)
│   ├── evaluateInExtension
│   └── reloadExtension
│
└── index.ts                  # 统一导出 (10行)
```

**文件大小**:

- ✅ discovery.ts: ~171 行（合格）
- ✅ contexts.ts: ~151 行（合格）
- ✅ storage.ts: ~72 行（合格）
- ✅ logs.ts: ~194 行（合格）
- ✅ execution.ts: ~143 行（合格）

**优点**:

- 功能分组清晰
- 每个文件大小合理
- 易于维护和查找

---

### 方案 B: 更细粒度拆分

```
src/tools/extension/
├── list.ts                   # listExtensions (88行)
├── details.ts                # getExtensionDetails (83行)
├── contexts-list.ts          # listExtensionContexts (78行)
├── contexts-switch.ts        # switchExtensionContext (73行)
├── storage.ts                # inspectExtensionStorage (72行)
├── reload.ts                 # reloadExtension (64行)
├── logs.ts                   # getExtensionLogs (194行)
├── evaluate.ts               # evaluateInExtension (79行)
└── index.ts                  # 统一导出
```

**缺点**:

- 文件过多（9个）
- 可能过度工程化
- 维护成本更高

---

## 🔧 实施步骤（方案 A）

### 步骤 1: 创建新文件结构

```bash
mkdir -p src/tools/extension
```

### 步骤 2: 提取工具到新文件

#### discovery.ts

```typescript
import z from 'zod';
import {ToolCategories} from '../categories.js';
import {defineTool} from '../ToolDefinition.js';

export const listExtensions = defineTool({
  // ... 从 extensions.ts 提取
});

export const getExtensionDetails = defineTool({
  // ... 从 extensions.ts 提取
});
```

#### contexts.ts, logs.ts, execution.ts

（类似模式）

### 步骤 3: 创建 index.ts 统一导出

```typescript
export {listExtensions, getExtensionDetails} from './discovery.js';
export {listExtensionContexts, switchExtensionContext} from './contexts.js';
export {inspectExtensionStorage} from './storage.js';
export {getExtensionLogs} from './logs.js';
export {evaluateInExtension, reloadExtension} from './execution.js';
```

### 步骤 4: 更新 main.ts

```typescript
// ❌ 修改前
import * as extensionTools from './tools/extensions.js';

// ✅ 修改后
import * as extensionTools from './tools/extension/index.js';
```

### 步骤 5: 删除旧文件

```bash
rm src/tools/extensions.ts
```

### 步骤 6: 编译测试

```bash
npm run build
npm test
```

---

## ⏱️ 工作量评估

| 步骤                 | 预估时间      | 复杂度    |
| -------------------- | ------------- | --------- |
| 1. 创建文件结构      | 2 分钟        | 简单      |
| 2. 提取 discovery.ts | 15 分钟       | 中等      |
| 3. 提取 contexts.ts  | 15 分钟       | 中等      |
| 4. 提取 logs.ts      | 20 分钟       | 中等      |
| 5. 提取 execution.ts | 15 分钟       | 中等      |
| 6. 整合 storage.ts   | 10 分钟       | 简单      |
| 7. 创建 index.ts     | 5 分钟        | 简单      |
| 8. 更新 main.ts      | 5 分钟        | 简单      |
| 9. 编译测试          | 10 分钟       | 简单      |
| 10. 处理遗留问题     | 20 分钟       | 中等      |
| **总计**             | **~117 分钟** | **2小时** |

---

## ⚠️ 风险评估

### 高风险

- ❌ **无** - 这是纯代码组织变更

### 中风险

- ⚠️ **导入路径错误**: 可能遗漏某些导入
- ⚠️ **测试失败**: 可能影响现有测试

### 低风险

- ✅ **功能不变**: 只是重新组织，不改变逻辑
- ✅ **可回滚**: Git可以轻松回滚

### 缓解措施

1. ✅ 每个文件提取后立即编译测试
2. ✅ 保留原 extensions.ts 直到全部完成
3. ✅ 使用 Git 提交每个步骤

---

## 💡 建议

### 当前优先级权衡

**拆分 extensions.ts**:

- ⏱️ 时间: ~2小时
- 📈 收益: 代码组织更好，维护性提升
- ⚖️ 紧急度: 低（非功能性问题）

**统一日志系统**:

- ⏱️ 时间: ~1小时
- 📈 收益: 日志管理统一，调试更方便
- ⚖️ 紧急度: 中（影响日常开发体验）

### 推荐执行顺序

#### 选项 1: 全部完成（推荐）

```
1. ✅ 修复 any 类型 (已完成)
2. 🟡 统一日志系统 (1小时) - 更实用
3. 🟢 拆分 extensions.ts (2小时) - 有时间再做
```

**理由**: 日志系统影响日常开发，收益更直接

#### 选项 2: 仅做必要工作

```
1. ✅ 修复 any 类型 (已完成)
2. 🟡 统一日志系统 (1小时)
3. ⏸️ 拆分工作暂缓 (非紧急)
```

**理由**: extensions.ts 虽然大，但功能正常，不影响使用

---

## 🎯 决策建议

**当前状态**: 已完成高优先级修复（any 类型）

**下一步建议**:

1. **如果时间充裕**:
   - 先做日志系统（1小时）
   - 再做文件拆分（2小时）
   - 总计 3 小时完成所有改进

2. **如果时间有限**:
   - 只做日志系统（1小时）
   - 文件拆分作为后续优化任务
   - 不影响功能，可随时进行

**您的选择**？
