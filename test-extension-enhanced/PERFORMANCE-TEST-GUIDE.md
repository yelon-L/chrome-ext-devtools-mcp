# Enhanced Test Extension v4.1 - 性能测试指南

## 🎯 概述

Enhanced Test Extension v4.1新增Phase 1性能测试功能，用于验证`analyze_extension_performance` MCP工具。

## 🔧 新增功能

- **PerformanceTester**: Background性能测试管理器
- **ContentPerformanceTester**: Content Script性能影响模拟
- **4个性能级别**: low, medium, high, extreme
- **性能影响模拟**: CPU计算、内存占用、DOM操作、Layout/Paint触发

## 📊 性能级别

| 级别 | CPU间隔 | CPU持续 | 内存 | DOM操作 |
|------|--------|---------|------|---------|
| Low | 1000ms | 50ms | 100KB | 10 |
| Medium | 500ms | 100ms | 1MB | 50 |
| High | 200ms | 200ms | 5MB | 100 |
| Extreme | 100ms | 500ms | 10MB | 200 |

## 🚀 使用方法

### 1. 加载扩展
```bash
chrome --remote-debugging-port=9222 \
  --load-extension=./enhanced-test-extension
```

### 2. 手动触发
在网页Console执行：
```javascript
// 启动性能测试
chrome.runtime.sendMessage({
  type: 'start_performance_test',
  level: 'medium'
});

// 停止性能测试
chrome.runtime.sendMessage({
  type: 'stop_performance_test'
});
```

### 3. 自动化测试
```bash
npm run build
node test/test-phase1-performance-comprehensive.js
```

## 📈 预期结果

性能指标应呈递增趋势：
- CPU使用率: Baseline < Medium < High
- 内存使用: Baseline < Medium < High  
- 执行时间: Baseline < Medium < High

## 🔍 验证要点

✅ 性能测试模式可启动/停止  
✅ 不同级别产生不同影响  
✅ analyze_extension_performance准确检测  
✅ 影响级别评估合理  
✅ 优化建议质量高

## 📝 注意事项

- Chrome需以调试模式启动（port 9222）
- 建议在简单页面测试（如example.com）
- 性能测试启动后等待2秒生效
- 每次测试后停止性能测试模式

## 🐛 故障排查

**扩展未找到**: 检查chrome://extensions/  
**无性能差异**: 确认等待时间足够  
**Chrome连接失败**: 检查9222端口
