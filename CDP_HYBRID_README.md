# CDP 混合架构快速开始

> **实验性功能**：CDP 混合架构通过直接使用 Chrome DevTools Protocol 提升性能，目前处于测试阶段。

## 快速启动

### 方式 1：使用启动脚本（推荐）

```bash
# 纯 Puppeteer 模式（基线）
./start-hybrid-server.sh baseline

# CDP Target 管理模式
./start-hybrid-server.sh target

# 完整 CDP 混合模式（最快）
./start-hybrid-server.sh full
```

### 方式 2：手动配置环境变量

```bash
# 编译代码
npm run build

# 设置环境变量
export USE_CDP_HYBRID=true        # 启用 CDP Target 管理
export USE_CDP_OPERATIONS=true    # 启用 CDP 高频操作

# 启动服务器
npm run start:multi-tenant
```

## 功能测试

### 1. 运行混合架构功能测试

```bash
# 编译代码（如果还没编译）
npm run build

# 运行测试
node test-hybrid-context.mjs
```

**测试内容**：
- ✅ CDP Target 管理功能
- ✅ CDP 高频操作（navigate, evaluate）
- ✅ 与 Puppeteer 基线对比
- ✅ 性能提升百分比

**示例输出**：
```
╔════════════════════════════════════════════════════════╗
║    McpContext CDP 混合架构功能测试                      ║
╚════════════════════════════════════════════════════════╝

📊 测试 1: CDP Target 管理
────────────────────────────────────────────────────────
✓ 上下文创建时间: 45ms
✓ CDP Target 管理状态: 已启用
✓ 延迟初始化完成: 280ms
✓ 新页面创建时间: 310ms

📊 测试 2: CDP 高频操作
────────────────────────────────────────────────────────
✓ CDP Target 管理: 已启用
✓ CDP 操作: 已启用

🌐 测试 CDP 导航:
  ✓ 导航成功: 620ms

📜 测试 CDP evaluate:
  ✓ 执行成功: 32ms
  结果: "Example Domain"

╔════════════════════════════════════════════════════════╗
║                    测试结果汇总                         ║
╚════════════════════════════════════════════════════════╝

📈 性能对比：
────────────────────────────────────────────────────────

页面创建性能:
  Puppeteer 基线: 450ms
  CDP Target: 310ms (+31.1%)

页面导航性能:
  Puppeteer 基线: 850ms
  CDP Operations: 620ms (+27.1%)

脚本执行性能:
  Puppeteer 基线: 45ms
  CDP Operations: 32ms (+28.9%)

✅ 所有测试完成！
```

### 2. 运行性能基准测试

```bash
node test-cdp-hybrid.mjs
```

## 架构模式

### 模式 1：纯 Puppeteer（基线）

```bash
./start-hybrid-server.sh baseline
```

- 使用 Puppeteer 原生 API
- 最稳定，兼容性最好
- 性能基线

### 模式 2：CDP Target 管理

```bash
./start-hybrid-server.sh target
```

**改进**：
- ✅ 使用 CDP 创建页面（绕过 `browser.newPage()` 瓶颈）
- ✅ 页面创建速度提升 30-40%
- ✅ 减少并发创建时的阻塞
- 📝 其他操作仍使用 Puppeteer

**适用场景**：
- 多用户并发连接
- 需要频繁创建新页面
- 生产环境首选

### 模式 3：完整 CDP 混合

```bash
./start-hybrid-server.sh full
```

**改进**：
- ✅ CDP Target 管理（同模式 2）
- ✅ CDP 导航（`Page.navigate`）- 提升 20-30%
- ✅ CDP 脚本执行（`Runtime.evaluate`）- 提升 10-20%
- 📝 自动回退机制

**适用场景**：
- 开发/测试环境
- 性能要求极高的场景
- 需要最新功能

## 配置选项

### 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `USE_CDP_HYBRID` | `false` | 启用 CDP Target 管理 |
| `USE_CDP_OPERATIONS` | `false` | 启用 CDP 高频操作 |
| `PORT` | `32122` | 服务器端口 |
| `AUTH_ENABLED` | `true` | 是否启用认证 |

### 编程式配置

```typescript
import {McpContext} from './McpContext.js';

// 创建混合模式上下文
const context = await McpContext.fromMinimal(browser, logger, {
  useCdpForTargets: true,      // CDP Target 管理
  useCdpForOperations: true,   // CDP 高频操作
});

// 检查状态
console.log('CDP Target 管理:', context.isCdpTargetManagementEnabled());
console.log('CDP 操作:', context.isCdpOperationsEnabled());

// 使用 CDP 操作（如果启用）
const cdpOps = context.getCdpOperations();
if (cdpOps) {
  // 使用 CDP 导航
  const result = await cdpOps.navigate('https://example.com');
  
  // 使用 CDP 执行脚本
  const evalResult = await cdpOps.evaluate('document.title');
}

// 清理资源
await context.dispose();
```

## 自动回退机制

系统具备完善的自动回退机制：

```
尝试 CDP 操作
    ↓
  成功? ───→ 继续使用 CDP
    │
   失败
    ↓
自动回退到 Puppeteer ──→ 记录警告日志
    ↓
继续正常工作
```

**日志示例**：
```
[Hybrid] Using CDP to create target
[Hybrid] Target created via CDP successfully
```

或

```
[Hybrid] CDP target creation failed: timeout
[Hybrid] Fallback to Puppeteer newPage()
```

## 监控和调试

### 启用详细日志

```bash
export DEBUG=mcp:*
./start-hybrid-server.sh full
```

### 关键日志标记

- `[Hybrid]` - CDP 混合架构操作
- `[CdpTargetManager]` - CDP Target 管理
- `[CdpOperations]` - CDP 高频操作

### 监控指标

观察以下日志模式：

**成功模式**：
```
✓ MCP上下文已创建（CDP-Target+CDP-Ops）: user123
[Hybrid] Using CDP to create target
[Hybrid] Target created via CDP successfully
```

**回退模式**：
```
Warning: CDP Target Manager init failed, fallback to Puppeteer
[Hybrid] CDP target creation failed
[Hybrid] Fallback to Puppeteer newPage()
```

## 故障排除

### Q: CDP Session 初始化失败

**症状**：
```
Warning: CDP Target Manager init failed, fallback to Puppeteer
```

**可能原因**：
- Chrome 版本过旧
- 浏览器连接不稳定
- 权限问题

**解决方案**：
1. 更新 Chrome 到最新版本
2. 检查浏览器连接状态
3. 回退到 baseline 模式

### Q: CDP 操作间歇性失败

**症状**：
```
[Hybrid] CDP target creation failed: timeout
```

**可能原因**：
- 浏览器负载过高
- 网络延迟
- 并发请求过多

**解决方案**：
1. 增加超时时间（代码层面）
2. 限制并发连接数
3. 使用 target 模式而非 full 模式

### Q: 性能提升不明显

**检查项**：
1. 确认 CDP 功能已启用（查看启动日志）
2. 确认没有频繁回退（查看 fallback 日志）
3. 运行性能测试获取准确数据

## 部署建议

### 开发环境

```bash
# 直接使用完整模式
export USE_CDP_HYBRID=true
export USE_CDP_OPERATIONS=true
npm run start:multi-tenant
```

### 测试环境

```bash
# 建议使用 target 模式，观察 1-2 周
export USE_CDP_HYBRID=true
export USE_CDP_OPERATIONS=false
npm run start:multi-tenant
```

### 生产环境

**阶段 1（1-2周）**：
```bash
# 只启用 CDP Target 管理
export USE_CDP_HYBRID=true
npm run start:multi-tenant
```

监控指标：
- 连接成功率
- CDP 回退率
- 性能提升

**阶段 2（2-4周）**：
如果阶段 1 稳定（成功率 > 95%），可以启用完整模式：
```bash
export USE_CDP_HYBRID=true
export USE_CDP_OPERATIONS=true
npm run start:multi-tenant
```

## 更多文档

- [CDP_HYBRID_GUIDE.md](./CDP_HYBRID_GUIDE.md) - 详细使用指南
- [CDP_HYBRID_IMPLEMENTATION.md](./CDP_HYBRID_IMPLEMENTATION.md) - 实施总结
- [CDP_MIGRATION_ANALYSIS.md](./CDP_MIGRATION_ANALYSIS.md) - 迁移分析

## 反馈和贡献

如果遇到问题或有改进建议，请提交 Issue 或 PR。

---

**注意**：CDP 混合架构是实验性功能，建议先在测试环境验证后再部署到生产环境。
