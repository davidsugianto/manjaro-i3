---
description: Delegate open todos (from /todo or /project todo) to parallel pi agents via tmux (max 10 instances)
---
Read the current todo list, then delegate each item to a separate pi agent running in its own
tmux session. Follow every step below precisely.

---

## Step 1 — Choose the todo source (todo vs project todo)

You may pull work items from **either** the ephemeral `/todo` list **or** the persistent
`/project todo` backlog.

Follow this selection logic strictly:

1. **If the user explicitly asks for "project todo" / "project backlog" / "from project"**,
   call `project_update_todo` with `action: list` and use those items.
2. Otherwise (default), call `todo` with `action: list` and use the open (not toggled/done)
   items.
3. If `/todo` is **empty**, then **fallback** to `project_update_todo` with `action: list`.
4. If **both** lists are empty:
   - If the current conversation contains clear actionable work, create a delegation plan
     based on that.
   - If there is nothing actionable in the conversation, reply:
     `Nothing to delegate (no /todo, no /project todo, no actionable request).` and stop.

When you list the items in your delegation table, label the source clearly (e.g. `todo#3`
vs `project#12`).

---

## Step 2 — Analyse file ownership

For each todo item, identify which files or directories it will touch (read the codebase as
needed). Group items so that **no two agents are assigned tasks that write to the same file**.
If two items would conflict, merge them into one agent's task rather than splitting.

Cap at **10 agents**. If there are more than 10 non-conflicting groups, merge the smallest
groups until you are at or below 10.

---

## Step 3 — Plan the delegation table

Print a Markdown table before spawning anything:

| Agent | Session name | Todos delegated | Files owned |
|-------|-------------|-----------------|-------------|
| 1 | delegate-1 | #id, #id | path/a, path/b |
| 2 | delegate-2 | #id | path/c |
| … | … | … | … |

---

## Step 4 — Spawn agents via tmux

### Setup

```bash
SOCKET="${TMPDIR:-/tmp}/claude-tmux-sockets/claude.sock"
mkdir -p "${TMPDIR:-/tmp}/claude-tmux-sockets"
PI="$(command -v pi 2>/dev/null || true)"
[ -x "$PI" ] || { echo "pi executable not found; install pi or ensure it is on PATH" >&2; exit 1; }
# Resolve the path before entering tmux; tmux shells may have a stripped PATH.

# Clear stale manifest from any previous delegation run
MANIFEST="${TMPDIR:-/tmp}/pi-delegate-manifest.json"
rm -f "$MANIFEST"
```

### Project binding (rule: inherit parent's bound project)

Before spawning agents, check if the current session has a bound project:

```bash
# Detect bound project: the pi-projects extension auto-binds from .pi-project in CWD.
# Read the current session's bound project (if any) by calling project_read().
```

- Call `project_read()` (or check `project_read` doc="charter") to test if a project is bound.
- If a project **is** bound (no "No project bound" error), record the project name as
  `BOUND_PROJECT`. Each delegate agent's CWD must contain a `.pi-project` file that references
  it so the spawned pi session auto-binds to the same project on startup.
- If no project is bound, skip this step — do NOT create `.pi-project` files.

To write the `.pi-project` file in the CWD before spawning:
```bash
# Only if BOUND_PROJECT is set:
echo "[${BOUND_PROJECT}]" > .pi-project
```
This file persists across agents since they all share the same CWD. Clean it up in Step 6
**only** if it did not already exist before delegation started.

### Spawning each agent

For each row in the delegation table:

1. Create a new tmux session:
   ```bash
   tmux -S "$SOCKET" new-session -d -s <session-name> -n work
   ```

2. Write the prompt to a temp file — never inline the prompt in send-keys:
   ```bash
   # ⚠️ No suffix: macOS mktemp ignores a suffix and leaves the Xs un-randomised.
   PROMPT_FILE=$(mktemp /tmp/delegate-XXXXXX)
   cat > "$PROMPT_FILE" << 'PROMPT_EOF'
   <full task description. files to edit: X. do NOT touch: Y, Z.>
   PROMPT_EOF
   ```

3. Generate a stable UUID for this agent, write a manifest entry, then define the log file:
   ```bash
   # Generate stable session ID (macOS + Linux compatible)
   SESSION_UUID=$(python3 -c "import uuid; print(uuid.uuid4())" 2>/dev/null \
                 || uuidgen 2>/dev/null | tr '[:upper:]' '[:lower:]' \
                 || cat /proc/sys/kernel/random/uuid 2>/dev/null)

   # Write manifest entry BEFORE spawning so the panel sees it immediately
   PROMPT_SUMMARY=$(head -c 120 "$PROMPT_FILE" | tr '\n' ' ')
   node -e "
     const fs=require('fs'), m=process.env.MANIFEST, k=process.env.SESSION_NAME;
     const d=fs.existsSync(m)?JSON.parse(fs.readFileSync(m,'utf8')):{};
     d[k]={sessionId:process.env.UUID,logFile:process.env.LOG_PATH,cwd:process.env.CWD,spawnedAt:Date.now(),prompt:process.env.SUMMARY};
     fs.writeFileSync(m,JSON.stringify(d,null,2));
   " SESSION_NAME="<session-name>" UUID="$SESSION_UUID" LOG_PATH="/tmp/pi-delegate-<N>.log" CWD="$(pwd)" SUMMARY="$PROMPT_SUMMARY" MANIFEST="$MANIFEST"

   LOG="/tmp/pi-delegate-<N>.log"

   # ⚠️ Critical rules for launching pi in tmux:
   #   • Use the resolved absolute path ($PI) — tmux shells have a stripped PATH and `pi` may not be found.
   #   • Use -p (print/non-interactive) NOT --yes (--yes does not exist).
   #   • Redirect stdout+stderr to $LOG so output survives the TUI alternate-screen clear.
   #   • Append a sentinel AGENT_DONE:<exitcode> so polling can detect real completion.
   #   • Use -l (literal) send-keys to avoid shell expansion of the command string.

   CMD="cd $(pwd) && $PI --session-id $SESSION_UUID -p \"\$(cat $PROMPT_FILE)\" > $LOG 2>&1; echo \"AGENT_DONE:\$?\" >> $LOG"
   tmux -S "$SOCKET" send-keys -t <session-name>:0.0 -l -- "$CMD"
   tmux -S "$SOCKET" send-keys -t <session-name>:0.0 -- "" Enter
   ```

   **Important:** Generate a separate `$PROMPT_FILE` and `$LOG` per agent.

4. After spawning all sessions, immediately print monitor commands:
   ```
   To monitor all agents:
     tail -f /tmp/pi-delegate-1.log
     tail -f /tmp/pi-delegate-2.log
     …

   Or attach to a tmux session:
     tmux -S "$SOCKET" attach -t delegate-1
   ```

---

## Step 5 — Poll and report

**Do NOT use `pane_current_command` alone** — if pi fails to launch (wrong PATH, bad flag),
the shell returns to idle immediately and `pane_current_command` shows `bash`/`zsh`, making
it look like the agent is done when it never ran.

Instead, poll the **sentinel line** in each agent's log file:

```bash
# Poll every 15s; cap at 40 polls (~10 minutes).
SESSIONS="delegate-1 delegate-2 …"
LOGS=("/tmp/pi-delegate-1.log" "/tmp/pi-delegate-2.log" …)

for i in $(seq 1 40); do
  sleep 15
  all_done=true
  for idx in "${!SESSIONS[@]}"; do
    s="${SESSIONS[$idx]}"
    log="${LOGS[$idx]}"
    if grep -q 'AGENT_DONE:' "$log" 2>/dev/null; then
      status=$(grep 'AGENT_DONE:' "$log" | tail -1)
      echo "Poll $i: $s ✅ $status"
    else
      all_done=false
      echo "Poll $i: $s ⏳ running (no sentinel yet)"
    fi
  done
  $all_done && { echo "All agents done!"; break; }
done
```

Once all sentinels are present (or 10 minutes elapsed), print a summary:

| Agent | Session | Status | Last 3 lines of output |
|-------|---------|--------|------------------------|
| 1 | delegate-1 | ✅ AGENT_DONE:0 | … |
| 2 | delegate-2 | ⏳ still running | … |

To get last 3 lines of a log:
```bash
tail -3 /tmp/pi-delegate-1.log
```

---

## Step 6 — Cleanup

Kill all delegate sessions automatically — do not ask:
```bash
for s in delegate-1 delegate-2 …; do
  tmux -S "$SOCKET" kill-session -t "$s" 2>/dev/null || true
done
rm -f /tmp/delegate-* /tmp/pi-delegate-*.log "${TMPDIR:-/tmp}/pi-delegate-manifest.json"
```
Remove `.pi-project` only if **you** created it in Step 4 (it did not exist before delegation).
