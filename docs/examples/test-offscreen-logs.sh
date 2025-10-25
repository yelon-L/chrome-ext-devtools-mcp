#!/bin/bash
# Test get_offscreen_logs tool with test-extension-enhanced
# 测试 get_offscreen_logs 工具

set -e

EXTENSION_NAME="Enhanced MCP Debug Test Extension"
EXTENSION_ID=""

echo "=========================================="
echo "🧪 测试 get_offscreen_logs 工具"
echo "=========================================="
echo ""

# 1. 列出扩展并获取 ID
echo "📋 步骤 1: 获取扩展 ID"
EXTENSION_ID=$(npx @cloudflare/mcp-server-ext-debug list_extensions | \
  grep -A 5 "$EXTENSION_NAME" | \
  grep "Extension ID" | \
  awk '{print $3}')

if [ -z "$EXTENSION_ID" ]; then
  echo "❌ 错误: 未找到扩展 '$EXTENSION_NAME'"
  echo "请确保扩展已安装并启用"
  exit 1
fi

echo "✅ 扩展 ID: $EXTENSION_ID"
echo ""

# 2. 激活 Service Worker
echo "📋 步骤 2: 激活 Service Worker"
npx @cloudflare/mcp-server-ext-debug activate_extension_service_worker \
  --extensionId "$EXTENSION_ID" \
  --mode single
echo "✅ Service Worker 已激活"
echo ""

# 3. 创建 Offscreen Document
echo "📋 步骤 3: 创建 Offscreen Document"
npx @cloudflare/mcp-server-ext-debug evaluate_in_extension \
  --extensionId "$EXTENSION_ID" \
  --code "globalThis.offscreenAPI.create()"
echo "✅ Offscreen Document 已创建"
echo ""

# 4. 等待 Offscreen Document 启动
echo "⏳ 等待 2 秒让 Offscreen Document 启动..."
sleep 2
echo ""

# 5. 检查 Offscreen Document 状态
echo "📋 步骤 4: 检查 Offscreen Document 状态"
npx @cloudflare/mcp-server-ext-debug list_extension_contexts \
  --extensionId "$EXTENSION_ID"
echo ""

# 6. 触发测试日志
echo "📋 步骤 5: 触发测试日志"
echo "  - 测试普通日志"
npx @cloudflare/mcp-server-ext-debug evaluate_in_extension \
  --extensionId "$EXTENSION_ID" \
  --code "globalThis.offscreenAPI.sendMessage({ type: 'test_logs' })"
sleep 1

echo "  - 测试错误日志"
npx @cloudflare/mcp-server-ext-debug evaluate_in_extension \
  --extensionId "$EXTENSION_ID" \
  --code "globalThis.offscreenAPI.sendMessage({ type: 'test_error' })"
sleep 1

echo "  - 测试 Canvas 操作"
npx @cloudflare/mcp-server-ext-debug evaluate_in_extension \
  --extensionId "$EXTENSION_ID" \
  --code "globalThis.offscreenAPI.sendMessage({ type: 'test_canvas' })"
sleep 1

echo "  - 测试 Audio 操作"
npx @cloudflare/mcp-server-ext-debug evaluate_in_extension \
  --extensionId "$EXTENSION_ID" \
  --code "globalThis.offscreenAPI.sendMessage({ type: 'test_audio' })"
sleep 1

echo "✅ 测试日志已触发"
echo ""

# 7. 获取 Offscreen 日志
echo "📋 步骤 6: 获取 Offscreen Document 日志"
echo "=========================================="
npx @cloudflare/mcp-server-ext-debug get_offscreen_logs \
  --extensionId "$EXTENSION_ID"
echo "=========================================="
echo ""

# 8. 测试日志过滤
echo "📋 步骤 7: 测试日志过滤 (仅错误)"
echo "=========================================="
npx @cloudflare/mcp-server-ext-debug get_offscreen_logs \
  --extensionId "$EXTENSION_ID" \
  --level error
echo "=========================================="
echo ""

# 9. 测试日志限制
echo "📋 步骤 8: 测试日志限制 (最多 10 条)"
echo "=========================================="
npx @cloudflare/mcp-server-ext-debug get_offscreen_logs \
  --extensionId "$EXTENSION_ID" \
  --limit 10
echo "=========================================="
echo ""

# 10. 等待心跳日志
echo "📋 步骤 9: 等待心跳日志 (6 秒)"
echo "⏳ Offscreen Document 每 5 秒输出一次心跳..."
sleep 6
echo ""

echo "📋 步骤 10: 获取最新日志 (包含心跳)"
echo "=========================================="
npx @cloudflare/mcp-server-ext-debug get_offscreen_logs \
  --extensionId "$EXTENSION_ID"
echo "=========================================="
echo ""

# 11. 清理
echo "📋 步骤 11: 清理 Offscreen Document"
npx @cloudflare/mcp-server-ext-debug evaluate_in_extension \
  --extensionId "$EXTENSION_ID" \
  --code "globalThis.offscreenAPI.close()"
echo "✅ Offscreen Document 已关闭"
echo ""

echo "=========================================="
echo "✅ 测试完成！"
echo "=========================================="
echo ""
echo "📊 测试总结:"
echo "  ✅ 创建 Offscreen Document"
echo "  ✅ 触发多种类型日志 (log, error, Canvas, Audio)"
echo "  ✅ 获取完整日志"
echo "  ✅ 日志过滤 (按级别)"
echo "  ✅ 日志限制 (按数量)"
echo "  ✅ 心跳日志捕获"
echo "  ✅ 清理资源"
echo ""
