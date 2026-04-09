#!/usr/bin/env bash
# bootstrap-worktree.sh
#
# Brings a fresh git worktree up to a runnable state by syncing env files
# from the primary checkout and installing dependencies if needed.
#
# Usage: scripts/bootstrap-worktree.sh [--force-env]
#
#   --force-env   Overwrite existing env files (default: skip if present)

set -euo pipefail

FORCE_ENV=false
for arg in "$@"; do
  case "$arg" in
    --force-env) FORCE_ENV=true ;;
    *) echo "Unknown argument: $arg" >&2; exit 1 ;;
  esac
done

# ── Helpers ──────────────────────────────────────────────────────────────────

green()  { printf '\033[32m%s\033[0m\n' "$*"; }
yellow() { printf '\033[33m%s\033[0m\n' "$*"; }
red()    { printf '\033[31m%s\033[0m\n' "$*"; }

copy_env() {
  local src="$1" dst="$2"
  if [[ ! -f "$src" ]]; then
    yellow "  skip  $dst  (source not found in main checkout)"
    return
  fi
  if [[ -f "$dst" && "$FORCE_ENV" == false ]]; then
    green "  ok    $dst  (already present)"
    return
  fi
  cp "$src" "$dst"
  green "  copy  $dst"
}

# ── Locate repo root and main checkout ───────────────────────────────────────

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# First line of `git worktree list` is always the main checkout path.
main_checkout="$(git -C "$repo_root" worktree list --porcelain \
  | awk '/^worktree /{path=$2} /^branch /{if(!found){print path; found=1}}')"

if [[ -z "$main_checkout" ]]; then
  red "ERROR: Could not determine main checkout path from 'git worktree list'."
  exit 1
fi

if [[ "$main_checkout" == "$repo_root" ]]; then
  yellow "Already in the main checkout — nothing to bootstrap."
  exit 0
fi

echo "Main checkout : $main_checkout"
echo "This worktree : $repo_root"
echo ""

# ── Env files ────────────────────────────────────────────────────────────────

echo "Env files:"
copy_env "$main_checkout/.env"               "$repo_root/.env"
copy_env "$main_checkout/.env.local"         "$repo_root/.env.local"
copy_env "$main_checkout/apps/web/.env.local" "$repo_root/apps/web/.env.local"
echo ""

# ── Dependencies ─────────────────────────────────────────────────────────────

if [[ ! -d "$repo_root/node_modules" ]]; then
  echo "node_modules/ missing — running pnpm install..."
  pnpm install --dir "$repo_root"
  green "Dependencies installed."
else
  green "node_modules/ present — skipping install."
fi

echo ""
green "Worktree bootstrap complete."
