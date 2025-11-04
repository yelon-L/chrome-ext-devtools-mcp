#!/bin/bash

# 测试 stdio MCP 服务器是否可用

set -e

echo "=== 测试 stdio MCP 服务器 ==="
echo ""

# 检查 Chrome 是否在运行
if ! curl -s http://127.0.0.1:9222/json/version > /dev/null 2>&1; then
  echo "❌ Chrome 未在 9222 端口运行"
  echo "请先启动 Chrome: google-chrome --remote-debugging-port=9222"
  exit 1
fi

echo "✅ Chrome 可访问"
echo ""

# 创建临时文件
REQUEST_FILE=$(mktemp)
RESPONSE_FILE=$(mktemp)

# 清理函数
cleanup() {
  rm -f "$REQUEST_FILE" "$RESPONSE_FILE"
  if [ -n "$SERVER_PID" ]; then
    kill $SERVER_PID 2>/dev/null || true
  fi
}
trap cleanup EXIT

# 启动服务器
echo "启动 stdio MCP 服务器..."
node build/src/index.js --browserUrl http://127.0.0.1:9222 > "$RESPONSE_FILE" 2>&1 &
SERVER_PID=$!

# 等待服务器启动
sleep 2

# 检查服务器是否还在运行
if ! kill -0 $SERVER_PID 2>/dev/null; then
  echo "❌ 服务器启动失败"
  echo ""
  echo "服务器输出:"
  cat "$RESPONSE_FILE"
  exit 1
fi

echo "✅ 服务器已启动 (PID: $SERVER_PID)"
echo ""

# 测试 1: 发送 initialize 请求
echo "测试 1: 发送 initialize 请求"

cat > "$REQUEST_FILE" << 'EOF'
{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test-client","version":"1.0.0"}}}
EOF

# 通过 stdin 发送请求
cat "$REQUEST_FILE" | timeout 5 nc -U /proc/$SERVER_PID/fd/0 2>/dev/null || true

# 等待响应
sleep 1

# 检查响应
if grep -q "capabilities" "$RESPONSE_FILE"; then
  echo "✅ 收到 initialize 响应"
else
  echo "⚠️  未收到明确的 initialize 响应"
fi

echo ""

# 测试 2: 发送 tools/list 请求
echo "测试 2: 发送 tools/list 请求"

cat > "$REQUEST_FILE" << 'EOF'
{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}
EOF

cat "$REQUEST_FILE" | timeout 5 nc -U /proc/$SERVER_PID/fd/0 2>/dev/null || true

sleep 1

if grep -q "tools" "$RESPONSE_FILE"; then
  echo "✅ 收到 tools/list 响应"
else
  echo "⚠️  未收到明确的 tools/list 响应"
fi

echo ""

# 检查服务器是否仍在运行
if kill -0 $SERVER_PID 2>/dev/null; then
  echo "✅ 服务器仍在运行"
else
  echo "❌ 服务器已退出"
fi

echo ""
echo "━━━ 服务器输出 ━━━"
tail -30 "$RESPONSE_FILE"

echo ""
echo "=== 测试完成 ==="
