# HTTP 服务器错误处理优化

## 问题分析

### 原始错误信息

```
error: Failed to start server. Is port 32123 in use?
      at emitError (node:events:51:13)
```

### 问题诊断

**根本原因**：`httpServer.listen()` 缺少错误事件监听器，导致：

1. ❌ 错误信息不明确 - 只显示通用的端口占用提示
2. ❌ 无法区分具体错误类型（端口占用、权限不足、地址不可用等）
3. ❌ 缺少解决方案指导
4. ❌ 堆栈信息混乱，难以定位问题

## 优化方案

### 1. 添加详细的错误处理

为 HTTP 服务器添加 `error` 事件监听器，处理以下错误类型：

#### **EADDRINUSE - 端口已被占用**

```
❌ 端口 32123 已被占用

解决方案：
  1. 使用其他端口: --port 32124
  2. 查找占用端口的进程:
     Windows: netstat -ano | findstr 32123
     Linux/Mac: lsof -i :32123
  3. 关闭占用端口的程序
```

#### **EACCES - 权限不足**

```
❌ 权限不足，无法绑定端口 32123

解决方案：
  1. 使用非特权端口 (>1024): --port 8080
  2. Windows: 以管理员身份运行
  3. Linux/Mac: 使用 sudo 或更改端口
```

#### **EADDRNOTAVAIL - 地址不可用**

```
❌ 地址不可用

可能原因：
  - 网络接口未启用
  - 防火墙阻止
```

#### **其他错误**

```
❌ 错误: [具体错误信息]
   错误码: [错误码]

详细信息：
[完整堆栈信息]
```

### 2. 代码实现

#### server-http.ts

```typescript
// 错误处理
httpServer.on('error', (error: NodeJS.ErrnoException) => {
  console.error('\n[HTTP] ❌ 服务器启动失败');
  console.error('');

  if (error.code === 'EADDRINUSE') {
    // 端口占用处理
  } else if (error.code === 'EACCES') {
    // 权限不足处理
  } else if (error.code === 'EADDRNOTAVAIL') {
    // 地址不可用处理
  } else {
    // 通用错误处理
  }

  process.exit(1);
});

httpServer.listen(port, () => {
  // 成功启动的提示
});
```

#### server-sse.ts

同样的错误处理逻辑。

### 3. 用户体验改进

**之前**：

```
error: Failed to start server. Is port 32123 in use?
```

**现在**：

```
[HTTP] ❌ 服务器启动失败

❌ 端口 32123 已被占用

解决方案：
  1. 使用其他端口: --port 32124
  2. 查找占用端口的进程:
     Windows: netstat -ano | findstr 32123
     Linux/Mac: lsof -i :32123
  3. 关闭占用端口的程序
```

## 适用场景

### 常见错误场景

1. **端口冲突**
   - 同时运行多个 MCP 服务器实例
   - 端口被其他应用占用（如 nginx、另一个服务）

2. **权限问题**
   - Linux/Mac 尝试绑定 1-1024 特权端口
   - Windows 防火墙阻止

3. **网络配置问题**
   - 网络适配器禁用
   - 虚拟网络环境配置错误
   - Docker/WSL 网络问题

## 测试验证

### 测试端口占用错误

```bash
# 终端 1: 启动第一个实例
./chrome-extension-debug-mcp --transport streamable --port 8080

# 终端 2: 尝试使用相同端口（应显示友好错误）
./chrome-extension-debug-mcp --transport streamable --port 8080
```

### 测试权限错误（Linux/Mac）

```bash
# 尝试绑定特权端口
./chrome-extension-debug-mcp --transport streamable --port 80
```

## 最佳实践

### 端口选择建议

1. **开发环境**：使用默认端口
   - SSE: 32122
   - Streamable: 32123

2. **生产环境**：使用自定义端口

   ```bash
   --port 8080  # 常用非特权端口
   --port 3000  # Node.js 常用端口
   ```

3. **多实例部署**：使用不同端口

   ```bash
   # 实例 1
   --transport streamable --port 3000

   # 实例 2
   --transport streamable --port 3001
   ```

### 排查端口占用

#### Windows

```bash
# 查找占用端口的进程
netstat -ano | findstr 32123

# 根据 PID 查看进程详情
tasklist | findstr <PID>

# 结束进程
taskkill /PID <PID> /F
```

#### Linux/Mac

```bash
# 查找占用端口的进程
lsof -i :32123
sudo lsof -i :32123  # 需要 sudo 查看所有进程

# 结束进程
kill <PID>
kill -9 <PID>  # 强制结束
```

## 影响范围

### 改进的文件

- ✅ `src/server-http.ts` - Streamable HTTP 服务器
- ✅ `src/server-sse.ts` - SSE 服务器

### 不受影响

- ✅ `src/main.ts` - stdio 模式（不涉及端口监听）
- ✅ 所有工具函数和业务逻辑

## 后续建议

1. **添加端口可用性检查**
   - 启动前预检端口是否可用
   - 自动尝试下一个端口

2. **添加配置文件支持**
   - 保存常用端口配置
   - 避免每次手动指定

3. **添加日志系统**
   - 记录所有错误到日志文件
   - 便于问题追踪和分析
