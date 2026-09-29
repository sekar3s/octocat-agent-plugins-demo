# 🛡️ secure-code

**Security guardian that helps you ship faster.** It blocks hard-coded secrets and destructive commands before they land, flags OWASP Top 10 patterns as code is written, audits your supply chain, and guides minimal, tested fixes.

| | |
|---|---|
| **Version** | 1.0.0 |
| **Format** | [Agent Plugins 1.0](https://github.com/agentplugins/agent-plugins-spec/blob/main/spec/1.0.0.md) + `com.github.copilot` extensions |
| **Works in** | VS Code · GitHub Copilot CLI · GitHub Copilot app |
| **Requires** | Node.js 18+ and `git` on `PATH` |
| **Network access** | None. Offline rules; secret values are always redacted |

## What's inside

| Component | Name | Location | Portable? |
|---|---|---|---|
| Skill | `secure-code-review` | [skills/secure-code-review/](skills/secure-code-review/SKILL.md) | ✅ Agent Plugins standard |
| MCP server | `vuln-scout` (stdio) | [mcp.json](mcp.json) → [servers/vuln-scout.mjs](servers/vuln-scout.mjs) | ✅ Agent Plugins standard |
| Custom agent | `security-guardian` (read-only) | [com.github.copilot/agents/](com.github.copilot/agents/security-guardian.agent.md) | Copilot clients |
| Hooks | `sessionStart`, `preToolUse`, `postToolUse` | [com.github.copilot/hooks/hooks.json](com.github.copilot/hooks/hooks.json) | Copilot clients |
| Slash command | `/security-scan` | [com.github.copilot/commands/](com.github.copilot/commands/security-scan.md) | Copilot clients |
| Automation template | Nightly security sweep | [automations/](automations/nightly-security-sweep.automation.md) | VS Code only |

### `vuln-scout` MCP tools (all read-only)

| Tool | What it finds |
|---|---|
| `scan_secrets` | Cloud keys, GitHub/Slack/Stripe tokens, private keys, connection strings, JWTs, hard-coded passwords (values redacted) |
| `scan_insecure_patterns` | SQL injection, XSS, command injection, eval, unsafe deserialization, weak hashes, TLS bypass, permissive CORS, path traversal, open redirect, hard-coded JWT secrets, client-side auth, and more, each mapped to a CWE with a fix |
| `audit_dependencies` | Missing lockfiles, unbounded versions, non-registry sources, known-compromised npm packages, risky install scripts, unpinned GitHub Actions, `pull_request_target` misuse, and script injection in workflows |
| `scan_snippet` | Checks proposed code before it's written |
| `explain_cwe` | CWE name, OWASP category, impact, and fix |

### Hooks: the policy backstop

| Event | Behavior (`SECURE_CODE_MODE=enforce`, the default) |
|---|---|
| `sessionStart` | Adds secure-coding guidance to the session context |
| `preToolUse` | **Deny**: writing high-confidence secrets, `curl … \| sh`, `rm -rf /`/`~`/`*`, `chmod 777`, disk wipes, disabling TLS verification, reading SSH/cloud credential files, piping env vars to the network. **Ask**: possible secrets, editing or reading `.env`/key files, `--no-verify`, `sudo` |
| `postToolUse` | Scans code that was just written and feeds medium+ findings (with CWE and fix) back to the agent so it corrects itself |

> These rules are fast, offline heuristics for the inner loop. They complement, and don't replace, GitHub code scanning (CodeQL), Dependabot, and secret scanning with push protection.

## Install

```bash
copilot plugin marketplace add sekar3s/octocat-agent-plugins-demo
copilot plugin install secure-code@octocat-agent-plugins
```

VS Code and the GitHub Copilot app are covered in the [installation guide](../../docs/installation.md).

## Use it

| Try this | Where |
|---|---|
| `/security-scan` | Any client |
| "Is this change safe to ship?" / "Review api/src/routes for vulnerabilities" | Any client (the skill loads automatically) |
| **security-guardian** agent | VS Code agent picker · CLI `copilot --agent secure-code:security-guardian` · Copilot app agent picker |
| `node skills/secure-code-review/scripts/scan.mjs --path <repo> --changed` | Terminal or CI (exits `1` on high/critical findings) |

### Suppress a reviewed finding

Add a comment containing `secure-code-ignore` on the finding's line or the line above it, with a reason:

```ts
// secure-code-ignore: identifiers come from a fixed allow-list (TABLES)
await db.run(`DELETE FROM ${table.name}`);
```

The scan script reports findings in test and fixture files but doesn't count them as blocking unless you pass `--include-tests`.

## Configuration

| Variable | Default | Effect |
|---|---|---|
| `SECURE_CODE_MODE` | `enforce` | `enforce` = deny + ask · `warn` = ask only (never deny) · `off` = disable hooks |
| `OCTOCAT_PLUGINS_AUDIT_DIR` | unset | When set, hook decisions are appended to `<dir>/secure-code.jsonl`. Commands are truncated; secret values are never logged |

## Remove

```bash
copilot plugin uninstall secure-code
```

See the [uninstall guide](../../docs/uninstall.md) for VS Code and the Copilot app.
