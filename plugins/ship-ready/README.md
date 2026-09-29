# 🚀 ship-ready

**Release-readiness copilot.** Decide Go/No-Go with evidence, get a semantic version recommendation and a draft changelog, and add guardrails around risky release commands in every Copilot client.

| | |
|---|---|
| **Version** | 1.0.0 |
| **Format** | [Agent Plugins 1.0](https://github.com/agentplugins/agent-plugins-spec/blob/main/spec/1.0.0.md) + `com.github.copilot` extensions |
| **Works in** | VS Code · GitHub Copilot CLI · GitHub Copilot app |
| **Requires** | Node.js 18+ and `git` on `PATH` |
| **Network access** | None. Read-only analysis of your local git repository |

## What's inside

| Component | Name | Location | Portable? |
|---|---|---|---|
| Skill | `release-readiness` | [skills/release-readiness/](skills/release-readiness/SKILL.md) | ✅ Agent Plugins standard |
| MCP server | `release-radar` (stdio) | [mcp.json](mcp.json) → [servers/release-radar.mjs](servers/release-radar.mjs) | ✅ Agent Plugins standard |
| Custom agent | `release-captain` | [com.github.copilot/agents/](com.github.copilot/agents/release-captain.agent.md) | Copilot clients |
| Hooks | `sessionStart`, `preToolUse` | [com.github.copilot/hooks/hooks.json](com.github.copilot/hooks/hooks.json) | Copilot clients |
| Slash command | `/ship-check` | [com.github.copilot/commands/](com.github.copilot/commands/ship-check.md) | Copilot clients |
| Automation template | Weekly release readiness | [automations/](automations/weekly-release-readiness.automation.md) | VS Code only |

### `release-radar` MCP tools (all read-only)

| Tool | What it returns |
|---|---|
| `check_release_artifacts` | Checklist (changelog, clean tree, branch, CI, tests, lockfiles, version consistency, migrations, README/LICENSE/SECURITY, TODO markers) and a **GO / GO WITH CAUTION / NO-GO** verdict |
| `suggest_semver_bump` | Current → next version with rationale (Conventional Commits, with heuristics for other commit styles) |
| `commits_since_last_tag` | Classified commits since the last tag |
| `draft_changelog` | Keep-a-Changelog style markdown for the next release |

### Hooks

| Event | Behavior |
|---|---|
| `sessionStart` | Adds release context: branch, last tag, unreleased commits, uncommitted changes |
| `preToolUse` | Asks for confirmation (`ask`) before force-pushes, pushes to `main`/`release/*`, `git tag`, `git push --tags`, `npm/pnpm/yarn publish`, `gh release create/edit/delete`, `docker push`, and `npm version` |

## Install

```bash
# Copilot CLI (the GitHub Copilot app uses the same plugins)
copilot plugin marketplace add sekar3s/octocat-agent-plugins-demo
copilot plugin install ship-ready@octocat-agent-plugins
```

In **VS Code**, add `"chat.plugins.marketplaces": ["sekar3s/octocat-agent-plugins-demo"]` to your settings, search `@agentPlugins ship-ready` in the Extensions view, and select **Install**. In the **GitHub Copilot app**, go to **Customize → Plugins** and add the marketplace. See the [installation guide](../../docs/installation.md) for all options, including enterprise rollout.

## Use it

| Try this | Where |
|---|---|
| `/ship-check` | Any client |
| "Are we ready to release? What version should this be?" | Any client (the skill loads automatically) |
| Select the **release-captain** agent and ask for a release plan | VS Code agent picker · CLI `/agent` or `copilot --agent ship-ready:release-captain` · Copilot app agent picker |
| **Templates from Plugins → Weekly release readiness** | VS Code Agents window → Automations |
| `node skills/release-readiness/scripts/readiness-report.mjs --path <repo>` | Terminal (no AI needed) |

## Configuration

| Variable | Default | Effect |
|---|---|---|
| `SHIP_READY_GUARD` | on | Set to `off` to disable the `preToolUse` confirmation guard |
| `OCTOCAT_PLUGINS_AUDIT_DIR` | unset | When set, guard decisions are appended to `<dir>/ship-ready.jsonl` (local only) |

## Remove

```bash
copilot plugin uninstall ship-ready
```

In VS Code, right-click **ship-ready** in **Agent Plugins - Installed** and select **Uninstall**. See the [uninstall guide](../../docs/uninstall.md).
