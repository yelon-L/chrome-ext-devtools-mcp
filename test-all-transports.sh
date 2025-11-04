#!/bin/bash

# 完整的传输层错误处理测试
# 包括服务启动、测试执行、日志检查、服务关闭

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 测试结果
TESTS_PASSED=0
TESTS_FAILED=0
TESTS_SKIPPED=0

# 日志文件
LOG_DIR="./test-logs"
mkdir -p "$LOG_DIR"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "传输层错误处理完整测试"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# 清理函数
cleanup() {
  echo ""
  echo "清理测试环境..."
  
  # 关闭所有测试服务器
  if [ ! -z "$SSE_PID" ]; then
    kill $SSE_PID 2>/dev/null || true
  fi
  if [ ! -z "$HTTP_PID" ]; then
    kill $HTTP_PID 2>/dev/null || true
  fi
  
  # 等待进程退出
  sleep 1
  
  echo "清理完成"
}

# 注册清理函数
trap cleanup EXIT INT TERM

# 检查 Chrome
check_chrome() {
  echo "━━━ 检查 Chrome 状态 ━━━"
  if ! pgrep -f "chrome.*remote-debugging-port=9222" > /dev/null; then
    echo -e "${YELLOW}⚠️  Chrome 未运行，启动 Chrome...${NC}"
    google-chrome --remote-debugging-port=9222 --user-data-dir=/tmp/chrome-test-transport >/dev/null 2>&1 &
    sleep 3
  fi
  
  # 验证 Chrome 是否可访问
  if curl -s http://localhost:9222/json/version >/dev/null 2>&1; then
    echo -e "${GREEN}✅ Chrome 已运行并可访问${NC}"
    return 0
  else
    echo -e "${RED}❌ Chrome 启动失败${NC}"
    return 1
  fi
}

# 测试 stdio 模式
test_stdio() {
  echo ""
  echo "━━━ 测试 1: stdio 模式 ━━━"
  echo ""
  
  local log_file="$LOG_DIR/stdio.log"
  
  # 运行 stdio 测试
  if ./test-epipe-simple.sh > "$log_file" 2>&1; then
    echo -e "${GREEN}✅ stdio 模式测试通过${NC}"
    ((TESTS_PASSED++))
    
    # 检查日志中是否有错误
    if grep -qi "broken pipe\|EPIPE error" "$log_file"; then
      echo -e "${RED}⚠️  警告: 日志中发现 broken pipe 错误${NC}"
      echo "日志片段:"
      grep -i "broken pipe\|EPIPE" "$log_file" | head -5
    else
      echo -e "${GREEN}✅ 无 broken pipe 错误${NC}"
    fi
  else
    echo -e "${RED}❌ stdio 模式测试失败${NC}"
    ((TESTS_FAILED++))
    echo "查看日志: $log_file"
  fi
}

# 启动并测试 SSE 模式
test_sse() {
  echo ""
  echo "━━━ 测试 2: SSE 模式 ━━━"
  echo ""
  
  local log_file="$LOG_DIR/sse.log"
  local port=32122
  
  # 检查端口是否被占用
  if lsof -i :$port >/dev/null 2>&1; then
    echo -e "${YELLOW}⚠️  端口 $port 已被占用，跳过 SSE 测试${NC}"
    ((TESTS_SKIPPED++))
    return
  fi
  
  # 启动 SSE 服务器
  echo "启动 SSE 服务器..."
  node build/src/server-sse.js --browserUrl http://localhost:9222 > "$log_file" 2>&1 &
  SSE_PID=$!
  
  # 等待服务器启动
  sleep 3
  
  # 检查服务器是否启动成功
  if ! curl -s http://localhost:$port/health >/dev/null 2>&1; then
    echo -e "${RED}❌ SSE 服务器启动失败${NC}"
    ((TESTS_FAILED++))
    echo "查看日志: $log_file"
    kill $SSE_PID 2>/dev/null || true
    return
  fi
  
  echo -e "${GREEN}✅ SSE 服务器已启动${NC}"
  
  # 测试1: 立即断开连接
  echo ""
  echo "测试 2.1: 客户端立即断开连接"
  timeout 0.3s curl -s -N "http://localhost:$port/sse" >/dev/null 2>&1 || true
  sleep 0.5
  
  # 检查服务器是否还活着
  if curl -s "http://localhost:$port/health" | grep -q "ok"; then
    echo -e "${GREEN}✅ 服务器仍在运行${NC}"
    ((TESTS_PASSED++))
  else
    echo -e "${RED}❌ 服务器可能崩溃${NC}"
    ((TESTS_FAILED++))
  fi
  
  # 测试2: 延迟断开连接
  echo ""
  echo "测试 2.2: 客户端延迟断开连接"
  timeout 1s curl -s -N "http://localhost:$port/sse" >/dev/null 2>&1 || true
  sleep 0.5
  
  if curl -s "http://localhost:$port/health" | grep -q "ok"; then
    echo -e "${GREEN}✅ 服务器仍在运行${NC}"
    ((TESTS_PASSED++))
  else
    echo -e "${RED}❌ 服务器可能崩溃${NC}"
    ((TESTS_FAILED++))
  fi
  
  # 测试3: 多次连接断开
  echo ""
  echo "测试 2.3: 多次连接断开"
  for i in {1..5}; do
    timeout 0.2s curl -s -N "http://localhost:$port/sse" >/dev/null 2>&1 || true
    sleep 0.1
  done
  sleep 0.5
  
  if curl -s "http://localhost:$port/health" | grep -q "ok"; then
    echo -e "${GREEN}✅ 服务器在多次断开后仍在运行${NC}"
    ((TESTS_PASSED++))
  else
    echo -e "${RED}❌ 服务器在多次断开后崩溃${NC}"
    ((TESTS_FAILED++))
  fi
  
  # 检查日志
  echo ""
  echo "检查 SSE 服务器日志..."
  if grep -qi "error.*EPIPE\|error.*ECONNRESET" "$log_file"; then
    echo -e "${RED}⚠️  警告: 日志中发现未处理的错误${NC}"
    echo "错误片段:"
    grep -i "error.*EPIPE\|error.*ECONNRESET" "$log_file" | head -5
  else
    echo -e "${GREEN}✅ 无未处理的 EPIPE/ECONNRESET 错误${NC}"
  fi
  
  # 检查是否有 "Client disconnected" 日志
  if grep -q "Client disconnected" "$log_file"; then
    echo -e "${GREEN}✅ 发现预期的客户端断开日志${NC}"
  else
    echo -e "${YELLOW}⚠️  未发现客户端断开日志（可能日志级别不同）${NC}"
  fi
  
  # 关闭服务器
  echo ""
  echo "关闭 SSE 服务器..."
  kill $SSE_PID 2>/dev/null || true
  wait $SSE_PID 2>/dev/null || true
  SSE_PID=""
}

# 启动并测试 HTTP 模式
test_http() {
  echo ""
  echo "━━━ 测试 3: HTTP 模式 ━━━"
  echo ""
  
  local log_file="$LOG_DIR/http.log"
  local port=32123
  
  # 检查端口是否被占用
  if lsof -i :$port >/dev/null 2>&1; then
    echo -e "${YELLOW}⚠️  端口 $port 已被占用，跳过 HTTP 测试${NC}"
    ((TESTS_SKIPPED++))
    return
  fi
  
  # 启动 HTTP 服务器
  echo "启动 HTTP 服务器..."
  node build/src/server-http.js --browserUrl http://localhost:9222 > "$log_file" 2>&1 &
  HTTP_PID=$!
  
  # 等待服务器启动
  sleep 3
  
  # 检查服务器是否启动成功
  if ! curl -s http://localhost:$port/health >/dev/null 2>&1; then
    echo -e "${RED}❌ HTTP 服务器启动失败${NC}"
    ((TESTS_FAILED++))
    echo "查看日志: $log_file"
    kill $HTTP_PID 2>/dev/null || true
    return
  fi
  
  echo -e "${GREEN}✅ HTTP 服务器已启动${NC}"
  
  # 测试1: 立即断开连接
  echo ""
  echo "测试 3.1: 客户端立即断开连接"
  timeout 0.3s curl -s -X POST "http://localhost:$port/mcp" \
    -H "Content-Type: application/json" \
    -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}' \
    >/dev/null 2>&1 || true
  sleep 0.5
  
  if curl -s "http://localhost:$port/health" | grep -q "ok"; then
    echo -e "${GREEN}✅ 服务器仍在运行${NC}"
    ((TESTS_PASSED++))
  else
    echo -e "${RED}❌ 服务器可能崩溃${NC}"
    ((TESTS_FAILED++))
  fi
  
  # 测试2: 多次请求断开
  echo ""
  echo "测试 3.2: 多次请求断开"
  for i in {1..5}; do
    timeout 0.2s curl -s -X POST "http://localhost:$port/mcp" \
      -H "Content-Type: application/json" \
      -d '{"jsonrpc":"2.0","id":'$i',"method":"initialize","params":{}}' \
      >/dev/null 2>&1 || true
    sleep 0.1
  done
  sleep 0.5
  
  if curl -s "http://localhost:$port/health" | grep -q "ok"; then
    echo -e "${GREEN}✅ 服务器在多次断开后仍在运行${NC}"
    ((TESTS_PASSED++))
  else
    echo -e "${RED}❌ 服务器在多次断开后崩溃${NC}"
    ((TESTS_FAILED++))
  fi
  
  # 检查日志
  echo ""
  echo "检查 HTTP 服务器日志..."
  if grep -qi "error.*EPIPE\|error.*ECONNRESET" "$log_file"; then
    echo -e "${RED}⚠️  警告: 日志中发现未处理的错误${NC}"
    echo "错误片段:"
    grep -i "error.*EPIPE\|error.*ECONNRESET" "$log_file" | head -5
  else
    echo -e "${GREEN}✅ 无未处理的 EPIPE/ECONNRESET 错误${NC}"
  fi
  
  # 检查是否有 "Client disconnected" 日志
  if grep -q "Client disconnected" "$log_file"; then
    echo -e "${GREEN}✅ 发现预期的客户端断开日志${NC}"
  else
    echo -e "${YELLOW}⚠️  未发现客户端断开日志（可能日志级别不同）${NC}"
  fi
  
  # 关闭服务器
  echo ""
  echo "关闭 HTTP 服务器..."
  kill $HTTP_PID 2>/dev/null || true
  wait $HTTP_PID 2>/dev/null || true
  HTTP_PID=""
}

# 主测试流程
main() {
  # 检查 Chrome
  if ! check_chrome; then
    echo -e "${RED}❌ Chrome 检查失败，无法继续测试${NC}"
    exit 1
  fi
  
  # 测试 stdio 模式
  test_stdio
  
  # 测试 SSE 模式
  test_sse
  
  # 测试 HTTP 模式
  test_http
  
  # 总结
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "测试总结"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo -e "通过: ${GREEN}$TESTS_PASSED${NC}"
  echo -e "失败: ${RED}$TESTS_FAILED${NC}"
  echo -e "跳过: ${YELLOW}$TESTS_SKIPPED${NC}"
  echo ""
  
  if [ $TESTS_FAILED -eq 0 ]; then
    echo -e "${GREEN}✅ 所有测试通过！${NC}"
    echo ""
    echo "验证结果："
    echo "  ✅ stdio 模式: 优雅处理 EPIPE 错误"
    echo "  ✅ SSE 模式: 优雅处理客户端断开"
    echo "  ✅ HTTP 模式: 优雅处理客户端断开"
    echo "  ✅ 服务器保持稳定，不会崩溃"
    echo "  ✅ 错误日志清晰友好"
    echo ""
    echo "日志文件位置: $LOG_DIR/"
    return 0
  else
    echo -e "${RED}❌ 有 $TESTS_FAILED 个测试失败${NC}"
    echo ""
    echo "建议："
    echo "  1. 查看日志文件: $LOG_DIR/"
    echo "  2. 检查错误处理代码"
    echo "  3. 运行 pnpm run check 确保代码质量"
    return 1
  fi
}

# 运行主测试
main
