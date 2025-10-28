# 数据库迁移文件

此目录包含PostgreSQL数据库的迁移文件。

## 文件命名规范

格式: `{version}-{description}.sql`

示例:

- `001-initial-schema.sql` - 初始Schema
- `002-add-phone-number.sql` - 添加phone_number字段
- `003-add-user-role.sql` - 添加user_role字段

## 迁移文件结构

每个迁移文件应包含：

1. 元数据注释（版本号、日期、描述）
2. UP迁移（应用变更）
3. DOWN迁移（回滚变更，可选）

## 如何使用

### 应用迁移

```bash
npm run migrate:up
```

### 回滚迁移

```bash
npm run migrate:down
```

### 查看迁移状态

```bash
npm run migrate:status
```

## 最佳实践

1. **每个迁移只做一件事**: 每个迁移文件应该只包含一个逻辑变更
2. **可回滚**: 尽量提供DOWN迁移
3. **幂等性**: 迁移应该可以多次执行而不出错（使用IF NOT EXISTS等）
4. **测试**: 在开发环境测试迁移后再应用到生产环境
5. **备份**: 生产环境应用迁移前务必备份数据库

## 迁移历史

| 版本 | 日期       | 描述                           | 作者       |
| ---- | ---------- | ------------------------------ | ---------- |
| 001  | 2025-10-14 | 初始Schema（用户表、浏览器表） | Cascade AI |
