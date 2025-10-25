#!/bin/bash
# 上游仓库同步脚本
# 用于将本地 fork 与上游 ChromeDevTools/chrome-devtools-mcp 同步

set -e

UPSTREAM_REPO="https://github.com/ChromeDevTools/chrome-devtools-mcp.git"
UPSTREAM_NAME="upstream"
SYNC_BRANCH="sync-upstream"

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}上游仓库同步工具${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# 检查工作区状态
echo -e "${YELLOW}📋 检查工作区状态...${NC}"
if ! git diff-index --quiet HEAD --; then
    echo -e "${RED}❌ 错误: 工作区有未提交的更改${NC}"
    echo -e "${YELLOW}请先提交或暂存更改:${NC}"
    git status --short
    exit 1
fi
echo -e "${GREEN}✅ 工作区干净${NC}"
echo ""

# 检查是否已添加 upstream
echo -e "${YELLOW}📋 检查 upstream remote...${NC}"
if git remote | grep -q "^${UPSTREAM_NAME}$"; then
    echo -e "${GREEN}✅ upstream remote 已存在${NC}"
else
    echo -e "${YELLOW}⚙️  添加 upstream remote...${NC}"
    git remote add ${UPSTREAM_NAME} ${UPSTREAM_REPO}
    echo -e "${GREEN}✅ upstream remote 已添加${NC}"
fi
echo ""

# 获取上游更新
echo -e "${YELLOW}📥 获取上游更新...${NC}"
git fetch ${UPSTREAM_NAME}
echo -e "${GREEN}✅ 上游更新已获取${NC}"
echo ""

# 显示上游信息
echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}上游仓库信息${NC}"
echo -e "${BLUE}========================================${NC}"

UPSTREAM_LATEST_COMMIT=$(git log ${UPSTREAM_NAME}/main --oneline -1)
UPSTREAM_TAG=$(git describe --tags ${UPSTREAM_NAME}/main 2>/dev/null || echo "无标签")

echo -e "${GREEN}最新提交:${NC} ${UPSTREAM_LATEST_COMMIT}"
echo -e "${GREEN}最新标签:${NC} ${UPSTREAM_TAG}"
echo ""

# 显示本地信息
echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}本地仓库信息${NC}"
echo -e "${BLUE}========================================${NC}"

LOCAL_LATEST_COMMIT=$(git log HEAD --oneline -1)
LOCAL_VERSION=$(grep '"version"' package.json | head -1 | sed 's/.*: "\(.*\)".*/\1/')

echo -e "${GREEN}最新提交:${NC} ${LOCAL_LATEST_COMMIT}"
echo -e "${GREEN}当前版本:${NC} ${LOCAL_VERSION}"
echo ""

# 显示差异统计
echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}差异分析${NC}"
echo -e "${BLUE}========================================${NC}"

COMMITS_BEHIND=$(git rev-list --count HEAD..${UPSTREAM_NAME}/main)
COMMITS_AHEAD=$(git rev-list --count ${UPSTREAM_NAME}/main..HEAD)

echo -e "${YELLOW}本地落后上游:${NC} ${COMMITS_BEHIND} 个提交"
echo -e "${YELLOW}本地领先上游:${NC} ${COMMITS_AHEAD} 个提交"
echo ""

if [ ${COMMITS_BEHIND} -eq 0 ]; then
    echo -e "${GREEN}✅ 本地已是最新，无需同步${NC}"
    exit 0
fi

# 显示上游新提交
echo -e "${YELLOW}📋 上游新提交 (最近 10 个):${NC}"
git log HEAD..${UPSTREAM_NAME}/main --oneline --graph -10
echo ""

# 显示文件差异统计
echo -e "${YELLOW}📋 文件差异统计:${NC}"
git diff --stat HEAD ${UPSTREAM_NAME}/main | head -20
echo ""

# 询问是否继续
echo -e "${YELLOW}========================================${NC}"
echo -e "${YELLOW}同步选项${NC}"
echo -e "${YELLOW}========================================${NC}"
echo "1) 创建同步分支并查看详细差异 (推荐)"
echo "2) 直接合并到当前分支 (风险较高)"
echo "3) 仅查看差异，不进行同步"
echo "4) 退出"
echo ""
read -p "请选择 [1-4]: " choice

case $choice in
    1)
        echo -e "${YELLOW}⚙️  创建同步分支...${NC}"
        
        # 检查同步分支是否已存在
        if git show-ref --verify --quiet refs/heads/${SYNC_BRANCH}; then
            echo -e "${RED}⚠️  同步分支 ${SYNC_BRANCH} 已存在${NC}"
            read -p "是否删除并重新创建? [y/N]: " recreate
            if [[ $recreate =~ ^[Yy]$ ]]; then
                git branch -D ${SYNC_BRANCH}
            else
                echo -e "${YELLOW}使用现有分支${NC}"
            fi
        fi
        
        if ! git show-ref --verify --quiet refs/heads/${SYNC_BRANCH}; then
            git checkout -b ${SYNC_BRANCH}
            echo -e "${GREEN}✅ 已创建并切换到 ${SYNC_BRANCH} 分支${NC}"
        else
            git checkout ${SYNC_BRANCH}
            echo -e "${GREEN}✅ 已切换到 ${SYNC_BRANCH} 分支${NC}"
        fi
        
        echo ""
        echo -e "${YELLOW}⚙️  开始合并上游更新...${NC}"
        echo -e "${YELLOW}注意: 可能会有冲突需要手动解决${NC}"
        echo ""
        
        if git merge ${UPSTREAM_NAME}/main --no-commit --no-ff; then
            echo -e "${GREEN}✅ 合并成功，无冲突${NC}"
            echo ""
            echo -e "${YELLOW}下一步:${NC}"
            echo "1. 检查更改: git status"
            echo "2. 测试编译: pnpm run build"
            echo "3. 运行测试: pnpm test"
            echo "4. 提交合并: git commit"
            echo "5. 合并到 main: git checkout main && git merge ${SYNC_BRANCH}"
        else
            echo -e "${RED}⚠️  发现冲突，需要手动解决${NC}"
            echo ""
            echo -e "${YELLOW}冲突文件:${NC}"
            git status --short | grep "^UU\|^AA\|^DD"
            echo ""
            echo -e "${YELLOW}解决冲突步骤:${NC}"
            echo "1. 编辑冲突文件"
            echo "2. 标记已解决: git add <file>"
            echo "3. 完成合并: git commit"
            echo "4. 测试: pnpm run build && pnpm test"
            echo "5. 合并到 main: git checkout main && git merge ${SYNC_BRANCH}"
        fi
        ;;
        
    2)
        echo -e "${RED}⚠️  警告: 直接合并可能导致冲突${NC}"
        read -p "确定要继续吗? [y/N]: " confirm
        if [[ $confirm =~ ^[Yy]$ ]]; then
            echo -e "${YELLOW}⚙️  开始合并...${NC}"
            git merge ${UPSTREAM_NAME}/main
            echo -e "${GREEN}✅ 合并完成${NC}"
        else
            echo -e "${YELLOW}已取消${NC}"
        fi
        ;;
        
    3)
        echo -e "${YELLOW}📋 查看详细差异...${NC}"
        echo ""
        echo -e "${BLUE}=== package.json ===${NC}"
        git diff HEAD ${UPSTREAM_NAME}/main -- package.json | head -50
        echo ""
        echo -e "${BLUE}=== src/index.ts ===${NC}"
        git diff HEAD ${UPSTREAM_NAME}/main -- src/index.ts | head -50
        echo ""
        echo -e "${YELLOW}完整差异请使用:${NC}"
        echo "git diff HEAD ${UPSTREAM_NAME}/main"
        ;;
        
    4)
        echo -e "${YELLOW}已退出${NC}"
        exit 0
        ;;
        
    *)
        echo -e "${RED}无效选择${NC}"
        exit 1
        ;;
esac

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}同步脚本执行完成${NC}"
echo -e "${GREEN}========================================${NC}"
