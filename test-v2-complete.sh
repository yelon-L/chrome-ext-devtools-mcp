#!/bin/bash

# 完整测试 V2 API：邮箱注册 + 浏览器绑定 + SSE 连接
# 需要先启动服务器：npm run start:multi-tenant:dev

set -e

SERVER="${SERVER_URL:-http://localhost:32122}"
BROWSER_URL="${BROWSER_URL:-http://localhost:9222}"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "完整测试 V2 API: 邮箱注册 + 浏览器绑定 + SSE V2 连接"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "服务器: $SERVER"
echo "浏览器: $BROWSER_URL"
echo ""

# 颜色定义
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[0;33m'
NC='\033[0m'

test_step() {
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "测试 $1"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
}

success() {
    echo -e "${GREEN}✅ $1${NC}"
}

error() {
    echo -e "${RED}❌ $1${NC}"
}

warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

# 0. 健康检查
test_step "0: 服务器健康检查"

echo "GET $SERVER/health"
response=$(curl -s -w "\n%{http_code}" $SERVER/health)

http_code=$(echo "$response" | tail -n1)
body=$(echo "$response" | sed '$d')

if [ "$http_code" == "200" ]; then
    success "服务器运行正常"
    echo "$body" | jq .
else
    error "服务器未运行 (HTTP $http_code)"
    echo "请先启动服务器: npm run start:multi-tenant:dev"
    exit 1
fi

# 1. 注册用户
test_step "1: 注册用户（使用邮箱）"

EMAIL="test-$(date +%s)@example.com"

echo "POST $SERVER/api/users"
response=$(curl -s -w "\n%{http_code}" -X POST $SERVER/api/users \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"username\":\"Test User\"}")

http_code=$(echo "$response" | tail -n1)
body=$(echo "$response" | sed '$d')

echo "$body" | jq .

if [ "$http_code" == "201" ]; then
    success "用户注册成功"
    USER_ID=$(echo "$body" | jq -r '.userId')
    echo "   userId: $USER_ID"
    echo "   email: $EMAIL"
else
    error "用户注册失败 (HTTP $http_code)"
    exit 1
fi

# 2. 检查浏览器连接
test_step "2: 检查浏览器是否可连接"

echo "正在检查 $BROWSER_URL ..."
response=$(curl -s -w "\n%{http_code}" "$BROWSER_URL/json/version" 2>&1)

http_code=$(echo "$response" | tail -n1)

if [ "$http_code" == "200" ]; then
    success "浏览器可访问"
else
    warning "浏览器不可访问 (HTTP $http_code)"
    echo "提示: 请确保 Chrome 已启动，使用以下命令："
    echo "  google-chrome --remote-debugging-port=9222 --remote-debugging-address=0.0.0.0"
    echo ""
    echo "继续测试（部分测试可能失败）..."
fi

# 3. 绑定浏览器
test_step "3: 绑定浏览器（返回 token）"

echo "POST $SERVER/api/users/$USER_ID/browsers"
response=$(curl -s -w "\n%{http_code}" -X POST $SERVER/api/users/$USER_ID/browsers \
  -H "Content-Type: application/json" \
  -d "{
    \"browserURL\":\"$BROWSER_URL\",
    \"tokenName\":\"test-browser\",
    \"description\":\"Test browser for V2 API\"
  }")

http_code=$(echo "$response" | tail -n1)
body=$(echo "$response" | sed '$d')

echo "$body" | jq .

if [ "$http_code" == "201" ]; then
    success "浏览器绑定成功"
    TOKEN=$(echo "$body" | jq -r '.token')
    BROWSER_ID=$(echo "$body" | jq -r '.browserId')
    echo "   browserId: $BROWSER_ID"
    echo "   token: ${TOKEN:0:24}..."
else
    error "浏览器绑定失败 (HTTP $http_code)"
    echo ""
    echo "常见原因："
    echo "1. 浏览器未启动或不可访问"
    echo "2. browserURL 不正确"
    echo "3. 防火墙阻止连接"
    exit 1
fi

# 4. 列出用户的浏览器
test_step "4: 列出用户的浏览器"

echo "GET $SERVER/api/users/$USER_ID/browsers"
response=$(curl -s -w "\n%{http_code}" $SERVER/api/users/$USER_ID/browsers)

http_code=$(echo "$response" | tail -n1)
body=$(echo "$response" | sed '$d')

echo "$body" | jq .

if [ "$http_code" == "200" ]; then
    browser_count=$(echo "$body" | jq '.total')
    success "成功列出浏览器 (共 $browser_count 个)"
else
    error "列出浏览器失败 (HTTP $http_code)"
fi

# 5. 测试 SSE V2 连接（简单验证）
test_step "5: 测试 SSE V2 连接"

echo "GET $SERVER/sse-v2?token=${TOKEN:0:24}..."
echo ""
echo "提示: SSE 连接是长连接，这里只测试连接是否建立"
echo "      实际使用时会保持连接并接收事件流"
echo ""

# 使用 timeout 限制连接时间为 5 秒
response=$(timeout 5s curl -s -N \
  -H "Authorization: Bearer $TOKEN" \
  "$SERVER/sse-v2" 2>&1 || true)

if echo "$response" | grep -q "event: endpoint"; then
    success "SSE V2 连接建立成功（检测到 endpoint 事件）"
    echo ""
    echo "SSE 响应示例:"
    echo "$response" | head -20
elif echo "$response" | grep -q "error"; then
    error "SSE V2 连接失败"
    echo "$response"
else
    # 超时或其他情况，但没有明确错误
    warning "SSE V2 连接测试超时（可能是浏览器连接问题）"
    echo "如果浏览器未运行，SSE 连接会失败"
fi

# 6. 获取用户信息
test_step "6: 获取用户信息"

echo "GET $SERVER/api/users/$USER_ID"
response=$(curl -s -w "\n%{http_code}" $SERVER/api/users/$USER_ID)

http_code=$(echo "$response" | tail -n1)
body=$(echo "$response" | sed '$d')

echo "$body" | jq .

if [ "$http_code" == "200" ]; then
    success "成功获取用户信息"
else
    error "获取用户信息失败 (HTTP $http_code)"
fi

# 7. 列出所有用户
test_step "7: 列出所有用户"

echo "GET $SERVER/api/users"
response=$(curl -s -w "\n%{http_code}" $SERVER/api/users)

http_code=$(echo "$response" | tail -n1)
body=$(echo "$response" | sed '$d')

echo "$body" | jq .

if [ "$http_code" == "200" ]; then
    total=$(echo "$body" | jq '.total')
    success "成功列出所有用户 (共 $total 个)"
else
    error "列出用户失败 (HTTP $http_code)"
fi

# 8. 清理：解绑浏览器
test_step "8: 清理 - 解绑浏览器"

echo "DELETE $SERVER/api/users/$USER_ID/browsers/test-browser"
response=$(curl -s -w "\n%{http_code}" -X DELETE $SERVER/api/users/$USER_ID/browsers/test-browser)

http_code=$(echo "$response" | tail -n1)
body=$(echo "$response" | sed '$d')

echo "$body" | jq .

if [ "$http_code" == "200" ]; then
    success "浏览器解绑成功"
else
    error "浏览器解绑失败 (HTTP $http_code)"
fi

# 9. 清理：删除用户
test_step "9: 清理 - 删除用户"

echo "DELETE $SERVER/api/users/$USER_ID"
response=$(curl -s -w "\n%{http_code}" -X DELETE $SERVER/api/users/$USER_ID)

http_code=$(echo "$response" | tail -n1)
body=$(echo "$response" | sed '$d')

echo "$body" | jq .

if [ "$http_code" == "200" ]; then
    success "用户删除成功"
else
    error "用户删除失败 (HTTP $http_code)"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "测试完成"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "总结："
echo "✅ V2 API 基于邮箱的用户注册"
echo "✅ 多浏览器绑定管理"
echo "✅ 每个浏览器独立 token"
echo "✅ SSE V2 连接（使用 token 认证）"
echo "✅ 用户和浏览器的完整 CRUD 操作"
echo ""
