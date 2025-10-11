/**
 * Helper Extension Generator
 * 
 * 动态生成临时 Helper Extension，实现用户无感的自动激活
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

/**
 * Helper Extension 的完整代码（嵌入式）
 */
const HELPER_MANIFEST = {
  manifest_version: 3,
  name: 'MCP Service Worker Activator (Auto-Generated)',
  version: '1.0.0',
  description: 'Automatically generated helper for chrome-ext-devtools-mcp',
  permissions: ['management', 'debugger'],
  background: {
    service_worker: 'background.js',
  },
  externally_connectable: {
    matches: ['http://localhost:*/*', 'http://127.0.0.1:*/*'],
  },
};

const HELPER_BACKGROUND_JS = `
/**
 * MCP Service Worker Activator - Auto-Generated
 */

console.log('[MCP Helper] Auto-generated Service Worker 已启动');

async function activateExtensionServiceWorker(extensionId) {
  console.log(\`[MCP Helper] 开始激活扩展: \${extensionId}\`);
  
  try {
    const extensions = await chrome.management.getAll();
    const targetExt = extensions.find(ext => ext.id === extensionId);
    
    if (!targetExt) {
      throw new Error(\`Extension not found: \${extensionId}\`);
    }
    
    if (!targetExt.enabled) {
      throw new Error(\`Extension is disabled: \${extensionId}\`);
    }
    
    console.log(\`[MCP Helper] 找到目标扩展: \${targetExt.name}\`);
    
    return await activateViaDebugger(extensionId);
  } catch (error) {
    console.error(\`[MCP Helper] 激活失败:\`, error);
    return {
      success: false,
      error: error.message,
    };
  }
}

async function activateViaDebugger(extensionId) {
  return new Promise((resolve) => {
    console.log(\`[MCP Helper] 尝试 attach debugger...\`);
    
    chrome.debugger.attach({extensionId}, "1.3", async () => {
      if (chrome.runtime.lastError) {
        console.error(\`[MCP Helper] Attach 失败:\`, chrome.runtime.lastError);
        resolve({
          success: false,
          error: chrome.runtime.lastError.message
        });
        return;
      }
      
      console.log(\`[MCP Helper] Debugger attached 成功\`);
      
      try {
        const methods = [
          'chrome.storage.local.get(null)',
          'chrome.runtime.getManifest()',
          'chrome.tabs.query({})',
          'self.clients.matchAll()',
        ];
        
        for (const code of methods) {
          console.log(\`[MCP Helper] 执行代码: \${code}\`);
          
          await new Promise((resolveEval) => {
            chrome.debugger.sendCommand(
              {extensionId},
              "Runtime.evaluate",
              {
                expression: \`(async () => { try { await \${code}; return true; } catch(e) { return false; } })()\`,
                awaitPromise: true
              },
              () => {
                resolveEval();
              }
            );
          });
          
          await new Promise(r => setTimeout(r, 200));
        }
        
        const isActive = await verifyActivation(extensionId);
        
        chrome.debugger.detach({extensionId}, () => {
          console.log(\`[MCP Helper] Debugger detached\`);
        });
        
        resolve({
          success: isActive,
          method: 'debugger',
          message: isActive ? 'Service Worker activated successfully' : 'Activation attempted'
        });
        
      } catch (error) {
        chrome.debugger.detach({extensionId});
        resolve({
          success: false,
          error: error.message
        });
      }
    });
  });
}

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
    
    return true;
  }
  
  if (message.action === 'ping') {
    sendResponse({
      success: true,
      helperVersion: '1.0.0-autogen',
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

chrome.runtime.onInstalled.addListener((details) => {
  console.log('[MCP Helper] Auto-generated helper installed:', details.reason);
});

console.log('[MCP Helper] 初始化完成，准备接收激活请求');
`;

/**
 * 生成一个 1x1 透明 PNG（Base64）
 */
const TRANSPARENT_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

export class HelperExtensionGenerator {
  private tempDir: string | null = null;
  private generated: boolean = false;

  /**
   * 生成临时 Helper Extension
   */
  async generateHelperExtension(): Promise<string> {
    if (this.tempDir && this.generated) {
      console.log('[HelperGen] ✅ Helper Extension 已存在，重用');
      return this.tempDir;
    }

    console.log('[HelperGen] 🔧 开始生成临时 Helper Extension...');

    // 创建临时目录
    const tempBase = path.join(os.tmpdir(), 'mcp-helper-extension');
    this.tempDir = `${tempBase}-${Date.now()}`;

    await fs.promises.mkdir(this.tempDir, {recursive: true});

    // 写入 manifest.json
    await fs.promises.writeFile(
      path.join(this.tempDir, 'manifest.json'),
      JSON.stringify(HELPER_MANIFEST, null, 2),
      'utf-8',
    );

    // 写入 background.js
    await fs.promises.writeFile(
      path.join(this.tempDir, 'background.js'),
      HELPER_BACKGROUND_JS,
      'utf-8',
    );

    // 生成图标文件（简单的透明 PNG）
    const iconBuffer = Buffer.from(TRANSPARENT_PNG_BASE64, 'base64');
    await fs.promises.writeFile(path.join(this.tempDir, 'icon16.png'), iconBuffer);
    await fs.promises.writeFile(path.join(this.tempDir, 'icon48.png'), iconBuffer);
    await fs.promises.writeFile(path.join(this.tempDir, 'icon128.png'), iconBuffer);

    this.generated = true;

    console.log(`[HelperGen] ✅ Helper Extension 已生成: ${this.tempDir}`);
    console.log(`[HelperGen] 📁 包含文件:`);
    console.log(`[HelperGen]    - manifest.json`);
    console.log(`[HelperGen]    - background.js`);
    console.log(`[HelperGen]    - icon*.png (3个)`);

    return this.tempDir;
  }

  /**
   * 获取已生成的 Helper Extension 路径
   */
  getHelperPath(): string | null {
    return this.tempDir;
  }

  /**
   * 检查是否已生成
   */
  isGenerated(): boolean {
    return this.generated;
  }

  /**
   * 清理临时文件（可选）
   */
  async cleanup(): Promise<void> {
    if (!this.tempDir || !this.generated) {
      return;
    }

    try {
      console.log(`[HelperGen] 🧹 清理临时文件: ${this.tempDir}`);
      await fs.promises.rm(this.tempDir, {recursive: true, force: true});
      this.tempDir = null;
      this.generated = false;
      console.log('[HelperGen] ✅ 清理完成');
    } catch (error) {
      console.warn('[HelperGen] ⚠️  清理失败（可忽略）:', error);
    }
  }

  /**
   * 获取所有临时目录（用于批量清理）
   */
  static async getAllTempDirs(): Promise<string[]> {
    const tempBase = path.join(os.tmpdir(), 'mcp-helper-extension');
    const tmpDir = os.tmpdir();

    try {
      const entries = await fs.promises.readdir(tmpDir);
      const helperDirs = entries
        .filter(entry => entry.startsWith('mcp-helper-extension-'))
        .map(entry => path.join(tmpDir, entry));

      return helperDirs;
    } catch (error) {
      return [];
    }
  }

  /**
   * 清理所有旧的临时目录
   */
  static async cleanupAllTempDirs(): Promise<number> {
    const dirs = await HelperExtensionGenerator.getAllTempDirs();
    let cleanedCount = 0;

    for (const dir of dirs) {
      try {
        await fs.promises.rm(dir, {recursive: true, force: true});
        cleanedCount++;
      } catch (error) {
        // 忽略错误
      }
    }

    if (cleanedCount > 0) {
      console.log(`[HelperGen] 🧹 清理了 ${cleanedCount} 个旧的临时目录`);
    }

    return cleanedCount;
  }
}
