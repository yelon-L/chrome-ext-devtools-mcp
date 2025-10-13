#!/bin/bash
# 测试模式2: SSE

BINARY="./dist/chrome-devtools-mcp-linux-x64"
CHROME_9222="http://localhost:9222"
SSE_PORT=38001

echo "╔═══════════════════════════════════════════════════════════╗"
echo "║  测试模式 2: SSE (Server-Sent Events)                    ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo ""

# 检查Chrome
if ! curl -s $CHROME_9222/json/version > /dev/null 2>&1; then
    echo "❌ Chrome 9222 未启动"
    exit 1
fi
echo "✅ Chrome 9222 已就绪"
echo ""

echo "启动 SSE 服务器 (端口 $SSE_PORT)..."
$BINARY --transport sse --port $SSE_PORT --browserUrl $CHROME_9222 > /tmp/sse.log 2>&1 &
SSE_PID=$!
echo "PID: $SSE_PID"

sleep 4

if ! ps -p $SSE_PID > /dev/null; then
    echo "❌ SSE 服务器启动失败"
    cat /tmp/sse.log
    exit 1
fi

echo "✅ SSE 服务器已启动"
echo ""

echo "测试健康检查..."
HEALTH=$(curl -s http://localhost:$SSE_PORT/health)
if echo "$HEALTH" | grep -q "ok"; then
    echo "✅ 健康检查通过"
    echo "$HEALTH"
else
    echo "❌ 健康检查失败"
fi

echo ""
echo "可用端点："
echo "  - http://localhost:$SSE_PORT/health"
echo "  - http://localhost:$SSE_PORT/sse"
echo "  - http://localhost:$SSE_PORT/test"

echo ""
echo "按 Ctrl+C 关闭服务器..."
wait $SSE_PID
