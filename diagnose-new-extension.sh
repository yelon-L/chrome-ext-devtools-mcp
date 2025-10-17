#!/bin/bash
# 诊断新添加的扩展错误

echo "========================================"
echo "诊断新扩展的错误信息"
echo "========================================"
echo ""

MCP_URL="http://localhost:32123/mcp"

# 初始化
echo "📋 步骤1: 列出所有扩展..."
curl -s -X POST $MCP_URL \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}' > /dev/null

sleep 2

# 列出扩展
EXTENSIONS=$(curl -s -X POST $MCP_URL \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"list_extensions","arguments":{}}}')

echo "$EXTENSIONS" | python3 -c "
import sys, json, re
try:
    # 读取SSE流
    text = sys.stdin.read()
    # 提取data部分
    match = re.search(r'data: ({.*})', text)
    if match:
        data = json.loads(match.group(1))
        if 'result' in data and 'content' in data['result']:
            content = data['result']['content'][0]['text']
            print(content)
except Exception as e:
    print(f'解析错误: {e}', file=sys.stderr)
    print(text)
" 2>/dev/null | head -100

echo ""
echo "========================================"
echo "请选择要诊断的扩展ID："
read -p "扩展ID (32位小写字母): " EXTENSION_ID

if [ -z "$EXTENSION_ID" ]; then
  echo "未输入扩展ID"
  exit 1
fi

echo ""
echo "========================================"
echo "📊 步骤2: 诊断扩展错误 (查看现有错误)..."
echo "========================================"
echo ""

DIAGNOSE1=$(curl -s -X POST $MCP_URL \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d "{\"jsonrpc\":\"2.0\",\"id\":3,\"method\":\"tools/call\",\"params\":{\"name\":\"diagnose_extension_errors\",\"arguments\":{\"extensionId\":\"$EXTENSION_ID\",\"timeRange\":60,\"includeWarnings\":true}}}")

echo "$DIAGNOSE1" | python3 -c "
import sys, json, re
text = sys.stdin.read()
match = re.search(r'data: ({.*})', text)
if match:
    data = json.loads(match.group(1))
    if 'result' in data and 'content' in data['result']:
        print(data['result']['content'][0]['text'])
" 2>/dev/null || echo "$DIAGNOSE1"

echo ""
read -p "是否发现错误？(y/n): " HAS_ERROR

if [ "$HAS_ERROR" = "n" ]; then
  echo ""
  echo "========================================"
  echo "🔧 步骤3: 增强错误捕获..."
  echo "========================================"
  echo ""
  
  # 先激活Service Worker
  echo "激活Service Worker..."
  curl -s -X POST $MCP_URL \
    -H "Content-Type: application/json" \
    -H "Accept: application/json, text/event-stream" \
    -d "{\"jsonrpc\":\"2.0\",\"id\":4,\"method\":\"tools/call\",\"params\":{\"name\":\"activate_extension_service_worker\",\"arguments\":{\"extensionId\":\"$EXTENSION_ID\"}}}" \
    | python3 -c "
import sys, json, re
text = sys.stdin.read()
match = re.search(r'data: ({.*})', text)
if match:
    data = json.loads(match.group(1))
    if 'result' in data:
        print(data['result']['content'][0]['text'])
" 2>/dev/null | head -20
  
  echo ""
  echo "增强错误捕获..."
  ENHANCE=$(curl -s -X POST $MCP_URL \
    -H "Content-Type: application/json" \
    -H "Accept: application/json, text/event-stream" \
    -d "{\"jsonrpc\":\"2.0\",\"id\":5,\"method\":\"tools/call\",\"params\":{\"name\":\"enhance_extension_error_capture\",\"arguments\":{\"extensionId\":\"$EXTENSION_ID\",\"captureStackTraces\":true}}}")
  
  echo "$ENHANCE" | python3 -c "
import sys, json, re
text = sys.stdin.read()
match = re.search(r'data: ({.*})', text)
if match:
    data = json.loads(match.group(1))
    if 'result' in data:
        print(data['result']['content'][0]['text'])
" 2>/dev/null || echo "$ENHANCE"
  
  echo ""
  echo "========================================"
  echo "🔄 步骤4: 重载扩展 (重现错误)..."
  echo "========================================"
  echo ""
  
  RELOAD=$(curl -s -X POST $MCP_URL \
    -H "Content-Type: application/json" \
    -H "Accept: application/json, text/event-stream" \
    -d "{\"jsonrpc\":\"2.0\",\"id\":6,\"method\":\"tools/call\",\"params\":{\"name\":\"reload_extension\",\"arguments\":{\"extensionId\":\"$EXTENSION_ID\",\"captureErrors\":true}}}")
  
  echo "$RELOAD" | python3 -c "
import sys, json, re
text = sys.stdin.read()
match = re.search(r'data: ({.*})', text)
if match:
    data = json.loads(match.group(1))
    if 'result' in data:
        print(data['result']['content'][0]['text'])
" 2>/dev/null | head -30
  
  echo ""
  echo "========================================"
  echo "📊 步骤5: 再次诊断 (查看捕获的错误)..."
  echo "========================================"
  echo ""
  
  DIAGNOSE2=$(curl -s -X POST $MCP_URL \
    -H "Content-Type: application/json" \
    -H "Accept: application/json, text/event-stream" \
    -d "{\"jsonrpc\":\"2.0\",\"id\":7,\"method\":\"tools/call\",\"params\":{\"name\":\"diagnose_extension_errors\",\"arguments\":{\"extensionId\":\"$EXTENSION_ID\",\"timeRange\":1,\"includeWarnings\":true}}}")
  
  echo "$DIAGNOSE2" | python3 -c "
import sys, json, re
text = sys.stdin.read()
match = re.search(r'data: ({.*})', text)
if match:
    data = json.loads(match.group(1))
    if 'result' in data:
        print(data['result']['content'][0]['text'])
" 2>/dev/null || echo "$DIAGNOSE2"
fi

echo ""
echo "========================================"
echo "📋 步骤6: 查看详细日志..."
echo "========================================"
echo ""

LOGS=$(curl -s -X POST $MCP_URL \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d "{\"jsonrpc\":\"2.0\",\"id\":8,\"method\":\"tools/call\",\"params\":{\"name\":\"get_extension_logs\",\"arguments\":{\"extensionId\":\"$EXTENSION_ID\",\"level\":[\"error\",\"warn\"],\"limit\":30}}}")

echo "$LOGS" | python3 -c "
import sys, json, re
text = sys.stdin.read()
match = re.search(r'data: ({.*})', text)
if match:
    data = json.loads(match.group(1))
    if 'result' in data:
        print(data['result']['content'][0]['text'])
" 2>/dev/null || echo "$LOGS"

echo ""
echo "========================================"
echo "✅ 诊断完成"
echo "========================================"
echo ""
echo "对比结果："
echo "1. Chrome管理页面显示的Errors: (需要你手动查看)"
echo "2. MCP工具捕获的错误: (见上述输出)"
echo ""
echo "如果MCP工具仍然看不到错误，可能原因："
echo "- 错误是Manifest相关（不会输出到console）"
echo "- 错误是CSP相关（可能不会被捕获）"
echo "- 错误发生在content script中（需要特定触发）"
echo ""
echo "查看完整技术分析："
echo "  docs/ACCESS_CHROME_EXTENSION_ERRORS.md"
