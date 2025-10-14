/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * IP address matcher
 * 
 * Supports multiple IP formats:
 * 1. IPv4: 192.168.0.1
 * 2. IPv4 CIDR: 192.168.0.0/16
 * 3. IPv6 mapped IPv4: ::ffff:192.168.0.1
 * 4. Wildcard: 192.168.*.*, 192.168.0.*
 */

/**
 * Standardize IP address
 * Convert IPv6 mapped IPv4 address to pure IPv4
 * 
 * @param ip - Original IP address
 * @returns Standardized IP
 */
export function normalizeIP(ip: string): string {
  // Process IPv6 mapped IPv4 address: ::ffff:192.168.0.1 -> 192.168.0.1
  if (ip.startsWith('::ffff:')) {
    return ip.substring(7);
  }
  
  // Process complete IPv6 mapped format: 0:0:0:0:0:ffff:c0a8:0001 -> 192.168.0.1
  const ipv6MappedMatch = ip.match(/^(?:0:){5}ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i);
  if (ipv6MappedMatch) {
    const part1 = parseInt(ipv6MappedMatch[1], 16);
    const part2 = parseInt(ipv6MappedMatch[2], 16);
    return `${part1 >> 8}.${part1 & 0xff}.${part2 >> 8}.${part2 & 0xff}`;
  }
  
  return ip;
}

/**
 * Check if IP matches wildcard pattern
 * 
 * @param ip - IP to check
 * @param pattern - Wildcard pattern (e.g., 192.168.*.*)
 * @returns Whether it matches
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
 * Convert IP address to 32-bit integer
 * 
 * @param ip - IPv4 address
 * @returns 32-bit integer
 */
function ipToInt(ip: string): number {
  const parts = ip.split('.').map(Number);
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
}

/**
 * Check if IP is within CIDR range
 * 
 * @param ip - IP to check
 * @param cidr - CIDR notation (e.g., 192.168.0.0/16)
 * @returns Whether it is within range
 */
function matchCIDR(ip: string, cidr: string): boolean {
  const [network, prefixLength] = cidr.split('/');
  const prefix = parseInt(prefixLength, 10);
  
  if (isNaN(prefix) || prefix < 0 || prefix > 32) {
    return false;
  }
  
  const ipInt = ipToInt(ip);
  const networkInt = ipToInt(network);
  
  // Create subnet mask
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  
  return (ipInt & mask) === (networkInt & mask);
}

/**
 * Check if IP matches any pattern in the allowed list
 * 
 * @param clientIP - Client IP
 * @param allowedPatterns - List of allowed IP patterns
 * @returns Whether access is allowed
 */
export function isIPAllowed(clientIP: string, allowedPatterns: string[]): boolean {
  // Standardize client IP (handle IPv6 mapping)
  const normalizedClientIP = normalizeIP(clientIP);
  
  for (const pattern of allowedPatterns) {
    const normalizedPattern = normalizeIP(pattern);
    
    // 1. Exact match
    if (normalizedClientIP === normalizedPattern) {
      return true;
    }
    
    // 2. CIDR match
    if (normalizedPattern.includes('/')) {
      try {
        if (matchCIDR(normalizedClientIP, normalizedPattern)) {
          return true;
        }
      } catch (e) {
        // CIDR format error, skip
        continue;
      }
    }
    
    // 3. Wildcard match
    if (normalizedPattern.includes('*')) {
      if (matchWildcard(normalizedClientIP, normalizedPattern)) {
        return true;
      }
    }
  }
  
  return false;
}

/**
 * Validate and format IP whitelist configuration
 * 
 * @param allowedIPsEnv - IP configuration from environment variable (comma-separated)
 * @returns Formatted IP pattern array
 */
export function parseAllowedIPs(allowedIPsEnv: string): string[] {
  return allowedIPsEnv
    .split(',')
    .map(ip => ip.trim())
    .filter(ip => ip.length > 0);
}

/**
 * Get IP pattern description
 * 
 * @param pattern - IP pattern
 * @returns Description
 */
export function getPatternDescription(pattern: string): string {
  const normalized = normalizeIP(pattern);
  
  if (normalized.includes('/')) {
    return `CIDR Range: ${normalized}`;
  } else if (normalized.includes('*')) {
    return `Wildcard Pattern: ${normalized}`;
  } else {
    return `Exact IP: ${normalized}`;
  }
}
