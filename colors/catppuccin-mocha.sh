#!/usr/bin/env bash
# Catppuccin Mocha — single source of truth for this dotfiles repo.
# Values match catppuccin/catppuccin upstream exactly.
# Sourced by polybar/launch.sh and the scripts in bin/ so every surface agrees.

# --- backgrounds ---------------------------------------------------------
export CM_BG="#1e1e2e"          # main background (Base)
export CM_BG_DARK="#181825"     # bar / sidebar background (Mantle)
export CM_BG_HIGHLIGHT="#313244" # hovered row, inactive tab (Surface0)
export CM_BLACK="#45475a"       # terminal color0 (Surface1)
export CM_SELECTION="#585b70"   # Surface2

# --- foregrounds ---------------------------------------------------------
export CM_FG="#cdd6f4"          # main foreground (Text)
export CM_FG_DARK="#bac2de"     # terminal color7 (Subtext1)
export CM_FG_GUTTER="#45475a"   # Surface1
export CM_COMMENT="#6c7086"     # dimmed / disabled text (Overlay0)
export CM_DARK3="#7f849c"       # Overlay1
export CM_DARK5="#9399b2"       # Overlay2

# --- accents -------------------------------------------------------------
export CM_RED="#f38ba8"
export CM_RED1="#eba0ac"        # urgent / critical (Maroon)
export CM_ORANGE="#fab387"      # Peach
export CM_YELLOW="#f9e2af"
export CM_GREEN="#a6e3a1"
export CM_GREEN1="#94e2d5"      # Teal
export CM_GREEN2="#74c7ec"      # Sapphire
export CM_TEAL="#94e2d5"
export CM_CYAN="#89dceb"        # Sky
export CM_BLUE="#89b4fa"        # primary accent — focused window, active workspace
export CM_BLUE0="#74c7ec"       # Sapphire
export CM_BLUE1="#89dceb"       # Sky
export CM_BLUE5="#89dceb"       # Sky
export CM_BLUE7="#45475a"       # Surface1
export CM_MAGENTA="#cba6f7"     # Mauve
export CM_PURPLE="#b4befe"      # Lavender

# --- bright terminal variants (color8-15) --------------------------------
export CM_BR_BLACK="#585b70"    # Surface2
export CM_BR_RED="#f38ba8"
export CM_BR_GREEN="#a6e3a1"
export CM_BR_YELLOW="#f9e2af"
export CM_BR_BLUE="#89b4fa"
export CM_BR_MAGENTA="#f5c2e7"  # Pink
export CM_BR_CYAN="#94e2d5"     # Teal
export CM_BR_WHITE="#cdd6f4"

# --- semantic roles (use these in modules, not raw names) ----------------
export ACCENT="$CM_BLUE"
export ACCENT_ALT="$CM_MAGENTA"
export OK="$CM_GREEN"
export WARN="$CM_YELLOW"
export CRIT="$CM_RED"
export MUTED="$CM_COMMENT"
