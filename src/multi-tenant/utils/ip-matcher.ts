/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * IP 地址匹配工具
 * 
 * 支持多种 IP 格式：
 * 1. IPv4: 192.168.0.1
 * 2. IPv4 CIDR: 192.168.0.0/16
 * 3. IPv6 映射的 IPv4: ::ffff:192.168.0.1
 * 4. 通配符: 192.168.*.*, 192.168.0.*
 */

/**
 * 标准化 IP 地址
 * 将 IPv6 映射的 IPv4 地址转换为纯 IPv4
 * 
 * @param ip - 原始 IP 地址
 * @returns 标准化后的 IP
 */
export function normalizeIP(ip: string): string {
  // 处理 IPv6 映射的 IPv4 地址: ::ffff:192.168.0.1 -> 192.168.0.1
  if (ip.startsWith('::ffff:')) {
    return ip.substring(7);
  }
  
  // 处理完整的 IPv6 映射格式: 0:0:0:0:0:ffff:c0a8:0001 -> 192.168.0.1
  const ipv6MappedMatch = ip.match(/^(?:0:){5}ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i);
  if (ipv6MappedMatch) {
    const part1 = parseInt(ipv6MappedMatch[1], 16);
    const part2 = parseInt(ipv6MappedMatch[2], 16);
    return `${part1 >> 8}.${part1 & 0xff}.${part2 >> 8}.${part2 & 0xff}`;
  }
  
  return ip;
}

/**
 * 检查 IP 是否匹配通配符模式
 * 
 * @param ip - 要检查的 IP
 * @param pattern - 通配符模式 (如 192.168.*.*)
 * @returns 是否匹配
 */
function matchWildcard(ip: string, pattern: string): boolean {
  const ipParts = ip.split('.');
  const patternParts = pattern.split('.');
  
  if (ipParts.length !== 4 || patternParts.length !== 4) {
    return false;
  }
  
  for (let i = 0; i < 4; i++) {
    if (patternParts[i] !== '*' && ipParts[i] !== patternParts[i]) {
      return false;
    }
  }
  
  return true;
}

/**
 * 将 IP 地址转换为 32 位整数
 * 
 * @param ip - IPv4 地址
 * @returns 32 位整数
 */
function ipToInt(ip: string): number {
  const parts = ip.split('.').map(Number);
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
}

/**
 * 检查 IP 是否在 CIDR 范围内
 * 
 * @param ip - 要检查的 IP
 * @param cidr - CIDR 表示法 (如 192.168.0.0/16)
 * @returns 是否在范围内
 */
function matchCIDR(ip: string, cidr: string): boolean {
  const [network, prefixLength] = cidr.split('/');
  const prefix = parseInt(prefixLength, 10);
  
  if (isNaN(prefix) || prefix < 0 || prefix > 32) {
    return false;
  }
  
  const ipInt = ipToInt(ip);
  const networkInt = ipToInt(network);
  
  // 创建子网掩码
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  
  return (ipInt & mask) === (networkInt & mask);
}

/**
 * 检查 IP 是否匹配允许列表中的任一模式
 * 
 * @param clientIP - 客户端 IP
 * @param allowedPatterns - 允许的 IP 模式列表
 * @returns 是否允许访问
 */
export function isIPAllowed(clientIP: string, allowedPatterns: string[]): boolean {
  // 标准化客户端 IP（处理 IPv6 映射）
  const normalizedClientIP = normalizeIP(clientIP);
  
  for (const pattern of allowedPatterns) {
    const normalizedPattern = normalizeIP(pattern);
    
    // 1. 精确匹配
    if (normalizedClientIP === normalizedPattern) {
      return true;
    }
    
    // 2. CIDR 匹配
    if (normalizedPattern.includes('/')) {
      try {
        if (matchCIDR(normalizedClientIP, normalizedPattern)) {
          return true;
        }
      } catch (e) {
        // CIDR 格式错误，跳过
        continue;
      }
    }
    
    // 3. 通配符匹配
    if (normalizedPattern.includes('*')) {
      if (matchWildcard(normalizedClientIP, normalizedPattern)) {
        return true;
      }
    }
  }
  
  return false;
}

/**
 * 验证并格式化 IP 白名单配置
 * 
 * @param allowedIPsEnv - 环境变量中的 IP 配置（逗号分隔）
 * @returns 格式化后的 IP 模式数组
 */
export function parseAllowedIPs(allowedIPsEnv: string): string[] {
  return allowedIPsEnv
    .split(',')
    .map(ip => ip.trim())
    .filter(ip => ip.length > 0);
}

/**
 * 获取 IP 模式的描述信息
 * 
 * @param pattern - IP 模式
 * @returns 描述信息
 */
export function getPatternDescription(pattern: string): string {
  const normalized = normalizeIP(pattern);
  
  if (normalized.includes('/')) {
    return `CIDR 范围: ${normalized}`;
  } else if (normalized.includes('*')) {
    return `通配符模式: ${normalized}`;
  } else {
    return `精确 IP: ${normalized}`;
  }
}
