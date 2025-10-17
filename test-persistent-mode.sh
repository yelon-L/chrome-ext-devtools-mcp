#!/bin/bash
# 持久连接模式测试脚本

set -e

echo "========================================"
echo "持久连接模式验证测试"
echo "========================================"
echo ""

# 颜色定义
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# 测试计数
TOTAL_TESTS=0
PASSED_TESTS=0

# 测试函数
test_case() {
  TOTAL_TESTS=$((TOTAL_TESTS + 1))
  echo -e "${YELLOW}测试 $TOTAL_TESTS: $1${NC}"
}

pass() {
  PASSED_TESTS=$((PASSED_TESTS + 1))
  echo -e "${GREEN}✓ 通过${NC}"
  echo ""
}

fail() {
  echo -e "${RED}✗ 失败: $1${NC}"
  echo ""
}

# 检查 TypeScript 编译
test_case "TypeScript 类型检查"
if npx tsc --noEmit 2>&1 | grep -q "error TS"; then
  fail "TypeScript 编译错误"
  npx tsc --noEmit
  exit 1
else
  pass
fi

# 检查类型定义
test_case "Session 类型定义包含 persistent 字段"
if grep -q "persistent?: boolean" src/multi-tenant/types/session.types.ts; then
  pass
else
  fail "session.types.ts 缺少 persistent 字段"
  exit 1
fi

test_case "SessionConfig 包含 persistentMode 字段"
if grep -q "persistentMode?: boolean" src/multi-tenant/types/session.types.ts; then
  pass
else
  fail "session.types.ts 缺少 persistentMode 字段"
  exit 1
fi

test_case "MultiTenantConfig.SessionConfig 包含 persistentMode"
if grep -q "persistentMode?: boolean" src/multi-tenant/config/MultiTenantConfig.ts; then
  pass
else
  fail "MultiTenantConfig.ts 缺少 persistentMode 字段"
  exit 1
fi

# 检查配置逻辑
test_case "配置加载逻辑包含 persistentMode 字段"
if grep -q "persistentMode:" src/multi-tenant/config/MultiTenantConfig.ts; then
  pass
else
  fail "缺少 persistentMode 配置"
  exit 1
fi

test_case "配置逻辑包含 MAX_SESSIONS 判断"
if grep -q "MAX_SESSIONS" src/multi-tenant/config/MultiTenantConfig.ts; then
  pass
else
  fail "缺少 MAX_SESSIONS 判断逻辑"
  exit 1
fi

# 检查 SessionManager 实现
test_case "SessionManager.createSession 设置 persistent 标志"
if grep -q "persistent: this.#config.persistentMode" src/multi-tenant/core/SessionManager.ts; then
  pass
else
  fail "createSession 未设置 persistent 标志"
  exit 1
fi

test_case "SessionManager.cleanupExpiredSessions 跳过持久会话"
if grep -q "if (session.persistent)" src/multi-tenant/core/SessionManager.ts; then
  pass
else
  fail "cleanupExpiredSessions 未跳过持久会话"
  exit 1
fi

test_case "清理逻辑包含 skippedPersistent 统计"
if grep -q "skippedPersistent" src/multi-tenant/core/SessionManager.ts; then
  pass
else
  fail "缺少持久会话跳过统计"
  exit 1
fi

# 检查环境变量文档
test_case ".env.example 包含 PERSISTENT_MODE 说明"
if grep -q "PERSISTENT_MODE" .env.example; then
  pass
else
  fail ".env.example 缺少 PERSISTENT_MODE 说明"
  exit 1
fi

# 检查日志输出
test_case "配置打印包含 persistent 状态"
if grep -q "persistent=.*config.session.persistentMode" src/multi-tenant/config/MultiTenantConfig.ts; then
  pass
else
  fail "配置打印缺少 persistent 状态"
  exit 1
fi

# 检查文档
test_case "持久连接模式文档存在"
if [ -f "docs/PERSISTENT_CONNECTION_MODE.md" ]; then
  pass
else
  fail "缺少持久连接模式文档"
  exit 1
fi

# 构建测试
test_case "项目构建成功"
if npm run build > /dev/null 2>&1; then
  pass
else
  fail "构建失败"
  npm run build
  exit 1
fi

# 配置验证测试
test_case "默认配置（无 MAX_SESSIONS）启用持久模式"
PERSISTENT_CHECK=$(node -e "
const config = require('./build/src/multi-tenant/config/MultiTenantConfig.js');
const loaded = config.loadConfigFromEnv('test');
console.log(loaded.session.persistentMode ? 'true' : 'false');
")

if [ "$PERSISTENT_CHECK" = "true" ]; then
  pass
else
  fail "默认配置未启用持久模式"
  exit 1
fi

test_case "设置 MAX_SESSIONS 后禁用持久模式"
PERSISTENT_CHECK=$(MAX_SESSIONS=100 node -e "
const config = require('./build/src/multi-tenant/config/MultiTenantConfig.js');
const loaded = config.loadConfigFromEnv('test');
console.log(loaded.session.persistentMode ? 'true' : 'false');
")

if [ "$PERSISTENT_CHECK" = "false" ]; then
  pass
else
  fail "设置 MAX_SESSIONS 后仍启用持久模式"
  exit 1
fi

test_case "显式设置 PERSISTENT_MODE=true 覆盖默认行为"
PERSISTENT_CHECK=$(MAX_SESSIONS=100 PERSISTENT_MODE=true node -e "
const config = require('./build/src/multi-tenant/config/MultiTenantConfig.js');
const loaded = config.loadConfigFromEnv('test');
console.log(loaded.session.persistentMode ? 'true' : 'false');
")

if [ "$PERSISTENT_CHECK" = "true" ]; then
  pass
else
  fail "显式设置 PERSISTENT_MODE=true 未生效"
  exit 1
fi

# 总结
echo "========================================"
echo "测试完成"
echo "========================================"
echo -e "总计: ${TOTAL_TESTS} 项测试"
echo -e "${GREEN}通过: ${PASSED_TESTS}${NC}"
echo -e "${RED}失败: $((TOTAL_TESTS - PASSED_TESTS))${NC}"
echo ""

if [ $PASSED_TESTS -eq $TOTAL_TESTS ]; then
  echo -e "${GREEN}✓ 所有测试通过！${NC}"
  exit 0
else
  echo -e "${RED}✗ 部分测试失败${NC}"
  exit 1
fi
