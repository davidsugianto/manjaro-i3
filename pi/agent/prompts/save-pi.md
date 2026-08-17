---
description: Sync pi config to ~/.pi-dotfiles and push to GitHub
---
Back up my current pi configuration to the dotfiles repo and push it to GitHub.

The source of truth is `~/.pi/agent/`.
The dotfiles repo is `~/.pi-dotfiles/` (remote: https://github.com/vericsont/dotfiles).

> **Note:** `~/.pi/` is now a symlink to the active profile directory (`~/.pi.{active}.profile/`). All paths below resolve through this symlink, so this command continues to operate on the active profile. The active profile name is recorded in `~/.pi-config`.

## Steps

1. **Read the active profile name** — run `cat ~/.pi-config` (if the file exists) to identify which profile is currently active and therefore which profile we're syncing. If `~/.pi-config` does not exist, the user has not yet migrated to the profile layout; proceed exactly as before (no behaviour change needed).

2. **Diff the current state** — run `git -C ~/.pi-dotfiles status` to see what's already tracked, then compare the live config files against the repo:
   - `~/.pi/agent/settings.json` → `~/.pi-dotfiles/.pi/agent/settings.json`
   - `~/.pi/agent/extensions/*.ts` (skip `.disabled` files) → `~/.pi-dotfiles/.pi/agent/extensions/`
   - `~/.pi/agent/themes/*.json` → `~/.pi-dotfiles/.pi/agent/themes/`
   - `~/.pi/agent/prompts/*.md` → `~/.pi-dotfiles/.pi/agent/prompts/` (create dir if missing)
   - `~/.pi/agent/keybindings.json` → `~/.pi-dotfiles/.pi/agent/keybindings.json` (if it exists)
   - `~/.pi/agent/skills/` (subdirs only, skip `bin/`) → `~/.pi-dotfiles/.pi/agent/skills/`

3. **Copy changed/new files** — use `cp` (or `rsync -a --delete` for directory trees like extensions/, themes/, prompts/, skills/) to overwrite the dotfiles repo with the live versions. Do NOT delete files from the dotfiles repo that no longer exist in the live config without confirming with me first.

4. **Show a summary** — list every file added, modified, or removed (use `git -C ~/.pi-dotfiles diff --stat`). If nothing changed, say so and stop.

5. **Confirm before committing** — show the planned commit message and wait for me to say "go" unless I passed an argument (see below).

   Argument (optional): $@
   - If I provided a commit message hint above, use it in the commit subject.
   - If I said "auto" or "go", skip the confirmation and commit immediately.

6. **Commit and push**:
   ```
   git -C ~/.pi-dotfiles add -A
   git -C ~/.pi-dotfiles commit -m "chore: sync pi config — <short summary of what changed>"
   git -C ~/.pi-dotfiles push origin main
   ```

7. **Report** — print the commit hash and confirm the push succeeded.

Do not touch `~/.pi-shared/` (shared state across profiles), `~/.pi/agent/npm/`, `~/.pi/agent/bin/`, `~/.pi/agent/auth.json` (now a symlink into shared state), or any `*.log` files.
