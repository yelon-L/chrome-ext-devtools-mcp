/**
 * Popup脚本
 * 用于测试MCP工具对popup页面的检测和交互
 */

console.log('[Popup] 🚀 Popup页面初始化');

// 页面加载完成后执行
document.addEventListener('DOMContentLoaded', async () => {
  console.log('[Popup] 📱 DOM加载完成');
  
  // 初始化按钮事件
  initializeButtons();
  
  // 加载扩展信息
  await loadExtensionInfo();
  
  // 定期更新状态
  setInterval(updateStatus, 2000);
  
  console.log('[Popup] ✅ Popup初始化完成');
});

function initializeButtons() {
  // Quick Test按钮
  document.getElementById('quickTest')?.addEventListener('click', async () => {
    console.log('[Popup] 🧪 执行快速测试');
    
    try {
      // 发送消息到background
      const response = await chrome.runtime.sendMessage({
        type: 'popup_quick_test',
        timestamp: Date.now()
      });
      
      console.log('[Popup] ✅ 快速测试完成:', response);
      showNotification('快速测试完成', 'success');
    } catch (error) {
      console.error('[Popup] ❌ 快速测试失败:', error);
      showNotification('测试失败: ' + error.message, 'error');
    }
  });
  
  // Full Test按钮
  document.getElementById('fullTest')?.addEventListener('click', async () => {
    console.log('[Popup] 🔬 执行完整测试');
    
    try {
      const tabs = await chrome.tabs.query({});
      console.log('[Popup] 📊 当前标签数:', tabs.length);
      
      // 向所有标签页发送测试消息
      let successCount = 0;
      for (const tab of tabs) {
        if (tab.url && !tab.url.startsWith('chrome://')) {
          try {
            await chrome.tabs.sendMessage(tab.id, {
              type: 'popup_full_test',
              timestamp: Date.now()
            });
            successCount++;
          } catch (e) {
            console.warn('[Popup] ⚠️ Tab', tab.id, '消息发送失败');
          }
        }
      }
      
      console.log('[Popup] ✅ 完整测试完成:', successCount, '个标签页');
      showNotification(`测试已发送到 ${successCount} 个标签页`, 'success');
    } catch (error) {
      console.error('[Popup] ❌ 完整测试失败:', error);
      showNotification('测试失败: ' + error.message, 'error');
    }
  });
  
  // Open Options按钮
  document.getElementById('openOptions')?.addEventListener('click', () => {
    console.log('[Popup] ⚙️ 打开Options页面');
    chrome.runtime.openOptionsPage();
  });
  
  // Performance Test按钮
  document.getElementById('perfTest')?.addEventListener('click', async () => {
    console.log('[Popup] 📊 开始性能测试');
    
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'popup_performance_test',
        timestamp: Date.now()
      });
      
      console.log('[Popup] ✅ 性能测试触发:', response);
      showNotification('性能测试已触发', 'info');
    } catch (error) {
      console.error('[Popup] ❌ 性能测试失败:', error);
      showNotification('测试失败: ' + error.message, 'error');
    }
  });
  
  console.log('[Popup] 🎛️ 按钮事件绑定完成');
}

async function loadExtensionInfo() {
  try {
    const manifest = chrome.runtime.getManifest();
    
    // 更新扩展信息
    document.getElementById('extensionName').textContent = manifest.name;
    document.getElementById('extensionVersion').textContent = manifest.version;
    document.getElementById('extensionId').textContent = chrome.runtime.id;
    
    // 获取标签统计
    const tabs = await chrome.tabs.query({});
    document.getElementById('tabCount').textContent = tabs.length;
    
    // 获取存储使用情况
    const storage = await chrome.storage.local.get(null);
    const storageSize = JSON.stringify(storage).length;
    document.getElementById('storageUsage').textContent = `${storageSize} bytes`;
    
    console.log('[Popup] 📋 扩展信息加载完成');
  } catch (error) {
    console.error('[Popup] ❌ 加载扩展信息失败:', error);
  }
}

async function updateStatus() {
  try {
    // 更新标签数
    const tabs = await chrome.tabs.query({});
    document.getElementById('tabCount').textContent = tabs.length;
    
    // 更新存储使用
    const storage = await chrome.storage.local.get(null);
    const storageSize = JSON.stringify(storage).length;
    document.getElementById('storageUsage').textContent = `${storageSize} bytes`;
    
    // 更新内存使用（如果可用）
    if (performance.memory) {
      const memoryUsed = Math.round(performance.memory.usedJSHeapSize / 1024 / 1024);
      document.getElementById('memoryUsage').textContent = `${memoryUsed}MB`;
    }
  } catch (error) {
    // 静默失败
  }
}

function showNotification(message, type = 'info') {
  const notification = document.getElementById('notification');
  if (!notification) return;
  
  notification.textContent = message;
  notification.className = `notification ${type}`;
  notification.style.display = 'block';
  
  setTimeout(() => {
    notification.style.display = 'none';
  }, 3000);
}

// 监听来自background的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[Popup] 📨 收到消息:', message);
  
  if (message.type === 'update_popup_status') {
    showNotification(message.message, message.level || 'info');
  }
  
  sendResponse({ received: true });
  return true;
});

console.log('[Popup] 📡 消息监听器已注册');


