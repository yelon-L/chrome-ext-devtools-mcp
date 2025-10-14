# Documentation and Scripts Cleanup Plan

## Current Status
- **68 Markdown files** in root directory (too many!)
- **20+ test scripts** in root directory
- Mix of English and Chinese documents
- Many development/debug temporary files

## Cleanup Strategy

### Phase 1: Documents

#### Keep in Root (Core Docs - Must be English)
- `README.md` ✅ (already English)
- `CHANGELOG.md` ✅ (already English)
- `CONTRIBUTING.md` ✅ (already English)
- `SECURITY.md` ✅ (already English)

#### Move to docs/ (User Documentation)
- Multi-tenant guide
- Deployment guide
- Architecture docs

#### Archive to docs/archive/ (Development History)
All the analysis, implementation summaries, test reports, etc.

#### Delete (Temporary/Duplicate)
- Chinese documents (魔改增强方案.md, 文档索引.md, etc.)
- Today's optimization summaries (already in git history)
- Duplicate test reports

### Phase 2: Scripts

#### Keep (Essential)
- `scripts/` directory scripts (build, package, etc.)

#### Delete (Temporary Test Scripts)
- test-*.mjs files
- test-*.sh files  
- debug-*.mjs files
- quick-*.mjs files

#### Keep Test Scripts in tests/ or scripts/
Move useful ones to proper directories

## Actions

1. Create `docs/archive/` directory
2. Move documents according to plan
3. Delete Chinese and temporary docs
4. Clean up test scripts
5. Add README to docs/ explaining structure
