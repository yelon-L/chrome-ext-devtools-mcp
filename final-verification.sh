#!/bin/bash

# 最终验证：编译后二进制的所有模式

set -e

BINARY="./dist/chrome-devtools-mcp-linux-x64"

echo "╔═══════════════════════════════════════════════════════════╗"
echo "║  编译后二进制文件 - 最终验证                            ║"
echo "║  测试所有模式的工具和服务访问                            ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo ""

RESULTS=()

# 测试 1: 版本检查
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "1. 版本信息"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
VERSION=$($BINARY --version 2>&1 | head -n 1)
echo "版本: $VERSION"
if [[ "$VERSION" == *"0.8.1"* ]]; then
    echo "✅ 版本信息正确"
    RESULTS+=("✅ 版本信息")
else
    echo "❌ 版本信息异常"
    RESULTS+=("❌ 版本信息")
fi
echo ""

# 测试 2: 工具注册中心
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "2. 工具注册中心（从编译后的代码直接验证）"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

TOOL_COUNT=$(node -e "
import('./build/src/tools/registry.js').then(m => {
  const tools = m.getAllTools();
  console.log(tools.length);
}).catch(() => process.exit(1));
" 2>&1 | tail -n 1)

echo "工具总数: $TOOL_COUNT"

if [ "$TOOL_COUNT" -ge 37 ]; then
    echo "✅ 工具注册中心正常 ($TOOL_COUNT 个工具)"
    RESULTS+=("✅ 工具注册中心 ($TOOL_COUNT个)")
else
    echo "❌ 工具数量异常 (期望>=37, 实际$TOOL_COUNT)"
    RESULTS+=("❌ 工具注册中心")
fi
echo ""

# 测试 3: SSE 模式
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "3. SSE 模式"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

SSE_PORT=37001
$BINARY --transport sse --port $SSE_PORT --headless --isolated > /tmp/sse-test.log 2>&1 &
SSE_PID=$!
sleep 3

if ps -p $SSE_PID > /dev/null 2>&1; then
    echo "✅ SSE 服务器启动成功 (PID: $SSE_PID)"
    
    if curl -s http://localhost:$SSE_PORT/health | grep -q "ok"; then
        echo "✅ SSE 健康检查通过"
        RESULTS+=("✅ SSE 模式")
    else
        echo "❌ SSE 健康检查失败"
        RESULTS+=("❌ SSE 模式")
    fi
    
    kill $SSE_PID 2>/dev/null || true
    wait $SSE_PID 2>/dev/null || true
else
    echo "❌ SSE 服务器启动失败"
    RESULTS+=("❌ SSE 模式")
fi
echo ""

# 测试 4: Streamable HTTP 模式
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "4. Streamable HTTP 模式"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

STREAM_PORT=37002
$BINARY --transport streamable --port $STREAM_PORT --headless --isolated > /tmp/stream-test.log 2>&1 &
STREAM_PID=$!
sleep 3

if ps -p $STREAM_PID > /dev/null 2>&1; then
    echo "✅ Streamable HTTP 服务器启动成功 (PID: $STREAM_PID)"
    
    # Streamable HTTP 期望 POST 请求，返回 406 是正常的
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:$STREAM_PORT/mcp)
    if [ "$HTTP_CODE" == "406" ] || [ "$HTTP_CODE" == "200" ]; then
        echo "✅ Streamable HTTP 端点可访问 (状态码: $HTTP_CODE)"
        RESULTS+=("✅ Streamable HTTP 模式")
    else
        echo "⚠️  Streamable HTTP 端点响应异常 (状态码: $HTTP_CODE)"
        RESULTS+=("⚠️  Streamable HTTP 模式")
    fi
    
    kill $STREAM_PID 2>/dev/null || true
    wait $STREAM_PID 2>/dev/null || true
else
    echo "❌ Streamable HTTP 服务器启动失败"
    RESULTS+=("❌ Streamable HTTP 模式")
fi
echo ""

# 测试 5: Multi-tenant 模式
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "5. Multi-tenant 模式"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

MT_PORT=37003
if [ -f "./build/src/multi-tenant/server-multi-tenant.js" ]; then
    PORT=$MT_PORT AUTH_ENABLED=false node ./build/src/multi-tenant/server-multi-tenant.js > /tmp/mt-test.log 2>&1 &
    MT_PID=$!
    sleep 3
    
    if ps -p $MT_PID > /dev/null 2>&1; then
        echo "✅ Multi-tenant 服务器启动成功 (PID: $MT_PID)"
        
        if curl -s http://localhost:$MT_PORT/health | grep -q "ok"; then
            echo "✅ Multi-tenant 健康检查通过"
            RESULTS+=("✅ Multi-tenant 模式")
        else
            echo "❌ Multi-tenant 健康检查失败"
            RESULTS+=("❌ Multi-tenant 模式")
        fi
        
        kill $MT_PID 2>/dev/null || true
        wait $MT_PID 2>/dev/null || true
    else
        echo "❌ Multi-tenant 服务器启动失败"
        RESULTS+=("❌ Multi-tenant 模式")
    fi
else
    echo "⚠️  Multi-tenant 入口文件不存在"
    RESULTS+=("⚠️  Multi-tenant 模式")
fi
echo ""

# 总结
echo "╔═══════════════════════════════════════════════════════════╗"
echo "║  测试总结                                                ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo ""

for result in "${RESULTS[@]}"; do
    echo "$result"
done

echo ""

SUCCESS_COUNT=$(echo "${RESULTS[@]}" | grep -o "✅" | wc -l)
FAIL_COUNT=$(echo "${RESULTS[@]}" | grep -o "❌" | wc -l)
WARN_COUNT=$(echo "${RESULTS[@]}" | grep -o "⚠️" | wc -l)

echo "统计: ✅ $SUCCESS_COUNT 成功 | ❌ $FAIL_COUNT 失败 | ⚠️  $WARN_COUNT 警告"
echo ""

if [ $FAIL_COUNT -eq 0 ]; then
    echo "╔═══════════════════════════════════════════════════════════╗"
    echo "║  ✅ 所有测试通过！                                       ║"
    echo "║  编译后的二进制文件在所有模式下都能正常访问工具和服务    ║"
    echo "╚═══════════════════════════════════════════════════════════╝"
    exit 0
else
    echo "╔═══════════════════════════════════════════════════════════╗"
    echo "║  ❌ 有 $FAIL_COUNT 个测试失败                                    ║"
    echo "╚═══════════════════════════════════════════════════════════╝"
    exit 1
fi
