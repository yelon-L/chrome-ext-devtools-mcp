# 🧪 测试指南

## 测试类型

### 1. 单元测试（Unit Tests）

**位置：** `tests/` 目录

**框架：** Node.js 内置测试框架

**运行方式：**
```bash
# 运行所有单元测试
npm test

# 只运行标记了 .only 的测试
npm run test:only

# 更新快照
npm run test:update-snapshots
```

**测试内容：**
- ✅ 浏览器启动逻辑
- ✅ MCP 上下文管理
- ✅ 响应格式化
- ✅ CLI 参数解析
- ✅ 页面收集器

**示例：**
```typescript
// tests/browser.test.ts
describe('browser', () => {
  it('launches with the initial viewport', async () => {
    const browser = await launch({
      headless: true,
      viewport: {width: 1501, height: 801},
    });
    
    const [page] = await browser.pages();
    const result = await page.evaluate(() => ({
      width: window.innerWidth,
      height: window.innerHeight,
    }));
    
    assert.deepStrictEqual(result, {width: 1501, height: 801});
    await browser.close();
  });
});
```

---

### 2. 集成测试（Integration Tests）

**位置：** 根目录 `test-*.js` 文件

**用途：** 手动测试扩展调试功能

**测试脚本列表：**

| 脚本 | 测试内容 |
|------|---------|
| `test-all-extension-tools.js` | 完整测试所有 10 个扩展工具 |
| `test-extension-tools.js` | 扩展基础工具测试 |
| `test-service-worker-activation.js` | SW 激活功能测试 |
| `test-helper-extension.js` | Helper Extension 功能测试 |
| `test-dynamic-helper.js` | 动态生成 Helper 测试 |
| `test-helper-detailed.js` | Helper 详细检测测试 |
| `test-activation.js` | 激活功能端到端测试 |
| `test-manifest-access.js` | Manifest 访问测试 |
| `test-puppeteer-vs-cdp.js` | Puppeteer vs CDP 对比测试 |
| `test-simple.js` | 简化版快速测试 |

**运行方式：**
```bash
# 1. 先编译（如果修改了代码）
npm run build

# 2. 运行特定测试
node test-all-extension-tools.js
node test-helper-extension.js
node test-service-worker-activation.js
```

**示例测试（test-all-extension-tools.js）：**
```javascript
class ExtensionToolTester {
  async testListExtensions() {
    log('📝 测试 1/10: list_extensions', 'blue');
    const extensions = await this.getExtensions();
    assert(extensions.length > 0, '应该找到至少一个扩展');
    log(`   ✅ 找到 ${extensions.length} 个扩展`, 'green');
  }

  async testActivateServiceWorker() {
    log('📝 测试 6/10: activate_service_worker', 'blue');
    const result = await this.activateServiceWorker(this.extensionId);
    assert(result.success, '应该成功激活');
    log(`   ✅ 激活成功`, 'green');
  }
}
```

---

### 3. 测试扩展（Test Extension）

**位置：** `test-extension-enhanced/`

**用途：** 专门用于测试 MCP 工具的示例扩展

**内容：**
```
test-extension-enhanced/
├── manifest.json              # MV3 扩展配置
├── background.js             # Service Worker
├── popup.html / popup.js     # Popup 页面
├── storage-test.html/js      # Storage 测试
├── content.js                # Content Script
├── TESTING-GUIDE.md          # 测试指南
└── TESTING-COVERAGE.md       # 测试覆盖率
```

**特性：**
- ✅ 完整的 MV3 扩展
- ✅ 包含所有常见扩展组件
- ✅ 故意设计用于测试各种场景
- ✅ 包含 console.log 输出
- ✅ 包含 storage 操作
- ✅ 可以手动触发各种状态

**使用方式：**
```bash
# 1. 在 Chrome 中加载扩展
chrome://extensions/
→ 开启 "开发者模式"
→ "加载已解压的扩展程序"
→ 选择 test-extension-enhanced 目录

# 2. 运行测试脚本
node test-all-extension-tools.js
```

---

## 🎯 测试覆盖情况

### 已测试 ✅

| 功能模块 | 单元测试 | 集成测试 | 状态 |
|---------|---------|---------|------|
| **浏览器启动** | ✅ | ✅ | 完整 |
| **MCP 上下文** | ✅ | ✅ | 完整 |
| **响应格式化** | ✅ | ✅ | 完整 |
| **CLI 参数** | ✅ | - | 良好 |
| **页面收集** | ✅ | - | 良好 |
| **扩展工具** | ⚠️ | ✅ | 部分 |

### 待测试 ❌

| 功能 | 优先级 | 原因 |
|------|--------|------|
| **list_extensions 自动化** | 高 ⭐⭐⭐ | 当前只有手动测试 |
| **Helper Extension 检测** | 高 ⭐⭐⭐ | 关键功能需要自动化 |
| **SW 激活端到端** | 高 ⭐⭐⭐ | 需要验证完整流程 |
| **Storage 访问** | 中 ⭐⭐ | 需要更多边界测试 |
| **错误处理** | 中 ⭐⭐ | 需要测试各种失败场景 |

---

## 📝 如何编写新测试

### 单元测试模板

```typescript
// tests/my-feature.test.ts
import assert from 'node:assert';
import {describe, it, before, after} from 'node:test';

describe('my-feature', () => {
  before(async () => {
    // 设置测试环境
  });

  after(async () => {
    // 清理资源
  });

  it('should do something', async () => {
    // 执行测试
    const result = await myFunction();
    
    // 断言
    assert.strictEqual(result, expectedValue);
  });
});
```

### 集成测试模板

```javascript
// test-my-feature.js
#!/usr/bin/env node

import puppeteer from 'puppeteer';

async function test() {
  const browser = await puppeteer.launch({...});
  
  try {
    // 执行测试
    const result = await testFunction();
    
    if (result.success) {
      console.log('✅ 测试通过');
    } else {
      console.log('❌ 测试失败:', result.error);
      process.exit(1);
    }
  } finally {
    await browser.close();
  }
}

test();
```

---

## 🚀 快速测试工作流

### 开发新功能时

```bash
# 1. 编写代码
vim src/my-feature.ts

# 2. 编写单元测试
vim tests/my-feature.test.ts

# 3. 运行测试（快速反馈）
npm run test:only  # 只运行标记了 .only 的测试

# 4. 所有测试通过后
npm test  # 运行完整测试套件
```

### 修复 Bug 时

```bash
# 1. 编写复现测试
vim tests/bug-reproduction.test.ts

# 2. 确认测试失败
npm run test:only

# 3. 修复代码
vim src/buggy-code.ts

# 4. 确认测试通过
npm test
```

### 发布前

```bash
# 1. 运行所有单元测试
npm test

# 2. 运行完整集成测试
node test-all-extension-tools.js

# 3. 手动测试边界情况
node test-helper-extension.js
node test-service-worker-activation.js

# 4. 更新文档
vim docs/...

# 5. 发布
npm run build
```

---

## 🐛 调试测试

### 启用详细日志

```bash
# 单元测试
DEBUG=* npm test

# 集成测试（已内置彩色输出）
node test-all-extension-tools.js
```

### 使用断点

```typescript
// tests/my-test.test.ts
it('should debug', async () => {
  debugger; // Node.js 会在这里暂停
  const result = await myFunction();
  assert.ok(result);
});
```

```bash
# 使用 Node.js 调试器运行
node --inspect-brk --test tests/my-test.test.ts
```

### 查看浏览器

```javascript
// 集成测试
const browser = await puppeteer.launch({
  headless: false, // ← 显示浏览器
  devtools: true,  // ← 自动打开 DevTools
});

// 添加暂停，方便观察
await new Promise(resolve => setTimeout(resolve, 60000));
```

---

## 📊 测试报告

### 运行测试并查看报告

```bash
# 运行所有测试
npm test

# 输出示例
✔ browser › cannot launch multiple times with the same profile (1532ms)
✔ browser › launches with the initial viewport (892ms)
✔ McpContext › creates pages snapshot (234ms)
...

tests: 15
pass: 15
fail: 0
duration: 5.2s
```

---

## 🎯 最佳实践

### 1. 测试命名

```typescript
// ✅ 好的命名
it('should return empty array when no extensions are installed')
it('should activate inactive Service Worker')
it('should throw error when extension ID is invalid')

// ❌ 不好的命名
it('works')
it('test1')
it('extension')
```

### 2. 测试独立性

```typescript
// ✅ 每个测试独立
it('test A', async () => {
  const result = await functionA();
  assert.ok(result);
});

it('test B', async () => {
  const result = await functionB(); // 不依赖 test A
  assert.ok(result);
});

// ❌ 测试之间有依赖
let sharedState;
it('test A', async () => {
  sharedState = await setup();
});
it('test B', async () => {
  assert.ok(sharedState); // 依赖 test A
});
```

### 3. 资源清理

```typescript
// ✅ 确保清理
describe('feature', () => {
  let browser;
  
  before(async () => {
    browser = await puppeteer.launch();
  });
  
  after(async () => {
    if (browser) {
      await browser.close(); // 总是清理
    }
  });
});
```

### 4. 超时设置

```typescript
// ✅ 设置合理的超时
it('should complete in reasonable time', {timeout: 5000}, async () => {
  await longRunningOperation();
});

// ❌ 使用默认超时（可能太短）
it('might timeout', async () => {
  await longRunningOperation();
});
```

---

## 📚 相关文档

- [Node.js Test Runner](https://nodejs.org/api/test.html)
- [Puppeteer Documentation](https://pptr.dev/)
- [test-extension-enhanced/TESTING-GUIDE.md](../test-extension-enhanced/TESTING-GUIDE.md)
- [test-extension-enhanced/TESTING-COVERAGE.md](../test-extension-enhanced/TESTING-COVERAGE.md)

---

## 🎉 总结

### 项目测试现状

```
✅ 单元测试：覆盖核心功能
✅ 集成测试：手动测试扩展工具
✅ 测试扩展：专门的测试用例
⚠️  自动化：部分功能需要自动化
```

### 测试命令

```bash
# 单元测试
npm test                    # 所有测试
npm run test:only          # 标记的测试
npm run test:update-snapshots  # 更新快照

# 集成测试
node test-all-extension-tools.js
node test-helper-extension.js
node test-service-worker-activation.js
```

### 建议

1. **优先级高：** 为 `list_extensions` 添加自动化测试
2. **优先级高：** 为 Helper Extension 添加端到端测试
3. **优先级中：** 增加更多边界情况测试
4. **持续：** 保持测试覆盖率

---

**测试是质量的保证！** 🧪
