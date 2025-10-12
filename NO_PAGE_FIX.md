# "No page selected" 错误修复

## 问题描述

### 错误信息
```
error: No page selected
      at getSelectedPage (B:/~BUN/root/chrome-devtools-mcp-windows-x64.exe:411:4517)
      at setSelectedPageIdx (B:/~BUN/root/chrome-devtools-mcp-windows-x64.exe:411:4823)
      at #U (B:/~BUN/root/chrome-devtools-mcp-windows-x64.exe:411:3179)
      at async from (B:/~BUN/root/chrome-devtools-mcp-windows-x64.exe:411:3283)
```

### 复现场景
使用打包的二进制文件连接到已有浏览器时：
```bash
./chrome-devtools-mcp-windows-x64.exe --transport streamable --browserUrl http://localhost:9222 --port 32124
```

IDE 连接 MCP 服务时，在初始化阶段抛出 "No page selected" 错误。

## 根本原因

### 问题分析

当连接到一个**没有打开任何普通页面的浏览器**时（例如只有扩展后台页面），会发生以下情况：

1. **`McpContext.from()`** 被调用创建上下文
2. **`#init()`** 方法执行初始化：
   ```typescript
   async #init() {
     await this.createPagesSnapshot();  // 获取页面列表
     this.setSelectedPageIdx(0);        // 设置选中第一个页面
     // ...
   }
   ```

3. **`createPagesSnapshot()`** 调用 `browser.pages()`
   - 如果浏览器没有普通页面，返回**空数组** `[]`
   - `this.#pages = []`

4. **`setSelectedPageIdx(0)`** 尝试设置选中索引为 0：
   ```typescript
   setSelectedPageIdx(idx: number): void {
     const oldPage = this.getSelectedPage();  // ❌ 调用此方法
     oldPage.off('dialog', this.#dialogHandler);
     // ...
   }
   ```

5. **`getSelectedPage()`** 检查并抛出错误：
   ```typescript
   getSelectedPage(): Page {
     const page = this.#pages[this.#selectedPageIdx];  // this.#pages[0] = undefined
     if (!page) {
       throw new Error('No page selected');  // ❌ 抛出错误
     }
     return page;
   }
   ```

### 为什么会没有页面？

常见场景：
1. **调试 Chrome 扩展时**：启动 Chrome 只加载扩展，没有打开任何普通标签页
2. **远程调试**：连接到已清空标签页的浏览器实例
3. **自动化测试**：浏览器启动后还未导航到任何页面

## 修复方案

### 1. 自动创建页面（主要修复）

在 `McpContext.#init()` 中检测空页面情况并自动创建：

```typescript
async #init() {
  await this.createPagesSnapshot();
  
  // 如果浏览器没有打开任何页面，创建一个新页面
  // 这种情况在连接到只有扩展页面的浏览器时会发生
  if (this.#pages.length === 0) {
    this.logger('No pages found, creating a new page');
    const page = await this.browser.newPage();
    this.#pages = [page];
    // 将新页面添加到收集器中
    this.#networkCollector.addPage(page);
    this.#consoleCollector.addPage(page);
  }
  
  this.setSelectedPageIdx(0);
  await this.#networkCollector.init();
  await this.#consoleCollector.init();
}
```

**理由**：
- ✅ MCP 服务的工具大多需要一个页面上下文才能工作
- ✅ 自动创建页面对用户透明，避免手动干预
- ✅ 符合预期：调试工具应该总是有一个可用的页面

### 2. 健壮的 setSelectedPageIdx（防御性修复）

修改 `setSelectedPageIdx` 使其能处理首次初始化：

```typescript
setSelectedPageIdx(idx: number): void {
  // 移除旧页面的事件监听（如果存在）
  const oldPage = this.#pages[this.#selectedPageIdx];
  if (oldPage) {  // ✅ 增加存在性检查
    oldPage.off('dialog', this.#dialogHandler);
  }
  
  this.#selectedPageIdx = idx;
  const newPage = this.getSelectedPage();
  newPage.on('dialog', this.#dialogHandler);
  this.#updateSelectedPageTimeouts();
}
```

**理由**：
- ✅ 防止首次调用时访问不存在的页面
- ✅ 使方法更加健壮，不依赖调用顺序
- ✅ 遵循防御性编程原则

## 验证测试

### 测试场景 1：正常连接
```bash
# 启动服务
node build/src/index.js --transport streamable --browserUrl http://localhost:9222 --port 32124

# 健康检查
curl http://localhost:32124/health
# ✅ {"status":"ok","sessions":0,"browser":"connected","transport":"streamable-http"}

# 初始化并获取工具列表
curl -X POST http://localhost:32124/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","method":"initialize",...}'
# ✅ 返回 session-id，无错误

# 工具数量
# ✅ 37 个工具全部可用
```

### 测试场景 2：空浏览器连接
```bash
# 1. 启动一个没有任何标签的 Chrome
google-chrome --remote-debugging-port=9222 --no-first-run

# 2. 关闭所有标签（只保留扩展后台）

# 3. 启动 MCP 服务
node build/src/index.js --transport streamable --browserUrl http://localhost:9222

# ✅ 输出日志显示：
# [McpContext] No pages found, creating a new page

# 4. 测试工具
# ✅ 所有工具正常工作
```

### 测试场景 3：打包二进制
```bash
# Windows
./chrome-devtools-mcp-windows-x64.exe --transport streamable --browserUrl http://localhost:9222 --port 32124

# Linux
./chrome-devtools-mcp-linux-x64 --transport streamable --browserUrl http://localhost:9222 --port 32124

# ✅ 不再出现 "No page selected" 错误
# ✅ IDE 可以正常连接和使用工具
```

## 影响范围

### 修复的场景
✅ 连接到空浏览器时自动创建页面  
✅ 扩展调试场景下的初始化  
✅ 远程调试的边缘情况  
✅ 打包二进制的稳定性  

### 不影响的功能
✅ 现有页面管理逻辑保持不变  
✅ 多页面切换功能正常  
✅ 页面关闭和创建逻辑不变  
✅ 所有工具功能完整  

## 相关文件

### 修改的文件
```
src/McpContext.ts
  - #init() 方法：增加空页面检测和自动创建
  - setSelectedPageIdx() 方法：增加存在性检查
```

### 影响的服务器
```
src/main.ts           (stdio 模式)
src/server-http.ts    (Streamable HTTP 模式)
src/server-sse.ts     (SSE 模式)
```
所有传输模式都使用 `McpContext.from()`，因此都受益于此修复。

## 最佳实践建议

### 扩展调试时
推荐启动方式：
```bash
# 方式 1：让 MCP 自动处理空页面
chrome-devtools-mcp --transport streamable --browserUrl http://localhost:9222

# 方式 2：手动打开一个标签（传统方式）
# 在 Chrome 中打开任意网页后再连接
```

### 自动化脚本
```bash
#!/bin/bash
# 启动 Chrome（可能是空的）
google-chrome --remote-debugging-port=9222 &

# 直接启动 MCP 服务（不需要等待页面打开）
chrome-devtools-mcp --transport streamable --browserUrl http://localhost:9222
# ✅ 会自动创建需要的页面
```

## 技术细节

### McpContext 初始化流程

**修复前**：
```
1. createPagesSnapshot() → []
2. setSelectedPageIdx(0)
   → getSelectedPage()
   → this.#pages[0] → undefined
   → throw Error ❌
```

**修复后**：
```
1. createPagesSnapshot() → []
2. 检测：if (this.#pages.length === 0)
3. 自动创建：newPage()
4. 更新：this.#pages = [page]
5. 注册收集器
6. setSelectedPageIdx(0) ✅
```

### 为什么不在 getSelectedPage() 中修复？

考虑过的替代方案：
```typescript
// ❌ 不推荐
getSelectedPage(): Page {
  if (this.#pages.length === 0) {
    // 在这里创建页面？
  }
  return this.#pages[this.#selectedPageIdx];
}
```

**拒绝理由**：
- ❌ `getSelectedPage()` 是查询方法，不应有副作用
- ❌ 违反单一职责原则
- ❌ 可能导致意外的页面创建
- ✅ 初始化逻辑应该在 `#init()` 中完成

## 总结

### 问题
连接到没有普通页面的浏览器时，`McpContext` 初始化失败，抛出 "No page selected" 错误。

### 解决方案
1. 在初始化时检测空页面并自动创建
2. 增强 `setSelectedPageIdx` 的健壮性

### 结果
✅ 所有传输模式在任何浏览器状态下都能正常初始化  
✅ 扩展调试场景更加稳定  
✅ 打包二进制文件可靠性提升  
✅ 用户体验改善（无需手动创建标签页）  

### 版本
修复版本：v0.8.1+
修复日期：2025-10-12
