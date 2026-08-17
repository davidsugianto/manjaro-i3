# Palette

Everything in this repo is themed from one palette so the desktop reads as a
single system rather than eight programs that happen to be dark.

**Primary: Catppuccin Mocha** — the values in `catppuccin-mocha.sh` are copied
from [catppuccin/catppuccin](https://github.com/catppuccin/catppuccin)
upstream, so they match Neovim, WezTerm, and anything else you theme with
Catppuccin later.

**Backups:** TokyoNight, Dracula and Gruvbox Dark ship as drop-in alternates
for the surfaces where a second scheme is genuinely useful:

| Surface | Catppuccin Mocha | TokyoNight | Dracula | Gruvbox |
| --- | --- | --- | --- | --- |
| rofi | `rofi/themes/colors.rasi` | `rofi/themes/tokyonight.rasi` | `rofi/themes/dracula.rasi` | `rofi/themes/gruvbox.rasi` |
| wezterm | `CatppuccinMocha` | `TokyoNight` | `Dracula` | `GruvboxDark` |
| kitty | `kitty/themes/catppuccin-mocha.conf` | `kitty/themes/tokyonight.conf` | `kitty/themes/dracula.conf` | `kitty/themes/gruvbox.conf` |
| polybar | `polybar/themes/catppuccin-mocha.ini` | `polybar/themes/tokyo-night.ini` | `polybar/themes/dracula.ini` | `polybar/themes/gruvbox.ini` |

Switch rofi by editing the `@import` line in `rofi/config.rasi`; switch
WezTerm by editing `THEME` at the top of `wezterm/wezterm.lua`; switch kitty
by editing the `include` line in `kitty/kitty.conf`; switch polybar by editing
the `include-file` line in `polybar/config.ini`.

i3, dunst, xterm, tmux and the nvim colorscheme aren't switchable — they carry
one palette at a time, hand-edited in place. xterm and tmux keep the previous
palette's values as a comment block at the bottom for reference.

## Semantic roles

Modules should reference the role, not the hue — that way re-theming means
editing one file:

| Role | Colour | Used for |
| --- | --- | --- |
| `ACCENT` | `#89b4fa` blue | focused window border, active workspace, prompt |
| `ACCENT_ALT` | `#cba6f7` mauve | music module, secondary highlights |
| `OK` | `#a6e3a1` green | charging, connected, low CPU |
| `WARN` | `#f9e2af` yellow | battery low, high load |
| `CRIT` | `#f38ba8` red | urgent window, battery critical, errors |
| `MUTED` | `#6c7086` overlay0 | inactive workspaces, separators, disabled text |
