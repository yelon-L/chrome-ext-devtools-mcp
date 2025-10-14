/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * 高性能持久化存储 V2
 * 
 * 新架构：基于邮箱的用户注册 + 多浏览器绑定
 * - 用户: email → userId, username
 * - 浏览器: 每个浏览器有独立的 token
 * - Token 直接关联到浏览器实例
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import {logger} from '../../logger.js';

/**
 * 用户记录 V2
 */
export interface UserRecordV2 {
  userId: string;           // 从 email 提取
  email: string;            // 唯一邮箱
  username: string;         // 可修改的显示名称
  registeredAt: number;
  updatedAt?: number;
  metadata?: Record<string, unknown>;
}

/**
 * 浏览器记录 V2
 */
export interface BrowserRecordV2 {
  browserId: string;        // UUID
  userId: string;           // 所属用户
  browserURL: string;
  tokenName: string;        // 人类可读名称
  token: string;            // 访问令牌
  createdAt: number;
  lastConnectedAt?: number;
  metadata?: {
    description?: string;
    browserInfo?: {
      version?: string;
      userAgent?: string;
      protocolVersion?: string;
    };
  };
}

/**
 * 日志操作类型
 */
type LogOperation = 
  | { op: 'register_user'; timestamp: number; data: UserRecordV2 }
  | { op: 'update_username'; timestamp: number; userId: string; username: string }
  | { op: 'delete_user'; timestamp: number; userId: string }
  | { op: 'bind_browser'; timestamp: number; data: BrowserRecordV2 }
  | { op: 'update_browser'; timestamp: number; browserId: string; browserURL?: string; description?: string }
  | { op: 'update_last_connected'; timestamp: number; browserId: string }
  | { op: 'unbind_browser'; timestamp: number; browserId: string }
  | { op: 'snapshot'; timestamp: number; users: UserRecordV2[]; browsers: BrowserRecordV2[] };

/**
 * 存储配置
 */
export interface StoreConfig {
  dataDir: string;
  logFileName?: string;
  snapshotThreshold?: number;
  autoCompaction?: boolean;
}

/**
 * 持久化存储引擎 V2
 */
export class PersistentStoreV2 {
  private dataDir: string;
  private logFilePath: string;
  private snapshotThreshold: number;
  private autoCompaction: boolean;
  
  // 内存索引
  private users = new Map<string, UserRecordV2>();                    // userId -> User
  private usersByEmail = new Map<string, string>();                 // email -> userId
  private browsers = new Map<string, BrowserRecordV2>();              // browserId -> Browser
  private browsersByToken = new Map<string, string>();              // token -> browserId
  private browsersByUser = new Map<string, Set<string>>();          // userId -> Set<browserId>
  
  // 写入流
  private logStream: fs.WriteStream | null = null;
  private logLineCount = 0;
  
  constructor(config: StoreConfig) {
    this.dataDir = config.dataDir;
    this.logFilePath = path.join(this.dataDir, config.logFileName || 'store-v2.jsonl');
    this.snapshotThreshold = config.snapshotThreshold || 10000;
    this.autoCompaction = config.autoCompaction ?? true;
  }
  
  /**
   * 初始化存储
   */
  async initialize(): Promise<void> {
    logger('[PersistentStoreV2] 初始化存储引擎');
    
    // 确保数据目录存在
    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
      logger(`[PersistentStoreV2] 创建数据目录: ${this.dataDir}`);
    }
    
    // 加载现有数据
    await this.loadFromDisk();
    
    // 打开日志文件
    this.logStream = fs.createWriteStream(this.logFilePath, {
      flags: 'a',
      encoding: 'utf8',
    });
    
    logger(`[PersistentStoreV2] 初始化完成`);
    logger(`[PersistentStoreV2] - 用户数: ${this.users.size}`);
    logger(`[PersistentStoreV2] - 浏览器数: ${this.browsers.size}`);
    logger(`[PersistentStoreV2] - 日志行数: ${this.logLineCount}`);
  }
  
  /**
   * 从磁盘加载数据
   */
  private async loadFromDisk(): Promise<void> {
    if (!fs.existsSync(this.logFilePath)) {
      logger('[PersistentStoreV2] 日志文件不存在，从空状态开始');
      return;
    }
    
    const startTime = Date.now();
    const content = fs.readFileSync(this.logFilePath, 'utf8');
    const lines = content.split('\n').filter(line => line.trim());
    
    logger(`[PersistentStoreV2] 加载日志: ${lines.length} 行`);
    
    for (const line of lines) {
      try {
        const operation = JSON.parse(line) as LogOperation;
        this.applyOperation(operation);
        this.logLineCount++;
      } catch (error) {
        logger(`[PersistentStoreV2] ⚠️  跳过损坏的日志行: ${error}`);
      }
    }
    
    const duration = Date.now() - startTime;
    logger(`[PersistentStoreV2] 日志重放完成，耗时 ${duration}ms`);
  }
  
  /**
   * 应用日志操作
   */
  private applyOperation(op: LogOperation): void {
    switch (op.op) {
      case 'register_user':
        this.users.set(op.data.userId, op.data);
        this.usersByEmail.set(op.data.email, op.data.userId);
        if (!this.browsersByUser.has(op.data.userId)) {
          this.browsersByUser.set(op.data.userId, new Set());
        }
        break;
        
      case 'update_username':
        const user = this.users.get(op.userId);
        if (user) {
          user.username = op.username;
          user.updatedAt = op.timestamp;
        }
        break;
        
      case 'delete_user':
        const deletedUser = this.users.get(op.userId);
        if (deletedUser) {
          this.users.delete(op.userId);
          this.usersByEmail.delete(deletedUser.email);
          // 删除用户的所有浏览器
          const browserIds = this.browsersByUser.get(op.userId);
          if (browserIds) {
            for (const browserId of browserIds) {
              const browser = this.browsers.get(browserId);
              if (browser) {
                this.browsersByToken.delete(browser.token);
                this.browsers.delete(browserId);
              }
            }
            this.browsersByUser.delete(op.userId);
          }
        }
        break;
        
      case 'bind_browser':
        this.browsers.set(op.data.browserId, op.data);
        this.browsersByToken.set(op.data.token, op.data.browserId);
        if (!this.browsersByUser.has(op.data.userId)) {
          this.browsersByUser.set(op.data.userId, new Set());
        }
        this.browsersByUser.get(op.data.userId)!.add(op.data.browserId);
        break;
        
      case 'update_browser':
        const browser = this.browsers.get(op.browserId);
        if (browser) {
          if (op.browserURL) {
            browser.browserURL = op.browserURL;
          }
          if (op.description !== undefined) {
            if (!browser.metadata) browser.metadata = {};
            browser.metadata.description = op.description;
          }
        }
        break;
        
      case 'update_last_connected':
        const browserToUpdate = this.browsers.get(op.browserId);
        if (browserToUpdate) {
          browserToUpdate.lastConnectedAt = op.timestamp;
        }
        break;
        
      case 'unbind_browser':
        const unboundBrowser = this.browsers.get(op.browserId);
        if (unboundBrowser) {
          this.browsersByToken.delete(unboundBrowser.token);
          this.browsersByUser.get(unboundBrowser.userId)?.delete(op.browserId);
          this.browsers.delete(op.browserId);
        }
        break;
        
      case 'snapshot':
        // 快照：清空并重建
        this.users.clear();
        this.usersByEmail.clear();
        this.browsers.clear();
        this.browsersByToken.clear();
        this.browsersByUser.clear();
        
        for (const user of op.users) {
          this.users.set(user.userId, user);
          this.usersByEmail.set(user.email, user.userId);
          this.browsersByUser.set(user.userId, new Set());
        }
        
        for (const browser of op.browsers) {
          this.browsers.set(browser.browserId, browser);
          this.browsersByToken.set(browser.token, browser.browserId);
          if (!this.browsersByUser.has(browser.userId)) {
            this.browsersByUser.set(browser.userId, new Set());
          }
          this.browsersByUser.get(browser.userId)!.add(browser.browserId);
        }
        break;
    }
  }
  
  /**
   * 写入日志
   */
  private async writeLog(op: LogOperation): Promise<void> {
    if (!this.logStream) {
      throw new Error('Log stream not initialized');
    }
    
    const line = JSON.stringify(op) + '\n';
    
    return new Promise((resolve, reject) => {
      this.logStream!.write(line, (error) => {
        if (error) {
          reject(error);
        } else {
          this.logLineCount++;
          resolve();
        }
      });
    });
  }
  
  // ==================== 工具方法 ====================
  
  /**
   * 从邮箱提取 userId
   */
  private generateUserId(email: string): string {
    return email.split('@')[0].toLowerCase().replace(/[^a-z0-9-]/g, '-');
  }
  
  /**
   * 生成 token
   */
  private generateToken(): string {
    return 'mcp_' + crypto.randomBytes(32).toString('hex');
  }
  
  /**
   * 生成浏览器 ID
   */
  private generateBrowserId(): string {
    return crypto.randomUUID();
  }
  
  // ==================== 用户管理 ====================
  
  /**
   * 注册用户（使用邮箱）
   */
  async registerUserByEmail(email: string, username?: string): Promise<UserRecordV2> {
    // 检查邮箱是否已存在
    if (this.usersByEmail.has(email)) {
      throw new Error(`Email ${email} is already registered`);
    }
    
    const userId = this.generateUserId(email);
    
    // 检查 userId 冲突（罕见但可能）
    if (this.users.has(userId)) {
      throw new Error(`User ID ${userId} already exists`);
    }
    
    const user: UserRecordV2 = {
      userId,
      email,
      username: username || userId,
      registeredAt: Date.now(),
    };
    
    const operation: LogOperation = {
      op: 'register_user',
      timestamp: Date.now(),
      data: user,
    };
    
    await this.writeLog(operation);
    this.applyOperation(operation);
    
    logger(`[PersistentStoreV2] 注册用户: ${email} → ${userId}`);
    
    await this.maybeCompact();
    
    return user;
  }
  
  /**
   * 通过邮箱获取用户
   */
  getUserByEmail(email: string): UserRecordV2 | null {
    const userId = this.usersByEmail.get(email);
    if (!userId) return null;
    return this.users.get(userId) || null;
  }
  
  /**
   * 通过 ID 获取用户
   */
  getUserById(userId: string): UserRecordV2 | null {
    return this.users.get(userId) || null;
  }
  
  /**
   * 检查用户是否存在
   */
  hasUser(userId: string): boolean {
    return this.users.has(userId);
  }
  
  /**
   * 检查邮箱是否已注册
   */
  hasEmail(email: string): boolean {
    return this.usersByEmail.has(email);
  }
  
  /**
   * 更新用户名
   */
  async updateUsername(userId: string, username: string): Promise<void> {
    if (!this.users.has(userId)) {
      throw new Error(`User ${userId} not found`);
    }
    
    const operation: LogOperation = {
      op: 'update_username',
      timestamp: Date.now(),
      userId,
      username,
    };
    
    await this.writeLog(operation);
    this.applyOperation(operation);
    
    logger(`[PersistentStoreV2] 更新用户名: ${userId} → ${username}`);
    
    await this.maybeCompact();
  }
  
  /**
   * 删除用户（级联删除所有浏览器）
   */
  async deleteUser(userId: string): Promise<string[]> {
    if (!this.users.has(userId)) {
      throw new Error(`User ${userId} not found`);
    }
    
    // 获取用户的所有浏览器
    const browserIds = this.browsersByUser.get(userId);
    const deletedBrowserNames: string[] = [];
    
    if (browserIds) {
      for (const browserId of browserIds) {
        const browser = this.browsers.get(browserId);
        if (browser) {
          deletedBrowserNames.push(browser.tokenName);
        }
      }
    }
    
    const operation: LogOperation = {
      op: 'delete_user',
      timestamp: Date.now(),
      userId,
    };
    
    await this.writeLog(operation);
    this.applyOperation(operation);
    
    logger(`[PersistentStoreV2] 删除用户: ${userId} (${deletedBrowserNames.length} 个浏览器)`);
    
    await this.maybeCompact();
    
    return deletedBrowserNames;
  }
  
  /**
   * 获取所有用户
   */
  getAllUsers(): UserRecordV2[] {
    return Array.from(this.users.values());
  }
  
  // ==================== 浏览器管理 ====================
  
  /**
   * 绑定浏览器（返回包含 token 的浏览器记录）
   */
  async bindBrowser(
    userId: string,
    browserURL: string,
    tokenName?: string,
    description?: string
  ): Promise<BrowserRecordV2> {
    if (!this.users.has(userId)) {
      throw new Error(`User ${userId} not found`);
    }
    
    // 生成或验证 tokenName
    const finalTokenName = tokenName || `browser-${Date.now()}`;
    
    // 检查 tokenName 是否已存在（同一用户下）
    const existingBrowsers = this.listUserBrowsers(userId);
    if (existingBrowsers.some(b => b.tokenName === finalTokenName)) {
      throw new Error(`Token name '${finalTokenName}' already exists for user ${userId}`);
    }
    
    const browser: BrowserRecordV2 = {
      browserId: this.generateBrowserId(),
      userId,
      browserURL,
      tokenName: finalTokenName,
      token: this.generateToken(),
      createdAt: Date.now(),
      metadata: description ? { description } : undefined,
    };
    
    const operation: LogOperation = {
      op: 'bind_browser',
      timestamp: Date.now(),
      data: browser,
    };
    
    await this.writeLog(operation);
    this.applyOperation(operation);
    
    logger(`[PersistentStoreV2] 绑定浏览器: ${userId}/${finalTokenName} (${browser.token.substring(0, 16)}...)`);
    
    await this.maybeCompact();
    
    return browser;
  }
  
  /**
   * 通过 ID 获取浏览器
   */
  getBrowserById(browserId: string): BrowserRecordV2 | null {
    return this.browsers.get(browserId) || null;
  }
  
  /**
   * 通过 token 获取浏览器
   */
  getBrowserByToken(token: string): BrowserRecordV2 | null {
    const browserId = this.browsersByToken.get(token);
    if (!browserId) return null;
    return this.browsers.get(browserId) || null;
  }
  
  /**
   * 获取用户的特定浏览器
   */
  getBrowserByUserAndName(userId: string, tokenName: string): BrowserRecordV2 | null {
    const browserIds = this.browsersByUser.get(userId);
    if (!browserIds) return null;
    
    for (const browserId of browserIds) {
      const browser = this.browsers.get(browserId);
      if (browser && browser.tokenName === tokenName) {
        return browser;
      }
    }
    
    return null;
  }
  
  /**
   * 列出用户的所有浏览器
   */
  listUserBrowsers(userId: string): BrowserRecordV2[] {
    const browserIds = this.browsersByUser.get(userId);
    if (!browserIds) return [];
    
    const browsers: BrowserRecordV2[] = [];
    for (const browserId of browserIds) {
      const browser = this.browsers.get(browserId);
      if (browser) {
        browsers.push(browser);
      }
    }
    
    return browsers;
  }
  
  /**
   * 更新浏览器信息
   */
  async updateBrowser(
    browserId: string,
    data: { browserURL?: string; description?: string }
  ): Promise<void> {
    if (!this.browsers.has(browserId)) {
      throw new Error(`Browser ${browserId} not found`);
    }
    
    const operation: LogOperation = {
      op: 'update_browser',
      timestamp: Date.now(),
      browserId,
      browserURL: data.browserURL,
      description: data.description,
    };
    
    await this.writeLog(operation);
    this.applyOperation(operation);
    
    logger(`[PersistentStoreV2] 更新浏览器: ${browserId}`);
    
    await this.maybeCompact();
  }
  
  /**
   * 更新最后连接时间
   */
  async updateLastConnected(browserId: string): Promise<void> {
    if (!this.browsers.has(browserId)) {
      return; // 静默失败
    }
    
    const operation: LogOperation = {
      op: 'update_last_connected',
      timestamp: Date.now(),
      browserId,
    };
    
    await this.writeLog(operation);
    this.applyOperation(operation);
  }
  
  /**
   * 解绑浏览器
   */
  async unbindBrowser(browserId: string): Promise<void> {
    if (!this.browsers.has(browserId)) {
      throw new Error(`Browser ${browserId} not found`);
    }
    
    const browser = this.browsers.get(browserId)!;
    
    const operation: LogOperation = {
      op: 'unbind_browser',
      timestamp: Date.now(),
      browserId,
    };
    
    await this.writeLog(operation);
    this.applyOperation(operation);
    
    logger(`[PersistentStoreV2] 解绑浏览器: ${browser.userId}/${browser.tokenName}`);
    
    await this.maybeCompact();
  }
  
  // ==================== 统计和维护 ====================
  
  /**
   * 获取统计信息
   */
  getStats(): {
    users: number;
    browsers: number;
    logLines: number;
  } {
    return {
      users: this.users.size,
      browsers: this.browsers.size,
      logLines: this.logLineCount,
    };
  }
  
  /**
   * 检查是否需要压缩
   */
  private async maybeCompact(): Promise<void> {
    if (!this.autoCompaction) return;
    
    if (this.logLineCount >= this.snapshotThreshold) {
      logger(`[PersistentStoreV2] 触发自动压缩 (${this.logLineCount} 行)`);
      await this.compact();
    }
  }
  
  /**
   * 压缩日志（生成快照）
   */
  async compact(): Promise<void> {
    logger('[PersistentStoreV2] 开始压缩日志...');
    
    const startTime = Date.now();
    
    // 关闭当前日志流
    if (this.logStream) {
      this.logStream.end();
      await new Promise<void>(resolve => this.logStream!.once('finish', () => resolve()));
    }
    
    // 备份旧日志
    const backupPath = `${this.logFilePath}.${Date.now()}.bak`;
    if (fs.existsSync(this.logFilePath)) {
      fs.renameSync(this.logFilePath, backupPath);
    }
    
    // 创建新日志文件，写入快照
    const snapshot: LogOperation = {
      op: 'snapshot',
      timestamp: Date.now(),
      users: Array.from(this.users.values()),
      browsers: Array.from(this.browsers.values()),
    };
    
    fs.writeFileSync(this.logFilePath, JSON.stringify(snapshot) + '\n', 'utf8');
    this.logLineCount = 1;
    
    // 重新打开日志流
    this.logStream = fs.createWriteStream(this.logFilePath, {
      flags: 'a',
      encoding: 'utf8',
    });
    
    const duration = Date.now() - startTime;
    logger(`[PersistentStoreV2] 压缩完成，耗时 ${duration}ms`);
    logger(`[PersistentStoreV2] - 旧日志已备份: ${backupPath}`);
    logger(`[PersistentStoreV2] - 新日志行数: ${this.logLineCount}`);
  }
  
  /**
   * 关闭存储
   */
  async close(): Promise<void> {
    logger('[PersistentStoreV2] 关闭存储引擎');
    
    if (this.logStream) {
      this.logStream.end();
      await new Promise<void>(resolve => this.logStream!.once('finish', () => resolve()));
      this.logStream = null;
    }
  }
}
