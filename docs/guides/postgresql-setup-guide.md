# PostgreSQL环境配置指南

本指南帮助你快速设置PostgreSQL环境以运行完整测试。

---

## 🚀 快速开始

### 方案1: 使用Docker（推荐）

**优点**: 快速、隔离、易清理

```bash
# 启动PostgreSQL容器
docker run -d \
  --name test-postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_DB=postgres \
  -p 5432:5432 \
  postgres:14

# 验证运行
docker ps | grep test-postgres

# 测试连接
psql -h localhost -p 5432 -U postgres -d postgres -c "SELECT version();"
```

**停止和清理**:

```bash
# 停止容器
docker stop test-postgres

# 删除容器
docker rm test-postgres

# 完全清理（包括数据）
docker rm -f test-postgres
```

---

### 方案2: 本地安装PostgreSQL

#### Ubuntu/Debian

```bash
# 安装
sudo apt update
sudo apt install postgresql postgresql-contrib

# 启动服务
sudo systemctl start postgresql
sudo systemctl enable postgresql

# 验证
sudo systemctl status postgresql
```

#### macOS

```bash
# 使用Homebrew
brew install postgresql@14

# 启动服务
brew services start postgresql@14

# 验证
psql postgres -c "SELECT version();"
```

#### 配置访问

```bash
# 切换到postgres用户
sudo -u postgres psql

# 设置密码
postgres=# ALTER USER postgres PASSWORD 'postgres';

# 退出
postgres=# \q
```

---

## 🧪 运行测试

### 1. 完整Staging测试

```bash
# 运行所有16个测试（包括PostgreSQL相关的4个）
./test-staging-complete.sh
```

**预期输出**:

```
========================================
Staging环境 - 完整测试
========================================

===== 环境检查 =====
✓ psql命令可用
✓ PostgreSQL服务可用

===== 第一部分: 基础测试 (8个) =====
[1.1] 环境准备验证
✓ 通过
...

===== 第二部分: PostgreSQL集成测试 (4个) =====
[1.5] 迁移功能完整性测试
  → 查看迁移状态...
    ✓ 迁移状态正确
  → 应用迁移...
    ✓ 迁移应用成功
...

========================================
测试总结
========================================
总测试数: 16
通过: 16 ✅
失败: 0
跳过: 0
成功率: 100.0% (16/16)

🎉 所有测试通过！
```

---

### 2. 迁移框架测试

```bash
# 专门测试数据库迁移功能
./test-migration-framework.sh
```

---

### 3. 手动迁移操作

#### 查看迁移状态

```bash
export POSTGRES_DB=extdebugdb
npm run migrate:status
```

#### 应用迁移

```bash
npm run migrate:up
```

#### 回滚迁移

```bash
npm run migrate:down
```

#### 创建新迁移

```bash
# 手动创建迁移文件
touch src/multi-tenant/storage/migrations/002-add-new-field.sql

# 编辑迁移文件
vim src/multi-tenant/storage/migrations/002-add-new-field.sql
```

---

## 🔧 环境变量配置

### PostgreSQL连接配置

```bash
# .env 文件或环境变量
export POSTGRES_HOST=localhost
export POSTGRES_PORT=5432
export POSTGRES_DB=extdebugdb
export POSTGRES_USER=postgres
export POSTGRES_PASSWORD=postgres
```

### 存储类型配置

```bash
# 使用PostgreSQL存储
export STORAGE_TYPE=postgresql

# 或使用JSONL存储（默认）
export STORAGE_TYPE=jsonl
```

---

## 🐛 故障排查

### 问题1: 无法连接PostgreSQL

```bash
# 检查服务状态
sudo systemctl status postgresql  # Linux
brew services list | grep postgres  # macOS

# 检查端口占用
lsof -i :5432
netstat -an | grep 5432

# 测试连接
psql -h localhost -p 5432 -U postgres -d postgres
```

### 问题2: 权限错误

```bash
# 确认pg_hba.conf配置
sudo vim /etc/postgresql/14/main/pg_hba.conf  # Linux
vim /usr/local/var/postgres/pg_hba.conf      # macOS

# 添加或修改以下行
local   all   postgres   trust
host    all   all        127.0.0.1/32   md5

# 重启服务
sudo systemctl restart postgresql  # Linux
brew services restart postgresql@14  # macOS
```

### 问题3: 迁移失败

```bash
# 检查迁移历史表
psql -U postgres -d extdebugdb -c "SELECT * FROM pgmigrations;"

# 手动回滚
psql -U postgres -d extdebugdb -c "DROP TABLE IF EXISTS mcp_browsers, mcp_users CASCADE;"
psql -U postgres -d extdebugdb -c "DELETE FROM pgmigrations WHERE name = '001-initial-schema';"

# 重新应用
npm run migrate:up
```

### 问题4: 测试数据残留

```bash
# 清理所有测试数据库
psql -U postgres -d postgres -c "
  SELECT 'DROP DATABASE ' || datname || ';'
  FROM pg_database
  WHERE datname LIKE 'extdebugdb_%';
" | psql -U postgres -d postgres
```

---

## 📊 验证清单

测试前确认以下项：

- [ ] PostgreSQL服务已启动
- [ ] 可以连接数据库（`psql -U postgres -d postgres -c "SELECT 1;"`)
- [ ] 迁移目录存在（`ls -la src/multi-tenant/storage/migrations/`）
- [ ] 迁移脚本可执行（`npm run migrate:status`）
- [ ] 项目已构建（`npm run build`）
- [ ] 环境变量已配置

---

## 🎯 测试覆盖

### 完整测试包含：

#### 基础测试（8个）

- ✅ 依赖安装验证
- ✅ 迁移文件验证
- ✅ 代码集成验证
- ✅ Kysely类型验证
- ✅ TypeScript编译

#### PostgreSQL集成测试（4个）

- ✅ 迁移功能完整性
- ✅ 数据CRUD操作
- ✅ 外键约束验证
- ✅ Kysely功能一致性

#### 可选测试（1个）

- ⚠️ 应用启动验证（需手动）

---

## 🔍 性能基准

### 预期性能指标

- **迁移应用时间**: <2秒（001-initial-schema）
- **查询响应时间**: <10ms（简单SELECT）
- **Kysely开销**: <0.1%（理论值，零运行时开销）

### 运行基准测试

```bash
# TODO: 创建性能基准测试脚本
# ./benchmark-postgres.sh
```

---

## 📚 相关文档

- [测试验证方案](./migration-kysely-test-plan.md)
- [测试结果汇总](./test-results-summary.md)
- [实施路线图](../../IMPLEMENTATION_ROADMAP_V2.md)

---

## 💡 提示

### Docker快速测试环境

```bash
# 一键启动测试环境 + 运行测试
docker run -d --name test-postgres -e POSTGRES_PASSWORD=postgres -p 5432:5432 postgres:14 && \
sleep 3 && \
./test-staging-complete.sh && \
docker rm -f test-postgres
```

### CI/CD集成

```yaml
# .github/workflows/test.yml 示例
services:
  postgres:
    image: postgres:14
    env:
      POSTGRES_PASSWORD: postgres
    ports:
      - 5432:5432
    options: >-
      --health-cmd pg_isready
      --health-interval 10s
      --health-timeout 5s
      --health-retries 5

steps:
  - name: Run PostgreSQL tests
    run: ./test-staging-complete.sh
```

---

**文档版本**: v1.0  
**最后更新**: 2025-10-14  
**维护人**: Cascade AI
