# GitHub 项目规范化设置指南

本文档说明如何将项目调整为符合 GitHub 规范的开源工程。

## 项目结构概览

```
chrome-ext-devtools-mcp/
├── .github/
│   └── workflows/
│       └── release.yml          # 自动构建和发布 Release
├── src/                          # TypeScript 源码
├── build/                        # 编译输出（不提交）
├── dist/                         # 二进制文件（不提交）
├── scripts/
│   └── package-bun.sh            # 打包脚本
├── .gitignore                    # 排除 build/ 和 dist/
├── CHANGELOG.md                  # 版本变更记录
├── RELEASE.md                    # 发布流程文档
├── README.md                     # 项目文档
└── package.json                  # 项目配置
```

---

## ✅ 已完成的规范化工作

### 1. `.gitignore` 配置

二进制文件已从 Git 仓库中排除：

```gitignore
# Build output directory
build/

# Distribution binaries (published via GitHub Releases)
dist/
```

**好处：**

- ✅ 仓库体积小
- ✅ 版本历史清晰
- ✅ 避免二进制文件冲突

---

### 2. GitHub Actions 自动化发布

**文件：** `.github/workflows/release.yml`

**触发条件：** 推送版本标签（例如 `v0.8.2`）

**自动化流程：**

1. 检出代码
2. 安装依赖（Node.js + Bun）
3. 构建项目
4. 打包所有平台二进制文件
5. 生成 SHA256 校验和
6. 创建 GitHub Release
7. 上传文件到 Release

**支持平台：**

- Linux x64
- Linux ARM64
- macOS x64 (Intel)
- macOS ARM64 (Apple Silicon)
- Windows x64

---

### 3. CHANGELOG.md

遵循 [Keep a Changelog](https://keepachangelog.com/) 规范：

```markdown
## [0.8.2] - 2025-10-13

### Added

- 新功能描述

### Fixed

- Bug 修复描述

### Changed

- 变更描述
```

---

### 4. RELEASE.md

完整的发布流程文档，包括：

- 版本号更新
- 标签创建
- GitHub Actions 触发
- Release 验证
- 故障排查

---

### 5. README.md

添加了完整的安装部分：

- **Option 1**: 二进制发布（推荐）
- **Option 2**: npm 包
- **Option 3**: 从源码构建

---

## 🚀 如何发布新版本

### 快速流程

```bash
# 1. 更新版本号
vim package.json  # 修改 "version": "0.8.3"

# 2. 更新 CHANGELOG
vim CHANGELOG.md  # 添加新版本变更

# 3. 提交更改
git add package.json CHANGELOG.md
git commit -m "chore: bump version to 0.8.3"
git push origin main

# 4. 创建并推送标签
git tag -a v0.8.3 -m "Release v0.8.3"
git push origin v0.8.3

# 5. 等待 GitHub Actions 完成（约 5-10 分钟）
# 访问: https://github.com/your-org/chrome-ext-devtools-mcp/releases
```

### GitHub Actions 将自动完成：

✅ 构建所有平台二进制文件  
✅ 创建 Release  
✅ 上传文件  
✅ 生成校验和

---

## 📦 用户如何下载二进制文件

### 方式 1: 浏览器下载

访问 Releases 页面：

```
https://github.com/your-org/chrome-ext-devtools-mcp/releases
```

点击最新版本，下载对应平台的文件。

### 方式 2: 命令行下载

**Linux:**

```bash
wget https://github.com/your-org/chrome-ext-devtools-mcp/releases/latest/download/chrome-extension-debug-linux-x64
chmod +x chrome-extension-debug-linux-x64
```

**macOS:**

```bash
curl -L -o chrome-extension-debug https://github.com/your-org/chrome-ext-devtools-mcp/releases/latest/download/chrome-extension-debug-macos-arm64
chmod +x chrome-extension-debug
```

**Windows (PowerShell):**

```powershell
Invoke-WebRequest -Uri "https://github.com/your-org/chrome-ext-devtools-mcp/releases/latest/download/chrome-extension-debug-windows-x64.exe" -OutFile "chrome-extension-debug.exe"
```

---

## 🔍 文件对比：规范化前后

### 规范化前 ❌

```
仓库内容：
  ├── src/
  ├── build/                  # ❌ 构建产物提交到 Git
  ├── dist/                   # ❌ 二进制文件提交到 Git
  │   ├── chrome-extension-debug-linux-x64    (50MB)
  │   ├── chrome-extension-debug-macos-x64    (55MB)
  │   ├── chrome-extension-debug-windows.exe  (52MB)
  └── package.json

仓库大小: ~200MB+
版本历史: 混乱（每次发布增加几百 MB）
```

**问题：**

- 仓库体积巨大
- clone 速度慢
- 版本历史混乱
- 二进制文件冲突

### 规范化后 ✅

```
仓库内容：
  ├── src/
  ├── .github/
  │   └── workflows/
  │       └── release.yml     # ✅ 自动化发布
  ├── scripts/
  │   └── package-bun.sh
  ├── CHANGELOG.md            # ✅ 版本记录
  ├── RELEASE.md              # ✅ 发布文档
  └── package.json

仓库大小: ~5MB
版本历史: 清晰（只有源码变更）

二进制文件位置：
  GitHub Releases
    └── v0.8.2
        ├── chrome-extension-debug-linux-x64
        ├── chrome-extension-debug-macos-x64
        ├── chrome-extension-debug-windows-x64.exe
        └── checksums.txt
```

**优势：**

- ✅ 仓库小巧
- ✅ clone 快速
- ✅ 版本清晰
- ✅ 专业规范

---

## 📊 GitHub Releases 优势

### 1. 自动化管理

```yaml
# .github/workflows/release.yml
on:
  push:
    tags:
      - 'v*.*.*' # 自动触发
```

### 2. 版本化下载链接

```bash
# 最新版本
https://github.com/.../releases/latest/download/file

# 特定版本
https://github.com/.../releases/download/v0.8.2/file
```

### 3. Release Notes

每个版本自动生成详细说明：

- 新功能
- Bug 修复
- 下载链接
- 安装指南
- 校验和

### 4. 下载统计

GitHub 自动统计：

- 每个文件下载次数
- 版本流行度
- 用户平台分布

---

## 🎯 最佳实践

### 1. 版本号规范

使用 [Semantic Versioning](https://semver.org/)：

```
v1.2.3
 │ │ └── Patch: Bug 修复
 │ └──── Minor: 新功能（向后兼容）
 └────── Major: 破坏性变更
```

### 2. 标签命名

```bash
# ✅ 正确
git tag -a v0.8.2 -m "Release v0.8.2"

# ❌ 错误
git tag 0.8.2           # 缺少 'v' 前缀
git tag v0.8.2          # 缺少注释消息
```

### 3. CHANGELOG 格式

```markdown
## [0.8.2] - 2025-10-13

### Added

- 具体描述新功能

### Fixed

- 具体描述修复的 Bug

### Changed

- 具体描述的变更

### Security

- 安全相关更新
```

### 4. Release 说明

提供完整信息：

- ✅ 下载链接
- ✅ 安装指南
- ✅ 使用示例
- ✅ 校验和
- ✅ Breaking Changes

---

## 🔐 安全性

### 校验和验证

每个 Release 自动生成 `checksums.txt`：

```bash
# 下载文件和校验和
wget .../chrome-extension-debug-linux-x64
wget .../checksums.txt

# 验证
sha256sum -c checksums.txt
```

### 签名（可选）

可以添加 GPG 签名：

```bash
# 签名标签
git tag -s v0.8.2 -m "Release v0.8.2"

# 验证签名
git tag -v v0.8.2
```

---

## 📝 维护清单

### 每次发布前

- [ ] 运行测试: `npm test`
- [ ] 更新版本号: `package.json`
- [ ] 更新 CHANGELOG: `CHANGELOG.md`
- [ ] 本地构建验证: `bash scripts/package-bun.sh`
- [ ] 提交更改: `git commit -m "chore: bump version"`

### 发布后

- [ ] 验证 GitHub Actions 成功
- [ ] 测试下载链接
- [ ] 验证校验和
- [ ] 测试二进制文件运行
- [ ] 更新文档（如需要）

### 定期维护

- [ ] 清理旧的 Releases（保留最近 10 个）
- [ ] 更新依赖版本
- [ ] 审查 Issue 和 PR
- [ ] 更新文档

---

## 🛠️ 故障排查

### 问题 1: GitHub Actions 失败

**检查：**

```
GitHub → Actions → 查看日志
```

**常见原因：**

- TypeScript 编译错误 → 修复代码
- Bun 版本不兼容 → 更新 Bun
- 权限问题 → 检查 GITHUB_TOKEN

### 问题 2: 二进制文件无法运行

**Linux:**

```bash
# 添加执行权限
chmod +x chrome-extension-debug-linux-x64

# 检查依赖
ldd chrome-extension-debug-linux-x64
```

**macOS:**

```bash
# 移除隔离属性
xattr -d com.apple.quarantine chrome-extension-debug-macos-*
```

### 问题 3: 标签推送失败

```bash
# 删除本地标签
git tag -d v0.8.2

# 删除远程标签
git push --delete origin v0.8.2

# 重新创建
git tag -a v0.8.2 -m "Release v0.8.2"
git push origin v0.8.2
```

---

## 📚 相关文档

- [GitHub Actions 文档](https://docs.github.com/en/actions)
- [GitHub Releases 指南](https://docs.github.com/en/repositories/releasing-projects-on-github)
- [Keep a Changelog](https://keepachangelog.com/)
- [Semantic Versioning](https://semver.org/)
- [Bun 文档](https://bun.sh/docs)

---

## ✅ 验证清单

项目是否符合 GitHub 规范：

- [x] `.gitignore` 排除构建产物和二进制文件
- [x] GitHub Actions workflow 配置
- [x] CHANGELOG.md 存在且更新
- [x] README.md 包含安装说明
- [x] package.json 版本号正确
- [x] RELEASE.md 发布文档完整
- [x] 二进制文件通过 Releases 发布
- [x] 每个 Release 包含校验和
- [x] 标签格式正确 (`v*.*.*`)
- [x] 版本号遵循语义化版本规范

---

## 🎉 完成！

现在您的项目已经符合 GitHub 开源项目规范：

- ✅ **仓库轻量** - 只包含源码
- ✅ **自动化发布** - 推送标签即可
- ✅ **用户友好** - 提供二进制下载
- ✅ **版本清晰** - CHANGELOG 记录完整
- ✅ **专业规范** - 遵循最佳实践

**下次发布只需三步：**

1. 更新版本号和 CHANGELOG
2. 推送标签
3. 等待 GitHub Actions 完成

---

**最后更新：** 2025-10-13  
**文档版本：** 1.0
