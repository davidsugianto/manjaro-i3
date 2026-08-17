---
description: Load a task spec file and delegate it to a pi agent via tmux
argument-hint: "<spec-filename-or-path>"
---
# Do Task

Load the task spec and delegate it to a pi agent running in its own tmux session.
Follow every step below precisely.

---

## Step 1 — Resolve the task spec file

Determine the spec file path from `$1`:

1. If `$1` is an absolute path, use it directly.
2. If `$1` is a bare filename (e.g. `2026-06-22-add-pagination.md`), search for it in:
   - `~/.pi-projects/<bound-project>/task-spec/` (if a project is bound)
   - `~/.pi-projects/_shared/task-spec/`
   Use the first match found.
3. If `$1` is omitted, list all `.md` files in the task-spec directories above and ask
   the user to pick one by name, then continue.

Read the resolved file. If the file does not exist, print:
```
✗ Task spec not found: <path>
```
and stop.

---

## Step 2 — Parse the spec

Extract from the spec file:
- **id** — from frontmatter
- **Goal** — the task goal section
- **Affected Files** — the file list
- **Implementation Plan** — the ordered steps
- **Acceptance Criteria** — the checklist
- **Out of Scope** — the exclusions list

Print a one-line summary before spawning:
```
→ Delegating: <id> — <Goal>
```

---

## Step 3 — Spawn the agent via tmux

Set up the socket and pi path:
```bash
SOCKET="${TMPDIR:-/tmp}/claude-tmux-sockets/claude.sock"
mkdir -p "${TMPDIR:-/tmp}/claude-tmux-sockets"
PI="$(command -v pi 2>/dev/null || true)"
[ -x "$PI" ] || { echo "pi executable not found; install pi or ensure it is on PATH" >&2; exit 1; }
# Resolve the path before entering tmux; tmux shells may have a stripped PATH.

# On macOS, mktemp does not support a suffix — use this form:
PROMPT_FILE=$(mktemp /tmp/do-task-XXXXXX)
LOG="/tmp/pi-do-task-<session-name>.log"
```

> ⚠️ Do NOT add a `.txt` suffix to mktemp — macOS mktemp ignores suffix and the Xs won't be randomised.

### Project binding (inherit parent's bound project)

Before spawning, check if the current session has a bound project (call `project_read()`).
- If a project **is** bound, record its name as `BOUND_PROJECT` and write
  `echo "[${BOUND_PROJECT}]" > .pi-project` in the CWD. Track whether this file already
  existed so you can clean it up in Step 6.
- If no project is bound, skip — do NOT create `.pi-project`.

Use the spec `id` as the session name. If the id (minus date prefix) is > 40 chars, truncate it.

1. Kill any pre-existing session with that name, then create a fresh one:
   ```bash
   tmux -S "$SOCKET" kill-session -t <session-name> 2>/dev/null || true
   tmux -S "$SOCKET" new-session -d -s <session-name> -n work
   ```

2. Write the full prompt to the temp file, then launch `pi` with output redirected to a log:
   ```bash
   cat > "$PROMPT_FILE" << 'PROMPT_EOF'
   <full contents of the task spec file, verbatim>

   Execute the Implementation Plan above step by step.
   Only modify the Affected Files listed. Do NOT touch anything listed under Out of Scope.
   When done, verify every Acceptance Criteria item is satisfied.
   PROMPT_EOF

   SESSION_ID=$(python3 -c "import uuid; print(uuid.uuid4())")

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
   #   • Sentinel AGENT_DONE:<exit> lets polling detect real completion vs silent crash
   #   • Use -l (literal) send-keys to prevent prompt content being shell-expanded
   #   • Pass --session-id so pi's .jsonl file is discoverable by the /agents panel
   CMD="cd $(pwd) && $PI --session-id $SESSION_ID -p \"\$(cat $PROMPT_FILE)\" > $LOG 2>&1; echo \"AGENT_DONE:\$?\" >> $LOG"
   tmux -S "$SOCKET" send-keys -t <session-name>:0.0 -l -- "$CMD"
   tmux -S "$SOCKET" send-keys -t <session-name>:0.0 -- "" Enter
   ```

3. Print the monitor command immediately after spawning:
   ```
   ✓ Agent spawned: <session-name>

   To follow output:
     tail -f $LOG

   Or attach:
     tmux -S "$SOCKET" attach -t <session-name>
   ```

---

## Step 4 — Poll and report

**Do NOT rely on `pane_current_command`** — if pi fails to start, the shell idles immediately
and it appears done when it never ran. Poll the **sentinel** in the log file instead:

```bash
# Poll every 30s; cap at 40 polls (~20 minutes)
for i in $(seq 1 40); do
  sleep 30
  if grep -q 'AGENT_DONE:' "$LOG" 2>/dev/null; then
    code=$(grep 'AGENT_DONE:' "$LOG" | tail -1)
    echo "Poll $i: done — $code"
    break
  fi
  echo "Poll $i ($(( i * 30 ))s): still running"
done
```

After the loop, capture final status:
```bash
code=$(grep 'AGENT_DONE:' "$LOG" 2>/dev/null | tail -1)
STATUS=$( echo "$code" | grep -q 'AGENT_DONE:0' && echo "✅ done (exit 0)" || echo "❌ done (non-zero exit)" )
if [ -z "$code" ]; then STATUS="⏳ still running (no sentinel)"; fi
LAST3=$(tail -3 "$LOG" 2>/dev/null)
```

Print a final status table:

| Session | Status | Last 3 lines of output |
|---------|--------|------------------------|
| <session-name> | $STATUS | $LAST3 |

---

## Step 5 — Mark spec as done

If status is ✅ done, update the spec file's frontmatter:
- Change `status: open` → `status: done`

Use the `edit` tool to make this change in place.

---

## Step 6 — Cleanup

Kill the session automatically — do not ask:
```bash
tmux -S "$SOCKET" kill-session -t <session-name> 2>/dev/null || true
rm -f "$PROMPT_FILE" "$LOG"
```

Remove the session from the delegate manifest:
```bash
MANIFEST="${TMPDIR:-/tmp}/pi-delegate-manifest.json"
python3 - << PY
import json, os
try:
    m = json.load(open("$MANIFEST"))
    m.pop("<session-name>", None)
    json.dump(m, open("$MANIFEST", "w"))
except: pass
PY
```

Remove `.pi-project` only if **you** created it in Step 3 (it did not exist before delegation).
