#!/bin/bash
################################################################################
# 完整功能测试脚本
# 测试：PostgreSQL存储 + V2 API + MCP工具
################################################################################

set -e

BASE_URL="http://localhost:32122"
CHROME_URL="http://localhost:9222"

echo "╔═══════════════════════════════════════════════════════════════════╗"
echo "║                     完整功能测试                                   ║"
echo "╚═══════════════════════════════════════════════════════════════════╝"
echo ""

# 测试计数
PASSED=0
FAILED=0

# 测试函数
test_api() {
    local name="$1"
    local method="$2"
    local path="$3"
    local data="$4"
    local expected_status="$5"
    
    echo "🔧 测试: $name"
    
    if [ -z "$data" ]; then
        response=$(curl -s -w "\n%{http_code}" -X "$method" "$BASE_URL$path" -H "Content-Type: application/json")
    else
        response=$(curl -s -w "\n%{http_code}" -X "$method" "$BASE_URL$path" -H "Content-Type: application/json" -d "$data")
    fi
    
    status=$(echo "$response" | tail -n1)
    body=$(echo "$response" | sed '$d')
    
    if [ "$status" = "$expected_status" ]; then
        echo "   ✅ 成功 (HTTP $status)"
        ((PASSED++))
        echo "$body" | jq '.' 2>/dev/null || echo "$body"
    else
        echo "   ❌ 失败 (HTTP $status, 期望 $expected_status)"
        ((FAILED++))
        echo "$body"
    fi
    echo ""
}

echo "═══════════════════════════════════════════════════════════════════"
echo "第1部分: 健康检查和系统端点"
echo "═══════════════════════════════════════════════════════════════════"
echo ""

test_api "健康检查" "GET" "/health" "" "200"
test_api "性能指标" "GET" "/metrics" "" "200"

echo "═══════════════════════════════════════════════════════════════════"
echo "第2部分: V2 API - 用户管理"
echo "═══════════════════════════════════════════════════════════════════"
echo ""

test_api "注册用户1" "POST" "/api/v2/users" '{"email":"test1@example.com","username":"Test User 1"}' "201"
test_api "注册用户2" "POST" "/api/v2/users" '{"email":"test2@example.com","username":"Test User 2"}' "201"
test_api "重复注册（应该失败）" "POST" "/api/v2/users" '{"email":"test1@example.com","username":"Duplicate"}' "409"
test_api "列出所有用户" "GET" "/api/v2/users" "" "200"
test_api "获取用户1信息" "GET" "/api/v2/users/test1" "" "200"
test_api "更新用户1名称" "PATCH" "/api/v2/users/test1" '{"username":"Updated Name"}' "200"

echo "═══════════════════════════════════════════════════════════════════"
echo "第3部分: V2 API - 浏览器管理"
echo "═══════════════════════════════════════════════════════════════════"
echo ""

test_api "绑定浏览器1" "POST" "/api/v2/users/test1/browsers" "{\"browserURL\":\"$CHROME_URL\",\"tokenName\":\"browser1\",\"description\":\"测试浏览器1\"}" "201"

# 提取token（用于后续测试）
TOKEN=$(curl -s -X POST "$BASE_URL/api/v2/users/test1/browsers" \
    -H "Content-Type: application/json" \
    -d "{\"browserURL\":\"http://localhost:9223\",\"tokenName\":\"browser2\",\"description\":\"测试浏览器2\"}" | jq -r '.token')

if [ -n "$TOKEN" ] && [ "$TOKEN" != "null" ]; then
    echo "🔧 测试: 绑定浏览器2"
    echo "   ✅ 成功 (获取到token: ${TOKEN:0:32}...)"
    ((PASSED++))
else
    echo "🔧 测试: 绑定浏览器2"
    echo "   ❌ 失败 (未获取到token)"
    ((FAILED++))
fi
echo ""

test_api "列出用户1的浏览器" "GET" "/api/v2/users/test1/browsers" "" "200"

# 获取browserId用于更新和删除
BROWSER_ID=$(curl -s "$BASE_URL/api/v2/users/test1/browsers" | jq -r '.[0].browserId')

if [ -n "$BROWSER_ID" ] && [ "$BROWSER_ID" != "null" ]; then
    test_api "更新浏览器描述" "PATCH" "/api/v2/users/test1/browsers/$BROWSER_ID" '{"description":"更新后的描述"}' "200"
    test_api "获取单个浏览器" "GET" "/api/v2/users/test1/browsers/$BROWSER_ID" "" "200"
fi

echo "═══════════════════════════════════════════════════════════════════"
echo "第4部分: SSE连接测试"
echo "═══════════════════════════════════════════════════════════════════"
echo ""

if [ -n "$TOKEN" ] && [ "$TOKEN" != "null" ]; then
    echo "🔧 测试: SSE连接"
    timeout 5 curl -s "$BASE_URL/api/v2/sse?token=$TOKEN" > /tmp/sse-test.log 2>&1 &
    SSE_PID=$!
    sleep 2
    
    if ps -p $SSE_PID > /dev/null; then
        echo "   ✅ 成功 (SSE连接建立)"
        ((PASSED++))
        kill $SSE_PID 2>/dev/null || true
    else
        echo "   ❌ 失败 (SSE连接未建立)"
        ((FAILED++))
    fi
    echo ""
fi

echo "═══════════════════════════════════════════════════════════════════"
echo "第5部分: 数据清理"
echo "═══════════════════════════════════════════════════════════════════"
echo ""

if [ -n "$BROWSER_ID" ] && [ "$BROWSER_ID" != "null" ]; then
    test_api "删除浏览器" "DELETE" "/api/v2/users/test1/browsers/$BROWSER_ID" "" "200"
fi

test_api "删除用户1" "DELETE" "/api/v2/users/test1" "" "200"
test_api "删除用户2" "DELETE" "/api/v2/users/test2" "" "200"
test_api "验证用户已删除" "GET" "/api/v2/users/test1" "" "404"

echo "═══════════════════════════════════════════════════════════════════"
echo "测试总结"
echo "═══════════════════════════════════════════════════════════════════"
echo ""

TOTAL=$((PASSED + FAILED))
PASS_RATE=$(awk "BEGIN {printf \"%.1f\", ($PASSED/$TOTAL)*100}")

echo "📊 总测试数: $TOTAL"
echo "✅ 通过: $PASSED ($PASS_RATE%)"
echo "❌ 失败: $FAILED"
echo ""

if [ $FAILED -eq 0 ]; then
    echo "🎉 所有测试通过！PostgreSQL存储和V2 API工作正常。"
    exit 0
else
    echo "⚠️  部分测试失败，请检查错误信息。"
    exit 1
fi
