#!/bin/bash

# Chrome Extension Debug MCP - Streamable HTTP 启动脚本（推荐）
# 比 SSE 更简单、更稳定、更兼容
# 
# 支持两种模式：
# 1. 本地模式：MCP 和 Chrome 在同一机器
# 2. 远程模式：MCP 在服务器，Chrome 在开发者机器（推荐）

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_ROOT"

echo "╔═══════════════════════════════════════════════════════════╗"
echo "║  Chrome Extension Debug MCP - Streamable HTTP 启动       ║"
echo "║  （推荐方式：更简单、更稳定、节省 75% 资源）            ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo ""

# 默认配置
PORT="${PORT:-32123}"
BROWSER_URL="${BROWSER_URL:-}"
REMOTE_MODE="${REMOTE_MODE:-auto}"  # auto, local, remote

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
echo "   Caddy 端口: 3000 (对外)"
echo "   MCP 端口: $PORT (内部)"
echo "   Chrome: $BROWSER_URL"
echo "   传输方式: Streamable HTTP ✅"
echo ""

# 检测运行模式
if [ -z "$BROWSER_URL" ]; then
  # 未指定浏览器 URL，自动检测
  if curl -s http://localhost:9222/json/version > /dev/null 2>&1; then
    BROWSER_URL="http://localhost:9222"
    REMOTE_MODE="local"
    echo "🔍 检测到本地 Chrome"
  else
    BROWSER_URL=""
    REMOTE_MODE="remote"
    echo "🌐 远程模式：客户端提供 Chrome"
  fi
fi

# 检查 Chrome 连接
if [ -n "$BROWSER_URL" ]; then
  if curl -s "$BROWSER_URL/json/version" > /dev/null 2>&1; then
    CHROME_VERSION=$(curl -s "$BROWSER_URL/json/version" | grep -o '"Browser":"[^"]*"' | cut -d'"' -f4)
    echo "✅ Chrome 已连接: $CHROME_VERSION"
    echo "   URL: $BROWSER_URL"
  else
    echo "⚠️  警告: 无法连接到 Chrome ($BROWSER_URL)"
    echo ""
    if [ "$REMOTE_MODE" = "local" ]; then
      echo "请先启动 Chrome:"
      echo "  google-chrome --remote-debugging-port=9222"
      echo ""
      read -p "是否继续启动 MCP 服务? (y/N) " -n 1 -r
      echo
      if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
      fi
    fi
  fi
else
  echo "📋 远程模式：等待客户端提供 Chrome URL"
  echo ""
  echo "客户端需要："
  echo "  1. 启动 Chrome: chrome --remote-debugging-port=9222"
  echo "  2. 开放端口: 允许服务器访问 9222"
  echo "  3. 在 MCP 配置中指定 Chrome URL"
fi

echo ""
echo "🚀 启动 MCP Streamable HTTP 服务..."
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  运行模式: $REMOTE_MODE"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

if [ "$REMOTE_MODE" = "remote" ]; then
  echo "🌐 远程模式配置说明"
  echo ""
  echo "架构："
  echo "  开发者机器 A          MCP 服务器         开发者机器 B"
  echo "  ├─ IDE             ┌───────────┐        ├─ IDE"
  echo "  ├─ Chrome :9222 ←──┤ MCP Tools │──────→ Chrome :9222"
  echo "  └─ 连接 MCP ────→  └───────────┘  ←──── 连接 MCP"
  echo ""
  echo "每个开发者需要："
  echo "  1. 启动本地 Chrome:"
  echo "     chrome --remote-debugging-port=9222 --remote-allow-origins=*"
  echo ""
  echo "  2. 开放防火墙（允许服务器访问）:"
  echo "     sudo ufw allow from $LOCAL_IP to any port 9222"
  echo ""
  echo "  3. IDE 配置（指定 Chrome URL）:"
  echo '     {'
  echo '       "mcpServers": {'
  echo '         "chrome-extension-debug": {'
  echo "           \"url\": \"http://$LOCAL_IP:3000/mcp\","
  echo '           "env": {'
  echo '             "BROWSER_URL": "http://开发者IP:9222"'
  echo '           }'
  echo '         }'
  echo '       }'
  echo '     }'
  echo ""
else
  echo "📍 本地模式配置"
  echo ""
  echo "IDE 配置 (Cline/Claude Desktop/VS Code):"
  echo ""
  echo '{'
  echo '  "mcpServers": {'
  echo '    "chrome-extension-debug": {'
  echo "      \"url\": \"http://$LOCAL_IP:3000/mcp\""
  echo '    }'
  echo '  }'
  echo '}'
  echo ""
fi

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "测试端点:"
echo "  健康检查: curl http://$LOCAL_IP:3000/health"
echo "  测试页面: http://$LOCAL_IP:3000/test"
echo "  MCP 端点: http://$LOCAL_IP:3000/mcp"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# 启动服务器
if [ -n "$BROWSER_URL" ]; then
  echo "启动参数: --browser-url $BROWSER_URL"
  PORT=$PORT node build/src/server-http.js --browser-url "$BROWSER_URL" "$@"
else
  echo "远程模式：MCP 将从客户端环境变量获取 Chrome URL"
  echo "提示：客户端需要设置 BROWSER_URL 环境变量"
  PORT=$PORT node build/src/server-http.js "$@"
fi
