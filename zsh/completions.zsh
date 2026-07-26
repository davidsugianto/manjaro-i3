# ~/.config/zsh/completions.zsh — completions for the cloud/DevOps toolchain
#
# Sourced AFTER compinit (see .zshrc section 8), because it uses `compdef`,
# which compinit defines. The matching `fpath` line lives in .zshrc section 4
# and must stay BEFORE compinit — compinit scans fpath exactly once, so a
# directory added later stays invisible until the next shell.
#
# How this works:
#   Most Go-based tools (kubectl, helm, gh, …) print a completion script with
#   `<tool> completion zsh`. Running ~15 of those on every shell start costs
#   300ms+, so instead we cache each one to a file and regenerate only when the
#   binary is newer than its cache. Startup then costs nothing — compinit just
#   reads the directory.
#
# Rebuild by hand any time with:  gen-completions

ZSH_COMPDIR="${XDG_CACHE_HOME:-$HOME/.cache}/zsh/completions"
[[ -d "$ZSH_COMPDIR" ]] || command mkdir -p "$ZSH_COMPDIR"
fpath=("$ZSH_COMPDIR" $fpath)

# ---------------------------------------------------------------------------
# generator
# ---------------------------------------------------------------------------

# _gen_completion <tool> <_target-file> [subcommand...]
# Writes only when the tool is newer than the cached file (or it's missing).
_gen_completion() {
    local tool="$1" out="$ZSH_COMPDIR/$2"; shift 2
    command -v "$tool" >/dev/null || return 0

    local bin; bin=$(command -v "$tool")
    # -nt is false when the target doesn't exist, so check that separately.
    if [[ -s "$out" && ! "$bin" -nt "$out" ]]; then
        return 0
    fi

    # Write to a temp file first: a tool that errors halfway would otherwise
    # leave a truncated completion file that breaks the shell on next start.
    local tmp="$out.tmp.$$"
    if "$tool" "$@" >"$tmp" 2>/dev/null && [[ -s "$tmp" ]]; then
        mv -f "$tmp" "$out"
        [[ -n "${_GEN_VERBOSE:-}" ]] && print -r -- "  generated ${out:t} ($tool)"
    else
        rm -f "$tmp"
        [[ -n "${_GEN_VERBOSE:-}" ]] && print -r -- "  skipped ${out:t} ($tool produced nothing)"
    fi
}

# Writes the completion files only. Kept separate from gen-completions so the
# first-run background job can populate the cache without also rebuilding the
# compinit dump, which the foreground shell is using at that exact moment.
_gen_completion_files() {
    command mkdir -p "$ZSH_COMPDIR"

    # --- Kubernetes ---
    _gen_completion kubectl   _kubectl   completion zsh
    _gen_completion helm      _helm      completion zsh
    _gen_completion k9s       _k9s       completion zsh
    _gen_completion kustomize _kustomize completion zsh
    _gen_completion kind      _kind      completion zsh
    _gen_completion minikube  _minikube  completion zsh
    _gen_completion stern     _stern     --completion=zsh
    _gen_completion argocd    _argocd    completion zsh
    _gen_completion kubeseal  _kubeseal  completion zsh
    _gen_completion flux      _flux      completion zsh
    _gen_completion kubectx   _kubectx   completion zsh
    _gen_completion kubens    _kubens    completion zsh

    # --- IaC ---
    # NOTE: vault/packer/consul/nomad are deliberately absent. They do not emit
    # a completion script; `vault -autocomplete-install` *edits your shell rc
    # files* as a side effect. They use the bash-style `complete -C` protocol
    # instead, handled further down.
    _gen_completion trivy     _trivy     completion zsh
    _gen_completion sops      _sops      completion zsh

    # --- cloud ---
    _gen_completion az        _az        completion zsh

    # --- dev / git ---
    _gen_completion gh        _gh        completion -s zsh
    _gen_completion glab      _glab      completion -s zsh
    _gen_completion docker    _docker    completion zsh
    _gen_completion podman    _podman    completion zsh
    _gen_completion k6        _k6        completion zsh
    _gen_completion infracost _infracost completion --shell zsh
}

gen-completions() {
    local _GEN_VERBOSE=1
    print -r -- "regenerating zsh completions in $ZSH_COMPDIR"
    _gen_completion_files

    # Rebuild the compinit dump so the new files are seen immediately, rather
    # than only in the next shell.
    local dump="${XDG_CACHE_HOME:-$HOME/.cache}/zsh/zcompdump-$ZSH_VERSION"
    rm -f "$dump" "$dump.zwc"
    autoload -Uz compinit && compinit -d "$dump"
    print -r -- "done — completions active in this shell"
}

# First run on a fresh machine: build the cache in the background so the
# initial shell isn't blocked for a second or two.
if [[ ! -e "$ZSH_COMPDIR/.initialised" ]]; then
    ( _gen_completion_files >/dev/null 2>&1; touch "$ZSH_COMPDIR/.initialised" ) &!
fi

# ---------------------------------------------------------------------------
# tools that use bash-style dynamic completion
#
# terraform, terragrunt and aws don't emit a zsh script — they expect the shell
# to call the binary itself for candidates. bashcompinit provides the `complete`
# builtin that makes this work under zsh.
# ---------------------------------------------------------------------------

autoload -Uz bashcompinit && bashcompinit

if command -v terraform >/dev/null; then
    complete -o nospace -C "$(command -v terraform)" terraform
    # tofu is a drop-in fork and answers the same completion protocol.
    command -v tofu >/dev/null && complete -o nospace -C "$(command -v tofu)" tofu
fi

command -v terragrunt >/dev/null && complete -o nospace -C "$(command -v terragrunt)" terragrunt

# The other HashiCorp tools answer the same protocol as terraform.
for _hc in vault packer consul nomad; do
    command -v "$_hc" >/dev/null && complete -o nospace -C "$(command -v "$_hc")" "$_hc"
done
unset _hc

# aws-cli ships a separate completer binary rather than completing itself.
if command -v aws_completer >/dev/null; then
    complete -C "$(command -v aws_completer)" aws
fi

# ---------------------------------------------------------------------------
# tool environment
# ---------------------------------------------------------------------------

# GVM (Go Version Manager — https://gvm.sh). Installed to ~/bin/gvm by
# development-tools.sh with GVM_NO_MODIFY=1, so this is the only place the
# shell integration lives; the installer does not touch .zshrc.
if [[ -x "$HOME/bin/gvm" ]]; then
    eval "$("$HOME/bin/gvm" env 2>/dev/null)"
fi

# Go: put module binaries on PATH wherever GOPATH ends up pointing.
if command -v go >/dev/null; then
    export GOPATH="${GOPATH:-$HOME/go}"
    [[ ":$PATH:" == *":$GOPATH/bin:"* ]] || export PATH="$GOPATH/bin:$PATH"
fi

# direnv — per-directory env, the usual way to keep AWS_PROFILE and
# KUBECONFIG scoped to a project instead of leaking across every shell.
command -v direnv >/dev/null && eval "$(direnv hook zsh)"

# pyenv
if command -v pyenv >/dev/null; then
    export PYENV_ROOT="${PYENV_ROOT:-$HOME/.pyenv}"
    eval "$(pyenv init -)"
fi

# krew (kubectl plugin manager), if you install it later.
[[ -d "$HOME/.krew/bin" ]] && export PATH="$HOME/.krew/bin:$PATH"

# ---------------------------------------------------------------------------
# aliases & helpers for the toolchain
# ---------------------------------------------------------------------------

# kubectl is typed hundreds of times a day; k is the near-universal alias.
if command -v kubectl >/dev/null; then
    alias k='kubectl'
    # Make the alias inherit kubectl's completion instead of having none.
    compdef k=kubectl 2>/dev/null

    alias kg='kubectl get'
    alias kd='kubectl describe'
    alias kl='kubectl logs'
    alias kx='kubectx'
    alias kn='kubens'
    alias kaf='kubectl apply -f'
    alias kdel='kubectl delete'
    alias kgp='kubectl get pods'
    alias kgs='kubectl get svc'
    alias kgn='kubectl get nodes'
    alias kga='kubectl get all --all-namespaces'
    # Current context/namespace at a glance.
    alias kctx='kubectl config current-context'
    alias kns='kubectl config view --minify -o jsonpath="{..namespace}"; echo'
fi

if command -v terraform >/dev/null; then
    alias tf='terraform'
    alias tfi='terraform init'
    alias tfp='terraform plan'
    alias tfa='terraform apply'
    alias tfd='terraform destroy'
    alias tff='terraform fmt -recursive'
    alias tfv='terraform validate'
    compdef tf=terraform 2>/dev/null
fi

if command -v terragrunt >/dev/null; then
    alias tg='terragrunt'
    alias tgp='terragrunt run-all plan'
    alias tga='terragrunt run-all apply'
fi

if command -v docker >/dev/null; then
    alias d='docker'
    alias dc='docker compose'
    alias dps='docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"'
    alias dimg='docker images'
    alias dexec='docker exec -it'
    alias dlog='docker logs -f'
    # Reclaim disk without touching named volumes.
    alias dprune='docker system prune -af'
    compdef d=docker 2>/dev/null
fi

command -v ansible >/dev/null && {
    alias ap='ansible-playbook'
    alias ag='ansible-galaxy'
    alias av='ansible-vault'
}

command -v lazygit >/dev/null  && alias lg='lazygit'
command -v lazydocker >/dev/null && alias lzd='lazydocker'
