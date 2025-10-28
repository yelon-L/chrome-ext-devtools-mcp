# 扩展错误工具 - 快速参考

## 🚀 快速决策

```
需要诊断已知错误？
  └─ 使用 diagnose_extension_errors

需要捕获难以复现的错误？
  └─ 先 enhance_extension_error_capture
     再 diagnose_extension_errors

需要生产监控？
  └─ 首次 enhance_extension_error_capture
     定期 diagnose_extension_errors
```

---

## 📋 工具速查

### diagnose_extension_errors（诊断工具）

**用途**：分析和诊断扩展错误

**参数**：

```json
{
  "extensionId": "abcd...",
  "timeRange": 60, // 可选，默认10分钟
  "includeWarnings": true // 可选，默认false
}
```

**输出**：

- ✅ 错误总结
- ✅ 错误分类
- ✅ 频率统计
- ✅ 详细日志
- ✅ 诊断建议
- ✅ 健康评分

**特点**：

- ✅ 只读，无副作用
- ✅ 随时可用
- ✅ 快速响应

---

### enhance_extension_error_capture（增强工具）

**用途**：注入错误监听器，捕获更多错误

**参数**：

```json
{
  "extensionId": "abcd...",
  "captureStackTraces": true // 可选，默认true
}
```

**输出**：

- ✅ 注入状态
- ✅ 捕获能力说明
- ✅ 生命周期提示

**捕获内容**：

- ❌ 未捕获的JavaScript错误
- 🔴 未处理的Promise拒绝
- 📍 文件位置和行号
- 📚 完整堆栈跟踪

**特点**：

- ⚠️ 侵入式（注入代码）
- ⚠️ 需要Service Worker激活
- ✅ 持续生效直到扩展重载

---

## 🔄 常用工作流

### 场景1：快速诊断

```bash
# 一键诊断
diagnose_extension_errors({
  "extensionId": "xxx",
  "timeRange": 60
})
```

### 场景2：深度调试

```bash
# 1. 激活Service Worker（MV3扩展）
activate_extension_service_worker({"extensionId": "xxx"})

# 2. 增强错误捕获
enhance_extension_error_capture({
  "extensionId": "xxx",
  "captureStackTraces": true
})

# 3. 触发扩展功能
# (手动操作或自动化测试)

# 4. 诊断分析
diagnose_extension_errors({
  "extensionId": "xxx",
  "timeRange": 5
})
```

### 场景3：开发调试循环

```bash
# 1. 首次增强
enhance_extension_error_capture({"extensionId": "xxx"})

# 2. 修改代码后重载
reload_extension({
  "extensionId": "xxx",
  "captureErrors": true
})

# 3. 重新增强（reload会清除）
enhance_extension_error_capture({"extensionId": "xxx"})

# 4. 测试功能
# ...

# 5. 诊断
diagnose_extension_errors({"extensionId": "xxx"})

# 重复步骤2-5
```

---

## 💡 使用技巧

### 诊断工具技巧

1. **调整时间范围**

   ```bash
   # 查看最近5分钟
   {"timeRange": 5}

   # 查看最近1小时
   {"timeRange": 60}

   # 查看24小时
   {"timeRange": 1440}
   ```

2. **包含警告**

   ```bash
   # 仅看错误（默认）
   {"includeWarnings": false}

   # 同时看错误和警告
   {"includeWarnings": true}
   ```

3. **关注健康评分**
   ```
   90-100: 优秀
   70-89:  良好
   50-69:  需要关注
   <50:    严重问题
   ```

### 增强工具技巧

1. **检查是否已增强**

   ```bash
   # 重复调用是安全的
   enhance_extension_error_capture({"extensionId": "xxx"})
   # 输出：Already Enhanced（如果已注入）
   ```

2. **扩展重载后需要重新增强**

   ```bash
   reload_extension(...)
   # ⚠️ 增强监听器已丢失
   enhance_extension_error_capture(...)
   # ✅ 重新注入
   ```

3. **Service Worker重启后需要重新增强**
   ```bash
   # MV3扩展的Service Worker可能自动休眠
   # 休眠后监听器会丢失
   # 需要重新增强
   ```

---

## ⚠️ 常见问题

### Q1: 为什么诊断没有发现错误？

**可能原因**：

1. 扩展确实没有错误 ✅
2. 错误没有被console.log记录 ⚠️
3. 错误是Promise拒绝（未处理） ⚠️

**解决方案**：

```bash
enhance_extension_error_capture({"extensionId": "xxx"})
# 然后重新触发操作
```

### Q2: 增强工具报错"Service Worker is inactive"

**解决方案**：

```bash
# 先激活Service Worker
activate_extension_service_worker({"extensionId": "xxx"})

# 再增强
enhance_extension_error_capture({"extensionId": "xxx"})
```

### Q3: 增强后还是没有捕获到错误

**可能原因**：

1. 错误发生在增强之前
2. 错误发生在content script中（需要单独增强）
3. 错误被try-catch捕获了

**建议**：

- 增强后重新触发操作
- 检查content script日志
- 使用debugger断点调试

### Q4: 需要清除增强的监听器吗？

**答案**：不需要

- 监听器会在扩展重载时自动清除
- 监听器对性能影响极小
- 重复注入是安全的（幂等）

---

## 📊 工具选择矩阵

| 需求            | 推荐工具                          | 原因           |
| --------------- | --------------------------------- | -------------- |
| 查看现有错误    | diagnose                          | 快速、无侵入   |
| 捕获Promise错误 | enhance + diagnose                | 需要注入监听器 |
| 定期健康检查    | diagnose                          | 只需要分析     |
| 开发调试        | enhance + diagnose                | 需要全面捕获   |
| 生产监控        | enhance（一次）+ diagnose（定期） | 持续监控       |
| CI/CD检查       | enhance + diagnose                | 自动化测试     |

---

## 🔗 相关工具

| 工具                                | 用途                     |
| ----------------------------------- | ------------------------ |
| `list_extensions`                   | 获取扩展ID               |
| `activate_extension_service_worker` | 激活SW（增强的前置条件） |
| `get_extension_logs`                | 查看原始日志             |
| `reload_extension`                  | 重载扩展                 |

---

## 📚 完整文档

- **工具关系详解**: `EXTENSION_ERROR_TOOLS_RELATIONSHIP.md`
- **错误访问设计**: `EXTENSION_ERRORS_ACCESS_DESIGN.md`

---

**快速记忆口诀**：

```
看已有错误 → diagnose
抓未知错误 → enhance + diagnose
开发调试 → enhance一次 + 多次diagnose
生产监控 → enhance保持 + 定期diagnose
```
