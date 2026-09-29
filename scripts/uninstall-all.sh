#!/usr/bin/env bash
# Removes all OctoCAT agent plugins from GitHub Copilot CLI.
# Usage: scripts/uninstall-all.sh [--remove-marketplace]
set -uo pipefail

MARKETPLACE="octocat-agent-plugins"
PLUGINS=(ship-ready secure-code onboarding-buddy)

command -v copilot >/dev/null || { echo "✗ GitHub Copilot CLI not found." >&2; exit 1; }

INSTALLED="$(copilot plugin list --json 2>/dev/null || true)"
for p in "${PLUGINS[@]}"; do
  if grep -q "\"name\": *\"$p\"" <<<"$INSTALLED"; then
    echo "• Uninstalling $p"
    copilot plugin uninstall "$p"
  else
    echo "• $p is not installed"
  fi
done

if [ "${1:-}" = "--remove-marketplace" ]; then
  echo "• Removing marketplace $MARKETPLACE"
  copilot plugin marketplace remove "$MARKETPLACE" --force || true
fi

echo
copilot plugin list
echo "✓ Done. See docs/uninstall.md to remove VS Code settings, caches, and audit logs."
