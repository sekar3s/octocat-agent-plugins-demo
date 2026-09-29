#!/usr/bin/env bash
# Reverts everything demo-setup.sh did.
# Usage: demo/demo-cleanup.sh [path-to-octocat-supply] [--keep-plugins]
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET="${1:-$HERE/../octocat-supply-sep28}"
[ "${1:-}" = "--keep-plugins" ] && TARGET="$HERE/../octocat-supply-sep28"
BRANCH="demo/agent-plugins"
KEEP=false
for arg in "$@"; do [ "$arg" = "--keep-plugins" ] && KEEP=true; done

if [ -d "$TARGET" ]; then
  TARGET="$(cd "$TARGET" && pwd)"
  WORKTREE="$(dirname "$TARGET")/octocat-supply-plugin-demo"
  if [ -d "$WORKTREE" ]; then
    echo "▶ Removing demo worktree $WORKTREE"
    git -C "$TARGET" worktree remove --force "$WORKTREE"
  fi
  git -C "$TARGET" worktree prune
  if git -C "$TARGET" show-ref --verify --quiet "refs/heads/$BRANCH"; then
    echo "▶ Deleting branch $BRANCH"
    git -C "$TARGET" branch -D "$BRANCH" >/dev/null
  fi
  for tag in $(git -C "$TARGET" tag --list 'v*-demo'); do
    echo "▶ Deleting demo tag $tag"
    git -C "$TARGET" tag -d "$tag" >/dev/null
  done
fi

if [ "$KEEP" = false ]; then
  echo "▶ Uninstalling plugins"
  "$HERE/scripts/uninstall-all.sh" --remove-marketplace >/dev/null
  copilot plugin list
fi
echo "✅ Cleanup complete."
