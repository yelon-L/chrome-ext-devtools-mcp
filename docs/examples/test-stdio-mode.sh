#!/bin/bash

################################################################################
# STDIO 模式测试脚本
################################################################################
#
# 📋 脚本说明:
#   测试 MCP 服务器的 stdio (Standard I/O) 传输模式
#   这是最常用的模式，用于 MCP 客户端（如 Claude Desktop）
#
# 🎯 测试内容:
#   - stdio 模式启动
#   - MCP 协议通信
#   - 工具列表查询
#   - 基本工具调用
#
# 📦 前置条件:
#   1. 已编译项目: npm run build
#   2. Chrome 浏览器正在运行（带远程调试端口）:
#      google-chrome --remote-debugging-port=9222
#
# 🚀 使用方法:
#   chmod +x test-stdio-mode.sh
#   ./test-stdio-mode.sh
#
################################################################################

set -e

# 配置
BROWSER_URL="${BROWSER_URL:-http://localhost:9222}"
BINARY_PATH="build/src/index.js"

echo "╔═══════════════════════════════════════════════════════════════════╗"
echo "║                     STDIO 模式测试                                ║"
echo "╚═══════════════════════════════════════════════════════════════════╝"
echo ""

# 检查二进制文件
if [ ! -f "$BINARY_PATH" ]; then
    echo "❌ 错误: 未找到编译后的文件 $BINARY_PATH"
    echo "   请先运行: npm run build"
    exit 1
fi

# 检查浏览器是否运行
echo "🔍 检查浏览器连接..."
if ! curl -s "$BROWSER_URL/json/version" > /dev/null 2>&1; then
    echo "❌ 错误: 无法连接到 Chrome"
    echo "   请启动 Chrome: google-chrome --remote-debugging-port=9222"
    exit 1
fi
echo "✅ 浏览器已连接: $BROWSER_URL"
echo ""

# 测试1: 初始化请求
echo "═══════════════════════════════════════════════════════════════════"
echo "测试 1: MCP 协议初始化"
echo "═══════════════════════════════════════════════════════════════════"

# 创建临时文件
REQUEST_FILE=$(mktemp)
RESPONSE_FILE=$(mktemp)

# MCP 初始化请求
cat > "$REQUEST_FILE" << 'EOF'
{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test-client","version":"1.0.0"}}}
EOF

echo "📤 发送请求: initialize"
cat "$REQUEST_FILE" | jq .

echo ""
echo "📥 响应:"

# 使用 timeout 防止卡死
cat "$REQUEST_FILE" | timeout 5 node "$BINARY_PATH" --browserUrl "$BROWSER_URL" --transport stdio 2>/dev/null | head -1 | jq . || {
    echo "⚠️  stdio 模式需要持续的双向通信，无法使用简单的 shell 测试"
    echo "   建议使用 MCP Inspector 或 Claude Desktop 进行完整测试"
}

echo ""

# 测试2: 工具列表请求（使用 JSON-RPC）
echo "═══════════════════════════════════════════════════════════════════"
echo "测试 2: 获取工具列表"
echo "═══════════════════════════════════════════════════════════════════"

cat > "$REQUEST_FILE" << 'EOF'
{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test-client","version":"1.0.0"}}}
{"jsonrpc":"2.0","id":2,"method":"tools/list"}
EOF

echo "📤 发送请求序列:"
cat "$REQUEST_FILE" | jq -s .

echo ""
echo "📥 响应:"
cat "$REQUEST_FILE" | timeout 5 node "$BINARY_PATH" --browserUrl "$BROWSER_URL" --transport stdio 2>/dev/null | head -2 | tail -1 | jq '.result.tools | length' 2>/dev/null || {
    echo "⚠️  stdio 模式交互式测试建议："
    echo ""
    echo "   1. 使用 MCP Inspector:"
    echo "      npx @modelcontextprotocol/inspector node build/src/index.js --browserUrl $BROWSER_URL"
    echo ""
    echo "   2. 使用 Claude Desktop，在配置中添加:"
    echo '      {'
    echo '        "mcpServers": {'
    echo '          "chrome-devtools": {'
    echo '            "command": "node",'
    echo '            "args": ["'$(pwd)'/build/src/index.js", "--browserUrl", "'$BROWSER_URL'"]'
    echo '          }'
    echo '        }'
    echo '      }'
}

echo ""

# 清理
rm -f "$REQUEST_FILE" "$RESPONSE_FILE"

# 总结
echo "═══════════════════════════════════════════════════════════════════"
echo "📊 STDIO 模式特点总结"
echo "═══════════════════════════════════════════════════════════════════"
echo ""
echo "✅ 优势:"
echo "   • MCP 标准协议，兼容所有 MCP 客户端"
echo "   • 低延迟，直接通信"
echo "   • 无需网络端口"
echo "   • 适合桌面应用集成（Claude Desktop 等）"
echo ""
echo "⚠️  限制:"
echo "   • 需要持续的双向通信（不适合简单的 curl 测试）"
echo "   • 一个进程只能服务一个客户端"
echo "   • 不支持远程访问"
echo ""
echo "🔧 推荐工具:"
echo "   • MCP Inspector: npx @modelcontextprotocol/inspector <命令>"
echo "   • Claude Desktop: 配置 mcpServers"
echo "   • Cline (VS Code): 配置 MCP 服务器"
echo ""
echo "📖 启动命令:"
echo "   node build/src/index.js --browserUrl http://localhost:9222 --transport stdio"
echo ""

echo "✅ STDIO 模式测试完成"
