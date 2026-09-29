# Compatibility matrix

All three plugins use the **Agent Plugins 1.0** format. Portable components (skills and MCP servers) sit at the standard locations. Copilot-specific components sit in the `com.github.copilot/` extension directory, which other clients ignore.

## Components by client

| Component | Location | VS Code | Copilot CLI | GitHub Copilot app | Other Agent Plugins clients |
|---|---|---|---|---|---|
| Manifest | `plugin.json` (`$schema` 1.0.0) | ✅ | ✅ | ✅ | ✅ |
| Skills | `skills/<name>/SKILL.md` | ✅ | ✅ | ✅ | ✅ portable |
| MCP servers (stdio) | `mcp.json` | ✅ | ✅ | ✅ | ✅ portable |
| Custom agents | `com.github.copilot/agents/*.agent.md` | ✅ | ✅ (`<plugin>:<agent>`) | ✅ | ignored |
| Hooks | `com.github.copilot/hooks/hooks.json` | ✅ | ✅ | ✅ | ignored |
| Slash commands | `com.github.copilot/commands/*.md` | ✅ | ✅ (exposed as `/name`) | ✅ | ignored |
| Automation templates | `automations/*.automation.md` | ✅ | ignored | ignored | ignored |

✅ = supported by the client's documented plugin format. Verified end to end with **Copilot CLI 1.0.89**: install from the marketplace, skills, namespaced agents, `/ship-check`, MCP tools, and hook `allow`/`ask`/`deny` plus `additionalContext`. VS Code and the Copilot app follow the same documented `com.github.copilot` conventions. Use the [demo script](../demo/DEMO-SCRIPT.md) as the manual verification checklist for each release.

## Design decisions that make one package work everywhere

| Concern | Difference between clients | What these plugins do |
|---|---|---|
| **Hook file format** | Copilot CLI and the Copilot app use `{ "version": 1 }` with camelCase events. VS Code's Local harness maps that format to its own. PascalCase entries in the same file make the CLI run **both** variants | Use the Copilot format only (`version: 1`, camelCase events). The validator rejects PascalCase events |
| **Hook payloads** | CLI/app: `toolName`, `toolArgs`. VS Code Local: `hook_event_name`, `tool_name`, `tool_input` | `hook-io.mjs` normalizes both shapes |
| **Hook outputs** | CLI/app read top-level `permissionDecision` / `additionalContext`. VS Code reads `hookSpecificOutput` | Every response includes both |
| **Tool names** | `bash` / `create` / `edit` (CLI) vs `run_in_terminal` / `create_file` / `replace_string_in_file` (VS Code) vs `Bash` / `Write` / `Edit` (Claude-style) | Hooks classify tools by pattern and read content from any known argument key (`file_text`, `content`, `new_str`, `newString`, `replacements[]`, …) |
| **Hook command & OS** | `bash` on macOS/Linux, `powershell` on Windows | Every hook entry has both. Logic lives in Node.js, not shell |
| **Plugin root** | `${PLUGIN_ROOT}` placeholder and `PLUGIN_ROOT` environment variable (also `CLAUDE_PLUGIN_ROOT` / `COPILOT_PLUGIN_ROOT` in the CLI) | Hook commands use `${PLUGIN_ROOT}` (bash) and `$env:PLUGIN_ROOT` (PowerShell) |
| **Working directory** | CLI hooks and MCP servers start with `cwd` = plugin root | Hooks read the workspace from the payload `cwd`. MCP servers resolve it from the `path` argument, then MCP `roots`, then `PWD`, and never use the plugin directory |
| **Hook failure mode** | CLI command `preToolUse` hooks **fail closed** when they crash | Hooks catch every error and return `{}` |
| **Agent tool names** | Each client has native tool IDs | Agents use the cross-client aliases `read`, `search`, `edit`, `execute`, `web`, `todo`, plus `<mcp-server>/*`. Unknown names are ignored |
| **MCP transport** | Agent Plugins requires an explicit `type` | `"type": "stdio"`, `command: "node"` (single token), args use `${PLUGIN_ROOT}` |
| **Agent names** | CLI namespaces plugin agents as `<plugin>:<agent>` | Docs show `copilot --agent secure-code:security-guardian` |

## Hook event coverage

| Event (Copilot format) | VS Code Local | Copilot CLI / app | Used by |
|---|---|---|---|
| `sessionStart` | `SessionStart` | ✅ | all three |
| `userPromptSubmitted` | `UserPromptSubmit` | ✅ (output ignored for command hooks) | onboarding-buddy |
| `preToolUse` | `PreToolUse` | ✅ | ship-ready, secure-code |
| `postToolUse` | `PostToolUse` | ✅ | secure-code |

In VS Code, hooks run in the **Local** harness and in **Copilot** sessions on Agent Host (which use the same SDK hook implementation as the CLI). Claude and Codex harnesses have their own hook models. See [Choose the hook implementation for your session](https://code.visualstudio.com/docs/agent-customization/hooks#_choose-the-hook-implementation-for-your-session).

## Runtime requirements

| Requirement | Version |
|---|---|
| Node.js | 18 or later (uses only built-in modules) |
| git | Any recent version |
| OS | macOS, Linux, Windows |
