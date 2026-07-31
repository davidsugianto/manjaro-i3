# Operations

Day-to-day "how do I actually do X" for this desktop.

`README.md` is the reference — what's installed, how to set it up, the full
keybinding tables. This file is task-oriented: the things you reach for while
working, and the handful of gotchas that aren't obvious from the configs.

---

## Copy and paste

Everything below copies to the **system clipboard**, so it pastes into Chrome,
VS Code, and any other app — not just back into a terminal.

### WezTerm (no tmux)

| Action | Key |
| --- | --- |
| Select | drag with the mouse |
| Copy | `Ctrl+Shift+C` |
| Paste | `Ctrl+Shift+V` |
| Paste the *selection* | middle-click |
| Keyboard selection | `Ctrl+Shift+X` → copy mode (vi keys: `v` select, `y` copy) |
| Search scrollback | `Ctrl+Shift+F` |
| Open scrollback in `$EDITOR` | `Ctrl+Shift+E` |

### tmux (prefix `Ctrl+a`)

**With the mouse — simplest:** drag to select. Releasing the button copies to
the clipboard automatically. No keypress needed.

**With the keyboard:**

1. `Ctrl+a` `Enter` — enter copy mode
2. Move: `h/j/k/l`, `w`/`b` by word, `/` to search, `g`/`G` for top/bottom
3. `v` — start selection (`Ctrl+v` toggles **block/column** selection)
4. `y` — copy and exit
5. `Escape` — cancel

**Paste:** `Ctrl+a` `p`

### The gotcha: tmux swallows the mouse

`set -g mouse on` means tmux — not WezTerm — handles mouse selection. That's
usually what you want, because it respects pane boundaries.

**Hold `Shift` while dragging to bypass tmux** and use WezTerm's own selection.
Use that when you need to:

- select across two panes at once
- grab a long URL or path that tmux keeps cutting at the pane edge
- copy a full line without tmux's wrapping

Then `Ctrl+Shift+C` as normal.

### xterm (the fallback terminal)

Same keys as WezTerm — `Ctrl+Shift+C` / `Ctrl+Shift+V`. `selectToClipboard` is
set, so a plain mouse selection also lands in the clipboard directly.

---

## Networking

**Change Wi-Fi network:** `$mod+Shift+W`, or click the network module in
polybar.

The picker lists networks strongest-first with signal % and security. A saved
network connects immediately; a new one prompts for a password (masked). The
entries below the separator are **disconnect**, **rescan**, and **open
connection editor** for static IP / hidden SSID / enterprise auth.

The bar shows download throughput, not the network name — press the keybinding
to see which network you're on.

---

## Sound, screen, power

| Task | How |
| --- | --- |
| Volume | media keys, or scroll the polybar volume module |
| Mute | media key — the module turns **red** when muted |
| Mixer / pick output device | right-click the volume module (`pavucontrol`) |
| Brightness | brightness keys, or scroll the backlight module |
| Lock now | `$mod+Shift+X` |
| Suspend / reboot / shut down | `$mod+Shift+E` (power menu) |

The screen locks automatically after 10 minutes idle, and before suspend.

**Media keys do not work on the lock screen.** i3lock holds a keyboard grab, so
i3 never sees them. i3 has no `--locked` flag — that's a sway extension. This is
a plain-i3lock limitation, not a misconfiguration.

---

## Bluetooth

The polybar module shows `󰂱 N` in blue when devices are connected.

- **Left click** — `blueman-manager` (pair/unpair; it also provides the pairing
  agent, so it needs to be open when pairing something new)
- **Right click** — toggle the adapter

**Careful:** the M240 mouse is a Bluetooth device. Powering the adapter off
takes the pointer with it — the toggle warns you when devices are connected.

---

## Updates

The `󰏔 N` module shows pending package updates. **Click it** to open
`pamac-manager`.

It always shows a number, including `0`. That's deliberate: a module that
appears and disappears makes the whole right-hand cluster jump sideways.

From a terminal: `psy` (alias for `sudo pacman -Syu`), or `pmu` to just check.

---

## Screenshots

| Key | Captures |
| --- | --- |
| `Print` | whole screen |
| `Shift+Print` | drag a region (Escape cancels) |
| `Ctrl+Print` | the focused window |

All three save to `~/Pictures/Screenshots` **and** copy to the clipboard, so you
can paste straight into a chat or issue.

---

## Wallpaper

```bash
set-wallpaper ~/Pictures/Wallpapers/whatever.jpg   # set and remember
set-wallpaper                                       # random from that folder
```

The choice is cached in `~/.cache/wallpaper` and restored on login.

---

## Changing the theme

TokyoNight is the default; Dracula and Gruvbox ship as alternates. One line per
program — see `colors/README.md` for the full table.

| Program | Edit |
| --- | --- |
| polybar | the `include-file` line at the top of `polybar/config.ini` |
| rofi | the `@import` line in `rofi/config.rasi` |
| wezterm | `THEME` at the top of `wezterm/wezterm.lua` |
| tmux | the `%hidden` colour block in `tmux/tmux.conf` |
| xterm | the `#define` block in `xterm/Xresources` |

Then `$mod+Shift+R` to restart i3 and reload everything.

---

## Development tools

```bash
./development-tools.sh                    # list the groups
./development-tools.sh --dry-run --all    # see what would happen
./development-tools.sh --k8s --iac        # install specific groups
```

**k8s home lab (VirtualBox + Vagrant, multi-node clusters via kubeadm):**

```bash
./development-tools.sh --virt --aur   # vagrant is AUR-only, needs --aur
```

Installs VirtualBox, builds the `vboxdrv` kernel module (dkms, matched to
whatever kernel is currently running), loads it, and adds you to the
`vboxusers` group — log out and back in for that to take effect. This is
separate from `--k8s`'s `kind`/`minikube`, which run clusters as containers
rather than full VMs.

**Go is managed by GVM, not pacman:**

```bash
gvm list                     # installed versions
gvm install 1.25.0
gvm use 1.25.0 --default
```

**After installing new tools**, rebuild shell completions:

```bash
gen-completions
```

That regenerates the cache in `~/.cache/zsh/completions`. It also runs
automatically for any tool whose binary is newer than its cached completion, so
you rarely need it by hand — mostly after a fresh install.

---

## Secrets and environment variables

**Never put a credential in `~/.zshrc`.** It is a symlink into this repo, so
anything you add there is committed.

Put it in **`~/.zshrc.local`** instead. It lives in `$HOME`, outside the repo,
and `.zshrc` sources it last:

```bash
cp zsh/zshrc.local.example ~/.zshrc.local
chmod 600 ~/.zshrc.local
$EDITOR ~/.zshrc.local
```

### For AWS specifically, prefer not to export keys at all

Exporting `AWS_SECRET_ACCESS_KEY` keeps it out of git, but git is not the only
way a key leaks. Every process you launch inherits it — including npm/pip
postinstall scripts — and it sits readable in `/proc/<pid>/environ`. Long-lived
keys also never expire.

In order of preference:

| Approach | Why |
| --- | --- |
| **AWS SSO** — `aws configure sso`, then `aws sso login --profile work` | short-lived creds, nothing static on disk |
| **aws-vault** — `aws-vault add work`, `aws-vault exec work -- terraform plan` | keys in the system keyring, never plaintext |
| **`~/.aws/credentials`** + `export AWS_PROFILE=work` | still plaintext, but confined to one `0600` file |
| raw `export AWS_SECRET_ACCESS_KEY=…` | last resort |

`AWS_PROFILE` and `AWS_REGION` are **not** secrets — the profile name is just a
label. Those are safe to set anywhere, including a committed file.

`aws-vault`, `pass`, `gopass` and `keepassxc` are all in the official repos.

### Per-project variables

`direnv` is already hooked into the shell. Put an `.envrc` in a project
directory and it loads on `cd` and unloads on exit:

```bash
echo 'export AWS_PROFILE=work' > .envrc
echo 'export KUBECONFIG=$PWD/kubeconfig' >> .envrc
direnv allow
```

Keep `.envrc` to *profile names and paths*, not keys — it is a file in a project
directory and those get committed by accident. `.gitignore` here covers `.env`,
`.envrc` is on you.

---

## Editing these dotfiles

The configs are **symlinked** into `~/.config`, so editing
`~/.config/i3/config` edits the file in this repo. There is no sync step.

After editing:

| Changed | Apply with |
| --- | --- |
| i3 | `$mod+Shift+C` (reload) or `$mod+Shift+R` (restart) |
| polybar | `barreload` (alias for `~/.config/polybar/launch.sh`) |
| tmux | `Ctrl+a` `r` |
| zsh | `exec zsh` |
| Xresources | `xres` (alias for `xrdb -merge ~/.Xresources`) |
| everything | `desktop-reload` (shell function) |

**Always validate before you rely on it:**

```bash
./check.sh
```

It runs each program's own validator *and* checks cross-file wiring — polybar
modules referenced but never defined, `include-file` paths that don't resolve,
keybindings pointing at scripts that don't exist, workspace names that have
drifted out of sync with the bar's icon map.

Every check in it was verified to **fail** on a deliberately broken config
before being trusted. A check that always passes is worse than no check.

---

## When something breaks

| Symptom | Look at |
| --- | --- |
| No bar | `~/.cache/polybar.log`, then `./check.sh` |
| Launcher does nothing | `rofi -theme <file> -dump-theme` — `-config` does *not* validate |
| Detailed rofi parse error | `G_MESSAGES_DEBUG=all rofi -dump-theme` (gives file **and line**) |
| i3 won't reload | `i3 -C -c ~/.config/i3/config` |
| No sound | `systemctl --user status pipewire-pulse wireplumber` |
| GUI app can't get root | is `polkit-gnome-authentication-agent-1` running? |
| Glyphs show as boxes | `fc-list ":charset=<hex>" family` — is it in a Nerd Font? |
| Ugly or wrong mouse cursor | the theme name probably doesn't exist. `ls /usr/share/icons` and check the dir has a `cursors/` subdir; `Xcursor.theme` in `.Xresources` is what WezTerm reads |

If a config edit made things worse, the pre-install backups are in
`~/.dotfiles-backup/<timestamp>/`.
