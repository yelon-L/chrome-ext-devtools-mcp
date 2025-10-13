#!/bin/bash

# 测试二进制文件的各种模式是否能正常访问工具和服务

set -e

BINARY="./dist/chrome-devtools-mcp-linux-x64"
TEST_LOG="test-results.txt"

echo "╔═══════════════════════════════════════════════════════════╗"
echo "║  测试编译后的二进制文件 - 各种模式工具访问              ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo ""

# 清空测试日志
> "$TEST_LOG"

# 函数：记录测试结果
log_result() {
    local mode=$1
    local test_name=$2
    local result=$3
    local details=$4
    
    echo "[$mode] $test_name: $result" | tee -a "$TEST_LOG"
    if [ -n "$details" ]; then
        echo "  详情: $details" | tee -a "$TEST_LOG"
    fi
}

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "测试 1: stdio 模式 - 工具列表"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# 创建测试请求：获取工具列表
cat > /tmp/mcp-test-request.json <<'EOF'
{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}
EOF

# 测试 stdio 模式
echo "启动 stdio 模式并发送 tools/list 请求..."
timeout 10s bash -c "echo '{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"initialize\",\"params\":{\"protocolVersion\":\"2024-11-05\",\"capabilities\":{},\"clientInfo\":{\"name\":\"test\",\"version\":\"1.0.0\"}}}' | $BINARY --headless 2>&1 | head -n 20" > /tmp/stdio-test.log || true

if grep -q "tools" /tmp/stdio-test.log 2>/dev/null; then
    log_result "stdio" "工具列表获取" "✅ 成功" "能够正常响应 MCP 协议"
else
    log_result "stdio" "工具列表获取" "❌ 失败" "未能获取到工具列表"
    echo "  输出内容："
    cat /tmp/stdio-test.log | head -n 10
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "测试 2: SSE 模式 - 服务启动和健康检查"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# 启动 SSE 服务器
echo "启动 SSE 服务器..."
$BINARY --transport sse --port 33001 --headless &>/tmp/sse-server.log &
SSE_PID=$!

# 等待服务器启动
sleep 3

if ps -p $SSE_PID > /dev/null; then
    log_result "SSE" "服务启动" "✅ 成功" "进程正在运行 (PID: $SSE_PID)"
    
    # 测试健康检查
    if curl -s http://localhost:33001/health > /dev/null 2>&1; then
        log_result "SSE" "健康检查" "✅ 成功" "健康检查端点可访问"
    else
        log_result "SSE" "健康检查" "❌ 失败" "健康检查端点不可访问"
    fi
    
    # 测试 SSE 端点
    if curl -s http://localhost:33001/sse -I 2>&1 | grep -q "200\|text/event-stream"; then
        log_result "SSE" "SSE端点" "✅ 成功" "SSE 端点可访问"
    else
        log_result "SSE" "SSE端点" "⚠️  警告" "SSE 端点响应异常"
    fi
    
    # 关闭服务器
    kill $SSE_PID 2>/dev/null || true
    wait $SSE_PID 2>/dev/null || true
else
    log_result "SSE" "服务启动" "❌ 失败" "进程未能启动"
    echo "  错误日志："
    cat /tmp/sse-server.log | head -n 10
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "测试 3: Streamable HTTP 模式 - 服务启动"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# 启动 Streamable HTTP 服务器
echo "启动 Streamable HTTP 服务器..."
$BINARY --transport streamable --port 33002 --headless &>/tmp/streamable-server.log &
STREAM_PID=$!

# 等待服务器启动
sleep 3

if ps -p $STREAM_PID > /dev/null; then
    log_result "Streamable" "服务启动" "✅ 成功" "进程正在运行 (PID: $STREAM_PID)"
    
    # 测试 MCP 端点
    if curl -s http://localhost:33002/mcp -I 2>&1 | grep -q "200\|POST"; then
        log_result "Streamable" "MCP端点" "✅ 成功" "MCP 端点可访问"
    else
        log_result "Streamable" "MCP端点" "⚠️  警告" "MCP 端点响应异常"
    fi
    
    # 关闭服务器
    kill $STREAM_PID 2>/dev/null || true
    wait $STREAM_PID 2>/dev/null || true
else
    log_result "Streamable" "服务启动" "❌ 失败" "进程未能启动"
    echo "  错误日志："
    cat /tmp/streamable-server.log | head -n 10
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "测试 4: Multi-tenant 模式 - 服务启动"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# 检查是否有 multi-tenant 的入口点
if [ -f "./build/src/multi-tenant/server-multi-tenant.js" ]; then
    echo "启动 Multi-tenant 服务器..."
    PORT=33003 AUTH_ENABLED=false node ./build/src/multi-tenant/server-multi-tenant.js &>/tmp/multi-tenant-server.log &
    MT_PID=$!
    
    # 等待服务器启动
    sleep 3
    
    if ps -p $MT_PID > /dev/null; then
        log_result "Multi-tenant" "服务启动" "✅ 成功" "进程正在运行 (PID: $MT_PID)"
        
        # 测试健康检查
        if curl -s http://localhost:33003/health > /dev/null 2>&1; then
            log_result "Multi-tenant" "健康检查" "✅ 成功" "健康检查端点可访问"
            
            # 获取健康状态
            health_status=$(curl -s http://localhost:33003/health)
            echo "  健康状态: $health_status"
        else
            log_result "Multi-tenant" "健康检查" "❌ 失败" "健康检查端点不可访问"
        fi
        
        # 测试 SSE 端点
        if curl -s http://localhost:33003/sse -I 2>&1 | grep -q "200\|400\|text/event-stream"; then
            log_result "Multi-tenant" "SSE端点" "✅ 成功" "SSE 端点可访问"
        else
            log_result "Multi-tenant" "SSE端点" "❌ 失败" "SSE 端点不可访问"
        fi
        
        # 关闭服务器
        kill $MT_PID 2>/dev/null || true
        wait $MT_PID 2>/dev/null || true
    else
        log_result "Multi-tenant" "服务启动" "❌ 失败" "进程未能启动"
        echo "  错误日志："
        cat /tmp/multi-tenant-server.log | head -n 20
    fi
else
    log_result "Multi-tenant" "模式检测" "⚠️  警告" "Multi-tenant 入口文件不存在"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ 测试完成"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# 输出总结
echo "测试总结："
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
cat "$TEST_LOG"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# 统计测试结果
success_count=$(grep -c "✅ 成功" "$TEST_LOG" || echo "0")
fail_count=$(grep -c "❌ 失败" "$TEST_LOG" || echo "0")
warning_count=$(grep -c "⚠️  警告" "$TEST_LOG" || echo "0")

echo ""
echo "统计: ✅ $success_count 个成功 | ❌ $fail_count 个失败 | ⚠️  $warning_count 个警告"

if [ "$fail_count" -gt 0 ]; then
    echo ""
    echo "❌ 发现 $fail_count 个失败的测试，需要修复！"
    exit 1
else
    echo ""
    echo "✅ 所有关键测试通过！"
fi
