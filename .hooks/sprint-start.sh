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

# 3. Carry forward "Vorgemerkt für Sprint N" items from previous sprint
echo ""
echo "📥 Prüfe vorgemerkte Tasks aus Sprint $PREV_SPRINT..."

PREV_SPRINT=$((SPRINT_NUM - 1))
PREV_FILE="docs-secretary/sprints/SPRINT_$(printf '%02d' $PREV_SPRINT).md"
CARRY_MARKER="## 📌 Vorgemerkt für Sprint ${SPRINT_NUM}"

if [ -f "$PREV_FILE" ] && grep -q "$CARRY_MARKER" "$PREV_FILE"; then
  if grep -q "Aus Sprint $PREV_SPRINT übernommen" "$SPRINT_FILE" 2>/dev/null; then
    echo "⚠️  Carry-forward aus Sprint $PREV_SPRINT bereits vorhanden. Skipping."
  else
    # Block extrahieren: ab Header-Zeile bis zur nächsten --- Trennlinie
    CARRY_CONTENT=$(awk "/^## 📌 Vorgemerkt für Sprint ${SPRINT_NUM}/{found=1; next} found && /^---/{exit} found{print}" "$PREV_FILE")

    # An Sprint-Datei anhängen
    printf '\n---\n\n## 📋 Aus Sprint %02d übernommen\n\n' "$PREV_SPRINT" >> "$SPRINT_FILE"
    printf '> Automatisch übernommen von SPRINT_%02d.md\n\n' "$PREV_SPRINT" >> "$SPRINT_FILE"
    printf '%s\n' "$CARRY_CONTENT" >> "$SPRINT_FILE"

    echo "✅ Folgende Tasks aus Sprint $PREV_SPRINT übernommen:"
    echo "$CARRY_CONTENT" | grep "^### " | sed 's/^### /   → /'
  fi
else
  echo "ℹ️  Keine vorgemerkten Tasks für Sprint $SPRINT_NUM in Sprint $PREV_SPRINT."
fi

# 4. Check for incomplete tasks from previous sprint
echo ""
echo "📋 Checking previous sprint..."

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

# 6. Upstream Sync Analysis (openclaw/openclaw)
echo ""
echo "📡 Upstream Sync Analysis (openclaw/openclaw)..."

# Upstream initial commit — gleicher Codestand wie unser Repo-Start (2025-11-24)
# Kein gemeinsamer git-Ancestor (manuelle Kopie statt GitHub-Fork), daher fester Anker.
UPSTREAM_INITIAL="f6dd362d3"
UPSTREAM_TRACK_FILE=".upstream-sync"

# Upstream fetchen
if git fetch upstream --quiet 2>/dev/null; then
  UPSTREAM_HEAD=$(git rev-parse upstream/main 2>/dev/null)
  UPSTREAM_HEAD_SHORT=$(git rev-parse --short upstream/main 2>/dev/null)

  # Letzten gespeicherten Stand laden
  if [ -f "$UPSTREAM_TRACK_FILE" ]; then
    LAST_UPSTREAM=$(cat "$UPSTREAM_TRACK_FILE")
    LAST_UPSTREAM_SHORT=$(git rev-parse --short "$LAST_UPSTREAM" 2>/dev/null || echo "unbekannt")
    RANGE="${LAST_UPSTREAM}..upstream/main"
    echo "   Stand letzter Sprint: $LAST_UPSTREAM_SHORT → aktuell: $UPSTREAM_HEAD_SHORT"
  else
    RANGE="${UPSTREAM_INITIAL}..upstream/main"
    echo "   Erstanalyse (Gesamtstand seit Fork-Zeitpunkt)"
    echo "   Aktueller upstream Stand: $UPSTREAM_HEAD_SHORT"
  fi

  # Commits zählen
  TOTAL=$(git log --oneline $RANGE 2>/dev/null | wc -l | tr -d ' ')
  FIXES=$(git log --oneline $RANGE 2>/dev/null | grep -c "^[a-f0-9]* fix[(:)]" || true)
  FEATS=$(git log --oneline $RANGE 2>/dev/null | grep -c "^[a-f0-9]* feat[(:)]" || true)

  echo ""
  echo "   Neue Commits: $TOTAL  (davon Fixes: $FIXES | Features: $FEATS)"

  if [ "$TOTAL" -gt 0 ]; then
    # Fixes nach Modul
    echo ""
    echo "   🔧 Fixes nach Modul (Top 12):"
    echo "   ─────────────────────────────────────────────────────"

    # Modul-Gruppen mit Relevanz-Label
    declare -A RELEVANZ
    RELEVANZ[telegram]="✅ RELEVANT"
    RELEVANZ[gateway]="✅ RELEVANT"
    RELEVANZ[agents]="✅ RELEVANT"
    RELEVANZ[agent]="✅ RELEVANT"
    RELEVANZ[security]="✅ RELEVANT"
    RELEVANZ[auto-reply]="✅ RELEVANT"
    RELEVANZ[sessions]="✅ RELEVANT"
    RELEVANZ[whatsapp]="✅ RELEVANT"
    RELEVANZ[discord]="✅ RELEVANT"
    RELEVANZ[slack]="✅ RELEVANT"
    RELEVANZ[config]="✅ RELEVANT"
    RELEVANZ[memory]="✅ RELEVANT"
    RELEVANZ[daemon]="✅ RELEVANT"
    RELEVANZ[cron]="✅ RELEVANT"
    RELEVANZ[tts]="✅ RELEVANT"
    RELEVANZ[media]="✅ RELEVANT"
    RELEVANZ[sandbox]="✅ RELEVANT"
    RELEVANZ[cli]="🟡 OPTIONAL"
    RELEVANZ[browser]="🟡 OPTIONAL"
    RELEVANZ[ui]="🟡 OPTIONAL"
    RELEVANZ[tools]="🟡 OPTIONAL"
    RELEVANZ[macos]="❌ CLIENT"
    RELEVANZ[mac]="❌ CLIENT"
    RELEVANZ[ios]="❌ CLIENT"
    RELEVANZ[android]="❌ CLIENT"

    git log --oneline $RANGE 2>/dev/null \
      | grep -E "^[a-f0-9]+ fix[(:)]" \
      | sed 's/^[a-f0-9]* fix[(:]\([^):]*\).*/\1/' \
      | sort | uniq -c | sort -rn | head -12 \
      | while read count modul; do
          label="${RELEVANZ[$modul]:-🟡 OPTIONAL}"
          printf "   %-20s %4d  %s\n" "$modul" "$count" "$label"
        done

    # Features nach Modul
    echo ""
    echo "   🆕 Features nach Modul (Top 8):"
    echo "   ─────────────────────────────────────────────────────"
    git log --oneline $RANGE 2>/dev/null \
      | grep -E "^[a-f0-9]+ feat[(:)]" \
      | sed 's/^[a-f0-9]* feat[(:]\([^):]*\).*/\1/' \
      | sort | uniq -c | sort -rn | head -8 \
      | while read count modul; do
          label="${RELEVANZ[$modul]:-🟡 OPTIONAL}"
          printf "   %-20s %4d  %s\n" "$modul" "$count" "$label"
        done

    # Konfliktanalyse: welche upstream-Dateien haben wir auch angefasst?
    # Unsere Änderungen immer ab unserem Initial Commit messen (fester Anker)
    OUR_INITIAL=$(git rev-list --max-parents=0 HEAD)
    # Upstream-Gesamtstand (alle Änderungen seit Fork-Zeitpunkt, nicht nur seit letztem Sprint)
    FULL_UPSTREAM_RANGE="${UPSTREAM_INITIAL}..upstream/main"

    echo ""
    echo "   🔀 Merge-Machbarkeit (Gesamtstand):"
    git diff --name-only "$OUR_INITIAL" HEAD 2>/dev/null | sort > /tmp/_our_files.txt
    git diff --name-only $FULL_UPSTREAM_RANGE 2>/dev/null | sort > /tmp/_upstream_files.txt
    SAFE=$(comm -13 /tmp/_our_files.txt /tmp/_upstream_files.txt | wc -l | tr -d ' ')
    CONFLICT=$(comm -12 /tmp/_our_files.txt /tmp/_upstream_files.txt | wc -l | tr -d ' ')
    ONLY_OURS=$(comm -23 /tmp/_our_files.txt /tmp/_upstream_files.txt | wc -l | tr -d ' ')
    echo "   Konfliktfrei (nur upstream geändert): $SAFE Dateien  → direkt übernehmbar"
    echo "   Konflikte   (beide geändert):        $CONFLICT Dateien  → manuell prüfen"
    echo "   Nur wir     (upstream unberührt):    $ONLY_OURS Dateien"
    rm -f /tmp/_our_files.txt /tmp/_upstream_files.txt

    echo ""
    echo "   💡 Letzte upstream Fixes (relevant):"
    git log --oneline $RANGE 2>/dev/null \
      | grep -E "^[a-f0-9]+ fix[(:](telegram|gateway|agents?|security|auto-reply|sessions?|whatsapp|discord|slack|config|memory|daemon|cron|tts|media|sandbox)" \
      | head -8 \
      | sed 's/^/      /'
  fi

  # Aktuellen upstream Stand für nächsten Sprint speichern
  echo "$UPSTREAM_HEAD" > "$UPSTREAM_TRACK_FILE"
  echo ""
  echo "   ✅ Upstream-Stand gespeichert → $UPSTREAM_TRACK_FILE"
  echo "   📋 Alle Commits: git log --oneline ${RANGE} | grep 'fix\|feat'"

else
  echo "   ⚠️  upstream nicht erreichbar — kein fetch möglich"
  echo "   Remote: git remote -v | grep upstream"
fi

# 7. Summary
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Sprint $SPRINT_NUM setup complete!"
echo ""
echo "Next steps:"
echo "1. Edit $SPRINT_FILE"
echo "   - Add features and tasks"
echo "   - Review CI improvement from last sprint"
echo "   - Review upstream fixes (see above)"
echo "2. Start development"
echo "3. At sprint end: run ./sprint-end.sh $SPRINT_NUM"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
