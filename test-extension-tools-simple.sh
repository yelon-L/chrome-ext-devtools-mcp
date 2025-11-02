#!/bin/bash
# 测试所有扩展工具的简单脚本

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🧪 Enhanced MCP Debug Test Extension - 工具测试"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# 启动 HTTP 模式的 MCP 服务器
echo ""
echo "📡 启动 MCP 服务器 (HTTP 模式)..."
node build/src/server-http.js --browserUrl http://localhost:9222 &
SERVER_PID=$!

# 等待服务器启动
sleep 3

echo "✅ MCP 服务器已启动 (PID: $SERVER_PID)"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📦 测试工具列表"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "扩展工具:"
echo "  1. list_extensions - 列出所有扩展"
echo "  2. get_extension_details - 获取扩展详情"
echo "  3. activate_extension_service_worker - 激活 Service Worker"
echo "  4. list_extension_contexts - 列出扩展上下文"
echo "  5. get_background_logs - 获取 background 日志"
echo "  6. get_offscreen_logs - 获取 offscreen 日志"
echo "  7. get_extension_runtime_errors - 获取运行时错误"
echo "  8. inspect_extension_storage - 检查存储"
echo "  9. check_content_script_injection - 检查内容脚本"
echo " 10. evaluate_in_extension - 执行代码"
echo " 11. open_extension_popup - 打开 popup"
echo " 12. is_popup_open - 检查 popup 状态"
echo " 13. get_popup_info - 获取 popup 信息"
echo " 14. close_popup - 关闭 popup"
echo " 15. reload_extension - 重载扩展"
echo " 16. clear_extension_errors - 清除错误"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ HTTP 服务器运行在 http://localhost:32122"
echo "✅ 可以通过 Postman 或 curl 测试工具"
echo ""
echo "示例 curl 命令:"
echo "curl -X POST http://localhost:32122/mcp/v1/tools/list_extensions \\"
echo "  -H 'Content-Type: application/json' \\"
echo "  -d '{}'"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "按 Ctrl+C 停止服务器"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# 等待用户中断
wait $SERVER_PID
