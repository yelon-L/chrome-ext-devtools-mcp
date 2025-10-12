#!/bin/bash

# 为 Caddy 添加绑定特权端口（80/443）的能力
# 这样就可以不用 sudo 运行 Caddy

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}  Setup Caddy Privileges for Port 80/443${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# 检查是否安装了 caddy
if ! command -v caddy &> /dev/null; then
    echo -e "${RED}❌ Caddy not found${NC}"
    echo ""
    echo "Install Caddy first:"
    echo "  macOS:   brew install caddy"
    echo "  Ubuntu:  sudo apt install caddy"
    echo "  Arch:    sudo pacman -S caddy"
    echo ""
    exit 1
fi

CADDY_PATH=$(which caddy)
echo "📍 Caddy location: $CADDY_PATH"
echo ""

# 检查当前权限
echo "🔍 Checking current capabilities..."
getcap "$CADDY_PATH" || echo "   No capabilities set"
echo ""

# 添加能力
echo "🔧 Adding CAP_NET_BIND_SERVICE capability..."
echo ""
echo "This will allow Caddy to bind to ports 80/443 without sudo."
echo "You will be asked for your sudo password."
echo ""

if sudo setcap cap_net_bind_service=+ep "$CADDY_PATH"; then
    echo -e "${GREEN}✅ Capability added successfully!${NC}"
    echo ""
    
    # 验证
    echo "🔍 Verifying..."
    getcap "$CADDY_PATH"
    echo ""
    
    echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${GREEN}✅ Setup complete!${NC}"
    echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    echo "Caddy can now bind to port 80/443 without sudo."
    echo ""
    echo "Start Caddy with:"
    echo "  ./scripts/start-with-caddy.sh"
    echo ""
    echo "Access MCP at:"
    echo -e "  ${GREEN}http://mcp.localhost${NC} (no port number needed!)"
    echo ""
else
    echo -e "${RED}❌ Failed to add capability${NC}"
    echo ""
    echo "Alternative: Run Caddy with sudo"
    echo "  sudo caddy start --config Caddyfile.local"
    echo ""
    exit 1
fi
