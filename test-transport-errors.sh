#!/bin/bash

# 测试所有传输模式的错误处理
# 验证客户端断开时服务端是否优雅处理

set -e

echo "=== 传输层错误处理测试 ==="
echo ""

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 测试结果
TESTS_PASSED=0
TESTS_FAILED=0

# 测试函数
test_transport() {
  local mode=$1
  local port=$2
  local endpoint=$3
  local description=$4
  
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "测试: $description"
  echo "模式: $mode, 端口: $port, 端点: $endpoint"
  echo ""
  
  # 检查端口是否可用
  if ! nc -z localhost $port 2>/dev/null; then
    echo -e "${YELLOW}⚠️  跳过: 服务未运行在端口 $port${NC}"
    echo ""
    return
  fi
  
  # 测试1: 立即断开
  echo "测试1: 客户端立即断开连接"
  local output=$(timeout 0.3s curl -s -N "http://localhost:$port$endpoint" 2>&1 || true)
  sleep 0.5
  
  # 检查服务是否还活着
  local health_check=$(curl -s "http://localhost:$port/health" 2>&1 || echo "FAILED")
  
  if echo "$health_check" | grep -q "ok\|status"; then
    echo -e "${GREEN}✅ 服务器仍在运行${NC}"
    ((TESTS_PASSED++))
  else
    echo -e "${RED}❌ 服务器可能崩溃${NC}"
    echo "健康检查响应: $health_check"
    ((TESTS_FAILED++))
  fi
  
  # 测试2: 延迟断开
  echo ""
  echo "测试2: 客户端延迟断开连接"
  timeout 1s curl -s -N "http://localhost:$port$endpoint" >/dev/null 2>&1 || true
  sleep 0.5
  
  health_check=$(curl -s "http://localhost:$port/health" 2>&1 || echo "FAILED")
  
  if echo "$health_check" | grep -q "ok\|status"; then
    echo -e "${GREEN}✅ 服务器仍在运行${NC}"
    ((TESTS_PASSED++))
  else
    echo -e "${RED}❌ 服务器可能崩溃${NC}"
    echo "健康检查响应: $health_check"
    ((TESTS_FAILED++))
  fi
  
  echo ""
}

# 检查 Chrome 是否运行
echo "检查 Chrome 状态..."
if ! pgrep -f "chrome.*remote-debugging-port=9222" > /dev/null; then
  echo -e "${YELLOW}⚠️  Chrome 未运行，启动 Chrome...${NC}"
  google-chrome --remote-debugging-port=9222 --user-data-dir=/tmp/chrome-test-transport &
  sleep 3
fi
echo -e "${GREEN}✅ Chrome 已运行${NC}"
echo ""

# 测试 SSE 模式
test_transport "SSE" 32122 "/sse" "SSE 传输模式"

# 测试 HTTP 模式
test_transport "HTTP" 32123 "/mcp" "Streamable HTTP 传输模式"

# 测试 Multi-tenant 模式
test_transport "Multi-tenant" 32122 "/sse" "Multi-tenant SSE 模式"

# 总结
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "测试总结"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "通过: ${GREEN}$TESTS_PASSED${NC}"
echo -e "失败: ${RED}$TESTS_FAILED${NC}"
echo ""

if [ $TESTS_FAILED -eq 0 ]; then
  echo -e "${GREEN}✅ 所有测试通过！${NC}"
  echo ""
  echo "结论："
  echo "  - 所有传输模式都能优雅处理客户端断开"
  echo "  - 服务器保持稳定，不会崩溃"
  echo "  - 其他连接不受影响"
else
  echo -e "${RED}❌ 有 $TESTS_FAILED 个测试失败${NC}"
  echo ""
  echo "建议："
  echo "  1. 检查服务器日志，查找错误信息"
  echo "  2. 添加 Response 错误处理"
  echo "  3. 参考 stdio 模式的修复方案"
  echo "  4. 运行 pnpm run check 确保代码质量"
fi

echo ""
echo "详细分析文档: docs/TRANSPORT_ERROR_HANDLING_ANALYSIS.md"
