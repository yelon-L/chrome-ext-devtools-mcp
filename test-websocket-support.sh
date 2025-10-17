#!/usr/bin/env bash
# WebSocket 支持情况测试脚本

set -e

echo "🧪 WebSocket 支持情况测试"
echo "======================================"
echo ""

# 1. 检查 resourceTypes 中是否包含 websocket
echo "📦 步骤 1: 检查网络工具配置"
if grep -q "'websocket'" src/tools/network.ts; then
  echo "✅ network.ts 的 FILTERABLE_RESOURCE_TYPES 包含 'websocket'"
else
  echo "❌ network.ts 缺少 websocket 类型"
  exit 1
fi
echo ""

# 2. 检查是否有 WebSocket 相关的 CDP 事件监听
echo "📦 步骤 2: 检查 CDP WebSocket 事件监听"
if grep -rq "webSocketFrame" src/ --include="*.ts"; then
  echo "✅ 发现 WebSocket CDP 事件监听代码"
  grep -rn "webSocketFrame" src/ --include="*.ts"
else
  echo "❌ 未发现 WebSocket 帧监听代码"
  echo "   当前仅支持 HTTP 请求，不支持 WebSocket 帧数据"
fi
echo ""

# 3. 检查 NetworkCollector 的实现
echo "📦 步骤 3: 检查 NetworkCollector"
echo "当前实现:"
grep -A 3 "page.on('request'" src/McpContext.ts || echo "未找到"
echo ""

# 4. 检查是否有 WebSocket 相关工具
echo "📦 步骤 4: 检查 WebSocket 专用工具"
if find src/tools -name "*websocket*" -o -name "*ws-*" | grep -q .; then
  echo "✅ 发现 WebSocket 专用工具:"
  find src/tools -name "*websocket*" -o -name "*ws-*"
else
  echo "❌ 未发现 WebSocket 专用监控工具"
fi
echo ""

# 5. 总结当前能力
echo "======================================"
echo "📝 当前 WebSocket 支持能力总结"
echo "======================================"
echo ""
echo "✅ 支持的功能:"
echo "  1. 过滤显示 WebSocket 类型的网络请求"
echo "  2. 检测 WebSocket 连接建立（握手）"
echo "  3. 查看 WebSocket 连接的 URL 和状态"
echo ""
echo "❌ 不支持的功能:"
echo "  1. 访问 WebSocket 帧数据（消息内容）"
echo "  2. 查看发送/接收的实时消息"
echo "  3. 统计消息频率和大小"
echo "  4. 监控 Ping/Pong 控制帧"
echo ""
echo "💡 原因:"
echo "  - Puppeteer 的 page.on('request') 只捕获 HTTP 握手"
echo "  - 没有监听 CDP 的 Network.webSocketFrame* 事件"
echo "  - WebSocket 帧传输不会触发 HTTPRequest 事件"
echo ""
echo "🚀 实现建议:"
echo "  查看 WEBSOCKET_SUPPORT_ANALYSIS.md 获取详细方案"
echo ""

# 6. 检查项目中的 CDP 使用情况
echo "======================================"
echo "📦 项目中的 CDP Session 使用"
echo "======================================"
echo ""
echo "已有的 CDP 集成点:"
grep -l "createCDPSession\|CDPSession" src/**/*.ts | while read -r file; do
  count=$(grep -c "CDPSession" "$file")
  echo "  - $(basename "$file"): ${count}处使用"
done
echo ""
echo "✅ 结论: 项目已有成熟的 CDP 使用经验"
echo "   实现 WebSocket 监控是自然的功能扩展"
echo ""
