/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * 多租户服务器配置管理
 * 
 * 统一管理所有配置项，支持环境变量和默认值
 */

/**
 * 服务器配置
 */
export interface ServerConfig {
  /** 服务器端口 */
  port: number;
  /** 服务器版本 */
  version: string;
}

/**
 * 存储配置
 */
export interface StorageConfig {
  /** 存储类型 */
  type: 'jsonl' | 'postgresql';
  /** JSONL 配置 */
  jsonl?: {
    dataDir: string;
    logFileName: string;
    snapshotThreshold: number;
    autoCompaction: boolean;
  };
  /** PostgreSQL 配置 */
  postgresql?: {
    host: string;
    port: number;
    database: string;
    user: string;
    password: string;
    maxConnections?: number;
    idleTimeout?: number;
  };
}

/**
 * 会话配置
 */
export interface SessionConfig {
  /** 会话超时时间（毫秒） */
  timeout: number;
  /** 清理间隔（毫秒） */
  cleanupInterval: number;
  /** 最大会话数 */
  maxSessions?: number;
  /** 持久连接模式（用于单客户端场景，禁用超时断连） */
  persistentMode?: boolean;
}

/**
 * 浏览器连接池配置
 */
export interface BrowserPoolConfig {
  /** 健康检查间隔（毫秒） */
  healthCheckInterval: number;
  /** 最大重连次数 */
  maxReconnectAttempts: number;
  /** 重连延迟（毫秒） */
  reconnectDelay: number;
  /** 连接超时（毫秒） */
  connectionTimeout: number;
  /** 浏览器检测超时（毫秒） */
  detectionTimeout: number;
}

/**
 * 性能配置
 */
export interface PerformanceConfig {
  /** API 缓存 TTL（毫秒） */
  apiCacheTTL: number;
  /** API 缓存最大条目数 */
  apiCacheMaxSize: number;
  /** 性能监控缓冲区大小 */
  monitorBufferSize: number;
  /** 连接时间缓冲区大小 */
  connectionTimesBufferSize: number;
}

/**
 * 安全配置
 */
export interface SecurityConfig {
  /** IP 白名单（null 表示不启用） */
  allowedIPs: string[] | null;
  /** CORS 允许的来源 */
  allowedOrigins: string[];
}

/**
 * 实验性功能配置
 */
export interface ExperimentalConfig {
  /** CDP 混合架构 */
  useCdpHybrid: boolean;
  /** CDP 高频操作 */
  useCdpOperations: boolean;
}

/**
 * 完整配置
 */
export interface MultiTenantConfig {
  server: ServerConfig;
  storage: StorageConfig;
  session: SessionConfig;
  browserPool: BrowserPoolConfig;
  performance: PerformanceConfig;
  security: SecurityConfig;
  experimental: ExperimentalConfig;
}

/**
 * 从环境变量加载配置
 */
export function loadConfigFromEnv(version: string): MultiTenantConfig {
  // 存储类型
  const storageType = (process.env.STORAGE_TYPE || 'jsonl') as 'jsonl' | 'postgresql';
  
  // 存储配置
  const storageConfig: StorageConfig = {
    type: storageType,
  };
  
  if (storageType === 'jsonl') {
    storageConfig.jsonl = {
      dataDir: process.env.DATA_DIR || './.mcp-data',
      logFileName: process.env.LOG_FILE_NAME || 'store-v2.jsonl',
      snapshotThreshold: parseInt(process.env.SNAPSHOT_THRESHOLD || '10000', 10),
      autoCompaction: process.env.AUTO_COMPACTION !== 'false',
    };
  } else {
    storageConfig.postgresql = {
      host: process.env.DB_HOST || '192.168.0.205',
      port: parseInt(process.env.DB_PORT || '5432', 10),
      database: process.env.DB_NAME || 'mcp_extdebug',
      user: process.env.DB_USER || 'admin',
      password: process.env.DB_PASSWORD || 'admin',
      maxConnections: parseInt(process.env.DB_MAX_CONNECTIONS || '20', 10),
      idleTimeout: parseInt(process.env.DB_IDLE_TIMEOUT || '30000', 10),
    };
  }
  
  // IP 白名单
  const allowedIPsEnv = process.env.ALLOWED_IPS;
  const allowedIPs = allowedIPsEnv 
    ? allowedIPsEnv.split(',').map(ip => ip.trim())
    : null;
  
  // CORS 配置
  const allowedOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
    : ['*'];

  return {
    server: {
      port: parseInt(process.env.PORT || '32122', 10),
      version,
    },
    
    storage: storageConfig,
    
    session: {
      timeout: parseInt(process.env.SESSION_TIMEOUT || '3600000', 10), // 1 hour
      cleanupInterval: parseInt(process.env.SESSION_CLEANUP_INTERVAL || '60000', 10), // 1 minute
      maxSessions: process.env.MAX_SESSIONS 
        ? parseInt(process.env.MAX_SESSIONS, 10)
        : undefined,
      // 默认逻辑：未设置 maxSessions 则自动启用持久连接模式（单客户端场景）
      persistentMode: process.env.PERSISTENT_MODE === 'true' 
        || (process.env.PERSISTENT_MODE !== 'false' && !process.env.MAX_SESSIONS),
    },
    
    browserPool: {
      healthCheckInterval: parseInt(process.env.BROWSER_HEALTH_CHECK_INTERVAL || '30000', 10),
      maxReconnectAttempts: parseInt(process.env.MAX_RECONNECT_ATTEMPTS || '3', 10),
      reconnectDelay: parseInt(process.env.RECONNECT_DELAY || '5000', 10),
      connectionTimeout: parseInt(process.env.CONNECTION_TIMEOUT || '30000', 10),
      detectionTimeout: parseInt(process.env.BROWSER_DETECTION_TIMEOUT || '3000', 10),
    },
    
    performance: {
      apiCacheTTL: parseInt(process.env.API_CACHE_TTL || '30000', 10), // 30 seconds
      apiCacheMaxSize: parseInt(process.env.API_CACHE_MAX_SIZE || '500', 10),
      monitorBufferSize: parseInt(process.env.MONITOR_BUFFER_SIZE || '1000', 10),
      connectionTimesBufferSize: parseInt(process.env.CONNECTION_TIMES_BUFFER_SIZE || '100', 10),
    },
    
    security: {
      allowedIPs,
      allowedOrigins,
    },
    
    experimental: {
      useCdpHybrid: process.env.USE_CDP_HYBRID === 'true',
      useCdpOperations: process.env.USE_CDP_OPERATIONS === 'true',
    },
  };
}

/**
 * 验证配置
 */
export function validateConfig(config: MultiTenantConfig): string[] {
  const errors: string[] = [];
  
  // 验证端口
  if (config.server.port < 1 || config.server.port > 65535) {
    errors.push(`Invalid port: ${config.server.port} (must be 1-65535)`);
  }
  
  // 验证 PostgreSQL 配置
  if (config.storage.type === 'postgresql' && config.storage.postgresql) {
    const pg = config.storage.postgresql;
    if (!pg.host) {
      errors.push('PostgreSQL host is required');
    }
    if (!pg.database) {
      errors.push('PostgreSQL database is required');
    }
    if (!pg.user) {
      errors.push('PostgreSQL user is required');
    }
  }
  
  // 验证超时配置
  if (config.session.timeout < 1000) {
    errors.push('Session timeout must be at least 1000ms');
  }
  
  if (config.browserPool.connectionTimeout < 1000) {
    errors.push('Connection timeout must be at least 1000ms');
  }
  
  return errors;
}

/**
 * 打印配置信息（隐藏敏感信息）
 */
export function printConfig(config: MultiTenantConfig): void {
  console.log('\n📋 Configuration:');
  console.log(`   Server: port=${config.server.port}, version=${config.server.version}`);
  console.log(`   Storage: type=${config.storage.type}`);
  
  if (config.storage.type === 'jsonl' && config.storage.jsonl) {
    console.log(`     - dataDir: ${config.storage.jsonl.dataDir}`);
    console.log(`     - logFileName: ${config.storage.jsonl.logFileName}`);
  } else if (config.storage.type === 'postgresql' && config.storage.postgresql) {
    const pg = config.storage.postgresql;
    console.log(`     - host: ${pg.host}:${pg.port}`);
    console.log(`     - database: ${pg.database}`);
    console.log(`     - user: ${pg.user}`);
    console.log(`     - password: ${'*'.repeat(8)}`);
  }
  
  console.log(`   Session: timeout=${config.session.timeout}ms, cleanup=${config.session.cleanupInterval}ms, persistent=${config.session.persistentMode}`);
  if (config.session.maxSessions) {
    console.log(`     - maxSessions: ${config.session.maxSessions}`);
  }
  console.log(`   BrowserPool: healthCheck=${config.browserPool.healthCheckInterval}ms, maxReconnect=${config.browserPool.maxReconnectAttempts}`);
  
  if (config.security.allowedIPs) {
    console.log(`   Security: IP whitelist enabled (${config.security.allowedIPs.length} rules)`);
  } else {
    console.log(`   Security: No IP whitelist (all IPs allowed)`);
  }
  
  if (config.experimental.useCdpHybrid || config.experimental.useCdpOperations) {
    console.log(`   Experimental: CDP hybrid=${config.experimental.useCdpHybrid}, CDP operations=${config.experimental.useCdpOperations}`);
  }
  
  console.log('');
}
