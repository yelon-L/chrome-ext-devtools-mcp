#!/bin/bash
# 测试模式4: Multi-tenant

CHROME_9222="http://localhost:9222"
CHROME_9225="http://localhost:9225"
MT_PORT=38003

echo "╔═══════════════════════════════════════════════════════════╗"
echo "║  测试模式 4: Multi-tenant (多租户)                        ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo ""

# 检查Chrome
CHROME_9222_OK=false
CHROME_9225_OK=false

if curl -s $CHROME_9222/json/version > /dev/null 2>&1; then
    echo "✅ Chrome 9222 已就绪"
    CHROME_9222_OK=true
else
    echo "❌ Chrome 9222 未启动"
    exit 1
fi

if curl -s $CHROME_9225/json/version > /dev/null 2>&1; then
    echo "✅ Chrome 9225 已就绪"
    CHROME_9225_OK=true
else
    echo "⚠️  Chrome 9225 未启动（将只测试单用户）"
fi

echo ""

if [ ! -f "./build/src/multi-tenant/server-multi-tenant.js" ]; then
    echo "❌ Multi-tenant 入口文件不存在"
    exit 1
fi

echo "启动 Multi-tenant 服务器 (端口 $MT_PORT)..."
PORT=$MT_PORT AUTH_ENABLED=false node ./build/src/multi-tenant/server-multi-tenant.js > /tmp/mt.log 2>&1 &
MT_PID=$!
echo "PID: $MT_PID"

sleep 4

if ! ps -p $MT_PID > /dev/null; then
    echo "❌ Multi-tenant 服务器启动失败"
    cat /tmp/mt.log | head -n 20
    exit 1
fi

echo "✅ Multi-tenant 服务器已启动"
echo ""

echo "测试健康检查..."
HEALTH=$(curl -s http://localhost:$MT_PORT/health)
if echo "$HEALTH" | grep -q "ok"; then
    echo "✅ 健康检查通过"
    echo "$HEALTH" | jq '.status, .version, .sessions' 2>/dev/null || echo "$HEALTH" | head -c 150
else
    echo "❌ 健康检查失败"
fi

echo ""
echo ""

echo "注册用户1 (alice) -> Chrome 9222..."
USER1=$(curl -s -X POST http://localhost:$MT_PORT/api/register \
    -H "Content-Type: application/json" \
    -d "{\"userId\":\"alice\",\"browserURL\":\"$CHROME_9222\"}")

if echo "$USER1" | grep -q "success"; then
    echo "✅ alice 注册成功"
else
    echo "❌ alice 注册失败: $USER1"
fi

echo ""

if $CHROME_9225_OK; then
    echo "注册用户2 (bob) -> Chrome 9225..."
    USER2=$(curl -s -X POST http://localhost:$MT_PORT/api/register \
        -H "Content-Type: application/json" \
        -d "{\"userId\":\"bob\",\"browserURL\":\"$CHROME_9225\"}")
    
    if echo "$USER2" | grep -q "success"; then
        echo "✅ bob 注册成功"
    else
        echo "❌ bob 注册失败: $USER2"
    fi
    echo ""
fi

echo "列出所有用户..."
curl -s http://localhost:$MT_PORT/api/users | jq '.users' 2>/dev/null || curl -s http://localhost:$MT_PORT/api/users

echo ""
echo ""
echo "可用端点:"
echo "  - http://localhost:$MT_PORT/health"
echo "  - http://localhost:$MT_PORT/api/users"
echo "  - http://localhost:$MT_PORT/sse?userId=alice"
if $CHROME_9225_OK; then
    echo "  - http://localhost:$MT_PORT/sse?userId=bob"
fi
echo "  - http://localhost:$MT_PORT/test"

echo ""
echo "按 Ctrl+C 关闭服务器..."
wait $MT_PID
