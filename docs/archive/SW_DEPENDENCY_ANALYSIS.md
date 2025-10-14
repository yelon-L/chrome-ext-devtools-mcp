# Service Worker Dependency Analysis

## 依赖 SW 激活的工具分析

### 工具列表

| 工具名称 | SW 依赖程度 | 前置描述 | 错误处理 | 需要优化 |
|---------|-----------|---------|---------|---------|
| evaluate_in_extension | 🔴 必需 | ✅ 有 | ⚠️ 一般 | 是 |
| inspect_extension_storage | 🔴 必需 | ✅ 有 | ❌ 缺失 | **是** |
| get_extension_logs | 🟡 部分 | ✅ 有 | ⚠️ 一般 | 是 |
| list_extension_contexts | 🟡 部分 | ✅ 有 | ✅ 良好 | 否 |
| reload_extension | 🟢 自动处理 | ✅ 有 | ✅ 自动激活 | 否 |

### 详细分析

#### 1. evaluate_in_extension

**SW 依赖**: 🔴 **必需** - MV3 扩展必须有活跃的 SW 才能执行代码

**前置描述**: ✅ **良好**
```
⚠️ **Prerequisites for MV3 extensions**:
- Service Worker MUST be active before calling this tool
- If SW is inactive, this tool will fail with "No background context found"
- Use 'activate_extension_service_worker' first if you see SW status as 🔴 Inactive
- Check SW status with 'list_extensions' before proceeding
```

**错误处理**: ⚠️ **一般**
```typescript
catch (error) {
  response.appendResponseLine('**Possible causes**:');
  response.appendResponseLine('- Service Worker is not running (for MV3)');
  response.appendResponseLine('\n💡 **Tip**: If the Service Worker is inactive, use `activate_extension_service_worker` to activate it first');
}
```

**问题**:
- 错误信息不够具体
- 没有智能检测是否是 SW 未激活导致的
- 没有提供一键解决方案

**优化方案**:
- 检测 "No background context found" 错误
- 明确提示这是 SW 未激活问题
- 提供激活 SW 的具体命令
- 添加 SW 状态检查建议

---

#### 2. inspect_extension_storage

**SW 依赖**: 🔴 **必需** - chrome.storage API 需要 SW 激活

**前置描述**: ✅ **良好**
```
**⚠️ MV3 prerequisite**:
- Service Worker MUST be active to access chrome.storage
- Check SW status with list_extensions first
- Use activate_extension_service_worker if SW is 🔴 Inactive
- Inactive SW will cause this tool to fail
```

**错误处理**: ❌ **缺失** - 没有 try-catch!
```typescript
handler: async (request, response, context) => {
  const {extensionId, storageType = 'local'} = request.params;
  
  // 直接调用,没有错误处理!
  const storage = await context.getExtensionStorage(
    extensionId,
    storageType,
  );
  // ...
}
```

**问题**:
- **没有 try-catch**,错误会直接抛到上层
- 用户看到的是底层错误,不友好
- 没有提示如何解决

**优化方案**: **🔴 高优先级**
- 添加 try-catch 错误处理
- 检测 SW 相关错误
- 提供友好的错误信息和解决建议
- 建议激活 SW

---

#### 3. get_extension_logs

**SW 依赖**: 🟡 **部分** - SW 日志需要 SW 激活,但 content script 日志不需要

**前置描述**: ✅ **良好**
```
**⚠️ MV3 Service Worker logs**:
- SW logs only available when SW is active
- Inactive SW = no background logs
- Use activate_extension_service_worker to wake SW
- Content script logs available regardless of SW status
```

**错误处理**: ⚠️ **一般**
```typescript
catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  throw new Error(`Failed to get extension logs: ${message}`);
}
```

**问题**:
- 只是简单地重新抛出错误
- 没有提供友好的错误信息
- 没有区分 SW 相关错误和其他错误

**优化方案**:
- 改进错误处理,不要简单重抛
- 检测 SW 相关错误
- 提供友好的错误信息
- 说明 content script 日志仍然可用

---

#### 4. list_extension_contexts

**SW 依赖**: 🟡 **部分** - SW 未激活时不会出现在列表中

**前置描述**: ✅ **完善**
```
**⚠️ MV3 Service Worker behavior**:
- Inactive SW won't appear in the list
- "No active contexts" often means SW is inactive
- SW becomes inactive after ~30 seconds of inactivity
- Use activate_extension_service_worker to wake it up
- Check SW status with list_extensions first
```

**错误处理**: ✅ **良好**
```typescript
if (contexts.length === 0) {
  response.appendResponseLine('No active contexts found...');
  response.appendResponseLine('\n💡 **Tip**: For MV3 extensions, try `activate_extension_service_worker` to activate the Service Worker');
  return;
}
```

**评价**: 无需优化,已经很好

---

#### 5. reload_extension

**SW 依赖**: 🟢 **自动处理** - 工具会自动激活 SW

**前置描述**: ✅ **完善**
```
**What it does**:
- Automatically activates inactive Service Workers (MV3) before reload
```

**错误处理**: ✅ **自动激活**
```typescript
if (extension.serviceWorkerStatus === 'inactive') {
  response.appendResponseLine('🔄 Service Worker is inactive. Activating...\n');
  await context.activateServiceWorker(extensionId);
  response.appendResponseLine('✅ Service Worker activated successfully\n');
}
```

**评价**: 无需优化,已实现自动激活

---

## 优化计划

### 优先级 1: inspect_extension_storage
- ❌ 缺少错误处理
- 需要添加完整的 try-catch
- 提供 SW 未激活的友好提示

### 优先级 2: get_extension_logs
- ⚠️ 错误处理不友好
- 改进错误信息
- 区分 SW 错误和其他错误

### 优先级 3: evaluate_in_extension  
- ⚠️ 可以更智能
- 检测特定错误类型
- 提供更明确的解决方案

---

## 优化建议模板

### 友好的错误处理模板

```typescript
try {
  // 工具逻辑
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  
  response.appendResponseLine(`# ❌ Error\n`);
  response.appendResponseLine(`**Extension ID**: ${extensionId}\n`);
  response.appendResponseLine(`**Error**: ${message}\n`);
  
  // 智能检测 SW 相关错误
  if (message.includes('No background context') || 
      message.includes('Service Worker') ||
      message.includes('inactive') ||
      message.includes('not found')) {
    response.appendResponseLine(`## 🔴 Service Worker Issue Detected\n`);
    response.appendResponseLine(`This error typically occurs when the Service Worker is inactive.\n`);
    response.appendResponseLine(`**Solution**:`);
    response.appendResponseLine(`1. Check SW status: \`list_extensions\``);
    response.appendResponseLine(`2. Activate SW: \`activate_extension_service_worker\` with extensionId="${extensionId}"`);
    response.appendResponseLine(`3. Retry this tool after activation\n`);
  } else {
    response.appendResponseLine(`**Possible causes**:`);
    response.appendResponseLine(`- Extension is disabled or uninstalled`);
    response.appendResponseLine(`- Extension ID is incorrect`);
    response.appendResponseLine(`- Permissions issue\n`);
  }
  
  response.setIncludePages(true);
}
```

---

## 通用优化原则

1. **明确的前置说明**: ✅ 所有工具都已完成
2. **智能错误检测**: 检测 SW 相关关键词
3. **友好的错误信息**: 不直接抛底层错误
4. **可操作的建议**: 提供具体的命令和步骤
5. **上下文信息**: 说明为什么会失败
6. **一致性**: 所有工具使用相同的错误处理风格
