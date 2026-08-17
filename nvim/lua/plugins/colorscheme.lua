-- Catppuccin Mocha — matches colors/catppuccin-mocha.sh, the single
-- source of truth this repo's polybar/rofi/wezterm/kitty/tmux themes are
-- generated from.
--
-- Italics widened beyond catppuccin's defaults (comments/conditionals only)
-- to keywords and loops too, rendered via VictorMono Nerd Font's cursive
-- italic face — see kitty.conf / wezterm.lua italic_font.
--
-- config() calls setup() and :colorscheme together, in that order, inside
-- one function. Relying on `opts` alone plus LazyVim's opts.colorscheme
-- string lets LazyVim apply the colorscheme before lazy.nvim has merged
-- these opts into setup(), so it silently bootstraps with catppuccin's
-- un-italicised defaults and never re-applies — comments render, but the
-- keywords/loops italics added here don't.
return {
  {
    "catppuccin/nvim",
    name = "catppuccin",
    lazy = false,
    priority = 1000,
    opts = {
      flavour = "mocha",
      styles = {
        comments = { "italic" },
        conditionals = { "italic" },
        keywords = { "italic" },
        loops = { "italic" },
      },
    },
    config = function(_, opts)
      require("catppuccin").setup(opts)
      vim.cmd.colorscheme("catppuccin")
    end,
  },
  {
    "LazyVim/LazyVim",
    opts = { colorscheme = "catppuccin" },
  },
}
