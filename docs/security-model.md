# Security model

These plugins are built for regulated enterprise environments. This page describes what runs, what it can access, and what data leaves the machine (none).

## What executes

| Component | Runs when | Process | Access |
|---|---|---|---|
| MCP servers (`release-radar`, `vuln-scout`, `repo-atlas`) | While the plugin is enabled | `node <plugin>/servers/*.mjs` over stdio | **Read-only**: workspace files and `git` metadata. Every tool has `readOnlyHint: true` and `openWorldHint: false` |
| Hook scripts | At lifecycle events (session start, prompt, before and after tool calls) | `node <plugin>/scripts/hooks/*.mjs` | Reads the event payload on stdin and runs read-only `git` commands. Optionally appends to a local audit log |
| Skill scripts | Only when the agent (or you) runs them | `node <skill>/scripts/*.mjs` | Read-only; `check-toolchain` runs `--version` commands |

Nothing is downloaded or installed at runtime. There are **no third-party dependencies**: every file ships in this repository and is reviewable.

## Data handling

- **No network calls.** No telemetry, analytics, or external APIs. You can verify with `grep -rE "fetch\(|https?\.request|net\.connect" plugins/`: the only matches are detection rules and documentation links.
- **Secrets are never echoed.** `vuln-scout` and the hooks redact matched values (`AKIA…****(20 chars)`), and deny reasons name only the secret type.
- **Audit logs are opt-in and local.** They are written only when `OCTOCAT_PLUGINS_AUDIT_DIR` is set. Logged commands are truncated to 300 characters. Onboarding question capture needs a second, explicit opt-in (`ONBOARDING_BUDDY_CAPTURE_QUESTIONS=1`).
- **Context injection** (`sessionStart`/`postToolUse` `additionalContext`) contains only repository metadata (branch, tag, commit counts, stack, commands) or finding summaries. It goes to the model the same way your prompt does.

## Hardening measures

| Risk | Mitigation |
|---|---|
| Path traversal from tool arguments | MCP file reads are resolved against the repository root and rejected outside it; symlinks aren't followed while walking |
| Resource exhaustion | File size cap (512 KB), file-count caps, `git` timeouts (10 s), hook `timeoutSec` 5–15 s |
| Shell injection in the plugins themselves | `git` runs with `execFileSync` and argument arrays (no shell) |
| Broken hook blocks all tools (CLI `preToolUse` fails closed) | `runHook()` catches every exception and returns `{}` (no decision) |
| Plugin escapes its root | The validator checks that every `${PLUGIN_ROOT}` reference exists inside the plugin. The Agent Plugins client enforces containment |
| Credentials in configuration | No `env` secrets or headers in `mcp.json` (Agent Plugins §9.2); CI checks this |
| Supply-chain tampering | Zero dependencies; GitHub Actions in CI pinned by Dependabot-managed tags; CODEOWNERS on `plugins/**`; pin marketplace `ref`/`sha` in production |

## Limits: what these plugins are not

- The secure-code rules are **fast heuristics** for the developer inner loop. They are not a SAST engine, dependency CVE database, or secret-scanning service. Keep **CodeQL code scanning**, **Dependabot**, and **secret scanning with push protection** enabled.
- Plugin hooks are a guardrail, not a security boundary. A user with local admin rights can disable a plugin unless it's force-enabled by managed settings. For controls that must not be bypassed, use policy hooks, managed `permissions`, repository rulesets, and push protection. See [enterprise deployment](enterprise-deployment.md#hooks-and-policy).
- `ask` decisions become `deny` in non-interactive contexts such as Copilot cloud agent.

## Reviewing a release

1. `npm test && npm run validate` (no dependencies needed).
2. Diff `plugins/**` between tags. Pay extra attention to `scripts/hooks/**`, `servers/**`, `mcp.json`, and `hooks.json`.
3. Confirm the version bump in both `plugin.json` and `.github/plugin/marketplace.json`.

Report vulnerabilities as described in [SECURITY.md](../SECURITY.md).
