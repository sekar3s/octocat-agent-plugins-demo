# Troubleshooting

## Quick diagnostics

```bash
node --version                     # must be 18+
git --version
copilot plugin list                # CLI: installed + enabled?
copilot plugin marketplace list    # CLI: marketplace registered?
```

To test a plugin outside any AI client, from a clone of this repository:

```bash
npm test                                                    # all MCP servers, hooks, and scripts
node plugins/ship-ready/skills/release-readiness/scripts/readiness-report.mjs --path /path/to/repo
echo '{"toolName":"bash","toolArgs":{"command":"chmod 777 x"}}' \
  | PLUGIN_ROOT=$PWD/plugins/secure-code node plugins/secure-code/scripts/hooks/security-guard.mjs preToolUse
```

## Plugin doesn't appear

| Symptom | Fix |
|---|---|
| VS Code: nothing under `@agentPlugins` | Make sure `chat.plugins.enabled` is `true` and `chat.plugins.marketplaces` contains `sekar3s/octocat-agent-plugins-demo`. Reload the window |
| VS Code: "destination path already exists" | Delete the cached clone: macOS `~/Library/Application Support/Code/agentPlugins/github.com/sekar3s/octocat-agent-plugins-demo` (Linux `~/.config/Code/…`, Windows `%APPDATA%\Code\…`), then retry |
| CLI: `Plugin not found` | Run `copilot plugin marketplace update octocat-agent-plugins`, and check the name with `copilot plugin marketplace browse octocat-agent-plugins` |
| CLI: `No such agent: security-guardian` | Plugin agents are namespaced: `copilot --agent secure-code:security-guardian` |
| Copilot app: marketplace missing | **Customize → Plugins** → ⚙️ → add the repository again; check that you can access the repository on GitHub |
| Managed by policy | The client shows a *Managed* badge. Ask your admin (see [enterprise deployment](enterprise-deployment.md)) |

## MCP server doesn't start or has no tools

| Symptom | Fix |
|---|---|
| `spawn node ENOENT` | Node.js isn't on the `PATH` seen by the client. On macOS, start VS Code from a terminal (`code .`) or install Node system-wide. On Windows, restart the client after installing Node |
| Server listed but no tools | VS Code: **MCP: List Servers** → select the server → **Show Output**. CLI: `/mcp` in a session. All servers log `ready (stdio)` to stderr |
| Blocked by `allowedMcpServers` | Ask your admin to allow `serverName` `release-radar`, `vuln-scout`, and `repo-atlas` |
| Tool analyzes the wrong folder | Ask the agent to pass the absolute repository path (every tool accepts `path`), or open the repository as your workspace root |

## Hooks don't fire

| Symptom | Fix |
|---|---|
| VS Code: no hook output | Make sure `chat.useHooks` is on and the workspace is trusted. Check **Output → GitHub Copilot Chat Hooks**, and run **Chat: Configure Hooks** to list discovered hooks |
| VS Code with `allowManagedHooksOnly` | Plugin hooks run only when the plugin is force-enabled by managed `enabledPlugins` |
| Disabled by environment | Check `SECURE_CODE_MODE`, `SHIP_READY_GUARD`, and `ONBOARDING_BUDDY_CONTEXT` |
| CLI: `disableAllHooks` set | Remove it from `~/.copilot/settings.json` or repository settings |
| Hook runs but the model does it anyway | `ask` shows a confirmation; you approved it. `additionalContext` is guidance, not enforcement |
| The agent refuses before a hook can fire | Expected. The `sessionStart` context makes the model avoid unsafe actions. Hooks are the backstop for when it doesn't. Test hooks directly with the `echo … \| node …` command above |

## Too strict or too noisy

- Temporarily downgrade secure-code denials to confirmations: `SECURE_CODE_MODE=warn`.
- False positive in a rule: open an issue with the (redacted) snippet, or adjust `plugins/secure-code/servers/security-rules.mjs` in your fork and add a test.
- Release guard asking too often: `SHIP_READY_GUARD=off` for a session, or narrow the `RISKY` list in `release-guard.mjs`.

## Updates aren't picked up

- Every change must bump `version` in **both** `plugin.json` and `.github/plugin/marketplace.json`.
- CLI: `copilot plugin marketplace update` then `copilot plugin update --all`. Direct installs are cached, so reinstall them.
- VS Code: run **Extensions: Check for Extension Updates**.
- Local marketplace (development): changes load live. Start a new session or run `/restart`.
