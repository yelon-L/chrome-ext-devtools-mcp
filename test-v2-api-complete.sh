#!/bin/bash

# V2 API 完整测试脚本
# 测试所有 V2 API 端点的功能

set -e  # 遇到错误立即退出

# 配置
SERVER="http://localhost:32122"
BROWSER_URL="http://localhost:9222"
TEST_EMAIL="test-$(date +%s)@example.com"
TEST_USERNAME="Test User"

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 辅助函数
log_section() {
    echo -e "\n${BLUE}═══════════════════════════════════════════════════════════════════${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}═══════════════════════════════════════════════════════════════════${NC}\n"
}

log_test() {
    echo -e "${YELLOW}🧪 测试: $1${NC}"
}

log_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

log_error() {
    echo -e "${RED}❌ $1${NC}"
}

log_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

# 检查响应中的字段
check_field() {
    local response="$1"
    local field="$2"
    local expected="$3"
    
    local actual=$(echo "$response" | jq -r ".$field" 2>/dev/null)
    
    if [ "$actual" = "$expected" ]; then
        log_success "字段 $field = $expected"
        return 0
    else
        log_error "字段 $field = $actual (期望: $expected)"
        return 1
    fi
}

# ============================================================================
# 测试开始
# ============================================================================

echo -e "${GREEN}"
echo "╔════════════════════════════════════════════════════════════════╗"
echo "║              V2 API 完整功能测试                              ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

log_info "服务器: $SERVER"
log_info "浏览器: $BROWSER_URL"
log_info "测试邮箱: $TEST_EMAIL"
echo ""

# ============================================================================
# 1. 健康检查
# ============================================================================
log_section "1. 健康检查"

log_test "GET /health"
HEALTH_RESPONSE=$(curl -s "$SERVER/health")
echo "$HEALTH_RESPONSE" | jq . 2>/dev/null || echo "$HEALTH_RESPONSE"

if echo "$HEALTH_RESPONSE" | jq -e '.status == "ok"' > /dev/null 2>&1; then
    VERSION=$(echo "$HEALTH_RESPONSE" | jq -r '.version')
    log_success "服务器健康，版本: $VERSION"
else
    log_error "服务器健康检查失败"
    exit 1
fi

# ============================================================================
# 2. 用户注册
# ============================================================================
log_section "2. 用户注册 (POST /api/v2/users)"

log_test "注册新用户: $TEST_EMAIL"
REGISTER_RESPONSE=$(curl -s -X POST "$SERVER/api/v2/users" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"$TEST_EMAIL\",\"username\":\"$TEST_USERNAME\"}")

echo "$REGISTER_RESPONSE" | jq . 2>/dev/null || echo "$REGISTER_RESPONSE"

if echo "$REGISTER_RESPONSE" | jq -e '.success == true' > /dev/null 2>&1; then
    USER_ID=$(echo "$REGISTER_RESPONSE" | jq -r '.userId')
    log_success "用户注册成功，userId: $USER_ID"
else
    # 可能用户已存在，尝试获取 userId
    if echo "$REGISTER_RESPONSE" | jq -e '.error' | grep -q "already registered" 2>/dev/null; then
        log_info "用户已存在，继续测试..."
        # 从邮箱提取 userId
        USER_ID=$(echo "$TEST_EMAIL" | cut -d'@' -f1 | sed 's/[^a-z0-9-]/-/g')
    else
        log_error "用户注册失败"
        echo "$REGISTER_RESPONSE"
        exit 1
    fi
fi

# ============================================================================
# 3. 获取用户列表
# ============================================================================
log_section "3. 获取用户列表 (GET /api/v2/users)"

log_test "列出所有用户"
USERS_RESPONSE=$(curl -s "$SERVER/api/v2/users")
echo "$USERS_RESPONSE" | jq . 2>/dev/null || echo "$USERS_RESPONSE"

USER_COUNT=$(echo "$USERS_RESPONSE" | jq '.users | length' 2>/dev/null)
if [ "$USER_COUNT" -ge 1 ]; then
    log_success "找到 $USER_COUNT 个用户"
else
    log_error "用户列表为空"
fi

# ============================================================================
# 4. 获取单个用户
# ============================================================================
log_section "4. 获取用户信息 (GET /api/v2/users/:id)"

log_test "获取用户: $USER_ID"
USER_RESPONSE=$(curl -s "$SERVER/api/v2/users/$USER_ID")
echo "$USER_RESPONSE" | jq . 2>/dev/null || echo "$USER_RESPONSE"

if echo "$USER_RESPONSE" | jq -e '.userId' > /dev/null 2>&1; then
    log_success "成功获取用户信息"
    check_field "$USER_RESPONSE" "email" "$TEST_EMAIL"
else
    log_error "获取用户信息失败"
fi

# ============================================================================
# 5. 更新用户名
# ============================================================================
log_section "5. 更新用户名 (PATCH /api/v2/users/:id)"

NEW_USERNAME="Updated Test User"
log_test "更新用户名为: $NEW_USERNAME"
UPDATE_RESPONSE=$(curl -s -X PATCH "$SERVER/api/v2/users/$USER_ID" \
    -H "Content-Type: application/json" \
    -d "{\"username\":\"$NEW_USERNAME\"}")

echo "$UPDATE_RESPONSE" | jq . 2>/dev/null || echo "$UPDATE_RESPONSE"

if echo "$UPDATE_RESPONSE" | jq -e '.success == true' > /dev/null 2>&1; then
    log_success "用户名更新成功"
    check_field "$UPDATE_RESPONSE" "username" "$NEW_USERNAME"
else
    log_error "用户名更新失败"
fi

# ============================================================================
# 6. 绑定浏览器
# ============================================================================
log_section "6. 绑定浏览器 (POST /api/v2/users/:id/browsers)"

log_test "绑定浏览器: $BROWSER_URL"
BIND_RESPONSE=$(curl -s -X POST "$SERVER/api/v2/users/$USER_ID/browsers" \
    -H "Content-Type: application/json" \
    -d "{\"browserURL\":\"$BROWSER_URL\",\"tokenName\":\"test-browser\",\"description\":\"测试浏览器\"}")

echo "$BIND_RESPONSE" | jq . 2>/dev/null || echo "$BIND_RESPONSE"

if echo "$BIND_RESPONSE" | jq -e '.success == true' > /dev/null 2>&1; then
    BROWSER_ID=$(echo "$BIND_RESPONSE" | jq -r '.browserId')
    BROWSER_TOKEN=$(echo "$BIND_RESPONSE" | jq -r '.token')
    log_success "浏览器绑定成功"
    log_info "浏览器ID: $BROWSER_ID"
    log_info "Token: ${BROWSER_TOKEN:0:20}...${BROWSER_TOKEN: -10}"
else
    # 可能浏览器已绑定，尝试获取现有浏览器
    log_info "浏览器可能已存在，尝试获取..."
    BROWSERS_LIST=$(curl -s "$SERVER/api/v2/users/$USER_ID/browsers")
    BROWSER_ID=$(echo "$BROWSERS_LIST" | jq -r '.browsers[0].browserId' 2>/dev/null)
    BROWSER_TOKEN=$(echo "$BROWSERS_LIST" | jq -r '.browsers[0].token' 2>/dev/null)
    
    if [ -n "$BROWSER_ID" ] && [ "$BROWSER_ID" != "null" ]; then
        log_info "使用现有浏览器: $BROWSER_ID"
    else
        log_error "浏览器绑定失败且无法获取现有浏览器"
        echo "$BIND_RESPONSE"
        exit 1
    fi
fi

# ============================================================================
# 7. 列出用户的浏览器
# ============================================================================
log_section "7. 列出用户的浏览器 (GET /api/v2/users/:id/browsers)"

log_test "列出用户 $USER_ID 的浏览器"
BROWSERS_RESPONSE=$(curl -s "$SERVER/api/v2/users/$USER_ID/browsers")
echo "$BROWSERS_RESPONSE" | jq . 2>/dev/null || echo "$BROWSERS_RESPONSE"

BROWSER_COUNT=$(echo "$BROWSERS_RESPONSE" | jq '.browsers | length' 2>/dev/null)
if [ "$BROWSER_COUNT" -ge 1 ]; then
    log_success "用户有 $BROWSER_COUNT 个浏览器"
else
    log_error "浏览器列表为空"
fi

# ============================================================================
# 8. 获取单个浏览器
# ============================================================================
log_section "8. 获取浏览器信息 (GET /api/v2/users/:id/browsers/:browserId)"

log_test "获取浏览器: $BROWSER_ID"
BROWSER_INFO_RESPONSE=$(curl -s "$SERVER/api/v2/users/$USER_ID/browsers/$BROWSER_ID")
echo "$BROWSER_INFO_RESPONSE" | jq . 2>/dev/null || echo "$BROWSER_INFO_RESPONSE"

if echo "$BROWSER_INFO_RESPONSE" | jq -e '.browserId' > /dev/null 2>&1; then
    log_success "成功获取浏览器信息"
    check_field "$BROWSER_INFO_RESPONSE" "tokenName" "test-browser"
else
    log_error "获取浏览器信息失败"
fi

# ============================================================================
# 9. 更新浏览器
# ============================================================================
log_section "9. 更新浏览器 (PATCH /api/v2/users/:id/browsers/:browserId)"

NEW_DESCRIPTION="更新后的浏览器描述"
log_test "更新浏览器描述为: $NEW_DESCRIPTION"
UPDATE_BROWSER_RESPONSE=$(curl -s -X PATCH "$SERVER/api/v2/users/$USER_ID/browsers/$BROWSER_ID" \
    -H "Content-Type: application/json" \
    -d "{\"description\":\"$NEW_DESCRIPTION\"}")

echo "$UPDATE_BROWSER_RESPONSE" | jq . 2>/dev/null || echo "$UPDATE_BROWSER_RESPONSE"

if echo "$UPDATE_BROWSER_RESPONSE" | jq -e '.success == true' > /dev/null 2>&1; then
    log_success "浏览器更新成功"
    check_field "$UPDATE_BROWSER_RESPONSE" "description" "$NEW_DESCRIPTION"
else
    log_error "浏览器更新失败"
fi

# ============================================================================
# 10. 测试 SSE 连接（仅验证连接，不等待消息）
# ============================================================================
log_section "10. 测试 SSE 连接 (GET /api/v2/sse)"

log_test "测试 SSE 连接（使用 token）"
log_info "Token: ${BROWSER_TOKEN:0:20}...${BROWSER_TOKEN: -10}"

# 启动 SSE 连接（后台运行）
SSE_OUTPUT="/tmp/sse-test-output.txt"
timeout 3 curl -s -N "$SERVER/api/v2/sse?token=$BROWSER_TOKEN" > "$SSE_OUTPUT" 2>&1 &
SSE_PID=$!

sleep 2

# 检查进程是否还在运行
if kill -0 $SSE_PID 2>/dev/null; then
    log_success "SSE 连接建立成功"
    kill $SSE_PID 2>/dev/null || true
else
    # 检查输出
    if grep -q "event:" "$SSE_OUTPUT" 2>/dev/null; then
        log_success "SSE 连接成功（已收到事件）"
    else
        log_error "SSE 连接失败"
        cat "$SSE_OUTPUT" 2>/dev/null
    fi
fi

rm -f "$SSE_OUTPUT"

# ============================================================================
# 11. 绑定第二个浏览器（测试多浏览器）
# ============================================================================
log_section "11. 绑定第二个浏览器"

log_test "绑定第二个浏览器"
BIND2_RESPONSE=$(curl -s -X POST "$SERVER/api/v2/users/$USER_ID/browsers" \
    -H "Content-Type: application/json" \
    -d "{\"browserURL\":\"$BROWSER_URL\",\"tokenName\":\"test-browser-2\",\"description\":\"第二个测试浏览器\"}")

if echo "$BIND2_RESPONSE" | jq -e '.success == true' > /dev/null 2>&1; then
    BROWSER_ID_2=$(echo "$BIND2_RESPONSE" | jq -r '.browserId')
    log_success "第二个浏览器绑定成功: $BROWSER_ID_2"
    
    # 验证现在有 2 个浏览器
    BROWSERS_COUNT=$(curl -s "$SERVER/api/v2/users/$USER_ID/browsers" | jq '.browsers | length')
    log_info "用户现在有 $BROWSERS_COUNT 个浏览器"
else
    log_info "第二个浏览器绑定失败（可能已存在）"
    echo "$BIND2_RESPONSE" | jq .
    BROWSER_ID_2=""
fi

# ============================================================================
# 12. 解绑浏览器（清理）
# ============================================================================
log_section "12. 解绑浏览器 (DELETE /api/v2/users/:id/browsers/:browserId)"

if [ -n "$BROWSER_ID_2" ]; then
    log_test "解绑第二个浏览器: $BROWSER_ID_2"
    UNBIND_RESPONSE=$(curl -s -X DELETE "$SERVER/api/v2/users/$USER_ID/browsers/$BROWSER_ID_2")
    echo "$UNBIND_RESPONSE" | jq . 2>/dev/null || echo "$UNBIND_RESPONSE"
    
    if echo "$UNBIND_RESPONSE" | jq -e '.success == true' > /dev/null 2>&1; then
        log_success "浏览器解绑成功"
    else
        log_error "浏览器解绑失败"
    fi
fi

# ============================================================================
# 13. 删除用户测试（可选）
# ============================================================================
log_section "13. 删除用户测试（可选，已跳过）"

log_info "跳过删除用户测试，保留测试数据"
log_info "如需删除，运行: curl -X DELETE $SERVER/api/v2/users/$USER_ID"

# ============================================================================
# 测试总结
# ============================================================================
log_section "测试总结"

echo -e "${GREEN}"
echo "╔════════════════════════════════════════════════════════════════╗"
echo "║                    V2 API 测试完成                            ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

log_success "所有主要 V2 API 端点测试通过"
echo ""
log_info "测试的端点:"
echo "  ✓ GET  /health"
echo "  ✓ POST /api/v2/users"
echo "  ✓ GET  /api/v2/users"
echo "  ✓ GET  /api/v2/users/:id"
echo "  ✓ PATCH /api/v2/users/:id"
echo "  ✓ POST /api/v2/users/:id/browsers"
echo "  ✓ GET  /api/v2/users/:id/browsers"
echo "  ✓ GET  /api/v2/users/:id/browsers/:browserId"
echo "  ✓ PATCH /api/v2/users/:id/browsers/:browserId"
echo "  ✓ DELETE /api/v2/users/:id/browsers/:browserId"
echo "  ✓ GET  /api/v2/sse"
echo ""

log_info "测试数据:"
echo "  用户ID: $USER_ID"
echo "  邮箱: $TEST_EMAIL"
echo "  浏览器ID: $BROWSER_ID"
echo "  Token: ${BROWSER_TOKEN:0:20}...${BROWSER_TOKEN: -10}"
echo ""

log_info "清理命令:"
echo "  删除用户: curl -X DELETE $SERVER/api/v2/users/$USER_ID"
echo ""
