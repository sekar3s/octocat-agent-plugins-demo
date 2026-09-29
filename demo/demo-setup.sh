#!/usr/bin/env bash
# Prepares a safe, repeatable demo of the OctoCAT agent plugins.
#   * verifies prerequisites
#   * creates an isolated git worktree of OctoCAT Supply on a throwaway branch (your checkout is never touched)
#   * installs the three plugins into Copilot CLI (VS Code picks them up automatically)
#   * optionally adds the OctoCAT team glossary to the demo worktree
#
# Usage: demo/demo-setup.sh [path-to-octocat-supply] [--local]
#   path-to-octocat-supply  existing clone (default: ../octocat-supply-sep28, cloned if missing)
#   --local                 install plugins from this working copy instead of GitHub
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET="${1:-$HERE/../octocat-supply-sep28}"
[ "${1:-}" = "--local" ] && TARGET="$HERE/../octocat-supply-sep28"
SOURCE="sekar3s/octocat-agent-plugins-demo"
for arg in "$@"; do [ "$arg" = "--local" ] && SOURCE="$HERE"; done
BRANCH="demo/agent-plugins"
WORKTREE="$(cd "$(dirname "$TARGET")" && pwd)/octocat-supply-plugin-demo"

echo "▶ Checking prerequisites"
for bin in git node copilot; do
  command -v "$bin" >/dev/null || { echo "  ✗ $bin not found" >&2; exit 1; }
  echo "  ✓ $bin $("$bin" --version 2>/dev/null | head -1)"
done
[ "$(node -p 'process.versions.node.split(".")[0]')" -ge 18 ] || { echo "  ✗ Node.js 18+ required" >&2; exit 1; }

echo "▶ Preparing OctoCAT Supply demo worktree"
if [ ! -d "$TARGET/.git" ] && [ ! -f "$TARGET/.git" ]; then
  echo "  cloning sekar3s/octocat-supply-sep28 → $TARGET"
  git clone --quiet https://github.com/sekar3s/octocat-supply-sep28.git "$TARGET"
fi
TARGET="$(cd "$TARGET" && pwd)"
if [ -d "$WORKTREE" ]; then
  echo "  ✓ worktree already exists: $WORKTREE"
else
  git -C "$TARGET" worktree add --quiet -B "$BRANCH" "$WORKTREE" HEAD
  echo "  ✓ created $WORKTREE on branch $BRANCH (from $(git -C "$TARGET" rev-parse --short HEAD))"
fi

mkdir -p "$WORKTREE/.github/onboarding"
cp "$HERE/demo/octocat-glossary.json" "$WORKTREE/.github/onboarding/glossary.json"
if [ -n "$(git -C "$WORKTREE" status --porcelain -- .github/onboarding)" ]; then
  git -C "$WORKTREE" add .github/onboarding/glossary.json
  git -C "$WORKTREE" commit --quiet -m "docs: add onboarding glossary for agent plugin demo" 2>/dev/null ||
    git -C "$WORKTREE" -c user.name="OctoCAT Demo" -c user.email="demo@example.com" commit --quiet -m "docs: add onboarding glossary for agent plugin demo"
fi
echo "  ✓ team glossary committed on $BRANCH → .github/onboarding/glossary.json"

echo "▶ Installing plugins (source: $SOURCE)"
"$HERE/scripts/install-all.sh" "$SOURCE" >/dev/null
copilot plugin list

cat <<MSG

✅ Demo ready.

  Demo workspace : $WORKTREE
  CLI            : cd "$WORKTREE" && copilot
  VS Code        : code "$WORKTREE"
  Copilot app    : open the app → add project → $WORKTREE

  Follow demo/DEMO-SCRIPT.md. When finished run: demo/demo-cleanup.sh "$TARGET"
MSG
