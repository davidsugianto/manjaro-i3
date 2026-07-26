# Blocked XDG autostart entries

These are *override* files. A `.desktop` file in `~/.config/autostart` with the
same name as one in `/etc/xdg/autostart` replaces it, and `Hidden=true` tells
any XDG-compliant launcher (here, `dex --autostart`) not to run it.

This is the correct way to suppress a system autostart entry — editing or
deleting the file in `/etc/xdg/autostart` needs root and gets reverted by the
next package update.

Each of these tray applets was replaced by a native polybar module, so that
every icon in the bar is a Nerd Font glyph rather than a full-colour GTK icon:

| Blocked | Replaced by |
| --- | --- |
| `nm-applet` | `[module/wlan]` + `rofi/scripts/wifi` |
| `blueman` | `[module/bluetooth]` + `blueman-manager` on click |
| `pamac-tray` | `[module/updates]` + `pamac-manager` on click |

To get one back, delete the corresponding file here and log out and in.
