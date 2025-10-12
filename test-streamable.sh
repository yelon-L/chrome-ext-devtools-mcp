#!/bin/bash

# 测试 Streamable HTTP MCP 服务器

PORT=32123
BASE_URL="http://localhost:${PORT}"

echo "=========================================="
echo "测试 Streamable HTTP MCP 服务器"
echo "=========================================="
echo ""

# 1. 健康检查
echo "1️⃣ 健康检查"
curl -s "${BASE_URL}/health" | jq .
echo ""
echo ""

# 2. Initialize
echo "2️⃣ Initialize 请求"
RESPONSE=$(curl -s -X POST "${BASE_URL}/mcp" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test-client","version":"1.0"}}}')

echo "$RESPONSE"
echo ""

# 提取 Session ID
SESSION_ID=$(echo "$RESPONSE" | grep "mcp-session-id:" | sed 's/mcp-session-id: //')
echo "Session ID: $SESSION_ID"
echo ""
echo ""

# 3. Tools List
echo "3️⃣ Tools/List 请求"
if [ -n "$SESSION_ID" ]; then
  curl -s -X POST "${BASE_URL}/mcp" \
    -H "Content-Type: application/json" \
    -H "Accept: application/json, text/event-stream" \
    -H "Mcp-Session-Id: ${SESSION_ID}" \
    -d '{"jsonrpc":"2.0","id":2,"method":"tools/list"}' | head -50
else
  echo "⚠️  未获取到 Session ID，跳过"
fi
echo ""
echo ""

# 4. 直接测试（不使用会话）
echo "4️⃣ 直接 Tools/List（新会话）"
RESPONSE2=$(curl -s -X POST "${BASE_URL}/mcp" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/list"}')

echo "$RESPONSE2" | head -100
echo ""
