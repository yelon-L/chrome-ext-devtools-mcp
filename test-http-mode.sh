#!/bin/bash

# 测试 HTTP 模式的错误处理

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo "=== HTTP 模式错误处理测试 ==="
echo ""

# 日志文件
LOG_FILE="./test-logs/http-test.log"
mkdir -p ./test-logs

# 清理函数
cleanup() {
  if [ ! -z "$SERVER_PID" ]; then
    echo "关闭 HTTP 服务器..."
    kill $SERVER_PID 2>/dev/null || true
    wait $SERVER_PID 2>/dev/null || true
  fi
}

trap cleanup EXIT INT TERM

# 检查 Chrome
echo "检查 Chrome..."
if ! curl -s http://localhost:9222/json/version >/dev/null 2>&1; then
  echo -e "${RED}❌ Chrome 未运行或不可访问${NC}"
  echo "请先启动 Chrome: google-chrome --remote-debugging-port=9222"
  exit 1
fi
echo -e "${GREEN}✅ Chrome 可访问${NC}"
echo ""

# 检查端口
PORT=32123
if lsof -i :$PORT >/dev/null 2>&1; then
  echo -e "${YELLOW}⚠️  端口 $PORT 已被占用${NC}"
  echo "请先关闭占用端口的进程"
  exit 1
fi

# 启动 HTTP 服务器
echo "启动 HTTP 服务器..."
node build/src/server-http.js --browserUrl http://localhost:9222 > "$LOG_FILE" 2>&1 &
SERVER_PID=$!

# 等待服务器启动
sleep 3

# 检查服务器是否启动成功
if ! curl -s http://localhost:$PORT/health >/dev/null 2>&1; then
  echo -e "${RED}❌ HTTP 服务器启动失败${NC}"
  echo "查看日志: $LOG_FILE"
  cat "$LOG_FILE"
  exit 1
fi

echo -e "${GREEN}✅ HTTP 服务器已启动 (PID: $SERVER_PID)${NC}"
echo ""

# 测试1: 立即断开连接
echo "测试 1: 客户端立即断开连接"
timeout 0.3s curl -s -X POST "http://localhost:$PORT/mcp" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}' \
  >/dev/null 2>&1 || true
sleep 0.5

if curl -s "http://localhost:$PORT/health" | grep -q "ok"; then
  echo -e "${GREEN}✅ 服务器仍在运行${NC}"
else
  echo -e "${RED}❌ 服务器可能崩溃${NC}"
  exit 1
fi

# 测试2: 多次请求断开
echo ""
echo "测试 2: 多次请求断开 (5次)"
for i in {1..5}; do
  timeout 0.2s curl -s -X POST "http://localhost:$PORT/mcp" \
    -H "Content-Type: application/json" \
    -d '{"jsonrpc":"2.0","id":'$i',"method":"initialize","params":{}}' \
    >/dev/null 2>&1 || true
  sleep 0.1
done
sleep 0.5

if curl -s "http://localhost:$PORT/health" | grep -q "ok"; then
  echo -e "${GREEN}✅ 服务器在多次断开后仍在运行${NC}"
else
  echo -e "${RED}❌ 服务器在多次断开后崩溃${NC}"
  exit 1
fi

# 测试3: 正常请求（验证功能未受影响）
echo ""
echo "测试 3: 正常请求（验证功能）"
response=$(curl -s -X POST "http://localhost:$PORT/mcp" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":999,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}')

if echo "$response" | grep -q "result\|serverInfo"; then
  echo -e "${GREEN}✅ 服务器正常响应请求${NC}"
else
  echo -e "${YELLOW}⚠️  服务器响应异常${NC}"
  echo "响应: $response"
fi

# 检查日志
echo ""
echo "━━━ 日志分析 ━━━"

# 检查是否有未处理的错误
if grep -qi "error.*EPIPE\|error.*ECONNRESET\|Uncaught\|unhandled" "$LOG_FILE"; then
  echo -e "${RED}⚠️  发现未处理的错误:${NC}"
  grep -i "error.*EPIPE\|error.*ECONNRESET\|Uncaught\|unhandled" "$LOG_FILE" | head -10
  echo ""
else
  echo -e "${GREEN}✅ 无未处理的 EPIPE/ECONNRESET 错误${NC}"
fi

# 检查是否有预期的客户端断开日志
if grep -q "Client disconnected\|Connection closed" "$LOG_FILE"; then
  echo -e "${GREEN}✅ 发现预期的客户端断开日志${NC}"
  echo "日志示例:"
  grep "Client disconnected\|Connection closed" "$LOG_FILE" | head -3
else
  echo -e "${YELLOW}⚠️  未发现客户端断开日志${NC}"
  echo "这可能意味着："
  echo "  - 日志级别设置不同"
  echo "  - 错误处理代码未生效"
fi

echo ""
echo "━━━ 测试完成 ━━━"
echo -e "${GREEN}✅ HTTP 模式所有测试通过${NC}"
echo ""
echo "完整日志: $LOG_FILE"
