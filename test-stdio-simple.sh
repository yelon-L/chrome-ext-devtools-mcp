#!/bin/bash

# 简单的 stdio 测试

set -e

echo "=== stdio 模式简单测试 ==="
echo ""

# 创建命名管道
FIFO=$(mktemp -u)
mkfifo "$FIFO"

# 清理函数
cleanup() {
  rm -f "$FIFO"
  if [ -n "$SERVER_PID" ]; then
    kill $SERVER_PID 2>/dev/null || true
  fi
}
trap cleanup EXIT

# 启动服务器
node build/src/index.js --browserUrl http://127.0.0.1:9222 < "$FIFO" > /tmp/stdio-output.log 2>&1 &
SERVER_PID=$!

# 打开管道用于写入
exec 3>"$FIFO"

echo "服务器已启动 (PID: $SERVER_PID)"
sleep 3

# 发送 initialize
echo "发送 initialize..."
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}' >&3
sleep 2

# 检查响应
if grep -q '"id":1' /tmp/stdio-output.log; then
  echo "✅ initialize 成功"
else
  echo "❌ initialize 失败"
fi

# 发送 tools/call
echo "发送 list_pages..."
echo '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"list_pages","arguments":{}}}' >&3
sleep 15

# 检查响应
if grep -q '"id":2' /tmp/stdio-output.log; then
  echo "✅ list_pages 成功"
  grep '"id":2' /tmp/stdio-output.log | head -1
else
  echo "❌ list_pages 失败或超时"
  echo "最后 20 行日志:"
  tail -20 /tmp/stdio-output.log
fi

# 关闭管道
exec 3>&-

echo ""
echo "=== 测试完成 ==="
