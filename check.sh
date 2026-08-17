#!/usr/bin/env bash
#
# check.sh — validate the dotfiles before you rely on them.
#
# Two kinds of check:
#   * syntax   — run each program's own validator (i3 -C, picom --diagnostics,
#                zsh -n, luac -p, tmux source-file …). Skipped with a note if
#                the program isn't installed.
#   * wiring   — cross-file consistency that no single program can catch:
#                polybar modules referenced but never defined, include-file
#                paths that don't exist, keybindings pointing at missing
#                scripts. These are the errors that actually bite, because
#                each file is individually valid.
#
# Exits non-zero if anything failed.

set -uo pipefail
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$REPO"

if [[ -t 1 ]]; then
    B=$'\033[1m'; GREEN=$'\033[32m'; YELLOW=$'\033[33m'; RED=$'\033[31m'; BLUE=$'\033[34m'; R=$'\033[0m'
else
    B=""; GREEN=""; YELLOW=""; RED=""; BLUE=""; R=""
fi

PASS=0; FAIL=0; SKIP=0
section() { printf '\n%s%s==>%s %s%s%s\n' "$B" "$BLUE" "$R" "$B" "$1" "$R"; }
pass() { printf '    %s✓%s %s\n' "$GREEN" "$R" "$1"; ((PASS++)); }
fail() { printf '    %s✗%s %s\n' "$RED" "$R" "$1"; ((FAIL++)); }
skip() { printf '    %s—%s %s\n' "$YELLOW" "$R" "$1"; ((SKIP++)); }

# ===========================================================================
section "Syntax"
# ===========================================================================

# --- shell ---
shell_bad=0
for f in bin/* i3/scripts/*.sh polybar/launch.sh polybar/scripts/* rofi/scripts/* install.sh check.sh development-tools.sh; do
    [[ -f "$f" ]] || continue
    bash -n "$f" 2>/dev/null || { fail "bash -n: $f"; shell_bad=1; }
done
(( shell_bad )) || pass "all bash scripts parse"

zsh_bad=0
if command -v zsh >/dev/null; then
    for f in zsh/zshrc zsh/aliases.zsh zsh/functions.zsh zsh/completions.zsh colors/tokyonight.sh colors/catppuccin-mocha.sh; do
        zsh -n "$f" 2>/dev/null || { fail "zsh -n: $f"; zsh_bad=1; }
    done
    (( zsh_bad )) || pass "all zsh files parse"
else
    skip "zsh not installed"
fi

# --- i3 ---
if command -v i3 >/dev/null; then
    # i3 -C exits 0 even when it prints errors, so grep the output instead.
    out=$(i3 -C -c i3/config 2>&1)
    if [[ -n "$out" ]]; then
        fail "i3 config:"; printf '        %s\n' "$out" | head -10
    else
        pass "i3 config validates (i3 -C)"
    fi
else
    skip "i3 not installed"
fi

# --- tmux ---
if command -v tmux >/dev/null; then
    if out=$(tmux -f tmux/tmux.conf -L _check new-session -d 2>&1); then
        tmux -L _check kill-server 2>/dev/null
        pass "tmux config loads"
    else
        fail "tmux config: $out"
    fi
else
    skip "tmux not installed"
fi

# --- wezterm ---
if command -v luac >/dev/null; then
    luac -p wezterm/wezterm.lua 2>/dev/null \
        && pass "wezterm.lua parses (luac -p)" \
        || fail "wezterm.lua has a Lua syntax error"
elif command -v wezterm >/dev/null; then
    wezterm --config-file "$REPO/wezterm/wezterm.lua" ls-fonts >/dev/null 2>&1 \
        && pass "wezterm config loads" \
        || fail "wezterm config failed to load"
else
    skip "no lua/wezterm to check wezterm.lua"
fi

# --- picom ---
if command -v picom >/dev/null && [[ -n "${DISPLAY:-}" ]]; then
    err=$(timeout 15 picom --config picom/picom.conf --diagnostics 2>&1 >/dev/null \
          | grep -iE "error|deprecat|invalid" | grep -v "egl backend is still experimental")
    [[ -z "$err" ]] && pass "picom config clean" || { fail "picom:"; printf '        %s\n' "$err"; }
else
    skip "picom not installed or no \$DISPLAY"
fi

# --- dunst ---
if command -v dunst >/dev/null; then
    # dunst can't start a second instance on the bus, but it parses the config
    # before it ever touches D-Bus, so config warnings still surface.
    timeout 5 dunst -conf dunst/dunstrc </dev/null >/dev/null 2>/tmp/_dunst.$$ &
    sleep 2.5; kill %1 2>/dev/null; wait 2>/dev/null
    err=$(grep -viE "dbus_cb_name_lost|Cannot acquire|Name is acquired|Could not find theme" /tmp/_dunst.$$)
    rm -f /tmp/_dunst.$$
    [[ -z "$err" ]] && pass "dunstrc clean" || { fail "dunst:"; printf '        %s\n' "$err"; }
else
    skip "dunst not installed"
fi

# --- Xresources ---
if command -v xrdb >/dev/null; then
    err=$(xrdb -n xterm/Xresources 2>&1 >/dev/null)
    [[ -z "$err" ]] && pass "Xresources clean" || { fail "Xresources:"; printf '        %s\n' "$err"; }
else
    skip "xrdb not installed"
fi

# --- polybar / rofi / kitty ---
#
# Each of these needs a specific invocation to actually surface errors. The
# obvious-looking ones silently succeed on a broken file, which is worse than
# no check at all — every command below was verified to FAIL on a deliberately
# broken config before being trusted here.

if command -v polybar >/dev/null; then
    # polybar resolves ${section.key} references LAZILY — --dump=modules-right
    # will happily succeed while `background` holds a broken reference. So dump
    # every key in [bar/main] individually; that forces each one to resolve.
    # (include-file errors surface on any dump, since those are parse-time.)
    #
    # polybar also exits 0 on a fatal error, so grep the output, not $?.
    polybar_err=""
    # include-file is a top-level directive, not a bar/main parameter — dumping
    # it reports a spurious "Missing parameter bar/main.include-file".
    keys=$(sed -n '/^\[bar\/main\]/,/^\[/p' polybar/config.ini \
           | grep -oE '^[a-z0-9-]+[[:space:]]*=' | tr -d ' =' \
           | grep -vx 'include-file' | sort -u)
    for k in $keys; do
        e=$(polybar --config=polybar/config.ini --dump="$k" main 2>&1 \
            | grep -iE 'polybar\|error|does not exist|Failed to open')
        [[ -n "$e" ]] && polybar_err+="${k}: ${e}"$'\n'
    done
    if [[ -z "$polybar_err" ]]; then
        pass "polybar config parses ($(wc -w <<< "$keys") bar keys resolved)"
    else
        fail "polybar:"; printf '        %s\n' "$polybar_err"
    fi
else
    skip "polybar not installed"
fi

if command -v rofi >/dev/null; then
    # `-config FILE` does NOT validate — it silently dumps the default theme.
    # Only `-theme FILE` with an absolute path really parses. Check each theme
    # individually so the failing file is named.
    rofi_err=""
    for t in rofi/themes/*.rasi; do
        e=$(rofi -theme "$REPO/$t" -dump-theme 2>&1 >/dev/null | grep -iE "failed to parse")
        [[ -n "$e" ]] && rofi_err+="${t}: ${e}"$'\n'
    done
    # Plus the default path $mod+d actually takes (config.rasi -> @theme).
    e=$(rofi -dump-theme 2>&1 >/dev/null | grep -iE "failed to parse")
    [[ -n "$e" ]] && rofi_err+="config.rasi: ${e}"$'\n'
    [[ -z "$rofi_err" ]] && pass "all rofi themes parse ($(ls rofi/themes/*.rasi | wc -l) files + config.rasi)" \
                         || { fail "rofi:"; printf '        %s\n' "$rofi_err"; }
else
    skip "rofi not installed"
fi

if command -v kitty >/dev/null; then
    # --debug-config prints nothing useful without a display; loading the
    # config through kitty's own parser is what surfaces bad values.
    err=$(kitty +runpy "from kitty.config import load_config; load_config('$REPO/kitty/kitty.conf')" 2>&1 \
          | grep -iE "error|invalid|Traceback" | head -3)
    [[ -z "$err" ]] && pass "kitty config parses" || { fail "kitty:"; printf '        %s\n' "$err"; }
else
    skip "kitty not installed"
fi

# ===========================================================================
section "Wiring"
# ===========================================================================

# --- every polybar module used by the bar must actually be defined ---
used=$(grep -hE '^modules-(left|center|right)' polybar/config.ini \
       | sed 's/^[^=]*=//' | tr ' ' '\n' | sed '/^$/d' | sort -u)
defined=$(grep -rhoE '^\[module/[a-z0-9_-]+\]' polybar/modules/ \
          | sed 's|^\[module/||; s|\]$||' | sort -u)
missing=$(comm -23 <(printf '%s\n' "$used") <(printf '%s\n' "$defined"))
if [[ -z "$missing" ]]; then
    pass "all polybar bar modules are defined ($(wc -w <<< "$used") used)"
else
    fail "polybar modules used but never defined: $(tr '\n' ' ' <<< "$missing")"
fi

# --- every include-file in polybar/config.ini must exist ---
inc_bad=0
while read -r inc; do
    resolved="${inc/#\~\/.config\/polybar/$REPO/polybar}"
    [[ -e "$resolved" ]] || { fail "polybar include-file missing: $inc"; inc_bad=1; }
done < <(grep -E '^\s*include-file' polybar/config.ini | sed 's/.*=\s*//')
(( inc_bad )) || pass "all polybar include-file paths resolve"

# --- rofi @import / @theme targets must exist ---
rofi_bad=0
while read -r t; do
    [[ -e "rofi/$t" ]] || { fail "rofi import missing: $t"; rofi_bad=1; }
done < <(grep -hoE '^\s*@(import|theme)\s+"[^"]+"' rofi/config.rasi | grep -oE '"[^"]+"' | tr -d '"')
while read -r t; do
    [[ -e "rofi/themes/$t" ]] || { fail "rofi theme import missing: themes/$t"; rofi_bad=1; }
done < <(grep -hoE '^\s*@import\s+"[^"]+"' rofi/themes/*.rasi | grep -oE '"[^"]+"' | tr -d '"' | sort -u)
(( rofi_bad )) || pass "all rofi @import/@theme targets resolve"

# --- scripts referenced by i3 and polybar must exist in the repo ---
ref_bad=0
while read -r path; do
    case "$path" in
        */.config/rofi/scripts/*) local_path="rofi/scripts/${path##*/}" ;;
        */.config/polybar/*)      local_path="polybar/${path#*/.config/polybar/}" ;;
        */.config/i3/scripts/*)   local_path="i3/scripts/${path##*/}" ;;
        */.local/bin/*)           local_path="bin/${path##*/}" ;;
        *) continue ;;
    esac
    [[ -e "$local_path" ]] || { fail "referenced but not in repo: $path -> $local_path"; ref_bad=1; }
done < <(grep -rhoE '~/(\.config|\.local)/[A-Za-z0-9_./-]+' i3/config polybar/ rofi/ dunst/ 2>/dev/null | sort -u)
(( ref_bad )) || pass "all referenced scripts exist in the repo"

# --- every file install.sh links must exist ---
link_bad=0
while read -r src; do
    [[ -e "$src" ]] || { fail "install.sh links a missing path: $src"; link_bad=1; }
done < <(grep -E '^\s*link\s+[a-z]' install.sh | awk '{print $2}' | sort -u)
(( link_bad )) || pass "all install.sh link sources exist"

# --- scripts that must be executable ---
exec_bad=0
for f in bin/* i3/scripts/*.sh polybar/launch.sh polybar/scripts/* rofi/scripts/*; do
    [[ -f "$f" ]] || continue
    [[ -x "$f" ]] || { fail "not executable: $f"; exec_bad=1; }
done
(( exec_bad )) || pass "all scripts are executable"

# --- every package development-tools.sh names must actually exist ---
# A typo here fails the whole pacman transaction, taking the other 50 packages
# with it. `gh` vs `github-cli` was exactly this.
if command -v pacman >/dev/null && [[ -f development-tools.sh ]]; then
    pkg_bad=0
    repo_pkgs=$(grep -oE '^PKG\[[a-z]+\]="[^"]*"' development-tools.sh \
                | sed 's/^PKG\[[a-z]*\]="//; s/"$//' | tr ' ' '\n' | sed '/^$/d' | sort -u)
    while read -r p; do
        [[ -z "$p" ]] && continue
        pacman -Si "$p" &>/dev/null || { fail "development-tools.sh names a package not in the repos: $p"; pkg_bad=1; }
    done <<< "$repo_pkgs"
    (( pkg_bad )) || pass "all $(grep -c . <<< "$repo_pkgs") dev-tool packages exist in the repos"

    # GROUPS is a bash built-in (the user's numeric group IDs); assigning to it
    # is silently ignored. This bit once, hence the guard.
    if grep -qE '^\s*GROUPS=' development-tools.sh; then
        fail "development-tools.sh assigns to GROUPS, which is a bash built-in array"
    else
        pass "no assignment to the bash built-in GROUPS"
    fi
else
    skip "pacman unavailable — cannot verify dev-tool package names"
fi

# --- ws-icon glyphs must be present, unquoted, and in the installed font ---
# All three of these actually went wrong once: the glyphs were silently empty,
# then quoting them made polybar render literal quote marks.
if command -v fc-list >/dev/null; then
    icon_bad=0
    while IFS= read -r line; do
        key=${line%% *}
        glyph=${line#*;}
        if [[ -z "$glyph" ]]; then
            fail "$key has no glyph after the ';'"; icon_bad=1; continue
        fi
        if [[ "$glyph" == \"* ]]; then
            fail "$key glyph is quoted — polybar renders the quotes literally"; icon_bad=1; continue
        fi
        cp=$(printf '%s' "${glyph:0:1}" | python3 -c 'import sys;print(f"{ord(sys.stdin.read(1)):x}")' 2>/dev/null)
        if [[ -n "$cp" ]] && ! fc-list ":charset=$cp" family 2>/dev/null | grep -qi nerd; then
            fail "$key glyph U+${cp^^} is not in any installed Nerd Font"; icon_bad=1
        fi
    done < <(grep -E '^ws-icon-[0-9]+ = ' polybar/modules/i3.ini)
    (( icon_bad )) || pass "all ws-icon glyphs present, unquoted, and in the font"
else
    skip "fc-list unavailable — cannot verify ws-icon glyphs"
fi

# --- i3 workspace names must match polybar's ws-icon map ---
ws=$(grep -oE '^set \$ws[0-9]+\s+"[0-9]+:[a-z]+"' i3/config | grep -oE ':[a-z]+"' | tr -d ':"' | sort -u)
icons=$(grep -oE '^ws-icon-[0-9]+ = [a-z]+;' polybar/modules/i3.ini | sed 's/.*= //; s/;//' | sort -u)
if diff <(printf '%s\n' "$ws") <(printf '%s\n' "$icons") >/dev/null; then
    pass "i3 workspace names match polybar ws-icon map"
else
    fail "i3 workspace names and polybar ws-icon map have drifted:"
    diff <(printf '%s\n' "$ws") <(printf '%s\n' "$icons") | sed 's/^/        /'
fi

# ===========================================================================
printf '\n%s%s==>%s %s%d passed, %d failed, %d skipped%s\n' \
    "$B" "$BLUE" "$R" "$B" "$PASS" "$FAIL" "$SKIP" "$R"
(( FAIL == 0 ))
