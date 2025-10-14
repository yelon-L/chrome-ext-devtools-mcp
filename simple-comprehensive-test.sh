#!/bin/bash

# Comprehensive Tools Test Script
# Server: 192.168.239.1:32122 (Multi-Tenant)
# Chrome: localhost:9222

SERVER="http://192.168.239.1:32122"
USER_ID="test-$(date +%s)"
BROWSER_URL="http://localhost:9222"

echo "╔════════════════════════════════════════════════════════════════╗"
echo "║    Comprehensive MCP Tools Testing                            ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""
echo "Server: $SERVER"
echo "Chrome: $BROWSER_URL"
echo "User: $USER_ID"
echo ""

# Step 1: Register
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📝 Step 1: User Registration"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

REGISTER_RESULT=$(curl -s -X POST "$SERVER/api/register" \
  -H "Content-Type: application/json" \
  -d "{\"userId\":\"$USER_ID\",\"browserURL\":\"$BROWSER_URL\"}")

echo "$REGISTER_RESULT" | jq -r 'if .success then "✅ User registered" else "❌ Registration failed: " + .error end'

# Step 2: Get Token
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🔑 Step 2: Token Request"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

TOKEN_RESULT=$(curl -s -X POST "$SERVER/api/auth/token" \
  -H "Content-Type: application/json" \
  -d "{\"userId\":\"$USER_ID\"}")

TOKEN=$(echo "$TOKEN_RESULT" | jq -r '.token // empty')

if [ -z "$TOKEN" ]; then
  echo "❌ Failed to get token"
  echo "$TOKEN_RESULT"
  exit 1
fi

echo "✅ Token obtained: ${TOKEN:0:20}..."

# Step 3: Test Tools via SSE
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🔌 Step 3: Testing via SSE Connection"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Use Node.js script for interactive testing..."
echo ""

# Save credentials for Node script
cat > /tmp/mcp-test-credentials.json <<EOF
{
  "server": "$SERVER",
  "userId": "$USER_ID",
  "token": "$TOKEN"
}
EOF

echo "✅ Credentials saved to /tmp/mcp-test-credentials.json"
echo ""
echo "Run: node interactive-tools-test.mjs"
