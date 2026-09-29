# Contributing

Thanks for improving the OctoCAT agent plugins! This repository is both a **plugin marketplace** and the source for three plugins.

## Development loop

```bash
git clone https://github.com/sekar3s/octocat-agent-plugins-demo.git
cd octocat-agent-plugins-demo
npm test && npm run validate            # zero dependencies, no install needed

# Load the plugins live from your working copy
copilot plugin marketplace add "$PWD"
copilot plugin install secure-code@octocat-agent-plugins
```

With a local marketplace, the CLI loads plugins **live**: start a new session (or run `/restart`) to pick up edits. In VS Code, register folders with `chat.pluginLocations` (see [installation](docs/installation.md#local-clone-plugin-development)).

## Rules of the road

1. **Agent Plugins 1.0 first.** Skills go in `skills/<name>/SKILL.md` and MCP servers in `mcp.json`. Copilot-only components go in `com.github.copilot/`. Don't add top-level fields to `plugin.json`; the manifest schema is closed.
2. **No runtime dependencies.** Use Node.js built-ins only (Node 18+). No `npm install` at runtime and no network calls.
3. **Hooks must never crash.** Use `runHook()` from `scripts/hooks/lib/hook-io.mjs`. Use the Copilot hook format (`"version": 1`, camelCase events) with both `bash` and `powershell` commands.
4. **Read-only MCP tools.** Annotate tools with `readOnlyHint: true`, accept an optional `path`, and resolve the workspace with `resolveWorkspace()`.
5. **Shared code lives in `shared/`.** Edit it there, then run `npm run sync`. CI fails if the copies drift.
6. **Never commit credential-shaped strings**, not even in tests. Build them at runtime (see `tests/helpers.mjs`).
7. **Tests for every rule and tool.** Cover both the Copilot (`toolName`/`toolArgs`) and VS Code (`tool_name`/`tool_input`) payload shapes.

## Releasing a plugin

1. Update the plugin's `CHANGELOG.md`.
2. Bump `version` (SemVer) in **both** `plugins/<name>/plugin.json` and `.github/plugin/marketplace.json`. The validator enforces that they match.
3. Open a PR; `Validate plugins` must pass on all OS/Node combinations, and a CODEOWNER must approve.
4. After merge, tag the repository (for example `v1.1.0`) so enterprises can pin `ref`.
5. Clients update with `copilot plugin update --all`, VS Code's update check, or managed `autoUpdate`.

## Adding a new plugin

Copy an existing plugin folder, rename it (lowercase letters, digits, `-`, `.`), update `plugin.json`, add it to `.github/plugin/marketplace.json`, add a README and CHANGELOG, then run `npm run sync && npm run validate && npm test`.
