#!/usr/bin/env bash
# Restart dunst so config changes take effect on i3 reload.
#
# dunst is D-Bus activated: killing it is enough, since the next notification
# respawns it with the new config. We start it explicitly anyway so that
# `dunstctl` works immediately after a reload.
set -euo pipefail

pkill -x dunst 2>/dev/null || true

for _ in $(seq 20); do
    pgrep -x dunst >/dev/null || break
    sleep 0.05
done

exec dunst
