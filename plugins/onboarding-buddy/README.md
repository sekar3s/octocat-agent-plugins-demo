# 🧭 onboarding-buddy

**Day-one onboarding mentor.** It gives new engineers a map of the codebase, checks their toolchain, walks them through setup step by step, explains team terms, finds code owners, and suggests a safe first task.

| | |
|---|---|
| **Version** | 1.0.0 |
| **Format** | [Agent Plugins 1.0](https://github.com/agentplugins/agent-plugins-spec/blob/main/spec/1.0.0.md) + `com.github.copilot` extensions |
| **Works in** | VS Code · GitHub Copilot CLI · GitHub Copilot app |
| **Requires** | Node.js 18+ and `git` on `PATH` |
| **Network access** | None. Read-only analysis of your local repository |

## What's inside

| Component | Name | Location | Portable? |
|---|---|---|---|
| Skill | `day-one-setup` | [skills/day-one-setup/](skills/day-one-setup/SKILL.md) | ✅ Agent Plugins standard |
| MCP server | `repo-atlas` (stdio) | [mcp.json](mcp.json) → [servers/repo-atlas.mjs](servers/repo-atlas.mjs) | ✅ Agent Plugins standard |
| Custom agent | `onboarding-buddy` | [com.github.copilot/agents/](com.github.copilot/agents/onboarding-buddy.agent.md) | Copilot clients |
| Hooks | `sessionStart`, `userPromptSubmitted` | [com.github.copilot/hooks/hooks.json](com.github.copilot/hooks/hooks.json) | Copilot clients |
| Slash command | `/onboard-me` | [com.github.copilot/commands/](com.github.copilot/commands/onboard-me.md) | Copilot clients |
| Automation template | Daily learning digest | [automations/](automations/daily-learning-digest.automation.md) | VS Code only |

### `repo-atlas` MCP tools (all read-only)

| Tool | What it returns |
|---|---|
| `map_repository` | Languages, frameworks, top-level folders and their purpose, entry points, docs, CI workflows, and Copilot customizations |
| `find_setup_steps` | Prerequisites, install/run/test commands, Makefile targets, dev container, and README setup sections |
| `who_owns` | CODEOWNERS owners and top recent contributors for a path |
| `glossary_lookup` | Team terms from the bundled glossary plus `GLOSSARY.md`, `docs/glossary.md`, or `.github/onboarding/glossary.json` in the repository |
| `suggest_first_tasks` | TODO/FIXME items, modules without tests, doc gaps, and labeled starter issues |

### Hooks

| Event | Behavior |
|---|---|
| `sessionStart` | Adds a short repository orientation (stack, install/run/test commands, dev container) |
| `userPromptSubmitted` | **Opt-in only.** Records onboarding questions locally so the docs team can find FAQ gaps |

## Install

```bash
copilot plugin marketplace add sekar3s/octocat-agent-plugins-demo
copilot plugin install onboarding-buddy@octocat-agent-plugins
```

VS Code and the GitHub Copilot app are covered in the [installation guide](../../docs/installation.md). To install it automatically for every developer, see [enterprise deployment](../../docs/enterprise-deployment.md).

## Use it

| Try this | Where |
|---|---|
| `/onboard-me` | Any client |
| "I'm new here. How do I run this project?" / "Who owns the orders API?" | Any client (the skill loads automatically) |
| **onboarding-buddy** agent | VS Code agent picker · CLI `copilot --agent onboarding-buddy:onboarding-buddy` · Copilot app agent picker |
| `node skills/day-one-setup/scripts/check-toolchain.mjs --path <repo>` | Terminal (no AI needed) |

### Add your team's glossary

Commit `docs/glossary.md` with lines like `- **Term** — definition` (or a `| Term | Definition |` table), or `.github/onboarding/glossary.json` with `{ "Term": "Definition" }`. Repository terms are merged with the bundled ones. [demo/octocat-glossary.json](../../demo/octocat-glossary.json) is an example.

## Configuration

| Variable | Default | Effect |
|---|---|---|
| `ONBOARDING_BUDDY_CONTEXT` | on | Set to `off` to skip the session-start orientation |
| `ONBOARDING_BUDDY_CAPTURE_QUESTIONS` | unset | Set to `1` (together with `OCTOCAT_PLUGINS_AUDIT_DIR`) to record prompts locally for FAQ mining. Tell users before you turn this on |
| `OCTOCAT_PLUGINS_AUDIT_DIR` | unset | Local directory for JSONL logs |
| `REPO_ATLAS_GLOSSARY` | bundled | Path to an alternative bundled glossary JSON (set in `mcp.json`) |

## Remove

```bash
copilot plugin uninstall onboarding-buddy
```

See the [uninstall guide](../../docs/uninstall.md).
