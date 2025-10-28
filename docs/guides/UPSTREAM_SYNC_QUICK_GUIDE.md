# 上游同步快速指南

## TL;DR

```bash
# 一键同步（推荐）
./scripts/sync-upstream.sh

# 或手动同步
git remote add upstream https://github.com/ChromeDevTools/chrome-devtools-mcp.git
git fetch upstream
git checkout -b sync-upstream
git merge upstream/main
# 解决冲突...
git checkout main
git merge sync-upstream
```

## 当前状态

- **本地版本**: 0.8.18 (chrome-extension-debug-mcp)
- **上游版本**: 0.9.0 (chrome-devtools-mcp)
- **差异**: 本地基于上游 0.8.0，有大量扩展开发

## 快速同步步骤

### 1. 使用自动化脚本（最简单）

```bash
./scripts/sync-upstream.sh
```

脚本会自动：

- ✅ 检查工作区状态
- ✅ 添加 upstream remote（如果不存在）
- ✅ 获取上游更新
- ✅ 显示差异分析
- ✅ 提供交互式同步选项

### 2. 手动同步（完全控制）

#### Step 1: 准备工作

```bash
# 确保工作区干净
git status

# 创建备份
git branch backup-$(date +%Y%m%d)

# 添加上游 remote
git remote add upstream https://github.com/ChromeDevTools/chrome-devtools-mcp.git
git fetch upstream
```

#### Step 2: 查看差异

```bash
# 查看提交差异
git log HEAD..upstream/main --oneline

# 查看文件差异
git diff --stat HEAD upstream/main

# 查看关键文件
git diff HEAD upstream/main -- package.json
git diff HEAD upstream/main -- src/index.ts
```

#### Step 3: 创建同步分支

```bash
# 创建并切换到同步分支
git checkout -b sync-upstream-0.9.0

# 合并上游（不自动提交）
git merge upstream/main --no-commit --no-ff
```

#### Step 4: 解决冲突

```bash
# 查看冲突文件
git status

# 常见冲突及解决方案：

# package.json - 保留本地 name，合并 dependencies
git checkout --ours package.json
# 然后手动编辑合并 dependencies

# CHANGELOG.md - 合并两边的更新
# 手动编辑，保留两边的更新记录

# src/index.ts - 保留本地扩展工具注册
# 手动编辑，合并上游改进

# 标记已解决
git add <resolved-files>
```

#### Step 5: 完成合并

```bash
# 提交合并
git commit -m "Merge upstream v0.9.0

- Merged upstream changes from v0.8.0 to v0.9.0
- Preserved local extension tools
- Preserved Multi-Tenant mode
- Resolved conflicts in package.json, CHANGELOG.md, src/index.ts
"
```

#### Step 6: 测试验证

```bash
# 编译检查
pnpm run build

# 类型检查
pnpm run typecheck

# 运行测试
pnpm test

# 手动测试关键功能
# - 扩展工具
# - Multi-Tenant 模式
# - Worker 日志捕获
```

#### Step 7: 合并到主分支

```bash
# 切换到 main
git checkout main

# 合并同步分支
git merge sync-upstream-0.9.0

# 推送到远程
git push origin main

# 打标签
git tag v0.9.0-ext.1
git push origin v0.9.0-ext.1
```

## 冲突解决策略

### package.json

```json
{
  "name": "chrome-extension-debug-mcp", // 保留本地
  "version": "0.9.0-ext.1", // 基于上游版本 + 扩展标记
  "dependencies": {
    // 合并两边的依赖
    // 上游新增的依赖 + 本地新增的依赖
  }
}
```

### CHANGELOG.md

```markdown
## [0.9.0-ext.1] - 2025-10-25

### Merged from Upstream v0.9.0

- (列出上游的更新)

### Local Extensions (Preserved)

- Extension debugging tools
- Multi-Tenant mode
- Worker/Iframe log capture

## [0.8.18] - 2025-10-25

(保留本地的更新记录)

## [0.9.0] - 2025-10-22 (Upstream)

(保留上游的更新记录)
```

### src/index.ts

```typescript
// 保留本地的扩展工具导入
import * as extensionTools from './tools/extension/index.js';

// 合并上游的改进
// (保留上游的 bug 修复和优化)

// 注册工具时合并两边
const tools = [
  ...originalTools, // 上游工具
  ...extensionTools, // 本地扩展工具
];
```

## 常见问题

### Q: 合并后编译失败？

```bash
# 检查依赖
pnpm install

# 清理并重新编译
rm -rf build/
pnpm run build
```

### Q: 测试失败？

```bash
# 检查是否有上游的测试更新
git diff upstream/v0.8.0 upstream/main -- tests/

# 更新测试快照
pnpm run test:update-snapshots
```

### Q: 想要回滚？

```bash
# 回到合并前
git reset --hard backup-<date>

# 或者撤销最后一次提交
git reset --hard HEAD~1
```

### Q: 只想要特定的上游更新？

```bash
# 使用 cherry-pick
git log upstream/main --oneline
git cherry-pick <commit-hash>
```

## 版本号规范

### 格式

`<upstream-version>-ext.<extension-iteration>`

### 示例

- `0.9.0-ext.1` - 基于上游 0.9.0 的第 1 个扩展版本
- `0.9.0-ext.2` - 基于上游 0.9.0 的第 2 个扩展版本
- `0.10.0-ext.1` - 基于上游 0.10.0 的第 1 个扩展版本

### 更新版本号

```bash
# 更新 package.json
npm version 0.9.0-ext.1 --no-git-tag-version

# 同步到 server.json
pnpm run sync-server-json-version

# 提交
git add package.json server.json
git commit -m "chore: bump version to 0.9.0-ext.1"
```

## 定期同步建议

### 每月检查

```bash
# 获取上游更新
git fetch upstream

# 查看是否有新版本
git log HEAD..upstream/main --oneline

# 如果有重要更新，执行同步
./scripts/sync-upstream.sh
```

### 监控上游

1. **GitHub Watch**
   - 访问 https://github.com/ChromeDevTools/chrome-devtools-mcp
   - 点击 "Watch" → "Releases only"

2. **RSS 订阅**
   - https://github.com/ChromeDevTools/chrome-devtools-mcp/releases.atom

## 相关文档

- [完整同步分析](../UPSTREAM_SYNC_ANALYSIS.md) - 详细的同步策略和风险评估
- [同步脚本](../../scripts/sync-upstream.sh) - 自动化同步工具

## 总结

**推荐方式**: 使用 `./scripts/sync-upstream.sh` 进行交互式同步

**关键原则**:

1. ✅ 始终在独立分支进行同步
2. ✅ 充分测试后再合并到 main
3. ✅ 保留详细的合并记录
4. ✅ 使用清晰的版本号标记

**预计时间**: 首次同步 8-12 小时，后续同步 2-4 小时
