# Security policy

These plugins run hooks and MCP servers on developer machines, so we treat every change to `plugins/**` and `shared/**` as security-sensitive.

## Reporting a vulnerability

**Please do not open a public issue.** Report vulnerabilities privately with [GitHub private vulnerability reporting](https://github.com/sekar3s/octocat-agent-plugins-demo/security/advisories/new).

Include the affected plugin and version (`plugin.json`), the client (VS Code, Copilot CLI, or Copilot app), and reproduction steps. Redact any real secrets.

We aim to acknowledge reports within 3 business days and to release a fix, with a version bump in `plugin.json` and the marketplace, as quickly as severity requires.

## Supported versions

| Plugin | Supported |
|---|---|
| ship-ready 1.x | ✅ |
| secure-code 1.x | ✅ |
| onboarding-buddy 1.x | ✅ |

## Scope

In scope: hook bypasses that let a `deny` rule be evaded, path traversal or file access outside the workspace through MCP tools, secret values leaking into output or logs, and code execution through crafted repository content.

Out of scope: rule false negatives that don't bypass a documented guarantee (please open a regular issue), and issues in the Copilot clients themselves (report those to GitHub).

See [docs/security-model.md](docs/security-model.md) for the threat model and design.
