/**
 * Enhanced Content Script for Week 1-4 全功能测试
 * Week 1: 日志增强、内容脚本注入检测
 * Week 2: 上下文管理、存储交互
 * Week 3: 消息传递、性能监控
 * Week 4: 批量测试场景、DOM交互
 */

console.log('[Enhanced Content] 🚀 Enhanced Content Script v4.0 开始初始化');
console.log('[Enhanced Content] 📋 URL:', window.location.href);

class ContentScriptTester {
  constructor() {
    this.messageCount = 0;
    this.performanceMarks = [];
    this.init();
  }

  async init() {
    console.log('[Enhanced Content] 🔧 初始化增强测试功能');
    
    // Week 3测试：性能标记
    performance.mark('content-script-init-start');
    
    this.setupMessageHandlers();
    this.setupDOMObserver();
    this.startPeriodicTests();
    this.injectTestIndicator();
    
    performance.mark('content-script-init-end');
    performance.measure('content-script-init', 'content-script-init-start', 'content-script-init-end');
    
    const initMeasure = performance.getEntriesByName('content-script-init')[0];
    console.log('[Enhanced Content] ⏱️ 初始化耗时:', initMeasure.duration, 'ms');
    
    // Week 3测试：向background发送初始化完成消息
    this.sendMessageToBackground('content_script_ready', {
      url: window.location.href,
      timestamp: Date.now(),
      initDuration: initMeasure.duration
    });
  }

  setupMessageHandlers() {
    // Week 3测试：监听来自background的消息
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      console.log('[Enhanced Content] 📨 收到Background消息:', message);
      
      const startTime = performance.now();
      
      switch (message.type) {
        case 'background_test_message':
          console.log('[Enhanced Content] 🏓 处理Background测试消息');
          this.handleBackgroundTestMessage(message);
          sendResponse({ 
            success: true, 
            received: true,
            processingTime: performance.now() - startTime
          });
          break;
          
        case 'alarm_notification':
          console.log('[Enhanced Content] ⏰ 收到闹钟通知');
          this.displayNotification('闹钟触发: ' + message.alarm);
          sendResponse({ 
            success: true, 
            notificationShown: true,
            processingTime: performance.now() - startTime
          });
          break;
          
        case 'performance_test':
          console.log('[Enhanced Content] 📊 执行性能测试');
          const perfData = this.generatePerformanceData();
          sendResponse({
            success: true,
            performanceData: perfData,
            processingTime: performance.now() - startTime
          });
          break;
          
        default:
          console.log('[Enhanced Content] ❓ 未知消息类型:', message.type);
          sendResponse({ 
            success: false, 
            error: '未知消息类型',
            processingTime: performance.now() - startTime
          });
      }
    });
  }

  setupDOMObserver() {
    // Week 3测试：DOM变化监控
    const observer = new MutationObserver((mutations) => {
      const addedNodes = mutations.reduce((sum, mut) => sum + mut.addedNodes.length, 0);
      const removedNodes = mutations.reduce((sum, mut) => sum + mut.removedNodes.length, 0);
      
      if (addedNodes > 0 || removedNodes > 0) {
        console.log('[Enhanced Content] 🔄 DOM变化检测:', {
          added: addedNodes,
          removed: removedNodes,
          timestamp: Date.now()
        });
        
        // 定期向background报告DOM活动
        if (Math.random() < 0.1) { // 10%概率发送报告
          this.sendMessageToBackground('dom_activity_report', {
            addedNodes,
            removedNodes,
            url: window.location.href,
            timestamp: Date.now()
          });
        }
      }
    });

    observer.observe(document.body || document.documentElement, {
      childList: true,
      subtree: true,
      attributes: false
    });
  }

  startPeriodicTests() {
    // Week 3测试：定期发送测试消息
    setInterval(() => {
      this.sendPeriodicTestMessage();
    }, 12000); // 每12秒

    // Week 3测试：定期性能检查
    setInterval(() => {
      this.performanceCheck();
    }, 20000); // 每20秒

    // Week 3测试：定期API调用测试
    setInterval(() => {
      this.testContentScriptAPIs();
    }, 25000); // 每25秒
  }

  async sendMessageToBackground(type, data) {
    try {
      console.log('[Enhanced Content] 📤 发送消息到Background:', type);
      
      const message = {
        type,
        data,
        sender: 'enhanced-content-script',
        timestamp: Date.now(),
        url: window.location.href
      };
      
      const response = await chrome.runtime.sendMessage(message);
      console.log('[Enhanced Content] ✅ Background响应:', response);
      
      return response;
    } catch (error) {
      console.error('[Enhanced Content] ❌ 发送消息失败:', error);
      return { success: false, error: error.message };
    }
  }

  sendPeriodicTestMessage() {
    this.messageCount++;
    
    const testData = {
      messageId: `content_${this.messageCount}`,
      timestamp: Date.now(),
      url: window.location.href,
      documentTitle: document.title,
      scrollPosition: {
        x: window.scrollX,
        y: window.scrollY
      },
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight
      }
    };

    this.sendMessageToBackground('periodic_test_ping', testData);
  }

  performanceCheck() {
    console.log('[Enhanced Content] 📊 执行性能检查');
    
    const perfData = this.generatePerformanceData();
    
    // Week 3测试：发送性能数据到background
    this.sendMessageToBackground('performance_report', {
      performanceData: perfData,
      memoryInfo: performance.memory ? {
        used: performance.memory.usedJSHeapSize,
        total: performance.memory.totalJSHeapSize,
        limit: performance.memory.jsHeapSizeLimit
      } : null
    });
  }

  generatePerformanceData() {
    const navigation = performance.getEntriesByType('navigation')[0];
    
    return {
      timestamp: Date.now(),
      navigation: navigation ? {
        domContentLoaded: navigation.domContentLoadedEventEnd - navigation.domContentLoadedEventStart,
        loadComplete: navigation.loadEventEnd - navigation.loadEventStart,
        responseTime: navigation.responseEnd - navigation.requestStart
      } : null,
      timing: {
        domReady: document.readyState,
        scriptsLoaded: performance.now()
      },
      resources: performance.getEntriesByType('resource').length,
      measures: performance.getEntriesByType('measure').length
    };
  }

  testContentScriptAPIs() {
    console.log('[Enhanced Content] 🧪 Content Script API测试');
    
    // Week 3测试：测试各种可用的API
    const apiTests = {
      runtime: {
        id: chrome.runtime?.id || 'not available',
        getManifest: typeof chrome.runtime?.getManifest === 'function'
      },
      storage: {
        local: typeof chrome.storage?.local !== 'undefined',
        sync: typeof chrome.storage?.sync !== 'undefined'
      }
    };

    console.log('[Enhanced Content] 📋 可用API检查:', apiTests);
    
    // 向background发送API可用性报告
    this.sendMessageToBackground('api_availability_report', apiTests);
  }

  handleBackgroundTestMessage(message) {
    console.log('[Enhanced Content] 🎯 处理Background测试消息:', message.data);
    
    // 在页面上显示测试消息
    this.displayNotification(`收到测试消息 #${message.data.counter}`);
    
    // Week 3测试：记录消息处理性能
    const processingTime = performance.now();
    console.log('[Enhanced Content] ⏱️ 消息处理时间:', processingTime, 'ms');
  }

  injectTestIndicator() {
    // Week 3测试：创建可视化测试指示器
    const indicator = document.createElement('div');
    indicator.id = 'enhanced-mcp-test-indicator';
    indicator.style.cssText = `
      position: fixed;
      top: 10px;
      right: 10px;
      background: linear-gradient(45deg, #4CAF50, #45a049);
      color: white;
      padding: 8px 12px;
      border-radius: 20px;
      font-family: 'Arial', sans-serif;
      font-size: 12px;
      font-weight: bold;
      z-index: 999999;
      box-shadow: 0 2px 10px rgba(0,0,0,0.3);
      transition: all 0.3s ease;
      cursor: pointer;
    `;
    indicator.textContent = '📡 Enhanced MCP Test';
    indicator.title = 'Enhanced MCP Debug Test Extension - Week 3功能测试中';
    
    // 点击显示扩展信息
    indicator.addEventListener('click', () => {
      this.showExtensionInfo();
    });
    
    document.body.appendChild(indicator);
    console.log('[Enhanced Content] 🔰 测试指示器已创建');
  }

  displayNotification(message) {
    // Week 3测试：显示消息通知
    const notification = document.createElement('div');
    notification.style.cssText = `
      position: fixed;
      top: 50px;
      right: 10px;
      background: #2196F3;
      color: white;
      padding: 10px 15px;
      border-radius: 5px;
      font-family: Arial, sans-serif;
      font-size: 13px;
      z-index: 999998;
      box-shadow: 0 2px 10px rgba(0,0,0,0.3);
      max-width: 300px;
      word-wrap: break-word;
    `;
    notification.textContent = message;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
      if (notification.parentNode) {
        notification.parentNode.removeChild(notification);
      }
    }, 3000);
  }

  async showExtensionInfo() {
    try {
      console.log('[Enhanced Content] 📋 获取扩展信息');
      
      const response = await this.sendMessageToBackground('get_extension_info', {
        requestTime: Date.now()
      });
      
      if (response.success) {
        const info = `
扩展名称: ${response.data.manifest?.name}
扩展版本: ${response.data.manifest?.version}
扩展ID: ${response.data.id}
消息计数: ${this.messageCount}
当前页面: ${window.location.href}
        `.trim();
        
        alert(info);
      }
    } catch (error) {
      console.error('[Enhanced Content] ❌ 获取扩展信息失败:', error);
    }
  }
}

// Week 3测试：等待DOM就绪后初始化
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    new ContentScriptTester();
  });
} else {
  new ContentScriptTester();
}

// Week 1测试：多级日志测试
console.debug('[Enhanced Content] 🐛 DEBUG级别日志');
console.log('[Enhanced Content] 📝 LOG级别日志');
console.info('[Enhanced Content] ℹ️ INFO级别日志');
console.warn('[Enhanced Content] ⚠️ WARN级别日志');
console.error('[Enhanced Content] ❌ ERROR级别日志测试(非真实错误)');

// Week 2测试：Storage API交互
chrome.storage.local.get(['test_from_content'], (result) => {
  console.log('[Enhanced Content] 💾 Week 2: 读取Storage数据', result);
});

chrome.storage.local.set({
  'content_script_marker': {
    url: window.location.href,
    timestamp: Date.now(),
    injected: true
  }
}, () => {
  console.log('[Enhanced Content] 💾 Week 2: 写入Content Script标记');
});

// Week 4测试：监听tab-loaded消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'tab-loaded') {
    console.log('[Enhanced Content] 📨 Week 4: 收到background消息:', message.type);
    console.info('[Enhanced Content] 🔄 Background确认标签页加载');
    sendResponse({ received: true, contentScriptActive: true });
  }
});

// Week 4测试：页面特征标记（用于批量测试验证）
document.documentElement.setAttribute('data-mcp-extension-injected', 'true');
document.documentElement.setAttribute('data-mcp-extension-version', '4.0.0');
console.log('[Enhanced Content] 🏷️ Week 4: 页面特征标记已添加');

// Week 1-4综合：定期心跳日志
let heartbeatCount = 0;
setInterval(() => {
  heartbeatCount++;
  console.log('[Enhanced Content] 💓 心跳检测', {
    count: heartbeatCount,
    url: window.location.href,
    timestamp: Date.now()
  });
}, 60000); // 每60秒

// ========== Phase 1 性能测试模块 ==========

/**
 * Content Script性能测试管理器
 * 响应background的性能测试命令，执行DOM操作等影响页面性能的操作
 */
class ContentPerformanceTester {
  constructor() {
    this.testElements = [];
    this.isActive = false;
    this.setupMessageHandler();
    console.log('[Enhanced Content] 🎯 Phase 1: 性能测试模块已加载');
  }

  setupMessageHandler() {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.type === 'performance_test') {
        console.log('[Enhanced Content] 🚀 Phase 1: 收到性能测试命令', message);
        this.executePerformanceTest(message.operations, message.level);
        sendResponse({ success: true, executed: true });
      }
    });
  }

  executePerformanceTest(operations, level) {
    this.isActive = true;
    console.log(`[Enhanced Content] 🎯 执行性能测试 - 操作数: ${operations}, 级别: ${level}`);

    // 1. DOM操作测试
    this.performDOMOperations(operations);

    // 2. Layout触发
    this.triggerLayoutOperations(operations / 2);

    // 3. Paint触发
    this.triggerPaintOperations(operations / 4);

    // 4. JavaScript执行时间
    this.executeJavaScriptWork(level);

    console.log('[Enhanced Content] ✅ 性能测试执行完成');
  }

  /**
   * 执行DOM操作
   */
  performDOMOperations(count) {
    const container = document.createElement('div');
    container.id = 'mcp-performance-test-container';
    container.style.cssText = 'position:fixed;top:-9999px;left:-9999px;';
    
    console.log(`[Enhanced Content] 📦 创建 ${count} 个DOM元素`);
    
    for (let i = 0; i < count; i++) {
      const element = document.createElement('div');
      element.className = 'mcp-test-element';
      element.textContent = `Performance Test Element ${i}`;
      element.style.cssText = `
        width: 100px;
        height: 100px;
        background: hsl(${i * 360 / count}, 70%, 50%);
        margin: 5px;
        padding: 10px;
        border: 1px solid black;
        box-shadow: 0 2px 4px rgba(0,0,0,0.1);
      `;
      container.appendChild(element);
      this.testElements.push(element);
    }
    
    if (document.body) {
      document.body.appendChild(container);
    }
  }

  /**
   * 触发Layout操作
   */
  triggerLayoutOperations(count) {
    console.log(`[Enhanced Content] 📐 触发 ${count} 次Layout`);
    
    for (let i = 0; i < count; i++) {
      if (this.testElements[i]) {
        // 强制Layout
        const height = this.testElements[i].offsetHeight;
        this.testElements[i].style.height = (height + 1) + 'px';
      }
    }
  }

  /**
   * 触发Paint操作
   */
  triggerPaintOperations(count) {
    console.log(`[Enhanced Content] 🎨 触发 ${count} 次Paint`);
    
    for (let i = 0; i < count; i++) {
      if (this.testElements[i]) {
        // 改变视觉属性触发Paint
        this.testElements[i].style.backgroundColor = `hsl(${Math.random() * 360}, 70%, 50%)`;
      }
    }
  }

  /**
   * JavaScript执行工作
   */
  executeJavaScriptWork(level) {
    console.log(`[Enhanced Content] ⚡ 执行JavaScript计算 - 级别: ${level}`);
    
    const iterations = {
      low: 10000,
      medium: 50000,
      high: 100000,
      extreme: 200000
    };

    const count = iterations[level] || iterations.medium;
    const start = performance.now();
    
    let result = 0;
    for (let i = 0; i < count; i++) {
      result += Math.sqrt(i) * Math.sin(i / 100) * Math.cos(i / 100);
    }
    
    const elapsed = performance.now() - start;
    console.log(`[Enhanced Content] ⚡ JavaScript计算完成: ${elapsed.toFixed(2)}ms, 结果: ${result.toFixed(2)}`);
  }

  /**
   * 清理测试元素
   */
  cleanup() {
    const container = document.getElementById('mcp-performance-test-container');
    if (container) {
      container.remove();
    }
    this.testElements = [];
    this.isActive = false;
    console.log('[Enhanced Content] 🧹 性能测试元素已清理');
  }
}

// 创建content性能测试实例
const contentPerformanceTester = new ContentPerformanceTester();

// 定期轻度DOM操作（模拟真实扩展行为）
setInterval(() => {
  if (!contentPerformanceTester.isActive) {
    // 轻度DOM查询操作
    const elements = document.querySelectorAll('a, button, input');
    let count = 0;
    elements.forEach(el => {
      if (el.offsetWidth > 0) count++;
    });
    
    if (count > 0 && Math.random() > 0.95) {
      console.log(`[Enhanced Content] 📊 扫描到 ${count} 个可交互元素`);
    }
  }
}, 3000); // 每3秒

// 更新版本标记
document.documentElement.setAttribute('data-mcp-extension-version', '4.1.0');
document.documentElement.setAttribute('data-mcp-performance-test-ready', 'true');

console.log('[Enhanced Content] ✅ v4.1加载完成 - Week 1-4全功能 + Phase 1性能测试就绪');
