
/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
/**
 * V2 API处理方法
 * 基于邮箱的用户注册和浏览器管理
 */

import type http from 'node:http';
import {URL} from 'node:url';

import type {PersistentStoreV2, BrowserRecordV2, UserRecordV2} from './storage/PersistentStoreV2.js';
import type {UnifiedStorage} from './storage/UnifiedStorageAdapter.js';
import {detectBrowser} from './utils/browser-detector.js';

/**
 * 多租户服务器上下文接口
 * 定义处理函数所需的依赖
 */
export interface MultiTenantServerContext {
  readRequestBody(req: http.IncomingMessage): Promise<string>;
  getUnifiedStorage(): UnifiedStorage;
}

/**
 * 注册用户 V2（使用邮箱）
 */
export async function handleRegisterUserV2(
  this: MultiTenantServerContext,
  req: http.IncomingMessage,
  res: http.ServerResponse
): Promise<void> {
  try {
    const body = await this.readRequestBody(req);
    const data = JSON.parse(body);
    const {email, username} = data;
    
    if (!email) {
      res.writeHead(400, {'Content-Type': 'application/json'});
      res.end(JSON.stringify({error: 'email is required'}));
      return;
    }
    
    // 检查邮箱格式
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      res.writeHead(400, {'Content-Type': 'application/json'});
      res.end(JSON.stringify({error: 'Invalid email format'}));
      return;
    }
    
    // 检查邮箱是否已注册
    if (await this.getUnifiedStorage().hasEmailAsync(email)) {
      res.writeHead(409, {'Content-Type': 'application/json'});
      res.end(JSON.stringify({
        error: 'EMAIL_EXISTS',
        message: `Email ${email} is already registered`,
      }));
      return;
    }
    
    // 注册用户
    const user = await this.getUnifiedStorage().registerUserByEmail(email, username);
    
    res.writeHead(201, {'Content-Type': 'application/json'});
    res.end(JSON.stringify({
      success: true,
      userId: user.userId,
      email: user.email,
      username: user.username,
      createdAt: new Date(user.registeredAt).toISOString(),
    }));
  } catch (error) {
    res.writeHead(500, {'Content-Type': 'application/json'});
    res.end(JSON.stringify({
      error: error instanceof Error ? error.message : String(error),
    }));
  }
}

/**
 * 获取用户信息 V2
 */
export async function handleGetUserV2(
  this: MultiTenantServerContext,
  req: http.IncomingMessage,
  res: http.ServerResponse,
  url: URL
): Promise<void> {
  const userId = url.pathname.split('/').pop();
  if (!userId) {
    res.writeHead(400, {'Content-Type': 'application/json'});
    res.end(JSON.stringify({error: 'Invalid userId'}));
    return;
  }
  
  const user = await this.getUnifiedStorage().getUserByIdAsync(userId);
  if (!user) {
    res.writeHead(404, {'Content-Type': 'application/json'});
    res.end(JSON.stringify({error: 'User not found'}));
    return;
  }
  
  const browsers = await this.getUnifiedStorage().getUserBrowsersAsync(userId);
  
  res.writeHead(200, {'Content-Type': 'application/json'});
  res.end(JSON.stringify({
    userId: user.userId,
    email: user.email,
    username: user.username,
    browsers: browsers.map((b: BrowserRecordV2) => ({
      browserId: b.browserId,
      tokenName: b.tokenName,
      browserURL: b.browserURL,
      connected: false,
      createdAt: new Date(b.createdAt).toISOString(),
    })),
    metadata: {
      createdAt: new Date(user.registeredAt).toISOString(),
      browserCount: browsers.length,
    },
  }, null, 2));
}

/**
 * 更新用户名 V2
 */
export async function handleUpdateUsernameV2(
  this: MultiTenantServerContext,
  req: http.IncomingMessage,
  res: http.ServerResponse,
  url: URL
): Promise<void> {
  const userId = url.pathname.split('/').pop();
  if (!userId) {
    res.writeHead(400, {'Content-Type': 'application/json'});
    res.end(JSON.stringify({error: 'Invalid userId'}));
    return;
  }
  
  try {
    const body = await this.readRequestBody(req);
    const data = JSON.parse(body);
    const {username} = data;
    
    if (!username) {
      res.writeHead(400, {'Content-Type': 'application/json'});
      res.end(JSON.stringify({error: 'username is required'}));
      return;
    }
    
    await this.getUnifiedStorage().updateUsername(userId, username);
    
    const user = await this.getUnifiedStorage().getUserByIdAsync(userId);
    if (!user) {
      res.writeHead(404, {'Content-Type': 'application/json'});
      res.end(JSON.stringify({error: 'User not found after update'}));
      return;
    }
    
    res.writeHead(200, {'Content-Type': 'application/json'});
    res.end(JSON.stringify({
      success: true,
      userId: user.userId,
      username: user.username,
      updatedAt: user.updatedAt ? new Date(user.updatedAt).toISOString() : null,
    }));
  } catch (error) {
    res.writeHead(500, {'Content-Type': 'application/json'});
    res.end(JSON.stringify({
      error: error instanceof Error ? error.message : String(error),
    }));
  }
}

/**
 * 删除用户 V2
 */
export async function handleDeleteUserV2(
  this: MultiTenantServerContext,
  req: http.IncomingMessage,
  res: http.ServerResponse,
  url: URL
): Promise<void> {
  const userId = url.pathname.split('/').pop();
  if (!userId) {
    res.writeHead(400, {'Content-Type': 'application/json'});
    res.end(JSON.stringify({error: 'Invalid userId'}));
    return;
  }
  
  try {
    const deletedBrowsers = await this.getUnifiedStorage().deleteUser(userId);
    
    res.writeHead(200, {'Content-Type': 'application/json'});
    res.end(JSON.stringify({
      success: true,
      message: `User ${userId} and ${deletedBrowsers.length} associated browsers deleted`,
      deletedBrowsers,
    }));
  } catch (error) {
    const statusCode = error instanceof Error && error.message.includes('not found') ? 404 : 500;
    res.writeHead(statusCode, {'Content-Type': 'application/json'});
    res.end(JSON.stringify({
      error: error instanceof Error ? error.message : String(error),
    }));
  }
}

/**
 * 列出所有用户 V2
 */
export async function handleListUsersV2(
  this: MultiTenantServerContext,
  req: http.IncomingMessage,
  res: http.ServerResponse
): Promise<void> {
  const users = await this.getUnifiedStorage().getAllUsersAsync();
  
  const usersWithBrowserCount = await Promise.all(users.map(async (user: UserRecordV2) => {
    const browsers = await this.getUnifiedStorage().getUserBrowsersAsync(user.userId);
    return {
      userId: user.userId,
      email: user.email,
      username: user.username,
      browserCount: browsers.length,
      createdAt: new Date(user.registeredAt).toISOString(),
    };
  }));
  
  res.writeHead(200, {'Content-Type': 'application/json'});
  res.end(JSON.stringify({
    users: usersWithBrowserCount,
    total: users.length,
  }, null, 2));
}

/**
 * 绑定浏览器 V2
 */
export async function handleBindBrowserV2(
  this: MultiTenantServerContext,
  req: http.IncomingMessage,
  res: http.ServerResponse,
  url: URL
): Promise<void> {
  const pathParts = url.pathname.split('/');
  const userId = pathParts[pathParts.length - 2];
  
  if (!userId) {
    res.writeHead(400, {'Content-Type': 'application/json'});
    res.end(JSON.stringify({error: 'Invalid userId'}));
    return;
  }
  
  try {
    const body = await this.readRequestBody(req);
    const data = JSON.parse(body);
    const {browserURL, tokenName, description} = data;
    
    if (!browserURL) {
      res.writeHead(400, {'Content-Type': 'application/json'});
      res.end(JSON.stringify({error: 'browserURL is required'}));
      return;
    }
    
    // 检测浏览器连接
    const browserDetection = await detectBrowser(browserURL);
    
    if (!browserDetection.connected) {
      res.writeHead(400, {'Content-Type': 'application/json'});
      res.end(JSON.stringify({
        error: 'BROWSER_NOT_ACCESSIBLE',
        message: 'Cannot connect to the specified browser',
        browserURL,
        details: browserDetection.error,
        suggestions: [
          `Start Chrome with: chrome --remote-debugging-port=${new URL(browserURL).port} --remote-debugging-address=0.0.0.0`,
          'Verify the browser URL is correct and accessible',
          'Check firewall settings',
        ],
      }));
      return;
    }
    
    // 生成默认 tokenName（如果未提供）
    const finalTokenName = tokenName || `browser-${Date.now()}`;
    
    // 绑定浏览器（浏览器已验证可达）
    const browser = await this.getUnifiedStorage().bindBrowser(userId, browserURL, finalTokenName, description);
    
    // 更新浏览器信息
    if (browserDetection.browserInfo) {
      await this.getUnifiedStorage().updateBrowser(browser.browserId, {
        description: description || `Chrome ${browserDetection.browserInfo.browser}`,
      });
    }
    
    res.writeHead(201, {'Content-Type': 'application/json'});
    res.end(JSON.stringify({
      success: true,
      browserId: browser.browserId,
      token: browser.token,
      tokenName: browser.tokenName,
      browserURL: browser.browserURL,
      browser: {
        connected: true,
        info: browserDetection.browserInfo,
      },
      message: 'Browser bound successfully. Use this token to connect.',
      createdAt: new Date(browser.createdAt).toISOString(),
    }, null, 2));
  } catch (error) {
    const statusCode = error instanceof Error && error.message.includes('not found') ? 404 :
                       error instanceof Error && error.message.includes('already exists') ? 409 : 500;
    res.writeHead(statusCode, {'Content-Type': 'application/json'});
    res.end(JSON.stringify({
      error: error instanceof Error ? error.message : String(error),
    }));
  }
}

/**
 * 列出用户的浏览器 V2
 */
export async function handleListBrowsersV2(
  this: MultiTenantServerContext,
  req: http.IncomingMessage,
  res: http.ServerResponse,
  url: URL
): Promise<void> {
  const userId = url.pathname.split('/')[4];
  if (!userId) {
    res.writeHead(400, {'Content-Type': 'application/json'});
    res.end(JSON.stringify({error: 'Invalid userId'}));
    return;
  }
  
  const browsers = await this.getUnifiedStorage().getUserBrowsersAsync(userId);
  if (!browsers) {
    res.writeHead(404, {'Content-Type': 'application/json'});
    res.end(JSON.stringify({error: 'User not found'}));
    return;
  }
  
  res.writeHead(200, {'Content-Type': 'application/json'});
  res.end(JSON.stringify({
    browsers: browsers.map((b: BrowserRecordV2) => ({
      browserId: b.browserId,
      tokenName: b.tokenName,
      token: b.token,
      browserURL: b.browserURL,
      connected: false,
      description: b.metadata?.description,
      browserInfo: b.metadata?.browserInfo,
      createdAt: new Date(b.createdAt).toISOString(),
      lastConnectedAt: b.lastConnectedAt ? new Date(b.lastConnectedAt).toISOString() : null,
    })),
    total: browsers.length,
  }, null, 2));
}

/**
 * 获取单个浏览器信息 V2
 */
export async function handleGetBrowserV2(
  this: MultiTenantServerContext,
  req: http.IncomingMessage,
  res: http.ServerResponse,
  url: URL
): Promise<void> {
  const pathParts = url.pathname.split('/');
  const browserId = pathParts[pathParts.length - 1];
  const userId = pathParts[pathParts.length - 3];
  
  if (!userId || !browserId) {
    res.writeHead(400, {'Content-Type': 'application/json'});
    res.end(JSON.stringify({error: 'Invalid userId or browserId'}));
    return;
  }
  
  // 使用异步方法以支持 PostgreSQL 模式
  const browser = await this.getUnifiedStorage().getBrowserAsync(browserId);
  if (!browser) {
    res.writeHead(404, {'Content-Type': 'application/json'});
    res.end(JSON.stringify({error: 'Browser not found'}));
    return;
  }
  
  res.writeHead(200, {'Content-Type': 'application/json'});
  res.end(JSON.stringify({
    browserId: browser.browserId,
    userId: browser.userId,
    tokenName: browser.tokenName,
    token: browser.token,
    browserURL: browser.browserURL,
    connected: false,
    browserInfo: browser.metadata?.browserInfo,
    metadata: {
      description: browser.metadata?.description,
      createdAt: new Date(browser.createdAt).toISOString(),
      lastConnectedAt: browser.lastConnectedAt ? new Date(browser.lastConnectedAt).toISOString() : null,
    },
  }, null, 2));
}

/**
 * 更新浏览器信息 V2
 */
export async function handleUpdateBrowserV2(
  this: MultiTenantServerContext,
  req: http.IncomingMessage,
  res: http.ServerResponse,
  url: URL
): Promise<void> {
  const pathParts = url.pathname.split('/');
  const browserId = pathParts[pathParts.length - 1];
  const userId = pathParts[pathParts.length - 3];
  
  if (!userId || !browserId) {
    res.writeHead(400, {'Content-Type': 'application/json'});
    res.end(JSON.stringify({error: 'Invalid userId or browserId'}));
    return;
  }
  
  try {
    const body = await this.readRequestBody(req);
    const data = JSON.parse(body);
    const {browserURL, description} = data;
    
    const browser = await this.getUnifiedStorage().getBrowserAsync(browserId);
    if (!browser) {
      res.writeHead(404, {'Content-Type': 'application/json'});
      res.end(JSON.stringify({error: 'Browser not found'}));
      return;
    }
    
    // 如果更新 browserURL，需要验证连接
    if (browserURL && browserURL !== browser.browserURL) {
      const browserDetection = await detectBrowser(browserURL);
      
      if (!browserDetection.connected) {
        res.writeHead(400, {'Content-Type': 'application/json'});
        res.end(JSON.stringify({
          error: 'BROWSER_NOT_ACCESSIBLE',
          message: 'Cannot connect to the new browser URL',
          browserURL,
          details: browserDetection.error,
          suggestions: [
            `Start Chrome with: chrome --remote-debugging-port=${new URL(browserURL).port}  --remote-debugging-address=0.0.0.0`,
            'Check firewall settings',
          ],
        }));
        return;
      }
    }
    
    // 更新浏览器信息
    await this.getUnifiedStorage().updateBrowser(browser.browserId, {
      browserURL,
      description,
    });
    
    const updatedBrowser = await this.getUnifiedStorage().getBrowserAsync(browser.browserId);
    if (!updatedBrowser) {
      res.writeHead(404, {'Content-Type': 'application/json'});
      res.end(JSON.stringify({error: 'Browser not found after update'}));
      return;
    }
    
    res.writeHead(200, {'Content-Type': 'application/json'});
    res.end(JSON.stringify({
      success: true,
      browserId: updatedBrowser.browserId,
      tokenName: updatedBrowser.tokenName,
      browserURL: updatedBrowser.browserURL,
      description: updatedBrowser.metadata?.description,
      message: 'Browser updated successfully',
    }));
  } catch (error) {
    res.writeHead(500, {'Content-Type': 'application/json'});
    res.end(JSON.stringify({
      error: error instanceof Error ? error.message : String(error),
    }));
  }
}

/**
 * 解绑浏览器 V2
 */
export async function handleUnbindBrowserV2(
  this: MultiTenantServerContext,
  req: http.IncomingMessage,
  res: http.ServerResponse,
  url: URL
): Promise<void> {
  const pathParts = url.pathname.split('/');
  const browserId = pathParts[pathParts.length - 1];
  const userId = pathParts[pathParts.length - 3];
  
  if (!userId || !browserId) {
    res.writeHead(400, {'Content-Type': 'application/json'});
    res.end(JSON.stringify({error: 'Invalid userId or browserId'}));
    return;
  }
  
  try {
    const browser = await this.getUnifiedStorage().getBrowserAsync(browserId);
    if (!browser) {
      res.writeHead(404, {'Content-Type': 'application/json'});
      res.end(JSON.stringify({error: 'Browser not found'}));
      return;
    }
    
    await this.getUnifiedStorage().unbindBrowser(browser.browserId);
    
    res.writeHead(200, {'Content-Type': 'application/json'});
    res.end(JSON.stringify({
      success: true,
      message: `Browser '${browser.tokenName}' unbound and token revoked`,
      browserId,
      tokenName: browser.tokenName,
      deletedAt: new Date().toISOString(),
    }));
  } catch (error) {
    res.writeHead(500, {'Content-Type': 'application/json'});
    res.end(JSON.stringify({
      error: error instanceof Error ? error.message : String(error),
    }));
  }
}
