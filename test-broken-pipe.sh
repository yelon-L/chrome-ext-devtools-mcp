#!/bin/bash

# 测试 broken pipe 错误场景
# 模拟客户端提前关闭连接

echo "=== Testing Broken Pipe Scenario ==="
echo ""

# 场景1: 立即关闭 stdin
echo "场景1: 立即关闭 stdin"
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}' | timeout 0.1s node build/src/index.js 2>&1 | head -20
echo ""

# 场景2: 发送请求后立即关闭
echo "场景2: 发送请求后立即关闭"
(echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}'; sleep 0.1) | timeout 0.2s node build/src/index.js 2>&1 | head -20
echo ""

# 场景3: 正常初始化后关闭
echo "场景3: 正常初始化后关闭"
(
  echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}'
  sleep 0.2
  echo '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}'
  sleep 0.1
) | timeout 0.5s node build/src/index.js 2>&1 | head -30

echo ""
echo "=== Test Complete ==="
