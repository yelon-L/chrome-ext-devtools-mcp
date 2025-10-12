#!/bin/bash
set -e

# Chrome DevTools MCP 一键安装脚本

echo "╔═══════════════════════════════════════════════════════════╗"
echo "║  Chrome Extension Debug MCP 一键安装                     ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo ""

# 颜色
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 检测系统
OS="$(uname -s)"
ARCH="$(uname -m)"

case "$OS" in
  Linux*)     PLATFORM="linux";;
  Darwin*)    PLATFORM="macos";;
  MINGW*|MSYS*|CYGWIN*) PLATFORM="win";;
  *)          
    echo -e "${RED}❌ 不支持的操作系统: $OS${NC}"
    exit 1
    ;;
esac

case "$ARCH" in
  x86_64|amd64) ARCH="x64";;
  arm64|aarch64) ARCH="arm64";;
  *)          
    echo -e "${RED}❌ 不支持的架构: $ARCH${NC}"
    exit 1
    ;;
esac

echo -e "${GREEN}检测到系统: $PLATFORM-$ARCH${NC}"
echo ""

# 检查 Node.js
if command -v node &> /dev/null; then
  NODE_VERSION=$(node -v)
  echo -e "${GREEN}✅ 已安装 Node.js: $NODE_VERSION${NC}"
  
  # 推荐使用 npm 安装
  echo ""
  echo "推荐使用 npm 安装（更方便更新）:"
  echo -e "${YELLOW}  npm install -g chrome-extension-debug-mcp${NC}"
  echo ""
  echo "或使用 npx（无需安装）:"
  echo -e "${YELLOW}  npx chrome-extension-debug-mcp --browser-url http://localhost:9222${NC}"
  echo ""
  
  read -p "是否使用 npm 全局安装? (y/N) " -n 1 -r
  echo
  
  if [[ $REPLY =~ ^[Yy]$ ]]; then
    npm install -g chrome-extension-debug-mcp
    echo ""
    echo -e "${GREEN}✅ 安装完成！${NC}"
    echo ""
    echo "使用方法:"
  echo -e "${YELLOW}  chrome-extension-debug-mcp --browser-url http://localhost:9222${NC}"
    exit 0
  fi
fi

echo -e "${YELLOW}⚠️  未检测到 Node.js 或选择手动安装${NC}"
echo "将下载独立可执行文件..."
echo ""

# GitHub 仓库信息（需要替换为实际仓库）
REPO="ChromeDevTools/chrome-extension-debug-mcp"
VERSION="latest"

# 构建下载 URL
BASE_URL="https://github.com/$REPO/releases/$VERSION/download"
BINARY_NAME="chrome-extension-debug-mcp"

if [ "$PLATFORM" = "win" ]; then
  DOWNLOAD_FILE="chrome-extension-debug-mcp-node20-win-$ARCH.exe"
  BINARY_NAME="chrome-devtools-mcp.exe"
else
  DOWNLOAD_FILE="chrome-extension-debug-mcp-node20-$PLATFORM-$ARCH"
fi

DOWNLOAD_URL="$BASE_URL/$DOWNLOAD_FILE"

echo "📥 下载中: $DOWNLOAD_URL"
echo ""

# 下载文件
if command -v curl &> /dev/null; then
  curl -L "$DOWNLOAD_URL" -o "$BINARY_NAME"
elif command -v wget &> /dev/null; then
  wget "$DOWNLOAD_URL" -O "$BINARY_NAME"
else
  echo -e "${RED}❌ 需要 curl 或 wget 来下载文件${NC}"
  exit 1
fi

# 添加执行权限
if [ "$PLATFORM" != "win" ]; then
  chmod +x "$BINARY_NAME"
fi

# 移动到系统路径
if [ "$PLATFORM" = "macos" ] || [ "$PLATFORM" = "linux" ]; then
  INSTALL_DIR="/usr/local/bin"
  
  if [ -w "$INSTALL_DIR" ]; then
    mv "$BINARY_NAME" "$INSTALL_DIR/"
    echo -e "${GREEN}✅ 已安装到 $INSTALL_DIR/$BINARY_NAME${NC}"
  else
    echo ""
    echo "需要 sudo 权限安装到 $INSTALL_DIR"
    sudo mv "$BINARY_NAME" "$INSTALL_DIR/"
    echo -e "${GREEN}✅ 已安装到 $INSTALL_DIR/$BINARY_NAME${NC}"
  fi
else
  echo -e "${GREEN}✅ 已下载到当前目录: $BINARY_NAME${NC}"
  echo ""
  echo -e "${YELLOW}请手动将 $BINARY_NAME 移动到 PATH 路径中${NC}"
fi

echo ""
echo "╔═══════════════════════════════════════════════════════════╗"
echo "║  ✅ 安装完成！                                           ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo ""
echo "使用方法:"
echo -e "${YELLOW}  chrome-extension-debug-mcp --browser-url http://localhost:9222${NC}"
echo ""
echo "查看帮助:"
echo -e "${YELLOW}  chrome-extension-debug-mcp --help${NC}"
echo ""
