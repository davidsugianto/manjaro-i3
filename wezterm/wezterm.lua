-- ~/.config/wezterm/wezterm.lua
--
-- Targets WezTerm 20240203-110809 (the version in the Manjaro repos). Options
-- added in later nightlies are deliberately avoided so this doesn't break on
-- the packaged build — if you upgrade to a newer release everything here
-- still applies.
--
-- Theme lives in ONE place: change THEME below to "CatppuccinMocha",
-- "TokyoNight", "Dracula" or "GruvboxDark".

local wezterm = require("wezterm")
local act = wezterm.action

local config = wezterm.config_builder()

local THEME = "CatppuccinMocha"

-- ---------------------------------------------------------------------------
-- colours
--
-- Defined explicitly rather than using a built-in scheme, so the terminal
-- matches polybar/rofi/dunst exactly. Values are upstream
-- catppuccin/catppuccin (Mocha) and folke/tokyonight.nvim.
-- ---------------------------------------------------------------------------

config.color_schemes = {
	["CatppuccinMocha"] = {
		foreground = "#cdd6f4",
		background = "#1e1e2e",
		cursor_bg = "#f5e0dc",
		cursor_fg = "#1e1e2e",
		cursor_border = "#f5e0dc",
		selection_fg = "#cdd6f4",
		selection_bg = "#585b70",
		scrollbar_thumb = "#313244",
		split = "#89b4fa",
		ansi = { "#45475a", "#f38ba8", "#a6e3a1", "#f9e2af", "#89b4fa", "#f5c2e7", "#94e2d5", "#bac2de" },
		brights = { "#585b70", "#f38ba8", "#a6e3a1", "#f9e2af", "#89b4fa", "#cba6f7", "#94e2d5", "#a6adc8" },
		indexed = { [16] = "#fab387", [17] = "#eba0ac" },
		tab_bar = {
			background = "#181825",
			active_tab = { bg_color = "#89b4fa", fg_color = "#181825", intensity = "Bold" },
			inactive_tab = { bg_color = "#313244", fg_color = "#7f849c" },
			inactive_tab_hover = { bg_color = "#585b70", fg_color = "#cdd6f4" },
			new_tab = { bg_color = "#181825", fg_color = "#7f849c" },
			new_tab_hover = { bg_color = "#585b70", fg_color = "#cdd6f4" },
		},
	},

	["TokyoNight"] = {
		foreground = "#c0caf5",
		background = "#1a1b26",
		cursor_bg = "#c0caf5",
		cursor_fg = "#1a1b26",
		cursor_border = "#c0caf5",
		selection_fg = "#c0caf5",
		selection_bg = "#283457",
		scrollbar_thumb = "#292e42",
		split = "#7aa2f7",
		ansi = { "#15161e", "#f7768e", "#9ece6a", "#e0af68", "#7aa2f7", "#bb9af7", "#7dcfff", "#a9b1d6" },
		brights = { "#414868", "#ff899d", "#9fe044", "#faba4a", "#8db0ff", "#c7a9ff", "#a4daff", "#c0caf5" },
		indexed = { [16] = "#ff9e64", [17] = "#db4b4b" },
		tab_bar = {
			background = "#16161e",
			active_tab = { bg_color = "#7aa2f7", fg_color = "#16161e", intensity = "Bold" },
			inactive_tab = { bg_color = "#292e42", fg_color = "#545c7e" },
			inactive_tab_hover = { bg_color = "#283457", fg_color = "#c0caf5" },
			new_tab = { bg_color = "#16161e", fg_color = "#545c7e" },
			new_tab_hover = { bg_color = "#283457", fg_color = "#c0caf5" },
		},
	},

	["Dracula"] = {
		foreground = "#f8f8f2",
		background = "#282a36",
		cursor_bg = "#f8f8f2",
		cursor_fg = "#282a36",
		cursor_border = "#f8f8f2",
		selection_fg = "#f8f8f2",
		selection_bg = "#44475a",
		scrollbar_thumb = "#44475a",
		split = "#bd93f9",
		ansi = { "#21222c", "#ff5555", "#50fa7b", "#f1fa8c", "#bd93f9", "#ff79c6", "#8be9fd", "#f8f8f2" },
		brights = { "#6272a4", "#ff6e6e", "#69ff94", "#ffffa5", "#d6acff", "#ff92df", "#a4ffff", "#ffffff" },
		tab_bar = {
			background = "#21222c",
			active_tab = { bg_color = "#bd93f9", fg_color = "#21222c", intensity = "Bold" },
			inactive_tab = { bg_color = "#44475a", fg_color = "#6272a4" },
			inactive_tab_hover = { bg_color = "#44475a", fg_color = "#f8f8f2" },
			new_tab = { bg_color = "#21222c", fg_color = "#6272a4" },
			new_tab_hover = { bg_color = "#44475a", fg_color = "#f8f8f2" },
		},
	},

	["GruvboxDark"] = {
		foreground = "#ebdbb2",
		background = "#282828",
		cursor_bg = "#ebdbb2",
		cursor_fg = "#282828",
		cursor_border = "#ebdbb2",
		selection_fg = "#ebdbb2",
		selection_bg = "#3c3836",
		scrollbar_thumb = "#3c3836",
		split = "#83a598",
		ansi = { "#282828", "#cc241d", "#98971a", "#d79921", "#458588", "#b16286", "#689d6a", "#a89984" },
		brights = { "#928374", "#fb4934", "#b8bb26", "#fabd2f", "#83a598", "#d3869b", "#8ec07c", "#ebdbb2" },
		tab_bar = {
			background = "#1d2021",
			active_tab = { bg_color = "#83a598", fg_color = "#1d2021", intensity = "Bold" },
			inactive_tab = { bg_color = "#3c3836", fg_color = "#928374" },
			inactive_tab_hover = { bg_color = "#3c3836", fg_color = "#ebdbb2" },
			new_tab = { bg_color = "#1d2021", fg_color = "#928374" },
			new_tab_hover = { bg_color = "#3c3836", fg_color = "#ebdbb2" },
		},
	},
}

config.color_scheme = THEME

-- ---------------------------------------------------------------------------
-- font
-- ---------------------------------------------------------------------------

config.font = wezterm.font_with_fallback({
	{ family = "JetBrainsMono Nerd Font", weight = "Medium" },
	{ family = "Symbols Nerd Font Mono", scale = 0.9 },
	{ family = "Noto Color Emoji" },
})
config.font_size = 10.5
config.line_height = 1.05
config.cell_width = 1.0

-- Ligatures are nice in prose-y code but make it harder to read == vs === at
-- a glance. calt/clig off keeps them disabled; drop this line to turn them on.
config.harfbuzz_features = { "calt=0", "clig=0", "liga=0" }

config.font_rules = {
	-- Victor Mono's italic is properly cursive (JetBrains Mono's is just a
	-- slant) — used for the italic faces only, so comments/keywords/loops
	-- stand out instead of the whole buffer looking hand-written.
	{ intensity = "Normal", italic = true,
	  font = wezterm.font({ family = "VictorMono Nerd Font", weight = "Medium", style = "Italic" }) },
	{ intensity = "Bold", italic = true,
	  font = wezterm.font({ family = "VictorMono Nerd Font", weight = "Bold", style = "Italic" }) },
	{ intensity = "Bold", italic = false,
	  font = wezterm.font({ family = "JetBrainsMono Nerd Font", weight = "Bold" }) },
}

-- ---------------------------------------------------------------------------
-- window
-- ---------------------------------------------------------------------------

-- No titlebar: i3 draws the border and polybar shows the title. RESIZE keeps
-- the drag-to-resize edges, which floating windows still want.
config.window_decorations = "RESIZE"

config.window_padding = { left = 10, right = 10, top = 8, bottom = 6 }

-- Slight transparency. picom blurs behind it (see picom.conf), which keeps
-- text readable in a way plain transparency doesn't.
config.window_background_opacity = 0.94
config.text_background_opacity = 1.0

config.initial_cols = 110
config.initial_rows = 30

config.window_close_confirmation = "NeverPrompt"
config.exit_behavior = "Close"
config.audible_bell = "Disabled"

-- Visual bell instead — a brief flash of the cursor colour.
config.visual_bell = {
	fade_in_function = "EaseIn",
	fade_in_duration_ms = 75,
	fade_out_function = "EaseOut",
	fade_out_duration_ms = 75,
}
config.colors = { visual_bell = "#313244" }

-- ---------------------------------------------------------------------------
-- tabs
--
-- Mostly redundant with tmux, so the bar only appears when you actually have
-- more than one tab open.
-- ---------------------------------------------------------------------------

config.enable_tab_bar = true
config.hide_tab_bar_if_only_one_tab = true
config.use_fancy_tab_bar = false
config.tab_bar_at_bottom = false
config.tab_max_width = 28
config.show_tab_index_in_tab_bar = true

-- ---------------------------------------------------------------------------
-- behaviour
-- ---------------------------------------------------------------------------

config.scrollback_lines = 10000
config.enable_scroll_bar = false
config.default_cursor_style = "SteadyBar"
config.cursor_blink_rate = 0

-- WebGpu is meaningfully smoother than the software renderer on Intel
-- graphics. If you ever see rendering artefacts, switch this to "Software".
config.front_end = "WebGpu"
config.max_fps = 60

config.check_for_updates = false

-- Manjaro's i3 sets TERM in a few places; be explicit so ncurses apps and
-- tmux agree on capabilities.
config.term = "xterm-256color"

config.default_prog = { "/usr/bin/zsh", "-l" }

-- Treat these as clickable in addition to the built-in URL matcher.
config.hyperlink_rules = wezterm.default_hyperlink_rules()

-- ---------------------------------------------------------------------------
-- keys
--
-- Kept deliberately thin: tmux owns splits and windows (prefix C-a), so
-- WezTerm only handles what tmux can't — font size, clipboard, and new OS
-- windows. Avoiding overlap is what stops the two fighting each other.
-- ---------------------------------------------------------------------------

config.keys = {
	{ key = "n", mods = "CTRL|SHIFT", action = act.SpawnWindow },
	{ key = "t", mods = "CTRL|SHIFT", action = act.SpawnTab("CurrentPaneDomain") },
	{ key = "w", mods = "CTRL|SHIFT", action = act.CloseCurrentTab({ confirm = false }) },

	{ key = "c", mods = "CTRL|SHIFT", action = act.CopyTo("Clipboard") },
	{ key = "v", mods = "CTRL|SHIFT", action = act.PasteFrom("Clipboard") },

	-- Font size. Ctrl+0 resets.
	{ key = "=", mods = "CTRL", action = act.IncreaseFontSize },
	{ key = "-", mods = "CTRL", action = act.DecreaseFontSize },
	{ key = "0", mods = "CTRL", action = act.ResetFontSize },

	-- Scrollback search and a quick jump to the last prompt.
	{ key = "f", mods = "CTRL|SHIFT", action = act.Search({ CaseInSensitiveString = "" }) },
	{ key = "x", mods = "CTRL|SHIFT", action = act.ActivateCopyMode },

	-- Open the scrollback in $EDITOR — genuinely useful for long build logs.
	{ key = "e", mods = "CTRL|SHIFT", action = act.EmitEvent("open-scrollback-in-editor") },
}

wezterm.on("open-scrollback-in-editor", function(window, pane)
	local text = pane:get_lines_as_text(config.scrollback_lines)
	local path = os.tmpname()
	local f = io.open(path, "w+")
	if not f then
		return
	end
	f:write(text)
	f:flush()
	f:close()

	window:perform_action(
		act.SpawnCommandInNewTab({ args = { os.getenv("EDITOR") or "nvim", path } }),
		pane
	)
end)

return config
