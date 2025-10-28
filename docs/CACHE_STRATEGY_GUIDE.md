# Cache Strategy Guide for reload_extension

## Quick Start

The `reload_extension` tool now includes smart cache management to prevent browser caching issues during development.

## TL;DR

**Just use the default (`auto`) strategy** - it automatically detects and handles cache issues:

```typescript
reload_extension({
  extensionId: 'your-extension-id',
  // cacheStrategy: "auto" is default
});
```

## When to Use Each Strategy

### 🤖 auto (Default - Recommended)

**Use when:** Most development scenarios

**What it does:**

- Automatically detects if browser is using cached code
- Selects appropriate strategy based on detection
- Zero configuration required

**Example:**

```typescript
reload_extension({
  extensionId: 'abcd...',
  cacheStrategy: 'auto',
});
```

---

### 🧹 force-clear

**Use when:**

- Code changes don't appear after reload
- You know there are caching issues
- Starting a fresh debugging session

**What it does:**

- Clears ALL browser caches before reload
- HTTP cache, Service Worker cache, IndexedDB, localStorage, etc.
- Most thorough but slower (~1-2 seconds)

**Example:**

```typescript
reload_extension({
  extensionId: 'abcd...',
  cacheStrategy: 'force-clear',
});
```

---

### 💾 preserve

**Use when:**

- Rapid iteration during development
- Cache is not a concern
- Speed is priority

**What it does:**

- Keeps all caches intact
- Fastest reload option (no overhead)
- May use cached resources

**Example:**

```typescript
reload_extension({
  extensionId: 'abcd...',
  cacheStrategy: 'preserve',
});
```

---

### 🚫 disable

**Use when:**

- Final testing before release
- Ensuring no cache artifacts
- Verifying production behavior

**What it does:**

- Disables caching during reload
- HTTP cache bypassed for extension resources
- Slightly slower but ensures fresh code

**Example:**

```typescript
reload_extension({
  extensionId: 'abcd...',
  cacheStrategy: 'disable',
});
```

## Decision Tree

```
Need to reload extension?
│
├─ Not sure if cache is an issue?
│  └─ Use: auto ✅
│
├─ Code not updating after reload?
│  └─ Use: force-clear 🧹
│
├─ Need fastest reload possible?
│  └─ Use: preserve 💾
│
└─ Testing production behavior?
   └─ Use: disable 🚫
```

## Common Scenarios

### Scenario 1: Normal Development

```typescript
// Just use default - auto handles everything
reload_extension({extensionId: 'abc...'});
```

### Scenario 2: "Why isn't my code working?"

```typescript
// Force clear all caches
reload_extension({
  extensionId: 'abc...',
  cacheStrategy: 'force-clear',
});
```

### Scenario 3: Hot Reload During Active Development

```typescript
// Fast reloads without cache clearing
reload_extension({
  extensionId: 'abc...',
  cacheStrategy: 'preserve',
});
```

### Scenario 4: Pre-Release Testing

```typescript
// Ensure no caching issues in production
reload_extension({
  extensionId: 'abc...',
  cacheStrategy: 'disable',
});
```

## Understanding the Output

### Auto Strategy Detection

```
## Step 3: Smart Cache Management
**Requested Strategy**: auto
🔍 Detecting cache issues...
**Detection Result**: ⚠️ Cache issues detected
**Auto-Selected Strategy**: force-clear
**Reason**: Extension reloaded recently, browser cache may contain stale resources
```

This tells you:

1. You requested `auto`
2. System detected cache issues
3. Automatically switched to `force-clear`
4. Reason why it made this decision

### Force-Clear Success

```
🧹 Clearing all browser caches...
✅ Cache cleared successfully:
   - Cleared: Cache, CacheStorage, Service Workers
   - Cleared: IndexedDB, localStorage, cookies
   - Cleared: AppCache, WebSQL, file systems
```

All browser caches were successfully cleared.

### Preserve Strategy

```
💾 Preserving caches for faster reload
   - Browser HTTP cache will be used if available
   - Service Worker cache will be preserved
```

Caches kept intact for speed.

## FAQ

### Q: Which strategy should I use?

**A:** Start with `auto` (the default). It handles 95% of cases automatically.

### Q: How does auto-detection work?

**A:** It checks:

- How recently the extension was reloaded
- Service Worker status for MV3 extensions
- If issues found → uses `force-clear`
- If no issues → uses `preserve`

### Q: Will force-clear delete my extension data?

**A:** No, unless you also set `preserveStorage: false`. Use:

```typescript
reload_extension({
  extensionId: 'abc...',
  cacheStrategy: 'force-clear',
  preserveStorage: true, // Keeps chrome.storage data
});
```

### Q: Is force-clear slow?

**A:** It adds 1-2 seconds to reload time. Worth it to ensure fresh code.

### Q: Can I combine strategies with other options?

**A:** Yes! All strategies work with:

- `preserveStorage`
- `waitForReady`
- `captureErrors`

```typescript
reload_extension({
  extensionId: 'abc...',
  cacheStrategy: 'auto',
  preserveStorage: true,
  waitForReady: true,
  captureErrors: true,
});
```

## Best Practices

### ✅ Do

1. **Use `auto` by default** - It's smart and automatic
2. **Use `force-clear` when debugging cache issues** - Most reliable
3. **Use `preserve` for hot reloading** - Fastest iteration
4. **Check the output** - Understand which strategy was used

### ❌ Don't

1. **Don't always use `force-clear`** - Slower than needed
2. **Don't ignore the output** - It tells you what happened
3. **Don't use `preserve` if cache is suspect** - Won't fix stale code

## Performance Comparison

| Strategy    | Speed         | Thoroughness | Use Case               |
| ----------- | ------------- | ------------ | ---------------------- |
| auto        | Variable      | Smart        | General development ⭐ |
| force-clear | Slow (1-2s)   | Highest      | Cache issues           |
| preserve    | Fastest (0ms) | None         | Hot reload             |
| disable     | Medium        | High         | Final testing          |

## Integration with AI Agents

AI agents can now automatically handle cache issues:

```typescript
// AI detects code not updating after reload
// Automatically retries with force-clear strategy
try {
  await reload_extension({
    extensionId: 'abc...',
    cacheStrategy: 'auto', // First attempt
  });
} catch (error) {
  // If auto doesn't work, AI can try force-clear
  await reload_extension({
    extensionId: 'abc...',
    cacheStrategy: 'force-clear',
  });
}
```

## Summary

- **Default strategy**: `auto` - Smart and automatic
- **Most thorough**: `force-clear` - Clears everything
- **Fastest**: `preserve` - No cache operations
- **Production-like**: `disable` - No caching during reload

**Recommendation:** Stick with `auto` unless you have a specific reason to override it.
