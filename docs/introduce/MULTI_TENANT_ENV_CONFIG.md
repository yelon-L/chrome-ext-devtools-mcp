# Multi-Tenant 模式环境变量配置

**文档版本**: v1.0  
**更新时间**: 2025-10-16

---

## 📋 概述

Multi-Tenant 模式支持通过 `.env` 文件或系统环境变量进行配置。

### 配置优先级

1. **系统环境变量** - 最高优先级
2. **`.env` 文件** - 如果系统环境变量不存在，则使用
3. **代码默认值** - 如果以上都不存在，使用内置默认值

---

## 🚀 快速开始

### 1. 创建 .env 文件

在项目根目录创建 `.env` 文件：

```bash
# 复制示例文件
cp .env.example .env

# 编辑配置
vi .env
```

### 2. 基础配置（JSONL 模式）

```bash
# 存储类型（文件存储）
STORAGE_TYPE=jsonl

# 数据目录
DATA_DIR=./.mcp-data

# 服务器端口
PORT=32122
```

### 3. 生产配置（PostgreSQL 模式）

```bash
# 存储类型（数据库存储）
STORAGE_TYPE=postgresql

# 数据库连接
DB_HOST=192.168.0.205
DB_PORT=5432
DB_NAME=mcp_extdebug
DB_USER=admin
DB_PASSWORD=your_secure_password

# 安全配置
ALLOWED_IPS=192.168.1.0/24,10.0.0.*
ALLOWED_ORIGINS=https://your-domain.com

# 环境
NODE_ENV=production
```

### 4. 启动服务

```bash
# 自动加载 .env 文件
node build/src/multi-tenant/server-multi-tenant.js
```

---

## ⚙️ 配置项详解

### 存储配置

#### STORAGE_TYPE

**说明**: 选择存储后端  
**类型**: `jsonl` | `postgresql`  
**默认值**: `jsonl`  
**推荐**:
- 开发/测试: `jsonl`
- 生产环境: `postgresql`

```bash
STORAGE_TYPE=jsonl
```

#### JSONL 文件存储配置

仅在 `STORAGE_TYPE=jsonl` 时生效：

| 配置项 | 说明 | 默认值 |
|--------|------|--------|
| `DATA_DIR` | 数据存储目录 | `./.mcp-data` |
| `LOG_FILE_NAME` | 日志文件名 | `store-v2.jsonl` |
| `SNAPSHOT_THRESHOLD` | 快照阈值 | `10000` |
| `AUTO_COMPACTION` | 自动压缩 | `true` |

**示例**:
```bash
DATA_DIR=/var/lib/mcp-data
LOG_FILE_NAME=production.jsonl
SNAPSHOT_THRESHOLD=5000
AUTO_COMPACTION=true
```

#### PostgreSQL 数据库配置

仅在 `STORAGE_TYPE=postgresql` 时生效：

| 配置项 | 说明 | 默认值 |
|--------|------|--------|
| `DB_HOST` | 数据库地址 | `192.168.0.205` |
| `DB_PORT` | 数据库端口 | `5432` |
| `DB_NAME` | 数据库名称 | `mcp_extdebug` |
| `DB_USER` | 用户名 | `admin` |
| `DB_PASSWORD` | 密码 | `admin` |
| `DB_MAX_CONNECTIONS` | 最大连接数 | `20` |
| `DB_IDLE_TIMEOUT` | 空闲超时（毫秒）| `30000` |

**示例**:
```bash
DB_HOST=localhost
DB_PORT=5432
DB_NAME=mcp_production
DB_USER=mcp_user
DB_PASSWORD=secure_password_here
DB_MAX_CONNECTIONS=50
DB_IDLE_TIMEOUT=60000
```

---

### 服务器配置

#### PORT

**说明**: HTTP 服务器监听端口  
**类型**: 整数  
**默认值**: `32122`

```bash
PORT=32122
```

---

### 会话配置

| 配置项 | 说明 | 默认值 | 单位 |
|--------|------|--------|------|
| `SESSION_TIMEOUT` | 会话超时时间 | `3600000` | 毫秒 (1小时) |
| `SESSION_CLEANUP_INTERVAL` | 清理间隔 | `60000` | 毫秒 (1分钟) |
| `MAX_SESSIONS` | 最大会话数 | 无限制 | 数量 |

**示例**:
```bash
# 30 分钟超时
SESSION_TIMEOUT=1800000

# 每 5 分钟清理一次
SESSION_CLEANUP_INTERVAL=300000

# 限制最多 100 个会话
MAX_SESSIONS=100
```

---

### 浏览器连接池配置

| 配置项 | 说明 | 默认值 | 单位 |
|--------|------|--------|------|
| `BROWSER_HEALTH_CHECK_INTERVAL` | 健康检查间隔 | `30000` | 毫秒 |
| `MAX_RECONNECT_ATTEMPTS` | 最大重连次数 | `3` | 次 |
| `RECONNECT_DELAY` | 重连延迟 | `5000` | 毫秒 |
| `CONNECTION_TIMEOUT` | 连接超时 | `30000` | 毫秒 |
| `BROWSER_DETECTION_TIMEOUT` | 检测超时 | `3000` | 毫秒 |

**示例**:
```bash
# 每 1 分钟检查一次浏览器健康状态
BROWSER_HEALTH_CHECK_INTERVAL=60000

# 最多尝试重连 5 次
MAX_RECONNECT_ATTEMPTS=5

# 重连延迟 10 秒
RECONNECT_DELAY=10000
```

---

### 性能配置

| 配置项 | 说明 | 默认值 |
|--------|------|--------|
| `API_CACHE_TTL` | API 缓存 TTL（毫秒）| `30000` |
| `API_CACHE_MAX_SIZE` | 缓存最大条目数 | `500` |
| `MONITOR_BUFFER_SIZE` | 监控缓冲区大小 | `1000` |
| `CONNECTION_TIMES_BUFFER_SIZE` | 连接时间缓冲 | `100` |

**示例**:
```bash
# 1 分钟缓存
API_CACHE_TTL=60000

# 最多缓存 1000 个条目
API_CACHE_MAX_SIZE=1000
```

---

### 安全配置

#### ALLOWED_IPS

**说明**: IP 白名单，限制哪些 IP 可以访问服务  
**格式**: 逗号分隔，支持 CIDR 和通配符  
**默认值**: 无（允许所有 IP）

**示例**:
```bash
# 允许本地网络和特定 IP
ALLOWED_IPS=192.168.1.0/24,10.0.0.*,127.0.0.1

# 只允许本地访问
ALLOWED_IPS=127.0.0.1,::1
```

**语法**:
- `192.168.1.100` - 单个 IP
- `192.168.1.0/24` - CIDR 范围
- `10.0.0.*` - 通配符（匹配 10.0.0.0 - 10.0.0.255）
- `2001:db8::/32` - IPv6 CIDR

#### ALLOWED_ORIGINS

**说明**: CORS 允许的来源  
**格式**: 逗号分隔的 URL  
**默认值**: `*`（允许所有来源）

**示例**:
```bash
# 允许特定域名
ALLOWED_ORIGINS=https://app.example.com,https://admin.example.com

# 允许所有来源（开发环境）
ALLOWED_ORIGINS=*
```

---

### 日志配置

#### LOG_LEVEL

**说明**: 日志输出级别  
**类型**: `DEBUG` | `INFO` | `WARN` | `ERROR`  
**默认值**: `INFO`

```bash
# 开发环境：详细日志
LOG_LEVEL=DEBUG

# 生产环境：关键信息
LOG_LEVEL=WARN
```

#### ERROR_VERBOSITY

**说明**: 错误消息详细程度  
**类型**: `minimal` | `standard` | `verbose`  
**默认值**: 根据 `NODE_ENV` 自动选择

```bash
# 开发环境：完整技术细节
ERROR_VERBOSITY=verbose

# 生产环境：用户友好消息
ERROR_VERBOSITY=minimal
```

---

### 实验性功能

⚠️ **警告**: 不建议在生产环境启用

| 配置项 | 说明 | 默认值 |
|--------|------|--------|
| `USE_CDP_HYBRID` | CDP 混合架构 | `false` |
| `USE_CDP_OPERATIONS` | CDP 操作 | `false` |

```bash
# 启用实验性功能（仅开发环境）
USE_CDP_HYBRID=true
USE_CDP_OPERATIONS=true
```

---

## 📦 配置示例

### 开发环境

```bash
# .env.development

# 环境
NODE_ENV=development

# 存储（文件）
STORAGE_TYPE=jsonl
DATA_DIR=./.mcp-data-dev

# 服务器
PORT=32122

# 日志
LOG_LEVEL=DEBUG
ERROR_VERBOSITY=verbose

# 安全（开发环境允许所有访问）
ALLOWED_ORIGINS=*
```

### 生产环境

```bash
# .env.production

# 环境
NODE_ENV=production

# 存储（数据库）
STORAGE_TYPE=postgresql
DB_HOST=db.production.internal
DB_PORT=5432
DB_NAME=mcp_production
DB_USER=mcp_app
DB_PASSWORD=your_strong_password_here
DB_MAX_CONNECTIONS=50

# 服务器
PORT=32122

# 会话
SESSION_TIMEOUT=1800000
MAX_SESSIONS=500

# 安全
ALLOWED_IPS=10.0.0.0/8,172.16.0.0/12
ALLOWED_ORIGINS=https://app.example.com

# 日志
LOG_LEVEL=WARN
ERROR_VERBOSITY=minimal

# 性能
API_CACHE_TTL=60000
API_CACHE_MAX_SIZE=1000
```

### 测试环境

```bash
# .env.test

STORAGE_TYPE=jsonl
DATA_DIR=./.mcp-data-test
PORT=32123
LOG_LEVEL=INFO
```

---

## 🔧 使用方法

### 方式 1: .env 文件（推荐）

```bash
# 1. 创建 .env 文件
cp .env.example .env

# 2. 编辑配置
vi .env

# 3. 启动服务（自动加载 .env）
node build/src/multi-tenant/server-multi-tenant.js
```

### 方式 2: 系统环境变量

```bash
# 设置环境变量
export STORAGE_TYPE=postgresql
export DB_HOST=localhost
export PORT=32122

# 启动服务
node build/src/multi-tenant/server-multi-tenant.js
```

### 方式 3: 组合使用

```bash
# .env 文件中设置默认配置
STORAGE_TYPE=jsonl
PORT=32122

# 运行时覆盖特定配置
PORT=8080 node build/src/multi-tenant/server-multi-tenant.js
```

**优先级**: 命令行环境变量 > .env 文件 > 默认值

---

## ✅ 验证配置

启动服务时，会输出当前配置：

```
✅ Loaded environment variables from: /path/to/.env
💾 Storage type: postgresql
🐘 Initializing PostgreSQL storage...
   Host: db.production.internal:5432
   Database: mcp_production
🔒 IP whitelist enabled (2 rules):
   - CIDR: 10.0.0.0/8
   - CIDR: 172.16.0.0/12
```

---

## 🛡️ 安全建议

### 1. 保护敏感信息

```bash
# ❌ 不要提交 .env 到版本控制
echo ".env" >> .gitignore

# ✅ 只提交 .env.example
git add .env.example
```

### 2. 使用强密码

```bash
# ❌ 弱密码
DB_PASSWORD=admin

# ✅ 强密码
DB_PASSWORD=Xy9$mK2#pL8@nQ5&wR3!
```

### 3. 限制 IP 访问

```bash
# ❌ 开放所有 IP（生产环境）
# ALLOWED_IPS=

# ✅ 限制特定网络
ALLOWED_IPS=10.0.0.0/8,172.16.0.0/12
```

### 4. 使用 HTTPS（生产环境）

```bash
ALLOWED_ORIGINS=https://app.example.com
```

---

## 📚 相关文档

- [Multi-Tenant 模式指南](./MULTI_TENANT_GUIDE.md)
- [存储配置](./STORAGE_CONFIGURATION.md)
- [安全最佳实践](./SECURITY_BEST_PRACTICES.md)

---

**文档完成**: 2025-10-16  
**维护者**: Chrome Extension Debug MCP Team

