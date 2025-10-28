# 数据库模式自动化管理方案调研

## 📋 调研背景

### 当前痛点

随着业务增长，数据库表结构变化频繁，存在以下问题：

1. **手动同步负担重**：Schema 变更后需手动更新 TypeScript 类型定义
2. **序列化/反序列化重复劳动**：每次表结构变化都需手动编写映射代码
3. **类型安全风险**：手动维护容易导致数据库与代码类型不一致
4. **业务开发效率低**：过多精力花在基础设施维护上

### 当前技术栈

- **数据库**: PostgreSQL
- **查询构建器**: Kysely（类型安全 SQL builder）
- **迁移工具**: node-pg-migrate
- **类型定义**: 手动维护 `schema.ts`

---

## 🎯 解决方案对比

### 方案 1: Schema-First + 代码生成（推荐）

#### 核心理念

以数据库 Schema 为唯一真实来源（Single Source of Truth），自动生成 TypeScript 类型和序列化代码。

#### 实现方案

##### 1.1 Kysely Codegen（最佳匹配当前技术栈）

**技术栈**: `kysely-codegen`

**工作流程**:

```bash
# 1. 编写迁移文件
migrations/002-add-products.sql

# 2. 运行迁移
npm run migrate:up

# 3. 自动生成类型
npx kysely-codegen --out-file src/multi-tenant/storage/schema.ts
```

**优势**:

- ✅ 与当前 Kysely 技术栈完美集成，零学习成本
- ✅ 直接从数据库反射生成类型，100% 准确
- ✅ 支持 JSONB、枚举、复合类型等 PostgreSQL 特性
- ✅ 轻量级，无额外依赖
- ✅ 可集成到 CI/CD 自动化流程

**局限性**:

- ⚠️ 仅生成类型，序列化逻辑仍需手写（但可用工具辅助）
- ⚠️ 需数据库连接生成

**示例配置** (`package.json`):

```json
{
  "scripts": {
    "migrate:up": "npm run migrate up",
    "codegen": "kysely-codegen --out-file src/multi-tenant/storage/schema.ts",
    "db:sync": "npm run migrate:up && npm run codegen"
  },
  "devDependencies": {
    "kysely-codegen": "^0.17.0"
  }
}
```

**生成的类型示例**:

```typescript
// 自动生成 src/multi-tenant/storage/schema.ts
export interface Database {
  mcp_users: UsersTable;
  mcp_browsers: BrowsersTable;
  mcp_products: ProductsTable; // 新表自动添加
}

export interface ProductsTable {
  product_id: Generated<number>;
  name: string;
  price: number;
  metadata: ColumnType<any, string, string>;
  created_at: Generated<Date>;
}
```

---

##### 1.2 Prisma（完整解决方案）

**技术栈**: Prisma ORM + Prisma Migrate

**工作流程**:

```prisma
// schema.prisma (唯一Schema定义)
model User {
  userId       String    @id @map("user_id")
  email        String    @unique
  username     String
  registeredAt BigInt    @map("registered_at")
  metadata     Json?
  browsers     Browser[]

  @@map("mcp_users")
}

model Browser {
  browserId       String   @id @map("browser_id")
  userId          String   @map("user_id")
  browserUrl      String   @map("browser_url")
  toolCallCount   Int      @default(0) @map("tool_call_count")
  user            User     @relation(fields: [userId], references: [userId])

  @@map("mcp_browsers")
}
```

**优势**:

- ✅ 自动生成迁移 + TypeScript 类型 + 查询客户端
- ✅ 强大的关系管理和查询 API
- ✅ 内置序列化/反序列化，完全自动化
- ✅ 优秀的开发者体验（VS Code 插件、文档）
- ✅ 自动处理数据库连接池、事务管理

**局限性**:

- ⚠️ **架构变更大**：需替换 Kysely 和 node-pg-migrate
- ⚠️ 查询 API 与 SQL 差异较大，学习成本高
- ⚠️ 复杂 SQL（窗口函数、CTE）需用 `$queryRaw`

**迁移成本**: 中高（需重写数据访问层）

---

##### 1.3 Drizzle ORM（新兴方案）

**技术栈**: Drizzle ORM + Drizzle Kit

**Schema 定义**:

```typescript
// schema.ts
import {pgTable, varchar, bigint, jsonb} from 'drizzle-orm/pg-core';

export const mcpUsers = pgTable('mcp_users', {
  userId: varchar('user_id', {length: 255}).primaryKey(),
  email: varchar('email', {length: 255}).unique().notNull(),
  username: varchar('username', {length: 255}).notNull(),
  registeredAt: bigint('registered_at', {mode: 'number'}).notNull(),
  metadata: jsonb('metadata'),
});
```

**优势**:

- ✅ TypeScript-first，类型推断极强
- ✅ SQL-like API，接近原生 SQL
- ✅ 自动生成迁移
- ✅ 性能优于 Prisma（更接近原生 SQL）
- ✅ 支持边缘运行时（Cloudflare Workers）

**局限性**:

- ⚠️ 生态较新，社区和工具链不如 Prisma 成熟
- ⚠️ 仍需替换现有 Kysely 代码

---

### 方案 2: Code-First + Schema 生成

#### 核心理念

在代码中定义 Schema，自动生成迁移文件和数据库表。

##### 2.1 TypeORM

**Schema 定义**:

```typescript
@Entity('mcp_users')
export class User {
  @PrimaryColumn({name: 'user_id'})
  userId: string;

  @Column({unique: true})
  email: string;

  @Column()
  username: string;

  @Column({type: 'bigint', name: 'registered_at'})
  registeredAt: number;

  @Column({type: 'jsonb', nullable: true})
  metadata?: any;

  @OneToMany(() => Browser, browser => browser.user)
  browsers: Browser[];
}
```

**优势**:

- ✅ 类型定义即 Schema，无需额外维护
- ✅ 自动生成迁移
- ✅ 成熟的 ORM，生态完善

**局限性**:

- ⚠️ 装饰器语法较重，影响代码可读性
- ⚠️ 性能开销（ORM 抽象层）
- ⚠️ 复杂查询支持不如 Prisma
- ⚠️ 架构变更成本高

---

### 方案 3: 混合方案（Schema-First + 工具链）

#### 核心理念

保留现有架构，通过工具链增强自动化。

##### 3.1 当前架构 + Kysely Codegen + 自定义工具

**工作流程**:

```bash
# 1. 编写迁移文件（手动）
migrations/003-add-orders-table.sql

# 2. 运行迁移
npm run migrate:up

# 3. 自动生成 TypeScript 类型
npm run codegen

# 4. 自动生成序列化代码（自定义脚本）
npm run generate-mappers
```

**自定义工具示例**:

```typescript
// scripts/generate-mappers.ts
// 读取 schema.ts，生成 mappers
function generateMapper(tableName: string, schema: TableSchema) {
  return `
export function map${pascalCase(tableName)}Row(row: any): ${capitalizeTableType(tableName)} {
  return {
    ${schema.columns
      .map(col => `${col.jsName}: ${convertColumn(col, 'row')}`)
      .join(',\n    ')}
  };
}`;
}
```

**优势**:

- ✅ 零架构变更，渐进式改进
- ✅ 完全掌控工具链，可定制
- ✅ 保留 Kysely 的灵活性

**局限性**:

- ⚠️ 需维护自定义工具
- ⚠️ 自动化程度取决于投入

---

## 📊 方案对比矩阵

| 维度             | Kysely Codegen  | Prisma          | Drizzle         | TypeORM     | 当前手动   |
| ---------------- | --------------- | --------------- | --------------- | ----------- | ---------- |
| **集成成本**     | ⭐⭐⭐⭐⭐ 极低 | ⭐⭐ 高         | ⭐⭐⭐ 中       | ⭐⭐ 高     | ⭐⭐⭐⭐⭐ |
| **自动化程度**   | ⭐⭐⭐⭐ 高     | ⭐⭐⭐⭐⭐ 极高 | ⭐⭐⭐⭐⭐ 极高 | ⭐⭐⭐⭐ 高 | ⭐ 低      |
| **类型安全**     | ⭐⭐⭐⭐⭐      | ⭐⭐⭐⭐⭐      | ⭐⭐⭐⭐⭐      | ⭐⭐⭐⭐    | ⭐⭐⭐     |
| **性能**         | ⭐⭐⭐⭐⭐      | ⭐⭐⭐⭐        | ⭐⭐⭐⭐⭐      | ⭐⭐⭐      | ⭐⭐⭐⭐⭐ |
| **学习曲线**     | ⭐⭐⭐⭐⭐ 平滑 | ⭐⭐⭐ 中等     | ⭐⭐⭐⭐ 较低   | ⭐⭐⭐ 中等 | N/A        |
| **生态成熟度**   | ⭐⭐⭐⭐        | ⭐⭐⭐⭐⭐      | ⭐⭐⭐          | ⭐⭐⭐⭐    | N/A        |
| **复杂查询支持** | ⭐⭐⭐⭐⭐      | ⭐⭐⭐⭐        | ⭐⭐⭐⭐⭐      | ⭐⭐⭐      | ⭐⭐⭐⭐⭐ |

---

## 🚀 推荐方案

### 短期方案（1-2周）：Kysely Codegen

**理由**:

1. **零架构变更**：完全兼容现有 Kysely + node-pg-migrate
2. **立即见效**：1小时内集成，消除手动维护 `schema.ts` 的负担
3. **风险最低**：仅增加构建步骤，不影响运行时

**实施步骤**:

```bash
# 1. 安装依赖
npm install --save-dev kysely-codegen

# 2. 配置环境变量
# .env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/extdebugdb

# 3. 添加脚本
# package.json
{
  "scripts": {
    "codegen": "kysely-codegen --dialect=postgres --out-file=src/multi-tenant/storage/schema.ts",
    "db:sync": "npm run migrate:up && npm run codegen"
  }
}

# 4. 首次运行
npm run codegen

# 5. 验证生成的类型
git diff src/multi-tenant/storage/schema.ts
```

**配置 `.kyselyrc.json`**:

```json
{
  "dialectName": "postgres",
  "connectionString": "$DATABASE_URL",
  "outFile": "src/multi-tenant/storage/schema.ts",
  "camelCase": true,
  "includePattern": "mcp_*",
  "excludePattern": "pgmigrations"
}
```

---

### 中期方案（1-2月）：序列化代码生成

**问题**:
Kysely Codegen 只解决类型问题，仍需手写 `mapUserRow`、`mapBrowserRow` 等映射函数。

**解决方案**: 自定义代码生成脚本

**实现示例**:

```typescript
// scripts/generate-mappers.ts
import {readFileSync, writeFileSync} from 'fs';
import {parse} from 'typescript';

// 解析 schema.ts，提取表定义
const schemaContent = readFileSync(
  'src/multi-tenant/storage/schema.ts',
  'utf-8',
);
const tables = parseTableInterfaces(schemaContent);

// 生成 mapper 函数
const mapperCode = tables
  .map(
    table => `
export function map${table.name}Row(row: any): ${table.typeName} {
  return {
    ${table.columns.map(col => `${col.tsName}: ${generateConverter(col)}`).join(',\n    ')}
  };
}
`,
  )
  .join('\n');

// 写入文件
writeFileSync('src/multi-tenant/storage/mappers.generated.ts', mapperCode);
```

**集成到工作流**:

```json
{
  "scripts": {
    "codegen": "kysely-codegen",
    "generate-mappers": "node --experimental-strip-types scripts/generate-mappers.ts",
    "db:sync": "npm run migrate:up && npm run codegen && npm run generate-mappers"
  }
}
```

---

### 长期方案（3-6月）：评估完整 ORM 迁移

**时机**: 当业务复杂度达到阈值时

**决策指标**:

- 表数量 > 20
- 频繁需要复杂关联查询
- 团队对 SQL 不够熟悉
- 需要多数据库支持

**推荐**: **Drizzle ORM**

**理由**:

1. 性能接近 Kysely，远超 Prisma
2. TypeScript 优先，类型推断极强
3. SQL-like API，迁移成本低于 Prisma
4. 支持边缘运行时（未来可能需要）

**迁移策略**:

```typescript
// 渐进式迁移
// 第一步：新功能用 Drizzle
import {drizzle} from 'drizzle-orm/node-postgres';
import {mcpProducts} from './drizzle-schema';

export class ProductService {
  constructor(private db: ReturnType<typeof drizzle>) {}

  async createProduct(data: NewProduct) {
    return this.db.insert(mcpProducts).values(data).returning();
  }
}

// 第二步：重写现有模块（按优先级）
// 1. 最频繁修改的模块
// 2. 查询最复杂的模块
// 3. 性能瓶颈模块
```

---

## 🛠️ 实施路线图

### Phase 1: 类型自动化（Week 1-2）

- [ ] 集成 `kysely-codegen`
- [ ] 配置 CI/CD 自动运行 codegen
- [ ] 添加类型校验到 pre-commit hook
- [ ] 文档更新：开发者指南

### Phase 2: 序列化自动化（Week 3-6）

- [ ] 开发 mapper 代码生成脚本
- [ ] 重构现有 `PostgreSQLStorageAdapter`
- [ ] 单元测试覆盖
- [ ] 性能基准测试

### Phase 3: 迁移系统增强（Week 7-10）

- [ ] 支持 DOWN 迁移自动生成
- [ ] 迁移文件模板工具
- [ ] 数据库版本检查中间件
- [ ] 迁移回滚策略文档

### Phase 4: ORM 评估（Month 3-6）

- [ ] 业务复杂度评估
- [ ] Drizzle ORM POC
- [ ] 性能对比测试
- [ ] 迁移成本分析
- [ ] Go/No-Go 决策

---

## 📝 最佳实践

### 1. 迁移文件规范

```sql
-- Migration: 002-add-products-table
-- Date: 2025-10-15
-- Author: @developer
-- Issue: #123

-- ============================================================================
-- UP Migration
-- ============================================================================

CREATE TABLE mcp_products (
  product_id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  price DECIMAL(10, 2) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_product_name ON mcp_products(name);

-- ============================================================================
-- DOWN Migration (for rollback)
-- ============================================================================

-- DROP INDEX IF EXISTS idx_product_name;
-- DROP TABLE IF EXISTS mcp_products;
```

### 2. CI/CD 集成

```yaml
# .github/workflows/database-check.yml
name: Database Schema Check

on: [pull_request]

jobs:
  schema-validation:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Setup PostgreSQL
        uses: ikalnytskyi/action-setup-postgres@v4

      - name: Run migrations
        run: npm run migrate:up

      - name: Generate types
        run: npm run codegen

      - name: Check for uncommitted changes
        run: |
          git diff --exit-code src/multi-tenant/storage/schema.ts || \
          (echo "❌ Schema types out of sync! Run 'npm run codegen'" && exit 1)
```

### 3. 开发工作流

```bash
# 新增表结构
1. 创建迁移文件: migrations/003-add-feature.sql
2. 本地测试迁移: npm run migrate:up
3. 生成类型: npm run codegen
4. 更新 mappers: npm run generate-mappers
5. 实现业务逻辑
6. 提交代码（schema.ts 也要提交）
```

---

## 🎯 总结

### 立即行动

1. **今天**：集成 `kysely-codegen`，消除手动维护 schema.ts
2. **本周**：配置 CI/CD 自动检查类型同步
3. **本月**：开发 mapper 代码生成，实现 90% 自动化

### 关键收益

- ⚡ **开发效率**: 表结构变更从 30 分钟降至 3 分钟
- 🛡️ **类型安全**: 编译时即可发现不匹配，减少 runtime 错误
- 🎯 **专注业务**: 团队精力从基础设施转向业务价值

### 风险缓解

- 渐进式集成，不影响现有功能
- 每个阶段都有回退方案
- 充分测试覆盖

---

## 📚 参考资料

- [Kysely Documentation](https://kysely.dev/)
- [kysely-codegen](https://github.com/RobinBlomberg/kysely-codegen)
- [Prisma Documentation](https://www.prisma.io/docs)
- [Drizzle ORM](https://orm.drizzle.team/)
- [Database Migration Best Practices](https://www.prisma.io/dataguide/types/relational/migration-strategies)
