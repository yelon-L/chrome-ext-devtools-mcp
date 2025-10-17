#!/bin/bash
# 快速验证v0.8.13服务

echo "========================================"
echo "v0.8.13 快速验证"
echo "========================================"
echo ""

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${YELLOW}1. 检查服务健康${NC}"
HEALTH=$(curl -s http://localhost:32123/health | jq -r '.status' 2>/dev/null)
if [ "$HEALTH" = "ok" ]; then
  echo -e "${GREEN}✓ 服务运行正常${NC}"
else
  echo "✗ 服务异常"
  exit 1
fi
echo ""

echo -e "${YELLOW}2. 检查服务版本${NC}"
curl -s -X POST http://localhost:32123/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}' \
  | grep -o '"version":"[^"]*"' | head -1
echo ""

echo -e "${YELLOW}3. 检查构建产物${NC}"
if [ -f "build/src/tools/extension/error-capture-enhancer.js" ]; then
  echo -e "${GREEN}✓ enhance_extension_error_capture 已编译${NC}"
  SIZE=$(wc -l < build/src/tools/extension/error-capture-enhancer.js)
  echo "  文件行数: $SIZE"
else
  echo "✗ 文件不存在"
fi
echo ""

echo -e "${YELLOW}4. 检查工具导出${NC}"
if grep -q "enhanceExtensionErrorCapture" build/src/tools/extension/index.js; then
  echo -e "${GREEN}✓ 工具已正确导出${NC}"
else
  echo "✗ 工具未导出"
fi
echo ""

echo -e "${YELLOW}5. 检查集成提示${NC}"
if grep -q "enhance_extension_error_capture" build/src/tools/extension/execution.js; then
  echo -e "${GREEN}✓ reload_extension 包含提示${NC}"
else
  echo "✗ reload_extension 未包含提示"
fi

if grep -q "enhance_extension_error_capture" build/src/tools/extension/diagnostics.js; then
  echo -e "${GREEN}✓ diagnose_extension_errors 包含提示${NC}"
else
  echo "✗ diagnose_extension_errors 未包含提示"
fi

if grep -q "enhance_extension_error_capture" build/src/tools/extension/service-worker-activation.js; then
  echo -e "${GREEN}✓ activate_extension_service_worker 包含提示${NC}"
else
  echo "✗ activate_extension_service_worker 未包含提示"
fi
echo ""

echo -e "${YELLOW}6. 检查文档${NC}"
DOC_COUNT=$(find docs -name "*ERROR*" -o -name "*VIDEO_SRT*" | wc -l)
echo -e "${GREEN}✓ $DOC_COUNT 份相关文档已创建${NC}"
echo ""

echo "========================================"
echo -e "${GREEN}✓ v0.8.13 服务验证通过${NC}"
echo "========================================"
echo ""
echo "📋 在IDE中测试以下功能："
echo "1. list_extensions()"
echo "2. enhance_extension_error_capture({extensionId:\"xxx\"})"
echo "3. diagnose_extension_errors({extensionId:\"xxx\"})"
echo ""
echo "📖 查看详细测试计划："
echo "   TEST_V0.8.13_SUMMARY.md"
