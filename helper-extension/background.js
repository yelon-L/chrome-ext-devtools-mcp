/**
 * MCP Service Worker Activator - Background Script
 * 
 * 功能：使用 chrome.debugger API 激活目标扩展的 Service Worker
 */

console.log('[MCP Helper] Service Worker 已启动');

// 存储激活请求队列
const activationQueue = new Map();

/**
 * 核心功能：激活目标扩展的 Service Worker
 */
async function activateExtensionServiceWorker(extensionId) {
  console.log(`[MCP Helper] 开始激活扩展: ${extensionId}`);
  
  try {
    // 验证扩展是否存在
    const extensions = await chrome.management.getAll();
    const targetExt = extensions.find(ext => ext.id === extensionId);
    
    if (!targetExt) {
      throw new Error(`Extension not found: ${extensionId}`);
    }
    
    if (!targetExt.enabled) {
      throw new Error(`Extension is disabled: ${extensionId}`);
    }
    
    console.log(`[MCP Helper] 找到目标扩展: ${targetExt.name}`);
    
    // 方法 1: 使用 chrome.debugger API
    return await activateViaDebugger(extensionId);
    
  } catch (error) {
    console.error(`[MCP Helper] 激活失败:`, error);
    return {
      success: false,
      error: error.message,
      stack: error.stack
    };
  }
}

/**
 * 通过 Debugger API 激活
 */
async function activateViaDebugger(extensionId) {
  return new Promise((resolve, reject) => {
    console.log(`[MCP Helper] 尝试 attach debugger...`);
    
    // Attach debugger
    chrome.debugger.attach({extensionId}, "1.3", async () => {
      if (chrome.runtime.lastError) {
        console.error(`[MCP Helper] Attach 失败:`, chrome.runtime.lastError);
        resolve({
          success: false,
          error: chrome.runtime.lastError.message
        });
        return;
      }
      
      console.log(`[MCP Helper] Debugger attached 成功`);
      
      try {
        // 执行多个激活方法
        const methods = [
          // 方法 1: 访问 storage API
          'chrome.storage.local.get(null)',
          // 方法 2: 访问 runtime API
          'chrome.runtime.getManifest()',
          // 方法 3: 访问 tabs API
          'chrome.tabs.query({})',
          // 方法 4: Service Worker 自身方法
          'self.clients.matchAll()',
        ];
        
        for (const code of methods) {
          console.log(`[MCP Helper] 执行代码: ${code}`);
          
          await new Promise((resolveEval) => {
            chrome.debugger.sendCommand(
              {extensionId},
              "Runtime.evaluate",
              {
                expression: `(async () => { try { await ${code}; return true; } catch(e) { return false; } })()`,
                awaitPromise: true
              },
              (result) => {
                if (result && result.result && result.result.value) {
                  console.log(`[MCP Helper] ${code} 执行成功`);
                }
                resolveEval();
              }
            );
          });
          
          // 等待 API 初始化
          await new Promise(r => setTimeout(r, 200));
        }
        
        // 验证激活
        const isActive = await verifyActivation(extensionId);
        
        // Detach debugger
        chrome.debugger.detach({extensionId}, () => {
          console.log(`[MCP Helper] Debugger detached`);
        });
        
        resolve({
          success: isActive,
          method: 'debugger',
          message: isActive ? 'Service Worker activated successfully' : 'Activation attempted but verification failed'
        });
        
      } catch (error) {
        // Detach on error
        chrome.debugger.detach({extensionId});
        
        resolve({
          success: false,
          error: error.message
        });
      }
    });
  });
}

/**
 * 验证 Service Worker 是否已激活
 */
async function verifyActivation(extensionId) {
  return new Promise((resolve) => {
    chrome.debugger.sendCommand(
      {extensionId},
      "Runtime.evaluate",
      {
        expression: 'typeof chrome !== "undefined" && typeof chrome.storage !== "undefined"',
        returnByValue: true
      },
      (result) => {
        if (chrome.runtime.lastError) {
          resolve(false);
        } else {
          resolve(result && result.result && result.result.value === true);
        }
      }
    );
  });
}

/**
 * 监听来自外部的消息（通过 externally_connectable）
 */
chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
  console.log('[MCP Helper] 收到外部消息:', message);
  
  if (message.action === 'activate') {
    const {extensionId} = message;
    
    activateExtensionServiceWorker(extensionId)
      .then(result => {
        console.log('[MCP Helper] 激活结果:', result);
        sendResponse(result);
      })
      .catch(error => {
        sendResponse({
          success: false,
          error: error.message
        });
      });
    
    // 返回 true 表示异步响应
    return true;
  }
  
  if (message.action === 'ping') {
    sendResponse({
      success: true,
      helperVersion: '1.0.0',
      available: true
    });
    return false;
  }
  
  sendResponse({
    success: false,
    error: 'Unknown action'
  });
  return false;
});

/**
 * 监听来自同源页面的连接请求
 * 这允许通过 chrome.runtime.sendMessage 从网页调用
 */
chrome.runtime.onConnect.addListener((port) => {
  console.log('[MCP Helper] Port connected:', port.name);
  
  port.onMessage.addListener((message) => {
    console.log('[MCP Helper] Port message:', message);
    
    if (message.action === 'activate') {
      activateExtensionServiceWorker(message.extensionId)
        .then(result => {
          port.postMessage({type: 'result', data: result});
        })
        .catch(error => {
          port.postMessage({
            type: 'error',
            error: error.message
          });
        });
    }
  });
});

/**
 * 安装时的初始化
 */
chrome.runtime.onInstalled.addListener((details) => {
  console.log('[MCP Helper] Installed:', details.reason);
  
  if (details.reason === 'install') {
    console.log('[MCP Helper] 首次安装，准备就绪');
  } else if (details.reason === 'update') {
    console.log('[MCP Helper] 更新到新版本');
  }
});

/**
 * 保持 Service Worker 活跃（可选）
 * 注意：这会消耗资源，仅用于调试
 */
if (false) {  // 默认关闭，需要时启用
  setInterval(() => {
    console.log('[MCP Helper] Keepalive ping');
  }, 20000);
}

console.log('[MCP Helper] 初始化完成，准备接收激活请求');
