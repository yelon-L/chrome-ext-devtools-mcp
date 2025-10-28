# 上游仓库同步分析

## 当前状态

### 本地仓库

- **名称**: `chrome-extension-debug-mcp`
- **版本**: 0.8.18
- **Remote**: `git@yelon-L:yelon-L/chrome-ext-devtools-mcp.git`
- **最新提交**: `a0de33a` - "tool: get_offscreen_logs"

### 上游仓库

- **源地址**: https://github.com/ChromeDevTools/chrome-devtools-mcp.git
- **最新版本**: v0.9.0 (2025-10-22)
- **最新提交**: `a41e440` - "refactor: connect to DevTools targets by default" (2025-10-24)
- **状态**: 未配置为 remote

## 版本差异

### 本地版本 (0.8.18)

基于上游 0.8.0，之后进行了大量扩展开发：

**主要新增功能**：

1. **扩展调试工具** (11+ 工具)
   - `list_extensions`, `get_extension_details`
   - `activate_extension_service_worker`
   - `evaluate_in_extension`, `reload_extension`
   - `list_extension_contexts`, `switch_extension_context`
   - `get_background_logs`, `get_offscreen_logs`
   - `open_extension_popup`, `close_popup`, `interact_with_popup`
   - `clear_extension_errors`, `diagnose_extension_errors`

2. **Multi-Tenant 模式**
   - 用户注册和认证系统
   - Session 管理
   - V2 API (RESTful)
   - 持久化存储 (SQLite)

3. **增强功能**
   - Worker 日志捕获 (Web Worker, Service Worker)
   - Iframe 日志捕获
   - WebSocket 流量监控
   - 错误详细程度配置

4. **测试扩展**
   - test-extension-enhanced (v2.3.0)
   - Offscreen Document 测试支持

### 上游版本 (0.9.0)

从 0.8.0 到 0.9.0 的更新：

**可能的新增功能** (需要详细检查):

- DevTools targets 连接重构
- 可能的性能优化
- 可能的 bug 修复
- 可能的新工具或功能

## 同步策略

### 方案 1: 添加 upstream remote + 选择性合并 (推荐)

**优点**:

- 保留所有本地开发
- 可以选择性地合并上游更新
- 灵活控制同步内容

**步骤**:

```bash
# 1. 添加上游 remote
git remote add upstream https://github.com/ChromeDevTools/chrome-devtools-mcp.git

# 2. 获取上游更新
git fetch upstream

# 3. 查看差异
git log HEAD..upstream/main --oneline

# 4. 创建同步分支
git checkout -b sync-upstream-0.9.0

# 5. 选择性合并
# 方式 A: 合并所有更新 (可能有冲突)
git merge upstream/main

# 方式 B: 挑选特定提交 (cherry-pick)
git cherry-pick <commit-hash>

# 6. 解决冲突并测试
# 7. 合并回 main
git checkout main
git merge sync-upstream-0.9.0
```

### 方案 2: Rebase 到上游 (风险较高)

**优点**:

- 保持线性历史
- 本地提交在上游之上

**缺点**:

- 需要解决大量冲突
- 可能破坏已有功能
- 不推荐用于大量自定义开发

**步骤**:

```bash
git remote add upstream https://github.com/ChromeDevTools/chrome-devtools-mcp.git
git fetch upstream
git rebase upstream/main
# 解决冲突...
```

### 方案 3: 仅同步核心文件 (保守)

**适用场景**:

- 只想要上游的 bug 修复
- 不想引入破坏性更改

**步骤**:

```bash
# 1. 添加 upstream
git remote add upstream https://github.com/ChromeDevTools/chrome-devtools-mcp.git
git fetch upstream

# 2. 查看特定文件的差异
git diff HEAD upstream/main -- src/core/SomeFile.ts

# 3. 手动应用特定更改
git checkout upstream/main -- src/core/SomeFile.ts

# 4. 或使用 patch
git diff upstream/v0.8.0 upstream/main -- src/core/ > upstream-changes.patch
git apply --check upstream-changes.patch
git apply upstream-changes.patch
```

## 冲突预测

### 高风险冲突区域

1. **package.json**
   - 本地: `chrome-extension-debug-mcp` v0.8.18
   - 上游: `chrome-devtools-mcp` v0.9.0
   - 冲突: name, version, dependencies

2. **src/index.ts**
   - 本地: 扩展工具注册
   - 上游: 可能的架构变更
   - 冲突: 工具导入和注册

3. **src/McpContext.ts**
   - 本地: 扩展相关方法 (getExtensions, evaluateInExtension, etc.)
   - 上游: 可能的 API 变更
   - 冲突: 方法签名和实现

4. **CHANGELOG.md**
   - 本地: 0.8.15-0.8.18 的更新
   - 上游: 0.8.1-0.9.0 的更新
   - 冲突: 版本历史

### 低风险区域

1. **src/tools/extension/** (本地独有)
2. **src/multi-tenant/** (本地独有)
3. **test-extension-enhanced/** (本地独有)
4. **docs/** (大部分本地独有)

## 推荐同步流程

### Phase 1: 准备工作

```bash
# 1. 确保工作区干净
git status

# 2. 创建备份分支
git branch backup-before-sync

# 3. 添加上游 remote
git remote add upstream https://github.com/ChromeDevTools/chrome-devtools-mcp.git
git fetch upstream

# 4. 查看上游更新
git log HEAD..upstream/main --oneline --graph
```

### Phase 2: 分析差异

```bash
# 1. 查看文件级别差异
git diff --stat HEAD upstream/main

# 2. 查看关键文件差异
git diff HEAD upstream/main -- package.json
git diff HEAD upstream/main -- src/index.ts
git diff HEAD upstream/main -- src/McpContext.ts
git diff HEAD upstream/main -- src/tools/

# 3. 识别上游新增文件
git diff --name-status HEAD upstream/main | grep "^A"

# 4. 识别上游删除文件
git diff --name-status HEAD upstream/main | grep "^D"
```

### Phase 3: 选择性同步

```bash
# 1. 创建同步分支
git checkout -b sync-upstream-0.9.0

# 2. 合并上游 (会有冲突)
git merge upstream/main --no-commit --no-ff

# 3. 查看冲突
git status

# 4. 解决冲突策略
# - package.json: 保留本地 name，合并 dependencies
# - CHANGELOG.md: 合并两边的更新
# - src/: 保留本地扩展功能，合并上游 bug 修复
# - 新文件: 接受上游新增

# 5. 逐个解决冲突
git checkout --ours package.json  # 保留本地
git checkout --theirs src/core/NewFile.ts  # 接受上游
# 手动编辑其他冲突文件

# 6. 标记已解决
git add .

# 7. 完成合并
git commit -m "Merge upstream v0.9.0"
```

### Phase 4: 测试验证

```bash
# 1. 编译检查
pnpm run build

# 2. 类型检查
pnpm run typecheck

# 3. 运行测试
pnpm test

# 4. 手动测试扩展工具
# - list_extensions
# - get_offscreen_logs
# - interact_with_popup
# 等

# 5. 测试 Multi-Tenant 模式
pnpm run start:multi-tenant:dev
```

### Phase 5: 合并到主分支

```bash
# 1. 切换到 main
git checkout main

# 2. 合并同步分支
git merge sync-upstream-0.9.0

# 3. 推送到远程
git push origin main

# 4. 打标签
git tag v0.9.0-ext.1  # 表示基于上游 0.9.0 的扩展版本
git push origin v0.9.0-ext.1
```

## 版本号策略

### 建议方案: 独立版本号 + 上游标记

**格式**: `<major>.<minor>.<patch>-ext.<upstream-version>`

**示例**:

- `0.9.0-ext.1` - 基于上游 0.9.0 的第 1 个扩展版本
- `0.9.0-ext.2` - 基于上游 0.9.0 的第 2 个扩展版本
- `0.10.0-ext.1` - 基于上游 0.10.0 的第 1 个扩展版本

**优点**:

- 清晰标识上游版本
- 保留扩展版本迭代
- 便于追踪同步历史

## 持续同步策略

### 定期同步

```bash
# 每月或每季度执行
git fetch upstream
git log HEAD..upstream/main --oneline

# 如果有重要更新
git checkout -b sync-upstream-<version>
git merge upstream/main
# 解决冲突、测试、合并
```

### 监控上游更新

1. **GitHub Watch**
   - Watch https://github.com/ChromeDevTools/chrome-devtools-mcp
   - 关注 Releases

2. **自动化检查**

   ```bash
   # 添加到 CI/CD
   git fetch upstream
   git diff --stat HEAD upstream/main
   ```

3. **订阅 Release Notes**
   - https://github.com/ChromeDevTools/chrome-devtools-mcp/releases

## 风险评估

### 高风险操作

- ❌ 直接 `git pull upstream/main` (会覆盖本地更改)
- ❌ 强制 rebase (会丢失提交历史)
- ❌ 不测试直接合并到 main

### 安全操作

- ✅ 创建备份分支
- ✅ 使用独立的同步分支
- ✅ 充分测试后再合并
- ✅ 保留详细的合并记录

## 下一步行动

### 立即执行

1. ✅ 添加 upstream remote
2. ✅ 获取上游更新
3. ✅ 分析差异

### 计划执行

1. ⏳ 创建同步分支
2. ⏳ 选择性合并上游更新
3. ⏳ 解决冲突
4. ⏳ 完整测试
5. ⏳ 合并到 main

### 长期维护

1. 📅 建立定期同步机制 (每月/每季度)
2. 📅 监控上游重要更新
3. 📅 维护同步文档

## 总结

**推荐方案**: 方案 1 (添加 upstream + 选择性合并)

**原因**:

- 本地有大量自定义开发 (扩展工具、Multi-Tenant)
- 需要保留所有本地功能
- 可以灵活选择上游更新
- 风险可控

**预计工作量**:

- 准备和分析: 2-3 小时
- 合并和解决冲突: 4-6 小时
- 测试验证: 2-3 小时
- 总计: 8-12 小时

**关键成功因素**:

1. 充分的差异分析
2. 谨慎的冲突解决
3. 完整的测试覆盖
4. 详细的文档记录
