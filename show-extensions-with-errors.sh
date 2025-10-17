#!/bin/bash
# 显示所有扩展并标记哪些可能有错误

echo "========================================"
echo "获取扩展错误信息"
echo "========================================"
echo ""

MCP_URL="http://localhost:32123/mcp"
SESSION_ID="test-$$"

# 初始化连接
curl -s -X POST $MCP_URL \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}' > /dev/null

sleep 2

echo "📋 步骤1: 列出所有扩展..."
echo ""

# 获取扩展列表
LIST_RESULT=$(curl -s -X POST $MCP_URL \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"list_extensions","arguments":{}}}')

# 解析并显示
echo "$LIST_RESULT" | python3 << 'PYTHON_SCRIPT'
import sys, json, re

text = sys.stdin.read()
match = re.search(r'data: ({.*})', text, re.DOTALL)
if match:
    try:
        data = json.loads(match.group(1))
        if 'result' in data and 'content' in data['result']:
            content = data['result']['content'][0]['text']
            print(content)
            
            # 提取所有扩展ID
            ext_ids = re.findall(r'ID: `([a-z]{32})`', content)
            if ext_ids:
                print("\n" + "="*60)
                print("找到的扩展ID列表：")
                print("="*60)
                for i, ext_id in enumerate(ext_ids, 1):
                    print(f"{i}. {ext_id}")
                print("")
    except Exception as e:
        print(f"解析错误: {e}", file=sys.stderr)
PYTHON_SCRIPT

echo ""
echo "========================================"
echo "现在请选择一个扩展进行详细诊断"
echo "========================================"
echo ""

# 让用户选择并提供命令
cat << 'EOF'
复制以下命令到终端，替换 <EXTENSION_ID> 为上面列出的扩展ID：

# 1. 先查看现有错误
EXTENSION_ID="<EXTENSION_ID>"

# 2. 诊断错误
curl -s -X POST http://localhost:32123/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d "{\"jsonrpc\":\"2.0\",\"id\":3,\"method\":\"tools/call\",\"params\":{\"name\":\"diagnose_extension_errors\",\"arguments\":{\"extensionId\":\"$EXTENSION_ID\",\"timeRange\":60,\"includeWarnings\":true}}}" \
  | python3 -c "import sys,json,re; text=sys.stdin.read(); match=re.search(r'data: ({.*})', text); print(json.loads(match.group(1))['result']['content'][0]['text'] if match else text)"

# 3. 如果没有发现错误，增强错误捕获
curl -s -X POST http://localhost:32123/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d "{\"jsonrpc\":\"2.0\",\"id\":4,\"method\":\"tools/call\",\"params\":{\"name\":\"activate_extension_service_worker\",\"arguments\":{\"extensionId\":\"$EXTENSION_ID\"}}}" \
  | python3 -c "import sys,json,re; text=sys.stdin.read(); match=re.search(r'data: ({.*})', text); print(json.loads(match.group(1))['result']['content'][0]['text'] if match else text)"

curl -s -X POST http://localhost:32123/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d "{\"jsonrpc\":\"2.0\",\"id\":5,\"method\":\"tools/call\",\"params\":{\"name\":\"enhance_extension_error_capture\",\"arguments\":{\"extensionId\":\"$EXTENSION_ID\",\"captureStackTraces\":true}}}" \
  | python3 -c "import sys,json,re; text=sys.stdin.read(); match=re.search(r'data: ({.*})', text); print(json.loads(match.group(1))['result']['content'][0]['text'] if match else text)"

# 4. 重载扩展
curl -s -X POST http://localhost:32123/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d "{\"jsonrpc\":\"2.0\",\"id\":6,\"method\":\"tools/call\",\"params\":{\"name\":\"reload_extension\",\"arguments\":{\"extensionId\":\"$EXTENSION_ID\",\"captureErrors\":true}}}" \
  | python3 -c "import sys,json,re; text=sys.stdin.read(); match=re.search(r'data: ({.*})', text); print(json.loads(match.group(1))['result']['content'][0]['text'] if match else text)"

# 5. 再次诊断
curl -s -X POST http://localhost:32123/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d "{\"jsonrpc\":\"2.0\",\"id\":7,\"method\":\"tools/call\",\"params\":{\"name\":\"diagnose_extension_errors\",\"arguments\":{\"extensionId\":\"$EXTENSION_ID\",\"timeRange\":1,\"includeWarnings\":true}}}" \
  | python3 -c "import sys,json,re; text=sys.stdin.read(); match=re.search(r'data: ({.*})', text); print(json.loads(match.group(1))['result']['content'][0]['text'] if match else text)"

# 6. 查看日志
curl -s -X POST http://localhost:32123/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d "{\"jsonrpc\":\"2.0\",\"id\":8,\"method\":\"tools/call\",\"params\":{\"name\":\"get_extension_logs\",\"arguments\":{\"extensionId\":\"$EXTENSION_ID\",\"level\":[\"error\",\"warn\"]}}}" \
  | python3 -c "import sys,json,re; text=sys.stdin.read(); match=re.search(r'data: ({.*})', text); print(json.loads(match.group(1))['result']['content'][0]['text'] if match else text)"

EOF

echo ""
echo "========================================"
echo "或者在你的IDE MCP客户端中使用："
echo "========================================"
echo ""
echo '1. list_extensions()'
echo '2. diagnose_extension_errors({extensionId:"xxx", timeRange:60, includeWarnings:true})'
echo '3. enhance_extension_error_capture({extensionId:"xxx"})'
echo '4. reload_extension({extensionId:"xxx"})'
echo '5. diagnose_extension_errors({extensionId:"xxx", timeRange:1})'
