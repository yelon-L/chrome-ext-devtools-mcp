#!/bin/bash

# 快速测试二进制文件的基本功能

BINARY="./dist/chrome-devtools-mcp-linux-x64"

echo "════════════════════════════════════════════════════════════"
echo "测试 1: 版本信息"
echo "════════════════════════════════════════════════════════════"
$BINARY --version
echo ""

echo "════════════════════════════════════════════════════════════"
echo "测试 2: SSE 服务器 (5秒后自动关闭)"
echo "════════════════════════════════════════════════════════════"
timeout 5s $BINARY --transport sse --port 35001 --headless &
SSE_PID=$!
sleep 2

echo "检查服务器..."
if ps -p $SSE_PID > /dev/null 2>&1; then
    echo "✅ SSE 服务器已启动 (PID: $SSE_PID)"
    
    # 测试健康检查
    if command -v curl &> /dev/null; then
        echo "测试健康检查端点..."
        curl -s http://localhost:35001/health && echo "" || echo "⚠️  健康检查失败"
    fi
else
    echo "❌ SSE 服务器启动失败"
fi

wait $SSE_PID 2>/dev/null || true
echo ""

echo "════════════════════════════════════════════════════════════"
echo "测试 3: Streamable HTTP 服务器 (5秒后自动关闭)"
echo "════════════════════════════════════════════════════════════"
timeout 5s $BINARY --transport streamable --port 35002 --headless &
STREAM_PID=$!
sleep 2

echo "检查服务器..."
if ps -p $STREAM_PID > /dev/null 2>&1; then
    echo "✅ Streamable HTTP 服务器已启动 (PID: $STREAM_PID)"
else
    echo "❌ Streamable HTTP 服务器启动失败"
fi

wait $STREAM_PID 2>/dev/null || true
echo ""

echo "════════════════════════════════════════════════════════════"
echo "测试 4: Multi-tenant 服务器 (Node.js)"
echo "════════════════════════════════════════════════════════════"
if [ -f "./build/src/multi-tenant/server-multi-tenant.js" ]; then
    timeout 5s env PORT=35003 AUTH_ENABLED=false node ./build/src/multi-tenant/server-multi-tenant.js &
    MT_PID=$!
    sleep 2
    
    echo "检查服务器..."
    if ps -p $MT_PID > /dev/null 2>&1; then
        echo "✅ Multi-tenant 服务器已启动 (PID: $MT_PID)"
        
        if command -v curl &> /dev/null; then
            echo "测试健康检查端点..."
            curl -s http://localhost:35003/health && echo "" || echo "⚠️  健康检查失败"
        fi
    else
        echo "❌ Multi-tenant 服务器启动失败"
    fi
    
    wait $MT_PID 2>/dev/null || true
else
    echo "⚠️  Multi-tenant 入口文件不存在"
fi

echo ""
echo "════════════════════════════════════════════════════════════"
echo "测试完成"
echo "════════════════════════════════════════════════════════════"
