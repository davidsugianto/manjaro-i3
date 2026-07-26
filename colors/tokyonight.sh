#!/usr/bin/env bash
# TokyoNight (Night variant) — single source of truth for this dotfiles repo.
# Values match folke/tokyonight.nvim upstream exactly.
# Sourced by polybar/launch.sh and the scripts in bin/ so every surface agrees.

# --- backgrounds ---------------------------------------------------------
export TN_BG="#1a1b26"          # main background
export TN_BG_DARK="#16161e"     # bar / sidebar background
export TN_BG_HIGHLIGHT="#292e42" # hovered row, inactive tab
export TN_BLACK="#15161e"       # terminal color0
export TN_SELECTION="#283457"

# --- foregrounds ---------------------------------------------------------
export TN_FG="#c0caf5"          # main foreground
export TN_FG_DARK="#a9b1d6"     # terminal color7
export TN_FG_GUTTER="#3b4261"
export TN_COMMENT="#565f89"     # dimmed / disabled text
export TN_DARK3="#545c7e"
export TN_DARK5="#737aa2"

# --- accents -------------------------------------------------------------
export TN_RED="#f7768e"
export TN_RED1="#db4b4b"        # urgent / critical
export TN_ORANGE="#ff9e64"
export TN_YELLOW="#e0af68"
export TN_GREEN="#9ece6a"
export TN_GREEN1="#73daca"
export TN_GREEN2="#41a6b5"
export TN_TEAL="#1abc9c"
export TN_CYAN="#7dcfff"
export TN_BLUE="#7aa2f7"        # primary accent — focused window, active workspace
export TN_BLUE0="#3d59a1"
export TN_BLUE1="#2ac3de"
export TN_BLUE5="#89ddff"
export TN_BLUE7="#394b70"
export TN_MAGENTA="#bb9af7"
export TN_PURPLE="#9d7cd8"

# --- bright terminal variants (color8-15) --------------------------------
export TN_BR_BLACK="#414868"
export TN_BR_RED="#ff899d"
export TN_BR_GREEN="#9fe044"
export TN_BR_YELLOW="#faba4a"
export TN_BR_BLUE="#8db0ff"
export TN_BR_MAGENTA="#c7a9ff"
export TN_BR_CYAN="#a4daff"
export TN_BR_WHITE="#c0caf5"

# --- semantic roles (use these in modules, not raw names) ----------------
export ACCENT="$TN_BLUE"
export ACCENT_ALT="$TN_MAGENTA"
export OK="$TN_GREEN"
export WARN="$TN_YELLOW"
export CRIT="$TN_RED"
export MUTED="$TN_COMMENT"
