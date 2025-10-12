#!/bin/bash

# MCP 远程客户端配置生成器
# 用于生成连接到远程 MCP 服务器的配置

echo "╔═══════════════════════════════════════════════════════════╗"
echo "║  MCP 远程客户端配置生成                                  ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo ""

# 获取参数
MCP_SERVER="${1:-}"
USER_ID="${2:-$(whoami)}"

if [ -z "$MCP_SERVER" ]; then
  echo "使用方法: $0 <MCP_SERVER_IP:PORT> [USER_ID]"
  echo ""
  echo "示例:"
  echo "  $0 192.168.1.50:3000"
  echo "  $0 192.168.1.50:3000 developer-a"
  echo ""
  exit 1
fi

echo "配置参数:"
echo "  MCP Server: $MCP_SERVER"
echo "  User ID: $USER_ID"
echo ""

# 测试连接
echo "📡 测试连接到 MCP Server..."
if curl -s "http://$MCP_SERVER/health" > /dev/null 2>&1; then
  echo "✅ 连接成功!"
  HEALTH=$(curl -s "http://$MCP_SERVER/health")
  echo "   $HEALTH"
else
  echo "❌ 无法连接到 MCP Server"
  echo ""
  echo "请确认:"
  echo "  1. MCP Server 已启动"
  echo "  2. 网络可达 (ping $MCP_SERVER)"
  echo "  3. 防火墙未阻止端口"
  exit 1
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  生成配置文件"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# 1. Cline 配置
CLINE_CONFIG="$HOME/.config/Code/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json"
mkdir -p "$(dirname "$CLINE_CONFIG")"

cat > "$CLINE_CONFIG" <<EOF
{
  "mcpServers": {
    "chrome-devtools-remote": {
      "url": "http://$MCP_SERVER/sse"
    }
  }
}
EOF

echo "✅ Cline 配置: $CLINE_CONFIG"

# 2. Claude Desktop 配置
CLAUDE_DIR=""
if [[ "$OSTYPE" == "darwin"* ]]; then
  CLAUDE_DIR="$HOME/Library/Application Support/Claude"
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
  CLAUDE_DIR="$HOME/.config/Claude"
fi

if [ -n "$CLAUDE_DIR" ]; then
  mkdir -p "$CLAUDE_DIR"
  CLAUDE_CONFIG="$CLAUDE_DIR/claude_desktop_config.json"
  
  cat > "$CLAUDE_CONFIG" <<EOF
{
  "mcpServers": {
    "chrome-devtools-remote": {
      "url": "http://$MCP_SERVER/sse"
    }
  }
}
EOF
  
  echo "✅ Claude Desktop: $CLAUDE_CONFIG"
fi

# 3. VS Code 配置（项目级）
VSCODE_CONFIG=".vscode/settings.json"
mkdir -p .vscode

cat > "$VSCODE_CONFIG" <<EOF
{
  "mcp.servers": {
    "chrome-devtools-remote": {
      "url": "http://$MCP_SERVER/sse"
    }
  }
}
EOF

echo "✅ VS Code (项目): $VSCODE_CONFIG"

# 4. 通用配置（复制粘贴用）
GENERIC_CONFIG="mcp-remote-config.json"

cat > "$GENERIC_CONFIG" <<EOF
{
  "mcpServers": {
    "chrome-devtools-remote": {
      "url": "http://$MCP_SERVER/sse"
    }
  }
}
EOF

echo "✅ 通用配置: $GENERIC_CONFIG"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  使用说明"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "1. Cline: 重启 VS Code，配置已自动生效"
echo ""
echo "2. Claude Desktop: 重启 Claude Desktop"
echo ""
echo "3. VS Code MCP: 重启 VS Code 或重新加载窗口"
echo ""
echo "4. 其他 IDE: 复制 mcp-remote-config.json 的内容"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "✅ 配置生成完成！"
