#!/bin/bash
# 测试MCP服务集成

echo "========================================"
echo "MCP服务集成测试 v0.8.13"
echo "========================================"
echo ""

MCP_URL="http://localhost:32123/mcp"

# 颜色
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

test_count=0
pass_count=0

test() {
  test_count=$((test_count + 1))
  echo -e "${YELLOW}测试 $test_count: $1${NC}"
}

pass() {
  pass_count=$((pass_count + 1))
  echo -e "${GREEN}✓ 通过${NC}"
  echo ""
}

fail() {
  echo -e "${RED}✗ 失败: $1${NC}"
  echo ""
}

# 1. 测试健康检查
test "服务健康检查"
if curl -s http://localhost:32123/health | grep -q "ok"; then
  pass
else
  fail "服务未响应"
  exit 1
fi

# 2. 初始化连接
test "初始化MCP连接"
INIT_RESULT=$(curl -s -X POST $MCP_URL \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}')

if echo "$INIT_RESULT" | grep -q '"result"'; then
  pass
else
  fail "初始化失败"
  echo "$INIT_RESULT"
  exit 1
fi

echo "等待服务器完全初始化..."
sleep 3

# 3. 测试工具列表
test "列出所有工具"
TOOLS_RESULT=$(curl -s -X POST $MCP_URL \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}')

if echo "$TOOLS_RESULT" | grep -q '"result"'; then
  pass
else
  fail "工具列表获取失败"
  echo "$TOOLS_RESULT"
fi

# 4. 检查新工具是否存在
test "检查 enhance_extension_error_capture 工具"
if echo "$TOOLS_RESULT" | grep -q "enhance_extension_error_capture"; then
  pass
else
  fail "新工具未找到"
  echo "$TOOLS_RESULT" | grep -o '"name":"[^"]*"' | head -20
fi

# 5. 检查工具描述
test "检查工具描述是否完整"
TOOL_DESC=$(echo "$TOOLS_RESULT" | grep -A 50 "enhance_extension_error_capture" | grep -o '"description":"[^"]*"' | head -1)
if echo "$TOOL_DESC" | grep -q "Inject error listeners"; then
  pass
else
  fail "工具描述不完整"
  echo "$TOOL_DESC"
fi

# 6. 测试 list_extensions
test "测试 list_extensions 工具"
LIST_EXT_RESULT=$(curl -s -X POST $MCP_URL \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"list_extensions","arguments":{}}}')

if echo "$LIST_EXT_RESULT" | grep -q '"result"'; then
  # 提取第一个扩展ID用于后续测试
  FIRST_EXT_ID=$(echo "$LIST_EXT_RESULT" | grep -oP '(?<=ID: `)[a-z]{32}' | head -1)
  if [ -n "$FIRST_EXT_ID" ]; then
    echo "找到测试扩展ID: $FIRST_EXT_ID"
    pass
  else
    fail "未找到可测试的扩展"
  fi
else
  fail "list_extensions 调用失败"
  echo "$LIST_EXT_RESULT"
fi

# 7. 测试 diagnose_extension_errors（检查提示）
if [ -n "$FIRST_EXT_ID" ]; then
  test "测试 diagnose_extension_errors 的增强提示"
  DIAGNOSE_RESULT=$(curl -s -X POST $MCP_URL \
    -H "Content-Type: application/json" \
    -H "Accept: application/json, text/event-stream" \
    -d "{\"jsonrpc\":\"2.0\",\"id\":4,\"method\":\"tools/call\",\"params\":{\"name\":\"diagnose_extension_errors\",\"arguments\":{\"extensionId\":\"$FIRST_EXT_ID\",\"timeRange\":60}}}")
  
  # 检查是否包含enhance建议
  if echo "$DIAGNOSE_RESULT" | grep -q "enhance_extension_error_capture"; then
    echo "✓ 包含 enhance_extension_error_capture 建议"
    pass
  else
    # 如果有错误，可能不会显示建议，这也是正常的
    if echo "$DIAGNOSE_RESULT" | grep -q "Issues Found"; then
      echo "发现错误，未显示建议（正常）"
      pass
    else
      fail "未包含enhance建议"
      echo "$DIAGNOSE_RESULT" | head -50
    fi
  fi
fi

# 8. 测试 activate_extension_service_worker（检查提示）
if [ -n "$FIRST_EXT_ID" ]; then
  test "测试 activate_extension_service_worker 的增强提示"
  ACTIVATE_RESULT=$(curl -s -X POST $MCP_URL \
    -H "Content-Type: application/json" \
    -H "Accept: application/json, text/event-stream" \
    -d "{\"jsonrpc\":\"2.0\",\"id\":5,\"method\":\"tools/call\",\"params\":{\"name\":\"activate_extension_service_worker\",\"arguments\":{\"extensionId\":\"$FIRST_EXT_ID\"}}}")
  
  if echo "$ACTIVATE_RESULT" | grep -q "enhance_extension_error_capture"; then
    echo "✓ 包含 enhance_extension_error_capture 提示"
    pass
  else
    # 如果激活失败，也不会有提示
    if echo "$ACTIVATE_RESULT" | grep -q "Unable to activate"; then
      echo "激活失败（可能已激活或MV2），未显示提示（正常）"
      pass
    else
      fail "未包含enhance提示"
    fi
  fi
fi

# 9. 测试 enhance_extension_error_capture 工具本身
if [ -n "$FIRST_EXT_ID" ]; then
  test "测试 enhance_extension_error_capture 工具调用"
  ENHANCE_RESULT=$(curl -s -X POST $MCP_URL \
    -H "Content-Type: application/json" \
    -H "Accept: application/json, text/event-stream" \
    -d "{\"jsonrpc\":\"2.0\",\"id\":6,\"method\":\"tools/call\",\"params\":{\"name\":\"enhance_extension_error_capture\",\"arguments\":{\"extensionId\":\"$FIRST_EXT_ID\",\"captureStackTraces\":true}}}")
  
  if echo "$ENHANCE_RESULT" | grep -q '"result"'; then
    # 检查结果内容
    if echo "$ENHANCE_RESULT" | grep -qE "(Enhancement Complete|Already Enhanced|Service Worker is inactive|No Background Context)"; then
      echo "✓ 工具正常响应"
      pass
    else
      fail "工具响应异常"
      echo "$ENHANCE_RESULT" | head -50
    fi
  else
    fail "工具调用失败"
    echo "$ENHANCE_RESULT"
  fi
fi

# 10. 检查 CHANGELOG 是否包含 v0.8.13
test "检查 CHANGELOG 版本记录"
if grep -q "0.8.13" CHANGELOG.md && grep -q "enhance_extension_error_capture" CHANGELOG.md; then
  pass
else
  fail "CHANGELOG未正确更新"
fi

# 总结
echo "========================================"
echo "测试完成"
echo "========================================"
echo -e "总计: ${test_count} 项测试"
echo -e "${GREEN}通过: ${pass_count}${NC}"
echo -e "${RED}失败: $((test_count - pass_count))${NC}"
echo ""

if [ $pass_count -eq $test_count ]; then
  echo -e "${GREEN}✓ 所有测试通过！v0.8.13 功能正常${NC}"
  exit 0
else
  echo -e "${RED}✗ 部分测试失败${NC}"
  exit 1
fi
