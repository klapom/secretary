# Agent Status Reporting Requirements

**Version:** 1.0
**Effective:** Sprint 03+
**Applies to:** All agents working in teams

---

## 🎯 Purpose

Prevent communication gaps between agents and team-leads by requiring **structured, verifiable status updates**.

---

## 📋 Required Status Update Format

When you complete ANY work (task, phase, batch), you MUST report using this format:

```
✅ [Task/Phase Name] complete
📦 Commit: [9-char hash]
📊 Progress: [X/Total files|items]
🧪 Tests: [passing/total] (if applicable)
➡️  Next: [next action or "awaiting approval"]
```

### Example - Single Task:
```
✅ Phase 1.3: /api/ reorganization complete
📦 Commit: 1a65765eb
📊 Progress: 22/143 files
🧪 Tests: Not run yet
➡️  Next: Phase 1.4 (/core/)
```

### Example - Multiple Commits:
```
✅ Security Layer Phase 2 complete
📦 Commits: 0e740ce8e, 2d99cdde5
📊 Progress: 148 tests created, 3693 lines
🧪 Tests: 148/148 passing (100%)
➡️  Next: Awaiting approval
```

### Example - Partial Progress:
```
🔄 Phase 1.4: /core/ reorganization in progress
📦 Commit: 13dfd3ec2 (partial)
📊 Progress: 15/25 files
➡️  Next: Completing remaining 10 files
```

---

## ❌ Invalid Status Updates

**DON'T do this:**
```
"I'm done with the reorganization."
"All tasks complete."
"Everything is finished, ready for next steps."
```

**WHY:** No verifiable evidence (commit hashes, metrics)

---

## 🔍 What Team-Lead Will Do

After you send a status update, team-lead will:

1. **Extract commit hash(es)** from your message
2. **Verify in git log:** `git log --oneline | grep <hash>`
3. **Acknowledge if found** ✅
4. **Request clarification if not found** ⚠️

**This prevents misunderstandings about completion status.**

---

## 📊 Progress Reporting Guidelines

### For File Operations:
```
Progress: [files processed]/[total files]
Example: 22/143 files
```

### For Code Generation:
```
Progress: [lines written] lines, [files created] files
Example: 3693 lines, 4 files
```

### For Testing:
```
Tests: [passing]/[total] passing ([percentage]%)
Example: 5292/5318 passing (99.5%)
```

### For Documentation:
```
Progress: [pages|sections|diagrams] created
Example: 3 diagrams, 2321 lines
```

---

## 🎯 When to Send Status Updates

**ALWAYS send status update when:**
- ✅ Completing a task
- ✅ Completing a phase/batch
- ✅ Creating a git commit
- ✅ Encountering a blocker
- ✅ Going idle between tasks

**OPTIONAL (but helpful):**
- 🔄 Mid-task progress (every 30 mins for long tasks)
- 🔄 Before asking questions
- 🔄 After receiving new instructions

---

## 🚫 Common Mistakes to Avoid

### Mistake 1: No Commit Hash
```
❌ "I finished the security layer"
✅ "✅ Security Layer complete (commit: 0e740ce8e)"
```

### Mistake 2: Vague Progress
```
❌ "Most files are done"
✅ "📊 Progress: 135/143 files (94%)"
```

### Mistake 3: Assuming Team-Lead Knows
```
❌ "The work we discussed is complete"
✅ "✅ Task #2 complete (commit: abc1234, 153/143 files)"
```

### Mistake 4: Multiple Updates Without Evidence
```
❌ "Task A done. Task B done. Task C done."
✅ "✅ Task A (commit: aaa1111), Task B (commit: bbb2222), Task C (commit: ccc3333)"
```

---

## 🛠️ Template for Copy-Paste

```
✅ [Task Name] complete
📦 Commit: [9-char hash or "none yet"]
📊 Progress: [metrics]
🧪 Tests: [results or "not applicable"]
➡️  Next: [action]
```

---

## 📝 Integration with TaskUpdate

**BEST PRACTICE:** Combine status message with TaskUpdate:

```typescript
// 1. Send status message to team-lead
SendMessage({
  type: "message",
  recipient: "team-lead",
  summary: "✅ Phase 1.3 complete",
  content: `
    ✅ Phase 1.3: /api/ reorganization complete
    📦 Commit: 1a65765eb
    📊 Progress: 22/143 files
    🧪 Tests: TypeScript compiling ✅
    ➡️  Next: Phase 1.4 (/core/)
  `
});

// 2. Update task status
TaskUpdate({
  taskId: "9",
  status: "completed",
  metadata: {
    commitHash: "1a65765eb",
    filesProcessed: 22
  }
});
```

This gives **double verification**: message + task system.

---

## 🎓 Why This Matters

**Sprint 02 Issue:**
- Agent: "I'm done! 153 files complete!"
- Team-lead: "You're at 29%, continue working"
- Agent: "But I AM done, all commits exist!"
- **Loop for 20+ minutes** ❌

**With This System:**
- Agent: "✅ Complete (commits: 4bb6554ef, 7ac2f66a1, ...)"
- Team-lead: `git log | grep 4bb6554ef` → Found ✅
- Team-lead: "Confirmed, excellent work!"
- **Resolution in 30 seconds** ✅

---

**Questions?** Ask team-lead or check `.claude/agents/README.md`
