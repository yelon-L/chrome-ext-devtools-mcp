#!/bin/bash
# 诊断Video SRT扩展的错误

echo "========================================"
echo "Video SRT Ext 扩展诊断"
echo "========================================"
echo ""

# 检查服务器
if ! curl -s http://localhost:32123/health > /dev/null 2>&1; then
  echo "❌ MCP服务器未运行"
  echo "请先启动服务器"
  exit 1
fi

echo "✅ MCP服务器运行中"
echo ""

# 1. 列出所有扩展
echo "1. 查找Video SRT扩展..."
EXTENSIONS=$(curl -s -X POST http://localhost:32123/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}' 2>&1)

sleep 1

LIST_RESULT=$(curl -s -X POST http://localhost:32123/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"list_extensions","arguments":{}}}' 2>&1)

# 提取Video SRT的扩展ID
EXTENSION_ID=$(echo "$LIST_RESULT" | grep -oP '(?<=Video SRT.*ID: `)[a-z]{32}' | head -1)

if [ -z "$EXTENSION_ID" ]; then
  echo "❌ 未找到Video SRT扩展"
  echo ""
  echo "所有扩展："
  echo "$LIST_RESULT" | grep -oP '(?<=\*\*)[^\*]+(?=\*\*)' | head -20
  exit 1
fi

echo "✅ 找到扩展ID: $EXTENSION_ID"
echo ""

# 2. 诊断扩展错误
echo "2. 诊断扩展错误..."
DIAGNOSE_RESULT=$(curl -s -X POST http://localhost:32123/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d "{\"jsonrpc\":\"2.0\",\"id\":3,\"method\":\"tools/call\",\"params\":{\"name\":\"diagnose_extension_errors\",\"arguments\":{\"extensionId\":\"$EXTENSION_ID\",\"timeRange\":60,\"includeWarnings\":true}}}")

echo "$DIAGNOSE_RESULT" | jq -r '.result.content[0].text' 2>/dev/null || echo "$DIAGNOSE_RESULT"
echo ""

# 3. 获取详细日志
echo "3. 获取扩展日志..."
LOGS_RESULT=$(curl -s -X POST http://localhost:32123/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d "{\"jsonrpc\":\"2.0\",\"id\":4,\"method\":\"tools/call\",\"params\":{\"name\":\"get_extension_logs\",\"arguments\":{\"extensionId\":\"$EXTENSION_ID\",\"level\":[\"error\",\"warn\"],\"limit\":20}}}")

echo "$LOGS_RESULT" | jq -r '.result.content[0].text' 2>/dev/null || echo "$LOGS_RESULT"
echo ""

# 4. 检查Service Worker状态
echo "4. 检查Service Worker状态..."
CONTEXTS_RESULT=$(curl -s -X POST http://localhost:32123/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d "{\"jsonrpc\":\"2.0\",\"id\":5,\"method\":\"tools/call\",\"params\":{\"name\":\"list_extension_contexts\",\"arguments\":{\"extensionId\":\"$EXTENSION_ID\"}}}")

echo "$CONTEXTS_RESULT" | jq -r '.result.content[0].text' 2>/dev/null || echo "$CONTEXTS_RESULT"
echo ""

# 5. 建议增强错误捕获
echo "========================================"
echo "建议"
echo "========================================"
echo ""
echo "如果上述诊断未发现错误，但问题仍存在，建议："
echo ""
echo "1. 激活Service Worker（如果是MV3扩展）："
echo "   activate_extension_service_worker({\"extensionId\":\"$EXTENSION_ID\"})"
echo ""
echo "2. 增强错误捕获："
echo "   enhance_extension_error_capture({\"extensionId\":\"$EXTENSION_ID\",\"captureStackTraces\":true})"
echo ""
echo "3. 重现问题后再次诊断："
echo "   diagnose_extension_errors({\"extensionId\":\"$EXTENSION_ID\",\"timeRange\":5})"
echo ""
