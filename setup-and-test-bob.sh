#!/bin/bash

# 完整的 Bob 用户注册和测试流程
# 详细解释每一步操作

SERVER="http://192.168.239.1:32122"
USER_ID="bob"
BROWSER_URL="http://localhost:9222"  # Bob 的本地浏览器

echo "╔════════════════════════════════════════════════════════════════╗"
echo "║           Bob 用户完整设置和测试流程                          ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""
echo "📋 配置:"
echo "   服务器: $SERVER"
echo "   用户ID: $USER_ID"
echo "   浏览器: $BROWSER_URL"
echo ""

# ============================================================================
# 步骤 1: 检查服务器状态
# ============================================================================
echo "═══════════════════════════════════════════════════════════════════"
echo "步骤 1: 检查服务器状态"
echo "═══════════════════════════════════════════════════════════════════"
echo ""
echo "📝 这一步做什么："
echo "   发送 GET /health 请求，验证服务器是否运行正常"
echo ""

echo "🔍 执行: curl $SERVER/health"
health=$(curl -s "$SERVER/health")
status=$(echo "$health" | jq -r '.status' 2>/dev/null)

if [ "$status" = "ok" ]; then
    echo "✅ 服务器正常运行"
    version=$(echo "$health" | jq -r '.version')
    echo "   版本: $version"
else
    echo "❌ 服务器无响应"
    exit 1
fi
echo ""

# ============================================================================
# 步骤 2: 注册用户
# ============================================================================
echo "═══════════════════════════════════════════════════════════════════"
echo "步骤 2: 注册 Bob 用户"
echo "═══════════════════════════════════════════════════════════════════"
echo ""
echo "📝 这一步做什么："
echo "   POST /api/register"
echo "   Body: {userId: \"$USER_ID\", browserURL: \"$BROWSER_URL\"}"
echo "   告诉服务器: Bob 用户使用 localhost:9222 的浏览器"
echo ""

echo "🔍 执行: curl -X POST $SERVER/api/register"
register_result=$(curl -s -X POST "$SERVER/api/register" \
  -H "Content-Type: application/json" \
  -d "{\"userId\":\"$USER_ID\",\"browserURL\":\"$BROWSER_URL\"}")

echo "$register_result" | jq . 2>/dev/null

if echo "$register_result" | grep -q "registered.*true"; then
    echo "✅ 用户注册成功"
elif echo "$register_result" | grep -q "already registered"; then
    echo "ℹ️  用户已存在（这也是OK的）"
elif echo "$register_result" | grep -q "Access denied"; then
    echo "❌ IP 访问被拒绝"
    echo "   说明: 服务器有 IP 白名单限制"
    echo "   需要: 检查 ALLOWED_IPS 环境变量"
    exit 1
else
    echo "❌ 注册失败"
    echo "$register_result"
    exit 1
fi
echo ""

# ============================================================================
# 步骤 3: 生成 Token
# ============================================================================
echo "═══════════════════════════════════════════════════════════════════"
echo "步骤 3: 生成 Bob 的访问 Token"
echo "═══════════════════════════════════════════════════════════════════"
echo ""
echo "📝 这一步做什么："
echo "   POST /api/auth/token"
echo "   Body: {userId: \"$USER_ID\", tokenName: \"test-script\"}"
echo "   服务器生成一个 32 字节的随机 Token"
echo ""

echo "🔍 执行: curl -X POST $SERVER/api/auth/token"
token_result=$(curl -s -X POST "$SERVER/api/auth/token" \
  -H "Content-Type: application/json" \
  -d "{\"userId\":\"$USER_ID\",\"tokenName\":\"test-script\"}")

echo "$token_result" | jq . 2>/dev/null

if echo "$token_result" | grep -q "Access denied"; then
    echo "❌ IP 访问被拒绝，无法生成 Token"
    echo "   尝试使用已有 Token..."
    TOKEN="mcp_eyZBfgjQ0Q1_un3c7PHoLsyq5r2T2f7t"
elif echo "$token_result" | grep -q "token"; then
    TOKEN=$(echo "$token_result" | jq -r '.token')
    echo "✅ Token 生成成功"
    echo "   Token: ${TOKEN:0:30}...${TOKEN: -10}"
else
    echo "⚠️  Token 生成可能失败，使用配置中的 Token"
    TOKEN="mcp_eyZBfgjQ0Q1_un3c7PHoLsyq5r2T2f7t"
fi

# 保存 Token
echo "{\"userId\":\"$USER_ID\",\"token\":\"$TOKEN\"}" > /tmp/bob-credentials.json
echo ""
echo "💾 Token 已保存到: /tmp/bob-credentials.json"
echo ""

# ============================================================================
# 步骤 4: 验证 Token
# ============================================================================
echo "═══════════════════════════════════════════════════════════════════"
echo "步骤 4: 验证 Token 是否有效"
echo "═══════════════════════════════════════════════════════════════════"
echo ""
echo "📝 这一步做什么："
echo "   POST /api/auth/validate"
echo "   Header: Authorization: Bearer $TOKEN"
echo "   验证 Token 是否有效，能否用于访问"
echo ""

echo "🔍 执行: curl -X POST $SERVER/api/auth/validate"
validate_result=$(curl -s -X POST "$SERVER/api/auth/validate" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"token\":\"$TOKEN\"}")

echo "$validate_result" | jq . 2>/dev/null

if echo "$validate_result" | grep -q "\"valid\":true"; then
    echo "✅ Token 有效"
    echo ""
    echo "现在可以运行测试脚本了！"
    echo ""
    echo "执行命令："
    echo "  node test-bob-extensions.mjs"
    echo ""
elif echo "$validate_result" | grep -q "Access denied"; then
    echo "❌ IP 被拒绝"
    echo ""
    echo "⚠️  服务器配置了 IP 白名单限制"
    echo "   检查环境变量: ALLOWED_IPS"
    echo "   当前客户端 IP 不在白名单中"
    echo ""
else
    echo "❌ Token 无效"
    echo ""
    echo "可能原因:"
    echo "   1. Token 已过期或被删除"
    echo "   2. 用户 $USER_ID 不存在"
    echo "   3. 服务器认证配置问题"
    echo ""
fi

echo "═══════════════════════════════════════════════════════════════════"
echo "设置流程完成"
echo "═══════════════════════════════════════════════════════════════════"
