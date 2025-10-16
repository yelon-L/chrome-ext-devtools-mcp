# SQL 架构优化计划

**基于**: SQL_ARCHITECTURE_ANALYSIS.md  
**日期**: 2025-10-14  
**版本**: v0.8.10

---

## 📋 建议评估

### ✅ 采纳的建议

#### 1. 添加性能索引（P0 - 高优先级）

**建议**: 为 `last_connected_at` 添加索引

**理由**:
- ✅ 不破坏现有功能
- ✅ 提升查询性能（活跃浏览器查询）
- ✅ 实施成本低
- ✅ 风险极低

**实施**:
```sql
CREATE INDEX IF NOT EXISTS idx_last_connected ON mcp_browsers(last_connected_at DESC);
```

**影响**: 
- 活跃浏览器排序查询性能提升 80%+
- 增加约 1-2% 写入开销（可忽略）

---

#### 2. 增强事务处理（P1 - 中优先级）

**建议**: 在多步操作中使用显式事务

**理由**:
- ✅ 提升数据一致性
- ✅ 防止部分失败
- ✅ 符合数据库最佳实践
- ✅ 不影响现有 API

**实施方法**: 
- `deleteUser`: 包装删除操作
- `updateBrowser`: 批量更新时使用事务
- 复杂的批量操作

**示例**:
```typescript
async deleteUser(userId: string): Promise<void> {
  const client = await this.pool.connect();
  try {
    await client.query('BEGIN');
    
    // 删除用户的浏览器
    await client.query(
      'DELETE FROM mcp_browsers WHERE user_id = $1',
      [userId]
    );
    
    // 删除用户
    await client.query(
      'DELETE FROM mcp_users WHERE user_id = $1',
      [userId]
    );
    
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
```

---

#### 3. 增加 browser_url 长度（P0 - 高优先级）

**建议**: `VARCHAR(1024)` → `VARCHAR(2048)`

**理由**:
- ✅ 某些 URL 可能超过 1024 字符
- ✅ 实施成本极低
- ✅ 不影响性能
- ✅ 向后兼容

**实施**:
```sql
ALTER TABLE mcp_browsers ALTER COLUMN browser_url TYPE VARCHAR(2048);
```

---

#### 4. 改进 JSONL 快照策略（P1 - 中优先级）

**建议**: 双重触发条件（记录数 + 时间）

**理由**:
- ✅ 防止长时间运行但低活跃度时日志过大
- ✅ 兼顾性能和可靠性
- ✅ 不破坏现有功能

**实施**:
```typescript
private snapshotThreshold: number = 1000;  // 记录数阈值
private snapshotTimeThreshold: number = 3600000;  // 1小时
private lastSnapshotTime: number = Date.now();

private shouldTakeSnapshot(): boolean {
  const recordsSinceSnapshot = this.logBuffer.length;
  const timeSinceSnapshot = Date.now() - this.lastSnapshotTime;
  
  return (
    recordsSinceSnapshot >= this.snapshotThreshold ||
    timeSinceSnapshot >= this.snapshotTimeThreshold
  );
}
```

---

### ❌ 不采纳的建议

#### 1. 引入迁移框架（node-pg-migrate）

**建议**: 使用数据库迁移工具

**不采纳理由**:
- ❌ **当前规模不需要**: 表结构相对稳定，变更频率低
- ❌ **增加复杂度**: 引入新的依赖和学习成本
- ❌ **维护成本**: 需要管理迁移文件和版本
- ⚠️ **替代方案**: 使用 SQL 文件 + 文档说明足够

**评估**: 如果未来表结构变更频繁（每月 >2次），再考虑引入

---

#### 2. 时间戳类型变更（BIGINT → TIMESTAMPTZ）

**建议**: 使用 PostgreSQL 原生时间类型

**不采纳理由**:
- ❌ **破坏向后兼容**: JSONL 使用 BIGINT 毫秒时间戳
- ❌ **双存储不一致**: PostgreSQL 和 JSONL 数据格式不同
- ❌ **迁移成本高**: 需要转换所有现有数据
- ✅ **当前方案可行**: BIGINT 毫秒时间戳简单可靠

**评估**: 保持现状，BIGINT 足够使用

---

#### 3. 引入 Query Builder（Kysely）

**建议**: 使用类型安全的查询构建器

**不采纳理由**:
- ❌ **过度工程化**: 当前项目查询相对简单
- ❌ **学习成本**: 团队需要学习新工具
- ❌ **增加依赖**: 额外的 npm 包和维护成本
- ✅ **参数化查询已足够**: 当前方案类型安全且简单

**评估**: 如果查询复杂度大幅增加，再考虑

---

#### 4. user_id 改为 UUID 类型

**建议**: `VARCHAR(255)` → `UUID`

**不采纳理由**:
- ❌ **破坏现有 API**: userId 从字符串变为 UUID 格式
- ❌ **JSONL 不兼容**: JSONL 使用自定义字符串 ID
- ❌ **灵活性降低**: 当前方案允许自定义 ID
- ✅ **VARCHAR 足够**: 支持多种 ID 格式

**评估**: 保持现状，VARCHAR 更灵活

---

## 🎯 实施计划

### 阶段 1: 立即实施（本次提交）

**优化项目**:
1. ✅ 添加 `idx_last_connected` 索引
2. ✅ 增加 `browser_url` 字段长度
3. ✅ 增强事务处理（`deleteUser` 等方法）

**预计时间**: 30分钟  
**风险**: 极低  
**收益**: 高

---

### 阶段 2: 下次迭代（可选）

**优化项目**:
4. ✅ 改进 JSONL 快照策略
5. ⚠️ 添加慢查询日志
6. ⚠️ 添加性能监控

**预计时间**: 2-3小时  
**风险**: 低  
**收益**: 中

---

## 📊 优化效果预期

### 性能提升

| 操作 | 优化前 | 优化后 | 提升 |
|------|--------|--------|------|
| 活跃浏览器查询 | ~20ms | ~2ms | 90% ⬆️ |
| 删除用户（含浏览器） | 不一致风险 | 数据一致 | 可靠性 ⬆️ |
| URL 字段 | 1024字符 | 2048字符 | 容量 2x ⬆️ |

### 代码质量

- ✅ 更好的数据一致性（事务）
- ✅ 更好的查询性能（索引）
- ✅ 更好的容错能力（长 URL）

---

## ✅ 实施检查清单

- [ ] 添加 PostgreSQL 索引
- [ ] 修改 browser_url 字段长度
- [ ] 增强 deleteUser 事务
- [ ] 测试 PostgreSQL 模式
- [ ] 测试 JSONL 模式
- [ ] 更新文档

---

## 📚 参考资料

- SQL_ARCHITECTURE_ANALYSIS.md - 架构分析报告
- PostgreSQL 文档: https://www.postgresql.org/docs/
- Node.js PostgreSQL 最佳实践

---

**制定时间**: 2025-10-14  
**状态**: ✅ 准备实施
