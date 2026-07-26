#!/usr/bin/env bash
# Restart picom cleanly. i3 runs this from exec_always, so it fires on every
# reload — without the kill you end up with a pile of compositors fighting
# over the screen.
set -euo pipefail

pkill -x picom 2>/dev/null || true

# Give the old instance a moment to release the composite overlay, otherwise
# the new one exits with "Another composite manager is already running".
for _ in $(seq 20); do
    pgrep -x picom >/dev/null || break
    sleep 0.05
done

exec picom --daemon --config "$HOME/.config/picom/picom.conf"
