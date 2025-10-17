# 扩展错误工具快速选择指南

## 🎯 我想...

### 查看 chrome://extensions 显示的错误
**→ `get_extension_runtime_errors`** ⭐

**触发词**: chrome://extensions, 扩展管理页面, Errors 按钮, 管理页显示的错误

**场景**:
- 扩展卡片上显示 "Errors" 按钮
- 想看扩展管理页面记录的错误
- 需要错误发生次数统计
- 想看完整的堆栈跟踪（带函数名和列号）

---

### 获取错误修复建议和诊断
**→ `diagnose_extension_errors`**

**触发词**: 诊断, 修复建议, 健康检查, 如何修复, 健康评分

**场景**:
- 快速健康检查："扩展工作正常吗？"
- 需要分类错误（JavaScript、API、权限、网络）
- 想要健康评分（0-100）
- 需要具体的修复建议

---

### 看实时 console 日志
**→ `get_extension_logs`**

**触发词**: console, 实时日志, console.log, 正在输出什么

**场景**:
- 查看扩展正在输出什么
- 验证 console.log() 是否工作
- 实时监控扩展活动
- 获取最近的日志（增量收集）

---

### 在测试前捕获错误
**→ `enhance_extension_error_capture`**

**触发词**: 注入, 捕获未来, 预防, 测试前

**场景**:
- 测试前预注入错误监听器
- 捕获难以复现的异步错误
- 其他工具显示"无错误"但扩展有问题
- 需要捕获未被记录的 Promise 拒绝

---

## 📊 工具对比表

| 特性 | get_extension_runtime_errors | diagnose_extension_errors | get_extension_logs | enhance_extension_error_capture |
|------|------------------------------|--------------------------|-------------------|--------------------------------|
| **数据来源** | Chrome 内部记录 | Console 日志 | Console 日志 | 注入监听器 |
| **时间范围** | 持久化（所有历史） | 可配置（默认 10 分钟） | 实时或指定时间 | 注入后的未来 |
| **错误次数统计** | ✅ 精确统计 | ❌ 无 | ❌ 无 | ❌ 无 |
| **完整堆栈** | ✅ 带函数名+列号 | ⚠️ 部分 | ⚠️ 部分 | ✅ 完整 |
| **错误分类** | ❌ 无 | ✅ 自动分类 | ❌ 无 | ❌ 无 |
| **修复建议** | ❌ 无 | ✅ 有 | ❌ 无 | ❌ 无 |
| **健康评分** | ❌ 无 | ✅ 有 | ❌ 无 | ❌ 无 |
| **实时性** | ⚠️ 当前状态 | ✅ 实时 | ✅ 实时 | ✅ 实时 |
| **主要用途** | 查看历史错误 | 智能诊断 | 实时监控 | 预防性捕获 |

---

## 🔍 根据用户描述选择工具

### 用户说："扩展管理页面显示有 8 个错误"
→ `get_extension_runtime_errors`
- 关键词：扩展管理页面、显示、错误数量

### 用户说："帮我分析这个扩展的错误"
→ 先询问用户具体需求，或默认使用 `get_extension_runtime_errors`（最全面）
- 如果用户需要修复建议 → `diagnose_extension_errors`

### 用户说："看看扩展正在输出什么"
→ `get_extension_logs`
- 关键词：正在、输出、实时

### 用户说："这个扩展有问题，给我一些建议"
→ `diagnose_extension_errors`
- 关键词：问题、建议、修复

### 用户说："我要测试扩展，帮我捕获可能的错误"
→ `enhance_extension_error_capture`
- 关键词：测试、捕获、可能的

### 用户说："找出发生最多次的错误"
→ `get_extension_runtime_errors`
- 关键词：发生次数、最多、高频

### 用户说："Errors 按钮里有很多错误"
→ `get_extension_runtime_errors`
- 关键词：Errors 按钮

---

## 🚀 常见工作流

### 工作流 1: 生产问题诊断
```
用户报告："扩展不工作了"

Step 1: get_extension_runtime_errors
       → 查看 Chrome 内部错误记录
       → 发现: "Extension context invalidated" 4510 次 ⚠️

Step 2: diagnose_extension_errors
       → 获取智能分析和修复建议
       → 健康评分: 45/100
       → 建议: 检查上下文生命周期管理

Step 3: [修复代码]

Step 4: diagnose_extension_errors
       → 验证修复效果
       → 健康评分: 85/100 ✅
```

### 工作流 2: 开发调试
```
开发中需要调试扩展

Step 1: enhance_extension_error_capture
       → 预注入错误监听器

Step 2: [执行测试操作]

Step 3: get_extension_logs
       → 查看实时日志输出
       → 发现 [EXTENSION_ERROR] 条目

Step 4: diagnose_extension_errors
       → 获取详细诊断和建议
```

### 工作流 3: 定期健康检查
```
每天自动检查扩展健康状态

Step 1: diagnose_extension_errors
       → 快速健康检查
       → 健康评分 > 90 → 结束 ✅

如果评分 < 90:
Step 2: get_extension_runtime_errors
       → 查看详细错误列表
       → 识别高频问题

Step 3: [记录并创建修复任务]
```

### 工作流 4: 无错误但功能异常
```
用户："扩展没有错误提示，但功能不正常"

Step 1: diagnose_extension_errors
       → 结果: "No errors detected"

Step 2: enhance_extension_error_capture
       → 注入监听器捕获隐藏错误

Step 3: [触发功能操作]

Step 4: get_extension_logs
       → 查看 [EXTENSION_ERROR] 条目
       → 发现被捕获的错误

Step 5: get_extension_runtime_errors
       → 查看 Chrome 内部是否有记录
```

---

## 🎨 决策树

```
开始：需要调试扩展错误
    ↓
    是否在 chrome://extensions 看到错误？
    ├─ 是 → get_extension_runtime_errors ⭐
    │         ↓
    │         需要修复建议？
    │         ├─ 是 → 继续使用 diagnose_extension_errors
    │         └─ 否 → 完成
    │
    └─ 否 → 需要什么？
            ├─ 修复建议和诊断 → diagnose_extension_errors
            │                     ↓
            │                     发现问题？
            │                     ├─ 是 → 完成
            │                     └─ 否 → enhance_extension_error_capture
            │
            ├─ 实时日志监控 → get_extension_logs
            │
            └─ 预防性捕获 → enhance_extension_error_capture
                            ↓
                            [触发操作]
                            ↓
                            get_extension_logs
```

---

## 💡 关键区别

### Chrome 内部错误 vs Console 日志

**Chrome 内部错误** (`get_extension_runtime_errors`):
```javascript
// 这些错误会被 Chrome 自动记录：
throw new Error("Uncaught error");  // ✅ 记录
Promise.reject("Unhandled");        // ✅ 记录
```

**Console 日志** (`get_extension_logs`, `diagnose_extension_errors`):
```javascript
// 只有显式输出才会被记录：
console.error("Error message");     // ✅ 记录
console.log("Debug info");          // ✅ 记录

// 未捕获的错误不一定输出到 console：
throw new Error("Silent error");    // ❌ 不一定有 console 输出
```

**enhance_extension_error_capture 的作用**:
```javascript
// 注入后，未捕获的错误会被自动输出到 console：
throw new Error("Now logged");      // ✅ 自动输出到 console
Promise.reject("Now logged");       // ✅ 自动输出到 console
```

---

## 🔧 实用技巧

### 技巧 1: 组合使用工具
不要只用一个工具！组合使用效果更好：
```bash
# 全面诊断
get_extension_runtime_errors + diagnose_extension_errors

# 开发调试
enhance_extension_error_capture + get_extension_logs

# 生产监控
get_extension_runtime_errors (定期) + diagnose_extension_errors (告警时)
```

### 技巧 2: 使用正确的关键词
与 AI 对话时，使用这些关键词可以提高工具选择准确率：

**想用 get_extension_runtime_errors**:
- "chrome://extensions 显示的错误"
- "扩展管理页面的 Errors 按钮"
- "错误发生了多少次"
- "高频错误"

**想用 diagnose_extension_errors**:
- "给我修复建议"
- "健康检查"
- "错误分类"
- "健康评分"

**想用 get_extension_logs**:
- "实时日志"
- "console 输出"
- "正在输出什么"
- "最近的日志"

**想用 enhance_extension_error_capture**:
- "测试前准备"
- "捕获未来的错误"
- "注入监听器"
- "预防性"

### 技巧 3: 理解时间维度
```
过去（历史）     现在（实时）      未来（预防）
     ↓               ↓                ↓
runtime_errors   logs/diagnose   error_capture
```

---

## ❓ 常见问题

### Q1: 为什么 diagnose_extension_errors 显示"无错误"，但 chrome://extensions 显示有错误？
**A**: 这两个工具的数据来源不同：
- `diagnose_extension_errors`: 分析 console 日志
- chrome://extensions: 显示 Chrome 内部错误记录

**解决方案**: 使用 `get_extension_runtime_errors` 查看 Chrome 内部错误

### Q2: 应该先用哪个工具？
**A**: 取决于你的目标：
- 快速诊断 → `diagnose_extension_errors`
- 查看扩展管理页面错误 → `get_extension_runtime_errors`
- 实时监控 → `get_extension_logs`
- 测试前准备 → `enhance_extension_error_capture`

### Q3: 可以同时使用多个工具吗？
**A**: 可以！推荐组合使用：
```bash
# 最全面的诊断
1. get_extension_runtime_errors  # 查看历史错误
2. diagnose_extension_errors     # 获取分析和建议
3. enhance_extension_error_capture  # 预防未来错误
4. get_extension_logs            # 监控实时日志
```

### Q4: 工具输出太多，如何快速定位问题？
**A**: 
- `get_extension_runtime_errors`: 按发生次数排序，先看高频错误
- `diagnose_extension_errors`: 查看健康评分，关注 < 70 分的
- `get_extension_logs`: 使用 level 参数过滤（只看 error 和 warn）

---

## 📚 更多资源

- **详细分析**: `ERROR_TOOLS_CONSOLIDATION_ANALYSIS.md`
- **AI 可识别性**: `ERROR_TOOLS_AI_CLARITY_ANALYSIS.md`
- **实现指南**: `EXTENSION_ERROR_ACCESS_ANALYSIS.md`
- **错误工具关系**: `docs/EXTENSION_ERROR_TOOLS_RELATIONSHIP.md`
