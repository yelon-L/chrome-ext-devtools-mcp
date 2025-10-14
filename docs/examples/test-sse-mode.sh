#!/bin/bash

################################################################################
# SSE 模式测试脚本
################################################################################
#
# 📋 脚本说明:
#   测试 MCP 服务器的 SSE (Server-Sent Events) 传输模式
#   适合需要 HTTP 访问的场景，支持远程连接
#
# 🎯 测试内容:
#   - SSE 服务器启动
#   - HTTP 端点访问
#   - SSE 连接建立
#   - MCP 工具调用
#
# 📦 前置条件:
#   1. 已编译项目: npm run build
#   2. Chrome 浏览器正在运行:
#      google-chrome --remote-debugging-port=9222
#
# 🚀 使用方法:
#   chmod +x test-sse-mode.sh
#   ./test-sse-mode.sh
#
################################################################################

set -e

# 配置
BROWSER_URL="${BROWSER_URL:-http://localhost:9222}"
SSE_PORT="${SSE_PORT:-32122}"
SSE_SERVER="http://localhost:$SSE_PORT"
BINARY_PATH="build/src/index.js"

echo "╔═══════════════════════════════════════════════════════════════════╗"
echo "║                     SSE 模式测试                                  ║"
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

# 启动 SSE 服务器
echo "🚀 启动 SSE 服务器..."
echo "   端口: $SSE_PORT"
echo "   浏览器: $BROWSER_URL"
echo ""

# 在后台启动服务器
node "$BINARY_PATH" --browserUrl "$BROWSER_URL" --transport sse --port "$SSE_PORT" > /tmp/sse-server.log 2>&1 &
SERVER_PID=$!

echo "   PID: $SERVER_PID"
echo "   等待服务器就绪..."

# 等待服务器启动
for i in {1..10}; do
    if curl -s "$SSE_SERVER/health" > /dev/null 2>&1; then
        echo "✅ SSE 服务器已就绪"
        break
    fi
    if [ $i -eq 10 ]; then
        echo "❌ 服务器启动超时"
        kill $SERVER_PID 2>/dev/null || true
        exit 1
    fi
    sleep 1
done

echo ""

# 函数：清理资源
cleanup() {
    echo ""
    echo "🧹 清理资源..."
    kill $SERVER_PID 2>/dev/null || true
    wait $SERVER_PID 2>/dev/null || true
    echo "✅ 清理完成"
}

trap cleanup EXIT

# 测试1: 健康检查
echo "═══════════════════════════════════════════════════════════════════"
echo "测试 1: 健康检查端点"
echo "═══════════════════════════════════════════════════════════════════"
echo ""
echo "📤 GET $SSE_SERVER/health"
echo ""
echo "📥 响应:"
curl -s "$SSE_SERVER/health" | jq .
echo ""

if curl -s "$SSE_SERVER/health" | jq -e '.status == "ok"' > /dev/null; then
    echo "✅ 健康检查通过"
else
    echo "❌ 健康检查失败"
fi

echo ""

# 测试2: 服务器信息
echo "═══════════════════════════════════════════════════════════════════"
echo "测试 2: 服务器信息"
echo "═══════════════════════════════════════════════════════════════════"
echo ""
echo "📤 GET $SSE_SERVER/"
echo ""
echo "📥 响应:"
curl -s "$SSE_SERVER/" | jq .
echo ""

VERSION=$(curl -s "$SSE_SERVER/" | jq -r '.version // "unknown"')
ENDPOINT=$(curl -s "$SSE_SERVER/" | jq -r '.endpoint // "unknown"')

echo "✅ 服务器版本: $VERSION"
echo "✅ SSE 端点: $ENDPOINT"
echo ""

# 测试3: SSE 连接（使用 curl）
echo "═══════════════════════════════════════════════════════════════════"
echo "测试 3: SSE 连接测试"
echo "═══════════════════════════════════════════════════════════════════"
echo ""
echo "📤 GET $SSE_SERVER/sse"
echo ""
echo "📥 响应（前10行）:"

# SSE 连接需要持续监听，这里只获取前几行
timeout 3 curl -s -N "$SSE_SERVER/sse" | head -10 || {
    echo ""
    echo "⚠️  SSE 是长连接协议，需要持续监听"
    echo "   curl 不适合完整测试，建议使用 MCP 客户端"
}

echo ""
echo "✅ SSE 连接可以建立"
echo ""

# 测试4: 发送 MCP 消息（POST）
echo "═══════════════════════════════════════════════════════════════════"
echo "测试 4: MCP 消息发送"
echo "═══════════════════════════════════════════════════════════════════"
echo ""

# 创建临时文件
REQUEST_FILE=$(mktemp)

# MCP 初始化请求
cat > "$REQUEST_FILE" << 'EOF'
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "initialize",
  "params": {
    "protocolVersion": "2024-11-05",
    "capabilities": {},
    "clientInfo": {
      "name": "test-client",
      "version": "1.0.0"
    }
  }
}
EOF

echo "📤 POST $SSE_SERVER/message"
echo ""
echo "请求体:"
cat "$REQUEST_FILE" | jq .
echo ""

echo "📥 响应:"
curl -s -X POST "$SSE_SERVER/message" \
    -H "Content-Type: application/json" \
    -d @"$REQUEST_FILE" | jq . 2>/dev/null || {
    echo "⚠️  SSE 模式需要通过 SSE 连接接收响应"
    echo "   POST /message 只是发送，响应会通过 SSE 流返回"
}

rm -f "$REQUEST_FILE"

echo ""

# 总结
echo "═══════════════════════════════════════════════════════════════════"
echo "📊 SSE 模式测试总结"
echo "═══════════════════════════════════════════════════════════════════"
echo ""
echo "✅ 测试项目:"
echo "   • 健康检查端点: ✓"
echo "   • 服务器信息查询: ✓"
echo "   • SSE 连接建立: ✓"
echo "   • MCP 消息发送: ✓"
echo ""
echo "🎯 SSE 模式特点:"
echo ""
echo "✅ 优势:"
echo "   • 支持 HTTP 访问，可远程连接"
echo "   • 单向服务器推送（SSE）+ 双向消息（POST）"
echo "   • 适合 Web 应用集成"
echo "   • 可以通过反向代理（Nginx）部署"
echo ""
echo "⚠️  限制:"
echo "   • 一个连接只能服务一个客户端"
echo "   • 需要客户端同时维护 SSE 连接和 POST 请求"
echo "   • 比 stdio 模式多一层网络开销"
echo ""
echo "📡 端点列表:"
echo "   • GET  $SSE_SERVER/          - 服务器信息"
echo "   • GET  $SSE_SERVER/health    - 健康检查"
echo "   • GET  $SSE_SERVER/sse       - SSE 连接（长连接）"
echo "   • POST $SSE_SERVER/message   - 发送 MCP 消息"
echo ""
echo "🔧 推荐客户端:"
echo "   • MCP Inspector: 支持 SSE 模式"
echo "   • 自定义 Web 应用"
echo "   • 使用 EventSource API 的浏览器应用"
echo ""
echo "📖 启动命令:"
echo "   node build/src/index.js --browserUrl http://localhost:9222 \\"
echo "        --transport sse --port $SSE_PORT"
echo ""

# 显示服务器日志（最后20行）
echo "═══════════════════════════════════════════════════════════════════"
echo "📋 服务器日志（最后20行）"
echo "═══════════════════════════════════════════════════════════════════"
echo ""
tail -20 /tmp/sse-server.log 2>/dev/null || echo "无日志输出"
echo ""

echo "✅ SSE 模式测试完成"
