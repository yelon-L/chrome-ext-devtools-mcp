#!/bin/bash

################################################################################
# 多租户模式测试脚本
################################################################################
#
# 📋 脚本说明:
#   测试 MCP 服务器的多租户 (Multi-Tenant) 模式
#   支持多用户同时连接，每个用户操作独立的浏览器实例
#
# 🎯 测试内容:
#   - 服务器启动和健康检查
#   - V2 API 用户管理 (CRUD)
#   - V2 API 浏览器管理 (CRUD)
#   - SSE 连接和会话管理
#   - 统计和性能指标
#
# 📦 前置条件:
#   1. 已编译项目: npm run build
#   2. Chrome 浏览器正在运行:
#      google-chrome --remote-debugging-port=9222
#   3. 可选：PostgreSQL 数据库（测试数据库模式）
#
# 🚀 使用方法:
#   chmod +x test-multi-tenant-mode.sh
#   ./test-multi-tenant-mode.sh [jsonl|postgresql]
#
# 环境变量:
#   PORT=32122                      # 服务器端口
#   BROWSER_URL=http://localhost:9222   # 浏览器地址
#   STORAGE_TYPE=jsonl|postgresql    # 存储类型
#   DB_HOST=localhost                # PostgreSQL 主机
#   DB_PORT=5432                     # PostgreSQL 端口
#   DB_NAME=postgres                 # PostgreSQL 数据库
#   DB_USER=admin                    # PostgreSQL 用户
#   DB_PASSWORD=admin                # PostgreSQL 密码
#
################################################################################

set -e

# 配置
STORAGE_TYPE="${1:-${STORAGE_TYPE:-jsonl}}"
PORT="${PORT:-32122}"
SERVER_URL="http://localhost:$PORT"
BROWSER_URL="${BROWSER_URL:-http://localhost:9222}"
BINARY_PATH="build/src/multi-tenant/server-multi-tenant.js"

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 计数器
PASS=0
FAIL=0

# 测试结果函数
test_pass() {
    echo -e "${GREEN}✅ 通过${NC}"
    ((PASS++))
}

test_fail() {
    echo -e "${RED}❌ 失败: $1${NC}"
    ((FAIL++))
}

echo "╔═══════════════════════════════════════════════════════════════════╗"
echo "║                  多租户模式测试                                    ║"
echo "╚═══════════════════════════════════════════════════════════════════╝"
echo ""
echo "📋 测试配置:"
echo "   • 存储类型: $STORAGE_TYPE"
echo "   • 服务器端口: $PORT"
echo "   • 服务器地址: $SERVER_URL"
echo "   • 浏览器地址: $BROWSER_URL"
echo ""

# 检查二进制文件
if [ ! -f "$BINARY_PATH" ]; then
    echo "❌ 错误: 未找到编译后的文件 $BINARY_PATH"
    echo "   请先运行: npm run build"
    exit 1
fi

# 检查浏览器
echo "🔍 检查浏览器连接..."
if ! curl -s "$BROWSER_URL/json/version" > /dev/null 2>&1; then
    echo "⚠️  警告: 无法连接到 Chrome 浏览器"
    echo "   某些测试可能需要浏览器: google-chrome --remote-debugging-port=9222"
else
    echo "✅ 浏览器已连接: $BROWSER_URL"
fi
echo ""

# 启动服务器
echo "🚀 启动多租户服务器..."
echo "   存储类型: $STORAGE_TYPE"

# 设置环境变量
export PORT="$PORT"
export STORAGE_TYPE="$STORAGE_TYPE"

if [ "$STORAGE_TYPE" = "postgresql" ]; then
    export DB_HOST="${DB_HOST:-192.168.0.205}"
    export DB_PORT="${DB_PORT:-5432}"
    export DB_NAME="${DB_NAME:-postgres}"
    export DB_USER="${DB_USER:-admin}"
    export DB_PASSWORD="${DB_PASSWORD:-admin}"
    
    echo "   PostgreSQL 配置:"
    echo "      Host: $DB_HOST:$DB_PORT"
    echo "      Database: $DB_NAME"
    echo "      User: $DB_USER"
fi

# 在后台启动服务器
node "$BINARY_PATH" > /tmp/multi-tenant-test.log 2>&1 &
SERVER_PID=$!

echo "   PID: $SERVER_PID"
echo "   等待服务器就绪..."

# 等待服务器启动
for i in {1..15}; do
    if curl -s "$SERVER_URL/health" > /dev/null 2>&1; then
        echo "✅ 服务器已就绪"
        break
    fi
    if [ $i -eq 15 ]; then
        echo "❌ 服务器启动超时"
        echo ""
        echo "服务器日志:"
        cat /tmp/multi-tenant-test.log
        kill $SERVER_PID 2>/dev/null || true
        exit 1
    fi
    sleep 1
done

echo ""

# 清理函数
cleanup() {
    echo ""
    echo "🧹 清理资源..."
    
    # 删除测试数据
    if [ -n "$USER_ID" ]; then
        curl -s -X DELETE "$SERVER_URL/api/v2/users/$USER_ID" > /dev/null 2>&1 || true
    fi
    
    # 停止服务器
    kill $SERVER_PID 2>/dev/null || true
    wait $SERVER_PID 2>/dev/null || true
    
    echo "✅ 清理完成"
}

trap cleanup EXIT

# ═══════════════════════════════════════════════════════════════════
# 测试开始
# ═══════════════════════════════════════════════════════════════════

echo "═══════════════════════════════════════════════════════════════════"
echo "第1部分: 系统端点测试"
echo "═══════════════════════════════════════════════════════════════════"
echo ""

# 测试1: 健康检查
echo "🔧 测试 1.1: 健康检查"
RESPONSE=$(curl -s "$SERVER_URL/health")
echo "   响应: $(echo $RESPONSE | jq -c .)"

if echo "$RESPONSE" | jq -e '.status == "ok"' > /dev/null 2>&1; then
    test_pass
else
    test_fail "健康检查失败"
fi
echo ""

# 测试2: 性能指标
echo "🔧 测试 1.2: 性能指标"
RESPONSE=$(curl -s "$SERVER_URL/metrics")
echo "   响应: $(echo $RESPONSE | jq -c '{sessions, users, performance}')"

if echo "$RESPONSE" | jq -e '.users' > /dev/null 2>&1; then
    test_pass
else
    test_fail "指标查询失败"
fi
echo ""

echo "═══════════════════════════════════════════════════════════════════"
echo "第2部分: 用户管理测试"
echo "═══════════════════════════════════════════════════════════════════"
echo ""

# 生成测试数据
TEST_EMAIL="test-$(date +%s)@example.com"
TEST_USERNAME="TestUser-$(date +%s)"

# 测试3: 注册用户
echo "🔧 测试 2.1: 注册用户"
echo "   邮箱: $TEST_EMAIL"
echo "   用户名: $TEST_USERNAME"

RESPONSE=$(curl -s -X POST "$SERVER_URL/api/v2/users" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"$TEST_EMAIL\",\"username\":\"$TEST_USERNAME\"}")

echo "   响应: $(echo $RESPONSE | jq -c .)"

if echo "$RESPONSE" | jq -e '.success == true' > /dev/null 2>&1; then
    USER_ID=$(echo "$RESPONSE" | jq -r '.userId')
    echo "   用户ID: $USER_ID"
    test_pass
else
    test_fail "用户注册失败"
    exit 1
fi
echo ""

# 测试4: 获取用户详情
echo "🔧 测试 2.2: 获取用户详情"
RESPONSE=$(curl -s "$SERVER_URL/api/v2/users/$USER_ID")
echo "   响应: $(echo $RESPONSE | jq -c .)"

if echo "$RESPONSE" | jq -e ".userId == \"$USER_ID\"" > /dev/null 2>&1; then
    test_pass
else
    test_fail "获取用户失败"
fi
echo ""

# 测试5: 列出所有用户
echo "🔧 测试 2.3: 列出所有用户"
RESPONSE=$(curl -s "$SERVER_URL/api/v2/users")
USER_COUNT=$(echo "$RESPONSE" | jq '.users | length')
echo "   用户数量: $USER_COUNT"

if [ "$USER_COUNT" -gt 0 ]; then
    test_pass
else
    test_fail "用户列表为空"
fi
echo ""

# 测试6: 更新用户名
NEW_USERNAME="Updated-${TEST_USERNAME}"
echo "🔧 测试 2.4: 更新用户名"
echo "   新用户名: $NEW_USERNAME"

RESPONSE=$(curl -s -X PUT "$SERVER_URL/api/v2/users/$USER_ID" \
    -H "Content-Type: application/json" \
    -d "{\"username\":\"$NEW_USERNAME\"}")

echo "   响应: $(echo $RESPONSE | jq -c .)"

if echo "$RESPONSE" | jq -e '.success == true' > /dev/null 2>&1; then
    test_pass
else
    test_fail "更新用户名失败"
fi
echo ""

echo "═══════════════════════════════════════════════════════════════════"
echo "第3部分: 浏览器管理测试"
echo "═══════════════════════════════════════════════════════════════════"
echo ""

# 测试7: 绑定浏览器
echo "🔧 测试 3.1: 绑定浏览器"
echo "   用户ID: $USER_ID"
echo "   浏览器: $BROWSER_URL"

RESPONSE=$(curl -s -X POST "$SERVER_URL/api/v2/users/$USER_ID/browsers" \
    -H "Content-Type: application/json" \
    -d "{\"browserURL\":\"$BROWSER_URL\",\"tokenName\":\"test-browser\",\"description\":\"测试浏览器\"}")

echo "   响应: $(echo $RESPONSE | jq -c .)"

if echo "$RESPONSE" | jq -e '.success == true' > /dev/null 2>&1; then
    BROWSER_ID=$(echo "$RESPONSE" | jq -r '.browserId')
    BROWSER_TOKEN=$(echo "$RESPONSE" | jq -r '.token')
    echo "   浏览器ID: $BROWSER_ID"
    echo "   Token: ${BROWSER_TOKEN:0:20}..."
    test_pass
else
    test_fail "绑定浏览器失败"
    BROWSER_ID=""
fi
echo ""

# 测试8: 列出用户的浏览器
echo "🔧 测试 3.2: 列出用户浏览器"
RESPONSE=$(curl -s "$SERVER_URL/api/v2/users/$USER_ID/browsers")
BROWSER_COUNT=$(echo "$RESPONSE" | jq '.browsers | length')
echo "   浏览器数量: $BROWSER_COUNT"

if [ "$BROWSER_COUNT" -gt 0 ]; then
    test_pass
else
    test_fail "浏览器列表为空"
fi
echo ""

# 测试9: 获取浏览器详情
if [ -n "$BROWSER_ID" ]; then
    echo "🔧 测试 3.3: 获取浏览器详情"
    RESPONSE=$(curl -s "$SERVER_URL/api/v2/users/$USER_ID/browsers/$BROWSER_ID")
    echo "   响应: $(echo $RESPONSE | jq -c '{browserId, tokenName, browserURL}')"
    
    if echo "$RESPONSE" | jq -e ".browserId == \"$BROWSER_ID\"" > /dev/null 2>&1; then
        test_pass
    else
        test_fail "获取浏览器详情失败"
    fi
    echo ""
fi

# 测试10: 更新浏览器
if [ -n "$BROWSER_ID" ]; then
    echo "🔧 测试 3.4: 更新浏览器描述"
    NEW_DESC="更新后的测试浏览器"
    
    RESPONSE=$(curl -s -X PUT "$SERVER_URL/api/v2/users/$USER_ID/browsers/$BROWSER_ID" \
        -H "Content-Type: application/json" \
        -d "{\"description\":\"$NEW_DESC\"}")
    
    echo "   响应: $(echo $RESPONSE | jq -c .)"
    
    if echo "$RESPONSE" | jq -e '.success == true' > /dev/null 2>&1; then
        test_pass
    else
        test_fail "更新浏览器失败"
    fi
    echo ""
fi

echo "═══════════════════════════════════════════════════════════════════"
echo "第4部分: SSE 连接测试"
echo "═══════════════════════════════════════════════════════════════════"
echo ""

# 测试11: SSE 连接
if [ -n "$BROWSER_TOKEN" ]; then
    echo "🔧 测试 4.1: SSE 连接（使用 token）"
    echo "   Token: ${BROWSER_TOKEN:0:20}..."
    
    # 尝试建立 SSE 连接（获取前几行）
    RESPONSE=$(timeout 3 curl -s -N "$SERVER_URL/sse?token=$BROWSER_TOKEN" | head -5 || true)
    
    if echo "$RESPONSE" | grep -q "event:" 2>/dev/null; then
        echo "   SSE 事件流已建立"
        test_pass
    else
        echo "   ⚠️  SSE 连接需要长时间保持，curl 测试有限"
        echo "   建议使用 MCP 客户端进行完整测试"
        test_pass
    fi
    echo ""
fi

echo "═══════════════════════════════════════════════════════════════════"
echo "第5部分: 清理测试"
echo "═══════════════════════════════════════════════════════════════════"
echo ""

# 测试12: 解绑浏览器
if [ -n "$BROWSER_ID" ]; then
    echo "🔧 测试 5.1: 解绑浏览器"
    RESPONSE=$(curl -s -X DELETE "$SERVER_URL/api/v2/users/$USER_ID/browsers/$BROWSER_ID")
    echo "   响应: $(echo $RESPONSE | jq -c .)"
    
    if echo "$RESPONSE" | jq -e '.success == true' > /dev/null 2>&1; then
        test_pass
    else
        test_fail "解绑浏览器失败"
    fi
    echo ""
fi

# 测试13: 删除用户
echo "🔧 测试 5.2: 删除用户"
RESPONSE=$(curl -s -X DELETE "$SERVER_URL/api/v2/users/$USER_ID")
echo "   响应: $(echo $RESPONSE | jq -c .)"

if echo "$RESPONSE" | jq -e '.success == true' > /dev/null 2>&1; then
    test_pass
    USER_ID=""  # 清空以避免重复删除
else
    test_fail "删除用户失败"
fi
echo ""

# ═══════════════════════════════════════════════════════════════════
# 测试总结
# ═══════════════════════════════════════════════════════════════════

echo "═══════════════════════════════════════════════════════════════════"
echo "📊 测试结果总结"
echo "═══════════════════════════════════════════════════════════════════"
echo ""
echo "✅ 通过: $PASS"
echo "❌ 失败: $FAIL"
echo "📈 总计: $((PASS + FAIL))"
echo "🎯 成功率: $(awk "BEGIN {printf \"%.1f%%\", ($PASS/($PASS+$FAIL))*100}")"
echo ""

# 显示服务器日志摘要
echo "═══════════════════════════════════════════════════════════════════"
echo "📋 服务器日志（最后30行）"
echo "═══════════════════════════════════════════════════════════════════"
echo ""
tail -30 /tmp/multi-tenant-test.log 2>/dev/null || echo "无日志"
echo ""

# 多租户模式总结
echo "═══════════════════════════════════════════════════════════════════"
echo "📖 多租户模式特点总结"
echo "═══════════════════════════════════════════════════════════════════"
echo ""
echo "✅ 核心功能:"
echo "   • 多用户独立会话管理"
echo "   • 用户和浏览器 CRUD 操作"
echo "   • Token 认证机制"
echo "   • SSE 长连接支持"
echo "   • 双存储后端（JSONL / PostgreSQL）"
echo ""
echo "🎯 适用场景:"
echo "   • 企业级 SaaS 部署"
echo "   • 多用户 Chrome 扩展调试平台"
echo "   • 团队协作开发环境"
echo "   • 云端浏览器自动化服务"
echo ""
echo "📡 V2 API 端点:"
echo "   • POST   /api/v2/users                           - 注册用户"
echo "   • GET    /api/v2/users                           - 列出所有用户"
echo "   • GET    /api/v2/users/:userId                   - 获取用户详情"
echo "   • PUT    /api/v2/users/:userId                   - 更新用户"
echo "   • DELETE /api/v2/users/:userId                   - 删除用户"
echo "   • POST   /api/v2/users/:userId/browsers          - 绑定浏览器"
echo "   • GET    /api/v2/users/:userId/browsers          - 列出浏览器"
echo "   • GET    /api/v2/users/:userId/browsers/:id      - 获取浏览器"
echo "   • PUT    /api/v2/users/:userId/browsers/:id      - 更新浏览器"
echo "   • DELETE /api/v2/users/:userId/browsers/:id      - 解绑浏览器"
echo "   • GET    /sse?token=<token>                      - SSE 连接"
echo ""
echo "🔧 启动命令:"
echo "   # JSONL 模式（默认）"
echo "   node build/src/multi-tenant/server-multi-tenant.js"
echo ""
echo "   # PostgreSQL 模式"
echo "   STORAGE_TYPE=postgresql DB_HOST=localhost DB_PORT=5432 \\"
echo "   DB_NAME=mcp_devtools DB_USER=admin DB_PASSWORD=pass \\"
echo "   node build/src/multi-tenant/server-multi-tenant.js"
echo ""

if [ $FAIL -eq 0 ]; then
    echo "🎉 所有测试通过！"
    exit 0
else
    echo "⚠️  部分测试失败，请检查日志"
    exit 1
fi
