#!/bin/bash
# 测试模式1: stdio

BINARY="./dist/chrome-devtools-mcp-linux-x64"
CHROME_9222="http://localhost:9222"

echo "╔═══════════════════════════════════════════════════════════╗"
echo "║  测试模式 1: stdio (标准输入输出)                        ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo ""

# 检查Chrome
if ! curl -s $CHROME_9222/json/version > /dev/null 2>&1; then
    echo "❌ Chrome 9222 未启动，请先启动"
    exit 1
fi
echo "✅ Chrome 9222 已就绪"
echo ""

# 创建测试输入
cat > /tmp/stdio-test.jsonl <<'EOF'
{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}
{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}
EOF

echo "发送 MCP 消息到 stdio..."
timeout 8s $BINARY --browserUrl $CHROME_9222 < /tmp/stdio-test.jsonl > /tmp/stdio-out.json 2>&1

echo "检查响应..."
if grep -q "tools" /tmp/stdio-out.json; then
    echo "✅ stdio 模式测试通过"
    TOOL_COUNT=$(grep -o '"name":"[^"]*"' /tmp/stdio-out.json | wc -l)
    echo "   工具数量: $TOOL_COUNT"
else
    echo "❌ stdio 模式测试失败"
    cat /tmp/stdio-out.json | head -n 10
fi
