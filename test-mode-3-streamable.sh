#!/bin/bash
# 测试模式3: Streamable HTTP

BINARY="./dist/chrome-devtools-mcp-linux-x64"
CHROME_9222="http://localhost:9222"
STREAM_PORT=38002

echo "╔═══════════════════════════════════════════════════════════╗"
echo "║  测试模式 3: Streamable HTTP                              ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo ""

# 检查Chrome
if ! curl -s $CHROME_9222/json/version > /dev/null 2>&1; then
    echo "❌ Chrome 9222 未启动"
    exit 1
fi
echo "✅ Chrome 9222 已就绪"
echo ""

echo "启动 Streamable HTTP 服务器 (端口 $STREAM_PORT)..."
$BINARY --transport streamable --port $STREAM_PORT --browserUrl $CHROME_9222 > /tmp/stream.log 2>&1 &
STREAM_PID=$!
echo "PID: $STREAM_PID"

sleep 4

if ! ps -p $STREAM_PID > /dev/null; then
    echo "❌ Streamable HTTP 服务器启动失败"
    cat /tmp/stream.log
    exit 1
fi

echo "✅ Streamable HTTP 服务器已启动"
echo ""

echo "测试 MCP 端点..."
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:$STREAM_PORT/mcp)
if [ "$HTTP_CODE" == "406" ] || [ "$HTTP_CODE" == "405" ] || [ "$HTTP_CODE" == "200" ]; then
    echo "✅ MCP 端点可访问 (状态码: $HTTP_CODE)"
else
    echo "⚠️  状态码: $HTTP_CODE"
fi

echo ""
echo "可用端点："
echo "  - http://localhost:$STREAM_PORT/mcp (POST)"

echo ""
echo "按 Ctrl+C 关闭服务器..."
wait $STREAM_PID
