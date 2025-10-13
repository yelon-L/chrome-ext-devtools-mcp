/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Chrome 扩展基本信息
 */
export interface ExtensionInfo {
  /** 扩展 ID (32位小写字母) */
  id: string;
  /** 扩展名称 */
  name: string;
  /** 扩展版本 */
  version: string;
  /** Manifest 版本 (2 或 3) */
  manifestVersion: 2 | 3;
  /** 扩展描述 */
  description?: string;
  /** 是否已启用 */
  enabled: boolean;
  /** Service Worker URL (MV3) 或 Background Page URL (MV2) */
  backgroundUrl?: string;
  /** Service Worker 状态 (仅 MV3) */
  serviceWorkerStatus?: 'active' | 'inactive' | 'not_found';
  /** 扩展图标 URL */
  iconUrl?: string;
  /** 权限列表 */
  permissions?: string[];
  /** Host 权限 */
  hostPermissions?: string[];
  /** 完整的 manifest.json 数据 */
  manifest?: ManifestV2 | ManifestV3;
}

/**
 * 扩展上下文类型
 */
export type ExtensionContextType =
  | 'background' // Service Worker (MV3) 或 Background Page (MV2)
  | 'popup' // Popup 页面
  | 'options' // 选项页面
  | 'devtools' // DevTools 页面
  | 'content_script' // Content Script
  | 'offscreen'; // Offscreen Document (MV3)

/**
 * 扩展上下文信息
 */
export interface ExtensionContext {
  /** 上下文类型 */
  type: ExtensionContextType;
  /** 所属扩展 ID */
  extensionId: string;
  /** Chrome Target ID */
  targetId: string;
  /** 上下文 URL */
  url: string;
  /** 是否为主要上下文 */
  isPrimary: boolean;
  /** 标题 */
  title?: string;
}

/**
 * Storage 类型
 */
export type StorageType = 'local' | 'sync' | 'session' | 'managed';

/**
 * Storage 数据
 */
export interface StorageData {
  /** Storage 类型 */
  type: StorageType;
  /** 存储的数据 */
  data: Record<string, unknown>;
  /** 已使用字节数 */
  bytesUsed?: number;
  /** 配额（字节） */
  quota?: number;
}

/**
 * 扩展消息监控数据
 */
export interface ExtensionMessageEvent {
  /** 消息时间戳 */
  timestamp: number;
  /** 消息类型 */
  type: 'sent' | 'received';
  /** 调用方法 */
  method: 'runtime.sendMessage' | 'tabs.sendMessage' | 'runtime.onMessage' | 'runtime.connect';
  /** 消息内容 */
  message: unknown;
  /** 发送方信息 */
  sender?: {
    id?: string;
    tab?: {id: number; url?: string};
    url?: string;
    frameId?: number;
  };
  /** Tab ID (for tabs.sendMessage) */
  tabId?: number;
}

/**
 * Storage 变化监控数据
 */
export interface StorageChangeEvent {
  /** 变化时间戳 */
  timestamp: number;
  /** Storage 区域 */
  storageArea: StorageType;
  /** 变化的键值对 */
  changes: Record<string, {
    oldValue?: unknown;
    newValue?: unknown;
  }>;
}

/**
 * Manifest V2 定义
 */
export interface ManifestV2 {
  manifest_version: 2;
  name: string;
  version: string;
  description?: string;
  icons?: Record<string, string>;
  background?: {
    scripts?: string[];
    page?: string;
    persistent?: boolean;
  };
  content_scripts?: Array<{
    matches: string[];
    js?: string[];
    css?: string[];
    run_at?: 'document_start' | 'document_end' | 'document_idle';
  }>;
  permissions?: string[];
  optional_permissions?: string[];
  browser_action?: {
    default_popup?: string;
    default_icon?: Record<string, string>;
  };
  page_action?: {
    default_popup?: string;
    default_icon?: Record<string, string>;
  };
  options_page?: string;
  options_ui?: {
    page: string;
    open_in_tab?: boolean;
  };
}

/**
 * Manifest V3 定义
 */
export interface ManifestV3 {
  manifest_version: 3;
  name: string;
  version: string;
  description?: string;
  icons?: Record<string, string>;
  background?: {
    service_worker: string;
    type?: 'module';
  };
  content_scripts?: Array<{
    matches: string[];
    js?: string[];
    css?: string[];
    run_at?: 'document_start' | 'document_end' | 'document_idle';
  }>;
  permissions?: string[];
  optional_permissions?: string[];
  host_permissions?: string[];
  action?: {
    default_popup?: string;
    default_icon?: Record<string, string>;
  };
  options_page?: string;
  options_ui?: {
    page: string;
    open_in_tab?: boolean;
  };
}
