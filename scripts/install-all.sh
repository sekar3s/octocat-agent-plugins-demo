#!/usr/bin/env bash
# Installs all OctoCAT agent plugins into GitHub Copilot CLI (also used by VS Code and the Copilot app).
# Usage: scripts/install-all.sh [marketplace-source]
#   marketplace-source defaults to sekar3s/octocat-agent-plugins-demo (use a local path for development)
set -euo pipefail

EXPLICIT_SOURCE="${1:-}"
SOURCE="${EXPLICIT_SOURCE:-sekar3s/octocat-agent-plugins-demo}"
MARKETPLACE="octocat-agent-plugins"
PLUGINS=(ship-ready secure-code onboarding-buddy)

command -v copilot >/dev/null || { echo "✗ GitHub Copilot CLI not found. See https://docs.github.com/copilot/how-tos/copilot-cli" >&2; exit 1; }
command -v node >/dev/null || { echo "✗ Node.js 18+ is required (plugins run MCP servers and hooks with node)." >&2; exit 1; }
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
[ "$NODE_MAJOR" -ge 18 ] || { echo "✗ Node.js 18+ required (found $(node --version))." >&2; exit 1; }
command -v git >/dev/null || { echo "✗ git is required." >&2; exit 1; }

REGISTERED="$(copilot plugin marketplace list 2>/dev/null || true)"
if grep -q "$MARKETPLACE" <<<"$REGISTERED" && [ -z "$EXPLICIT_SOURCE" ]; then
  echo "• Marketplace $MARKETPLACE already registered — refreshing"
  copilot plugin marketplace update "$MARKETPLACE"
else
  if grep -q "$MARKETPLACE" <<<"$REGISTERED"; then
    # An explicit source was requested: re-register so we never silently keep a different source.
    echo "• Re-registering $MARKETPLACE from $SOURCE"
    copilot plugin marketplace remove "$MARKETPLACE" --force >/dev/null
  fi
  echo "• Adding marketplace from $SOURCE"
  copilot plugin marketplace add "$SOURCE"
fi

for p in "${PLUGINS[@]}"; do
  echo "• Installing $p@$MARKETPLACE"
  copilot plugin install "$p@$MARKETPLACE"
done

echo
copilot plugin list
echo
echo "✓ Done. Start a session with 'copilot' and try /onboard-me, /security-scan, or /ship-check."
echo "  VS Code discovers CLI-installed plugins automatically (Extensions view → Agent Plugins - Installed)."
