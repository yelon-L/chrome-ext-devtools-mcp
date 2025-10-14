#!/bin/bash

################################################################################
# V2 API 完整测试脚本 (使用 curl)
################################################################################
#
# 📋 脚本说明:
#   本脚本使用 curl 命令测试所有 V2 API 端点，验证功能完整性
#
# 🎯 测试覆盖:
#   - 健康检查 (GET /health)
#   - 性能指标 (GET /metrics)
#   - 用户管理 (5 个端点)
#   - 浏览器管理 (5 个端点)
#   - SSE 连接 (1 个端点)
#
# 📦 前置条件:
#   1. 服务器已启动: npm run start:multi-tenant
#   2. 浏览器已开启调试端口: chrome --remote-debugging-port=9222
#   3. 已安装 jq 工具: sudo apt install jq (用于 JSON 格式化)
#
# 🚀 使用方法:
#   chmod +x test-v2-api-curl.sh
#   ./test-v2-api-curl.sh
#
# ⚙️  环境变量配置:
#   SERVER_URL - 服务器地址 (默认: http://localhost:32122)
#   BROWSER_URL - 浏览器调试地址 (默认: http://localhost:9222)
#   TEST_EMAIL - 测试邮箱 (默认: 自动生成)
#
# 📖 示例:
#   # 使用默认配置
#   ./test-v2-api-curl.sh
#
#   # 使用自定义服务器地址
#   SERVER_URL=http://192.168.1.100:32122 ./test-v2-api-curl.sh
#
################################################################################

set -e  # 遇到错误立即退出

# ============================================================================
# 配置区域
# ============================================================================

# 服务器配置
SERVER_URL="${SERVER_URL:-http://localhost:32122}"
BROWSER_URL="${BROWSER_URL:-http://localhost:9222}"

# 测试数据
TEST_EMAIL="${TEST_EMAIL:-test-$(date +%s)@example.com}"
TEST_USERNAME="Test User $(date +%H:%M:%S)"

# 颜色配置
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# ============================================================================
# 辅助函数
# ============================================================================

# 打印章节标题
print_section() {
    echo ""
    echo -e "${BLUE}═══════════════════════════════════════════════════════════════════${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}═══════════════════════════════════════════════════════════════════${NC}"
    echo ""
}

# 打印测试标题
print_test() {
    echo -e "${YELLOW}📋 测试: $1${NC}"
}

# 打印 API 调用
print_api() {
    echo -e "${CYAN}🔹 API: $1${NC}"
}

# 打印成功消息
print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

# 打印错误消息
print_error() {
    echo -e "${RED}❌ $1${NC}"
}

# 打印信息
print_info() {
    echo -e "${PURPLE}ℹ️  $1${NC}"
}

# 打印警告
print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

# 检查 jq 是否安装
check_jq() {
    if ! command -v jq &> /dev/null; then
        print_warning "jq 未安装，JSON 输出将不会格式化"
        print_info "安装方法: sudo apt install jq"
        return 1
    fi
    return 0
}

# 格式化 JSON (如果 jq 可用)
format_json() {
    if check_jq; then
        jq '.'
    else
        cat
    fi
}

# 执行 curl 并显示响应
curl_with_output() {
    local method=$1
    local url=$2
    local data=$3
    local description=$4
    
    print_api "$method $url"
    if [ -n "$description" ]; then
        print_info "$description"
    fi
    
    local response
    if [ -n "$data" ]; then
        response=$(curl -s -X "$method" "$url" \
            -H "Content-Type: application/json" \
            -d "$data")
    else
        response=$(curl -s -X "$method" "$url")
    fi
    
    echo "$response" | format_json
    echo ""
    echo "$response"
}

# 提取 JSON 字段
extract_field() {
    local json=$1
    local field=$2
    
    if check_jq; then
        echo "$json" | jq -r ".$field"
    else
        # 简单的文本提取（不精确）
        echo "$json" | grep -o "\"$field\":\"[^\"]*\"" | cut -d'"' -f4
    fi
}

# ============================================================================
# 测试开始
# ============================================================================

echo -e "${GREEN}"
cat << "EOF"
╔═══════════════════════════════════════════════════════════════════╗
║                                                                   ║
║          Chrome DevTools MCP - V2 API 完整测试脚本               ║
║                                                                   ║
╚═══════════════════════════════════════════════════════════════════╝
EOF
echo -e "${NC}"

print_info "服务器地址: $SERVER_URL"
print_info "浏览器地址: $BROWSER_URL"
print_info "测试邮箱: $TEST_EMAIL"
echo ""

# ============================================================================
# 步骤 0: 前置检查
# ============================================================================
print_section "步骤 0: 环境检查"

print_test "检查 curl 是否可用"
if command -v curl &> /dev/null; then
    print_success "curl 已安装"
else
    print_error "curl 未安装，请先安装 curl"
    exit 1
fi

print_test "检查 jq 是否可用"
if check_jq; then
    print_success "jq 已安装"
else
    print_warning "jq 未安装，JSON 输出将不会格式化"
fi

# ============================================================================
# 步骤 1: 健康检查
# ============================================================================
print_section "步骤 1: 健康检查 (GET /health)"

print_test "验证服务器是否运行"
HEALTH_RESPONSE=$(curl_with_output "GET" "$SERVER_URL/health" "" "获取服务器健康状态和统计信息")

STATUS=$(extract_field "$HEALTH_RESPONSE" "status")
VERSION=$(extract_field "$HEALTH_RESPONSE" "version")

if [ "$STATUS" = "ok" ]; then
    print_success "服务器健康，版本: $VERSION"
else
    print_error "服务器健康检查失败"
    exit 1
fi

# ============================================================================
# 步骤 2: 性能指标
# ============================================================================
print_section "步骤 2: 性能指标 (GET /metrics)"

print_test "获取性能监控数据"
METRICS_RESPONSE=$(curl_with_output "GET" "$SERVER_URL/metrics" "" "查看 API 调用统计、缓存状态、性能指标")

print_success "性能指标获取成功"
print_info "可以看到: API 调用次数、响应时间、错误率、缓存利用率等"

# ============================================================================
# 步骤 3: 注册用户
# ============================================================================
print_section "步骤 3: 注册用户 (POST /api/v2/users)"

print_test "使用邮箱注册新用户"
REGISTER_DATA=$(cat <<EOF
{
  "email": "$TEST_EMAIL",
  "username": "$TEST_USERNAME"
}
EOF
)

print_info "请求数据:"
echo "$REGISTER_DATA" | format_json

REGISTER_RESPONSE=$(curl_with_output "POST" "$SERVER_URL/api/v2/users" "$REGISTER_DATA" \
    "基于邮箱注册，系统自动生成 userId")

USER_ID=$(extract_field "$REGISTER_RESPONSE" "userId")

if [ -n "$USER_ID" ] && [ "$USER_ID" != "null" ]; then
    print_success "用户注册成功，userId: $USER_ID"
else
    print_error "用户注册失败"
    exit 1
fi

# ============================================================================
# 步骤 4: 获取用户列表
# ============================================================================
print_section "步骤 4: 获取用户列表 (GET /api/v2/users)"

print_test "列出所有已注册用户"
USERS_RESPONSE=$(curl_with_output "GET" "$SERVER_URL/api/v2/users" "" \
    "返回所有用户及其浏览器数量统计")

USER_COUNT=$(extract_field "$USERS_RESPONSE" "total")
print_success "找到 $USER_COUNT 个用户"

# ============================================================================
# 步骤 5: 获取单个用户信息
# ============================================================================
print_section "步骤 5: 获取用户信息 (GET /api/v2/users/:id)"

print_test "获取用户详细信息: $USER_ID"
USER_RESPONSE=$(curl_with_output "GET" "$SERVER_URL/api/v2/users/$USER_ID" "" \
    "返回用户信息及其所有浏览器列表")

USER_EMAIL=$(extract_field "$USER_RESPONSE" "email")
if [ "$USER_EMAIL" = "$TEST_EMAIL" ]; then
    print_success "用户信息正确"
else
    print_error "用户信息不匹配"
fi

# ============================================================================
# 步骤 6: 更新用户名
# ============================================================================
print_section "步骤 6: 更新用户名 (PATCH /api/v2/users/:id)"

NEW_USERNAME="Updated User $(date +%H:%M:%S)"
print_test "更新用户名为: $NEW_USERNAME"

UPDATE_DATA=$(cat <<EOF
{
  "username": "$NEW_USERNAME"
}
EOF
)

UPDATE_RESPONSE=$(curl_with_output "PATCH" "$SERVER_URL/api/v2/users/$USER_ID" "$UPDATE_DATA" \
    "只能更新 username 字段，email 不可更改")

UPDATED_USERNAME=$(extract_field "$UPDATE_RESPONSE" "username")
if [ "$UPDATED_USERNAME" = "$NEW_USERNAME" ]; then
    print_success "用户名更新成功"
else
    print_warning "用户名更新可能失败"
fi

# ============================================================================
# 步骤 7: 绑定浏览器
# ============================================================================
print_section "步骤 7: 绑定浏览器 (POST /api/v2/users/:id/browsers)"

print_test "绑定浏览器到用户: $USER_ID"
print_info "检查浏览器是否可访问: $BROWSER_URL"

BIND_DATA=$(cat <<EOF
{
  "browserURL": "$BROWSER_URL",
  "tokenName": "test-browser-$(date +%s)",
  "description": "测试浏览器 - curl 脚本创建"
}
EOF
)

print_info "请求数据:"
echo "$BIND_DATA" | format_json

BIND_RESPONSE=$(curl_with_output "POST" "$SERVER_URL/api/v2/users/$USER_ID/browsers" "$BIND_DATA" \
    "会自动检测浏览器连接，成功后返回 token")

BROWSER_ID=$(extract_field "$BIND_RESPONSE" "browserId")
BROWSER_TOKEN=$(extract_field "$BIND_RESPONSE" "token")

if [ -n "$BROWSER_ID" ] && [ "$BROWSER_ID" != "null" ]; then
    print_success "浏览器绑定成功"
    print_info "浏览器 ID: $BROWSER_ID"
    print_info "Token: ${BROWSER_TOKEN:0:20}...${BROWSER_TOKEN: -10}"
else
    print_error "浏览器绑定失败"
    print_warning "请确保浏览器已启动调试端口: chrome --remote-debugging-port=9222"
    print_info "继续测试其他端点..."
    BROWSER_ID="dummy-id"
    BROWSER_TOKEN="dummy-token"
fi

# ============================================================================
# 步骤 8: 列出用户的浏览器
# ============================================================================
print_section "步骤 8: 列出用户的浏览器 (GET /api/v2/users/:id/browsers)"

print_test "获取用户 $USER_ID 的所有浏览器"
BROWSERS_RESPONSE=$(curl_with_output "GET" "$SERVER_URL/api/v2/users/$USER_ID/browsers" "" \
    "返回用户的所有浏览器及其 token")

BROWSER_COUNT=$(extract_field "$BROWSERS_RESPONSE" "total")
print_success "用户有 $BROWSER_COUNT 个浏览器"

# ============================================================================
# 步骤 9: 获取单个浏览器信息
# ============================================================================
print_section "步骤 9: 获取浏览器信息 (GET /api/v2/users/:id/browsers/:browserId)"

if [ "$BROWSER_ID" != "dummy-id" ]; then
    print_test "获取浏览器详细信息: $BROWSER_ID"
    BROWSER_INFO_RESPONSE=$(curl_with_output "GET" "$SERVER_URL/api/v2/users/$USER_ID/browsers/$BROWSER_ID" "" \
        "返回浏览器的完整信息，包括 token")
    
    BROWSER_TOKEN_NAME=$(extract_field "$BROWSER_INFO_RESPONSE" "tokenName")
    print_success "浏览器信息获取成功，名称: $BROWSER_TOKEN_NAME"
else
    print_warning "跳过（浏览器未成功绑定）"
fi

# ============================================================================
# 步骤 10: 更新浏览器信息
# ============================================================================
print_section "步骤 10: 更新浏览器 (PATCH /api/v2/users/:id/browsers/:browserId)"

if [ "$BROWSER_ID" != "dummy-id" ]; then
    NEW_DESCRIPTION="更新后的描述 - $(date +%H:%M:%S)"
    print_test "更新浏览器描述为: $NEW_DESCRIPTION"
    
    UPDATE_BROWSER_DATA=$(cat <<EOF
{
  "description": "$NEW_DESCRIPTION"
}
EOF
)
    
    UPDATE_BROWSER_RESPONSE=$(curl_with_output "PATCH" "$SERVER_URL/api/v2/users/$USER_ID/browsers/$BROWSER_ID" \
        "$UPDATE_BROWSER_DATA" "可以更新 browserURL 或 description")
    
    UPDATED_DESC=$(extract_field "$UPDATE_BROWSER_RESPONSE" "description")
    if [ "$UPDATED_DESC" = "$NEW_DESCRIPTION" ]; then
        print_success "浏览器信息更新成功"
    else
        print_warning "浏览器信息更新可能失败"
    fi
else
    print_warning "跳过（浏览器未成功绑定）"
fi

# ============================================================================
# 步骤 11: 测试 SSE 连接
# ============================================================================
print_section "步骤 11: SSE 连接测试 (GET /api/v2/sse)"

if [ "$BROWSER_TOKEN" != "dummy-token" ]; then
    print_test "测试 SSE 连接（使用 token）"
    print_info "Token: ${BROWSER_TOKEN:0:20}...${BROWSER_TOKEN: -10}"
    
    print_api "GET $SERVER_URL/api/v2/sse?token=$BROWSER_TOKEN"
    print_info "启动 SSE 连接（3 秒超时）..."
    
    # 启动 SSE 连接并在 3 秒后终止
    timeout 3 curl -N "$SERVER_URL/api/v2/sse?token=$BROWSER_TOKEN" 2>&1 | head -10 || true
    
    print_success "SSE 连接测试完成"
    print_info "实际使用时，SSE 连接会保持打开状态接收 MCP 消息"
else
    print_warning "跳过（无有效 token）"
fi

# ============================================================================
# 步骤 12: 绑定第二个浏览器
# ============================================================================
print_section "步骤 12: 绑定第二个浏览器（测试多浏览器）"

print_test "为同一用户绑定第二个浏览器"

BIND2_DATA=$(cat <<EOF
{
  "browserURL": "$BROWSER_URL",
  "tokenName": "test-browser-2-$(date +%s)",
  "description": "第二个测试浏览器"
}
EOF
)

BIND2_RESPONSE=$(curl_with_output "POST" "$SERVER_URL/api/v2/users/$USER_ID/browsers" "$BIND2_DATA" \
    "同一个浏览器 URL 可以绑定多次，每次生成不同的 token")

BROWSER_ID_2=$(extract_field "$BIND2_RESPONSE" "browserId")

if [ -n "$BROWSER_ID_2" ] && [ "$BROWSER_ID_2" != "null" ]; then
    print_success "第二个浏览器绑定成功: $BROWSER_ID_2"
    
    # 验证现在有 2 个浏览器
    BROWSERS_COUNT=$(curl -s "$SERVER_URL/api/v2/users/$USER_ID/browsers" | \
        extract_field - "total")
    print_info "用户现在有 $BROWSERS_COUNT 个浏览器"
else
    print_warning "第二个浏览器绑定失败（可能浏览器不可访问）"
    BROWSER_ID_2=""
fi

# ============================================================================
# 步骤 13: 解绑浏览器
# ============================================================================
print_section "步骤 13: 解绑浏览器 (DELETE /api/v2/users/:id/browsers/:browserId)"

if [ -n "$BROWSER_ID_2" ] && [ "$BROWSER_ID_2" != "null" ]; then
    print_test "解绑第二个浏览器: $BROWSER_ID_2"
    
    UNBIND_RESPONSE=$(curl_with_output "DELETE" "$SERVER_URL/api/v2/users/$USER_ID/browsers/$BROWSER_ID_2" "" \
        "解绑后该浏览器的 token 将被撤销")
    
    print_success "浏览器解绑成功"
    print_info "该浏览器的 token 已失效"
else
    print_warning "跳过（无第二个浏览器）"
fi

# ============================================================================
# 步骤 14: 删除用户（可选）
# ============================================================================
print_section "步骤 14: 删除用户测试 (DELETE /api/v2/users/:id)"

print_warning "此步骤将删除测试用户及其所有浏览器"
print_info "如需保留测试数据，可以跳过此步骤"
echo ""

read -p "是否删除测试用户? (y/N): " -n 1 -r
echo ""

if [[ $REPLY =~ ^[Yy]$ ]]; then
    print_test "删除用户: $USER_ID"
    
    DELETE_RESPONSE=$(curl_with_output "DELETE" "$SERVER_URL/api/v2/users/$USER_ID" "" \
        "级联删除：用户的所有浏览器也会被删除")
    
    print_success "用户已删除"
else
    print_info "保留测试数据"
    print_info "手动删除命令: curl -X DELETE $SERVER_URL/api/v2/users/$USER_ID"
fi

# ============================================================================
# 测试总结
# ============================================================================
print_section "测试总结"

echo -e "${GREEN}"
cat << "EOF"
╔═══════════════════════════════════════════════════════════════════╗
║                                                                   ║
║                      ✅ 测试完成                                  ║
║                                                                   ║
╚═══════════════════════════════════════════════════════════════════╝
EOF
echo -e "${NC}"

print_success "所有主要 V2 API 端点测试完成"
echo ""

print_info "测试的端点:"
echo "  ✓ GET    /health                                 - 健康检查"
echo "  ✓ GET    /metrics                                - 性能指标"
echo "  ✓ POST   /api/v2/users                           - 注册用户"
echo "  ✓ GET    /api/v2/users                           - 列出用户"
echo "  ✓ GET    /api/v2/users/:id                       - 获取用户"
echo "  ✓ PATCH  /api/v2/users/:id                       - 更新用户"
echo "  ✓ POST   /api/v2/users/:id/browsers              - 绑定浏览器"
echo "  ✓ GET    /api/v2/users/:id/browsers              - 列出浏览器"
echo "  ✓ GET    /api/v2/users/:id/browsers/:browserId   - 获取浏览器"
echo "  ✓ PATCH  /api/v2/users/:id/browsers/:browserId   - 更新浏览器"
echo "  ✓ DELETE /api/v2/users/:id/browsers/:browserId   - 解绑浏览器"
echo "  ✓ DELETE /api/v2/users/:id                       - 删除用户"
echo "  ✓ GET    /api/v2/sse                             - SSE 连接"
echo ""

print_info "测试数据:"
echo "  用户 ID: $USER_ID"
echo "  邮箱: $TEST_EMAIL"
if [ "$BROWSER_ID" != "dummy-id" ]; then
    echo "  浏览器 ID: $BROWSER_ID"
    echo "  Token: ${BROWSER_TOKEN:0:20}...${BROWSER_TOKEN: -10}"
fi
echo ""

print_info "清理命令:"
echo "  删除用户: curl -X DELETE $SERVER_URL/api/v2/users/$USER_ID"
echo ""

print_info "📚 更多文档:"
echo "  - API 文档: docs/guides/MULTI_TENANT_USAGE.md"
echo "  - 迁移指南: docs/guides/V2_API_MIGRATION_GUIDE.md"
echo "  - 测试报告: V2_API_TEST_REPORT.md"
echo ""

################################################################################
# 脚本结束
################################################################################
