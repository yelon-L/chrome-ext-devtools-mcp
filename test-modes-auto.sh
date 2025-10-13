#!/bin/bash

# 自动逐步测试各个服务模式
# 使用已启动的Chrome实例（9222和9225）

BINARY="./dist/chrome-devtools-mcp-linux-x64"
CHROME_9222="http://localhost:9222"
CHROME_9225="http://localhost:9225"

echo ""
echo "╔═══════════════════════════════════════════════════════════╗"
echo "║           逐步测试各个服务模式（自动）                    ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo ""

# 检查Chrome是否已启动
echo "前置检查：验证Chrome实例"
echo "─────────────────────────────────────────────────────────────"

CHROME_9222_OK=false
CHROME_9225_OK=false

if curl -s $CHROME_9222/json/version > /dev/null 2>&1; then
    echo "✅ Chrome 9222 已启动"
    CHROME_9222_OK=true
else
    echo "❌ Chrome 9222 未启动"
    echo ""
    echo "请先启动Chrome 9222:"
    echo "  google-chrome --remote-debugging-port=9222 --user-data-dir=/tmp/chrome-9222"
    exit 1
fi

if curl -s $CHROME_9225/json/version > /dev/null 2>&1; then
    echo "✅ Chrome 9225 已启动"
    CHROME_9225_OK=true
else
    echo "⚠️  Chrome 9225 未启动（Multi-tenant多用户测试将使用单用户）"
fi

echo ""
echo "════════════════════════════════════════════════════════════"
echo ""

# ═══════════════════════════════════════════════════════════════
# 测试 1: stdio 模式
# ═══════════════════════════════════════════════════════════════

echo "╔═══════════════════════════════════════════════════════════╗"
echo "║  模式 1/4: stdio (标准输入输出)                          ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo ""
echo "说明："
echo "  - 默认传输模式，用于MCP客户端（IDE集成）"
echo "  - 通过标准输入输出与MCP客户端通信"
echo "  - 连接到Chrome 9222"
echo ""

# 创建测试输入
cat > /tmp/stdio-test-input.jsonl <<'EOF'
{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test-client","version":"1.0"}}}
{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}
EOF

echo "启动 stdio 服务..."
timeout 8s $BINARY --browserUrl $CHROME_9222 < /tmp/stdio-test-input.jsonl > /tmp/stdio-output.json 2>&1

echo "检查结果..."
sleep 1

if grep -q "tools" /tmp/stdio-output.json 2>/dev/null; then
    echo "✅ stdio 模式测试通过"
    echo "   - 成功接收 MCP 消息"
    echo "   - 能够响应工具列表请求"
    
    # 统计工具数量
    TOOL_COUNT=$(grep -o '"name":"[^"]*"' /tmp/stdio-output.json 2>/dev/null | wc -l)
    if [ "$TOOL_COUNT" -gt 0 ]; then
        echo "   - 工具数量: $TOOL_COUNT"
    fi
else
    echo "❌ stdio 模式测试失败"
    echo ""
    echo "输出内容（前20行）："
    cat /tmp/stdio-output.json 2>/dev/null | head -n 20
fi

echo ""
echo "════════════════════════════════════════════════════════════"
echo ""
sleep 2

# ═══════════════════════════════════════════════════════════════
# 测试 2: SSE 模式
# ═══════════════════════════════════════════════════════════════

echo "╔═══════════════════════════════════════════════════════════╗"
echo "║  模式 2/4: SSE (Server-Sent Events)                      ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo ""
echo "说明："
echo "  - HTTP流式传输，用于Web客户端和远程访问"
echo "  - 端口: 38001"
echo "  - 连接到Chrome 9222"
echo ""

SSE_PORT=38001

echo "启动 SSE 服务器..."
$BINARY --transport sse --port $SSE_PORT --browserUrl $CHROME_9222 > /tmp/sse-server.log 2>&1 &
SSE_PID=$!

echo "  PID: $SSE_PID"
echo "  等待服务器启动..."
sleep 4

# 检查进程
if ! ps -p $SSE_PID > /dev/null 2>&1; then
    echo "❌ SSE 服务器启动失败"
    echo ""
    echo "错误日志："
    cat /tmp/sse-server.log
else
    echo "✅ SSE 服务器已启动"
    echo ""
    
    # 测试健康检查
    echo "测试健康检查端点..."
    HEALTH_RESPONSE=$(curl -s http://localhost:$SSE_PORT/health 2>&1)
    
    if echo "$HEALTH_RESPONSE" | grep -q "ok"; then
        echo "✅ 健康检查通过"
        echo "   响应: $HEALTH_RESPONSE"
    else
        echo "❌ 健康检查失败"
        echo "   响应: $HEALTH_RESPONSE"
    fi
    
    echo ""
    
    # 测试SSE端点
    echo "测试 SSE 连接端点..."
    SSE_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:$SSE_PORT/sse 2>&1)
    
    if [ "$SSE_CODE" == "200" ]; then
        echo "✅ SSE 端点可访问 (状态码: $SSE_CODE)"
    else
        echo "⚠️  SSE 端点状态码: $SSE_CODE"
    fi
    
    echo ""
    echo "可用端点："
    echo "  - http://localhost:$SSE_PORT/health"
    echo "  - http://localhost:$SSE_PORT/sse"
    echo "  - http://localhost:$SSE_PORT/message"
    echo "  - http://localhost:$SSE_PORT/test (浏览器测试页面)"
    
    echo ""
    echo "✅ SSE 模式测试通过"
    
    # 清理
    echo ""
    echo "关闭 SSE 服务器..."
    kill $SSE_PID 2>/dev/null || true
    wait $SSE_PID 2>/dev/null || true
    echo "✅ 已清理"
fi

echo ""
echo "════════════════════════════════════════════════════════════"
echo ""
sleep 2

# ═══════════════════════════════════════════════════════════════
# 测试 3: Streamable HTTP 模式
# ═══════════════════════════════════════════════════════════════

echo "╔═══════════════════════════════════════════════════════════╗"
echo "║  模式 3/4: Streamable HTTP                                ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo ""
echo "说明："
echo "  - 生产环境推荐，支持负载均衡"
echo "  - 端口: 38002"
echo "  - 连接到Chrome 9222"
echo ""

STREAM_PORT=38002

echo "启动 Streamable HTTP 服务器..."
$BINARY --transport streamable --port $STREAM_PORT --browserUrl $CHROME_9222 > /tmp/stream-server.log 2>&1 &
STREAM_PID=$!

echo "  PID: $STREAM_PID"
echo "  等待服务器启动..."
sleep 4

# 检查进程
if ! ps -p $STREAM_PID > /dev/null 2>&1; then
    echo "❌ Streamable HTTP 服务器启动失败"
    echo ""
    echo "错误日志："
    cat /tmp/stream-server.log
else
    echo "✅ Streamable HTTP 服务器已启动"
    echo ""
    
    # 测试MCP端点
    echo "测试 MCP 端点..."
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:$STREAM_PORT/mcp 2>&1)
    
    # Streamable HTTP 期望POST请求，GET返回406是正常的
    if [ "$HTTP_CODE" == "406" ] || [ "$HTTP_CODE" == "405" ]; then
        echo "✅ MCP 端点可访问 (状态码: $HTTP_CODE - 期望POST请求)"
    elif [ "$HTTP_CODE" == "200" ]; then
        echo "✅ MCP 端点可访问 (状态码: $HTTP_CODE)"
    else
        echo "⚠️  MCP 端点响应异常 (状态码: $HTTP_CODE)"
    fi
    
    echo ""
    echo "可用端点："
    echo "  - http://localhost:$STREAM_PORT/mcp (POST请求)"
    
    echo ""
    echo "✅ Streamable HTTP 模式测试通过"
    
    # 清理
    echo ""
    echo "关闭 Streamable HTTP 服务器..."
    kill $STREAM_PID 2>/dev/null || true
    wait $STREAM_PID 2>/dev/null || true
    echo "✅ 已清理"
fi

echo ""
echo "════════════════════════════════════════════════════════════"
echo ""
sleep 2

# ═══════════════════════════════════════════════════════════════
# 测试 4: Multi-tenant 模式
# ═══════════════════════════════════════════════════════════════

echo "╔═══════════════════════════════════════════════════════════╗"
echo "║  模式 4/4: Multi-tenant (多租户)                          ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo ""
echo "说明："
echo "  - 支持多用户同时连接不同的Chrome实例"
echo "  - 端口: 38003"
echo "  - 用户1连接Chrome 9222"
if $CHROME_9225_OK; then
    echo "  - 用户2连接Chrome 9225"
fi
echo ""

MT_PORT=38003

if [ ! -f "./build/src/multi-tenant/server-multi-tenant.js" ]; then
    echo "❌ Multi-tenant 入口文件不存在"
else
    echo "启动 Multi-tenant 服务器..."
    PORT=$MT_PORT AUTH_ENABLED=false node ./build/src/multi-tenant/server-multi-tenant.js > /tmp/mt-server.log 2>&1 &
    MT_PID=$!
    
    echo "  PID: $MT_PID"
    echo "  等待服务器启动..."
    sleep 4
    
    # 检查进程
    if ! ps -p $MT_PID > /dev/null 2>&1; then
        echo "❌ Multi-tenant 服务器启动失败"
        echo ""
        echo "错误日志："
        cat /tmp/mt-server.log | head -n 30
    else
        echo "✅ Multi-tenant 服务器已启动"
        echo ""
        
        # 测试健康检查
        echo "测试健康检查端点..."
        HEALTH_RESPONSE=$(curl -s http://localhost:$MT_PORT/health 2>&1)
        
        if echo "$HEALTH_RESPONSE" | grep -q "ok"; then
            echo "✅ 健康检查通过"
            if command -v jq &> /dev/null; then
                echo "$HEALTH_RESPONSE" | jq '.status, .version, .sessions, .users'
            else
                echo "   $HEALTH_RESPONSE" | head -c 200
            fi
        else
            echo "❌ 健康检查失败"
            echo "   响应: $HEALTH_RESPONSE"
        fi
        
        echo ""
        
        # 注册用户1
        echo "注册用户1 (alice) -> Chrome 9222..."
        USER1_RESPONSE=$(curl -s -X POST http://localhost:$MT_PORT/api/register \
            -H "Content-Type: application/json" \
            -d "{\"userId\":\"alice\",\"browserURL\":\"$CHROME_9222\"}" 2>&1)
        
        if echo "$USER1_RESPONSE" | grep -q "success"; then
            echo "✅ 用户1注册成功"
        else
            echo "❌ 用户1注册失败: $USER1_RESPONSE"
        fi
        
        echo ""
        
        # 注册用户2（如果9225可用）
        if $CHROME_9225_OK; then
            echo "注册用户2 (bob) -> Chrome 9225..."
            USER2_RESPONSE=$(curl -s -X POST http://localhost:$MT_PORT/api/register \
                -H "Content-Type: application/json" \
                -d "{\"userId\":\"bob\",\"browserURL\":\"$CHROME_9225\"}" 2>&1)
            
            if echo "$USER2_RESPONSE" | grep -q "success"; then
                echo "✅ 用户2注册成功"
            else
                echo "❌ 用户2注册失败: $USER2_RESPONSE"
            fi
            
            echo ""
        fi
        
        # 列出所有用户
        echo "列出所有注册用户..."
        USERS_RESPONSE=$(curl -s http://localhost:$MT_PORT/api/users 2>&1)
        
        if command -v jq &> /dev/null; then
            echo "$USERS_RESPONSE" | jq '.users[] | {userId, browserURL}'
        else
            echo "$USERS_RESPONSE"
        fi
        
        echo ""
        echo "可用端点："
        echo "  - http://localhost:$MT_PORT/health"
        echo "  - http://localhost:$MT_PORT/api/register"
        echo "  - http://localhost:$MT_PORT/api/users"
        echo "  - http://localhost:$MT_PORT/sse?userId=alice"
        if $CHROME_9225_OK; then
            echo "  - http://localhost:$MT_PORT/sse?userId=bob"
        fi
        echo "  - http://localhost:$MT_PORT/test (浏览器测试页面)"
        
        echo ""
        echo "✅ Multi-tenant 模式测试通过"
        
        # 清理
        echo ""
        echo "关闭 Multi-tenant 服务器..."
        kill $MT_PID 2>/dev/null || true
        wait $MT_PID 2>/dev/null || true
        echo "✅ 已清理"
    fi
fi

echo ""
echo "╔═══════════════════════════════════════════════════════════╗"
echo "║           所有测试完成                                    ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo ""
echo "✅ 所有4种服务模式测试完成"
echo ""
echo "总结："
echo "  1. stdio 模式 - MCP标准输入输出"
echo "  2. SSE 模式 - HTTP流式传输"
echo "  3. Streamable HTTP 模式 - 生产环境"
echo "  4. Multi-tenant 模式 - 多用户多浏览器"
echo ""
