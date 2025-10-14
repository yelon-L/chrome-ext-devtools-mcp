# Configuration Files Analysis

## Overview
Analysis of JSON configuration files and recommendations for cleanup.

---

## Files Analyzed

### 1. server.json
**Purpose:** MCP Server Registry Configuration  
**Status:** ⚠️ **Keep but needs update**

**Content:**
```json
{
  "name": "io.github.ChromeDevTools/chrome-devtools-mcp",
  "description": "MCP server for Chrome DevTools",
  "version": "0.6.0",  // ❌ Outdated (current: 0.8.5)
  ...
}
```

**Usage:**
- Used by MCP server registry
- Synced by `scripts/sync-server-json-version.ts`
- Has npm script: `sync-server-json-version`

**Action:** ✅ **Keep and Update**
```bash
npm run sync-server-json-version
```

---

### 2. release-please-config.json
**Purpose:** Release Please Configuration  
**Status:** ⚠️ **Potentially conflicting**

**Content:**
```json
{
  "packages": {
    ".": {}
  }
}
```

**Usage:**
- Used by GitHub Actions (`.github/workflows/release-please.yml`)
- Automates releases based on conventional commits
- **Conflicts with manual release process** described in `RELEASE.md`

**Current Situation:**
- `RELEASE.md` describes **manual release process** (git tags)
- GitHub Actions has **release-please** workflow
- These two approaches conflict!

**Recommendation:** ❌ **Remove** (choose manual release)

**Reasons:**
1. Project already has manual release workflow
2. `RELEASE.md` documents tag-based releases
3. release-please adds complexity without clear benefit
4. Manual process gives more control

**Alternative:** ✅ **Keep manual release**
- Better control over release notes
- Simpler for contributors to understand
- Existing documentation supports this

---

### 3. .release-please-manifest.json
**Purpose:** Release Please Version Manifest  
**Status:** ⚠️ **Outdated and redundant**

**Content:**
```json
{
  ".": "0.8.0"  // ❌ Outdated (current: 0.8.5)
}
```

**Recommendation:** ❌ **Remove** (if removing release-please)

---

### 4. gemini-extension.json
**Purpose:** Gemini Extension Configuration  
**Status:** ✅ **Keep**

**Content:**
```json
{
  "name": "chrome-devtools-mcp",
  "version": "latest",
  "mcpServers": {
    "chrome-devtools": {
      "command": "npx",
      "args": ["chrome-devtools-mcp@latest"]
    }
  }
}
```

**Usage:**
- Configuration for Gemini extension users
- Allows easy integration via npx
- No version sync needed (uses "latest")

**Recommendation:** ✅ **Keep as-is**

---

## Summary Table

| File | Purpose | Status | Action |
|------|---------|--------|--------|
| `server.json` | MCP registry | ⚠️ Outdated | ✅ Update version |
| `release-please-config.json` | Auto-release | ⚠️ Conflicts | ❌ Remove |
| `.release-please-manifest.json` | Release manifest | ⚠️ Redundant | ❌ Remove |
| `gemini-extension.json` | Gemini config | ✅ Good | ✅ Keep |

---

## Action Plan

### Step 1: Update server.json ✅
```bash
npm run sync-server-json-version
git add server.json
git commit -m "chore: sync server.json version to 0.8.5"
```

### Step 2: Remove release-please files
```bash
rm release-please-config.json
rm .release-please-manifest.json
git add .
git commit -m "chore: remove release-please (use manual release process)"
```

### Step 3: Remove release-please workflow
```bash
rm .github/workflows/release-please.yml
git add .
git commit -m "chore: remove release-please workflow"
```

### Step 4: Update .gitignore (if needed)
No changes needed - these files were tracked.

---

## Rationale

### Why Remove release-please?

**Pros of Manual Release:**
1. ✅ Better control over release timing
2. ✅ Can review all changes before release
3. ✅ Simpler for contributors
4. ✅ Already documented in RELEASE.md
5. ✅ Existing GitHub Actions for binary builds work well

**Cons of release-please:**
1. ❌ Requires strict conventional commits
2. ❌ Adds complexity
3. ❌ Conflicts with manual process
4. ❌ Not documented in current workflows
5. ❌ Manifest file gets out of sync

### Why Keep server.json?

1. ✅ Required for MCP server registry
2. ✅ Automated sync script exists
3. ✅ Part of official MCP ecosystem
4. ✅ No maintenance burden

### Why Keep gemini-extension.json?

1. ✅ User convenience for Gemini extension
2. ✅ Uses "latest" (no version sync needed)
3. ✅ Simple and clear
4. ✅ No maintenance burden

---

## Verification

After cleanup:
```bash
ls -la *.json

# Should have:
# package.json
# package-lock.json  
# server.json (updated)
# gemini-extension.json
# tsconfig.json

# Should NOT have:
# release-please-config.json
# .release-please-manifest.json
```

---

## Documentation Updates Needed

1. ✅ `RELEASE.md` - Already documents manual process
2. ✅ `scripts/README.md` - Already documents sync-server-json-version
3. ⚠️ Root `.github/workflows/` - Remove release-please.yml

---

**Analysis Date:** 2025-10-13  
**Current Version:** 0.8.5  
**Recommendation:** Remove release-please, keep manual release process
