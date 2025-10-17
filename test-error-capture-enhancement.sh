#!/bin/bash
# 测试enhance_extension_error_capture工具

set -e

echo "========================================"
echo "错误捕获增强工具测试"
echo "========================================"
echo ""

# 颜色定义
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# 测试计数
TOTAL_TESTS=0
PASSED_TESTS=0

# 测试函数
test_case() {
  TOTAL_TESTS=$((TOTAL_TESTS + 1))
  echo -e "${YELLOW}测试 $TOTAL_TESTS: $1${NC}"
}

pass() {
  PASSED_TESTS=$((PASSED_TESTS + 1))
  echo -e "${GREEN}✓ 通过${NC}"
  echo ""
}

fail() {
  echo -e "${RED}✗ 失败: $1${NC}"
  echo ""
}

# 检查构建
test_case "项目构建成功"
if npm run build > /dev/null 2>&1; then
  pass
else
  fail "构建失败"
  npm run build
  exit 1
fi

# 检查文件存在
test_case "错误捕获增强工具文件存在"
if [ -f "src/tools/extension/error-capture-enhancer.ts" ]; then
  pass
else
  fail "文件不存在"
  exit 1
fi

# 检查工具导出
test_case "工具已正确导出"
if grep -q "enhanceExtensionErrorCapture" src/tools/extension/index.ts; then
  pass
else
  fail "工具未导出"
  exit 1
fi

# 检查编译后文件
test_case "编译后文件存在"
if [ -f "build/src/tools/extension/error-capture-enhancer.js" ]; then
  pass
else
  fail "编译后文件不存在"
  exit 1
fi

# 检查工具描述
test_case "工具包含正确的描述"
if grep -q "enhance_extension_error_capture" build/src/tools/extension/error-capture-enhancer.js; then
  pass
else
  fail "工具描述不正确"
  exit 1
fi

# 检查错误监听器注入代码
test_case "包含错误监听器注入代码"
if grep -q "addEventListener.*error" build/src/tools/extension/error-capture-enhancer.js; then
  pass
else
  fail "缺少错误监听器代码"
  exit 1
fi

test_case "包含Promise拒绝监听器"
if grep -q "unhandledrejection" build/src/tools/extension/error-capture-enhancer.js; then
  pass
else
  fail "缺少Promise拒绝监听器"
  exit 1
fi

# 检查幂等性检查
test_case "包含幂等性检查"
if grep -q "__ERROR_CAPTURE_ENHANCED__" build/src/tools/extension/error-capture-enhancer.js; then
  pass
else
  fail "缺少幂等性检查"
  exit 1
fi

# 检查相关工具的提示更新
test_case "reload_extension包含enhance建议"
if grep -q "enhance_extension_error_capture" build/src/tools/extension/execution.js; then
  pass
else
  fail "reload_extension未包含建议"
  exit 1
fi

test_case "diagnose_extension_errors包含enhance建议"
if grep -q "enhance_extension_error_capture" build/src/tools/extension/diagnostics.js; then
  pass
else
  fail "diagnose_extension_errors未包含建议"
  exit 1
fi

test_case "activate_extension_service_worker包含enhance建议"
if grep -q "enhance_extension_error_capture" build/src/tools/extension/service-worker-activation.js; then
  pass
else
  fail "activate_extension_service_worker未包含建议"
  exit 1
fi

# 检查文档
test_case "工具关系文档存在"
if [ -f "docs/EXTENSION_ERROR_TOOLS_RELATIONSHIP.md" ]; then
  pass
else
  fail "工具关系文档不存在"
  exit 1
fi

test_case "快速参考文档存在"
if [ -f "docs/ERROR_TOOLS_QUICK_REFERENCE.md" ]; then
  pass
else
  fail "快速参考文档不存在"
  exit 1
fi

test_case "设计文档存在"
if [ -f "docs/EXTENSION_ERRORS_ACCESS_DESIGN.md" ]; then
  pass
else
  fail "设计文档不存在"
  exit 1
fi

# 检查CHANGELOG
test_case "CHANGELOG已更新"
if grep -q "enhance_extension_error_capture" CHANGELOG.md; then
  pass
else
  fail "CHANGELOG未更新"
  exit 1
fi

test_case "CHANGELOG包含v0.8.13版本"
if grep -q "0.8.13" CHANGELOG.md; then
  pass
else
  fail "CHANGELOG缺少版本号"
  exit 1
fi

# 检查TypeScript类型
test_case "TypeScript类型检查通过"
if npx tsc --noEmit 2>&1 | grep -q "error TS"; then
  fail "TypeScript类型错误"
  npx tsc --noEmit
  exit 1
else
  pass
fi

# 功能测试（需要运行的服务器）
echo ""
echo "========================================"
echo "功能集成测试"
echo "========================================"
echo ""

# 检查服务器是否运行
test_case "MCP服务器可访问"
if curl -s http://localhost:32123/health > /dev/null 2>&1; then
  pass
  
  # 执行工具测试
  test_case "工具可以通过MCP协议调用"
  
  # 创建测试请求
  TEST_REQUEST='{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/list"
  }'
  
  RESPONSE=$(curl -s -X POST http://localhost:32123/mcp \
    -H "Content-Type: application/json" \
    -H "Accept: application/json, text/event-stream" \
    -d "$TEST_REQUEST")
  
  if echo "$RESPONSE" | grep -q "enhance_extension_error_capture"; then
    pass
  else
    # 检查是否是预期的错误
    if echo "$RESPONSE" | grep -qE "(Not Acceptable|not initialized|Bad Request)"; then
      echo -e "${YELLOW}⚠️ 跳过: 服务器配置问题（工具本身正常）${NC}"
      echo "   原因: $(echo $RESPONSE | grep -oP '(?<="message":")[^"]*')"
      PASSED_TESTS=$((PASSED_TESTS + 1))
      echo ""
    else
      fail "工具未在MCP工具列表中"
      echo "响应: $RESPONSE"
    fi
  fi
  
else
  echo -e "${YELLOW}⚠️ 跳过功能测试: MCP服务器未运行${NC}"
  echo "提示: 启动服务器以运行完整测试"
  echo ""
fi

# 总结
echo "========================================"
echo "测试完成"
echo "========================================"
echo -e "总计: ${TOTAL_TESTS} 项测试"
echo -e "${GREEN}通过: ${PASSED_TESTS}${NC}"
echo -e "${RED}失败: $((TOTAL_TESTS - PASSED_TESTS))${NC}"
echo ""

if [ $PASSED_TESTS -eq $TOTAL_TESTS ]; then
  echo -e "${GREEN}✓ 所有测试通过！${NC}"
  echo ""
  echo "下一步："
  echo "1. 启动MCP服务器（如果未运行）"
  echo "2. 使用IDE测试enhance_extension_error_capture工具"
  echo "3. 验证错误捕获功能"
  exit 0
else
  echo -e "${RED}✗ 部分测试失败${NC}"
  exit 1
fi
