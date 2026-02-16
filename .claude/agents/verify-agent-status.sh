#!/bin/bash
# Agent Status Verification Helper
# Usage: ./verify-agent-status.sh <message-text>
#
# Extracts commit hashes from agent status messages and verifies them in git log

set -e

MESSAGE="$1"

if [ -z "$MESSAGE" ]; then
  echo "Usage: $0 '<agent-status-message>'"
  echo ""
  echo "Example:"
  echo "  $0 '✅ Phase complete (commit: 1a65765eb, 22/143 files)'"
  exit 1
fi

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🔍 Agent Status Verification"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Extract commit hashes (7-9 char hex)
COMMITS=$(echo "$MESSAGE" | grep -oE '[a-f0-9]{7,9}' || true)

if [ -z "$COMMITS" ]; then
  echo "⚠️  No commit hashes found in message"
  echo ""
  echo "Expected format:"
  echo "  📦 Commit: abc123456"
  echo "  📦 Commits: abc1234, def5678"
  echo ""
  exit 1
fi

echo "📦 Found commit hash(es):"
echo "$COMMITS" | while read -r hash; do
  echo "   - $hash"
done
echo ""

# Verify each commit
ALL_FOUND=true
NOT_FOUND=()

echo "🔍 Verifying in git log..."
echo ""

echo "$COMMITS" | while read -r hash; do
  if git log --oneline | grep -q "$hash"; then
    echo "   ✅ $hash - FOUND"
  else
    echo "   ❌ $hash - NOT FOUND"
    ALL_FOUND=false
    NOT_FOUND+=("$hash")
  fi
done

echo ""

# Check if all found
if git log --oneline | grep -q "$(echo "$COMMITS" | head -1)"; then
  # At least one commit found, check all
  MISSING_COUNT=0
  for hash in $COMMITS; do
    if ! git log --oneline | grep -q "$hash"; then
      MISSING_COUNT=$((MISSING_COUNT + 1))
    fi
  done

  if [ $MISSING_COUNT -eq 0 ]; then
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "✅ VERIFICATION PASSED"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    echo "All reported commits exist in git history."
    echo "Agent status is CONFIRMED."
    echo ""
    exit 0
  else
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "⚠️  PARTIAL VERIFICATION"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    echo "$MISSING_COUNT commit(s) not found in git log."
    echo "Agent may have reported incorrect hashes or work not committed yet."
    echo ""
    exit 2
  fi
else
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "❌ VERIFICATION FAILED"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo ""
  echo "No reported commits found in git log."
  echo "Possible issues:"
  echo "  - Agent hasn't committed yet"
  echo "  - Agent reported wrong hashes"
  echo "  - Git repository out of sync"
  echo ""
  echo "Action: Ask agent to clarify or run 'git log' manually"
  echo ""
  exit 3
fi
