/**
 * Enhanced Background Script for Week 1-4 全功能测试
 * Week 1: 日志增强、内容脚本状态
 * Week 2: 上下文管理、存储操作
 * Week 3: 消息传递、API调用监控
 * Week 4: 批量测试场景覆盖
 */

console.log('[Enhanced Background] 🚀 Enhanced MCP Debug Test Extension v4.0 Starting...');
console.log('[Enhanced Background] 📋 测试覆盖: Week 1-4 全部增强功能');

// Week 3功能测试：消息监控目标 - runtime.sendMessage测试
class MessageTester {
  constructor() {
    this.messageCount = 0;
    this.setupMessageHandlers();
    this.startPeriodicMessageTests();
  }

  setupMessageHandlers() {
    // 监听来自content script的消息
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      console.log('[Enhanced Background] 📨 收到消息:', { 
        message, 
        sender: sender?.tab?.id, 
        timestamp: Date.now() 
      });

      // Week 3测试：响应处理和性能监控
      const startTime = performance.now();
      
      switch (message.type) {
        case 'test_ping':
          console.log('[Enhanced Background] 🏓 处理ping消息');
          sendResponse({ 
            success: true, 
            pong: true, 
            timestamp: Date.now(),
            processingTime: performance.now() - startTime 
          });
          break;
          
        case 'get_extension_info':
          console.log('[Enhanced Background] 📋 获取扩展信息');
          sendResponse({
            success: true,
            manifest: chrome.runtime.getManifest(),
            id: chrome.runtime.id,
            processingTime: performance.now() - startTime
          });
          break;
          
        case 'trigger_storage_test':
          console.log('[Enhanced Background] 💾 触发存储测试');
          this.testStorageAPIs().then(result => {
            sendResponse({ 
              success: true, 
              storageResult: result,
              processingTime: performance.now() - startTime
            });
          });
          return true; // 异步响应
          
        default:
          console.log('[Enhanced Background] ❓ 未知消息类型:', message.type);
          sendResponse({ 
            success: false, 
            error: '未知消息类型',
            processingTime: performance.now() - startTime 
          });
      }
    });
  }

  startPeriodicMessageTests() {
    // Week 3测试：定期发送消息到content script
    setInterval(() => {
      this.sendTestMessageToTabs();
    }, 10000); // 每10秒发送一次

    // Week 3测试：定期API调用用于追踪测试
    setInterval(() => {
      this.performAPITests();
    }, 15000); // 每15秒执行一次API测试
  }

  async sendTestMessageToTabs() {
    try {
      console.log('[Enhanced Background] 📡 开始发送测试消息到标签页');
      
      // Week 3测试目标：tabs.sendMessage监控
      const tabs = await chrome.tabs.query({ active: true });
      
      for (const tab of tabs) {
        if (tab.id && tab.url && !tab.url.startsWith('chrome://')) {
          this.messageCount++;
          
          const testMessage = {
            type: 'background_test_message',
            id: `msg_${this.messageCount}`,
            timestamp: Date.now(),
            data: {
              counter: this.messageCount,
              tabId: tab.id,
              url: tab.url
            }
          };

          console.log('[Enhanced Background] 📤 发送消息到标签页:', tab.id);
          
          try {
            const response = await chrome.tabs.sendMessage(tab.id, testMessage);
            console.log('[Enhanced Background] ✅ 收到标签页响应:', response);
          } catch (error) {
            console.warn('[Enhanced Background] ⚠️ 标签页消息发送失败:', error.message);
          }
        }
      }
    } catch (error) {
      console.error('[Enhanced Background] ❌ 发送测试消息失败:', error);
    }
  }

  async performAPITests() {
    console.log('[Enhanced Background] 🧪 开始API测试');
    
    try {
      // Week 3测试目标：Storage API追踪
      await this.testStorageAPIs();
      
      // Week 3测试目标：Tabs API追踪
      await this.testTabsAPIs();
      
      // Week 3测试目标：Runtime API追踪
      await this.testRuntimeAPIs();
      
      console.log('[Enhanced Background] ✅ API测试完成');
    } catch (error) {
      console.error('[Enhanced Background] ❌ API测试失败:', error);
    }
  }

  async testStorageAPIs() {
    console.log('[Enhanced Background] 💾 Storage API测试');
    
    const testData = {
      testKey: `test_value_${Date.now()}`,
      counter: this.messageCount,
      timestamp: new Date().toISOString()
    };

    // Local Storage测试
    await chrome.storage.local.set({ 'test_local': testData });
    const localData = await chrome.storage.local.get(['test_local']);
    console.log('[Enhanced Background] 📦 Local Storage操作:', localData);

    // Sync Storage测试
    try {
      await chrome.storage.sync.set({ 'test_sync': { ...testData, type: 'sync' } });
      const syncData = await chrome.storage.sync.get(['test_sync']);
      console.log('[Enhanced Background] ☁️ Sync Storage操作:', syncData);
    } catch (error) {
      console.warn('[Enhanced Background] ⚠️ Sync Storage不可用:', error.message);
    }

    return { local: localData, sync: 'attempted' };
  }

  async testTabsAPIs() {
    console.log('[Enhanced Background] 🔖 Tabs API测试');
    
    // 查询标签页
    const allTabs = await chrome.tabs.query({});
    const activeTabs = await chrome.tabs.query({ active: true });
    
    console.log('[Enhanced Background] 📊 标签页统计:', {
      total: allTabs.length,
      active: activeTabs.length
    });

    // 创建一个新标签页用于测试 (谨慎使用)
    if (allTabs.length < 5) { // 限制标签页数量
      console.log('[Enhanced Background] ➕ 创建测试标签页');
      const newTab = await chrome.tabs.create({ 
        url: 'https://httpbin.org/delay/1',
        active: false 
      });
      
      // 等待2秒后关闭
      setTimeout(async () => {
        try {
          await chrome.tabs.remove(newTab.id);
          console.log('[Enhanced Background] ❌ 测试标签页已关闭');
        } catch (error) {
          console.warn('[Enhanced Background] ⚠️ 关闭标签页失败:', error.message);
        }
      }, 3000);
    }
  }

  async testRuntimeAPIs() {
    console.log('[Enhanced Background] ⚙️ Runtime API测试');
    
    // 获取manifest信息
    const manifest = chrome.runtime.getManifest();
    console.log('[Enhanced Background] 📋 扩展信息:', {
      name: manifest.name,
      version: manifest.version,
      id: chrome.runtime.id
    });

    // 设置Alarm用于追踪测试
    try {
      chrome.alarms.create('test_alarm', { delayInMinutes: 0.1 });
      console.log('[Enhanced Background] ⏰ 测试闹钟已设置');
    } catch (error) {
      console.warn('[Enhanced Background] ⚠️ Alarm设置失败:', error.message);
    }
  }
}

// Alarm处理 - Week 3测试目标
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'test_alarm') {
    console.log('[Enhanced Background] ⏰ 测试闹钟触发:', alarm);
    
    // 发送通知给content script
    chrome.tabs.query({ active: true }, (tabs) => {
      tabs.forEach(tab => {
        if (tab.id && tab.url && !tab.url.startsWith('chrome://')) {
          chrome.tabs.sendMessage(tab.id, {
            type: 'alarm_notification',
            alarm: alarm.name,
            timestamp: Date.now()
          }).catch(err => {
            console.log('[Enhanced Background] 💭 Content script可能未就绪:', err.message);
          });
        }
      });
    });
  }
});

// 扩展启动时初始化测试器
const messageTester = new MessageTester();

// Week 3测试：错误处理和日志级别测试
console.log('[Enhanced Background] ℹ️ Info级别日志');
console.warn('[Enhanced Background] ⚠️ Warning级别日志');
console.error('[Enhanced Background] ❌ Error级别日志测试(非真实错误)');

// Week 3测试：性能监控基准
console.log('[Enhanced Background] 📊 内存使用情况:', {
  used: performance.memory?.usedJSHeapSize || 'N/A',
  total: performance.memory?.totalJSHeapSize || 'N/A',
  limit: performance.memory?.jsHeapSizeLimit || 'N/A'
});

// Week 1测试：多级日志测试
console.log('[Enhanced Background] 📝 Week 1: 日志级别测试');
console.debug('[Enhanced Background] 🐛 DEBUG级别测试日志');
console.info('[Enhanced Background] ℹ️ INFO级别测试日志');
console.warn('[Enhanced Background] ⚠️ WARN级别测试日志');
console.error('[Enhanced Background] ❌ ERROR级别测试日志(测试用)');

// Week 2测试：存储变更监听
chrome.storage.onChanged.addListener((changes, areaName) => {
  console.log('[Enhanced Background] 💾 Week 2: Storage变更检测', {
    area: areaName,
    changes: Object.keys(changes),
    timestamp: Date.now()
  });
});

// Week 4测试：标签页生命周期监听
chrome.tabs.onCreated.addListener((tab) => {
  console.log('[Enhanced Background] 🆕 Week 4: 标签页创建', {
    id: tab.id,
    url: tab.url || tab.pendingUrl,
    timestamp: Date.now()
  });
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url && !tab.url.startsWith('chrome://')) {
    console.log('[Enhanced Background] 🔄 Week 4: 标签页加载完成', {
      id: tabId,
      url: tab.url,
      timestamp: Date.now()
    });
    
    // 发送加载完成消息到content script
    chrome.tabs.sendMessage(tabId, {
      type: 'tab-loaded',
      url: tab.url,
      timestamp: Date.now()
    }).catch(() => {
      // Content script可能还未就绪，这是正常的
    });
  }
});

chrome.tabs.onRemoved.addListener((tabId, removeInfo) => {
  console.log('[Enhanced Background] ❌ Week 4: 标签页关闭', {
    id: tabId,
    windowClosing: removeInfo.windowClosing,
    timestamp: Date.now()
  });
});

// Week 1-4综合测试：定期生成各种级别的日志
setInterval(() => {
  const logType = ['log', 'info', 'warn', 'error'][Math.floor(Math.random() * 4)];
  const message = `📊 定期${logType}消息`;
  const data = {
    timestamp: Date.now(),
    messageCount: messageTester.messageCount,
    type: 'periodic',
    level: logType
  };
  
  console[logType](`[Enhanced Background] ${message}`, data);
}, 30000); // 每30秒

// ========== Phase 1 性能测试模块 ==========

/**
 * 性能测试管理器
 * 用于模拟不同级别的性能影响，便于测试analyze_extension_performance工具
 */
class PerformanceTester {
  constructor() {
    this.isPerformanceTestMode = false;
    this.performanceLevel = 'medium'; // low, medium, high, extreme
    this.memoryCache = [];
    this.setupPerformanceTestHandlers();
    console.log('[Enhanced Background] 🎯 Phase 1: 性能测试模块已加载');
  }

  setupPerformanceTestHandlers() {
    // 监听性能测试命令
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.type === 'start_performance_test') {
        console.log('[Enhanced Background] 🚀 Phase 1: 启动性能测试模式', message.level);
        this.startPerformanceTest(message.level || 'medium');
        sendResponse({ success: true, mode: 'performance_test_started' });
      } else if (message.type === 'stop_performance_test') {
        console.log('[Enhanced Background] 🛑 Phase 1: 停止性能测试模式');
        this.stopPerformanceTest();
        sendResponse({ success: true, mode: 'performance_test_stopped' });
      }
    });
  }

  startPerformanceTest(level) {
    this.isPerformanceTestMode = true;
    this.performanceLevel = level;
    
    console.log(`[Enhanced Background] 🎯 性能测试启动 - 级别: ${level}`);
    
    // 根据级别执行不同强度的操作
    this.performanceLevelConfigs = {
      low: {
        cpuInterval: 1000,
        cpuDuration: 50,
        memorySize: 1024 * 100, // 100KB
        domOperations: 10
      },
      medium: {
        cpuInterval: 500,
        cpuDuration: 100,
        memorySize: 1024 * 1024, // 1MB
        domOperations: 50
      },
      high: {
        cpuInterval: 200,
        cpuDuration: 200,
        memorySize: 1024 * 1024 * 5, // 5MB
        domOperations: 100
      },
      extreme: {
        cpuInterval: 100,
        cpuDuration: 500,
        memorySize: 1024 * 1024 * 10, // 10MB
        domOperations: 200
      }
    };

    const config = this.performanceLevelConfigs[level] || this.performanceLevelConfigs.medium;

    // 1. CPU密集型操作
    this.cpuTestInterval = setInterval(() => {
      this.simulateCPULoad(config.cpuDuration);
    }, config.cpuInterval);

    // 2. 内存占用
    this.simulateMemoryUsage(config.memorySize);

    // 3. 通知content script执行DOM操作
    this.notifyContentScriptsForPerformanceTest(config.domOperations);

    console.log('[Enhanced Background] ✅ 性能测试配置应用完成');
  }

  stopPerformanceTest() {
    this.isPerformanceTestMode = false;
    
    if (this.cpuTestInterval) {
      clearInterval(this.cpuTestInterval);
      this.cpuTestInterval = null;
    }

    // 清理内存
    this.memoryCache = [];
    
    console.log('[Enhanced Background] ✅ 性能测试已停止，资源已释放');
  }

  /**
   * 模拟CPU密集型计算
   */
  simulateCPULoad(duration) {
    const start = performance.now();
    let result = 0;
    
    // 执行计算密集型操作
    while (performance.now() - start < duration) {
      // 斐波那契数列计算
      for (let i = 0; i < 1000; i++) {
        result += Math.sqrt(i) * Math.sin(i) * Math.cos(i);
      }
      
      // 字符串操作
      let str = 'performance test';
      for (let i = 0; i < 100; i++) {
        str = str.split('').reverse().join('');
      }
    }
    
    const elapsed = performance.now() - start;
    if (elapsed > 10) { // 只记录较长的操作
      console.log(`[Enhanced Background] ⚡ CPU测试: ${elapsed.toFixed(2)}ms`);
    }
  }

  /**
   * 模拟内存占用
   */
  simulateMemoryUsage(size) {
    console.log(`[Enhanced Background] 💾 分配内存: ${(size / 1024 / 1024).toFixed(2)}MB`);
    
    // 创建大数组占用内存
    const arraySize = Math.floor(size / 8); // 每个数字8字节
    const largeArray = new Array(arraySize);
    
    for (let i = 0; i < arraySize; i++) {
      largeArray[i] = Math.random() * 1000000;
    }
    
    this.memoryCache.push(largeArray);
    
    // 防止内存无限增长，保持最多5个数组
    if (this.memoryCache.length > 5) {
      this.memoryCache.shift();
    }
  }

  /**
   * 通知content scripts执行性能测试
   */
  async notifyContentScriptsForPerformanceTest(operations) {
    try {
      const tabs = await chrome.tabs.query({});
      
      for (const tab of tabs) {
        if (tab.id && tab.url && !tab.url.startsWith('chrome://')) {
          chrome.tabs.sendMessage(tab.id, {
            type: 'performance_test',
            operations: operations,
            level: this.performanceLevel
          }).catch(err => {
            // 忽略无法连接的标签页
          });
        }
      }
    } catch (error) {
      console.error('[Enhanced Background] ❌ 通知content script失败:', error);
    }
  }

  /**
   * 获取性能测试状态
   */
  getStatus() {
    return {
      enabled: this.isPerformanceTestMode,
      level: this.performanceLevel,
      memoryCacheSize: this.memoryCache.length,
      memoryUsageEstimate: this.memoryCache.reduce((sum, arr) => sum + arr.length * 8, 0)
    };
  }
}

// 创建性能测试实例
const performanceTester = new PerformanceTester();

// 定期轻度性能影响（模拟真实扩展行为）
setInterval(() => {
  // 模拟扩展的正常活动
  const lightCPUWork = () => {
    let result = 0;
    for (let i = 0; i < 10000; i++) {
      result += Math.sqrt(i);
    }
    return result;
  };
  
  lightCPUWork();
}, 5000); // 每5秒

// ===== 网络请求测试增强 =====
// 用于测试track_extension_network工具

// 定期发送网络请求（每30秒）
setInterval(async () => {
  try {
    // 1. 测试JSON API
    const jsonResponse = await fetch('https://httpbin.org/json');
    const jsonData = await jsonResponse.json();
    console.log('[Network Test] 📡 JSON API响应:', jsonData.slideshow?.title);
    
    // 2. 测试用户代理
    const uaResponse = await fetch('https://httpbin.org/user-agent');
    const uaData = await uaResponse.json();
    console.log('[Network Test] 🌐 User Agent:', uaData['user-agent']);
    
    // 3. 测试Headers
    const headersResponse = await fetch('https://httpbin.org/headers');
    const headersData = await headersResponse.json();
    console.log('[Network Test] 📋 Headers数量:', Object.keys(headersData.headers).length);
    
  } catch (error) {
    console.error('[Network Test] ❌ 网络请求失败:', error.message);
  }
}, 30000);

// 定期发送图片请求（每45秒）
setInterval(async () => {
  try {
    const imageUrls = [
      'https://httpbin.org/image/png',
      'https://httpbin.org/image/jpeg',
      'https://httpbin.org/image/webp'
    ];
    
    const randomUrl = imageUrls[Math.floor(Math.random() * imageUrls.length)];
    const response = await fetch(randomUrl);
    const blob = await response.blob();
    console.log('[Network Test] 🖼️ 图片下载:', blob.size, 'bytes');
  } catch (error) {
    console.error('[Network Test] ❌ 图片请求失败:', error.message);
  }
}, 45000);

// 定期测试不同HTTP方法（每60秒）
setInterval(async () => {
  try {
    // POST请求
    const postResponse = await fetch('https://httpbin.org/post', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        test: 'data',
        timestamp: Date.now(),
        source: 'mcp-test-extension'
      })
    });
    const postData = await postResponse.json();
    console.log('[Network Test] 📤 POST请求成功:', postData.json?.test);
    
  } catch (error) {
    console.error('[Network Test] ❌ POST请求失败:', error.message);
  }
}, 60000);

// ===== 手动网络测试触发器 =====
// 监听来自popup/content的网络测试请求
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'triggerNetworkTest') {
    console.log('[Network Test] 🎯 手动触发网络测试');
    performComprehensiveNetworkTest().then(() => {
      sendResponse({ success: true, message: 'Network test completed' });
    }).catch(error => {
      sendResponse({ success: false, error: error.message });
    });
    return true; // 保持消息通道开放
  }
});

// 综合网络测试函数
async function performComprehensiveNetworkTest() {
  console.log('[Network Test] 🚀 开始综合网络测试...');
  
  try {
    // 1. 多种资源类型测试
    const tests = [
      // JSON API
      { url: 'https://httpbin.org/json', type: 'json', method: 'GET' },
      // HTML
      { url: 'https://httpbin.org/html', type: 'html', method: 'GET' },
      // XML
      { url: 'https://httpbin.org/xml', type: 'xml', method: 'GET' },
      // 图片资源
      { url: 'https://httpbin.org/image/png', type: 'image', method: 'GET' },
      { url: 'https://httpbin.org/image/jpeg', type: 'image', method: 'GET' },
      // CSS
      { url: 'https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css', type: 'stylesheet', method: 'GET' },
      // JavaScript
      { url: 'https://cdn.jsdelivr.net/npm/axios@1.6.0/dist/axios.min.js', type: 'script', method: 'GET' },
      // POST请求
      { url: 'https://httpbin.org/post', type: 'json', method: 'POST', body: { test: 'data', timestamp: Date.now() } },
      // PUT请求
      { url: 'https://httpbin.org/put', type: 'json', method: 'PUT', body: { updated: true } },
      // DELETE请求
      { url: 'https://httpbin.org/delete', type: 'json', method: 'DELETE' },
      // 状态码测试
      { url: 'https://httpbin.org/status/200', type: 'status', method: 'GET' },
      { url: 'https://httpbin.org/status/404', type: 'status', method: 'GET' },
      // 延迟测试
      { url: 'https://httpbin.org/delay/1', type: 'delayed', method: 'GET' },
    ];
    
    const results = [];
    
    for (const test of tests) {
      try {
        const startTime = Date.now();
        const options = {
          method: test.method,
          headers: {
            'X-Test-Type': test.type,
            'X-Extension-Test': 'true'
          }
        };
        
        if (test.body) {
          options.headers['Content-Type'] = 'application/json';
          options.body = JSON.stringify(test.body);
        }
        
        const response = await fetch(test.url, options);
        const duration = Date.now() - startTime;
        
        results.push({
          url: test.url,
          type: test.type,
          method: test.method,
          status: response.status,
          duration,
          size: response.headers.get('content-length') || 'unknown'
        });
        
        console.log(`[Network Test] ✅ ${test.method} ${test.type}: ${response.status} (${duration}ms)`);
      } catch (error) {
        console.error(`[Network Test] ❌ ${test.method} ${test.type} 失败:`, error.message);
      }
      
      // 间隔一下，避免请求过快
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    console.log('[Network Test] 📊 测试完成，共', results.length, '个请求');
    return results;
    
  } catch (error) {
    console.error('[Network Test] ❌ 综合测试失败:', error);
    throw error;
  }
}

// 立即执行一次综合测试（用于初始化验证）
setTimeout(() => {
  performComprehensiveNetworkTest().catch(console.error);
}, 3000);

console.log('[Enhanced Background] ✅ v4.2初始化完成 - Week 1-4全功能 + Phase 1.3网络监控测试就绪');
console.log('[Network Test] 🌐 网络测试增强已启用 - 支持13种请求类型，可手动触发');
