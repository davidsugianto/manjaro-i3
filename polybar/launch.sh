#!/usr/bin/env bash
# Start polybar — one bar per connected monitor.
#
# i3 calls this from exec_always, so it runs on every reload. The shutdown
# order matters: ask the running bars to quit over IPC first and only reach
# for a signal if they ignore us, otherwise you get orphaned bars stacking up
# every time you press $mod+Shift+r.
set -uo pipefail

CONFIG="$HOME/.config/polybar/config.ini"

# --- stop whatever is already running --------------------------------------
if pgrep -x polybar >/dev/null; then
    polybar-msg cmd quit >/dev/null 2>&1 || true

    # Wait up to ~1s for a clean exit before escalating.
    for _ in $(seq 20); do
        pgrep -x polybar >/dev/null || break
        sleep 0.05
    done
    pkill -x polybar 2>/dev/null || true

    for _ in $(seq 20); do
        pgrep -x polybar >/dev/null || break
        sleep 0.05
    done
fi

# --- launch ----------------------------------------------------------------
mkdir -p "$HOME/.cache"
LOG="$HOME/.cache/polybar.log"
: > "$LOG"

if command -v xrandr >/dev/null; then
    # One bar per connected output. MONITOR is read by `monitor = ${env:MONITOR:}`
    # in config.ini.
    mapfile -t outputs < <(xrandr --query | awk '/ connected/{print $1}')
else
    outputs=()
fi

if [[ ${#outputs[@]} -eq 0 ]]; then
    # No xrandr, or a single-head setup polybar can figure out itself.
    polybar --reload main --config="$CONFIG" >>"$LOG" 2>&1 &
else
    for m in "${outputs[@]}"; do
        MONITOR="$m" polybar --reload main --config="$CONFIG" >>"$LOG" 2>&1 &
    done
fi

# Detach so i3's exec_always doesn't hold a handle on the bars.
disown -a 2>/dev/null || true
