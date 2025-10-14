# Extension Detection Enhancement Analysis

**Date:** 2025-10-13  
**Issue:** `list_extensions` cannot detect disabled or inactive extensions  
**Status:** Analysis Complete + Solution Proposed

---

## 🔍 Problem Analysis

### Current Situation (From Screenshot)

User has 2 Chrome extensions:
1. **"Enhanced MCP Debug Test Extension 2.1.0"**
   - Status: ❌ **Disabled** (toggle off)
   - ID: `pjelljkehgiabmjmfhjhffiblop`
   - Cannot be detected by current implementation

2. **"Video SRT Ext MVP 0.9.0"**
   - Status: ✅ Enabled
   - ID: `lnidiajhkakibgicoamnbmfedgpmpafj`
   - Service Worker: 🔴 **Inactive** (不活跃)
   - May not be reliably detected

### Root Cause

**Two detection strategies, both have limitations:**

#### Strategy 1: chrome.management.getAll() API
- ✅ Returns ALL extensions (enabled + disabled)
- ❌ **Requires at least ONE active Service Worker context**
- Current issue: If all SWs are inactive, this fails

#### Strategy 2: Target Scanning (Fallback)
- ❌ **Only finds extensions with active targets**
- Disabled extensions = no targets
- Inactive SW + no other contexts = invisible

---

## 💡 Recommended Solution: Visual Inspection

### Approach: Parse chrome://extensions/ page

**Why this works:**
- ✅ Detects ALL extensions regardless of state
- ✅ Works even when all SWs are inactive
- ✅ Shows exact state user sees in Chrome

**Implementation:**

```typescript
async getExtensionsViaVisualInspection(): Promise<ExtensionInfo[]> {
  const page = await this.browser.newPage();
  
  // 1. Navigate to extensions page
  await page.goto('chrome://extensions/');
  
  // 2. Enable developer mode (shows IDs)
  await page.click('#devMode');
  
  // 3. Extract extension data from DOM
  const extensions = await page.evaluate(() => {
    const items = document.querySelectorAll('extensions-item');
    return Array.from(items).map(item => ({
      id: item.id,
      name: item.shadowRoot.querySelector('#name').textContent,
      version: item.shadowRoot.querySelector('#version').textContent,
      enabled: item.shadowRoot.querySelector('cr-toggle').checked,
    }));
  });
  
  await page.close();
  return extensions;
}
```

---

## 🚀 Immediate Workaround

### For Current Issue:

**Option 1: Enable one extension**
```
Enable "Enhanced MCP Debug Test Extension" in Chrome
Then: list_extensions
```

**Option 2: Activate a Service Worker**
```
activate_extension_service_worker with:
  extensionId="lnidiajhkakibgicoamnbmfedgpmpafj"
  mode="single"
```

**Option 3: Use includeDisabled parameter**
```
list_extensions with includeDisabled=true
```
(May still not work if no active contexts)

---

## 📊 Solution Comparison

| Method | Speed | Detects Disabled | Detects Inactive SW |
|--------|-------|------------------|---------------------|
| chrome.management API | Fast | ✅ Yes | ✅ Yes (needs 1 active SW) |
| Visual Inspection | Slow | ✅ Yes | ✅ Yes (always works) |
| Target Scanning | Fast | ❌ No | ⚠️ Sometimes |

---

## 🎯 Next Steps

1. Implement visual inspection fallback
2. Update tool description to explain limitations
3. Add automatic retry with different strategies
4. Cache extension list for performance

---

**Recommendation:** Implement hybrid strategy with visual inspection as reliable fallback.
