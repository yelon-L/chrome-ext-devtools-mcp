# Release Notes - v0.8.5

**Release Date:** October 13, 2025  
**Type:** Bug Fix & Enhancement  
**Priority:** Critical

---

## 🔴 Critical Fixes

### Session Management Race Condition (Multi-Tenant Mode)

**Issue:** All tool calls failed with "Session not found" error (100% error rate)

**Root Cause:** Session was created AFTER sending session ID to client, causing a race condition where clients received the ID before the session existed in SessionManager.

**Fix:** Reordered session creation to occur BEFORE sending SSE endpoint message.

**Impact:**
- Error rate: **100% → 0%**
- Tool availability: **0/38 → 38/38**
- Production readiness: **Not Ready → Production Ready** ✅

**Technical Details:** [Session Management Fix Guide](guides/SESSION_MANAGEMENT_FIX.md)

---

## ✨ Enhancements

### 1. Complete Multi-Tenant Mode Documentation

**Added to `--help` output:**
- `--mode multi-tenant` parameter
- Environment variables reference
- Configuration examples
- Usage patterns

**Example:**
```bash
$ ./chrome-extension-debug-linux-x64 --help

Multi-Tenant Mode:
  --mode multi-tenant    Enterprise-grade server for multiple users
  
  Environment Variables for Multi-Tenant:
    PORT=32122                   Server port (default: 32122)
    AUTH_ENABLED=true            Enable token authentication
    ALLOWED_IPS=ip1,ip2          IP whitelist (comma-separated)
    ALLOWED_ORIGINS=url1,url2    CORS origins (comma-separated)
    MAX_SESSIONS=100             Maximum concurrent sessions
    SESSION_TIMEOUT=1800000      Session timeout in ms (30 min)
    USE_CDP_HYBRID=true          Enable CDP hybrid mode
    USE_CDP_OPERATIONS=true      Use CDP for operations
```

### 2. English Logging

**Changed:** All server-side logs from Chinese to English

**Benefits:**
- Better international accessibility
- Easier debugging for global teams
- Consistent with MCP ecosystem standards

**Examples:**
```
Before: [Server] 📡 SSE 连接请求: user-123
After:  [Server] 📡 SSE connection request: user-123

Before: [Server] ❌ 用户未注册: user-123
After:  [Server] ❌ user not registered: user-123

Before: [Server] ✅ 会话建立: abc123... (用户: user-123, 耗时: 150ms)
After:  [Server] ✅ session established: abc123... (user: user-123, elapsed: 150ms)
```

---

## 📊 Performance Impact

### Before v0.8.5
```json
{
  "sessions": { "total": 0, "active": 0 },
  "performance": {
    "totalConnections": 4,
    "totalErrors": 4,
    "errorRate": "100.00%"
  }
}
```

### After v0.8.5
```json
{
  "sessions": { "total": 1, "active": 1 },
  "performance": {
    "totalConnections": 4,
    "totalErrors": 0,
    "errorRate": "0.00%"
  }
}
```

---

## 🔧 Technical Changes

### Files Modified

1. **`src/multi-tenant/server-multi-tenant.ts`**
   - Fixed session creation order
   - Converted logs to English
   - Enhanced debug logging

2. **`src/cli.ts`**
   - Added `--mode` parameter
   - Enhanced help documentation
   - Added Multi-Tenant examples

3. **`CHANGELOG.md`**
   - Added v0.8.5 section
   - Documented all changes

4. **`README.md` & `README.zh-CN.md`**
   - Added "What's New" section
   - Updated version information

### New Documentation

- **`docs/guides/SESSION_MANAGEMENT_FIX.md`** - Detailed fix analysis
- **`docs/RELEASE_NOTES_v0.8.5.md`** - This document

---

## 🚀 Upgrade Guide

### For Existing Users

1. **Download New Binary:**
   ```bash
   # Download from releases page
   wget https://github.com/.../chrome-extension-debug-linux-x64
   chmod +x chrome-extension-debug-linux-x64
   ```

2. **Restart Server:**
   ```bash
   # Stop old version
   pkill chrome-extension-debug
   
   # Start new version
   ./chrome-extension-debug-linux-x64 --mode multi-tenant
   ```

3. **Verify Fix:**
   ```bash
   # Check health endpoint
   curl http://localhost:32122/health
   
   # Should show errorRate: "0.00%"
   ```

### For New Users

Follow standard installation:
```bash
./chrome-extension-debug-linux-x64 --mode multi-tenant
```

All features now work out of the box!

---

## 🧪 Testing

### Regression Tests

All existing tests pass:
- ✅ Session creation
- ✅ SSE connection
- ✅ Tool execution (38/38)
- ✅ Authentication
- ✅ IP whitelist
- ✅ CORS handling

### New Test Coverage

Added session management race condition test to prevent future regressions.

---

## 📚 Additional Resources

- **CHANGELOG:** [CHANGELOG.md](../CHANGELOG.md#085---2025-10-13)
- **Session Fix Guide:** [SESSION_MANAGEMENT_FIX.md](guides/SESSION_MANAGEMENT_FIX.md)
- **Architecture:** [MULTI_TENANT_ARCHITECTURE_ANALYSIS.md](guides/MULTI_TENANT_ARCHITECTURE_ANALYSIS.md)
- **GitHub Issues:** [View all fixed issues](https://github.com/...)

---

## 🙏 Credits

- Issue discovered during comprehensive tools testing
- Fixed with systematic root cause analysis
- Documentation enhanced based on user feedback

---

## 📮 Feedback

If you encounter any issues with this release:

1. Check [Troubleshooting Guide](guides/TROUBLESHOOTING.md)
2. Review [Session Management Fix](guides/SESSION_MANAGEMENT_FIX.md)
3. Open an issue on GitHub with:
   - Version: 0.8.5
   - Error logs
   - Reproduction steps

---

**Status:** ✅ Production Ready  
**Confidence:** High  
**Recommended:** Upgrade Immediately (Critical Fix)
