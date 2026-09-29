# Uninstall and cleanup

Use this guide to disable or fully remove the OctoCAT agent plugins. Removing a plugin removes all of its components: skills, the custom agent, hooks, the MCP server, slash commands, and automation templates.

## Disable without uninstalling

| Client | How |
|---|---|
| Copilot CLI | `copilot plugin disable <name>` (turn it back on with `copilot plugin enable <name>`) |
| VS Code | Right-click the plugin in **Agent Plugins - Installed** and choose **Disable** (globally or for the workspace), or toggle it in **Chat: Open Customizations → Plugins** |
| Copilot app | **Customize → Installed** → toggle the plugin off |

To temporarily turn off only the hooks, set an environment variable before you start the client:

| Plugin | Variable |
|---|---|
| ship-ready | `SHIP_READY_GUARD=off` |
| secure-code | `SECURE_CODE_MODE=off` (or `warn` to downgrade denials to confirmations) |
| onboarding-buddy | `ONBOARDING_BUDDY_CONTEXT=off` |

## Uninstall

### Copilot CLI

```bash
copilot plugin uninstall ship-ready
copilot plugin uninstall secure-code
copilot plugin uninstall onboarding-buddy

# Optional: remove the marketplace (use --force to also uninstall anything still installed from it)
copilot plugin marketplace remove octocat-agent-plugins
```

Or run [`scripts/uninstall-all.sh`](../scripts/uninstall-all.sh) (macOS/Linux) or [`scripts/uninstall-all.ps1`](../scripts/uninstall-all.ps1) (Windows). Pass `--remove-marketplace` / `-RemoveMarketplace` to also unregister the marketplace.

> [!NOTE]
> Use the plugin **name** (`secure-code`), not the path or `name@marketplace`, with `uninstall`.
>
> If you installed from a **local** marketplace directory (plugin development), the CLI loads plugins live from that directory, so `uninstall` disables them and leaves your files in place. Remove the marketplace to unregister them completely.

### VS Code

1. Open the Extensions view → **Agent Plugins - Installed**.
2. Right-click each plugin and select **Uninstall**.
3. Remove the marketplace from `chat.plugins.marketplaces` (and any `chat.pluginLocations` entries) in `settings.json`.

Plugins that were installed with Copilot CLI and discovered by VS Code must be uninstalled with the CLI.

### GitHub Copilot app

**Customize → Installed** → select the plugin → **Uninstall**. To remove the marketplace, open the marketplace settings (⚙️) in **Customize → Plugins** and remove it.

## Remove repository and enterprise configuration

| Where | What to remove |
|---|---|
| Repository | The `octocat-agent-plugins` entries in `.github/copilot/settings.json` (`extraKnownMarketplaces`, `enabledPlugins`) |
| Enterprise | The same keys in `copilot/managed-settings.json` in your `.github-private` repository. To force removal everywhere, set each plugin to `false` in `enabledPlugins` first, then delete the entries after clients have synced |

A plugin that is enabled by managed or repository settings can't be disabled or uninstalled locally; the client reports which settings file controls it.

## Clean up residual data

Uninstalling removes the plugin files. These items can stay behind, and you can delete them safely:

| Item | Location |
|---|---|
| CLI plugin data | `~/.copilot/plugin-data/` (entries for `octocat-agent-plugins` or `_direct`) |
| CLI marketplace cache | `~/Library/Caches/copilot/marketplaces/` (macOS) · `~/.cache/copilot/marketplaces/` (Linux) |
| VS Code plugin cache | macOS `~/Library/Application Support/Code/agentPlugins/github.com/sekar3s/octocat-agent-plugins-demo` · Linux `~/.config/Code/agentPlugins/github.com/sekar3s/octocat-agent-plugins-demo` · Windows `%APPDATA%\Code\agentPlugins\github.com\sekar3s\octocat-agent-plugins-demo` |
| Opt-in audit logs | The directory you set in `OCTOCAT_PLUGINS_AUDIT_DIR` (`*.jsonl`) |
| Automations created from templates | VS Code **Automations** view. Automations you created from a template are kept after the plugin is removed; delete them manually |

## Verify removal

```bash
copilot plugin list                 # plugins no longer listed
copilot plugin marketplace list     # marketplace removed (if you removed it)
```

In VS Code, **MCP: List Servers** no longer shows `release-radar`, `vuln-scout`, or `repo-atlas`, and the agents no longer appear in the agent picker.
