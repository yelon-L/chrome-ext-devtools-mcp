#!/bin/bash

# 简化的 EPIPE 测试

echo "=== 简化 EPIPE 测试 ==="
echo ""

# 测试1: 立即断开
echo "测试1: 立即断开连接"
timeout 0.2s bash -c 'echo "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"initialize\",\"params\":{}}" | node build/src/index.js --browserUrl http://localhost:9222 2>&1' | head -10
echo ""

# 测试2: 检查是否有 broken pipe 错误
echo "测试2: 检查错误输出"
output=$(timeout 0.3s bash -c 'echo "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"initialize\",\"params\":{}}" | node build/src/index.js --browserUrl http://localhost:9222 2>&1' || true)

if echo "$output" | grep -qi "broken pipe"; then
  echo "❌ 发现 broken pipe 错误"
  echo "$output" | grep -i "broken pipe"
  exit 1
elif echo "$output" | grep -qi "EPIPE.*error"; then
  echo "❌ 发现 EPIPE 错误"
  echo "$output" | grep -i "EPIPE"
  exit 1
else
  echo "✅ 没有 broken pipe 或 EPIPE 错误"
fi

echo ""
echo "测试3: 验证优雅关闭"
if echo "$output" | grep -q "Cleanup\|stdin closed"; then
  echo "✅ 看到优雅关闭消息"
  echo "$output" | grep -E "Cleanup|stdin closed"
else
  echo "⚠️  没有看到关闭消息（可能太快）"
fi

echo ""
echo "=== 测试完成 ==="
