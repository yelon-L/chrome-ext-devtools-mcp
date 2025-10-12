#!/bin/bash

# 启动 MCP Server (SSE 模式)
# 连接到已启动的 Chrome (9222端口)

echo "🚀 启动 MCP Server (SSE 模式)"
echo "📡 连接到 Chrome 9222端口"
echo ""

node build/src/index.js \
  --transport sse \
  --port 3000 \
  --browser-url http://localhost:9222
