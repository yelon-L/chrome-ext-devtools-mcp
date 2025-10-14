/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * 高性能持久化存储
 * 
 * 架构：内存 Map + JSONL 增量日志
 * - 读取：O(1) 纯内存操作
 * - 写入：O(1) 追加日志
 * - 持久化：每次写入立即 flush
 * - 启动：重放日志恢复状态
 */

import fs from 'node:fs';
import path from 'node:path';

import {logger} from '../../logger.js';

/**
 * 用户记录（新架构）
 */
export interface UserRecord {
  userId: string;           // 从 email 提取的 ID
  email: string;            // 唯一的邮箱地址
  username: string;         // 可修改的显示名称
  registeredAt: number;
  updatedAt?: number;
  metadata?: Record<string, unknown>;
}

/**
 * 浏览器记录
 */
export interface BrowserRecord {
  browserId: string;        // UUID
  userId: string;           // 所属用户
  browserURL: string;
  tokenName: string;        // 人类可读的名称
  token: string;            // 访问令牌
  createdAt: number;
  lastConnectedAt?: number;
  metadata?: {
    description?: string;
    browserInfo?: {
      version?: string;
      userAgent?: string;
    };
  };
}

/**
 * 旧的用户记录（向后兼容）
 * @deprecated 使用新的 UserRecord + BrowserRecord
 */
export interface LegacyUserRecord {
  userId: string;
  browserURL: string;
  registeredAt: number;
  metadata?: Record<string, unknown>;
}

/**
 * Token 记录（已废弃，token 信息现在存储在 BrowserRecord 中）
 * @deprecated Token 现在直接关联到 Browser
 */
export interface TokenRecord {
  token: string;
  tokenName: string;
  userId: string;
  permissions: string[];
  createdAt: number;
  expiresAt: number | null;
  isRevoked: boolean;
}

/**
 * 日志操作类型（新架构）
 */
type LogOperation = 
  // 用户操作
  | { op: 'register_user_v2'; timestamp: number; data: UserRecord }
  | { op: 'update_username'; timestamp: number; data: { userId: string; username: string } }
  | { op: 'delete_user'; timestamp: number; userId: string }
  // 浏览器操作
  | { op: 'bind_browser'; timestamp: number; data: BrowserRecord }
  | { op: 'update_browser'; timestamp: number; data: { browserId: string; browserURL?: string; description?: string } }
  | { op: 'unbind_browser'; timestamp: number; browserId: string }
  // 快照
  | { op: 'snapshot_v2'; timestamp: number; users: UserRecord[]; browsers: BrowserRecord[] }
  // 向后兼容（旧操作）
  | { op: 'register_user'; timestamp: number; data: LegacyUserRecord }
  | { op: 'create_token'; timestamp: number; data: TokenRecord }
  | { op: 'update_browser_url'; timestamp: number; data: { userId: string; browserURL: string } }
  | { op: 'revoke_token'; timestamp: number; token: string }
  | { op: 'snapshot'; timestamp: number; users: LegacyUserRecord[]; tokens: TokenRecord[] };

/**
 * 存储配置
 */
export interface StoreConfig {
  /** 数据目录 */
  dataDir: string;
  /** 日志文件名 */
  logFileName?: string;
  /** 快照阈值（日志行数） */
  snapshotThreshold?: number;
  /** 是否启用自动压缩 */
  autoCompaction?: boolean;
}

/**
 * 持久化存储引擎
 */
export class PersistentStore {
  private dataDir: string;
  private logFilePath: string;
  private snapshotThreshold: number;
  private autoCompaction: boolean;
  
  // 内存索引（新架构）
  private users = new Map<string, UserRecord>();                    // userId -> User
  private usersByEmail = new Map<string, string>();                 // email -> userId
  private browsers = new Map<string, BrowserRecord>();              // browserId -> Browser
  private browsersByToken = new Map<string, string>();              // token -> browserId
  private browsersByUser = new Map<string, Set<string>>();          // userId -> Set<browserId>
  
  // 向后兼容：旧的 Token 系统
  private legacyTokens = new Map<string, TokenRecord>();
  private legacyUserTokens = new Map<string, Set<string>>();
  
  // 写入流
  private logStream: fs.WriteStream | null = null;
  private logLineCount = 0;
  
  constructor(config: StoreConfig) {
    this.dataDir = config.dataDir;
    this.logFilePath = path.join(this.dataDir, config.logFileName || 'store.jsonl');
    this.snapshotThreshold = config.snapshotThreshold || 10000;
    this.autoCompaction = config.autoCompaction ?? true;
  }
  
  /**
   * 初始化存储
   */
  async initialize(): Promise<void> {
    logger('[PersistentStore] 初始化存储引擎');
    
    // 确保数据目录存在
    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
      logger(`[PersistentStore] 创建数据目录: ${this.dataDir}`);
    }
    
    // 加载现有数据
    await this.loadFromDisk();
    
    // 打开日志文件（追加模式）
    this.logStream = fs.createWriteStream(this.logFilePath, {
      flags: 'a',
      encoding: 'utf8',
    });
    
    logger(`[PersistentStore] 初始化完成`);
    logger(`[PersistentStore] - 用户数: ${this.users.size}`);
    logger(`[PersistentStore] - Token数: ${this.legacyTokens.size}`);
    logger(`[PersistentStore] - 日志行数: ${this.logLineCount}`);
  }
  
  /**
   * 从磁盘加载数据
   */
  private async loadFromDisk(): Promise<void> {
    if (!fs.existsSync(this.logFilePath)) {
      logger('[PersistentStore] 日志文件不存在，从空状态开始');
      return;
    }
    
    const startTime = Date.now();
    const content = fs.readFileSync(this.logFilePath, 'utf8');
    const lines = content.split('\n').filter(line => line.trim());
    
    logger(`[PersistentStore] 加载日志: ${lines.length} 行`);
    
    for (const line of lines) {
      try {
        const operation = JSON.parse(line) as LogOperation;
        this.applyOperation(operation);
        this.logLineCount++;
      } catch (error) {
        logger(`[PersistentStore] ⚠️  跳过损坏的日志行: ${error}`);
      }
    }
    
    const duration = Date.now() - startTime;
    logger(`[PersistentStore] 日志重放完成，耗时 ${duration}ms`);
  }
  
  /**
   * 应用日志操作（内存）
   */
  private applyOperation(op: LogOperation): void {
    switch (op.op) {
      case 'register_user':
        // 向后兼容：将 LegacyUserRecord 存储为用户
        const legacyUser = op.data as LegacyUserRecord;
        this.users.set(legacyUser.userId, {
          userId: legacyUser.userId,
          email: `${legacyUser.userId}@legacy.local`,
          username: legacyUser.userId,
          registeredAt: legacyUser.registeredAt,
          metadata: legacyUser.metadata,
        });
        if (!this.legacyUserTokens.has(legacyUser.userId)) {
          this.legacyUserTokens.set(legacyUser.userId, new Set());
        }
        break;
        
      case 'create_token':
        this.legacyTokens.set(op.data.token, op.data);
        if (!this.legacyUserTokens.has(op.data.userId)) {
          this.legacyUserTokens.set(op.data.userId, new Set());
        }
        this.legacyUserTokens.get(op.data.userId)!.add(op.data.token);
        break;
      
      case 'update_browser_url':
        // 向后兼容：忽略 browserURL 更新（新架构不支持）
        break;
        
      case 'revoke_token':
        const token = this.legacyTokens.get(op.token);
        if (token) {
          token.isRevoked = true;
          this.legacyUserTokens.get(token.userId)?.delete(op.token);
        }
        break;
        
      case 'snapshot':
        // 快照：清空并重建状态
        this.users.clear();
        this.legacyTokens.clear();
        this.legacyUserTokens.clear();
        
        for (const legacyUser of op.users) {
          // 转换 LegacyUserRecord 到 UserRecord
          this.users.set(legacyUser.userId, {
            userId: legacyUser.userId,
            email: `${legacyUser.userId}@legacy.local`,
            username: legacyUser.userId,
            registeredAt: legacyUser.registeredAt,
            metadata: legacyUser.metadata,
          });
          this.legacyUserTokens.set(legacyUser.userId, new Set());
        }
        
        for (const token of op.tokens) {
          this.legacyTokens.set(token.token, token);
          if (!this.legacyUserTokens.has(token.userId)) {
            this.legacyUserTokens.set(token.userId, new Set());
          }
          if (!token.isRevoked) {
            this.legacyUserTokens.get(token.userId)!.add(token.token);
          }
        }
        break;
    }
  }
  
  /**
   * 写入日志操作（持久化）
   */
  private async writeLog(op: LogOperation): Promise<void> {
    if (!this.logStream) {
      throw new Error('Log stream not initialized');
    }
    
    const line = JSON.stringify(op) + '\n';
    
    // 写入日志
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
  
  /**
   * 注册用户
   */
  async registerUser(userId: string, browserURL: string, metadata?: Record<string, unknown>): Promise<void> {
    // 检查重复
    if (this.users.has(userId)) {
      throw new Error(`User ${userId} already exists`);
    }
    
    const legacyUser: LegacyUserRecord = {
      userId,
      browserURL,
      registeredAt: Date.now(),
      metadata,
    };
    
    const operation: LogOperation = {
      op: 'register_user',
      timestamp: Date.now(),
      data: legacyUser,
    };
    
    // 先写日志（持久化）
    await this.writeLog(operation);
    
    // 再更新内存
    this.applyOperation(operation);
    
    logger(`[PersistentStore] 注册用户: ${userId}`);
    
    // 检查是否需要压缩
    await this.maybeCompact();
  }
  
  /**
   * 创建 Token
   */
  async createToken(
    userId: string,
    token: string,
    tokenName: string,
    permissions: string[],
    expiresIn?: number
  ): Promise<TokenRecord> {
    // 验证用户存在
    if (!this.users.has(userId)) {
      throw new Error(`User ${userId} not found`);
    }
    
    const tokenRecord: TokenRecord = {
      token,
      tokenName,
      userId,
      permissions,
      createdAt: Date.now(),
      expiresAt: expiresIn ? Date.now() + expiresIn : null, // null 表示永不过期
      isRevoked: false,
    };
    
    const operation: LogOperation = {
      op: 'create_token',
      timestamp: Date.now(),
      data: tokenRecord,
    };
    
    // 先写日志（持久化）
    await this.writeLog(operation);
    
    // 再更新内存
    this.applyOperation(operation);
    
    const expiryInfo = expiresIn ? `expires in ${expiresIn}ms` : 'never expires';
    logger(`[PersistentStore] 创建Token: ${userId}/${tokenName} (${token.substring(0, 16)}..., ${expiryInfo})`);
    
    // 检查是否需要压缩
    await this.maybeCompact();
    
    return tokenRecord;
  }
  
  /**
   * 撤销 Token
   */
  async revokeToken(token: string): Promise<void> {
    if (!this.legacyTokens.has(token)) {
      throw new Error('Token not found');
    }
    
    const operation: LogOperation = {
      op: 'revoke_token',
      timestamp: Date.now(),
      token,
    };
    
    // 先写日志（持久化）
    await this.writeLog(operation);
    
    // 再更新内存
    this.applyOperation(operation);
    
    logger(`[PersistentStore] 撤销Token: ${token.substring(0, 16)}...`);
  }
  
  /**
   * 更新浏览器 URL
   */
  async updateBrowserURL(userId: string, browserURL: string): Promise<void> {
    if (!this.users.has(userId)) {
      throw new Error(`User ${userId} not found`);
    }
    
    const operation: LogOperation = {
      op: 'update_browser_url',
      timestamp: Date.now(),
      data: { userId, browserURL },
    };
    
    // 先写日志（持久化）
    await this.writeLog(operation);
    
    // 再更新内存
    this.applyOperation(operation);
    
    logger(`[PersistentStore] 更新浏览器URL: ${userId} -> ${browserURL}`);
    
    // 检查是否需要压缩
    await this.maybeCompact();
  }
  
  /**
   * 获取用户信息
   */
  getUser(userId: string): UserRecord | undefined {
    return this.users.get(userId);
  }
  
  /**
   * 检查用户是否存在
   */
  hasUser(userId: string): boolean {
    return this.users.has(userId);
  }
  
  /**
   * 获取所有用户
   */
  getAllUsers(): UserRecord[] {
    return Array.from(this.users.values());
  }
  
  /**
   * 获取 Token 信息
   */
  getToken(token: string): TokenRecord | undefined {
    return this.legacyTokens.get(token);
  }
  
  /**
   * 获取所有 Token（包括已撤销的）
   */
  getAllTokens(): TokenRecord[] {
    return Array.from(this.legacyTokens.values());
  }
  
  /**
   * 获取用户的所有有效 Token
   */
  getUserTokens(userId: string): TokenRecord[] {
    const tokenSet = this.legacyUserTokens.get(userId);
    if (!tokenSet) {
      return [];
    }
    
    return Array.from(tokenSet)
      .map(token => this.legacyTokens.get(token))
      .filter((t): t is TokenRecord => t !== undefined && !t.isRevoked);
  }
  
  /**
   * 获取统计信息
   */
  getStats(): {
    users: number;
    tokens: number;
    activeTokens: number;
    logLines: number;
  } {
    let activeTokens = 0;
    for (const token of this.legacyTokens.values()) {
      // 未撤销 且 (永不过期 或 未过期)
      if (!token.isRevoked && (token.expiresAt === null || token.expiresAt > Date.now())) {
        activeTokens++;
      }
    }
    
    return {
      users: this.users.size,
      tokens: this.legacyTokens.size,
      activeTokens,
      logLines: this.logLineCount,
    };
  }
  
  /**
   * 检查是否需要压缩
   */
  private async maybeCompact(): Promise<void> {
    if (!this.autoCompaction) {
      return;
    }
    
    if (this.logLineCount >= this.snapshotThreshold) {
      logger(`[PersistentStore] 触发自动压缩 (${this.logLineCount} 行)`);
      await this.compact();
    }
  }
  
  /**
   * 压缩日志（生成快照）
   */
  async compact(): Promise<void> {
    logger('[PersistentStore] 开始压缩日志...');
    
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
    // 转换 UserRecord 回 LegacyUserRecord
    const legacyUsers: LegacyUserRecord[] = Array.from(this.users.values()).map(u => ({
      userId: u.userId,
      browserURL: '',
      registeredAt: u.registeredAt,
      metadata: u.metadata,
    }));
    
    const snapshot: LogOperation = {
      op: 'snapshot',
      timestamp: Date.now(),
      users: legacyUsers,
      tokens: Array.from(this.legacyTokens.values()),
    };
    
    fs.writeFileSync(this.logFilePath, JSON.stringify(snapshot) + '\n', 'utf8');
    this.logLineCount = 1;
    
    // 重新打开日志流
    this.logStream = fs.createWriteStream(this.logFilePath, {
      flags: 'a',
      encoding: 'utf8',
    });
    
    const duration = Date.now() - startTime;
    logger(`[PersistentStore] 压缩完成，耗时 ${duration}ms`);
    logger(`[PersistentStore] - 旧日志已备份: ${backupPath}`);
    logger(`[PersistentStore] - 新日志行数: ${this.logLineCount}`);
  }
  
  /**
   * 关闭存储
   */
  async close(): Promise<void> {
    logger('[PersistentStore] 关闭存储引擎');
    
    if (this.logStream) {
      this.logStream.end();
      await new Promise<void>(resolve => this.logStream!.once('finish', () => resolve()));
      this.logStream = null;
    }
  }
}
