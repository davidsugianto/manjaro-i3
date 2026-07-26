# Palette

Everything in this repo is themed from one palette so the desktop reads as a
single system rather than eight programs that happen to be dark.

**Primary: TokyoNight (Night)** — the values in `tokyonight.sh` are copied from
[folke/tokyonight.nvim](https://github.com/folke/tokyonight.nvim) upstream, so
they match Neovim, WezTerm, and anything else you theme with TokyoNight later.

**Backups:** Dracula and Gruvbox Dark ship as drop-in alternates for the two
places where a second scheme is genuinely useful:

| Surface | TokyoNight | Dracula | Gruvbox |
| --- | --- | --- | --- |
| rofi | `rofi/themes/tokyonight.rasi` | `rofi/themes/dracula.rasi` | `rofi/themes/gruvbox.rasi` |
| wezterm | `TokyoNight` | `Dracula` | `GruvboxDark` |
| kitty | `kitty/themes/tokyonight.conf` | `kitty/themes/dracula.conf` | `kitty/themes/gruvbox.conf` |

Switch rofi by editing the `@theme` line in `rofi/config.rasi`; switch WezTerm
by editing `THEME` at the top of `wezterm/wezterm.lua`. See `bin/theme-switch`
for doing both at once.

## Semantic roles

Modules should reference the role, not the hue — that way re-theming means
editing one file:

| Role | Colour | Used for |
| --- | --- | --- |
| `ACCENT` | `#7aa2f7` blue | focused window border, active workspace, prompt |
| `ACCENT_ALT` | `#bb9af7` magenta | music module, secondary highlights |
| `OK` | `#9ece6a` green | charging, connected, low CPU |
| `WARN` | `#e0af68` yellow | battery low, high load |
| `CRIT` | `#f7768e` red | urgent window, battery critical, errors |
| `MUTED` | `#565f89` comment | inactive workspaces, separators, disabled text |
