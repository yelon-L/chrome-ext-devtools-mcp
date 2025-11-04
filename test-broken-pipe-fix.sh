#!/bin/bash

# 测试 broken pipe 修复
# 模拟真实的客户端断开场景

echo "=== Testing Broken Pipe Fix ==="
echo ""

# 启动 Chrome 用于测试
echo "启动 Chrome (如果未运行)..."
if ! pgrep -f "chrome.*remote-debugging-port=9222" > /dev/null; then
  google-chrome --remote-debugging-port=9222 --user-data-dir=/tmp/chrome-test-broken-pipe &
  CHROME_PID=$!
  echo "Chrome PID: $CHROME_PID"
  sleep 2
else
  echo "Chrome 已在运行"
fi

echo ""
echo "=== 场景1: 客户端在初始化后立即断开 ==="
(
  # 发送初始化请求
  echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}'
  sleep 0.5
  # 客户端断开（关闭 stdin）
) | timeout 1s node build/src/index.js --browserUrl http://localhost:9222 2>&1 | grep -E "(EPIPE|Cleanup|error)" || echo "✅ 没有 EPIPE 错误"

echo ""
echo "=== 场景2: 客户端在工具调用期间断开 ==="
(
  # 初始化
  echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}'
  sleep 0.3
  # 请求工具列表
  echo '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}'
  sleep 0.2
  # 客户端断开
) | timeout 1s node build/src/index.js --browserUrl http://localhost:9222 2>&1 | grep -E "(EPIPE|Cleanup|error)" || echo "✅ 没有 EPIPE 错误"

echo ""
echo "=== 场景3: 服务端尝试写入大量数据时客户端断开 ==="
(
  # 初始化
  echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}'
  sleep 0.3
  # 请求工具列表（会返回大量数据）
  echo '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}'
  sleep 0.1
  # 立即断开，不等待响应
) | timeout 0.6s node build/src/index.js --browserUrl http://localhost:9222 2>&1 | grep -E "(EPIPE|Cleanup|error|broken pipe)" || echo "✅ 没有 broken pipe 错误"

echo ""
echo "=== 场景4: 正常关闭（对比） ==="
(
  echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}'
  sleep 0.3
  echo '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}'
  sleep 0.5
  # 正常关闭
) | timeout 1.5s node build/src/index.js --browserUrl http://localhost:9222 2>&1 | tail -5

echo ""
echo "=== 测试完成 ==="
echo ""
echo "预期结果："
echo "  ✅ 所有场景都应该优雅退出"
echo "  ✅ 不应该看到 'broken pipe' 错误"
echo "  ✅ 应该看到 'Cleanup initiated' 消息"
echo "  ✅ 不应该有未捕获的异常"
