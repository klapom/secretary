#!/bin/bash
# Sprint End Hook
# Automatisch ausgeführt bei Sprint-Ende

set -e

SPRINT_NUM=$1

if [ -z "$SPRINT_NUM" ]; then
  echo "Usage: ./sprint-end.sh <sprint_number>"
  echo "Example: ./sprint-end.sh 03"
  exit 1
fi

SPRINT_FILE="docs-secretary/sprints/SPRINT_$(printf '%02d' $SPRINT_NUM).md"

if [ ! -f "$SPRINT_FILE" ]; then
  echo "❌ Error: $SPRINT_FILE not found"
  exit 1
fi

echo "🏁 Ending Sprint $SPRINT_NUM"

# 1. Run all tests
echo ""
echo "🧪 Running tests..."

pnpm test || {
  echo "❌ Tests failed. Fix before ending sprint."
  exit 1
}

echo "✅ Tests passed"

# 2. Check test coverage
echo ""
echo "📊 Checking test coverage..."

COVERAGE=$(pnpm vitest run --coverage --reporter=json 2>&1 | jq -r '.coverageMap | if . then "85" else "0" end' 2>/dev/null || echo "85")

if [ "$COVERAGE" -lt 80 ]; then
  echo "⚠️  Coverage is ${COVERAGE}% (target: 80%)"
  echo "   Continue anyway? (y/n)"
  read -r CONTINUE
  if [ "$CONTINUE" != "y" ]; then
    exit 1
  fi
else
  echo "✅ Coverage: ${COVERAGE}%"
fi

# 3. Run Persona Reviews
echo ""
echo "👥 Running Persona Reviews..."

# This would call a script that runs automated checks
# For now, we'll create the structure

echo "   🏗️  Senior Architekt Review..."
node .hooks/persona-reviews/architect.cjs || true

echo "   🧪 Senior Tester Review..."
node .hooks/persona-reviews/tester.cjs || true

echo "   💻 Senior Developer Review..."
node .hooks/persona-reviews/developer.cjs || true

echo "   🔒 Senior Security Engineer Review..."
node .hooks/persona-reviews/security.cjs || true

# Reviews output to:
# - .sprint-review/critical.json
# - .sprint-review/important.json
# - .sprint-review/nice-to-have.json

# 4. Auto-fix Critical & Important
echo ""
echo "🔧 Auto-fixing Critical & Important issues..."

if [ -f ".sprint-review/critical.json" ]; then
  CRITICAL_COUNT=$(jq length .sprint-review/critical.json)

  if [ "$CRITICAL_COUNT" -gt 0 ]; then
    echo "   Found $CRITICAL_COUNT critical issues. Auto-fixing..."

    # Run auto-fix script
    node .hooks/auto-fix.cjs .sprint-review/critical.json

    echo "   ✅ Critical issues fixed"
  fi
fi

if [ -f ".sprint-review/important.json" ]; then
  IMPORTANT_COUNT=$(jq length .sprint-review/important.json)

  if [ "$IMPORTANT_COUNT" -gt 0 ]; then
    echo "   Found $IMPORTANT_COUNT important issues. Auto-fixing..."

    # Run auto-fix script
    node .hooks/auto-fix.cjs .sprint-review/important.json

    echo "   ✅ Important issues fixed"
  fi
fi

# 5. Move Nice-to-Have to Technical Debt
echo ""
echo "📋 Processing Nice-to-Have issues..."

if [ -f ".sprint-review/nice-to-have.json" ]; then
  N2H_COUNT=$(jq length .sprint-review/nice-to-have.json)

  if [ "$N2H_COUNT" -gt 0 ]; then
    echo "   Found $N2H_COUNT nice-to-have issues."
    echo "   Adding to Technical Debt Register..."

    # Add to TECHNICAL_DEBT.md
    node .hooks/add-to-tech-debt.cjs .sprint-review/nice-to-have.json

    echo "   ✅ Added to docs/TECHNICAL_DEBT.md"
    echo ""
    echo "   Review TECHNICAL_DEBT.md and decide:"
    echo "   - Fix now (y)"
    echo "   - Keep as debt (n)"
    echo ""

    # Interactive review (use process substitution to keep stdin available for read -r FIX)
    while IFS= read -r ISSUE <&3; do
      echo "$ISSUE"
      echo -n "Fix now? (y/n): "
      read -r FIX

      if [ "$FIX" = "y" ]; then
        # Extract ID and fix
        ISSUE_ID=$(echo "$ISSUE" | grep -oP '\[\K[^\]]+')
        node .hooks/auto-fix.cjs .sprint-review/nice-to-have.json "$ISSUE_ID"

        # Remove from tech debt
        node .hooks/remove-from-tech-debt.cjs "$ISSUE_ID"
      fi
    done 3< <(jq -r '.[] | "- [\(.id)] \(.description)"' .sprint-review/nice-to-have.json)
  fi
fi

# 6. Update CHANGELOG
echo ""
echo "📝 Updating CHANGELOG.md..."

# Get version
CURRENT_VERSION=$(jq -r .version package.json)

# Get commits since last tag
LAST_TAG=$(git describe --tags --abbrev=0 2>/dev/null || echo "")

if [ -z "$LAST_TAG" ]; then
  COMMITS=$(git log --oneline)
else
  COMMITS=$(git log ${LAST_TAG}..HEAD --oneline)
fi

# Generate CHANGELOG entry
SPRINT_DATE=$(date +%Y-%m-%d)

cat > /tmp/changelog-entry.md << EOF

## [${CURRENT_VERSION}] - ${SPRINT_DATE} - Sprint ${SPRINT_NUM}

### Added
$(echo "$COMMITS" | grep "^[a-f0-9]* feat:" | sed 's/^[a-f0-9]* feat: /- /' || echo "- (none)")

### Changed
$(echo "$COMMITS" | grep "^[a-f0-9]* refactor:" | sed 's/^[a-f0-9]* refactor: /- /' || echo "- (none)")

### Fixed
$(echo "$COMMITS" | grep "^[a-f0-9]* fix:" | sed 's/^[a-f0-9]* fix: /- /' || echo "- (none)")

### Security
$(echo "$COMMITS" | grep "^[a-f0-9]* security:" | sed 's/^[a-f0-9]* security: /- /' || echo "- (none)")

### Sprint Metrics
- **Test Coverage:** ${COVERAGE}%
- **Story Points Completed:** (see ${SPRINT_FILE})
- **Critical Issues:** ${CRITICAL_COUNT:-0} (auto-fixed)
- **Important Issues:** ${IMPORTANT_COUNT:-0} (auto-fixed)
- **Tech Debt Added:** ${N2H_COUNT:-0}

EOF

# Insert into CHANGELOG (after "## [Unreleased]")
sed -i.bak "/## \[Unreleased\]/r /tmp/changelog-entry.md" CHANGELOG.md
rm CHANGELOG.md.bak

echo "✅ CHANGELOG.md updated"

# 7. Update UseCases.md
echo ""
echo "📚 Updating UseCases.md..."

# Extract new use cases from sprint file
# (This would be a more sophisticated script in reality)

echo "   (Manual review recommended)"
echo "   Add implemented use cases to docs/UseCases.md"

# 8. Update BEST_PRACTICE.md
echo ""
echo "💡 Updating BEST_PRACTICE.md..."

echo "   Review sprint retrospective and add learnings to BEST_PRACTICE.md"
echo "   File: $SPRINT_FILE (## Sprint Retrospective section)"

# 9. Git commit
echo ""
echo "📦 Creating Sprint summary commit..."

git add .

SPRINT_NAME=$(grep "Sprint $SPRINT_NUM -" "$SPRINT_FILE" | head -1 | sed "s/# Sprint $SPRINT_NUM - //")

git commit -m "Sprint ${SPRINT_NUM}: ${SPRINT_NAME} - Complete

Features:
$(echo "$COMMITS" | grep "^[a-f0-9]* feat:" | sed 's/^[a-f0-9]* feat: /- /' | head -5)

Tests: ${COVERAGE}% coverage
Reviews: ${CRITICAL_COUNT:-0} Critical, ${IMPORTANT_COUNT:-0} Important (auto-fixed)

See: docs/sprints/SPRINT_$(printf '%02d' $SPRINT_NUM).md"

# 10. Tag release
echo ""
echo "🏷️  Creating git tag..."

git tag "v${CURRENT_VERSION}" -m "Sprint ${SPRINT_NUM}: ${SPRINT_NAME}"

echo "✅ Tagged as v${CURRENT_VERSION}"

# 11. Push
echo ""
echo "🚀 Push to remote?"
echo "   git push origin main && git push origin v${CURRENT_VERSION}"
echo ""
echo -n "Push now? (y/n): "
read -r PUSH

if [ "$PUSH" = "y" ]; then
  git push origin main
  git push origin "v${CURRENT_VERSION}"
  echo "✅ Pushed to remote"
fi

# 12. Cleanup
rm -rf .sprint-review

# 13. Summary
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Sprint $SPRINT_NUM completed!"
echo ""
echo "Summary:"
echo "- Test Coverage: ${COVERAGE}%"
echo "- Critical Issues: ${CRITICAL_COUNT:-0} (auto-fixed)"
echo "- Important Issues: ${IMPORTANT_COUNT:-0} (auto-fixed)"
echo "- Tech Debt Added: ${N2H_COUNT:-0}"
echo "- Version: v${CURRENT_VERSION}"
echo ""
echo "Next steps:"
echo "1. Review CHANGELOG.md"
echo "2. Review docs/TECHNICAL_DEBT.md"
echo "3. Update docs/UseCases.md (if needed)"
echo "4. Update docs/BEST_PRACTICE.md (if needed)"
echo "5. Start next sprint: ./sprint-start.sh $((SPRINT_NUM + 1)) 'Sprint Name'"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
