#!/bin/bash

# 测试多租户模式下浏览器绑定验证的改进
# 
# 改进内容：
# 1. 注册时如果浏览器检测失败，返回错误并拒绝注册
# 2. 更新浏览器时如果检测失败，返回错误且不更新

set -e

SERVER_URL="${SERVER_URL:-http://localhost:32136}"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "测试 1: 注册用户时浏览器不可访问 - 应该失败"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

echo ""
echo "尝试注册用户 'test-invalid' 并绑定不存在的浏览器..."
response=$(curl -s -X POST ${SERVER_URL}/api/register \
  -H "Content-Type: application/json" \
  -d '{"userId":"test-invalid","browserURL":"http://invalid-host:9999"}')

echo "响应:"
echo "$response" | jq .

# 检查是否返回错误
if echo "$response" | jq -e '.error' > /dev/null; then
  echo "✅ 正确：注册被拒绝（浏览器不可访问）"
  
  # 检查错误代码
  error_code=$(echo "$response" | jq -r '.error')
  if [ "$error_code" == "BROWSER_NOT_ACCESSIBLE" ]; then
    echo "✅ 正确：错误代码为 BROWSER_NOT_ACCESSIBLE"
  else
    echo "❌ 错误：错误代码不是 BROWSER_NOT_ACCESSIBLE，而是 $error_code"
  fi
  
  # 检查是否有友好的错误提示
  if echo "$response" | jq -e '.suggestions' > /dev/null; then
    echo "✅ 正确：包含友好的错误提示"
    echo "建议:"
    echo "$response" | jq -r '.suggestions[]' | sed 's/^/  - /'
  else
    echo "❌ 错误：缺少友好的错误提示"
  fi
else
  echo "❌ 错误：注册应该失败但却成功了"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "测试 2: 验证用户未被注册"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

echo ""
echo "获取用户列表..."
users_response=$(curl -s ${SERVER_URL}/api/users)
echo "$users_response" | jq .

# 检查 test-invalid 用户不在列表中
if echo "$users_response" | jq -e '.users[] | select(.userId == "test-invalid")' > /dev/null; then
  echo "❌ 错误：用户 'test-invalid' 不应该存在但出现在列表中"
else
  echo "✅ 正确：用户 'test-invalid' 未被注册"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "测试 3: 注册用户时浏览器可访问 - 应该成功"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# 假设有一个可访问的浏览器（需要实际运行 Chrome）
VALID_BROWSER_URL="${VALID_BROWSER_URL:-http://192.168.239.136:9222}"

echo ""
echo "尝试注册用户 'test-valid' 并绑定浏览器 ${VALID_BROWSER_URL}..."
valid_response=$(curl -s -X POST ${SERVER_URL}/api/register \
  -H "Content-Type: application/json" \
  -d "{\"userId\":\"test-valid-$(date +%s)\",\"browserURL\":\"${VALID_BROWSER_URL}\"}" || echo '{"error":"connection_failed"}')

echo "响应:"
echo "$valid_response" | jq .

if echo "$valid_response" | jq -e '.success' > /dev/null; then
  echo "✅ 正确：注册成功（浏览器可访问）"
  
  # 检查是否包含浏览器信息
  if echo "$valid_response" | jq -e '.browser.info' > /dev/null; then
    echo "✅ 正确：包含浏览器详细信息"
    echo "$valid_response" | jq '.browser.info'
  else
    echo "❌ 错误：缺少浏览器详细信息"
  fi
else
  echo "⚠️  注意：浏览器不可访问或服务器未运行"
  echo "   请确保:"
  echo "   1. Chrome 已启动: chrome --remote-debugging-port=9222"
  echo "   2. 服务器正在运行: npm run server:multi-tenant"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "测试完成"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
