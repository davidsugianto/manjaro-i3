---
description: Pull latest pi config from GitHub dotfiles and restore to ~/.pi/agent/
---
Restore my pi configuration from the dotfiles repo into the active live config.

The source of truth is `~/.pi-dotfiles/` (remote: https://github.com/vericsont/dotfiles).
The destination is `~/.pi/agent/`.

> **Note:** `~/.pi/` may be a symlink to the active profile directory (`~/.pi.{active}.profile/`). All destination paths below resolve through this symlink, so this command operates on the active profile. The active profile name is recorded in `~/.pi-config`.

## Steps

1. **Read the active profile name** — run `cat ~/.pi-config` (if the file exists) to identify which profile is active. If the file does not exist, the user has not yet migrated to the profile layout; proceed exactly as before (no behaviour change needed).

2. **Fetch & fast-forward the dotfiles repo** — run:
   ```
   git -C ~/.pi-dotfiles pull --ff-only origin main
   ```
   If the pull fails (diverged history, network error, repo missing), stop and report the error clearly. Do NOT proceed with stale repo files.

3. **Check for local changes that would be overwritten** — diff the repo version against the live config for each tracked path:
   - `~/.pi-dotfiles/.pi/agent/settings.json` vs `~/.pi/agent/settings.json`
   - `~/.pi-dotfiles/.pi/agent/extensions/` vs `~/.pi/agent/extensions/`
   - `~/.pi-dotfiles/.pi/agent/themes/` vs `~/.pi/agent/themes/`
   - `~/.pi-dotfiles/.pi/agent/prompts/` vs `~/.pi/agent/prompts/`
   - `~/.pi-dotfiles/.pi/agent/keybindings.json` vs `~/.pi/agent/keybindings.json`
   - `~/.pi-dotfiles/.pi/agent/skills/` vs `~/.pi/agent/skills/`

   Use `diff -rq` or `rsync --dry-run -a --checksum` to detect changes. If any live files differ from the repo, **show the diff summary and ask me to confirm** before overwriting. If nothing differs, say so and stop.

4. **Also report files present in the live config but absent from the repo** (e.g. locally-created skills or prompts not yet saved). These will NOT be deleted — just flagged so I know the repo doesn't have them.

5. **Confirm before copying** — show the list of files that will be updated and wait for me to say "go" unless I passed an argument (see below).

   Argument (optional): $@
   - If I said "auto" or "go", skip the confirmation and restore immediately.

6. **Copy repo → live config**:
   ```
   cp ~/.pi-dotfiles/.pi/agent/settings.json ~/.pi/agent/settings.json
   rsync -a ~/.pi-dotfiles/.pi/agent/extensions/ ~/.pi/agent/extensions/
   rsync -a ~/.pi-dotfiles/.pi/agent/themes/    ~/.pi/agent/themes/
   rsync -a ~/.pi-dotfiles/.pi/agent/prompts/   ~/.pi/agent/prompts/
   rsync -a ~/.pi-dotfiles/.pi/agent/skills/    ~/.pi/agent/skills/
   ```
   Copy `keybindings.json` only if it exists in the repo.

   Do NOT use `--delete` without asking me first — files present locally but absent from the repo should not be silently removed.

7. **Report** — list every file that was updated (or confirm nothing changed). Remind me to restart pi if `settings.json` or any extension was changed.

Do not touch `~/.pi-shared/` (shared state across profiles), `~/.pi/agent/npm/`, `~/.pi/agent/bin/`, `~/.pi/agent/auth.json` (machine-local credential symlink), or any `*.log` files.
