#!/bin/bash
# 持久连接模式快速验证脚本

echo "============================================"
echo "持久连接模式 - 快速验证"
echo "============================================"
echo ""

# 检查构建
if [ ! -d "build" ]; then
  echo "❌ 项目未构建，正在构建..."
  npm run build > /dev/null 2>&1
fi

echo "✅ 构建完成"
echo ""

# 测试1：默认配置（应启用持久模式）
echo "📋 测试1：默认配置（单客户端场景）"
RESULT=$(node -e "
const config = require('./build/src/multi-tenant/config/MultiTenantConfig.js');
const loaded = config.loadConfigFromEnv('test');
console.log('persistent=' + loaded.session.persistentMode);
console.log('maxSessions=' + loaded.session.maxSessions);
")
echo "$RESULT"
if echo "$RESULT" | grep -q "persistent=true"; then
  echo "✅ 通过：默认启用持久模式"
else
  echo "❌ 失败：应该启用持久模式"
  exit 1
fi
echo ""

# 测试2：多租户配置（应禁用持久模式）
echo "📋 测试2：多租户配置"
RESULT=$(MAX_SESSIONS=100 node -e "
const config = require('./build/src/multi-tenant/config/MultiTenantConfig.js');
const loaded = config.loadConfigFromEnv('test');
console.log('persistent=' + loaded.session.persistentMode);
console.log('maxSessions=' + loaded.session.maxSessions);
")
echo "$RESULT"
if echo "$RESULT" | grep -q "persistent=false"; then
  echo "✅ 通过：多租户场景禁用持久模式"
else
  echo "❌ 失败：应该禁用持久模式"
  exit 1
fi
echo ""

# 测试3：显式启用
echo "📋 测试3：显式启用持久模式"
RESULT=$(PERSISTENT_MODE=true node -e "
const config = require('./build/src/multi-tenant/config/MultiTenantConfig.js');
const loaded = config.loadConfigFromEnv('test');
console.log('persistent=' + loaded.session.persistentMode);
")
echo "$RESULT"
if echo "$RESULT" | grep -q "persistent=true"; then
  echo "✅ 通过：显式启用成功"
else
  echo "❌ 失败：显式启用无效"
  exit 1
fi
echo ""

echo "============================================"
echo "✅ 所有验证通过！"
echo "============================================"
echo ""
echo "📚 使用指南："
echo "  - 开发环境：直接启动，无需配置"
echo "  - 生产环境：export PERSISTENT_MODE=true"
echo "  - 多租户：export MAX_SESSIONS=100"
echo ""
echo "📖 完整文档："
echo "  - docs/PERSISTENT_MODE_QUICK_START.md"
echo "  - docs/PERSISTENT_CONNECTION_MODE.md"
echo ""
