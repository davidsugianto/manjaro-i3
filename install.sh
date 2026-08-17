#!/usr/bin/env bash
#
# install.sh — link these dotfiles into place.
#
#   ./install.sh              full install: packages, symlinks, services
#   ./install.sh --link-only  symlinks only, no pacman, no systemctl
#   ./install.sh --packages   install packages and stop
#   ./install.sh --dry-run    print what would happen, change nothing
#   ./install.sh --no-x11     skip the /etc/X11 input rules
#   ./install.sh --no-greeter skip the /etc/lightdm/slick-greeter.conf install
#
# --no-x11 and --no-greeter are the only steps that write outside $HOME
# (besides package installation) and are the only ones that ask for sudo.
#
# Everything it replaces is backed up to ~/.dotfiles-backup/<timestamp>/ first,
# so a bad run is always reversible. Symlinks mean editing ~/.config/i3/config
# edits the file in this repo — which is the point.

set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP="$HOME/.dotfiles-backup/$STAMP"

DO_PACKAGES=1
DO_LINKS=1
DO_SERVICES=1
DO_X11=1
DO_GREETER=1
DRY_RUN=0

for arg in "$@"; do
    case "$arg" in
        --link-only) DO_PACKAGES=0; DO_SERVICES=0; DO_X11=0; DO_GREETER=0 ;;
        --packages)  DO_LINKS=0;    DO_SERVICES=0; DO_X11=0; DO_GREETER=0 ;;
        --no-x11)    DO_X11=0 ;;
        --no-greeter) DO_GREETER=0 ;;
        --dry-run)   DRY_RUN=1 ;;
        -h|--help)   sed -n '3,17p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
        *) printf 'unknown option: %s\n' "$arg" >&2; exit 1 ;;
    esac
done

# --- output helpers --------------------------------------------------------
if [[ -t 1 ]]; then
    B=$'\033[1m'; BLUE=$'\033[34m'; GREEN=$'\033[32m'
    YELLOW=$'\033[33m'; RED=$'\033[31m'; R=$'\033[0m'
else
    B=""; BLUE=""; GREEN=""; YELLOW=""; RED=""; R=""
fi

section() { printf '\n%s%s==>%s %s%s%s\n' "$B" "$BLUE" "$R" "$B" "$1" "$R"; }
info()    { printf '    %s\n' "$1"; }
ok()      { printf '    %s✓%s %s\n' "$GREEN" "$R" "$1"; }
warn()    { printf '    %s!%s %s\n' "$YELLOW" "$R" "$1"; }
err()     { printf '    %s✗%s %s\n' "$RED" "$R" "$1" >&2; }
run()     { if (( DRY_RUN )); then printf '    %s[dry-run]%s %s\n' "$YELLOW" "$R" "$*"; else "$@"; fi; }

(( DRY_RUN )) && printf '%s*** DRY RUN — nothing will be changed ***%s\n' "$YELLOW" "$R"

# ===========================================================================
# 1. sanity checks
# ===========================================================================

section "Checking environment"

if [[ ! -f /etc/os-release ]] || ! grep -qE '^ID(_LIKE)?=.*arch|^ID=manjaro' /etc/os-release; then
    warn "This doesn't look like an Arch-based system."
    warn "Symlinking will still work; package installation probably won't."
fi

if [[ $EUID -eq 0 ]]; then
    err "Don't run this as root — it links files into \$HOME."
    err "It will ask for sudo only for packages and /etc/X11 rules."
    exit 1
fi
ok "Running as $USER"

# ===========================================================================
# 2. packages
# ===========================================================================

if (( DO_PACKAGES )); then
    section "Installing packages"

    if ! command -v pacman >/dev/null; then
        warn "pacman not found — skipping package installation"
    else
        # Strip comments, inline comments, and blanks.
        mapfile -t WANTED < <(sed -e 's/#.*//' -e '/^[[:space:]]*$/d' \
                                  -e 's/[[:space:]]*$//' "$REPO/packages.txt")

        MISSING=()
        for p in "${WANTED[@]}"; do
            pacman -Qq "$p" &>/dev/null || MISSING+=("$p")
        done

        if [[ ${#MISSING[@]} -eq 0 ]]; then
            ok "All ${#WANTED[@]} packages already installed"
        else
            info "${#MISSING[@]} of ${#WANTED[@]} packages missing:"
            printf '      %s\n' "${MISSING[@]}"
            # --needed is belt-and-braces; we already filtered.
            run sudo pacman -S --needed --noconfirm "${MISSING[@]}"
            ok "Packages installed"
        fi
    fi
fi

# ===========================================================================
# 3. symlinks
# ===========================================================================

# link <source-in-repo> <destination>
link() {
    local src="$REPO/$1" dest="$2"

    if [[ ! -e "$src" ]]; then
        err "missing in repo: $1"
        return 1
    fi

    # Already pointing where we want? Nothing to do.
    if [[ -L "$dest" && "$(readlink -f "$dest")" == "$(readlink -f "$src")" ]]; then
        ok "$dest (already linked)"
        return 0
    fi

    # Back up anything real that's in the way.
    if [[ -e "$dest" || -L "$dest" ]]; then
        local rel="${dest#"$HOME"/}"
        run mkdir -p "$BACKUP/$(dirname "$rel")"
        run mv "$dest" "$BACKUP/$rel"
        warn "backed up existing $dest"
    fi

    run mkdir -p "$(dirname "$dest")"
    run ln -s "$src" "$dest"
    ok "$dest"
}

if (( DO_LINKS )); then
    section "Linking dotfiles"
    info "Backups (if any) go to $BACKUP"

    # --- window manager ---
    # i3 reads ~/.config/i3/config before ~/.i3/config, so Manjaro's stock
    # config would be shadowed silently. Move it aside to avoid confusion.
    if [[ -f "$HOME/.i3/config" && ! -L "$HOME/.i3/config" ]]; then
        run mkdir -p "$BACKUP/.i3"
        run mv "$HOME/.i3/config" "$BACKUP/.i3/config"
        warn "moved Manjaro's ~/.i3/config to the backup (it was shadowed anyway)"
    fi

    link i3/config              "$HOME/.config/i3/config"
    link i3/scripts             "$HOME/.config/i3/scripts"

    # --- bar, launcher, notifications, compositor ---
    link polybar                "$HOME/.config/polybar"
    link rofi                   "$HOME/.config/rofi"
    link dunst                  "$HOME/.config/dunst"
    link picom/picom.conf       "$HOME/.config/picom/picom.conf"

    # --- terminals ---
    link wezterm                "$HOME/.config/wezterm"
    link tmux/tmux.conf         "$HOME/.config/tmux/tmux.conf"
    link kitty                  "$HOME/.config/kitty"
    link xterm/Xresources       "$HOME/.Xresources"

    # --- editor ---
    link nvim                   "$HOME/.config/nvim"

    # --- shell ---
    link zsh/zshrc              "$HOME/.zshrc"
    link zsh/aliases.zsh        "$HOME/.config/zsh/aliases.zsh"
    link zsh/functions.zsh      "$HOME/.config/zsh/functions.zsh"
    # Cloud/DevOps toolchain: completions, tool env, kubectl/tf/docker aliases.
    link zsh/completions.zsh    "$HOME/.config/zsh/completions.zsh"

    # --- pi agent ---
    link pi/agent/extensions    "$HOME/.pi/agent/extensions"
    link pi/agent/prompts       "$HOME/.pi/agent/prompts"
    link pi/agent/skills        "$HOME/.pi/agent/skills"
    link pi/agent/themes        "$HOME/.pi/agent/themes"
    link pi/agent/keybindings.json "$HOME/.pi/agent/keybindings.json"

    # --- XDG autostart overrides ---
    # Suppress the tray applets that polybar now covers natively. These are
    # per-user overrides of /etc/xdg/autostart entries; see x11/autostart/.
    for entry in "$REPO"/x11/autostart/*.desktop; do
        [[ -f "$entry" ]] || continue
        link "x11/autostart/$(basename "$entry")" \
             "$HOME/.config/autostart/$(basename "$entry")"
    done

    # --- helper scripts onto $PATH ---
    section "Linking helper scripts"
    run mkdir -p "$HOME/.local/bin"
    for script in "$REPO"/bin/*; do
        [[ -f "$script" ]] || continue
        link "bin/$(basename "$script")" "$HOME/.local/bin/$(basename "$script")"
    done

    # --- executable bits ---
    if (( ! DRY_RUN )); then
        chmod +x "$REPO"/bin/* \
                 "$REPO"/i3/scripts/*.sh \
                 "$REPO"/polybar/launch.sh \
                 "$REPO"/polybar/scripts/* \
                 "$REPO"/rofi/scripts/* 2>/dev/null || true
        ok "Scripts marked executable"
    fi

    # --- directories the configs expect to exist ---
    run mkdir -p "$HOME/Pictures/Screenshots" \
                 "$HOME/Pictures/Wallpapers" \
                 "$HOME/.local/state/zsh" \
                 "$HOME/.cache/zsh"
    ok "Created screenshot/wallpaper/state directories"
fi

# ===========================================================================
# 4. X11 input rules
# ===========================================================================

if (( DO_X11 )); then
    section "Installing X11 input rules"
    info "These go in /etc/X11/xorg.conf.d/ and need sudo."
    info "Skip with --no-x11 if you'd rather not touch system config."

    for f in 30-touchpad.conf 40-pointer.conf; do
        target="/etc/X11/xorg.conf.d/$f"
        if [[ -f "$target" ]] && cmp -s "$REPO/x11/$f" "$target"; then
            ok "$target (unchanged)"
            continue
        fi
        if [[ -f "$target" ]]; then
            run sudo cp "$target" "$target.bak-$STAMP"
            warn "backed up $target to $target.bak-$STAMP"
        fi
        run sudo install -Dm644 "$REPO/x11/$f" "$target"
        ok "$target"
    done
    info "Input changes apply after the next logout."
fi

# ===========================================================================
# 4b. login screen (lightdm-slick-greeter)
# ===========================================================================

if (( DO_GREETER )); then
    if command -v lightdm >/dev/null || [[ -d /etc/lightdm ]]; then
        section "Installing login screen config"
        info "Goes to /etc/lightdm/slick-greeter.conf and needs sudo."
        info "Skip with --no-greeter if you'd rather not touch system config."

        target="/etc/lightdm/slick-greeter.conf"
        if [[ -f "$target" ]] && cmp -s "$REPO/greeter/slick-greeter.conf" "$target"; then
            ok "$target (unchanged)"
        else
            if [[ -f "$target" ]]; then
                run sudo cp "$target" "$target.bak-$STAMP"
                warn "backed up $target to $target.bak-$STAMP"
            fi
            run sudo install -Dm644 "$REPO/greeter/slick-greeter.conf" "$target"
            ok "$target"
        fi

        # The greeter can't read anything under $HOME (mode 700), so the
        # background it points at has to be copied to a system path. Do it
        # once here from whatever wallpaper is currently set; re-run
        # sync-greeter-background by hand later if you change it.
        bg_dest="/usr/share/backgrounds/manjaro-i3-greeter.jpg"
        if [[ -f "$bg_dest" ]]; then
            ok "$bg_dest (already set)"
        else
            wall="$HOME/.cache/wallpaper"
            if [[ -f "$wall" && -f "$(<"$wall")" ]]; then
                run sudo install -Dm644 "$(<"$wall")" "$bg_dest"
                ok "$bg_dest (from current wallpaper)"
            else
                info "no wallpaper set yet — run set-wallpaper, then sync-greeter-background"
            fi
        fi
        info "Login screen changes apply after the next logout/restart."
    else
        info "lightdm not detected — skipping login screen config"
    fi
fi

# ===========================================================================
# 5. services & shell
# ===========================================================================

if (( DO_SERVICES )); then
    section "Enabling services"

    # Audio. Without wireplumber running there is no sound at all, and
    # polybar's pulseaudio module shows nothing — worth being explicit.
    for unit in pipewire pipewire-pulse wireplumber; do
        if systemctl --user list-unit-files "$unit.service" &>/dev/null; then
            if systemctl --user is-enabled "$unit.service" &>/dev/null; then
                ok "$unit (already enabled)"
            else
                run systemctl --user enable --now "$unit.service"
                ok "$unit enabled"
            fi
        else
            warn "$unit.service not found — is pipewire installed?"
        fi
    done

    section "Setting the default shell"
    if [[ "$SHELL" == */zsh ]]; then
        ok "zsh is already your login shell"
    elif command -v zsh >/dev/null; then
        info "Run this to switch (it will ask for your password):"
        info "    chsh -s $(command -v zsh)"
    fi

    # Rebuild the font cache so the Nerd Font glyphs in polybar/rofi resolve.
    if command -v fc-cache >/dev/null; then
        run fc-cache -f >/dev/null 2>&1
        ok "Font cache rebuilt"
    fi
fi

# ===========================================================================
# done
# ===========================================================================

section "Done"

if (( DRY_RUN )); then
    info "Dry run complete — nothing was changed."
    exit 0
fi

cat <<EOF

    Next steps:

      1. Log out and back in (picks up the shell, X11 input rules and fonts).
         Or, to try it without logging out:  i3-msg restart

      2. Run  p10k configure  once to generate your zsh prompt.

      3. Drop wallpapers in ~/Pictures/Wallpapers — one is picked at random
         on login. Until then you get a flat Catppuccin Mocha background.

    Keybindings: see README.md, or press \$mod+Shift+/ for i3's own help.
    Backups from this run: ${BACKUP}

EOF
