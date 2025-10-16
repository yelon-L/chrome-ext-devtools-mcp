#!/bin/bash

# Chrome Extension Debug MCP - Bun 打包脚本
# 跨平台编译，一键打包所有平台

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_ROOT"

echo "╔═══════════════════════════════════════════════════════════╗"
echo "║  Chrome Extension Debug MCP - Bun 打包                   ║"
echo "║  跨平台编译：Linux, macOS, Windows                       ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo ""

# 检查 Bun
if ! command -v bun &> /dev/null; then
  echo "❌ Bun 未安装"
  echo ""
  echo "安装 Bun:"
  echo "  curl -fsSL https://bun.sh/install | bash"
  echo ""
  echo "或访问: https://bun.sh"
  exit 1
fi

BUN_VERSION=$(bun --version)
echo "✅ Bun 版本: $BUN_VERSION"
echo ""

# 1. 编译 TypeScript
echo "1️⃣ 编译 TypeScript..."
npm run build
echo ""

# 2. 创建输出目录
echo "2️⃣ 创建输出目录..."
mkdir -p dist
echo ""

# 3. 打包所有平台
echo "3️⃣ 打包可执行文件..."
echo ""

# 定义平台
declare -A targets=(
  ["linux-x64"]="bun-linux-x64"
  ["linux-arm64"]="bun-linux-arm64"
  ["macos-x64"]="bun-darwin-x64"
  ["macos-arm64"]="bun-darwin-arm64"
  ["windows-x64"]="bun-windows-x64"
)

binaryName="chrome-extension-debug"

# 打包
for platform in "${!targets[@]}"; do
  target="${targets[$platform]}"
  
  if [[ "$platform" == "windows-x64" ]]; then
    outfile="dist/${binaryName}-${platform}.exe"
  else
    outfile="dist/${binaryName}-${platform}"
  fi
  
  echo "   📦 打包 $platform ($target)..."
  
  # 捕获输出并过滤 CodeMirror 警告
  output=$(bun build --compile ./build/src/index.js \
    --outfile "$outfile" \
    --target="$target" \
    --minify 2>&1)
  
  build_status=$?
  
  # 过滤掉 CodeMirror 相关的警告
  # 过滤包含关键字的行以及它们相关的上下文行（箭头和路径）
  filtered_output=$(echo "$output" | grep -v "cssStreamParser\|StringStream\|css\.cssLanguage\|CodeMirrorUtils\.js\|CSSPropertyParser\.js" | grep -v "^ *\^$")
  
  # 只输出编译进度信息（minify, bundle, compile 行）
  echo "$filtered_output" | grep -E "minify|bundle|compile|error|Error" || true
  
  if [ $build_status -eq 0 ]; then
    echo "   ✅ $platform 完成"
  else
    echo "   ❌ $platform 失败"
  fi
  echo ""
done

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ 打包完成！"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📁 输出目录: dist/"
echo ""
echo "📦 文件列表:"
ls -lh dist/ | grep ${binaryName}

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🚀 使用方法"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "stdio (default):"
echo "  ./dist/${binaryName}-linux-x64"
echo ""
echo "SSE server:"
echo "  ./dist/${binaryName}-linux-x64 --transport sse"
echo ""
echo "Streamable HTTP server:"
echo "  ./dist/${binaryName}-linux-x64 --transport streamable --port 3000"
echo ""
echo "Multi-tenant server:"
echo "  ./dist/${binaryName}-linux-x64 --mode multi-tenant"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
