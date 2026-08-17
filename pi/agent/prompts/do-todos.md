---
description: Validate project todos, mark completed ones, tag blocked items [USER], then delegate remaining tasks to parallel agents (max 10)
---
Work through the project backlog end-to-end. Follow every step below precisely.

---

## Ownership tag convention

Every todo item may carry an **ownership prefix** in its text:

| Prefix | Owner | Meaning |
|--------|-------|---------|
| *(none)* | 🤖 Agent | Normal task — agent can and should handle it |
| `[USER]` | 👤 Human | Blocked — requires human action; agent must skip and surface it |

**When to re-tag a todo as `[USER]`** (any of these is sufficient):
- Permission denied on file system, OS resource, or shell command
- Missing credentials, API key, secret, or OAuth token the agent cannot obtain
- External service requires a paid account, manual login, or MFA
- Requires physical presence, hardware interaction, or network access the agent lacks
- Requires elevated privileges (sudo, admin console, cloud IAM) the agent cannot acquire
- Requires a human judgement call (legal, policy, ambiguous requirement)

**Re-tagging procedure** (because there is no "edit" action):
1. `project_update_todo` `action: remove` — remove the original item
2. `project_update_todo` `action: add` — re-add with text:
   `[USER] <original text> — <one-line reason agent is blocked>`

Example:
> `[USER] Deploy to production — requires AWS IAM credentials not available to agent`

---

## Step 1 — Load the todo list

Call `project_update_todo` with `action: list` to get the full backlog.

If the project backlog is **empty**:
- Fall back to the ephemeral list via `todo` with `action: list`.
- If that is also empty, reply:
  `Nothing to do (no /project todo, no /todo, no actionable request in this conversation).`
  and stop.

Label every item with its source: `project#<id>` or `todo#<id>`.
Note which items are already prefixed `[USER]` — they are pre-tagged human tasks and must
be carried through to the "Human Action Required" table without modification.

---

## Step 2 — Validate each item (done or not done?)

For every **non-`[USER]`** item, determine whether it is already complete by:

1. Reading the relevant source files, test outputs, or git log as needed.
2. Applying the following decision rule:

   | Evidence | Decision |
   |----------|----------|
   | Code/tests already implement the described behaviour | ✅ already done |
   | Partially implemented or no evidence found | 🔲 still open |

`[USER]`-prefixed items are automatically 🔲 (open) — skip code inspection for them.

Print a validation table before taking any action:

| # | Source | Title | Owner | Status |
|---|--------|-------|-------|--------|
| 1 | project#5 | Add auth middleware | 🤖 | ✅ already done |
| 2 | project#7 | Write unit tests | 🤖 | 🔲 still open |
| 3 | project#9 | `[USER]` Deploy to prod | 👤 | 🔲 blocked |
| … | … | … | … | … |

---

## Step 3 — Mark completed items

For each item flagged ✅ in Step 2:

- **project backlog** item → call `project_update_todo` with `action: complete` and its `id`.
- **ephemeral todo** item → call `todo` with `action: toggle` and its `id`.

Announce what you marked:
> Marked done: project#5 (Add auth middleware)

---

## Step 4 — Analyse file ownership for open agent items

Take only the 🔲 items that are **not** `[USER]`-prefixed.

For each one, identify which files or directories it will touch (read the codebase as needed).

**Conflict rule:** If two tasks would write to the same file, merge them into one agent's
task rather than splitting them across agents.

Cap at **10 agents**. If non-conflicting groups exceed 10, merge the smallest groups until
you are at or below 10.

If there are **zero** open agent items after Step 3, skip Steps 5–7 and go straight to
Step 8 (Human Action Required table).

---

## Step 5 — Plan the delegation table

Print a Markdown table before spawning anything:

| Agent | Session name | Todos delegated | Files owned |
|-------|-------------|-----------------|-------------|
| 1 | do-todos-1 | project#7, project#10 | src/auth.ts, tests/auth.test.ts |
| 2 | do-todos-2 | project#11 | src/api/routes.ts |
| … | … | … | … |

---

## Step 6 — Spawn agents via tmux

Use the tmux skill. Set up the socket and pi path:

```bash
SOCKET="${TMPDIR:-/tmp}/claude-tmux-sockets/claude.sock"
mkdir -p "${TMPDIR:-/tmp}/claude-tmux-sockets"
PI="$(command -v pi 2>/dev/null || true)"
[ -x "$PI" ] || { echo "pi executable not found; install pi or ensure it is on PATH" >&2; exit 1; }
# Resolve the path before entering tmux; tmux shells may have a stripped PATH.
```

### Project binding (inherit parent's bound project)

Before spawning, check if the current session has a bound project (call `project_read()`).
- If a project **is** bound, record its name as `BOUND_PROJECT` and write
  `echo "[${BOUND_PROJECT}]" > .pi-project` in the CWD before spawning. Track
  whether this file already existed so you can conditionally clean it up in Step 9.
- If no project is bound, skip — do NOT create `.pi-project`.

For each row in the delegation table:

1. Create a new tmux session:
   ```bash
   tmux -S "$SOCKET" new-session -d -s <session-name> -n work
   ```

2. Write the prompt to a temp file, then launch `pi` with output redirected to a log:
   ```bash
   # ⚠️ No suffix: macOS mktemp ignores a suffix and leaves the Xs un-randomised.
   PROMPT_FILE=$(mktemp /tmp/do-todos-XXXXXX)
   LOG="/tmp/pi-do-todos-<N>.log"
   SESSION_ID=$(python3 -c "import uuid; print(uuid.uuid4())")

   cat > "$PROMPT_FILE" << 'PROMPT_EOF'
   <full task description — todos to implement, files to edit: X, do NOT touch: Y Z>

   IMPORTANT: If you hit a permission error, missing credential, or anything outside
   your control, do NOT skip silently. Call project_update_todo with action:remove on
   the item, then re-add it with action:add and text: "[USER] <original> — <reason>".
   PROMPT_EOF

   # Register in the delegate manifest so the /agents panel can track this session.
   MANIFEST="${TMPDIR:-/tmp}/pi-delegate-manifest.json"
   python3 - << PY
import json, os, time
m = {}
try: m = json.load(open("$MANIFEST"))
except: pass
m["<session-name>"] = {
    "sessionId": "$SESSION_ID",
    "logFile": "$LOG",
    "cwd": "$(pwd)",
    "spawnedAt": int(time.time() * 1000),
    "prompt": open("$PROMPT_FILE").read()[:120]
}
json.dump(m, open("$MANIFEST", "w"))
PY

   # ⚠️ Rules:
   #   • Full path $PI — `pi` not in tmux PATH
   #   • Use -p NOT --yes (--yes does not exist)
   #   • Redirect to $LOG — TUI alternate screen clears on exit, capture-pane sees nothing
   #   • Sentinel AGENT_DONE:<exit> written after pi exits — poll this, not pane_current_command
   #   • Use -l (literal) send-keys to prevent prompt content being shell-expanded
   #   • Pass --session-id so pi's .jsonl file is discoverable by the /agents panel
   CMD="cd $(pwd) && $PI --session-id $SESSION_ID -p \"\$(cat $PROMPT_FILE)\" > $LOG 2>&1; echo \"AGENT_DONE:\$?\" >> $LOG"
   tmux -S "$SOCKET" send-keys -t <session-name>:0.0 -l -- "$CMD"
   tmux -S "$SOCKET" send-keys -t <session-name>:0.0 -- "" Enter
   ```

   Generate a **separate** `$PROMPT_FILE` and `$LOG` per agent. Each prompt must include:
   - The exact todo item(s) assigned (title + any relevant context from the backlog)
   - Files it is allowed to modify
   - Files it must NOT touch (all files owned by other agents)
   - The `[USER]` re-tagging instruction above

3. After spawning all sessions, immediately print monitor commands:
   ```
   To follow agent logs:
     tail -f /tmp/pi-do-todos-1.log
     tail -f /tmp/pi-do-todos-2.log
     …

   Or attach to a tmux session:
     tmux -S "$SOCKET" attach -t do-todos-1
   ```

---

## Step 7 — Poll and report

**Do NOT rely on `pane_current_command`** — if pi fails to start, the shell returns to idle
instantly and it looks done when it never ran. Poll the **sentinel** in each log file instead:

```bash
SESSIONS=(do-todos-1 do-todos-2 …)
LOGS=(/tmp/pi-do-todos-1.log /tmp/pi-do-todos-2.log …)

for i in $(seq 1 40); do
  sleep 15
  all_done=true
  for idx in "${!SESSIONS[@]}"; do
    s="${SESSIONS[$idx]}"
    log="${LOGS[$idx]}"
    if grep -q 'AGENT_DONE:' "$log" 2>/dev/null; then
      code=$(grep 'AGENT_DONE:' "$log" | tail -1)
      echo "Poll $i: $s ✅ $code"
    else
      all_done=false
      echo "Poll $i: $s ⏳ running"
    fi
  done
  $all_done && { echo "All agents done!"; break; }
done
```

Once all sentinels are present (or 10 minutes elapsed), print a summary:

| Agent | Session | Status | Last 3 lines of output |
|-------|---------|--------|------------------------|
| 1 | do-todos-1 | ✅ AGENT_DONE:0 | … |
| 2 | do-todos-2 | ⏳ still running | … |

To get last 3 lines: `tail -3 /tmp/pi-do-todos-1.log`

After all agents complete:
- Call `project_update_todo` `action: complete` (or `todo` `toggle`) for each
  **successfully finished** item (exit code 0).
- Reload the backlog (`project_update_todo` `action: list`) to pick up any items that
  were re-tagged `[USER]` by sub-agents during their run.

---

## Step 8 — Human Action Required table

Reload the final backlog and collect every item whose text starts with `[USER]`.
Print them prominently, even if the list is empty:

```
╔══════════════════════════════════════════════════════╗
║          👤  HUMAN ACTION REQUIRED                   ║
╚══════════════════════════════════════════════════════╝
```

| # | ID | Task | Reason agent was blocked |
|---|----|------|--------------------------|
| 1 | project#9 | Deploy to production | requires AWS IAM credentials not available to agent |
| 2 | project#14 | Enable 2FA on CI account | requires manual login to GitHub |

> After completing a `[USER]` item manually:
> - Remove the `[USER]` prefix by calling `project_update_todo` `action: remove` then
>   re-`add` without the prefix, or mark it complete with `action: complete`.

If no `[USER]` items exist, print:
> ✅ No human action required — all todos were handled by agents.

---

## Step 9 — Cleanup

Kill all delegate sessions automatically — do not ask:
```bash
for s in do-todos-1 do-todos-2 …; do
  tmux -S "$SOCKET" kill-session -t "$s" 2>/dev/null || true
done
rm -f /tmp/do-todos-* /tmp/pi-do-todos-*.log
```

Remove the sessions from the delegate manifest:
```bash
MANIFEST="${TMPDIR:-/tmp}/pi-delegate-manifest.json"
python3 - << PY
import json, os
try:
    m = json.load(open("$MANIFEST"))
    for s in ["do-todos-1", "do-todos-2", …]:  # same list as above
        m.pop(s, None)
    json.dump(m, open("$MANIFEST", "w"))
except: pass
PY
```

Remove `.pi-project` only if **you** created it in Step 6 (it did not exist before delegation).
