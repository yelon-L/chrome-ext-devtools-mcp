#!/bin/bash

###############################################################################
# SQL架构改进 - 全面测试脚本
# 
# 测试覆盖：
# 1. 编译测试
# 2. 类型检查
# 3. 迁移框架测试
# 4. Kysely类型安全验证
# 5. 错误类测试
# 6. Logger测试
# 7. 限流器测试
###############################################################################

set -e  # 遇到错误立即退出

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}SQL架构改进 - 全面测试${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0

# 测试函数
run_test() {
    local test_name="$1"
    local test_command="$2"
    
    TOTAL_TESTS=$((TOTAL_TESTS + 1))
    echo -e "${YELLOW}[测试 $TOTAL_TESTS] $test_name${NC}"
    
    if eval "$test_command"; then
        echo -e "${GREEN}✓ 通过${NC}"
        PASSED_TESTS=$((PASSED_TESTS + 1))
        echo ""
        return 0
    else
        echo -e "${RED}✗ 失败${NC}"
        FAILED_TESTS=$((FAILED_TESTS + 1))
        echo ""
        return 1
    fi
}

#==============================================================================
# 第1阶段: 编译和类型检查
#==============================================================================
echo -e "${BLUE}===== 第1阶段: 编译和类型检查 =====${NC}"
echo ""

run_test "TypeScript类型检查" "pnpm run typecheck"

run_test "项目构建" "pnpm run build"

#==============================================================================
# 第2阶段: 迁移框架测试（如果PostgreSQL可用）
#==============================================================================
echo -e "${BLUE}===== 第2阶段: 迁移框架测试 =====${NC}"
echo ""

# 检查PostgreSQL是否可用
if command -v psql &> /dev/null; then
    # 配置测试数据库
    export POSTGRES_HOST=${POSTGRES_HOST:-localhost}
    export POSTGRES_PORT=${POSTGRES_PORT:-5432}
    export POSTGRES_DB="extdebugdb_comprehensive_test_$(date +%s)"
    export POSTGRES_USER=${POSTGRES_USER:-postgres}
    export POSTGRES_PASSWORD=${POSTGRES_PASSWORD:-postgres}
    
    echo -e "${YELLOW}测试数据库: $POSTGRES_DB${NC}"
    
    # 创建测试数据库
    PGPASSWORD=$POSTGRES_PASSWORD createdb -h $POSTGRES_HOST -p $POSTGRES_PORT -U $POSTGRES_USER $POSTGRES_DB 2>/dev/null || true
    
    run_test "迁移状态查看" "pnpm run migrate:status"
    
    run_test "应用所有迁移" "pnpm run migrate:up"
    
    run_test "验证用户表结构" "PGPASSWORD=$POSTGRES_PASSWORD psql -h $POSTGRES_HOST -p $POSTGRES_PORT -U $POSTGRES_USER -d $POSTGRES_DB -c '\\d mcp_users' > /dev/null"
    
    run_test "验证浏览器表结构" "PGPASSWORD=$POSTGRES_PASSWORD psql -h $POSTGRES_HOST -p $POSTGRES_PORT -U $POSTGRES_USER -d $POSTGRES_DB -c '\\d mcp_browsers' > /dev/null"
    
    run_test "验证迁移历史表" "PGPASSWORD=$POSTGRES_PASSWORD psql -h $POSTGRES_HOST -p $POSTGRES_PORT -U $POSTGRES_USER -d $POSTGRES_DB -c 'SELECT COUNT(*) FROM pgmigrations' > /dev/null"
    
    run_test "测试插入用户数据" "PGPASSWORD=$POSTGRES_PASSWORD psql -h $POSTGRES_HOST -p $POSTGRES_PORT -U $POSTGRES_USER -d $POSTGRES_DB -c \"INSERT INTO mcp_users (user_id, email, username, registered_at, updated_at) VALUES ('test-1', 'test@example.com', 'testuser', $(date +%s000), $(date +%s000))\" > /dev/null"
    
    run_test "测试插入浏览器数据" "PGPASSWORD=$POSTGRES_PASSWORD psql -h $POSTGRES_HOST -p $POSTGRES_PORT -U $POSTGRES_USER -d $POSTGRES_DB -c \"INSERT INTO mcp_browsers (browser_id, user_id, browser_url, token_name, token, created_at_ts) VALUES (gen_random_uuid(), 'test-1', 'http://localhost:9222', 'test-browser', 'test-token', $(date +%s000))\" > /dev/null"
    
    run_test "测试外键约束（CASCADE删除）" "PGPASSWORD=$POSTGRES_PASSWORD psql -h $POSTGRES_HOST -p $POSTGRES_PORT -U $POSTGRES_USER -d $POSTGRES_DB -c \"DELETE FROM mcp_users WHERE user_id = 'test-1'; SELECT COUNT(*) FROM mcp_browsers WHERE user_id = 'test-1'\" | grep -q '^\\s*0\\s*$'"
    
    # 清理测试数据库
    PGPASSWORD=$POSTGRES_PASSWORD dropdb -h $POSTGRES_HOST -p $POSTGRES_PORT -U $POSTGRES_USER $POSTGRES_DB 2>/dev/null || true
    echo -e "${GREEN}✓ 测试数据库已清理${NC}"
    echo ""
else
    echo -e "${YELLOW}⚠️  PostgreSQL不可用，跳过迁移框架测试${NC}"
    echo ""
fi

#==============================================================================
# 第3阶段: 代码质量检查
#==============================================================================
echo -e "${BLUE}===== 第3阶段: 代码质量检查 =====${NC}"
echo ""

run_test "检查错误类定义" "grep -q 'export class MaxSessionsReachedError' src/multi-tenant/errors/AppError.ts"

run_test "检查Logger定义" "grep -q 'export function createLogger' src/multi-tenant/utils/Logger.ts"

run_test "检查RateLimiter定义" "grep -q 'export class RateLimiter' src/multi-tenant/utils/RateLimiter.ts"

run_test "检查Kysely Schema定义" "grep -q 'export interface Database' src/multi-tenant/storage/schema.ts"

run_test "检查Kysely实例工厂" "grep -q 'export function createDB' src/multi-tenant/storage/db.ts"

#==============================================================================
# 第4阶段: Kysely类型安全验证
#==============================================================================
echo -e "${BLUE}===== 第4阶段: Kysely类型安全验证 =====${NC}"
echo ""

run_test "验证Schema类型导出" "grep -q 'UsersTable\\|BrowsersTable' src/multi-tenant/storage/schema.ts"

run_test "验证PostgreSQLStorageAdapter使用Kysely" "grep -q 'private db: Kysely<Database>' src/multi-tenant/storage/PostgreSQLStorageAdapter.ts"

run_test "验证registerUser使用Kysely" "grep -q \"insertInto('mcp_users')\" src/multi-tenant/storage/PostgreSQLStorageAdapter.ts"

run_test "验证getUser使用Kysely" "grep -q \"selectFrom('mcp_users')\" src/multi-tenant/storage/PostgreSQLStorageAdapter.ts"

run_test "验证updateUsername使用Kysely" "grep -q \"updateTable('mcp_users')\" src/multi-tenant/storage/PostgreSQLStorageAdapter.ts"

run_test "验证deleteUser使用Kysely" "grep -q \"deleteFrom('mcp_users')\" src/multi-tenant/storage/PostgreSQLStorageAdapter.ts"

#==============================================================================
# 第5阶段: 错误类应用验证
#==============================================================================
echo -e "${BLUE}===== 第5阶段: 错误类应用验证 =====${NC}"
echo ""

run_test "验证UnifiedStorageAdapter使用错误类" "grep -q 'SyncMethodNotSupportedError\\|StorageNotInitializedError' src/multi-tenant/storage/UnifiedStorageAdapter.ts"

run_test "验证SessionManager使用错误类" "grep -q 'MaxSessionsReachedError' src/multi-tenant/core/SessionManager.ts"

run_test "验证PostgreSQL使用错误类" "grep -q 'StorageOperationError' src/multi-tenant/storage/PostgreSQLStorageAdapter.ts"

#==============================================================================
# 第6阶段: Logger应用验证
#==============================================================================
echo -e "${BLUE}===== 第6阶段: Logger应用验证 =====${NC}"
echo ""

run_test "验证SessionManager使用Logger" "grep -q '#logger = createLogger' src/multi-tenant/core/SessionManager.ts"

run_test "验证PostgreSQL使用Logger" "grep -q 'private logger = createLogger.*PostgreSQL' src/multi-tenant/storage/PostgreSQLStorageAdapter.ts"

run_test "验证Server使用Logger" "grep -q 'private serverLogger = createLogger.*MultiTenantServer' src/multi-tenant/server-multi-tenant.ts"

#==============================================================================
# 第7阶段: 限流器应用验证
#==============================================================================
echo -e "${BLUE}===== 第7阶段: 限流器应用验证 =====${NC}"
echo ""

run_test "验证Server初始化限流器" "grep -q 'this.globalRateLimiter = new RateLimiter' src/multi-tenant/server-multi-tenant.ts"

run_test "验证Server应用全局限流" "grep -q 'this.globalRateLimiter.tryAcquire' src/multi-tenant/server-multi-tenant.ts"

run_test "验证Server应用用户级限流" "grep -q 'this.userRateLimiter.tryAcquire' src/multi-tenant/server-multi-tenant.ts"

#==============================================================================
# 测试总结
#==============================================================================
echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}测试总结${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""
echo -e "总测试数: ${BLUE}$TOTAL_TESTS${NC}"
echo -e "通过: ${GREEN}$PASSED_TESTS${NC}"
echo -e "失败: ${RED}$FAILED_TESTS${NC}"
echo ""

if [ $FAILED_TESTS -eq 0 ]; then
    echo -e "${GREEN}========================================${NC}"
    echo -e "${GREEN}✅ 所有测试通过！${NC}"
    echo -e "${GREEN}========================================${NC}"
    exit 0
else
    echo -e "${RED}========================================${NC}"
    echo -e "${RED}❌ 有 $FAILED_TESTS 个测试失败${NC}"
    echo -e "${RED}========================================${NC}"
    exit 1
fi
