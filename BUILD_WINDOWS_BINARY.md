# Windows 二进制文件编译指南

**版本**: v0.8.10  
**目标**: 解决 Bun 打包的 `Attempted to assign to readonly property` 错误

## 🐛 问题分析

用户报告的错误：
```
TypeError: Attempted to assign to readonly property.
  at Je0 (B:/~BUN/root/chrome-extension-debug-windows-x64.exe:417:49347)
```

**原因**: Bun 的打包器在处理某些 JavaScript 代码时，可能将可变属性错误地标记为只读。

## 🔧 解决方案

### 方案 1: 使用 pkg 打包（推荐）

`pkg` 是一个成熟的 Node.js 二进制打包工具。

#### 安装 pkg

```bash
npm install -g pkg
```

#### 编译

```bash
# 编译 Windows x64 版本
pkg build/src/index.js --target node20-win-x64 --output dist/chrome-extension-debug-windows-x64.exe

# 编译多个平台
pkg build/src/index.js \
  --targets node20-win-x64,node20-linux-x64,node20-macos-x64 \
  --output dist/chrome-extension-debug
```

### 方案 2: 使用 Node.js 原生 SEA (Single Executable Application)

Node.js 20+ 支持原生的单文件可执行程序。

#### 步骤

1. **创建配置文件 `sea-config.json`**:
```json
{
  "main": "build/src/index.js",
  "output": "sea-prep.blob",
  "disableExperimentalSEAWarning": true
}
```

2. **生成 blob**:
```bash
node --experimental-sea-config sea-config.json
```

3. **创建可执行文件** (在 Windows 上):
```cmd
REM 复制 node.exe
copy %NODE_HOME%\node.exe chrome-extension-debug.exe

REM 注入资源
npx postject chrome-extension-debug.exe NODE_SEA_BLOB sea-prep.blob ^
  --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2

REM 签名（可选）
signtool sign /fd SHA256 chrome-extension-debug.exe
```

### 方案 3: 更新 Bun 版本并重新编译

Bun 持续修复打包问题，更新到最新版本可能解决此问题。

```bash
# 更新 Bun
bun upgrade

# 重新编译
bun build src/index.ts --compile --outfile chrome-extension-debug-windows-x64.exe
```

### 方案 4: 使用 Nexe

另一个流行的 Node.js 打包工具。

```bash
npm install -g nexe

nexe build/src/index.js \
  --target windows-x64-20.0.0 \
  --output chrome-extension-debug-windows-x64.exe
```

## 📦 推荐的构建流程

### package.json 添加脚本

```json
{
  "scripts": {
    "build": "npm run build && tsc",
    "build:win": "pkg build/src/index.js --target node20-win-x64 --output dist/chrome-extension-debug-win-x64.exe",
    "build:linux": "pkg build/src/index.js --target node20-linux-x64 --output dist/chrome-extension-debug-linux-x64",
    "build:macos": "pkg build/src/index.js --target node20-macos-x64 --output dist/chrome-extension-debug-macos-x64",
    "build:all": "npm run build && npm run build:win && npm run build:linux && npm run build:macos"
  }
}
```

### CI/CD 集成

**.github/workflows/build-binaries.yml**:
```yaml
name: Build Binaries

on:
  push:
    tags:
      - 'v*'

jobs:
  build:
    runs-on: ${{ matrix.os }}
    strategy:
      matrix:
        os: [ubuntu-latest, windows-latest, macos-latest]
        node-version: [20]
    
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: ${{ matrix.node-version }}
      
      - name: Install dependencies
        run: npm ci
      
      - name: Build
        run: npm run build
      
      - name: Install pkg
        run: npm install -g pkg
      
      - name: Build binary
        run: |
          if [ "$RUNNER_OS" == "Windows" ]; then
            pkg build/src/index.js --target node20-win-x64 --output chrome-extension-debug-win-x64.exe
          elif [ "$RUNNER_OS" == "Linux" ]; then
            pkg build/src/index.js --target node20-linux-x64 --output chrome-extension-debug-linux-x64
          else
            pkg build/src/index.js --target node20-macos-x64 --output chrome-extension-debug-macos-x64
          fi
        shell: bash
      
      - name: Upload artifact
        uses: actions/upload-artifact@v3
        with:
          name: binaries-${{ matrix.os }}
          path: chrome-extension-debug-*
```

## 🧪 测试

### 测试编译的二进制文件

```bash
# Windows
.\chrome-extension-debug-windows-x64.exe --version
.\chrome-extension-debug-windows-x64.exe --transport sse --browserUrl http://localhost:9222 --port 32134

# Linux
./chrome-extension-debug-linux-x64 --version
./chrome-extension-debug-linux-x64 --transport sse --browserUrl http://localhost:9222 --port 32134

# macOS
./chrome-extension-debug-macos-x64 --version
./chrome-extension-debug-macos-x64 --transport sse --browserUrl http://localhost:9222 --port 32134
```

## 📝 注意事项

1. **依赖项**: 确保所有依赖都已编译到二进制文件中
2. **文件大小**: pkg 生成的文件较大（~50MB），这是正常的
3. **权限**: 某些系统可能需要管理员权限运行
4. **杀毒软件**: 可能被误报为病毒，需要添加例外
5. **签名**: 生产环境建议对二进制文件进行代码签名

## 🔍 调试编译问题

如果编译后的二进制无法运行：

1. **检查入口文件**:
```bash
node build/src/index.js
```

2. **查看依赖**:
```bash
npm list --production
```

3. **测试打包**:
```bash
pkg build/src/index.js --debug
```

4. **检查原生模块**:
   - `puppeteer` 包含原生二进制（Chrome），需要特殊处理
   - 可能需要使用 `--public` 标志

## 💡 临时解决方案

在修复二进制文件之前，用户可以：

1. **直接使用 Node.js**:
```bash
node build/src/index.js --transport sse --browserUrl http://localhost:9222 --port 32134
```

2. **创建批处理脚本** (Windows `run.bat`):
```batch
@echo off
node build\src\index.js %*
```

3. **创建 PowerShell 脚本** (Windows `run.ps1`):
```powershell
node build/src/index.js $args
```

## 📚 参考资料

- [pkg Documentation](https://github.com/vercel/pkg)
- [Node.js SEA](https://nodejs.org/api/single-executable-applications.html)
- [Nexe](https://github.com/nexe/nexe)
- [Bun Build](https://bun.sh/docs/bundler)

---

**最后更新**: 2025-10-14  
**维护者**: Chrome DevTools MCP Team
