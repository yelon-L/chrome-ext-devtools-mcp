# 扩展工具系统性优化计划

## 工具清单（共 12 个）

### ✅ 已优化（4 个）
1. ✅ `diagnose_extension_errors` - 智能诊断
2. ✅ `get_extension_logs` - 实时日志监控
3. ✅ `enhance_extension_error_capture` - 错误捕获增强
4. ✅ `get_extension_runtime_errors` - 运行时错误（新增）

### ⏳ 待优化（8 个）

#### 核心发现工具（2 个）- P0
5. `list_extensions` - 列出所有扩展
6. `get_extension_details` - 获取扩展详情

#### 上下文管理工具（2 个）- P0
7. `list_extension_contexts` - 列出扩展上下文
8. `switch_extension_context` - 切换扩展上下文

#### 执行和操作工具（2 个）- P0
9. `evaluate_in_extension` - 在扩展中执行代码
10. `reload_extension` - 重新加载扩展

#### Service Worker 工具（1 个）- P1
11. `activate_extension_service_worker` - 激活 Service Worker

#### 数据和配置工具（3 个）- P1
12. `inspect_extension_storage` - 检查存储
13. `inspect_extension_manifest` - 检查 manifest
14. `check_content_script_injection` - 检查内容脚本注入

---

## 优化策略

### 按使用频率和重要性分组

**第一组：必须最先使用的工具**（用户入口）
- `list_extensions` - 99% 用户的第一个工具
- `get_extension_details` - 查看详情

**第二组：上下文管理**（调试基础）
- `list_extension_contexts` - 查看可用上下文
- `activate_extension_service_worker` - MV3 必备

**第三组：执行操作**（核心功能）
- `evaluate_in_extension` - 执行代码
- `reload_extension` - 重新加载

**第四组：检查和配置**（高级功能）
- `inspect_extension_storage` - 存储检查
- `inspect_extension_manifest` - 配置检查
- `check_content_script_injection` - 注入检查
- `switch_extension_context` - 上下文切换

---

## 优化原则（复用）

### 1. 首句公式（80% 权重）
```
[核心动作] + [操作对象] + [关键差异词]
```

### 2. 场景触发（15% 权重）
```markdown
**This is the tool you need when:**
- ✅ [用户场景 1]
- ✅ [用户场景 2]
- ✅ [用户场景 3]
```

### 3. 对比说明（5% 权重）
```markdown
**NOT for:**
- ❌ [场景] → use `tool_name`
```

---

## 优化模板

```markdown
[核心动作] [操作对象] [关键特征].

**This is the tool you need when:**
- ✅ [最常见场景 - 使用用户术语]
- ✅ [第二常见场景 - 明确触发词]
- ✅ [第三常见场景 - 独特优势]

**What you get:**
- [输出 1]
- [输出 2]

**NOT for:**
- ❌ [场景 A] → use `tool_a`

**Example scenarios:**
1. [用户描述] → [使用此工具]

**Related tools:**
- tool_a - brief description
```

---

## 执行计划

### Phase 1: 核心发现工具（立即执行）
- [ ] `list_extensions`
- [ ] `get_extension_details`

### Phase 2: 上下文和执行（接下来）
- [ ] `list_extension_contexts`
- [ ] `activate_extension_service_worker`
- [ ] `evaluate_in_extension`
- [ ] `reload_extension`

### Phase 3: 高级工具（最后）
- [ ] `inspect_extension_storage`
- [ ] `inspect_extension_manifest`
- [ ] `check_content_script_injection`
- [ ] `switch_extension_context`

---

## 预期效果

| 工具 | 当前匹配率 | 目标匹配率 | 提升 |
|------|-----------|-----------|------|
| list_extensions | 80% | 95% | +15% |
| get_extension_details | 70% | 90% | +20% |
| list_extension_contexts | 60% | 90% | +30% |
| activate_extension_service_worker | 75% | 95% | +20% |
| evaluate_in_extension | 70% | 90% | +20% |
| reload_extension | 75% | 90% | +15% |
| inspect_extension_storage | 65% | 90% | +25% |
| inspect_extension_manifest | 60% | 85% | +25% |
| check_content_script_injection | 55% | 85% | +30% |
| switch_extension_context | 50% | 80% | +30% |

**平均提升**: +22%
