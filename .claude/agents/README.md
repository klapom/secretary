# Agent Communication System

**Version:** 1.0
**Effective:** Sprint 03+
**Purpose:** Prevent communication gaps between agents and team-leads

---

## 📁 Directory Structure

```
.claude/agents/
├── README.md                           # This file
├── verify-agent-status.sh              # Bash verification script
├── verify-agent-status.ts              # TypeScript verification module
└── templates/
    ├── team-agent-status-reporting.md  # Status reporting requirements
    └── general-purpose-agent.md        # Agent prompt templates
```

---

## 🎯 Quick Start

### For Agents (YOU)

When you complete work, report using this format:

```
✅ [Task Name] complete
📦 Commit: [9-char hash]
📊 Progress: [metrics]
🧪 Tests: [results]
➡️  Next: [action]
```

**Example:**
```
✅ Security Layer Phase 2 complete
📦 Commits: 0e740ce8e, 2d99cdde5
📊 Progress: 148 tests, 3693 lines
🧪 Tests: 148/148 passing (100%)
➡️  Next: Awaiting approval
```

**📖 Full Guide:** `templates/team-agent-status-reporting.md`

---

### For Team-Leads

After receiving agent status message, verify commits:

**Option 1: Bash Script**
```bash
./.claude/agents/verify-agent-status.sh "✅ Task complete (commit: abc1234)"
```

**Option 2: TypeScript/Node**
```typescript
import { verifyAgentStatus, formatVerificationResult } from './.claude/agents/verify-agent-status.ts';

const result = verifyAgentStatus(agentMessage);
console.log(formatVerificationResult(result));
```

**Option 3: Manual**
```bash
git log --oneline | grep abc1234
```

---

## 🔍 Verification Script Usage

### Basic Usage (Bash)

```bash
# Verify single commit
./.claude/agents/verify-agent-status.sh "Commit: abc123456"

# Verify multiple commits
./.claude/agents/verify-agent-status.sh "Commits: abc1234, def5678, ghi9012"

# Verify full status message
./.claude/agents/verify-agent-status.sh "✅ Phase 1.3 complete (commit: 1a65765eb, 22/143 files)"
```

### Exit Codes

- `0` - All commits verified ✅
- `1` - No commit hashes found ⚠️
- `2` - Partial verification (some commits not found) ⚠️
- `3` - Verification failed (no commits found) ❌

### Example Output

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔍 Agent Status Verification
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📦 Found commit hash(es):
   - 1a65765eb

🔍 Verifying in git log...

   ✅ 1a65765eb - FOUND

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ VERIFICATION PASSED
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

All reported commits exist in git history.
Agent status is CONFIRMED.
```

---

## 🛠️ Integration Examples

### Team-Lead Automation

```typescript
import { verifyAgentStatus } from './.claude/agents/verify-agent-status.ts';

async function handleAgentMessage(from: string, message: string) {
  // Extract and verify commits
  const result = verifyAgentStatus(message);

  if (result.success) {
    console.log(`✅ ${from}: Status confirmed (${result.totalCommits} commits verified)`);
    // Send acknowledgment
    await SendMessage({
      recipient: from,
      summary: "Status confirmed",
      content: `✅ Work verified! Found ${result.commitsFound.join(", ")} in git log.`
    });
  } else {
    console.warn(`⚠️  ${from}: Verification failed - ${result.message}`);
    // Request clarification
    await SendMessage({
      recipient: from,
      summary: "Status unclear",
      content: `⚠️  Could not verify commits: ${result.commitsNotFound.join(", ")}\n\nPlease confirm work is committed and provide correct hash(es).`
    });
  }
}
```

### Agent Self-Check (Before Reporting)

```typescript
import { extractCommitHashes, verifyCommitExists } from './.claude/agents/verify-agent-status.ts';

// Before sending status message
const myMessage = `✅ Task complete (commit: ${commitHash})`;
const hashes = extractCommitHashes(myMessage);

if (hashes.length === 0) {
  console.error("⚠️  No commit hash in message! Adding now...");
  myMessage = `✅ Task complete (commit: ${commitHash}, no hash was included)`;
}

// Verify commit exists before claiming completion
for (const hash of hashes) {
  if (!verifyCommitExists(hash)) {
    console.error(`❌ Commit ${hash} not found in git log!`);
    console.error("   Did you forget to git commit?");
    process.exit(1);
  }
}

// Send verified message
await SendMessage({ ... });
```

---

## 📊 Sprint 02 Incident Analysis

### What Happened

**Timeline:**
- 10:00 - code-architect completes ALL 7 phases (153 files)
- 10:05 - code-architect reports: "All done! 153 files!"
- 10:06 - team-lead checks own notes: "41 files done = 29%"
- 10:07 - team-lead: "You're at 29%, continue with /core/"
- 10:08 - code-architect: "But /core/ is ALREADY DONE! (commit: 13dfd3ec2)"
- 10:09 - team-lead: "Are you idle? Why aren't you working?"
- **10:10-10:30 - Communication loop (20+ messages)**
- 10:31 - team-lead finally runs `git log`, sees all 7 commits
- 10:32 - team-lead: "Oh! You ARE done. Sorry!"

**Root Cause:**
1. Agent didn't include commit hashes in early messages
2. Team-lead relied on own (stale) progress tracking
3. No automatic verification mechanism
4. Async message delivery caused out-of-order perception

**Impact:**
- 20+ minutes wasted
- Agent frustration
- Delayed sprint completion awareness

### How This System Prevents It

**With New System:**
- 10:05 - code-architect: "✅ All done! (commits: 4bb6554ef, 7ac2f66a1, ..., 32b1f37cc)"
- 10:06 - team-lead runs: `./verify-agent-status.sh "commits: 4bb6554ef..."`
- 10:06 - Script output: "✅ All 7 commits verified"
- 10:07 - team-lead: "Confirmed! Excellent work!"
- **Total time: 2 minutes** ✅

---

## 🎓 Best Practices

### For Agents

1. **Always include commit hashes** in completion messages
2. **Use the format template** (copy from `team-agent-status-reporting.md`)
3. **Report incrementally** for long tasks (every phase/batch)
4. **Self-verify** before claiming completion (check git log)
5. **Update TaskList** alongside status messages (double verification)

### For Team-Leads

1. **Verify every status claim** using the script
2. **Don't rely on memory** - always check git log
3. **Acknowledge quickly** when verification passes
4. **Request clarification** when verification fails
5. **Be patient with async** - give agents time to commit before verifying

---

## 📝 Agent Prompt Integration

When creating agent prompts, include this section:

```markdown
## 📋 STATUS REPORTING (REQUIRED)

After completing ANY work, you MUST report using this format:

✅ [Task Name] complete
📦 Commit: [9-char hash]
📊 Progress: [metrics]
🧪 Tests: [results]
➡️  Next: [action]

See: .claude/agents/templates/team-agent-status-reporting.md
```

**Template:** `templates/general-purpose-agent.md`

---

## 🧪 Testing the System

### Test 1: Valid Commit

```bash
# Get a recent commit hash
HASH=$(git log --oneline | head -1 | awk '{print $1}')

# Test verification
./.claude/agents/verify-agent-status.sh "Test: commit: $HASH"
# Expected: ✅ VERIFICATION PASSED
```

### Test 2: Invalid Commit

```bash
./.claude/agents/verify-agent-status.sh "Test: commit: invalid123"
# Expected: ❌ VERIFICATION FAILED
```

### Test 3: Multiple Commits

```bash
HASH1=$(git log --oneline | head -1 | awk '{print $1}')
HASH2=$(git log --oneline | head -2 | tail -1 | awk '{print $1}')

./.claude/agents/verify-agent-status.sh "commits: $HASH1, $HASH2"
# Expected: ✅ VERIFICATION PASSED (2 commits)
```

---

## 🚀 Rollout Plan

**Sprint 03 (Immediate):**
- ✅ Scripts deployed (`.claude/agents/`)
- ✅ Documentation complete
- [ ] Update agent prompts to require commit hashes
- [ ] Team-lead uses manual verification

**Sprint 04:**
- [ ] Integrate verification into team-lead automation
- [ ] Add auto-verification to SendMessage handler
- [ ] Create dashboard for real-time progress tracking

**Sprint 05:**
- [ ] Structured JSON status messages
- [ ] Automatic progress calculation
- [ ] Rollback/recovery procedures

---

## 💡 Tips & Tricks

### Quick Verification Alias

Add to `~/.bashrc` or `~/.zshrc`:

```bash
alias verify-agent='./.claude/agents/verify-agent-status.sh'
```

Usage:
```bash
verify-agent "commit: abc1234"
```

### Vim Integration

In vim, verify commit under cursor:

```vim
:!./.claude/agents/verify-agent-status.sh "<cword>"
```

### VS Code Integration

Add to `tasks.json`:

```json
{
  "label": "Verify Agent Status",
  "type": "shell",
  "command": "./.claude/agents/verify-agent-status.sh",
  "args": ["${selectedText}"]
}
```

---

## 📞 Support

**Questions?**
- Check: `templates/team-agent-status-reporting.md`
- Ask team-lead in team channel
- Review Sprint 02 retrospective: `docs-secretary/sprints/SPRINT_02.md`

**Bugs/Improvements?**
- Create issue in GitHub
- Propose changes via PR
- Discuss in sprint planning

---

**Last Updated:** 2026-02-16 (Sprint 02 completion)
**Maintainer:** Team Lead
**Version:** 1.0
