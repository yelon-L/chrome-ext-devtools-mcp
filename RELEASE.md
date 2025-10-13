# Release Guide

This document describes how to create and publish releases for Chrome Extension Debug MCP.

## Release Process

### 1. 准备发布

#### 更新版本号

编辑 `package.json`:
```json
{
  "version": "0.8.2"
}
```

#### 更新 CHANGELOG.md

在 `CHANGELOG.md` 顶部添加新版本的变更记录：

```markdown
## [0.8.2] - 2025-10-13

### Added
- New feature description

### Fixed
- Bug fix description

### Changed
- Change description
```

#### 提交更改

```bash
git add package.json CHANGELOG.md
git commit -m "chore: bump version to 0.8.2"
git push origin main
```

---

### 2. 创建 Release Tag

```bash
# 创建带注释的标签
git tag -a v0.8.2 -m "Release v0.8.2"

# 推送标签到 GitHub
git push origin v0.8.2
```

**重要：** 标签格式必须是 `v*.*.*`（例如 `v0.8.2`），这样才能触发 GitHub Actions。

---

### 3. GitHub Actions 自动构建

推送标签后，GitHub Actions 会自动：

1. ✅ 检出代码
2. ✅ 安装 Node.js 和 Bun
3. ✅ 安装依赖
4. ✅ 构建项目 (`npm run build`)
5. ✅ 打包所有平台的二进制文件
   - Linux x64
   - Linux ARM64
   - macOS x64 (Intel)
   - macOS ARM64 (Apple Silicon)
   - Windows x64
6. ✅ 生成 SHA256 校验和
7. ✅ 创建 GitHub Release
8. ✅ 上传所有二进制文件到 Release

---

### 4. 验证 Release

访问 GitHub Releases 页面：
```
https://github.com/ChromeDevTools/chrome-devtools-mcp/releases
```

检查：
- ✅ Release 已创建
- ✅ 所有二进制文件已上传
- ✅ checksums.txt 文件存在
- ✅ Release 说明正确

---

### 5. 测试二进制文件

下载并测试每个平台的二进制文件：

#### Linux/macOS
```bash
# 下载
wget https://github.com/ChromeDevTools/chrome-devtools-mcp/releases/download/v0.8.2/chrome-extension-debug-linux-x64

# 验证校验和
wget https://github.com/ChromeDevTools/chrome-devtools-mcp/releases/download/v0.8.2/checksums.txt
sha256sum -c checksums.txt

# 添加执行权限
chmod +x chrome-extension-debug-linux-x64

# 测试运行
./chrome-extension-debug-linux-x64 --version
```

#### Windows
```powershell
# 下载并运行
Invoke-WebRequest -Uri "https://github.com/ChromeDevTools/chrome-devtools-mcp/releases/download/v0.8.2/chrome-extension-debug-windows-x64.exe" -OutFile "chrome-extension-debug.exe"

# 测试
.\chrome-extension-debug.exe --version
```

---

## 本地构建二进制文件（开发测试）

如果需要在发布前本地测试二进制文件构建：

```bash
# 使用 Bun 打包脚本
bash scripts/package-bun.sh
```

这会在 `dist/` 目录下生成所有平台的二进制文件。

**注意：** `dist/` 目录在 `.gitignore` 中，不会被提交到仓库。

---

## 快速发布清单

- [ ] 更新 `package.json` 版本号
- [ ] 更新 `CHANGELOG.md` 添加版本变更
- [ ] 提交更改到 main 分支
- [ ] 创建并推送版本标签 (`git tag -a v0.8.2 -m "Release v0.8.2"`)
- [ ] 等待 GitHub Actions 完成构建（约 5-10 分钟）
- [ ] 验证 Release 页面
- [ ] 测试下载的二进制文件
- [ ] 在社区公告新版本

---

## 回滚 Release

如果发现问题需要回滚：

```bash
# 1. 删除远程标签
git push --delete origin v0.8.2

# 2. 删除本地标签
git tag -d v0.8.2

# 3. 在 GitHub 上删除 Release
# 访问 Release 页面 → 点击 "Delete" 按钮

# 4. 修复问题后重新发布
```

---

## 预发布版本

创建预发布版本（Beta, RC）：

```bash
# 创建预发布标签
git tag -a v0.9.0-beta.1 -m "Beta release v0.9.0-beta.1"
git push origin v0.9.0-beta.1
```

GitHub Actions 会自动标记为 **Pre-release**。

---

## 故障排查

### 问题 1: GitHub Actions 失败

**检查日志：**
```
https://github.com/ChromeDevTools/chrome-devtools-mcp/actions
```

**常见原因：**
- 构建失败：检查 TypeScript 编译错误
- Bun 打包失败：检查 Bun 版本兼容性
- 权限问题：确认 `GITHUB_TOKEN` 权限

### 问题 2: 二进制文件无法运行

**Linux:**
```bash
# 检查权限
chmod +x chrome-extension-debug-linux-x64

# 检查依赖
ldd chrome-extension-debug-linux-x64
```

**macOS:**
```bash
# 移除隔离属性
xattr -d com.apple.quarantine chrome-extension-debug-macos-x64
```

---

## 发布策略

### 版本号规范

遵循 [Semantic Versioning](https://semver.org/):

- **Major (主版本)**: 不兼容的 API 变更 (1.0.0 → 2.0.0)
- **Minor (次版本)**: 向后兼容的功能新增 (0.8.0 → 0.9.0)
- **Patch (补丁)**: 向后兼容的 Bug 修复 (0.8.1 → 0.8.2)

### 发布频率

- **Patch 版本**: 每周或有重要 Bug 修复时
- **Minor 版本**: 每月或有新功能时
- **Major 版本**: 重大架构变更或 Breaking Changes

---

## 相关链接

- [GitHub Actions Workflow](.github/workflows/release.yml)
- [Bun 打包脚本](scripts/package-bun.sh)
- [CHANGELOG](CHANGELOG.md)
- [Keep a Changelog](https://keepachangelog.com/)
- [Semantic Versioning](https://semver.org/)

---

**最后更新：** 2025-10-13
