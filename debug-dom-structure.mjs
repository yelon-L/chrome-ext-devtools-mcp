#!/usr/bin/env node
/**
 * 调试 chrome://extensions 的实际DOM结构
 */

import { EventSource } from 'eventsource';
import fetch from 'node-fetch';

const SERVER_URL = 'http://localhost:32122';
const USER_ID = 'debug-dom';
const CHROME_URL = 'http://localhost:9222';

let sessionId = null;
let messageId = 1;
const pendingRequests = new Map();

async function main() {
  try {
    // 注册
    await fetch(`${SERVER_URL}/api/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: USER_ID, browserURL: CHROME_URL })
    });

    // 连接SSE
    const eventSource = new EventSource(`${SERVER_URL}/sse?userId=${USER_ID}`);
    
    await new Promise((resolve) => {
      eventSource.addEventListener('endpoint', (e) => {
        const uri = e.data.startsWith('{') ? JSON.parse(e.data).uri : e.data;
        sessionId = new URL(uri, SERVER_URL).searchParams.get('sessionId');
        resolve();
      });
      eventSource.addEventListener('message', (e) => {
        const msg = JSON.parse(e.data);
        if (msg.id && pendingRequests.has(msg.id)) {
          pendingRequests.get(msg.id).resolve(msg);
          pendingRequests.delete(msg.id);
        }
      });
    });

    console.log('✅ 已连接\n');

    // 导航到扩展页
    await callTool('navigate_page', { url: 'chrome://extensions' });
    await new Promise(resolve => setTimeout(resolve, 2000));

    // 调试脚本
    console.log('🔍 检查DOM结构...\n');
    const result = await callTool('evaluate_script', {
      function: `() => {
        function exploreElement(el, depth = 0, maxDepth = 3) {
          if (depth > maxDepth) return null;
          
          const info = {
            tag: el.tagName,
            id: el.id || null,
            classes: el.className ? Array.from(el.classList) : [],
            hasShadowRoot: !!el.shadowRoot,
            childCount: el.children.length,
          };
          
          if (el.shadowRoot && depth < maxDepth) {
            info.shadowChildren = Array.from(el.shadowRoot.children).map(child => 
              exploreElement(child, depth + 1, maxDepth)
            );
          }
          
          return info;
        }
        
        const manager = document.querySelector('extensions-manager');
        
        return {
          url: window.location.href,
          hasExtensionsManager: !!manager,
          managerInfo: manager ? exploreElement(manager, 0, 4) : null,
          
          // 尝试直接访问
          directQuery: {
            extensionsItem: document.querySelectorAll('extensions-item').length,
          },
          
          // 尝试穿透Shadow DOM
          shadowDOMAccess: (() => {
            if (!manager || !manager.shadowRoot) return null;
            
            const itemList = manager.shadowRoot.querySelector('extensions-item-list');
            if (!itemList) return { noItemList: true };
            
            const items = itemList.shadowRoot 
              ? itemList.shadowRoot.querySelectorAll('extensions-item')
              : itemList.querySelectorAll('extensions-item');
            
            const itemsArray = Array.from(items);
            
            return {
              hasItemListShadowRoot: !!itemList.shadowRoot,
              itemCount: items.length,
              firstItem: itemsArray[0] ? {
                id: itemsArray[0].id || itemsArray[0].getAttribute('id'),
                hasShadowRoot: !!itemsArray[0].shadowRoot,
                innerText: itemsArray[0].innerText?.substring(0, 100),
                // 深入查看Shadow DOM结构
                shadowStructure: (() => {
                  const item = itemsArray[0];
                  if (!item.shadowRoot) return null;
                  
                  function getAllElements(root, prefix = '') {
                    const elements = [];
                    Array.from(root.children || root.querySelectorAll('*')).slice(0, 30).forEach((el, i) => {
                      elements.push({
                        path: prefix + ' > ' + el.tagName + (el.id ? '#' + el.id : ''),
                        id: el.id,
                        className: el.className,
                        text: el.textContent?.substring(0, 30)
                      });
                    });
                    return elements;
                  }
                  
                  return {
                    allElements: getAllElements(item.shadowRoot, 'shadowRoot'),
                    buttons: Array.from(item.shadowRoot.querySelectorAll('*')).filter(el => 
                      el.tagName === 'BUTTON' || el.tagName === 'CR-BUTTON'
                    ).map(b => ({
                      tag: b.tagName,
                      id: b.id,
                      className: b.className,
                      text: b.textContent?.substring(0, 100)
                    })),
                    allText: item.shadowRoot.textContent?.substring(0, 200)
                  };
                })()
              } : null
            };
          })()
        };
      }`
    });

    console.log('DOM结构分析:');
    const text = result.result?.content?.[0]?.text;
    if (text) {
      const match = text.match(/```json\n([\s\S]+?)\n```/);
      if (match) {
        const data = JSON.parse(match[1]);
        console.log(JSON.stringify(data, null, 2));
      }
    }

  } catch (error) {
    console.error('❌ 错误:', error.message);
  }
  
  process.exit(0);
}

async function callTool(name, args) {
  const id = messageId++;
  await fetch(`${SERVER_URL}/message?sessionId=${sessionId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id, method: 'tools/call', params: { name, arguments: args } })
  });
  
  return new Promise((resolve, reject) => {
    pendingRequests.set(id, { resolve, reject });
    setTimeout(() => reject(new Error('请求超时')), 30000);
  });
}

main();
