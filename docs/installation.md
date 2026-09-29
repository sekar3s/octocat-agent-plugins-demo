# Installation guide

This guide covers every supported way to install the OctoCAT agent plugins: from the marketplace (recommended), directly from the repository, from a local clone for development, through repository recommendations, and through enterprise policy.

- [Prerequisites](#prerequisites)
- [Names you'll need](#names-youll-need)
- [GitHub Copilot CLI](#github-copilot-cli)
- [VS Code](#vs-code)
- [GitHub Copilot app](#github-copilot-app)
- [Recommend plugins for a repository](#recommend-plugins-for-a-repository)
- [Enterprise rollout](#enterprise-rollout)
- [Verify the installation](#verify-the-installation)
- [Update and pin versions](#update-and-pin-versions)

## Prerequisites

| Requirement | Why | Check |
|---|---|---|
| GitHub Copilot license | All clients | — |
| **Node.js 18+** on `PATH` | Runs the MCP servers and hook scripts | `node --version` |
| **git** on `PATH` | The MCP servers read git history | `git --version` |
| VS Code with agent plugins enabled | VS Code only | Setting `chat.plugins.enabled` is `true` |
| Copilot CLI | CLI only | `copilot --version` |

> [!IMPORTANT]
> Hooks and MCP servers run code on your machine. Review [the security model](security-model.md) before you install, as you would for any plugin.

## Names you'll need

| Item | Value |
|---|---|
| Marketplace repository | `sekar3s/octocat-agent-plugins-demo` |
| Marketplace name | `octocat-agent-plugins` |
| Plugins | `ship-ready`, `secure-code`, `onboarding-buddy` |
| Plugin install IDs | `ship-ready@octocat-agent-plugins`, `secure-code@octocat-agent-plugins`, `onboarding-buddy@octocat-agent-plugins` |

## GitHub Copilot CLI

### From the marketplace (recommended)

```bash
copilot plugin marketplace add sekar3s/octocat-agent-plugins-demo
copilot plugin marketplace browse octocat-agent-plugins

copilot plugin install ship-ready@octocat-agent-plugins
copilot plugin install secure-code@octocat-agent-plugins
copilot plugin install onboarding-buddy@octocat-agent-plugins
```

You can do the same inside an interactive session with `/plugin marketplace add …` and `/plugin install …`, or use the `/plugin` dashboard.

To install all three in one step, run [`scripts/install-all.sh`](../scripts/install-all.sh) on macOS/Linux or [`scripts/install-all.ps1`](../scripts/install-all.ps1) on Windows.

### Directly from the repository

```bash
copilot plugin install sekar3s/octocat-agent-plugins-demo:plugins/secure-code
```

> [!NOTE]
> Copilot CLI marks direct installs (repository, URL, or local path) as deprecated and plans to support only `plugin@marketplace` installs in the future. Use the marketplace for anything long-lived.

### From a local clone (plugin development)

```bash
git clone https://github.com/sekar3s/octocat-agent-plugins-demo.git
copilot plugin marketplace add ./octocat-agent-plugins-demo
copilot plugin install secure-code@octocat-agent-plugins
```

When the marketplace source is a local directory, plugins are **loaded live** from your working copy. Edits apply the next time you start a session or run `/restart`, and nothing is copied.

### Where the CLI stores plugins

| Item | Location |
|---|---|
| Installed plugins | `~/.copilot/installed-plugins/<marketplace>/<plugin>/` (direct installs: `~/.copilot/installed-plugins/_direct/…`) |
| Plugin data (`PLUGIN_DATA`) | `~/.copilot/plugin-data/…` |
| Marketplace cache | `~/Library/Caches/copilot/marketplaces/` (macOS) · `~/.cache/copilot/marketplaces/` (Linux) |

If `COPILOT_HOME` is set, it replaces `~/.copilot`.

## VS Code

### From the marketplace (recommended)

1. Open **Preferences: Open User Settings (JSON)** and add the marketplace:

   ```jsonc
   {
     "chat.plugins.enabled": true,
     "chat.plugins.marketplaces": ["sekar3s/octocat-agent-plugins-demo"]
   }
   ```

2. Open the Extensions view (<kbd>⇧⌘X</kbd> on macOS, <kbd>Ctrl+Shift+X</kbd> on Windows/Linux) and search for `@agentPlugins`.

   Alternatively, run **Chat: Open Customizations**, select the **Plugins** tab, and select **Browse Marketplace**.
3. Select **Install** on `ship-ready`, `secure-code`, and `onboarding-buddy`. The first time you install from a new marketplace, VS Code asks you to trust it.

### From source (no marketplace)

Run **Chat: Install Plugin From Source** from the Command Palette and enter `https://github.com/sekar3s/octocat-agent-plugins-demo`.

### Plugins installed with Copilot CLI

VS Code automatically discovers plugins in `~/.copilot/installed-plugins/`. If you already installed the plugins with the CLI, they appear under **Agent Plugins - Installed** with no extra steps.

### Local clone (plugin development)

Register each plugin folder with `chat.pluginLocations`:

```jsonc
"chat.pluginLocations": {
  "/path/to/octocat-agent-plugins-demo/plugins/ship-ready": true,
  "/path/to/octocat-agent-plugins-demo/plugins/secure-code": true,
  "/path/to/octocat-agent-plugins-demo/plugins/onboarding-buddy": true
}
```

### VS Code-only extras

- **Automation templates:** open the Agents window, go to **Automations**, and choose **Templates from Plugins**. Each plugin contributes one template, which starts disabled until you enable it.
- **Hooks** run in the Local harness and in Copilot sessions on Agent Host. See the [compatibility matrix](compatibility-matrix.md).

## GitHub Copilot app

1. Select **Customize** in the app sidebar, then select **Plugins**.
2. Select the ⚙️ marketplace settings icon next to the marketplace dropdown, then add `sekar3s/octocat-agent-plugins-demo` (or `https://github.com/sekar3s/octocat-agent-plugins-demo.git`).
3. Choose **octocat-agent-plugins** in the marketplace dropdown and select **Install** on each plugin.

Skills and MCP servers that you configured for Copilot CLI are also available in the Copilot app. Use the agent picker (or type `/agent`) to select `release-captain`, `security-guardian`, or `onboarding-buddy`.

## Recommend plugins for a repository

To have Copilot suggest (CLI, VS Code) or enable (Copilot cloud agent) the plugins for everyone working in a repository, commit `.github/copilot/settings.json` to that repository:

```json
{
  "extraKnownMarketplaces": {
    "octocat-agent-plugins": {
      "source": { "source": "github", "repo": "sekar3s/octocat-agent-plugins-demo" }
    }
  },
  "enabledPlugins": {
    "onboarding-buddy@octocat-agent-plugins": true,
    "secure-code@octocat-agent-plugins": true,
    "ship-ready@octocat-agent-plugins": true
  }
}
```

- **VS Code** shows a recommendation notification the first time you send a chat message. Filter the Extensions view with `@agentPlugins @recommended` to see them.
- **Copilot CLI** applies the repository's `enabledPlugins` overlay when you work inside that repository.
- **Copilot cloud agent** installs plugins declaratively from this file.

## Enterprise rollout

Admins can make the marketplace available, and the plugins installed, for every licensed user through `managed-settings.json`. See [enterprise deployment](enterprise-deployment.md).

## Verify the installation

| Client | Check |
|---|---|
| CLI | `copilot plugin list`, then in a session run `/skills list`, `/agent`, and `/mcp` (look for `release-radar`, `vuln-scout`, `repo-atlas`) |
| VS Code | Extensions view → **Agent Plugins - Installed**; **Chat: Configure Skills**; **MCP: List Servers**; agent picker; type `/` in chat for commands |
| Copilot app | **Customize → Installed**; the agent picker lists the three agents |

Quick functional test in any client: type `/ship-check` in a git repository.

## Update and pin versions

| Client | Update |
|---|---|
| CLI | `copilot plugin marketplace update octocat-agent-plugins`, then `copilot plugin update <name>` (or `--all`) |
| VS Code | **Extensions: Check for Extension Updates** (also runs automatically every 24 hours when `extensions.autoUpdate` is enabled) |
| Copilot app | **Customize → Plugins**, then update from the plugin entry |

Each plugin follows Semantic Versioning, and `version` in `plugin.json` always matches the marketplace entry (CI enforces this). To pin a version for reproducible, enterprise-controlled installs, reference a tag or commit SHA. See [Pin to a release](enterprise-deployment.md#pin-to-a-release).
