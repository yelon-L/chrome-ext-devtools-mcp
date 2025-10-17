#!/bin/bash
# 简化的Video SRT扩展诊断脚本

echo "========================================"
echo "Video SRT Ext 扩展诊断"
echo "========================================"
echo ""

# MCP服务器地址
MCP_URL="http://localhost:32123/mcp"

# 初始化连接
echo "初始化MCP连接..."
curl -s -X POST $MCP_URL \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}' > /dev/null

sleep 1

echo "✅ 连接成功"
echo ""

# 1. 列出所有扩展
echo "========== 1. 列出所有扩展 =========="
LIST_RESULT=$(curl -s -X POST $MCP_URL \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"list_extensions","arguments":{}}}')

echo "$LIST_RESULT" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    if 'result' in data and 'content' in data['result']:
        text = data['result']['content'][0]['text']
        # 查找Video SRT相关的行
        for line in text.split('\n'):
            if 'Video' in line or 'SRT' in line or 'MVP' in line:
                print(line)
            # 也打印ID行
            if 'ID:' in line and any(x in text[max(0, text.find(line)-200):text.find(line)] for x in ['Video', 'SRT', 'MVP']):
                print(line)
except:
    print(sys.stdin.read())
" 2>/dev/null

# 提取扩展ID（手动指定或从输出中提取）
echo ""
echo "请输入Video SRT扩展的ID（32位小写字母）："
read -t 5 EXTENSION_ID || EXTENSION_ID=""

if [ -z "$EXTENSION_ID" ]; then
  echo ""
  echo "未输入扩展ID，尝试自动查找..."
  # 保存完整输出用于手动检查
  echo "$LIST_RESULT" > /tmp/extensions_list.json
  echo "完整扩展列表已保存到: /tmp/extensions_list.json"
  echo ""
  echo "请手动查找Video SRT扩展ID，然后运行："
  echo "  EXTENSION_ID=<your_id> $0"
  exit 1
fi

echo "使用扩展ID: $EXTENSION_ID"
echo ""

# 2. 诊断错误
echo "========== 2. 诊断扩展错误 =========="
curl -s -X POST $MCP_URL \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d "{\"jsonrpc\":\"2.0\",\"id\":3,\"method\":\"tools/call\",\"params\":{\"name\":\"diagnose_extension_errors\",\"arguments\":{\"extensionId\":\"$EXTENSION_ID\",\"timeRange\":60,\"includeWarnings\":true}}}" \
  | python3 -c "import sys, json; data=json.load(sys.stdin); print(data['result']['content'][0]['text'] if 'result' in data else json.dumps(data, indent=2))"

echo ""

# 3. 获取日志
echo "========== 3. 获取扩展日志 =========="
curl -s -X POST $MCP_URL \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d "{\"jsonrpc\":\"2.0\",\"id\":4,\"method\":\"tools/call\",\"params\":{\"name\":\"get_extension_logs\",\"arguments\":{\"extensionId\":\"$EXTENSION_ID\",\"level\":[\"error\",\"warn\"]}}}" \
  | python3 -c "import sys, json; data=json.load(sys.stdin); print(data['result']['content'][0]['text'] if 'result' in data else json.dumps(data, indent=2))"

echo ""
echo "========================================"
echo "诊断完成"
echo "========================================"
