#!/usr/bin/env bash
# repair-github-origins.sh
#
# Repairs PR workspace repos whose Git origin was incorrectly set to
# https://api.github.com/<owner>/<repo>.git instead of
# https://github.com/<owner>/<repo>.git.
#
# Usage:
#   scripts/repair-github-origins.sh [--workspace-root PATH] [--verify-fetch] [--dry-run]
#
# Defaults:
#   --workspace-root  Uses $WORKSPACE_ROOT if set
#   --verify-fetch    After repairing origin, run `git fetch origin --prune`
#   --dry-run         Print intended changes without modifying repos

set -euo pipefail

WORKSPACE_ROOT="${WORKSPACE_ROOT:-}"
VERIFY_FETCH=false
DRY_RUN=false

green()  { printf '\033[32m%s\033[0m\n' "$*"; }
yellow() { printf '\033[33m%s\033[0m\n' "$*"; }
red()    { printf '\033[31m%s\033[0m\n' "$*"; }

usage() {
  cat <<'EOF'
Usage:
  scripts/repair-github-origins.sh [--workspace-root PATH] [--verify-fetch] [--dry-run]

Options:
  --workspace-root PATH  Root directory containing PR workspaces.
                         Defaults to $WORKSPACE_ROOT.
  --verify-fetch         Run `git fetch origin --prune` after each repair.
  --dry-run              Print intended changes without modifying repos.
  --help                 Show this help text.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --workspace-root)
      if [[ $# -lt 2 ]]; then
        red "ERROR: --workspace-root requires a value."
        exit 1
      fi
      WORKSPACE_ROOT="$2"
      shift 2
      ;;
    --verify-fetch)
      VERIFY_FETCH=true
      shift
      ;;
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    --help)
      usage
      exit 0
      ;;
    *)
      red "ERROR: Unknown argument: $1"
      usage
      exit 1
      ;;
  esac
done

if [[ -z "$WORKSPACE_ROOT" ]]; then
  red "ERROR: WORKSPACE_ROOT is not set. Pass --workspace-root or export WORKSPACE_ROOT."
  exit 1
fi

if [[ ! -d "$WORKSPACE_ROOT" ]]; then
  red "ERROR: Workspace root does not exist: $WORKSPACE_ROOT"
  exit 1
fi

repair_origin_url() {
  local origin_url="$1"
  if [[ "$origin_url" =~ ^https://api\.github\.com/(.+)$ ]]; then
    printf 'https://github.com/%s\n' "${BASH_REMATCH[1]}"
    return 0
  fi
  return 1
}

redact_url() {
  local url="$1"
  printf '%s\n' "$url" | sed -E 's#(https?://)[^/@]+@#\1<redacted>@#'
}

repo_count=0
repaired_count=0
skipped_count=0
failed_count=0

echo "Workspace root : $WORKSPACE_ROOT"
echo "Verify fetch   : $VERIFY_FETCH"
echo "Dry run        : $DRY_RUN"
echo ""

while IFS= read -r git_dir; do
  repo_path="$(dirname "$git_dir")"
  repo_count=$((repo_count + 1))

  if ! origin_url="$(git -C "$repo_path" remote get-url origin 2>/dev/null)"; then
    yellow "skip  $repo_path  (no origin remote)"
    skipped_count=$((skipped_count + 1))
    continue
  fi

  if ! repaired_url="$(repair_origin_url "$origin_url")"; then
    green "ok    $repo_path  ($(redact_url "$origin_url"))"
    skipped_count=$((skipped_count + 1))
    continue
  fi

  if [[ "$DRY_RUN" == true ]]; then
    yellow "plan  $repo_path"
    echo "      $(redact_url "$origin_url")"
    echo "   -> $(redact_url "$repaired_url")"
    repaired_count=$((repaired_count + 1))
    continue
  fi

  echo "fix   $repo_path"
  echo "      $(redact_url "$origin_url")"
  echo "   -> $(redact_url "$repaired_url")"

  if ! git -C "$repo_path" remote set-url origin "$repaired_url"; then
    red "fail  $repo_path  (could not update origin)"
    failed_count=$((failed_count + 1))
    continue
  fi

  if [[ "$VERIFY_FETCH" == true ]]; then
    if ! git -C "$repo_path" fetch origin --prune; then
      red "fail  $repo_path  (origin updated, fetch failed)"
      failed_count=$((failed_count + 1))
      continue
    fi
  fi

  green "done  $repo_path"
  repaired_count=$((repaired_count + 1))
done < <(find "$WORKSPACE_ROOT" -type d -name .git -print | sort)

echo ""
echo "Scanned  : $repo_count repo(s)"
echo "Repaired : $repaired_count repo(s)"
echo "Skipped  : $skipped_count repo(s)"
echo "Failed   : $failed_count repo(s)"

if [[ "$failed_count" -gt 0 ]]; then
  exit 1
fi
