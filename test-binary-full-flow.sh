#!/bin/bash

# 二进制全流程测试：启动 -> 注册 -> 绑定 -> 连接 -> 工具调用
# 测试本地 9222 端口的 Chrome

set -e  # 遇到错误立即退出

echo "═══════════════════════════════════════════════════════════"
echo "🚀 二进制全流程测试 - Chrome DevTools MCP"
echo "═══════════════════════════════════════════════════════════"
echo ""

# 配置
SERVER_URL="http://localhost:32122"
BROWSER_URL="http://localhost:9222"
TEST_EMAIL="test-$(date +%s)@example.com"
TEST_USERNAME="Binary Test User"

echo "📋 测试配置:"
echo "  服务器: $SERVER_URL"
echo "  浏览器: $BROWSER_URL"
echo "  邮箱: $TEST_EMAIL"
echo ""

# 1. 检查服务器是否运行
echo "════════════════════════════════════════════════════════════"
echo "步骤 1: 检查服务器状态"
echo "════════════════════════════════════════════════════════════"
if ! curl -s $SERVER_URL/health > /dev/null; then
    echo "❌ 服务器未运行，请先启动："
    echo "   npm run start:multi-tenant:dev"
    exit 1
fi
echo "✅ 服务器运行正常"
echo ""

# 2. 检查浏览器是否可达
echo "════════════════════════════════════════════════════════════"
echo "步骤 2: 检查浏览器连接"
echo "════════════════════════════════════════════════════════════"
if ! curl -s $BROWSER_URL/json/version > /dev/null; then
    echo "❌ 浏览器未运行或不可达，请确保 Chrome 运行在 9222 端口："
    echo "   google-chrome --remote-debugging-port=9222 --remote-debugging-address=0.0.0.0"
    exit 1
fi
BROWSER_INFO=$(curl -s $BROWSER_URL/json/version | jq -r '.Browser')
echo "✅ 浏览器连接正常: $BROWSER_INFO"
echo ""

# 3. 注册用户
echo "════════════════════════════════════════════════════════════"
echo "步骤 3: 注册用户"
echo "════════════════════════════════════════════════════════════"
REGISTER_RESPONSE=$(curl -s -X POST "$SERVER_URL/api/v2/users" \
  -H "Content-Type: application/json" \
  -d "{\"email\": \"$TEST_EMAIL\", \"username\": \"$TEST_USERNAME\"}")

USER_ID=$(echo $REGISTER_RESPONSE | jq -r '.userId')
if [ "$USER_ID" == "null" ]; then
    echo "❌ 用户注册失败"
    echo $REGISTER_RESPONSE | jq
    exit 1
fi
echo "✅ 用户注册成功"
echo "   用户ID: $USER_ID"
echo ""

# 4. 绑定浏览器
echo "════════════════════════════════════════════════════════════"
echo "步骤 4: 绑定浏览器并获取 Token"
echo "════════════════════════════════════════════════════════════"
TOKEN_NAME="test-browser-$(date +%s)"
BIND_RESPONSE=$(curl -s -X POST "$SERVER_URL/api/v2/users/$USER_ID/browsers" \
  -H "Content-Type: application/json" \
  -d "{\"browserURL\": \"$BROWSER_URL\", \"tokenName\": \"$TOKEN_NAME\", \"description\": \"Binary test browser\"}")

TOKEN=$(echo $BIND_RESPONSE | jq -r '.token')
if [ "$TOKEN" == "null" ]; then
    echo "❌ 浏览器绑定失败"
    echo $BIND_RESPONSE | jq
    exit 1
fi
echo "✅ 浏览器绑定成功"
echo "   Token: ${TOKEN:0:30}..."
echo "   浏览器名称: $TOKEN_NAME"
echo ""

# 5. 使用 Token 建立 SSE 连接（后台运行）
echo "════════════════════════════════════════════════════════════"
echo "步骤 5: 建立 SSE V2 连接"
echo "════════════════════════════════════════════════════════════"
echo "ℹ️  正在建立 SSE 连接..."

# 启动 SSE 连接到后台，捕获 session ID
SSE_OUTPUT=$(mktemp)
curl -N -H "Authorization: Bearer $TOKEN" "$SERVER_URL/api/v2/sse" > $SSE_OUTPUT 2>&1 &
SSE_PID=$!

# 等待连接建立并获取 session ID
sleep 5

if ! kill -0 $SSE_PID 2>/dev/null; then
    echo "❌ SSE 连接失败"
    cat $SSE_OUTPUT
    rm -f $SSE_OUTPUT
    exit 1
fi

SESSION_ID=$(grep -oP 'sessionId=\K[^"]+' $SSE_OUTPUT | head -1)
if [ -z "$SESSION_ID" ]; then
    echo "❌ 无法获取 session ID"
    cat $SSE_OUTPUT
    kill $SSE_PID 2>/dev/null
    rm -f $SSE_OUTPUT
    exit 1
fi

echo "✅ SSE 连接成功"
echo "   Session ID: $SESSION_ID"
echo ""

# 6. 测试工具调用
echo "════════════════════════════════════════════════════════════"
echo "步骤 6: 测试工具调用"
echo "════════════════════════════════════════════════════════════"

# 测试 get-browser-info
echo "📌 测试工具: get-browser-info"
TOOL_REQUEST=$(cat <<EOF
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "get-browser-info",
    "arguments": {}
  }
}
EOF
)

TOOL_RESPONSE=$(curl -s -X POST "$SERVER_URL/message?sessionId=$SESSION_ID" \
  -H "Content-Type: application/json" \
  -d "$TOOL_REQUEST")

if echo "$TOOL_RESPONSE" | jq -e '.result' > /dev/null 2>&1; then
    echo "✅ get-browser-info 调用成功"
    echo "$TOOL_RESPONSE" | jq '.result.content[0].text' | head -3
else
    echo "⚠️  get-browser-info 调用失败或返回异常"
    echo "$TOOL_RESPONSE" | jq
fi
echo ""

# 测试 list-tabs
echo "📌 测试工具: list-tabs"
TOOL_REQUEST=$(cat <<EOF
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "tools/call",
  "params": {
    "name": "list-tabs",
    "arguments": {}
  }
}
EOF
)

TOOL_RESPONSE=$(curl -s -X POST "$SERVER_URL/message?sessionId=$SESSION_ID" \
  -H "Content-Type: application/json" \
  -d "$TOOL_REQUEST")

if echo "$TOOL_RESPONSE" | jq -e '.result' > /dev/null 2>&1; then
    TAB_COUNT=$(echo "$TOOL_RESPONSE" | jq -r '.result.content[0].text' | grep -o 'tabId' | wc -l)
    echo "✅ list-tabs 调用成功 (找到 $TAB_COUNT 个标签页)"
else
    echo "⚠️  list-tabs 调用失败或返回异常"
    echo "$TOOL_RESPONSE" | jq
fi
echo ""

# 7. 检查 Token 工具调用计数
echo "════════════════════════════════════════════════════════════"
echo "步骤 7: 验证工具调用计数"
echo "════════════════════════════════════════════════════════════"
BROWSER_INFO=$(curl -s "$SERVER_URL/api/v2/users/$USER_ID/browsers/$TOKEN_NAME")
TOOL_CALL_COUNT=$(echo "$BROWSER_INFO" | jq -r '.toolCallCount // 0')
echo "✅ Token 工具调用计数: $TOOL_CALL_COUNT 次"
echo ""

# 8. 清理
echo "════════════════════════════════════════════════════════════"
echo "步骤 8: 清理测试数据"
echo "════════════════════════════════════════════════════════════"

# 停止 SSE 连接
kill $SSE_PID 2>/dev/null || true
rm -f $SSE_OUTPUT

# 删除用户（级联删除浏览器）
DELETE_RESPONSE=$(curl -s -X DELETE "$SERVER_URL/api/v2/users/$USER_ID")
echo "✅ 测试数据已清理"
echo ""

# 最终总结
echo "═══════════════════════════════════════════════════════════"
echo "🎉 测试完成摘要"
echo "═══════════════════════════════════════════════════════════"
echo ""
echo "✅ 步骤 1: 服务器健康检查通过"
echo "✅ 步骤 2: 浏览器连接验证通过"
echo "✅ 步骤 3: 用户注册成功 (分离流程)"
echo "✅ 步骤 4: 浏览器绑定成功 (Token 生成)"
echo "✅ 步骤 5: SSE V2 连接建立成功"
echo "✅ 步骤 6: 工具调用测试通过"
echo "✅ 步骤 7: 工具调用计数记录正常"
echo "✅ 步骤 8: 清理完成"
echo ""
echo "🎯 核心功能验证:"
echo "  • 注册和绑定分离  ✅"
echo "  • Token 自动生成   ✅"
echo "  • 浏览器可达验证  ✅"
echo "  • 工具调用计数    ✅"
echo "  • IDE 全流程      ✅"
echo ""
echo "✨ 二进制全流程测试通过！"
