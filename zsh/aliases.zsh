# ~/.config/zsh/aliases.zsh — sourced by .zshrc

# ---------------------------------------------------------------------------
# listing — eza if present, coreutils otherwise
# ---------------------------------------------------------------------------
if command -v eza >/dev/null; then
    alias ls='eza --group-directories-first --icons=auto'
    alias ll='eza -l --group-directories-first --icons=auto --git --time-style=long-iso'
    alias la='eza -la --group-directories-first --icons=auto --git --time-style=long-iso'
    alias lt='eza --tree --level=2 --icons=auto --group-directories-first'
    alias ltt='eza --tree --level=3 --icons=auto --group-directories-first'
else
    alias ls='ls --color=auto --group-directories-first'
    alias ll='ls -lh --color=auto --group-directories-first'
    alias la='ls -lah --color=auto --group-directories-first'
    alias lt='ls -R'
fi

# ---------------------------------------------------------------------------
# safety — these have saved me more than once
# ---------------------------------------------------------------------------
alias rm='rm -I --preserve-root'     # prompt once when removing >3 files
alias mv='mv -i'
alias cp='cp -i'
alias ln='ln -i'
alias chown='chown --preserve-root'
alias chmod='chmod --preserve-root'
alias mkdir='mkdir -pv'

# ---------------------------------------------------------------------------
# navigation
# ---------------------------------------------------------------------------
alias ..='cd ..'
alias ...='cd ../..'
alias ....='cd ../../..'
alias -- -='cd -'
alias d='dirs -v'

# ---------------------------------------------------------------------------
# modern replacements, guarded so the alias only exists if the tool does
# ---------------------------------------------------------------------------
command -v bat  >/dev/null && alias cat='bat --style=plain --paging=never' && alias less='bat --paging=always'
command -v rg   >/dev/null && alias grep='rg'
command -v fd   >/dev/null && alias find='fd'
command -v duf  >/dev/null && alias df='duf'
command -v dust >/dev/null && alias du='dust'
command -v btop >/dev/null && alias top='btop'
command -v nvim >/dev/null && alias vim='nvim' && alias vi='nvim'

# ---------------------------------------------------------------------------
# git
# ---------------------------------------------------------------------------
alias g='git'
alias gs='git status --short --branch'
alias ga='git add'
alias gaa='git add --all'
alias gc='git commit'
alias gcm='git commit -m'
alias gca='git commit --amend'
alias gco='git checkout'
alias gcb='git checkout -b'
alias gb='git branch'
alias gd='git diff'
alias gds='git diff --staged'
alias gp='git push'
alias gpl='git pull'
alias gf='git fetch --all --prune'
alias gl='git log --oneline --graph --decorate -20'
alias gll='git log --graph --pretty=format:"%C(yellow)%h%Creset %C(blue)%an%Creset %C(green)(%ar)%Creset%n  %s%n"'
alias gst='git stash'
alias gstp='git stash pop'
alias gr='git restore'
alias grs='git restore --staged'

# ---------------------------------------------------------------------------
# pacman / AUR  (Manjaro)
# ---------------------------------------------------------------------------
alias psi='sudo pacman -S'                 # install
alias psy='sudo pacman -Syu'               # full system upgrade
alias psr='sudo pacman -Rns'               # remove with deps and config
alias pss='pacman -Ss'                     # search repos
alias psq='pacman -Qs'                     # search installed
alias psi-info='pacman -Si'
alias porphans='pacman -Qtdq'              # orphaned packages
alias pclean='sudo pacman -Rns $(pacman -Qtdq) 2>/dev/null || echo "no orphans"'
alias pcache='sudo paccache -rk2'          # keep 2 old versions in the cache
command -v yay  >/dev/null && alias y='yay' && alias yss='yay -Ss' && alias ysi='yay -S'
command -v pamac >/dev/null && alias pmu='pamac checkupdates -a'

# ---------------------------------------------------------------------------
# i3 / desktop
# ---------------------------------------------------------------------------
alias i3conf='$EDITOR ~/.config/i3/config'
alias i3reload='i3-msg reload && notify-send "i3" "config reloaded"'
alias i3restart='i3-msg restart'
alias barconf='$EDITOR ~/.config/polybar/config.ini'
alias barreload='~/.config/polybar/launch.sh'
alias zshconf='$EDITOR ~/.zshrc'
alias wezconf='$EDITOR ~/.config/wezterm/wezterm.lua'
alias tmuxconf='$EDITOR ~/.config/tmux/tmux.conf'
alias xres='xrdb -merge ~/.Xresources && echo "Xresources reloaded"'

# ---------------------------------------------------------------------------
# tmux
# ---------------------------------------------------------------------------
alias t='tmux'
alias ta='tmux attach -t'
alias tls='tmux list-sessions'
alias tn='tmux new-session -s'
alias tk='tmux kill-session -t'

# ---------------------------------------------------------------------------
# system
# ---------------------------------------------------------------------------
alias jctl='journalctl -p 3 -xb'                    # this boot's errors only
alias syslog='journalctl -f'
alias ports='ss -tulpn'
alias myip='curl -s ifconfig.me && echo'
alias battery='cat /sys/class/power_supply/BAT0/capacity'
alias temps='sensors 2>/dev/null || echo "install lm_sensors"'
alias reboot-check='checkupdates | grep -qE "^(linux|systemd) " && echo "reboot recommended" || echo "no reboot needed"'

# Human-readable by default.
alias free='free -h'
alias dfh='df -h -x tmpfs -x devtmpfs'
alias psg='ps aux | grep -v grep | grep -i'

# ---------------------------------------------------------------------------
# misc
# ---------------------------------------------------------------------------
alias c='clear'
alias h='history'
alias path='echo -e ${PATH//:/\\n}'
alias now='date +"%Y-%m-%d %H:%M:%S"'
alias week='date +%V'
alias reload='exec zsh'
