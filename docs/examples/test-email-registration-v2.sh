#!/bin/bash

# 测试基于邮箱的用户注册和浏览器管理（V2 API）
# 需要先启动服务器：npm run server:multi-tenant

set -e

SERVER="${SERVER_URL:-http://localhost:32136}"
BROWSER_URL="${BROWSER_URL:-http://localhost:9222}"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "测试 V2 API: 基于邮箱的用户注册和多浏览器管理"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "服务器: $SERVER"
echo "浏览器: $BROWSER_URL"
echo ""

# 颜色定义
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# 测试函数
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

# 1. 注册用户
test_step "1: 注册用户（使用邮箱）"

echo "POST $SERVER/api/users"
response=$(curl -s -w "\n%{http_code}" -X POST $SERVER/api/users \
  -H "Content-Type: application/json" \
  -d '{"email":"alice@example.com","username":"Alice"}')

http_code=$(echo "$response" | tail -n1)
body=$(echo "$response" | sed '$d')

echo "$body" | jq .

if [ "$http_code" == "201" ]; then
    success "用户注册成功"
    USER_ID=$(echo "$body" | jq -r '.userId')
    echo "   userId: $USER_ID"
else
    error "用户注册失败 (HTTP $http_code)"
    exit 1
fi

# 2. 绑定浏览器
test_step "2: 绑定浏览器（返回 token）"

echo "POST $SERVER/api/users/$USER_ID/browsers"
response=$(curl -s -w "\n%{http_code}" -X POST $SERVER/api/users/$USER_ID/browsers \
  -H "Content-Type: application/json" \
  -d "{
    \"browserURL\":\"$BROWSER_URL\",
    \"tokenName\":\"dev-chrome\",
    \"description\":\"Development browser\"
  }")

http_code=$(echo "$response" | tail -n1)
body=$(echo "$response" | sed '$d')

echo "$body" | jq .

if [ "$http_code" == "201" ]; then
    success "浏览器绑定成功"
    TOKEN=$(echo "$body" | jq -r '.token')
    echo "   token: ${TOKEN:0:20}..."
else
    error "浏览器绑定失败 (HTTP $http_code)"
    # 不退出，继续测试其他功能
fi

# 3. 列出用户的浏览器
test_step "3: 列出用户的浏览器"

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

# 4. 获取用户信息
test_step "4: 获取用户信息"

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

# 5. 更新用户名
test_step "5: 更新用户名"

echo "PATCH $SERVER/api/users/$USER_ID"
response=$(curl -s -w "\n%{http_code}" -X PATCH $SERVER/api/users/$USER_ID \
  -H "Content-Type: application/json" \
  -d '{"username":"Alice Wonder"}')

http_code=$(echo "$response" | tail -n1)
body=$(echo "$response" | sed '$d')

echo "$body" | jq .

if [ "$http_code" == "200" ]; then
    success "用户名更新成功"
else
    error "用户名更新失败 (HTTP $http_code)"
fi

# 6. 列出所有用户
test_step "6: 列出所有用户"

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

# 7. 更新浏览器描述
test_step "7: 更新浏览器描述"

echo "PATCH $SERVER/api/users/$USER_ID/browsers/dev-chrome"
response=$(curl -s -w "\n%{http_code}" -X PATCH $SERVER/api/users/$USER_ID/browsers/dev-chrome \
  -H "Content-Type: application/json" \
  -d '{"description":"Updated development browser"}')

http_code=$(echo "$response" | tail -n1)
body=$(echo "$response" | sed '$d')

echo "$body" | jq .

if [ "$http_code" == "200" ]; then
    success "浏览器信息更新成功"
else
    error "浏览器信息更新失败 (HTTP $http_code)"
fi

# 8. 解绑浏览器
test_step "8: 解绑浏览器"

echo "DELETE $SERVER/api/users/$USER_ID/browsers/dev-chrome"
response=$(curl -s -w "\n%{http_code}" -X DELETE $SERVER/api/users/$USER_ID/browsers/dev-chrome)

http_code=$(echo "$response" | tail -n1)
body=$(echo "$response" | sed '$d')

echo "$body" | jq .

if [ "$http_code" == "200" ]; then
    success "浏览器解绑成功"
else
    error "浏览器解绑失败 (HTTP $http_code)"
fi

# 9. 删除用户
test_step "9: 删除用户（级联删除所有浏览器）"

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
echo "- V2 API 提供了基于邮箱的用户注册"
echo "- 每个用户可以绑定多个浏览器"
echo "- 每个浏览器绑定时会生成独立的 token"
echo "- Token 直接对应浏览器实例，简化了管理"
echo ""
