# MCP 服务器综合测试计划

**制定时间**: 2025-11-04  
**目标**: 测试所有传输模式和核心工具的可用性

---

## 📋 测试范围

### 传输模式

| 模式 | 端口 | 测试状态 | 工具数 |
|------|------|---------|--------|
| stdio | - | ⏳ 待测试 | 53 |
| SSE | 32122 | ⏳ 待测试 | 53 |
| HTTP (Streamable) | 32123 | ⏳ 待测试 | 53 |
| Multi-tenant | 32122 | ⏳ 待测试 | 53 |

### 工具分类

| 类别 | 工具数 | 优先级 | 测试状态 |
|------|--------|--------|---------|
| 浏览器信息 | 2 | P0 | ⏳ 待测试 |
| 页面管理 | 5 | P0 | ⏳ 待测试 |
| 扩展调试 | 20+ | P0 | ⏳ 待测试 |
| 网络监控 | 3 | P1 | ⏳ 待测试 |
| 性能分析 | 3 | P1 | ⏳ 待测试 |
| 输入模拟 | 5 | P1 | ⏳ 待测试 |
| 其他 | 10+ | P2 | ⏳ 待测试 |

---

## 🎯 测试策略

### Phase 1: 环境准备（5分钟）
- [x] 验证 Chrome 远程调试端口
- [ ] 安装测试扩展
- [ ] 准备测试页面
- [ ] 创建测试脚本

### Phase 2: stdio 模式测试（15分钟）
- [ ] 启动 stdio 服务器
- [ ] 测试核心工具（P0）
- [ ] 测试扩展工具（P0）
- [ ] 记录测试结果

### Phase 3: SSE 模式测试（15分钟）
- [ ] 启动 SSE 服务器
- [ ] 测试核心工具（P0）
- [ ] 测试健康检查端点
- [ ] 记录测试结果

### Phase 4: HTTP 模式测试（15分钟）
- [ ] 启动 HTTP 服务器
- [ ] 测试核心工具（P0）
- [ ] 测试健康检查端点
- [ ] 记录测试结果

### Phase 5: Multi-tenant 模式测试（20分钟）
- [ ] 启动 Multi-tenant 服务器
- [ ] 注册测试用户
- [ ] 测试核心工具（P0）
- [ ] 测试会话管理
- [ ] 记录测试结果

### Phase 6: 汇总和文档（10分钟）
- [ ] 汇总所有测试结果
- [ ] 更新文档
- [ ] 提交代码

---

## 🧪 测试工具清单

### P0 核心工具（必测）

#### 浏览器信息
- [ ] `get_connected_browser` - 获取浏览器信息
- [ ] `list_browser_capabilities` - 列出浏览器能力

#### 页面管理
- [ ] `list_pages` - 列出所有页面
- [ ] `new_page` - 创建新页面
- [ ] `select_page` - 选择页面
- [ ] `close_page` - 关闭页面
- [ ] `navigate_page` - 导航到URL

#### 扩展调试（核心）
- [ ] `list_extensions` - 列出所有扩展
- [ ] `get_extension_details` - 获取扩展详情
- [ ] `list_extension_contexts` - 列出扩展上下文
- [ ] `activate_extension_service_worker` - 激活 Service Worker
- [ ] `evaluate_in_extension` - 在扩展中执行代码

#### 快照和截图
- [ ] `take_snapshot` - 获取页面快照
- [ ] `take_screenshot` - 截图

### P1 重要工具（选测）

#### 扩展调试（进阶）
- [ ] `reload_extension` - 重新加载扩展
- [ ] `get_extension_runtime_errors` - 获取运行时错误
- [ ] `inspect_extension_storage` - 检查存储
- [ ] `open_extension_popup` - 打开 popup

#### 输入模拟
- [ ] `click` - 点击元素
- [ ] `fill` - 填写表单
- [ ] `hover` - 悬停

#### 网络监控
- [ ] `list_network_requests` - 列出网络请求
- [ ] `get_network_request` - 获取请求详情

---

## 📝 测试方法

### 1. stdio 模式测试

**启动命令**:
```bash
node build/src/index.js --browserUrl http://127.0.0.1:9222
```

**测试方式**: Python 脚本模拟 MCP 客户端

### 2. SSE 模式测试

**启动命令**:
```bash
node build/src/index.js --transport sse --port 32122 --browserUrl http://127.0.0.1:9222
```

**测试方式**: curl + HTTP 请求

### 3. HTTP 模式测试

**启动命令**:
```bash
node build/src/index.js --transport streamable --port 32123 --browserUrl http://127.0.0.1:9222
```

**测试方式**: curl + HTTP 请求

### 4. Multi-tenant 模式测试

**启动命令**:
```bash
node build/src/multi-tenant/server-multi-tenant.js
```

**测试方式**: curl + HTTP 请求 + 用户注册

---

## ✅ 成功标准

### 服务器启动
- ✅ 服务器正常启动
- ✅ 无错误日志
- ✅ 端口监听正常

### 工具调用
- ✅ 工具列表正确返回
- ✅ 核心工具调用成功
- ✅ 返回数据格式正确
- ✅ 错误处理友好

### 稳定性
- ✅ 服务器不崩溃
- ✅ 多次调用稳定
- ✅ 资源正常释放

---

## 📊 测试记录

### Phase 1: 环境准备

**时间**: 待执行  
**状态**: ⏳ 待测试

**检查项**:
- [ ] Chrome 9222 端口可访问
- [ ] 测试扩展已安装
- [ ] 测试脚本已创建

### Phase 2: stdio 模式

**时间**: 2025-11-04 19:20  
**状态**: ✅ 已完成

**测试结果**:
- 服务器启动: ✅ 正常
- 工具数量: ✅ 53 个
- initialize: ✅ 成功
- tools/list: ✅ 成功
- 问题: 无 

### Phase 3: SSE 模式

**时间**: 待执行  
**状态**: ⏳ 待测试

**测试结果**:
- 服务器启动: 
- 端口监听: 
- 健康检查: 
- 工具调用: 
- 问题: 

### Phase 4: HTTP 模式

**时间**: 待执行  
**状态**: ⏳ 待测试

**测试结果**:
- 服务器启动: 
- 端口监听: 
- 健康检查: 
- 工具调用: 
- 问题: 

### Phase 5: Multi-tenant 模式

**时间**: 待执行  
**状态**: ⏳ 待测试

**测试结果**:
- 服务器启动: 
- 用户注册: 
- Session 创建: 
- 工具调用: 
- 问题: 

---

## 🎯 预期结果

### 所有模式
- ✅ 服务器正常启动
- ✅ 53 个工具全部可用
- ✅ 核心功能正常
- ✅ 无崩溃和错误

### 特定模式
- stdio: MCP 协议通信正常
- SSE: HTTP 端点可访问
- HTTP: Streamable 协议正常
- Multi-tenant: 多用户隔离正常

---

**计划制定完成**: 2025-11-04  
**预计总耗时**: 80 分钟  
**执行状态**: 🔄 进行中

---

## 🔍 测试发现

### stdio 模式测试结果

**基础功能** ✅:
- 服务器启动: 正常
- initialize 请求: 成功响应
- tools/list 请求: 成功返回 53 个工具

**工具调用问题** ⚠️:
- `tools/call` 请求触发浏览器连接
- `puppeteer.connect()` 在连接时挂起
- 原因: 未知（可能是环境或网络配置问题）
- 影响: 无法测试实际工具功能

**验证方法**:
```bash
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{...}}
{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}' | \
node build/src/index.js --browserUrl http://127.0.0.1:9222
```

**结论**:
- MCP 协议通信: ✅ 正常
- 工具列表: ✅ 完整（53个）
- 工具执行: ⚠️ 受浏览器连接问题影响

### SSE/HTTP 模式测试

**问题**: 服务器在启动时就尝试连接浏览器，导致启动挂起

**原因**: `ensureBrowserConnected()` 在服务器初始化时调用

**影响**: 无法完成 SSE 和 HTTP 模式的测试

---

## 📝 建议

### 短期方案

1. **跳过浏览器连接测试**
   - 测试 MCP 协议层功能
   - 验证工具注册和列表
   - 确认服务器稳定性

2. **使用 headless 模式**
   - 启动自己的 Chrome 实例
   - 避免连接外部浏览器

3. **环境隔离测试**
   - 在不同环境测试
   - 排查网络配置问题

### 长期方案

1. **优化浏览器连接**
   - 添加连接超时
   - 改进错误处理
   - 延迟连接（按需连接）

2. **增强测试工具**
   - 创建 mock 浏览器
   - 单元测试工具逻辑
   - 集成测试自动化

---

**测试暂停时间**: 2025-11-04 19:40  
**已完成**: stdio 协议层测试  
**待完成**: 工具功能测试、SSE/HTTP 模式测试
