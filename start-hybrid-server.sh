#!/bin/bash
##
# 启动支持 CDP 混合架构的多租户服务器
#
# 使用方式:
#   ./start-hybrid-server.sh [mode]
#
# 模式:
#   baseline  - 纯 Puppeteer 模式（默认）
#   target    - 启用 CDP Target 管理
#   full      - 启用完整 CDP 混合架构（Target + Operations）
##

set -e

# 颜色输出
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

MODE=${1:-baseline}

echo -e "${BLUE}╔════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║   Chrome DevTools MCP - CDP 混合架构启动脚本           ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════╝${NC}"
echo ""

# 检查是否已编译
if [ ! -d "build" ]; then
  echo -e "${YELLOW}⚠️  未找到 build 目录，正在编译...${NC}"
  npm run build
  echo ""
fi

# 根据模式设置环境变量
case "$MODE" in
  baseline)
    echo -e "${GREEN}🔧 模式: 纯 Puppeteer（基线）${NC}"
    export USE_CDP_HYBRID=false
    export USE_CDP_OPERATIONS=false
    ;;
  
  target)
    echo -e "${GREEN}🚀 模式: CDP Target 管理${NC}"
    export USE_CDP_HYBRID=true
    export USE_CDP_OPERATIONS=false
    ;;
  
  full)
    echo -e "${GREEN}⚡ 模式: 完整 CDP 混合架构${NC}"
    export USE_CDP_HYBRID=true
    export USE_CDP_OPERATIONS=true
    ;;
  
  *)
    echo -e "${YELLOW}❌ 未知模式: $MODE${NC}"
    echo ""
    echo "可用模式:"
    echo "  baseline  - 纯 Puppeteer 模式"
    echo "  target    - CDP Target 管理"
    echo "  full      - 完整 CDP 混合架构"
    exit 1
    ;;
esac

echo ""
echo -e "${BLUE}配置:${NC}"
echo "  USE_CDP_HYBRID=$USE_CDP_HYBRID"
echo "  USE_CDP_OPERATIONS=$USE_CDP_OPERATIONS"
echo ""

# 启动服务器
echo -e "${GREEN}🚀 启动多租户服务器...${NC}"
echo ""

npm run start:multi-tenant
