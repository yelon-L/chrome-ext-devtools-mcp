# Release Guide

This document describes how to create and publish releases for Chrome Extension Debug MCP.

## Release Process

### 1. Prepare Release

#### Update Version Number

Edit `package.json`:

```json
{
  "version": "0.8.2"
}
```

#### Update CHANGELOG.md

Add new version changelog at the top of `CHANGELOG.md`:

```markdown
## [0.8.2] - 2025-10-13

### Added

- New feature description

### Fixed

- Bug fix description

### Changed

- Change description
```

#### Commit Changes

```bash
git add package.json CHANGELOG.md
git commit -m "chore: bump version to 0.8.2"
git push origin main
```

---

### 2. Create Release Tag

```bash
# Create annotated tag
git tag -a v0.8.2 -m "Release v0.8.2"

# Push tag to GitHub
git push origin v0.8.2
```

**Important:** Tag format must be `v*.*.*` (e.g., `v0.8.2`) to trigger GitHub Actions.

---

### 3. GitHub Actions Automated Build

After pushing the tag, GitHub Actions will automatically:

1. ✅ Checkout code
2. ✅ Install Node.js and Bun
3. ✅ Install dependencies
4. ✅ Build project (`npm run build`)
5. ✅ Package binaries for all platforms
   - Linux x64
   - Linux ARM64
   - macOS x64 (Intel)
   - macOS ARM64 (Apple Silicon)
   - Windows x64
6. ✅ Generate SHA256 checksums
7. ✅ Create GitHub Release
8. ✅ Upload all binaries to Release

---

### 4. Verify Release

Visit GitHub Releases page:

```
https://github.com/ChromeDevTools/chrome-devtools-mcp/releases
```

Checklist:

- ✅ Release created
- ✅ All binary files uploaded
- ✅ checksums.txt file exists
- ✅ Release notes correct

---

### 5. Test Binary Files

Download and test binary files for each platform:

#### Linux/macOS

```bash
# Download
wget https://github.com/ChromeDevTools/chrome-devtools-mcp/releases/download/v0.8.2/chrome-extension-debug-linux-x64

# Verify checksum
wget https://github.com/ChromeDevTools/chrome-devtools-mcp/releases/download/v0.8.2/checksums.txt
sha256sum -c checksums.txt

# Add execute permission
chmod +x chrome-extension-debug-linux-x64

# Test run
./chrome-extension-debug-linux-x64 --version
```

#### Windows

```powershell
# Download and run
Invoke-WebRequest -Uri "https://github.com/ChromeDevTools/chrome-devtools-mcp/releases/download/v0.8.2/chrome-extension-debug-windows-x64.exe" -OutFile "chrome-extension-debug.exe"

# Test
.\chrome-extension-debug.exe --version
```

---

## Local Binary Build (Development Testing)

To test binary builds locally before release:

```bash
# Use Bun packaging script
bash scripts/package-bun.sh
```

This will generate binaries for all platforms in the `dist/` directory.

**Note:** The `dist/` directory is in `.gitignore` and won't be committed to the repository.

---

## Quick Release Checklist

- [ ] Update `package.json` version number
- [ ] Update `CHANGELOG.md` with version changes
- [ ] Commit changes to main branch
- [ ] Create and push version tag (`git tag -a v0.8.2 -m "Release v0.8.2"`)
- [ ] Wait for GitHub Actions to complete build (~5-10 minutes)
- [ ] Verify Release page
- [ ] Test downloaded binaries
- [ ] Announce new version in community

---

## Rollback Release

If issues are discovered and rollback is needed:

```bash
# 1. Delete remote tag
git push --delete origin v0.8.2

# 2. Delete local tag
git tag -d v0.8.2

# 3. Delete Release on GitHub
# Visit Release page → Click "Delete" button

# 4. Fix issues and re-release
```

---

## Pre-release Versions

Create pre-release versions (Beta, RC):

```bash
# Create pre-release tag
git tag -a v0.9.0-beta.1 -m "Beta release v0.9.0-beta.1"
git push origin v0.9.0-beta.1
```

GitHub Actions will automatically mark as **Pre-release**.

---

## Troubleshooting

### Issue 1: GitHub Actions Failure

**Check logs:**

```
https://github.com/ChromeDevTools/chrome-devtools-mcp/actions
```

**Common causes:**

- Build failure: Check TypeScript compilation errors
- Bun packaging failure: Check Bun version compatibility
- Permission issues: Verify `GITHUB_TOKEN` permissions

### Issue 2: Binary File Won't Run

**Linux:**

```bash
# Check permissions
chmod +x chrome-extension-debug-linux-x64

# Check dependencies
ldd chrome-extension-debug-linux-x64
```

**macOS:**

```bash
# Remove quarantine attribute
xattr -d com.apple.quarantine chrome-extension-debug-macos-x64
```

---

## Release Strategy

### Version Numbering

Follows [Semantic Versioning](https://semver.org/):

- **Major**: Incompatible API changes (1.0.0 → 2.0.0)
- **Minor**: Backward-compatible new features (0.8.0 → 0.9.0)
- **Patch**: Backward-compatible bug fixes (0.8.1 → 0.8.2)

### Release Frequency

- **Patch**: Weekly or when critical bugs are fixed
- **Minor**: Monthly or when new features are added
- **Major**: For significant architectural changes or breaking changes

---

## Related Links

- [GitHub Actions Workflow](.github/workflows/release.yml)
- [Bun Packaging Script](scripts/package-bun.sh)
- [CHANGELOG](CHANGELOG.md)
- [Keep a Changelog](https://keepachangelog.com/)
- [Semantic Versioning](https://semver.org/)

---

**Last Updated:** 2025-10-13
