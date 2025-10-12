#!/bin/bash

# MCP 远程服务启动脚本
# 用于在服务器节点启动 MCP SSE 服务，供局域网其他开发者使用

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_ROOT"

echo "╔═══════════════════════════════════════════════════════════╗"
echo "║  Chrome Extension Debug MCP 远程服务启动                 ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo ""

# 默认配置
PORT="${PORT:-3000}"
BROWSER_URL="${BROWSER_URL:-http://localhost:9222}"

# 检查编译
if [ ! -d "build" ]; then
  echo "📦 首次运行，正在编译..."
  npm install
  npm run build
  echo ""
fi

# 获取本机 IP
get_local_ip() {
  if command -v ip &> /dev/null; then
    ip route get 1.1.1.1 | awk '{print $7; exit}'
  elif command -v ifconfig &> /dev/null; then
    ifconfig | grep -Eo 'inet (addr:)?([0-9]*\.){3}[0-9]*' | grep -Eo '([0-9]*\.){3}[0-9]*' | grep -v '127.0.0.1' | head -n 1
  else
    echo "localhost"
  fi
}

LOCAL_IP=$(get_local_ip)

echo "🌐 服务器配置:"
echo "   IP 地址: $LOCAL_IP"
echo "   端口: $PORT"
echo "   Chrome: $BROWSER_URL"
echo ""

# 检查 Chrome 是否运行
if curl -s "$BROWSER_URL/json/version" > /dev/null 2>&1; then
  CHROME_VERSION=$(curl -s "$BROWSER_URL/json/version" | grep -o '"Browser":"[^"]*"' | cut -d'"' -f4)
  echo "✅ Chrome 已连接: $CHROME_VERSION"
else
  echo "⚠️  警告: 无法连接到 Chrome ($BROWSER_URL)"
  echo ""
  echo "请先启动 Chrome:"
  echo "  google-chrome --remote-debugging-port=9222"
  echo ""
  read -p "是否继续启动 MCP 服务? (y/N) " -n 1 -r
  echo
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    exit 1
  fi
fi

echo ""
echo "🚀 启动 MCP SSE 服务器..."
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  客户端连接配置"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "IDE 配置 (Cline/Claude Desktop/VS Code):"
echo ""
echo '{'
echo '  "mcpServers": {'
echo '    "chrome-extension-debug-remote": {'
echo "      \"url\": \"http://$LOCAL_IP:$PORT/sse\""
echo '    }'
echo '  }'
echo '}'
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "测试端点:"
echo "  健康检查: http://$LOCAL_IP:$PORT/health"
echo "  测试页面: http://$LOCAL_IP:$PORT/test"
echo "  SSE 端点: http://$LOCAL_IP:$PORT/sse"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# 启动服务器
PORT=$PORT node build/src/server-sse.js --browser-url "$BROWSER_URL" "$@"
