#!/bin/bash

# 测试浏览器重连能力
# 场景：启动streamable服务 → 关闭浏览器 → 重启浏览器 → 测试是否自动恢复

echo "╔═══════════════════════════════════════════════════════════════════╗"
echo "║     测试 Streamable 模式的浏览器重连能力                         ║"
echo "╚═══════════════════════════════════════════════════════════════════╝"
echo ""

# 颜色定义
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 测试步骤
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "测试场景"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "1. 启动 Chrome (端口 9222)"
echo "2. 启动 MCP Streamable 服务"
echo "3. 测试连接 - 应该成功 ✅"
echo "4. 关闭 Chrome"
echo "5. 测试连接 - 预期失败 ❌"
echo "6. 重启 Chrome"
echo "7. 测试连接 - 检查是否自动恢复 ❓"
echo ""

# 检查 Chrome 是否在运行
check_chrome() {
    if curl -s http://localhost:9222/json/version > /dev/null 2>&1; then
        return 0
    else
        return 1
    fi
}

# 检查 MCP 服务
check_mcp() {
    if curl -s http://localhost:32123/health > /dev/null 2>&1; then
        return 0
    else
        return 1
    fi
}

# 测试工具调用
test_tool() {
    local session_id="test-reconnect-$(date +%s)"
    
    # 初始化会话
    local init_response=$(curl -s -X POST http://localhost:32123/mcp \
        -H "Content-Type: application/json" \
        -H "Mcp-Session-Id: $session_id" \
        -d '{
            "jsonrpc": "2.0",
            "id": 1,
            "method": "initialize",
            "params": {
                "protocolVersion": "2024-11-05",
                "capabilities": {},
                "clientInfo": {"name": "test", "version": "1.0"}
            }
        }')
    
    echo "$init_response" | grep -q '"result"'
    if [ $? -ne 0 ]; then
        echo -e "${RED}✗ 初始化失败${NC}"
        return 1
    fi
    
    # 调用 list_extensions
    local tool_response=$(curl -s -X POST http://localhost:32123/mcp \
        -H "Content-Type: application/json" \
        -H "Mcp-Session-Id: $session_id" \
        -d '{
            "jsonrpc": "2.0",
            "id": 2,
            "method": "tools/call",
            "params": {
                "name": "list_extensions",
                "arguments": {}
            }
        }')
    
    echo "$tool_response" | grep -q '"content"'
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✓ 工具调用成功${NC}"
        return 0
    else
        echo -e "${RED}✗ 工具调用失败${NC}"
        echo "响应: $tool_response" | head -c 200
        return 1
    fi
}

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "步骤 1: 检查 Chrome 状态"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

if check_chrome; then
    echo -e "${GREEN}✓ Chrome 已在端口 9222 运行${NC}"
else
    echo -e "${YELLOW}⚠ Chrome 未运行，请手动启动:${NC}"
    echo "  google-chrome --remote-debugging-port=9222 --user-data-dir=/tmp/chrome-test"
    exit 1
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "步骤 2: 检查 MCP 服务状态"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

if check_mcp; then
    echo -e "${GREEN}✓ MCP 服务已在端口 32123 运行${NC}"
else
    echo -e "${YELLOW}⚠ MCP 服务未运行，请手动启动:${NC}"
    echo "  node build/src/server-http.js --browserUrl http://localhost:9222"
    exit 1
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "步骤 3: 测试初始连接（浏览器运行中）"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

test_tool
initial_test=$?

if [ $initial_test -eq 0 ]; then
    echo -e "${GREEN}✓ 初始测试通过${NC}"
else
    echo -e "${RED}✗ 初始测试失败，无法继续${NC}"
    exit 1
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "步骤 4: 请关闭 Chrome 浏览器"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo -e "${YELLOW}⏸  请手动关闭 Chrome 浏览器（所有窗口）${NC}"
echo "按 Enter 继续..."
read

# 等待 Chrome 关闭
for i in {1..5}; do
    if ! check_chrome; then
        echo -e "${GREEN}✓ Chrome 已关闭${NC}"
        break
    fi
    echo "等待 Chrome 关闭... ($i/5)"
    sleep 1
done

if check_chrome; then
    echo -e "${RED}✗ Chrome 仍在运行，请手动关闭${NC}"
    exit 1
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "步骤 5: 测试连接（浏览器已关闭）"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

test_tool
closed_test=$?

if [ $closed_test -ne 0 ]; then
    echo -e "${GREEN}✓ 预期的失败 - 浏览器已关闭${NC}"
else
    echo -e "${YELLOW}⚠ 意外：浏览器关闭后仍能连接？${NC}"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "步骤 6: 请重启 Chrome 浏览器"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo -e "${YELLOW}⏸  请重新启动 Chrome:${NC}"
echo "  google-chrome --remote-debugging-port=9222 --user-data-dir=/tmp/chrome-test"
echo ""
echo "按 Enter 继续..."
read

# 等待 Chrome 启动
for i in {1..10}; do
    if check_chrome; then
        echo -e "${GREEN}✓ Chrome 已重启${NC}"
        break
    fi
    echo "等待 Chrome 启动... ($i/10)"
    sleep 1
done

if ! check_chrome; then
    echo -e "${RED}✗ Chrome 未启动${NC}"
    exit 1
fi

# 等待几秒让浏览器完全就绪
echo "等待浏览器完全就绪..."
sleep 3

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "步骤 7: 测试自动恢复能力"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

test_tool
reconnect_test=$?

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "测试结果"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "初始连接（Chrome 运行）: $([ $initial_test -eq 0 ] && echo -e "${GREEN}✓ 成功${NC}" || echo -e "${RED}✗ 失败${NC}")"
echo "浏览器关闭后:           $([ $closed_test -ne 0 ] && echo -e "${GREEN}✓ 正确失败${NC}" || echo -e "${YELLOW}⚠ 异常${NC}")"
echo "浏览器重启后:           $([ $reconnect_test -eq 0 ] && echo -e "${GREEN}✓ 自动恢复${NC}" || echo -e "${RED}✗ 未恢复${NC}")"
echo ""

if [ $reconnect_test -eq 0 ]; then
    echo -e "${GREEN}╔═══════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║  ✅ 测试通过：具备自动恢复能力                                   ║${NC}"
    echo -e "${GREEN}╚═══════════════════════════════════════════════════════════════════╝${NC}"
else
    echo -e "${RED}╔═══════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${RED}║  ❌ 测试失败：不具备自动恢复能力                                 ║${NC}"
    echo -e "${RED}╚═══════════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo -e "${YELLOW}问题分析：${NC}"
    echo "1. server-http.ts 在启动时连接浏览器，保存到全局变量"
    echo "2. 浏览器关闭后，browser.connected 变为 false"
    echo "3. 新会话创建时只验证连接，不尝试重连"
    echo "4. 需要实现自动重连机制"
fi

echo ""
