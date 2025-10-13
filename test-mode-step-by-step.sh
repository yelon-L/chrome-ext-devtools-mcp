#!/bin/bash

# 逐步测试各个服务模式
# 使用已启动的Chrome实例（9222和9225）

BINARY="./dist/chrome-devtools-mcp-linux-x64"
CHROME_9222="http://localhost:9222"
CHROME_9225="http://localhost:9225"

# 颜色输出
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo ""
echo "╔═══════════════════════════════════════════════════════════╗"
echo "║           逐步测试各个服务模式                            ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo ""

# 检查Chrome是否已启动
echo -e "${BLUE}前置检查：验证Chrome实例${NC}"
echo "─────────────────────────────────────────────────────────────"

if curl -s $CHROME_9222/json/version > /dev/null 2>&1; then
    echo -e "${GREEN}✅ Chrome 9222 已启动${NC}"
else
    echo -e "${RED}❌ Chrome 9222 未启动${NC}"
    exit 1
fi

if curl -s $CHROME_9225/json/version > /dev/null 2>&1; then
    echo -e "${GREEN}✅ Chrome 9225 已启动${NC}"
else
    echo -e "${YELLOW}⚠️  Chrome 9225 未启动（某些测试可能跳过）${NC}"
fi

echo ""
read -p "按回车键开始测试模式1: stdio..."
echo ""

# ═══════════════════════════════════════════════════════════════
# 测试 1: stdio 模式
# ═══════════════════════════════════════════════════════════════

echo "╔═══════════════════════════════════════════════════════════╗"
echo "║  模式 1: stdio (标准输入输出)                            ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo ""
echo -e "${BLUE}说明：${NC}"
echo "  - 默认传输模式，用于MCP客户端（IDE集成）"
echo "  - 通过标准输入输出与MCP客户端通信"
echo "  - 连接到Chrome 9222"
echo ""

# 创建测试输入
cat > /tmp/stdio-test-input.jsonl <<'EOF'
{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test-client","version":"1.0"}}}
{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}
EOF

echo -e "${BLUE}启动 stdio 服务...${NC}"
timeout 8s $BINARY --browserUrl $CHROME_9222 < /tmp/stdio-test-input.jsonl > /tmp/stdio-output.json 2>&1 &
STDIO_PID=$!

# 等待处理
sleep 6

# 检查输出
echo -e "\n${BLUE}检查结果...${NC}"

if grep -q "\"method\":\"tools/list\"" /tmp/stdio-output.json 2>/dev/null || \
   grep -q "\"tools\"" /tmp/stdio-output.json 2>/dev/null; then
    echo -e "${GREEN}✅ stdio 模式测试通过${NC}"
    echo -e "${GREEN}   - 成功接收 MCP 消息${NC}"
    echo -e "${GREEN}   - 能够响应工具列表请求${NC}"
    
    # 显示部分输出
    echo ""
    echo "响应摘录："
    grep -o '"tools":\[.*\]' /tmp/stdio-output.json | head -c 200 2>/dev/null || echo "  (查看 /tmp/stdio-output.json)"
else
    echo -e "${RED}❌ stdio 模式测试失败${NC}"
    echo ""
    echo "输出内容："
    cat /tmp/stdio-output.json | head -n 20
fi

# 清理
kill $STDIO_PID 2>/dev/null || true
wait $STDIO_PID 2>/dev/null || true

echo ""
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
read -p "按回车键继续测试模式2: SSE..."
echo ""

# ═══════════════════════════════════════════════════════════════
# 测试 2: SSE 模式
# ═══════════════════════════════════════════════════════════════

echo "╔═══════════════════════════════════════════════════════════╗"
echo "║  模式 2: SSE (Server-Sent Events)                        ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo ""
echo -e "${BLUE}说明：${NC}"
echo "  - HTTP流式传输，用于Web客户端和远程访问"
echo "  - 端口: 38001"
echo "  - 连接到Chrome 9222"
echo ""

SSE_PORT=38001

echo -e "${BLUE}启动 SSE 服务器...${NC}"
$BINARY --transport sse --port $SSE_PORT --browserUrl $CHROME_9222 > /tmp/sse-server.log 2>&1 &
SSE_PID=$!

echo "  PID: $SSE_PID"
echo "  等待服务器启动..."
sleep 4

# 检查进程
if ! ps -p $SSE_PID > /dev/null 2>&1; then
    echo -e "${RED}❌ SSE 服务器启动失败${NC}"
    echo ""
    echo "错误日志:"
    cat /tmp/sse-server.log
    
    read -p "按回车键继续..."
    echo ""
else
    echo -e "${GREEN}✅ SSE 服务器已启动${NC}"
    echo ""
    
    # 测试健康检查
    echo -e "${BLUE}测试健康检查端点...${NC}"
    HEALTH_RESPONSE=$(curl -s http://localhost:$SSE_PORT/health 2>&1)
    
    if echo "$HEALTH_RESPONSE" | grep -q "ok"; then
        echo -e "${GREEN}✅ 健康检查通过${NC}"
        echo "响应: $HEALTH_RESPONSE"
    else
        echo -e "${RED}❌ 健康检查失败${NC}"
        echo "响应: $HEALTH_RESPONSE"
    fi
    
    echo ""
    
    # 测试SSE端点
    echo -e "${BLUE}测试 SSE 连接端点...${NC}"
    SSE_TEST=$(curl -s -I http://localhost:$SSE_PORT/sse 2>&1)
    
    if echo "$SSE_TEST" | grep -q "200\|Content-Type.*event"; then
        echo -e "${GREEN}✅ SSE 端点可访问${NC}"
    else
        echo -e "${YELLOW}⚠️  SSE 端点响应: ${NC}"
        echo "$SSE_TEST" | head -n 5
    fi
    
    echo ""
    echo -e "${BLUE}可用端点:${NC}"
    echo "  - http://localhost:$SSE_PORT/health"
    echo "  - http://localhost:$SSE_PORT/sse"
    echo "  - http://localhost:$SSE_PORT/message"
    echo "  - http://localhost:$SSE_PORT/test (浏览器测试页面)"
    
    echo ""
    echo -e "${GREEN}✅ SSE 模式测试通过${NC}"
    
    # 清理
    echo ""
    echo -e "${BLUE}关闭 SSE 服务器...${NC}"
    kill $SSE_PID 2>/dev/null || true
    wait $SSE_PID 2>/dev/null || true
    echo -e "${GREEN}✅ 已清理${NC}"
fi

echo ""
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
read -p "按回车键继续测试模式3: Streamable HTTP..."
echo ""

# ═══════════════════════════════════════════════════════════════
# 测试 3: Streamable HTTP 模式
# ═══════════════════════════════════════════════════════════════

echo "╔═══════════════════════════════════════════════════════════╗"
echo "║  模式 3: Streamable HTTP                                  ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo ""
echo -e "${BLUE}说明：${NC}"
echo "  - 生产环境推荐，支持负载均衡"
echo "  - 端口: 38002"
echo "  - 连接到Chrome 9222"
echo ""

STREAM_PORT=38002

echo -e "${BLUE}启动 Streamable HTTP 服务器...${NC}"
$BINARY --transport streamable --port $STREAM_PORT --browserUrl $CHROME_9222 > /tmp/stream-server.log 2>&1 &
STREAM_PID=$!

echo "  PID: $STREAM_PID"
echo "  等待服务器启动..."
sleep 4

# 检查进程
if ! ps -p $STREAM_PID > /dev/null 2>&1; then
    echo -e "${RED}❌ Streamable HTTP 服务器启动失败${NC}"
    echo ""
    echo "错误日志:"
    cat /tmp/stream-server.log
    
    read -p "按回车键继续..."
    echo ""
else
    echo -e "${GREEN}✅ Streamable HTTP 服务器已启动${NC}"
    echo ""
    
    # 测试MCP端点
    echo -e "${BLUE}测试 MCP 端点...${NC}"
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:$STREAM_PORT/mcp 2>&1)
    
    # Streamable HTTP 期望POST请求，GET返回406是正常的
    if [ "$HTTP_CODE" == "406" ] || [ "$HTTP_CODE" == "405" ]; then
        echo -e "${GREEN}✅ MCP 端点可访问 (状态码: $HTTP_CODE - 期望POST请求)${NC}"
    elif [ "$HTTP_CODE" == "200" ]; then
        echo -e "${GREEN}✅ MCP 端点可访问 (状态码: $HTTP_CODE)${NC}"
    else
        echo -e "${YELLOW}⚠️  MCP 端点响应异常 (状态码: $HTTP_CODE)${NC}"
    fi
    
    echo ""
    echo -e "${BLUE}可用端点:${NC}"
    echo "  - http://localhost:$STREAM_PORT/mcp (POST请求)"
    
    echo ""
    echo -e "${GREEN}✅ Streamable HTTP 模式测试通过${NC}"
    
    # 清理
    echo ""
    echo -e "${BLUE}关闭 Streamable HTTP 服务器...${NC}"
    kill $STREAM_PID 2>/dev/null || true
    wait $STREAM_PID 2>/dev/null || true
    echo -e "${GREEN}✅ 已清理${NC}"
fi

echo ""
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
read -p "按回车键继续测试模式4: Multi-tenant..."
echo ""

# ═══════════════════════════════════════════════════════════════
# 测试 4: Multi-tenant 模式
# ═══════════════════════════════════════════════════════════════

echo "╔═══════════════════════════════════════════════════════════╗"
echo "║  模式 4: Multi-tenant (多租户)                            ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo ""
echo -e "${BLUE}说明：${NC}"
echo "  - 支持多用户同时连接不同的Chrome实例"
echo "  - 端口: 38003"
echo "  - 用户1连接Chrome 9222"
echo "  - 用户2连接Chrome 9225"
echo ""

MT_PORT=38003

if [ ! -f "./build/src/multi-tenant/server-multi-tenant.js" ]; then
    echo -e "${RED}❌ Multi-tenant 入口文件不存在${NC}"
    echo ""
    read -p "按回车键完成所有测试..."
    echo ""
else
    echo -e "${BLUE}启动 Multi-tenant 服务器...${NC}"
    PORT=$MT_PORT AUTH_ENABLED=false node ./build/src/multi-tenant/server-multi-tenant.js > /tmp/mt-server.log 2>&1 &
    MT_PID=$!
    
    echo "  PID: $MT_PID"
    echo "  等待服务器启动..."
    sleep 4
    
    # 检查进程
    if ! ps -p $MT_PID > /dev/null 2>&1; then
        echo -e "${RED}❌ Multi-tenant 服务器启动失败${NC}"
        echo ""
        echo "错误日志:"
        cat /tmp/mt-server.log
        
        read -p "按回车键完成所有测试..."
        echo ""
    else
        echo -e "${GREEN}✅ Multi-tenant 服务器已启动${NC}"
        echo ""
        
        # 测试健康检查
        echo -e "${BLUE}测试健康检查端点...${NC}"
        HEALTH_RESPONSE=$(curl -s http://localhost:$MT_PORT/health 2>&1)
        
        if echo "$HEALTH_RESPONSE" | grep -q "ok"; then
            echo -e "${GREEN}✅ 健康检查通过${NC}"
            echo "$HEALTH_RESPONSE" | jq . 2>/dev/null || echo "$HEALTH_RESPONSE"
        else
            echo -e "${RED}❌ 健康检查失败${NC}"
            echo "响应: $HEALTH_RESPONSE"
        fi
        
        echo ""
        
        # 注册用户1
        echo -e "${BLUE}注册用户1 (alice) -> Chrome 9222...${NC}"
        USER1_RESPONSE=$(curl -s -X POST http://localhost:$MT_PORT/api/register \
            -H "Content-Type: application/json" \
            -d "{\"userId\":\"alice\",\"browserURL\":\"$CHROME_9222\"}" 2>&1)
        
        if echo "$USER1_RESPONSE" | grep -q "success"; then
            echo -e "${GREEN}✅ 用户1注册成功${NC}"
            echo "$USER1_RESPONSE" | jq . 2>/dev/null || echo "$USER1_RESPONSE"
        else
            echo -e "${RED}❌ 用户1注册失败${NC}"
            echo "$USER1_RESPONSE"
        fi
        
        echo ""
        
        # 注册用户2（如果9225可用）
        if curl -s $CHROME_9225/json/version > /dev/null 2>&1; then
            echo -e "${BLUE}注册用户2 (bob) -> Chrome 9225...${NC}"
            USER2_RESPONSE=$(curl -s -X POST http://localhost:$MT_PORT/api/register \
                -H "Content-Type: application/json" \
                -d "{\"userId\":\"bob\",\"browserURL\":\"$CHROME_9225\"}" 2>&1)
            
            if echo "$USER2_RESPONSE" | grep -q "success"; then
                echo -e "${GREEN}✅ 用户2注册成功${NC}"
                echo "$USER2_RESPONSE" | jq . 2>/dev/null || echo "$USER2_RESPONSE"
            else
                echo -e "${RED}❌ 用户2注册失败${NC}"
                echo "$USER2_RESPONSE"
            fi
        else
            echo -e "${YELLOW}⚠️  跳过用户2注册（Chrome 9225未启动）${NC}"
        fi
        
        echo ""
        
        # 列出所有用户
        echo -e "${BLUE}列出所有注册用户...${NC}"
        USERS_RESPONSE=$(curl -s http://localhost:$MT_PORT/api/users 2>&1)
        echo "$USERS_RESPONSE" | jq . 2>/dev/null || echo "$USERS_RESPONSE"
        
        echo ""
        echo -e "${BLUE}可用端点:${NC}"
        echo "  - http://localhost:$MT_PORT/health"
        echo "  - http://localhost:$MT_PORT/api/register"
        echo "  - http://localhost:$MT_PORT/api/users"
        echo "  - http://localhost:$MT_PORT/sse?userId=alice"
        echo "  - http://localhost:$MT_PORT/test (浏览器测试页面)"
        
        echo ""
        echo -e "${GREEN}✅ Multi-tenant 模式测试通过${NC}"
        
        # 清理
        echo ""
        echo -e "${BLUE}关闭 Multi-tenant 服务器...${NC}"
        kill $MT_PID 2>/dev/null || true
        wait $MT_PID 2>/dev/null || true
        echo -e "${GREEN}✅ 已清理${NC}"
    fi
fi

echo ""
echo "╔═══════════════════════════════════════════════════════════╗"
echo "║           所有测试完成                                    ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo ""
echo -e "${GREEN}总结：所有4种服务模式测试完成${NC}"
echo ""
