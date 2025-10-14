# 数据库配置指南

**版本**: v0.8.10  
**更新日期**: 2025-10-14

## 📋 概述

多租户服务器支持两种存储后端：
1. **JSONL 文件存储**（默认）- 简单、无需配置
2. **PostgreSQL 数据库** - 高性能、支持大规模部署

## 🗄️ 存储后端对比

| 特性 | JSONL 文件 | PostgreSQL |
|------|-----------|-----------|
| 配置难度 | ⭐ 简单 | ⭐⭐⭐ 中等 |
| 性能 | 中等（<1000用户） | 高（>1000用户） |
| 扩展性 | 受限于单机 | 支持集群 |
| 备份 | 复制文件 | SQL 导出 |
| 查询能力 | 受限 | SQL 全功能 |
| 推荐场景 | 开发/小团队 | 生产/大规模 |

## 📦 JSONL 文件存储（默认）

### 配置

默认不需要任何配置，数据存储在：
```
.mcp-data/store-v2.jsonl
```

### 环境变量

```bash
# 可选：自定义数据目录
STORAGE_TYPE=jsonl
DATA_DIR=./.mcp-data
```

### 优点

- ✅ 零配置
- ✅ 易于备份（复制文件）
- ✅ 易于迁移
- ✅ 易于调试（文本格式）

### 缺点

- ❌ 大数据量性能下降
- ❌ 并发写入性能受限
- ❌ 查询功能受限

## 🐘 PostgreSQL 数据库

### 前置条件

1. PostgreSQL 服务器（v12+）
2. Node.js pg 驱动（已包含在依赖中）

### 安装 PostgreSQL

#### Ubuntu/Debian
```bash
sudo apt update
sudo apt install postgresql postgresql-contrib
sudo systemctl start postgresql
sudo systemctl enable postgresql
```

#### CentOS/RHEL
```bash
sudo yum install postgresql-server postgresql-contrib
sudo postgresql-setup initdb
sudo systemctl start postgresql
sudo systemctl enable postgresql
```

#### macOS
```bash
brew install postgresql
brew services start postgresql
```

#### Docker
```bash
docker run -d \
  --name mcp-postgres \
  -e POSTGRES_PASSWORD=admin \
  -e POSTGRES_USER=admin \
  -e POSTGRES_DB=mcp_devtools \
  -p 5432:5432 \
  postgres:15
```

### 数据库配置

#### 1. 创建数据库和用户

```sql
-- 连接到 PostgreSQL
psql -U postgres

-- 创建数据库
CREATE DATABASE mcp_devtools;

-- 创建用户
CREATE USER mcp_admin WITH PASSWORD 'your_secure_password';

-- 授权
GRANT ALL PRIVILEGES ON DATABASE mcp_devtools TO mcp_admin;

-- 退出
\q
```

#### 2. 配置环境变量

创建 `.env` 文件或设置环境变量：

```bash
# 存储类型
STORAGE_TYPE=postgresql

# PostgreSQL 配置
DB_HOST=localhost
DB_PORT=5432
DB_NAME=mcp_devtools
DB_USER=mcp_admin
DB_PASSWORD=your_secure_password

# 连接池配置（可选）
DB_MAX_CONNECTIONS=10
DB_IDLE_TIMEOUT=30000
DB_CONNECTION_TIMEOUT=5000
```

#### 3. 启动服务器

```bash
# 服务器会自动创建表
node build/src/multi-tenant/server-multi-tenant.js
```

### 表结构

服务器会自动创建以下表：

#### mcp_users 表

```sql
CREATE TABLE mcp_users (
  user_id VARCHAR(255) PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  username VARCHAR(255) NOT NULL,
  registered_at BIGINT NOT NULL,
  updated_at BIGINT,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_email ON mcp_users(email);
```

#### mcp_browsers 表

```sql
CREATE TABLE mcp_browsers (
  browser_id UUID PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL,
  browser_url VARCHAR(1024) NOT NULL,
  token_name VARCHAR(255) NOT NULL,
  token VARCHAR(255) UNIQUE NOT NULL,
  created_at_ts BIGINT NOT NULL,
  last_connected_at BIGINT,
  tool_call_count INTEGER DEFAULT 0,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES mcp_users(user_id) ON DELETE CASCADE
);

CREATE INDEX idx_token ON mcp_browsers(token);
CREATE INDEX idx_user_id ON mcp_browsers(user_id);
```

### 性能优化

#### 1. 索引优化

```sql
-- 如果经常按最后连接时间查询
CREATE INDEX idx_last_connected ON mcp_browsers(last_connected_at DESC);

-- 如果经常按注册时间查询
CREATE INDEX idx_registered_at ON mcp_users(registered_at DESC);
```

#### 2. 连接池调优

```bash
# 增加最大连接数（生产环境）
DB_MAX_CONNECTIONS=20

# 减少空闲超时（低流量）
DB_IDLE_TIMEOUT=60000
```

#### 3. PostgreSQL 配置

编辑 `postgresql.conf`:

```ini
# 最大连接数
max_connections = 100

# 共享缓冲区（推荐：系统内存的 25%）
shared_buffers = 256MB

# 工作内存
work_mem = 4MB

# 维护工作内存
maintenance_work_mem = 64MB
```

重启 PostgreSQL:
```bash
sudo systemctl restart postgresql
```

## 🔄 数据迁移

### 从 JSONL 迁移到 PostgreSQL

创建迁移脚本 `migrate-to-postgres.js`:

```javascript
import fs from 'fs';
import pg from 'pg';

const {Pool} = pg;

async function migrate() {
  // 1. 连接数据库
  const pool = new Pool({
    host: 'localhost',
    port: 5432,
    database: 'mcp_devtools',
    user: 'mcp_admin',
    password: 'your_password',
  });

  // 2. 读取 JSONL 文件
  const data = fs.readFileSync('.mcp-data/store-v2.jsonl', 'utf8');
  const lines = data.split('\n').filter(line => line.trim());

  // 3. 解析和导入
  for (const line of lines) {
    const op = JSON.parse(line);

    try {
      if (op.op === 'register_user') {
        await pool.query(
          `INSERT INTO mcp_users (user_id, email, username, registered_at, updated_at, metadata)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (user_id) DO NOTHING`,
          [
            op.data.userId,
            op.data.email,
            op.data.username,
            op.data.registeredAt,
            op.data.updatedAt || null,
            JSON.stringify(op.data.metadata || {}),
          ]
        );
      } else if (op.op === 'bind_browser') {
        await pool.query(
          `INSERT INTO mcp_browsers (browser_id, user_id, browser_url, token_name, token, created_at_ts, last_connected_at, tool_call_count, metadata)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           ON CONFLICT (browser_id) DO NOTHING`,
          [
            op.data.browserId,
            op.data.userId,
            op.data.browserURL,
            op.data.tokenName,
            op.data.token,
            op.data.createdAt,
            op.data.lastConnectedAt || null,
            op.data.toolCallCount || 0,
            JSON.stringify(op.data.metadata || {}),
          ]
        );
      }
    } catch (error) {
      console.error(`Failed to import: ${error.message}`);
    }
  }

  console.log('Migration completed!');
  await pool.end();
}

migrate().catch(console.error);
```

运行迁移:
```bash
node migrate-to-postgres.js
```

### 从 PostgreSQL 导出到 JSONL

```bash
# 导出用户
psql -U mcp_admin -d mcp_devtools -t -A -F"," \
  -c "SELECT user_id, email, username, registered_at FROM mcp_users" \
  > users.csv

# 导出浏览器
psql -U mcp_admin -d mcp_devtools -t -A -F"," \
  -c "SELECT browser_id, user_id, browser_url, token_name, token FROM mcp_browsers" \
  > browsers.csv
```

## 🔐 安全最佳实践

### 1. 数据库用户权限

```sql
-- 创建只读用户（用于监控）
CREATE USER mcp_readonly WITH PASSWORD 'readonly_password';
GRANT CONNECT ON DATABASE mcp_devtools TO mcp_readonly;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO mcp_readonly;
```

### 2. SSL 连接

在 `postgresql.conf` 中启用 SSL:
```ini
ssl = on
ssl_cert_file = 'server.crt'
ssl_key_file = 'server.key'
```

客户端配置:
```bash
DB_SSL=true
DB_SSL_REJECT_UNAUTHORIZED=true
```

### 3. 防火墙规则

```bash
# 只允许应用服务器访问
sudo ufw allow from 192.168.1.100 to any port 5432
```

### 4. 定期备份

```bash
# 每日备份
0 2 * * * pg_dump -U mcp_admin mcp_devtools > /backup/mcp_$(date +\%Y\%m\%d).sql
```

## 📊 监控和维护

### 查看连接数

```sql
SELECT count(*) FROM pg_stat_activity 
WHERE datname = 'mcp_devtools';
```

### 查看表大小

```sql
SELECT 
  relname AS table_name,
  pg_size_pretty(pg_total_relation_size(relid)) AS total_size
FROM pg_catalog.pg_statio_user_tables
ORDER BY pg_total_relation_size(relid) DESC;
```

### 查看慢查询

```sql
SELECT 
  query,
  calls,
  total_time,
  mean_time
FROM pg_stat_statements
ORDER BY mean_time DESC
LIMIT 10;
```

### 清理旧数据

```sql
-- 删除30天前的未使用浏览器
DELETE FROM mcp_browsers 
WHERE last_connected_at < EXTRACT(EPOCH FROM NOW() - INTERVAL '30 days') * 1000;

-- 真空清理
VACUUM ANALYZE;
```

## 🐛 故障排查

### 连接失败

```bash
# 测试连接
psql -h localhost -U mcp_admin -d mcp_devtools

# 检查 PostgreSQL 是否运行
sudo systemctl status postgresql

# 查看日志
sudo tail -f /var/log/postgresql/postgresql-*.log
```

### 权限问题

```sql
-- 检查用户权限
\du mcp_admin

-- 重新授权
GRANT ALL PRIVILEGES ON DATABASE mcp_devtools TO mcp_admin;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO mcp_admin;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO mcp_admin;
```

### 性能问题

```sql
-- 检查未使用的索引
SELECT schemaname, tablename, indexname
FROM pg_stat_user_indexes
WHERE idx_scan = 0;

-- 检查表膨胀
SELECT schemaname, tablename, 
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
FROM pg_tables
WHERE schemaname = 'public';
```

## 📚 相关文档

- [多租户部署指南](./MULTI_TENANT_DEPLOYMENT_GUIDE.md)
- [PostgreSQL 官方文档](https://www.postgresql.org/docs/)
- [pg Node.js 驱动文档](https://node-postgres.com/)

---

**文档版本**: v1.0  
**最后更新**: 2025-10-14
