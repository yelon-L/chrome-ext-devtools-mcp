#!/bin/bash

# 简单测试：验证编译后的二进制能否正常访问工具

set -e

BINARY="./dist/chrome-devtools-mcp-linux-x64"
PORT=36003

echo "════════════════════════════════════════════════════════════"
echo "测试编译后的二进制 - 工具访问验证"
echo "════════════════════════════════════════════════════════════"
echo ""

# 方案 1: 测试 stdio 模式 - 发送 MCP 消息
echo "方案 1: 测试 stdio 模式"
echo "────────────────────────────────────────────────────────────"

# 创建测试输入
cat > /tmp/mcp-stdio-test.json <<EOF
{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}
{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}
EOF

echo "发送 MCP 消息到 stdio..."
timeout 8s $BINARY --headless < /tmp/mcp-stdio-test.json > /tmp/mcp-stdio-output.txt 2>&1 || true

echo ""
echo "检查响应..."
if grep -q "tools" /tmp/mcp-stdio-output.txt 2>/dev/null; then
    echo "✅ stdio 模式能够访问工具"
    echo ""
    echo "响应摘录："
    grep "tools" /tmp/mcp-stdio-output.txt | head -n 5 || true
else
    echo "⚠️  stdio 模式响应异常"
    echo ""
    echo "完整输出："
    cat /tmp/mcp-stdio-output.txt | head -n 30
fi

echo ""
echo ""

# 方案 2: 测试 SSE 模式 - 健康检查证明服务可用
echo "方案 2: 测试 SSE/HTTP 模式"
echo "────────────────────────────────────────────────────────────"

echo "启动 SSE 服务器..."
$BINARY --transport sse --port $PORT --headless > /tmp/sse-server.log 2>&1 &
SSE_PID=$!

sleep 4

if ps -p $SSE_PID > /dev/null 2>&1; then
    echo "✅ SSE 服务器已启动 (PID: $SSE_PID)"
    
    # 健康检查
    echo "健康检查..."
    HEALTH=$(curl -s http://localhost:$PORT/health 2>&1)
    echo "$HEALTH"
    
    if echo "$HEALTH" | grep -q "ok"; then
        echo "✅ SSE 服务器健康"
    fi
    
    # 查看服务器日志中的工具注册信息
    echo ""
    echo "检查服务器日志..."
    if grep -i "tool\|register" /tmp/sse-server.log 2>/dev/null | head -n 5; then
        echo "✅ 发现工具注册信息"
    fi
    
    # 清理
    kill $SSE_PID 2>/dev/null || true
    wait $SSE_PID 2>/dev/null || true
else
    echo "❌ SSE 服务器启动失败"
    cat /tmp/sse-server.log
fi

echo ""
echo ""

# 方案 3: 直接检查编译后的代码
echo "方案 3: 检查编译后的代码"
echo "────────────────────────────────────────────────────────────"

if [ -f "./build/src/tools/registry.js" ]; then
    echo "检查工具注册中心..."
    
    # 运行工具统计
    node -e "
    import('./build/src/tools/registry.js').then(module => {
      const tools = module.getAllTools();
      console.log('✅ 工具注册中心可访问');
      console.log(\`总工具数: \${tools.length}\`);
      console.log('');
      console.log('工具列表（前 20 个）:');
      tools.slice(0, 20).forEach((tool, i) => {
        console.log(\`  \${i+1}. \${tool.name}\`);
      });
      
      const extensionTools = tools.filter(t => t.name.includes('extension'));
      console.log(\`\n扩展调试工具: \${extensionTools.length} 个\`);
      extensionTools.forEach(tool => {
        console.log(\`  - \${tool.name}\`);
      });
    }).catch(err => {
      console.error('❌ 无法加载工具注册中心:', err.message);
      process.exit(1);
    });
    " 2>&1
    
    RESULT=$?
    
    if [ $RESULT -eq 0 ]; then
        echo ""
        echo "✅ 工具注册中心正常工作"
    else
        echo ""
        echo "❌ 工具注册中心有问题"
    fi
else
    echo "❌ 编译后的代码不存在"
fi

echo ""
echo "════════════════════════════════════════════════════════════"
echo "测试完成"
echo "════════════════════════════════════════════════════════════"
