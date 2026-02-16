# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Added

### Changed

### Deprecated

### Removed

### Fixed

### Security

---

## [0.1.0] - YYYY-MM-DD - Sprint 01

### Added

- Core foundation: Event Bus, Kill Switch, Database
- SQLite with WAL mode for concurrent access
- Persistent Kill Switch state (survives restarts)
- Basic configuration system
- Development environment with Docker Compose

### Changed

- N/A (first release)

### Fixed

- N/A

### Security

- Kill Switch emergency shutdown mechanism
- Persistent state prevents unauthorized restart

### Sprint Metrics

- **Test Coverage:** 75%
- **Story Points Completed:** 15/15
- **Bugs Found:** 2 (all fixed)

---

## [0.2.0] - YYYY-MM-DD - Sprint 02

### Added

- Agent Runtime with Claude API integration
- Tool Executor module with Docker sandbox
- Message Queue with persistence and retry logic
- Hardened Docker security (cap-drop, read-only root)
- Command obfuscation detection

### Changed

- Improved error handling in Event Bus
- Enhanced logging with structured JSON format

### Fixed

- Race condition in WhatsApp socket handling (#16918)
- Memory leak in Tool Executor (Container cleanup)

### Security

- Docker sandbox with `--cap-drop=ALL`
- Command validation and obfuscation detection
- Path-based access control (deny ~/.ssh, ~/.aws)

### Sprint Metrics

- **Test Coverage:** 80%
- **Story Points Completed:** 18/20
- **Bugs Found:** 3 (2 fixed, 1 tech debt)

---

## Template for Future Sprints

```markdown
## [X.Y.Z] - YYYY-MM-DD - Sprint XX

### Added

- Feature 1: [Description]
- Feature 2: [Description]

### Changed

- Change 1: [Description]

### Deprecated

- Feature X: [Reason, alternative]

### Removed

- Feature Y: [Reason]

### Fixed

- Bug #XX: [Description]
- Issue #YY: [Description]

### Security

- Security improvement: [Description]
- Vulnerability fix: [CVE-XXXX]

### Breaking Changes

- ⚠️ Change 1: [Description, migration guide]

### Sprint Metrics

- **Test Coverage:** XX%
- **Story Points Completed:** XX/YY
- **Bugs Found:** X (Y fixed, Z tech debt)

### Performance

- Metric 1: [Baseline → New] (Change: +/-X%)

### Contributors

- @username1
- @username2
```

---

## Version Numbering

**Semantic Versioning (MAJOR.MINOR.PATCH):**

- **MAJOR:** Breaking changes (e.g., API changes)
- **MINOR:** New features (backward compatible)
- **PATCH:** Bug fixes (backward compatible)

**Sprint to Version Mapping:**

- Sprint 01-04 → v0.1.x to v0.4.x (Foundation)
- Sprint 05-08 → v0.5.x to v0.8.x (Features)
- Sprint 09-12 → v0.9.x to v0.12.x (Polish)
- Production Ready → v1.0.0

---

## How to Update

**End of Sprint:**

1. Review all merged PRs
2. Categorize changes (Added, Changed, Fixed, etc.)
3. Add Sprint section to CHANGELOG.md
4. Update version number
5. Commit: `git commit -m "docs: Update CHANGELOG for Sprint XX"`

**Automated Script:**

```bash
# scripts/update-changelog.sh
SPRINT_NUMBER=$1
SPRINT_DATE=$(date +%Y-%m-%d)

# Extract commits since last tag
git log $(git describe --tags --abbrev=0)..HEAD --oneline > /tmp/commits.txt

# Parse and categorize (implement logic)
# Add to CHANGELOG.md

echo "CHANGELOG updated for Sprint $SPRINT_NUMBER"
```

---

## Links

- **Repository:** https://github.com/yourusername/openclaw-fork
- **Documentation:** [docs/](./docs/)
- **Issues:** https://github.com/yourusername/openclaw-fork/issues
- **Releases:** https://github.com/yourusername/openclaw-fork/releases

---

**Last Updated:** Sprint XX
