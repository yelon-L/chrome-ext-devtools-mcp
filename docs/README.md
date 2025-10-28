# Documentation

This directory contains all documentation for the Chrome Extension Debug MCP project.

## Structure

### `/guides/` - User Guides

Comprehensive guides for using and deploying the MCP server:

- **Multi-Tenant Guides**: Architecture, quick start, LAN deployment best practices
- **CDP Hybrid**: Chrome DevTools Protocol hybrid architecture implementation
- **Deployment**: Production deployment checklist and instructions
- **Testing**: Test instructions and examples
- **Session Management Fix**: Critical bug fix documentation (v0.8.5)

### `/archive/` - Development History

Historical development documents including:

- Implementation summaries and analysis
- Bug fix reports
- Optimization reports
- Test reports
- Architecture comparisons

These documents are kept for reference but represent the development process rather than current state.

## Core Documentation (Root Directory)

- **README.md**: Project overview and quick start
- **CHANGELOG.md**: Version history and changes
- **RELEASE_NOTES_v0.8.5.md**: Latest release notes (v0.8.5)
- **CONTRIBUTING.md**: Contribution guidelines
- **SECURITY.md**: Security policy
- **RELEASE.md**: Release information

## Finding Documentation

### For Users

1. Start with `/README.md` in the project root
2. See `/docs/guides/MULTI_TENANT_QUICK_START.md` for multi-tenant mode
3. Check `/docs/guides/DEPLOYMENT_CHECKLIST.md` for production deployment

### For Developers

1. Read `/CONTRIBUTING.md` for contribution guidelines
2. See `/docs/archive/` for implementation details and design decisions
3. Check `/docs/guides/` for architecture documentation

### For Troubleshooting

1. Check `/docs/guides/TEST_INSTRUCTIONS.md` for testing procedures
2. See `/docs/guides/MULTI_TENANT_LAN_BEST_PRACTICES.md` for common issues
3. Review `/CHANGELOG.md` for recent changes and fixes

## Latest Updates (v0.8.5)

🔴 **Critical Fix - Session Management**

- Fixed race condition causing 100% error rate in Multi-Tenant mode
- Session now created before SSE endpoint message is sent
- See: [SESSION_MANAGEMENT_FIX.md](guides/SESSION_MANAGEMENT_FIX.md)

✨ **Enhanced Documentation**

- Complete `--help` output for Multi-Tenant mode
- Environment variables reference
- English logging for better accessibility
- See: [RELEASE_NOTES_v0.8.5.md](RELEASE_NOTES_v0.8.5.md)

📚 **Key Documents for v0.8.5:**

- [Release Notes](RELEASE_NOTES_v0.8.5.md)
- [Session Management Fix Guide](guides/SESSION_MANAGEMENT_FIX.md)
- [CHANGELOG](../CHANGELOG.md#085---2025-10-13)
