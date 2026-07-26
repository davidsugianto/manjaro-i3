# ~/.config/zsh/functions.zsh — sourced by .zshrc
#
# Things that need arguments or logic, so they can't be aliases.

# Make a directory and cd into it.
mkcd() {
    [[ $# -eq 1 ]] || { print -u2 "usage: mkcd <dir>"; return 1 }
    mkdir -p -- "$1" && cd -- "$1"
}

# Extract any archive without remembering the flags.
extract() {
    [[ -f "$1" ]] || { print -u2 "extract: '$1' is not a file"; return 1 }
    case "$1" in
        *.tar.bz2|*.tbz2) tar xjf   "$1" ;;
        *.tar.gz|*.tgz)   tar xzf   "$1" ;;
        *.tar.xz|*.txz)   tar xJf   "$1" ;;
        *.tar.zst)        tar --zstd -xf "$1" ;;
        *.tar)            tar xf    "$1" ;;
        *.bz2)            bunzip2   "$1" ;;
        *.gz)             gunzip    "$1" ;;
        *.xz)             unxz      "$1" ;;
        *.zip)            unzip     "$1" ;;
        *.rar)            unrar x   "$1" ;;
        *.7z)             7z x      "$1" ;;
        *.Z)              uncompress "$1" ;;
        *) print -u2 "extract: don't know how to handle '$1'"; return 1 ;;
    esac
}

# Compress a directory to .tar.zst (fast, and the Arch default these days).
pack() {
    [[ $# -ge 1 ]] || { print -u2 "usage: pack <dir> [more...]"; return 1 }
    local name="${1:A:t}"
    tar --zstd -cf "${name}.tar.zst" "$@" && print "created ${name}.tar.zst"
}

# Fuzzy-find a file and open it in $EDITOR.
fe() {
    local file
    file=$(fzf --query="${1:-}" --select-1 --exit-0 \
               --preview 'bat --color=always --style=numbers --line-range=:200 {}')
    [[ -n "$file" ]] && ${EDITOR:-nvim} -- "$file"
}

# Fuzzy-find a directory below the current one and cd into it.
fcd() {
    local dir
    dir=$(fd --type d --hidden --exclude .git 2>/dev/null | fzf --preview 'eza --tree --level=1 --icons=auto {}')
    [[ -n "$dir" ]] && cd -- "$dir"
}

# Fuzzy kill — pick a process from a list instead of hunting for its PID.
fkill() {
    local pid
    pid=$(ps -eo pid,ppid,%cpu,%mem,comm --sort=-%cpu | sed 1d \
          | fzf --multi --header='select process(es) to kill' | awk '{print $1}')
    [[ -n "$pid" ]] || return 0
    print "killing: $pid"
    kill -${1:-15} ${=pid}
}

# Which package owns this command?
owns() {
    [[ $# -eq 1 ]] || { print -u2 "usage: owns <command>"; return 1 }
    local target
    target=$(command -v "$1") || { print -u2 "owns: '$1' not found in PATH"; return 1 }
    pacman -Qo "$target"
}

# Show the biggest installed packages.
bigpkgs() {
    expac -H M '%m\t%n' | sort -rh | head -${1:-20}
}

# Start (or attach to) a tmux session named after the current directory.
# Running `tt` in a project directory is the whole workflow.
tt() {
    local name="${1:-${PWD:t}}"
    # tmux session names can't contain dots or colons.
    name="${name//[.:]/-}"
    if tmux has-session -t "=$name" 2>/dev/null; then
        if [[ -n "$TMUX" ]]; then
            tmux switch-client -t "=$name"
        else
            tmux attach -t "=$name"
        fi
    else
        tmux new-session -s "$name" -c "$PWD" ${TMUX:+-d}
        [[ -n "$TMUX" ]] && tmux switch-client -t "=$name"
    fi
}

# Serve the current directory over HTTP — handy for testing static pages.
serve() {
    local port="${1:-8000}"
    print "serving ${PWD} at http://localhost:${port}"
    python3 -m http.server "$port"
}

# Open an image in nsxiv/feh without thinking about which is installed.
img() {
    if command -v nsxiv >/dev/null; then nsxiv -b "${@:-.}"
    elif command -v sxiv >/dev/null; then sxiv -b "${@:-.}"
    else feh --scale-down --auto-zoom "${@:-.}"
    fi
}

# Backup a file in place with a timestamp before you edit it.
bak() {
    [[ -e "$1" ]] || { print -u2 "bak: '$1' does not exist"; return 1 }
    local dest="${1}.$(date +%Y%m%d-%H%M%S).bak"
    cp -a -- "$1" "$dest" && print "backed up to $dest"
}

# Human-readable weather.
weather() {
    curl -s "wttr.in/${1:-}?F&q&2"
}

# Reload the desktop after editing dotfiles.
desktop-reload() {
    i3-msg reload >/dev/null && print "i3 reloaded"
    ~/.config/polybar/launch.sh && print "polybar restarted"
    xrdb -merge ~/.Xresources && print "Xresources merged"
    notify-send -a dotfiles "Desktop" "Configuration reloaded"
}
