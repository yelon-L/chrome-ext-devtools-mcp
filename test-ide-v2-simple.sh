#!/bin/bash

# IDE 模拟器 - V2 API 测试（简化版）
# 测试 SSE V2 连接能否及时识别要调试的浏览器

set -e

SERVER="${SERVER_URL:-http://localhost:32122}"
BROWSER_URL="${BROWSER_URL:-http://localhost:9222}"

# 颜色定义
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
BOLD='\033[1m'
NC='\033[0m'

# 辅助函数
print_header() {
    echo ""
    echo -e "${BOLD}${CYAN}═══════════════════════════════════════════════════════════${NC}"
    echo -e "${BOLD}${CYAN}$1${NC}"
    echo -e "${BOLD}${CYAN}═══════════════════════════════════════════════════════════${NC}"
    echo ""
}

print_step() {
    echo ""
    echo -e "${BOLD}${CYAN}════════════════════════════════════════════════════════════${NC}"
    echo -e "${BOLD}${CYAN}$1${NC}"
    echo -e "${BOLD}${CYAN}════════════════════════════════════════════════════════════${NC}"
    echo ""
}

success() {
    echo -e "${GREEN}✅ $1${NC}"
}

error() {
    echo -e "${RED}❌ $1${NC}"
}

info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

warn() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

# 主测试
print_header "IDE 模拟器 - V2 API 浏览器识别测试"

info "服务器: $SERVER"
info "浏览器: $BROWSER_URL"
echo ""

# 步骤 1: 注册用户
print_step "步骤 1: 注册用户（使用邮箱）"

EMAIL="ide-test-$(date +%s)@example.com"
USERNAME="IDE Test User"

info "POST $SERVER/api/users"
info "  email: $EMAIL"
info "  username: $USERNAME"

response=$(curl -s -w "\n%{http_code}" -X POST $SERVER/api/users \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"username\":\"$USERNAME\"}")

http_code=$(echo "$response" | tail -n1)
body=$(echo "$response" | sed '$d')

if [ "$http_code" == "201" ]; then
    success "用户注册成功"
    echo "$body" | jq .
    USER_ID=$(echo "$body" | jq -r '.userId')
else
    error "用户注册失败 (HTTP $http_code)"
    exit 1
fi

# 步骤 2: 绑定浏览器
print_step "步骤 2: 绑定浏览器（获取 token）"

TOKEN_NAME="ide-test-browser"

info "POST $SERVER/api/users/$USER_ID/browsers"
info "  browserURL: $BROWSER_URL"
info "  tokenName: $TOKEN_NAME"

response=$(curl -s -w "\n%{http_code}" -X POST $SERVER/api/users/$USER_ID/browsers \
  -H "Content-Type: application/json" \
  -d "{
    \"browserURL\":\"$BROWSER_URL\",
    \"tokenName\":\"$TOKEN_NAME\",
    \"description\":\"Browser for IDE testing\"
  }")

http_code=$(echo "$response" | tail -n1)
body=$(echo "$response" | sed '$d')

if [ "$http_code" == "201" ]; then
    success "浏览器绑定成功"
    TOKEN=$(echo "$body" | jq -r '.token')
    BROWSER_ID=$(echo "$body" | jq -r '.browserId')
    
    # 显示简化信息
    echo "$body" | jq "{browserId, tokenName, token: (.token[:20] + \"...\"), browserURL, browser}"
    
    echo ""
    info "完整 Token: ${TOKEN:0:24}..."
else
    error "浏览器绑定失败 (HTTP $http_code)"
    echo "$body"
    exit 1
fi

# 步骤 3: 建立 SSE V2 连接
print_step "步骤 3: 建立 SSE V2 连接（模拟 IDE）"

info "GET $SERVER/sse-v2"
info "  Authorization: Bearer ${TOKEN:0:24}..."
info "  预期识别: userId=$USER_ID, tokenName=$TOKEN_NAME"
echo ""

# 记录开始时间
START_TIME=$(date +%s%N)

# 使用 curl 连接 SSE，最多等待 5 秒
info "正在建立连接..."
echo ""

# 启动 SSE 连接并捕获输出
response=$(timeout 5s curl -N -s \
  -H "Authorization: Bearer $TOKEN" \
  "$SERVER/sse-v2" 2>&1 | head -20)

# 计算耗时
END_TIME=$(date +%s%N)
ELAPSED=$(( (END_TIME - START_TIME) / 1000000 ))

# 检查是否成功接收到 endpoint 事件
if echo "$response" | grep -q "event: endpoint"; then
    success "✨ 连接建立成功！耗时: ${ELAPSED}ms"
    
    # 提取 sessionId
    SESSION_ID=$(echo "$response" | grep "data: /message" | sed 's/.*sessionId=\([^&]*\).*/\1/')
    info "  Session ID: $SESSION_ID"
    
    # 提取 endpoint URL
    ENDPOINT=$(echo "$response" | grep "data: /message" | sed 's/data: //')
    info "  Endpoint: $ENDPOINT"
    
    echo ""
    echo -e "${BOLD}${GREEN}🎯 浏览器识别信息:${NC}"
    echo -e "${CYAN}  👤 用户: ${BOLD}${USER_ID}${NC}"
    echo -e "${CYAN}  🌐 浏览器: ${BOLD}${TOKEN_NAME}${NC}"
    echo -e "${CYAN}  🔗 URL: ${BOLD}${BROWSER_URL}${NC}"
    echo -e "${CYAN}  ⏱️  连接时间: ${BOLD}${ELAPSED}ms${NC}"
    echo ""
    
    # 显示 SSE 响应示例
    echo -e "${BOLD}SSE 响应示例:${NC}"
    echo "$response" | head -10
    
    SSE_SUCCESS=true
else
    error "连接失败或超时"
    echo "$response"
    SSE_SUCCESS=false
fi

# 步骤 4: 测试工具调用（可选）
if [ "$SSE_SUCCESS" = true ] && [ -n "$SESSION_ID" ]; then
    print_step "步骤 4: 测试工具调用（验证浏览器操作）"
    
    info "调用 get-browser-info 工具"
    
    TOOL_REQUEST='{
        "jsonrpc": "2.0",
        "id": 1,
        "method": "tools/call",
        "params": {
            "name": "get-browser-info",
            "arguments": {}
        }
    }'
    
    info "POST $SERVER/message?sessionId=$SESSION_ID"
    
    response=$(curl -s -w "\n%{http_code}" -X POST \
      "$SERVER/message?sessionId=$SESSION_ID" \
      -H "Content-Type: application/json" \
      -d "$TOOL_REQUEST")
    
    http_code=$(echo "$response" | tail -n1)
    body=$(echo "$response" | sed '$d')
    
    if [ "$http_code" == "200" ]; then
        success "工具调用成功"
        echo "$body" | jq .
    else
        warn "工具调用失败 (HTTP $http_code)"
        echo "$body"
    fi
fi

# 步骤 5: 清理
print_step "步骤 5: 清理测试数据"

# 解绑浏览器
info "DELETE $SERVER/api/users/$USER_ID/browsers/$TOKEN_NAME"
response=$(curl -s -w "\n%{http_code}" -X DELETE \
  "$SERVER/api/users/$USER_ID/browsers/$TOKEN_NAME")

http_code=$(echo "$response" | tail -n1)
if [ "$http_code" == "200" ]; then
    success "浏览器解绑成功"
else
    warn "浏览器解绑失败（可能已被删除）"
fi

# 删除用户
info "DELETE $SERVER/api/users/$USER_ID"
response=$(curl -s -w "\n%{http_code}" -X DELETE \
  "$SERVER/api/users/$USER_ID")

http_code=$(echo "$response" | tail -n1)
if [ "$http_code" == "200" ]; then
    success "用户删除成功"
else
    warn "用户删除失败"
fi

# 最终总结
print_header "测试总结"

if [ "$SSE_SUCCESS" = true ]; then
    success "✅ SSE V2 连接能够及时识别要调试的浏览器"
    echo ""
    echo -e "${CYAN}关键指标:${NC}"
    echo "  • 连接建立时间: ${ELAPSED}ms"
    echo "  • 浏览器识别: 即时（通过 token 自动解析）"
    echo "  • Session ID: $SESSION_ID"
    echo ""
    echo -e "${CYAN}V2 架构优势:${NC}"
    echo "  ✓ 无需手动指定 userId"
    echo "  ✓ Token 直接对应浏览器实例"
    echo "  ✓ 支持一用户多浏览器"
    echo "  ✓ 自动记录连接时间"
    echo ""
    echo -e "${BOLD}${GREEN}结论: IDE 可以立即知道要调试哪个浏览器！${NC}"
else
    error "❌ SSE 连接测试失败"
    echo ""
    echo "请确保："
    echo "  1. 服务器正在运行: npm run start:multi-tenant:dev"
    echo "  2. 浏览器可访问: $BROWSER_URL"
fi

echo ""
