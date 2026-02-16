#!/bin/bash
# Sprint Start Hook
# Automatisch ausgeführt bei Sprint-Start

set -e

SPRINT_NUM=$1
SPRINT_NAME=$2

if [ -z "$SPRINT_NUM" ] || [ -z "$SPRINT_NAME" ]; then
  echo "Usage: ./sprint-start.sh <sprint_number> <sprint_name>"
  echo "Example: ./sprint-start.sh 03 'Security & Messaging'"
  exit 1
fi

echo "🚀 Starting Sprint $SPRINT_NUM: $SPRINT_NAME"

# 1. Analyze last CI run
echo ""
echo "📊 Analyzing last CI run..."

if [ -d ".github/workflows" ]; then
  # Get last workflow run status (requires gh CLI)
  if command -v gh &> /dev/null; then
    LAST_RUN=$(gh run list --limit 1 --json conclusion,databaseId,displayTitle,createdAt,url)
    echo "$LAST_RUN" | jq '.'

    # Extract status
    STATUS=$(echo "$LAST_RUN" | jq -r '.[0].conclusion')

    if [ "$STATUS" = "failure" ]; then
      echo "⚠️  Last CI run FAILED. Adding CI improvement to sprint backlog."
      # This will be added to sprint template
    elif [ "$STATUS" = "success" ]; then
      echo "✅ Last CI run passed."
    fi
  else
    echo "⚠️  gh CLI not found. Skipping CI analysis."
    echo "Install: brew install gh (Mac) or apt install gh (Linux)"
  fi
else
  echo "ℹ️  No CI configured yet."
fi

# 2. Create Sprint file from template
echo ""
echo "📄 Creating Sprint file..."

SPRINT_FILE="docs-secretary/sprints/SPRINT_$(printf '%02d' $SPRINT_NUM).md"

if [ -f "$SPRINT_FILE" ]; then
  echo "⚠️  $SPRINT_FILE already exists. Skipping."
else
  cp docs-secretary/planning/SPRINT_TEMPLATE_V2.md "$SPRINT_FILE"

  # Replace placeholders
  sed -i.bak "s/Sprint XX/Sprint $SPRINT_NUM/g" "$SPRINT_FILE"
  sed -i.bak "s/\[Sprint Name\]/$SPRINT_NAME/g" "$SPRINT_FILE"

  # Add dates
  START_DATE=$(date +%Y-%m-%d)
  END_DATE=$(date -v+14d +%Y-%m-%d 2>/dev/null || date -d "+14 days" +%Y-%m-%d)

  sed -i.bak "s/\[Start Date\]/$START_DATE/g" "$SPRINT_FILE"
  sed -i.bak "s/\[End Date\]/$END_DATE/g" "$SPRINT_FILE"

  rm "${SPRINT_FILE}.bak"

  echo "✅ Created $SPRINT_FILE"
fi

# 3. Check for incomplete tasks from previous sprint
echo ""
echo "📋 Checking previous sprint..."

PREV_SPRINT=$((SPRINT_NUM - 1))
PREV_FILE="docs-secretary/sprints/SPRINT_$(printf '%02d' $PREV_SPRINT).md"

if [ -f "$PREV_FILE" ]; then
  INCOMPLETE=$(grep -c "\- \[ \]" "$PREV_FILE" || true)

  if [ "$INCOMPLETE" -gt 0 ]; then
    echo "⚠️  Found $INCOMPLETE incomplete tasks in Sprint $PREV_SPRINT"
    echo "   Review and transfer to Sprint $SPRINT_NUM if needed."
  else
    echo "✅ All tasks completed in Sprint $PREV_SPRINT"
  fi
fi

# 4. Update CLAUDE.md with current sprint
echo ""
echo "📝 Updating CLAUDE.md..."

sed -i.bak "s/Current Sprint: .*/Current Sprint: $SPRINT_NUM/g" CLAUDE.md
rm CLAUDE.md.bak

echo "✅ Updated CLAUDE.md"

# 5. Show Technical Debt
echo ""
echo "🔧 Current Technical Debt:"

if [ -f "docs/TECHNICAL_DEBT.md" ]; then
  DEBT_COUNT=$(grep -c "^### TD-" docs/TECHNICAL_DEBT.md || true)
  echo "   $DEBT_COUNT items in backlog"
  echo ""
  echo "   High Priority items:"
  grep -A 3 "## High Priority" docs/TECHNICAL_DEBT.md | grep "^### TD-" || echo "   (none)"
else
  echo "   No technical debt tracked yet."
fi

# 6. Summary
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Sprint $SPRINT_NUM setup complete!"
echo ""
echo "Next steps:"
echo "1. Edit $SPRINT_FILE"
echo "   - Add features and tasks"
echo "   - Review CI improvement from last sprint"
echo "2. Start development"
echo "3. At sprint end: run ./sprint-end.sh $SPRINT_NUM"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
