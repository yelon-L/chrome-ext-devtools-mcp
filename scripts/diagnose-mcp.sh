#!/bin/bash

echo "╔═══════════════════════════════════════════════════════════════════╗"
echo "║           MCP 服务器诊断工具                                      ║"
echo "╚═══════════════════════════════════════════════════════════════════╝"
echo ""

# 1. 检查Chrome
echo "━━━ 1. Chrome 状态 ━━━"
if curl -s http://localhost:9222/json/version > /dev/null 2>&1; then
    BROWSER_INFO=$(curl -s http://localhost:9222/json/version | jq -r '.Browser')
    echo "✅ Chrome正在运行: $BROWSER_INFO"
else
    echo "❌ Chrome未运行在9222端口"
    echo "   启动命令: google-chrome --remote-debugging-port=9222"
fi
echo ""

# 2. 检查二进制文件
echo "━━━ 2. 二进制文件 ━━━"
BINARY=~/apps/chrome-extension-debug-mcp-server/chrome-extension-debug-linux-x64
if [ -f "$BINARY" ]; then
    VERSION=$($BINARY --version 2>&1)
    echo "✅ 二进制文件存在"
    echo "   路径: $BINARY"
    echo "   版本: $VERSION"
    echo "   大小: $(ls -lh $BINARY | awk '{print $5}')"
else
    echo "❌ 二进制文件不存在: $BINARY"
fi
echo ""

# 3. 检查配置
echo "━━━ 3. Windsurf MCP 配置 ━━━"
CONFIG=~/.codeium/windsurf/mcp_config.json
if [ -f "$CONFIG" ]; then
    echo "✅ 配置文件存在"
    echo "   路径: $CONFIG"
    echo ""
    echo "ext-debug-stdio 配置:"
    cat "$CONFIG" | jq '.mcpServers."ext-debug-stdio"' 2>/dev/null || echo "   配置解析失败"
else
    echo "❌ 配置文件不存在"
fi
echo ""

# 4. 检查运行中的进程
echo "━━━ 4. MCP 进程状态 ━━━"
MCP_PROC=$(ps aux | grep chrome-extension-debug | grep -v grep)
if [ -n "$MCP_PROC" ]; then
    echo "✅ MCP服务器正在运行:"
    echo "$MCP_PROC" | head -3
else
    echo "⚠️  MCP服务器未运行"
    echo "   IDE会在需要时自动启动"
fi
echo ""

# 5. 快速测试
echo "━━━ 5. 快速功能测试 ━━━"
if curl -s http://localhost:9222/json/version > /dev/null 2>&1 && [ -f "$BINARY" ]; then
    echo "测试 get_connected_browser 工具..."
    
    cat > /tmp/test-mcp-$$.js << 'EOJS'
import { spawn } from 'child_process';
const mcp = spawn(process.argv[2], ['--browserUrl', 'http://localhost:9222'], {
  stdio: ['pipe', 'pipe', 'inherit']
});
let buffer = '', requestId = 1;
mcp.stdout.on('data', (data) => {
  buffer += data.toString();
  const lines = buffer.split('\n');
  buffer = lines.pop() || '';
  lines.forEach(line => {
    if (line.trim() && line.includes('{')) {
      try {
        const resp = JSON.parse(line);
        if (resp.result?.content) {
          console.log('✅ 工具响应正常');
          console.log('浏览器:', resp.result.content[0].text.match(/Chrome\/[\d.]+/)?.[0] || '未知');
          process.exit(0);
        }
      } catch(e) {}
    }
  });
});
setTimeout(() => {
  mcp.stdin.write(JSON.stringify({
    jsonrpc: '2.0', id: requestId++, method: 'initialize',
    params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'test', version: '1.0' }}
  }) + '\n');
}, 500);
setTimeout(() => {
  mcp.stdin.write(JSON.stringify({
    jsonrpc: '2.0', id: requestId++, method: 'tools/call',
    params: { name: 'get_connected_browser', arguments: {} }
  }) + '\n');
}, 1500);
setTimeout(() => { console.log('❌ 超时未收到响应'); mcp.kill(); process.exit(1); }, 5000);
EOJS
    
    timeout 6 node /tmp/test-mcp-$$.js "$BINARY" 2>/dev/null
    TEST_RESULT=$?
    rm -f /tmp/test-mcp-$$.js
    
    if [ $TEST_RESULT -eq 0 ]; then
        echo ""
        echo "✅ MCP服务器工作正常"
    else
        echo ""
        echo "❌ MCP服务器响应异常"
    fi
else
    echo "⏭️  跳过（Chrome未运行或二进制文件不存在）"
fi
echo ""

# 6. 诊断建议
echo "━━━ 6. 诊断建议 ━━━"
echo ""
if [ $TEST_RESULT -eq 0 ] 2>/dev/null; then
    echo "✅ MCP服务器本身工作正常"
    echo ""
    echo "如果IDE中仍然无法获取数据，请尝试："
    echo "  1. 在IDE中重新启动MCP连接（断开并重新连接）"
    echo "  2. 重启IDE"
    echo "  3. 检查IDE的MCP日志输出"
    echo ""
    echo "可能原因："
    echo "  • IDE缓存了旧的响应"
    echo "  • MCP连接超时或卡住"
    echo "  • IDE的MCP客户端版本不兼容"
else
    echo "问题排查步骤："
    echo "  1. 确保Chrome在运行: google-chrome --remote-debugging-port=9222"
    echo "  2. 检查二进制文件版本是否正确"
    echo "  3. 查看配置文件: cat $CONFIG"
    echo "  4. 手动测试二进制文件: $BINARY --version"
fi
echo ""

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "诊断完成"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
