/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * 应用错误基类
 * 
 * 提供统一的错误处理机制，支持错误码、HTTP状态码、详细信息等
 */
export class AppError extends Error {
  /** 错误代码（用于客户端识别） */
  public readonly code: string;
  
  /** HTTP 状态码 */
  public readonly statusCode: number;
  
  /** 详细信息（用于调试） */
  public readonly details?: any;
  
  /** 时间戳 */
  public readonly timestamp: number;

  constructor(
    code: string,
    message: string,
    statusCode: number = 500,
    details?: any
  ) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
    this.timestamp = Date.now();
    
    // 保持正确的原型链
    Object.setPrototypeOf(this, new.target.prototype);
    
    // 捕获堆栈跟踪
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  /**
   * 转换为 JSON 格式（用于 HTTP 响应）
   */
  toJSON(): {
    error: string;
    code: string;
    message: string;
    statusCode: number;
    details?: any;
    timestamp: number;
  } {
    return {
      error: this.name,
      code: this.code,
      message: this.message,
      statusCode: this.statusCode,
      details: this.details,
      timestamp: this.timestamp,
    };
  }

  /**
   * 转换为日志格式
   */
  toLogFormat(): string {
    return `[${this.code}] ${this.message}${this.details ? ` | Details: ${JSON.stringify(this.details)}` : ''}`;
  }
}

// ============================================================================
// 用户相关错误
// ============================================================================

/**
 * 用户未找到错误
 */
export class UserNotFoundError extends AppError {
  constructor(userId: string, details?: any) {
    super(
      'USER_NOT_FOUND',
      `User ${userId} not found`,
      404,
      { userId, ...details }
    );
  }
}

/**
 * 用户已存在错误
 */
export class UserAlreadyExistsError extends AppError {
  constructor(identifier: string, field: 'email' | 'userId' = 'email', details?: any) {
    super(
      'USER_ALREADY_EXISTS',
      `User with ${field} '${identifier}' already exists`,
      409,
      { [field]: identifier, ...details }
    );
  }
}

/**
 * 无效邮箱格式错误
 */
export class InvalidEmailError extends AppError {
  constructor(email: string) {
    super(
      'INVALID_EMAIL',
      `Invalid email format: ${email}`,
      400,
      { email }
    );
  }
}

// ============================================================================
// 浏览器相关错误
// ============================================================================

/**
 * 浏览器未找到错误
 */
export class BrowserNotFoundError extends AppError {
  constructor(browserId: string, details?: any) {
    super(
      'BROWSER_NOT_FOUND',
      `Browser ${browserId} not found`,
      404,
      { browserId, ...details }
    );
  }
}

/**
 * 浏览器连接失败错误
 */
export class BrowserConnectionError extends AppError {
  constructor(message: string, details?: any) {
    super(
      'BROWSER_CONNECTION_FAILED',
      message,
      400,
      details
    );
  }
}

/**
 * 浏览器不可访问错误
 */
export class BrowserNotAccessibleError extends AppError {
  constructor(browserURL: string, reason?: string, details?: any) {
    super(
      'BROWSER_NOT_ACCESSIBLE',
      `Cannot connect to browser at ${browserURL}${reason ? `: ${reason}` : ''}`,
      400,
      { browserURL, reason, ...details }
    );
  }
}

/**
 * Token 名称已存在错误
 */
export class TokenNameAlreadyExistsError extends AppError {
  constructor(tokenName: string, userId: string) {
    super(
      'TOKEN_NAME_EXISTS',
      `Token name '${tokenName}' already exists for user ${userId}`,
      409,
      { tokenName, userId }
    );
  }
}

// ============================================================================
// 会话相关错误
// ============================================================================

/**
 * 会话未找到错误
 */
export class SessionNotFoundError extends AppError {
  constructor(sessionId: string) {
    super(
      'SESSION_NOT_FOUND',
      `Session ${sessionId} not found`,
      404,
      { sessionId }
    );
  }
}

/**
 * 会话已过期错误
 */
export class SessionExpiredError extends AppError {
  constructor(sessionId: string) {
    super(
      'SESSION_EXPIRED',
      `Session ${sessionId} has expired`,
      401,
      { sessionId }
    );
  }
}

/**
 * 达到最大会话数错误
 */
export class MaxSessionsReachedError extends AppError {
  constructor(maxSessions: number) {
    super(
      'MAX_SESSIONS_REACHED',
      `Maximum number of sessions reached: ${maxSessions}`,
      429,
      { maxSessions }
    );
  }
}

// ============================================================================
// 存储相关错误
// ============================================================================

/**
 * 存储未初始化错误
 */
export class StorageNotInitializedError extends AppError {
  constructor(storageType?: string) {
    super(
      'STORAGE_NOT_INITIALIZED',
      `Storage${storageType ? ` (${storageType})` : ''} not initialized`,
      500,
      { storageType }
    );
  }
}

/**
 * 存储操作失败错误
 */
export class StorageOperationError extends AppError {
  constructor(operation: string, reason: string, details?: any) {
    super(
      'STORAGE_OPERATION_FAILED',
      `Storage operation '${operation}' failed: ${reason}`,
      500,
      { operation, reason, ...details }
    );
  }
}

/**
 * 同步方法不支持错误（用于异步存储）
 */
export class SyncMethodNotSupportedError extends AppError {
  constructor(methodName: string, asyncAlternative: string) {
    super(
      'SYNC_METHOD_NOT_SUPPORTED',
      `${methodName}() is synchronous and not supported in async storage mode. Use ${asyncAlternative}() instead`,
      500,
      { methodName, asyncAlternative }
    );
  }
}

// ============================================================================
// 验证错误
// ============================================================================

/**
 * 参数验证错误
 */
export class ValidationError extends AppError {
  constructor(field: string, message: string, details?: any) {
    super(
      'VALIDATION_ERROR',
      `Validation failed for '${field}': ${message}`,
      400,
      { field, ...details }
    );
  }
}

/**
 * 缺少必需参数错误
 */
export class MissingRequiredParameterError extends AppError {
  constructor(parameter: string) {
    super(
      'MISSING_REQUIRED_PARAMETER',
      `Required parameter '${parameter}' is missing`,
      400,
      { parameter }
    );
  }
}

/**
 * 无效参数错误
 */
export class InvalidParameterError extends AppError {
  constructor(parameter: string, value: any, reason?: string) {
    super(
      'INVALID_PARAMETER',
      `Invalid value for parameter '${parameter}'${reason ? `: ${reason}` : ''}`,
      400,
      { parameter, value, reason }
    );
  }
}

// ============================================================================
// 配置错误
// ============================================================================

/**
 * 配置错误
 */
export class ConfigurationError extends AppError {
  constructor(message: string, details?: any) {
    super(
      'CONFIGURATION_ERROR',
      message,
      500,
      details
    );
  }
}

/**
 * 不支持的存储类型错误
 */
export class UnsupportedStorageTypeError extends AppError {
  constructor(type: string) {
    super(
      'UNSUPPORTED_STORAGE_TYPE',
      `Unsupported storage type: ${type}`,
      500,
      { type }
    );
  }
}

// ============================================================================
// 安全错误
// ============================================================================

/**
 * IP 不在白名单错误
 */
export class IPNotAllowedError extends AppError {
  constructor(ip: string) {
    super(
      'IP_NOT_ALLOWED',
      `IP address ${ip} is not in the whitelist`,
      403,
      { ip }
    );
  }
}

/**
 * 未授权错误
 */
export class UnauthorizedError extends AppError {
  constructor(message: string = 'Unauthorized', details?: any) {
    super(
      'UNAUTHORIZED',
      message,
      401,
      details
    );
  }
}

/**
 * 禁止访问错误
 */
export class ForbiddenError extends AppError {
  constructor(message: string = 'Forbidden', details?: any) {
    super(
      'FORBIDDEN',
      message,
      403,
      details
    );
  }
}

// ============================================================================
// 限流错误
// ============================================================================

/**
 * 速率限制错误
 */
export class RateLimitError extends AppError {
  constructor(limit: number, window: number, details?: any) {
    super(
      'RATE_LIMIT_EXCEEDED',
      `Rate limit exceeded: ${limit} requests per ${window}ms`,
      429,
      { limit, window, ...details }
    );
  }
}

// ============================================================================
// 工具函数
// ============================================================================

/**
 * 判断是否为 AppError
 */
export function isAppError(error: any): error is AppError {
  return error instanceof AppError;
}

/**
 * 将任意错误转换为 AppError
 */
export function toAppError(error: any): AppError {
  if (isAppError(error)) {
    return error;
  }
  
  if (error instanceof Error) {
    return new AppError(
      'INTERNAL_ERROR',
      error.message,
      500,
      { originalError: error.name, stack: error.stack }
    );
  }
  
  return new AppError(
    'UNKNOWN_ERROR',
    String(error),
    500,
    { originalError: error }
  );
}

/**
 * 格式化错误响应（用于 HTTP）
 */
export function formatErrorResponse(error: any): {
  error: string;
  code: string;
  message: string;
  statusCode: number;
  details?: any;
  timestamp: number;
} {
  const appError = toAppError(error);
  return appError.toJSON();
}
