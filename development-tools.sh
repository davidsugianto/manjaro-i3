#!/usr/bin/env bash
#
# development-tools.sh — cloud infrastructure / SRE / DevOps toolchain.
#
# Grouped and opt-in, because "install everything" is rarely what you want on
# a 1366x768 laptop and some of these are large. Run with no arguments to see
# the groups.
#
#   ./development-tools.sh --all              everything except AUR extras
#   ./development-tools.sh --go --k8s         just those groups
#   ./development-tools.sh --all --aur        include the AUR packages too
#   ./development-tools.sh --list             show what each group contains
#   ./development-tools.sh --dry-run --all    print, change nothing
#
# Almost everything here is in Manjaro's official repos — only five packages
# need the AUR, and those are kept in a separate group you have to ask for.
#
# Safe to re-run: already-installed packages are skipped, and every step is
# idempotent.

set -uo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

DRY_RUN=0
WANT_AUR=0
DO_DOCKER_GROUP=1

# NOT named GROUPS: that is a bash built-in array holding the current user's
# numeric group IDs, and assigning to it is silently ignored. Using it here
# meant the loop iterated over "1000 90 98 …" instead of the group names —
# which surfaced as a baffling "PKG[$g]: unbound variable".
SELECTED=()

# ---------------------------------------------------------------------------
# package groups
#
# Versions were checked against the repos at the time of writing; names are
# what matters and those are stable.
# ---------------------------------------------------------------------------

# One associative array rather than PKG_base / PKG_go / … variables. Indirect
# expansion (${!var}) looks tempting but bash 5.3 rejects it inside an array
# assignment under `set -u` with "unbound variable", even when the target is
# perfectly well set. An associative array sidesteps that entirely.
declare -A PKG DESC

# Go itself is NOT installed from the repos — GVM manages Go versions instead
# (see install_gvm). These are the editor/debug tools that sit alongside it.
PKG[base]="git git-lfs base-devel jq yq curl wget unzip openssh rsync"
PKG[go]="gopls delve"
PKG[containers]="docker docker-compose docker-buildx lazydocker dive"
PKG[iac]="terraform terragrunt opentofu tflint packer vault ansible ansible-lint pre-commit"
PKG[k8s]="kubectl helm k9s kubectx kustomize kind minikube stern kubeseal argocd sops age trivy"
PKG[cloud]="aws-cli-v2 azure-cli"
PKG[cli]="direnv lazygit github-cli glab pyenv python-pipx nodejs npm fzf ripgrep fd bat eza zoxide htop btop tree"
PKG[net]="mtr nmap tcpdump bind whois socat sshpass"
PKG[apps]="code"

DESC[base]="git, jq, yq, ssh, build tools"
DESC[go]="Go via GVM (gvm.sh) + gopls, delve"
DESC[containers]="docker, compose, buildx, lazydocker, dive"
DESC[iac]="terraform, terragrunt, opentofu, tflint, packer, vault, ansible"
DESC[k8s]="kubectl, helm, k9s, kubectx, kustomize, kind, minikube, stern, argocd, sops, trivy"
DESC[cloud]="aws-cli-v2, azure-cli"
DESC[cli]="direnv, lazygit, gh, glab, pyenv, node, fzf, ripgrep, bat, eza…"
DESC[net]="mtr, nmap, tcpdump, dig, whois, socat"
DESC[apps]="VS Code (OSS build from extra)"

# AUR — needs yay, builds from source, can be slow. Opt in with --aur.
AUR_pkgs="terraform-docs google-cloud-cli visual-studio-code-bin notion-app-electron k6 infracost kubecolor"
DESC[aur]="terraform-docs, gcloud, VS Code (MS build), Notion, k6, infracost, kubecolor"

ALL_GROUPS=(base go containers iac k8s cloud cli net apps)

# ---------------------------------------------------------------------------
# argument parsing
# ---------------------------------------------------------------------------

usage() {
    sed -n '3,22p' "$0" | sed 's/^# \{0,1\}//'
    echo
    echo "Groups:"
    for g in "${ALL_GROUPS[@]}" aur; do
        printf "  --%-12s %s\n" "$g" "${DESC[$g]}"
    done
    echo
    echo "Other flags:"
    echo "  --all            all groups above except aur"
    echo "  --aur            additionally install the AUR group (needs yay)"
    echo "  --no-docker-group  don't add \$USER to the docker group"
    echo "  --dry-run        print what would happen, change nothing"
    echo "  --list           show group contents and exit"
}

[[ $# -eq 0 ]] && { usage; exit 0; }

for arg in "$@"; do
    case "$arg" in
        --all)  SELECTED=("${ALL_GROUPS[@]}") ;;
        --aur)  WANT_AUR=1 ;;
        --base|--go|--containers|--iac|--k8s|--cloud|--cli|--net|--apps)
                SELECTED+=("${arg#--}") ;;
        --no-docker-group) DO_DOCKER_GROUP=0 ;;
        --dry-run) DRY_RUN=1 ;;
        --list)
            for g in "${ALL_GROUPS[@]}"; do
                printf "\n%s — %s\n  %s\n" "$g" "${DESC[$g]}" "${PKG[$g]}"
            done
            printf "\naur — %s\n  %s\n" "${DESC[aur]}" "$AUR_pkgs"
            exit 0 ;;
        -h|--help) usage; exit 0 ;;
        *) echo "unknown option: $arg" >&2; usage; exit 1 ;;
    esac
done

# ---------------------------------------------------------------------------
# output helpers
# ---------------------------------------------------------------------------

if [[ -t 1 ]]; then
    B=$'\033[1m'; BLUE=$'\033[34m'; GREEN=$'\033[32m'
    YELLOW=$'\033[33m'; RED=$'\033[31m'; R=$'\033[0m'
else
    B=""; BLUE=""; GREEN=""; YELLOW=""; RED=""; R=""
fi
section() { printf '\n%s%s==>%s %s%s%s\n' "$B" "$BLUE" "$R" "$B" "$1" "$R"; }
info()    { printf '    %s\n' "$1"; }
ok()      { printf '    %s✓%s %s\n' "$GREEN" "$R" "$1"; }
warn()    { printf '    %s!%s %s\n' "$YELLOW" "$R" "$1"; }
err()     { printf '    %s✗%s %s\n' "$RED" "$R" "$1" >&2; }
run()     { if (( DRY_RUN )); then printf '    %s[dry-run]%s %s\n' "$YELLOW" "$R" "$*"; else "$@"; fi; }

(( DRY_RUN )) && printf '%s*** DRY RUN — nothing will be changed ***%s\n' "$YELLOW" "$R"

[[ $EUID -eq 0 ]] && { err "Don't run this as root — it writes into \$HOME and uses sudo where needed."; exit 1; }

# ---------------------------------------------------------------------------
# package installation
# ---------------------------------------------------------------------------

# Collect everything first, install in ONE pacman transaction. Much faster than
# per-package calls, and pacman resolves the whole dependency set at once.
WANTED=()
for g in "${SELECTED[@]}"; do
    # Deliberately unquoted: the value is a space-separated package list that
    # we want split into separate array elements.
    # shellcheck disable=SC2206
    WANTED+=(${PKG[$g]})
done

install_repo_packages() {
    [[ ${#WANTED[@]} -eq 0 ]] && return 0
    section "Official repo packages"

    # Deduplicate (groups overlap on things like git).
    mapfile -t WANTED < <(printf '%s\n' "${WANTED[@]}" | sort -u)

    local missing=() unknown=()
    for p in "${WANTED[@]}"; do
        if pacman -Qq "$p" &>/dev/null; then continue; fi
        if pacman -Si "$p" &>/dev/null; then missing+=("$p"); else unknown+=("$p"); fi
    done

    if [[ ${#unknown[@]} -gt 0 ]]; then
        warn "not found in the repos (skipping): ${unknown[*]}"
    fi

    if [[ ${#missing[@]} -eq 0 ]]; then
        ok "all ${#WANTED[@]} packages already installed"
        return 0
    fi

    info "installing ${#missing[@]} of ${#WANTED[@]}:"
    printf '      %s\n' "${missing[@]}"
    run sudo pacman -S --needed --noconfirm "${missing[@]}" || {
        err "pacman failed — see output above"; return 1; }
    ok "repo packages installed"
}

install_aur_packages() {
    (( WANT_AUR )) || return 0
    section "AUR packages"

    if ! command -v yay >/dev/null; then
        warn "yay not installed — skipping the AUR group"
        info "install it with: sudo pacman -S yay"
        return 0
    fi

    local missing=()
    for p in $AUR_pkgs; do
        pacman -Qq "$p" &>/dev/null || missing+=("$p")
    done

    if [[ ${#missing[@]} -eq 0 ]]; then ok "all AUR packages already installed"; return 0; fi

    info "these build from source and can take a while:"
    printf '      %s\n' "${missing[@]}"
    # No --noconfirm: AUR builds legitimately ask things (provider choices,
    # PKGBUILD review) and silently answering "yes" to those is a bad habit.
    run yay -S --needed "${missing[@]}" || warn "yay reported an error — some AUR packages may be missing"
}

# ---------------------------------------------------------------------------
# Go — via GVM (https://gvm.sh, gitlab.com/devnw/gvm)
# ---------------------------------------------------------------------------

install_gvm() {
    section "Go (GVM)"

    if command -v gvm >/dev/null || [[ -x "$HOME/bin/gvm" ]]; then
        ok "gvm already installed ($HOME/bin/gvm)"
    else
        # gvm's installer needs jq; it's in the base group but this function
        # can run standalone via --go.
        if ! command -v jq >/dev/null; then
            run sudo pacman -S --needed --noconfirm jq || { err "jq is required by the gvm installer"; return 1; }
        fi

        info "downloading the installer from gvm.run"
        local script="/tmp/gvm-install.$$.sh"
        if ! curl -fsSL https://gvm.run/install.sh -o "$script"; then
            err "could not download the gvm installer"; return 1
        fi

        # Sanity-check what we're about to run rather than piping the network
        # straight into a shell.
        if ! head -1 "$script" | grep -q '^#!/usr/bin/env bash'; then
            err "downloaded gvm installer doesn't look like a bash script — refusing to run it"
            rm -f "$script"; return 1
        fi
        info "installer: $(wc -l < "$script") lines, saved at $script"

        # GVM_NO_MODIFY: this repo's .zshrc is a symlink, and we add the shell
        # integration ourselves in zsh/completions.zsh. Letting the installer
        # append to it would edit the repo file behind your back and duplicate
        # the snippet on every re-run.
        run env GVM_NO_MODIFY=1 bash "$script" || { err "gvm installation failed"; rm -f "$script"; return 1; }
        rm -f "$script"
        ok "gvm installed to $HOME/bin/gvm"
    fi

    info "shell integration is handled by zsh/completions.zsh (eval \"\$(gvm env)\")"

    if (( DRY_RUN )); then
        info "[dry-run] would run: gvm install latest && gvm use latest --default"
        return 0
    fi

    # Install a Go toolchain if there isn't one yet.
    export PATH="$HOME/bin:$PATH"
    if [[ -x "$HOME/bin/gvm" ]]; then
        if "$HOME/bin/gvm" list 2>/dev/null | grep -qE '[0-9]+\.[0-9]+'; then
            ok "a Go version is already managed by gvm"
            "$HOME/bin/gvm" list 2>/dev/null | sed 's/^/      /' | head -5
        else
            info "installing the latest Go toolchain (this downloads ~100MB)"
            "$HOME/bin/gvm" install latest && "$HOME/bin/gvm" use latest --default \
                && ok "Go installed and set as default" \
                || warn "gvm install failed — run '$HOME/bin/gvm install latest' by hand to see why"
        fi
    fi
}

# ---------------------------------------------------------------------------
# docker
# ---------------------------------------------------------------------------

setup_docker() {
    # In a dry run docker isn't installed yet (the pacman step didn't really
    # happen), so don't bail out — the user still wants to see what this would
    # do to their groups and services.
    if ! command -v docker >/dev/null && (( ! DRY_RUN )); then
        return 0
    fi
    section "Docker"

    if systemctl is-enabled docker.service &>/dev/null; then
        ok "docker.service already enabled"
    else
        run sudo systemctl enable --now docker.service && ok "docker.service enabled"
    fi

    if (( ! DO_DOCKER_GROUP )); then
        info "skipping docker group (--no-docker-group); use sudo docker, or run:"
        info "  sudo usermod -aG docker $USER"
        return 0
    fi

    if id -nG "$USER" | tr ' ' '\n' | grep -qx docker; then
        ok "$USER is already in the docker group"
    else
        # Worth being explicit: the docker group is effectively root. Anyone
        # who can talk to the socket can mount the host filesystem into a
        # container as root. That's the accepted trade-off for not typing
        # sudo, but it should be a decision, not a surprise.
        warn "adding $USER to the 'docker' group"
        warn "that group is root-equivalent — a member can trivially become root"
        warn "on this machine. Use --no-docker-group to skip and use sudo instead."
        run sudo usermod -aG docker "$USER" \
            && ok "added — log out and back in for it to take effect"
    fi
}

# ---------------------------------------------------------------------------
# main
# ---------------------------------------------------------------------------

section "Groups selected"
info "${SELECTED[*]:-none}$( (( WANT_AUR )) && echo " + aur")"

install_repo_packages

# Go is special-cased: the group installs gopls/delve from the repos, and the
# toolchain itself comes from gvm.
for g in "${SELECTED[@]}"; do
    [[ "$g" == "go" ]] && install_gvm && break
done

for g in "${SELECTED[@]}"; do
    [[ "$g" == "containers" ]] && setup_docker && break
done

install_aur_packages

# ---------------------------------------------------------------------------
# shell completions
# ---------------------------------------------------------------------------

section "Shell completions"
if [[ -r "$REPO/zsh/completions.zsh" ]]; then
    if (( DRY_RUN )); then
        info "[dry-run] would regenerate the zsh completion cache"
    else
        # The generator lives in the zsh config so it can also run on demand
        # from an interactive shell (`gen-completions`).
        zsh -ic 'gen-completions' 2>/dev/null \
            && ok "completion cache rebuilt in ~/.cache/zsh/completions" \
            || info "run 'gen-completions' in a new shell to build the cache"
    fi
else
    warn "zsh/completions.zsh not found — completions not configured"
fi

section "Done"
cat <<EOF

    Next steps:

      1. Open a new shell (or: exec zsh) to pick up PATH, gvm and completions.
      2. If docker was installed, log out and back in for the group to apply.
      3. Check what you got:  ./development-tools.sh --list

    Go is managed by gvm, not pacman:

      gvm list                 versions installed
      gvm install 1.25.0       install a specific version
      gvm use 1.25.0 --default set the default

EOF
