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
 * 用户记录
 */
export interface UserRecord {
  userId: string;
  browserURL: string;
  registeredAt: number;
  metadata?: Record<string, unknown>;
}

/**
 * Token 记录
 */
export interface TokenRecord {
  token: string;
  tokenName: string;
  userId: string;
  permissions: string[];
  createdAt: number;
  expiresAt: number | null; // null 表示永不过期
  isRevoked: boolean;
}

/**
 * 日志操作类型
 */
type LogOperation = 
  | { op: 'register_user'; timestamp: number; data: UserRecord }
  | { op: 'create_token'; timestamp: number; data: TokenRecord }
  | { op: 'revoke_token'; timestamp: number; token: string }
  | { op: 'snapshot'; timestamp: number; users: UserRecord[]; tokens: TokenRecord[] };

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
  
  // 内存索引
  private users = new Map<string, UserRecord>();
  private tokens = new Map<string, TokenRecord>();
  private userTokens = new Map<string, Set<string>>(); // userId -> token[]
  
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
    logger(`[PersistentStore] - Token数: ${this.tokens.size}`);
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
        this.users.set(op.data.userId, op.data);
        if (!this.userTokens.has(op.data.userId)) {
          this.userTokens.set(op.data.userId, new Set());
        }
        break;
        
      case 'create_token':
        this.tokens.set(op.data.token, op.data);
        if (!this.userTokens.has(op.data.userId)) {
          this.userTokens.set(op.data.userId, new Set());
        }
        this.userTokens.get(op.data.userId)!.add(op.data.token);
        break;
        
      case 'revoke_token':
        const token = this.tokens.get(op.token);
        if (token) {
          token.isRevoked = true;
          this.userTokens.get(token.userId)?.delete(op.token);
        }
        break;
        
      case 'snapshot':
        // 快照：清空并重建状态
        this.users.clear();
        this.tokens.clear();
        this.userTokens.clear();
        
        for (const user of op.users) {
          this.users.set(user.userId, user);
          this.userTokens.set(user.userId, new Set());
        }
        
        for (const token of op.tokens) {
          this.tokens.set(token.token, token);
          if (!this.userTokens.has(token.userId)) {
            this.userTokens.set(token.userId, new Set());
          }
          if (!token.isRevoked) {
            this.userTokens.get(token.userId)!.add(token.token);
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
    
    const user: UserRecord = {
      userId,
      browserURL,
      registeredAt: Date.now(),
      metadata,
    };
    
    const operation: LogOperation = {
      op: 'register_user',
      timestamp: Date.now(),
      data: user,
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
    if (!this.tokens.has(token)) {
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
    return this.tokens.get(token);
  }
  
  /**
   * 获取用户的所有有效 Token
   */
  getUserTokens(userId: string): TokenRecord[] {
    const tokenSet = this.userTokens.get(userId);
    if (!tokenSet) {
      return [];
    }
    
    return Array.from(tokenSet)
      .map(token => this.tokens.get(token))
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
    for (const token of this.tokens.values()) {
      // 未撤销 且 (永不过期 或 未过期)
      if (!token.isRevoked && (token.expiresAt === null || token.expiresAt > Date.now())) {
        activeTokens++;
      }
    }
    
    return {
      users: this.users.size,
      tokens: this.tokens.size,
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
    const snapshot: LogOperation = {
      op: 'snapshot',
      timestamp: Date.now(),
      users: Array.from(this.users.values()),
      tokens: Array.from(this.tokens.values()),
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
