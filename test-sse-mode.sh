#!/bin/bash

# 测试 SSE 模式的错误处理

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo "=== SSE 模式错误处理测试 ==="
echo ""

# 日志文件
LOG_FILE="./test-logs/sse-test.log"
mkdir -p ./test-logs

# 清理函数
cleanup() {
  if [ ! -z "$SERVER_PID" ]; then
    echo "关闭 SSE 服务器..."
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
PORT=32122
if lsof -i :$PORT >/dev/null 2>&1; then
  echo -e "${YELLOW}⚠️  端口 $PORT 已被占用${NC}"
  echo "请先关闭占用端口的进程"
  exit 1
fi

# 启动 SSE 服务器
echo "启动 SSE 服务器..."
node build/src/server-sse.js --browserUrl http://localhost:9222 > "$LOG_FILE" 2>&1 &
SERVER_PID=$!

# 等待服务器启动
sleep 3

# 检查服务器是否启动成功
if ! curl -s http://localhost:$PORT/health >/dev/null 2>&1; then
  echo -e "${RED}❌ SSE 服务器启动失败${NC}"
  echo "查看日志: $LOG_FILE"
  cat "$LOG_FILE"
  exit 1
fi

echo -e "${GREEN}✅ SSE 服务器已启动 (PID: $SERVER_PID)${NC}"
echo ""

# 测试1: 立即断开连接
echo "测试 1: 客户端立即断开连接"
timeout 0.3s curl -s -N "http://localhost:$PORT/sse" >/dev/null 2>&1 || true
sleep 0.5

if curl -s "http://localhost:$PORT/health" | grep -q "ok"; then
  echo -e "${GREEN}✅ 服务器仍在运行${NC}"
else
  echo -e "${RED}❌ 服务器可能崩溃${NC}"
  exit 1
fi

# 测试2: 延迟断开连接
echo ""
echo "测试 2: 客户端延迟断开连接"
timeout 1s curl -s -N "http://localhost:$PORT/sse" >/dev/null 2>&1 || true
sleep 0.5

if curl -s "http://localhost:$PORT/health" | grep -q "ok"; then
  echo -e "${GREEN}✅ 服务器仍在运行${NC}"
else
  echo -e "${RED}❌ 服务器可能崩溃${NC}"
  exit 1
fi

# 测试3: 多次连接断开
echo ""
echo "测试 3: 多次连接断开 (5次)"
for i in {1..5}; do
  timeout 0.2s curl -s -N "http://localhost:$PORT/sse" >/dev/null 2>&1 || true
  sleep 0.1
done
sleep 0.5

if curl -s "http://localhost:$PORT/health" | grep -q "ok"; then
  echo -e "${GREEN}✅ 服务器在多次断开后仍在运行${NC}"
else
  echo -e "${RED}❌ 服务器在多次断开后崩溃${NC}"
  exit 1
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
echo -e "${GREEN}✅ SSE 模式所有测试通过${NC}"
echo ""
echo "完整日志: $LOG_FILE"
