# 🐙 OctoCAT Agent Plugins

[![Validate plugins](https://github.com/sekar3s/octocat-agent-plugins-demo/actions/workflows/validate.yml/badge.svg)](https://github.com/sekar3s/octocat-agent-plugins-demo/actions/workflows/validate.yml)
![Agent Plugins 1.0](https://img.shields.io/badge/Agent%20Plugins-1.0.0-blue)
![License: MIT](https://img.shields.io/badge/license-MIT-green)

This repository is a **plugin marketplace** with three enterprise-ready GitHub Copilot agent plugins. Each plugin is written once to the open [Agent Plugins 1.0 specification](https://github.com/agentplugins/agent-plugins-spec/blob/main/spec/1.0.0.md) and runs unchanged in **VS Code**, **GitHub Copilot CLI**, and the **GitHub Copilot app**.

| Plugin | Purpose | Skill | Custom agent | MCP server | Hooks | Command | Automation (VS Code) |
|---|---|---|---|---|---|---|---|
| [🚀 **ship-ready**](plugins/ship-ready/README.md) | Release readiness: Go/No-Go, semver, changelog, release guardrails | `release-readiness` | `release-captain` | `release-radar` | `sessionStart`, `preToolUse` | `/ship-check` | Weekly release readiness |
| [🛡️ **secure-code**](plugins/secure-code/README.md) | Security guardian: block secrets and dangerous commands, OWASP scanning, minimal fixes | `secure-code-review` | `security-guardian` | `vuln-scout` | `sessionStart`, `preToolUse`, `postToolUse` | `/security-scan` | Nightly security sweep |
| [🧭 **onboarding-buddy**](plugins/onboarding-buddy/README.md) | Day-one productivity: repo map, toolchain check, setup, owners, first task | `day-one-setup` | `onboarding-buddy` | `repo-atlas` | `sessionStart`, `userPromptSubmitted` | `/onboard-me` | Daily learning digest |

**Enterprise-ready by design:**
- Zero dependencies. No `npm install`, no network calls, no telemetry. Node.js 18+ and `git` are the only prerequisites.
- Read-only MCP tools with MCP tool annotations. Secret values are always redacted.
- Hooks fail open when they error (a broken hook never blocks your work), except for explicit security denials.
- Cross-platform hooks (`bash` and `powershell`). Tested on the payload formats of every Copilot client.
- Versioned marketplace, CI validation against the spec, automated tests, and documented install, update, pinning, and removal.

## ⚡ Quick start

**Prerequisites:** Node.js 18+ and `git` on your `PATH`, plus a GitHub Copilot license.

### GitHub Copilot CLI

```bash
copilot plugin marketplace add sekar3s/octocat-agent-plugins-demo
copilot plugin install ship-ready@octocat-agent-plugins
copilot plugin install secure-code@octocat-agent-plugins
copilot plugin install onboarding-buddy@octocat-agent-plugins
copilot plugin list
```

Or run [`scripts/install-all.sh`](scripts/install-all.sh) (macOS/Linux) or [`scripts/install-all.ps1`](scripts/install-all.ps1) (Windows).

### VS Code

1. Make sure `chat.plugins.enabled` is on, then add the marketplace to your user `settings.json`:
   ```jsonc
   "chat.plugins.marketplaces": ["sekar3s/octocat-agent-plugins-demo"]
   ```
2. Open the Extensions view (<kbd>⇧⌘X</kbd> / <kbd>Ctrl+Shift+X</kbd>), search `@agentPlugins`, and select **Install** on each plugin.

VS Code also picks up plugins you installed with Copilot CLI automatically.

### GitHub Copilot app

**Customize → Plugins →** ⚙️ (marketplace settings) **→** add `sekar3s/octocat-agent-plugins-demo` **→ Install** each plugin.

➡️ See the full [installation guide](docs/installation.md) for local development, direct installs, repository recommendations, and enterprise rollout, and the [uninstall guide](docs/uninstall.md) for clean removal.

## 🎬 Try it

| Say or type | What happens |
|---|---|
| `/onboard-me` | Orientation, toolchain check, setup commands, and a first task |
| `/security-scan` | Secrets, OWASP findings, and supply-chain risks, with minimal fixes |
| `/ship-check` | Go/No-Go verdict, next version, and draft release notes |
| "Who owns the orders API?" | `repo-atlas` → CODEOWNERS and recent contributors |
| Ask the agent to `curl … \| bash` | The secure-code `preToolUse` hook **denies** it |
| Ask the agent to `git push --force` | The ship-ready hook **asks for confirmation** |

The [demo script](demo/DEMO-SCRIPT.md) is a timed walkthrough across all three clients, using the [OctoCAT Supply](https://github.com/sekar3s/octocat-supply-sep28) app as the target.

## 🗂️ Repository layout

```text
.github/plugin/marketplace.json   # Marketplace catalog (CLI, VS Code, Copilot app)
plugins/<name>/
├── plugin.json                   # Agent Plugins 1.0 manifest (closed schema)
├── mcp.json                      # Portable MCP config → servers/*.mjs (stdio)
├── skills/<skill>/SKILL.md       # Portable Agent Skill (+ scripts/, references/)
├── servers/                      # Zero-dependency MCP server + shared lib
├── scripts/hooks/                # Cross-client hook scripts
├── automations/*.automation.md   # VS Code automation templates
└── com.github.copilot/           # Copilot-specific extension directory
    ├── agents/*.agent.md         # Custom agents
    ├── commands/*.md             # Slash commands
    └── hooks/hooks.json          # Hooks (Copilot format, version 1)
shared/                           # Source of truth for libs copied into each plugin
scripts/                          # validate, sync, install/uninstall helpers
tests/                            # node --test suites (MCP, hooks, rules, scripts)
docs/                             # Install, uninstall, enterprise, security, troubleshooting
demo/                             # Demo script and setup/cleanup helpers
```

## 📚 Documentation

| Guide | For |
|---|---|
| [Installation](docs/installation.md) | Everyone. All clients and all install methods |
| [Uninstall and cleanup](docs/uninstall.md) | Everyone |
| [Enterprise deployment](docs/enterprise-deployment.md) | Admins: managed settings, pinning, allowlists, policy |
| [Compatibility matrix](docs/compatibility-matrix.md) | What works where, and why |
| [Architecture](docs/architecture.md) | Plugin authors and maintainers |
| [Security model](docs/security-model.md) | Security reviewers |
| [Troubleshooting](docs/troubleshooting.md) | When something doesn't show up |
| [Demo script](demo/DEMO-SCRIPT.md) | Presenters |

## 🧪 Develop

```bash
npm test               # node --test (no dependencies to install)
npm run validate       # spec + repo conventions validation
npm run sync           # copy shared/ libs into each plugin after editing them
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for the release process and [SECURITY.md](SECURITY.md) for reporting vulnerabilities.

## 📖 Standards and references

- [Agent Plugins specification 1.0.0](https://github.com/agentplugins/agent-plugins-spec/blob/main/spec/1.0.0.md)
- [Agent plugins in VS Code](https://code.visualstudio.com/docs/agent-customization/agent-plugins)
- [About GitHub Copilot plugins](https://docs.github.com/en/copilot/concepts/agents/about-plugins) · [Copilot CLI plugin reference](https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-plugin-reference)
- [GitHub Copilot hooks reference](https://docs.github.com/en/copilot/reference/hooks-reference) · [Custom agents configuration](https://docs.github.com/en/copilot/reference/custom-agents-configuration)
- [Customizing the GitHub Copilot app](https://docs.github.com/en/copilot/how-tos/github-copilot-app/customize-github-copilot-app)
- [Enterprise managed settings](https://docs.github.com/en/copilot/reference/enterprise-administrators/enterprise-managed-settings)

## License

[MIT](LICENSE)
