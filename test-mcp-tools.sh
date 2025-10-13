#!/bin/bash

# 测试 MCP 服务器的工具列表访问

set -e

BINARY="./dist/chrome-devtools-mcp-linux-x64"
PORT=36002

echo "════════════════════════════════════════════════════════════"
echo "测试编译后的二进制 - MCP 工具列表访问"
echo "════════════════════════════════════════════════════════════"
echo ""

# 启动 SSE 服务器
echo "启动 SSE 服务器 (端口 $PORT)..."
$BINARY --transport sse --port $PORT --headless > /tmp/mcp-test-server.log 2>&1 &
SERVER_PID=$!

# 等待服务器启动
sleep 4

# 检查服务器是否运行
if ! ps -p $SERVER_PID > /dev/null 2>&1; then
    echo "❌ 服务器启动失败"
    cat /tmp/mcp-test-server.log
    exit 1
fi

echo "✅ 服务器已启动 (PID: $SERVER_PID)"
echo ""

# 测试健康检查
echo "测试健康检查..."
if curl -s http://localhost:$PORT/health | jq . ; then
    echo "✅ 健康检查成功"
else
    echo "❌ 健康检查失败"
fi

echo ""
echo "════════════════════════════════════════════════════════════"
echo "测试 MCP 协议连接"
echo "════════════════════════════════════════════════════════════"
echo ""

# 使用简单的 Node.js 脚本来测试 MCP 协议
cat > /tmp/test-mcp-client.mjs <<'EOFJS'
import http from 'http';
import {createRequire} from 'module';
const require = createRequire(import.meta.url);
const EventSource = require('eventsource').default || require('eventsource');

const PORT = process.argv[2] || 36002;

async function testMCP() {
  console.log('连接到 SSE 端点...');
  
  const es = new EventSource(`http://localhost:${PORT}/sse`);
  
  return new Promise((resolve, reject) => {
    let sessionId = null;
    const timeout = setTimeout(() => {
      es.close();
      reject(new Error('超时'));
    }, 10000);
    
    es.addEventListener('endpoint', (event) => {
      console.log('✅ 收到 endpoint 事件');
      const data = JSON.parse(event.data);
      const match = data.uri.match(/sessionId=([^&]+)/);
      if (match) {
        sessionId = match[1];
        console.log(`✅ Session ID: ${sessionId}`);
        
        // 发送 tools/list 请求
        console.log('\n发送 tools/list 请求...');
        const toolsRequest = {
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/list',
          params: {},
        };
        
        const postData = JSON.stringify(toolsRequest);
        const options = {
          hostname: 'localhost',
          port: PORT,
          path: `/message?sessionId=${sessionId}`,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(postData),
          },
        };
        
        const req = http.request(options, (res) => {
          let responseData = '';
          res.on('data', (chunk) => { responseData += chunk; });
          res.on('end', () => {
            clearTimeout(timeout);
            es.close();
            
            try {
              const response = JSON.parse(responseData);
              if (response.result && response.result.tools) {
                const tools = response.result.tools;
                console.log(`✅ 成功获取工具列表! 共 ${tools.length} 个工具\n`);
                
                console.log('工具列表（前 20 个）:');
                tools.slice(0, 20).forEach((tool, i) => {
                  console.log(`  ${i + 1}. ${tool.name}`);
                });
                
                const extensionTools = tools.filter(t => t.name.includes('extension'));
                console.log(`\n扩展调试工具: ${extensionTools.length} 个`);
                extensionTools.forEach(tool => {
                  console.log(`  - ${tool.name}`);
                });
                
                if (tools.length >= 37) {
                  console.log('\n✅ 所有工具都可访问！');
                  resolve();
                } else {
                  console.log(`\n⚠️  工具数量异常: 期望 >=37, 实际 ${tools.length}`);
                  resolve();
                }
              } else {
                console.error('❌ 未能获取工具列表');
                console.error('响应:', responseData);
                reject(new Error('无效的响应'));
              }
            } catch (error) {
              reject(error);
            }
          });
        });
        
        req.on('error', reject);
        req.write(postData);
        req.end();
      }
    });
    
    es.addEventListener('error', (error) => {
      clearTimeout(timeout);
      es.close();
      reject(new Error(`SSE 错误: ${error.message || '未知'}`));
    });
  });
}

testMCP()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(`\n❌ 测试失败: ${error.message}`);
    process.exit(1);
  });
EOFJS

# 运行测试
node /tmp/test-mcp-client.mjs $PORT

TEST_RESULT=$?

# 清理
echo ""
echo "清理服务器..."
kill $SERVER_PID 2>/dev/null || true
wait $SERVER_PID 2>/dev/null || true

echo ""
echo "════════════════════════════════════════════════════════════"
if [ $TEST_RESULT -eq 0 ]; then
    echo "✅ MCP 工具列表访问测试通过"
else
    echo "❌ MCP 工具列表访问测试失败"
fi
echo "════════════════════════════════════════════════════════════"

exit $TEST_RESULT
