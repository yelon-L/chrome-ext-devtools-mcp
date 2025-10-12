#!/bin/bash

# Chrome DevTools MCP 本地启动脚本

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_ROOT"

echo "╔═══════════════════════════════════════════════════════════╗"
echo "║  Chrome DevTools MCP 启动                                ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo ""

# 检查是否已编译
if [ ! -d "build" ]; then
  echo "📦 首次运行，正在安装依赖并编译..."
  npm install
  npm run build
  echo ""
fi

# 检查 Chrome 是否运行
CHROME_RUNNING=false
if curl -s http://localhost:9222/json/version > /dev/null 2>&1; then
  CHROME_RUNNING=true
  CHROME_VERSION=$(curl -s http://localhost:9222/json/version | grep -o '"Browser":"[^"]*"' | cut -d'"' -f4)
  echo "✅ 检测到 Chrome: $CHROME_VERSION"
else
  echo "⚠️  未检测到 Chrome (端口 9222)"
  echo ""
  echo "请先启动 Chrome:"
  echo "  google-chrome --remote-debugging-port=9222"
  echo ""
  echo "或使用 --start-chrome 参数自动启动"
  echo ""
  
  read -p "按 Enter 继续（如果 Chrome 已在其他端口运行）或 Ctrl+C 退出..."
fi

echo ""
echo "🚀 启动 Chrome DevTools MCP..."
echo ""

# 启动 MCP 服务器
node build/src/index.js "$@"
