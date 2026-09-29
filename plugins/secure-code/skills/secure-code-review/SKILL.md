---
name: secure-code-review
description: Security review for code changes or a whole repository — finds hard-coded secrets, OWASP Top 10 / CWE-mapped vulnerabilities (SQL injection, XSS, command injection, weak crypto, TLS bypass, permissive CORS), and supply-chain risks, then proposes minimal fixes. Use when the user asks for a security review, vulnerability scan, "is this safe to ship?", secure coding guidance, or before merging/releasing.
license: MIT
metadata:
  plugin: secure-code
  version: 1.0.0
---

# Secure code review

Find the security issues that matter, explain them in one line each, and fix them with the **smallest safe change** so the team can ship faster.

## Workflow

1. **Scope.** Default to changed files (`changedOnly: true`) for inner-loop reviews; scan the whole repository when asked for an audit or before a release. Always pass the absolute repository root as `path`.
2. **Scan** with the `vuln-scout` MCP tools:
   - `scan_secrets` — credentials (values are redacted; never print full secrets)
   - `scan_insecure_patterns` — CWE-mapped code issues with fixes
   - `audit_dependencies` — manifests, lockfiles, GitHub Actions supply chain
   - `scan_snippet` — check code you are about to propose *before* writing it
   - `explain_cwe` — impact and remediation for any CWE

   If MCP tools are unavailable, run the bundled script:

   ```bash
   node "<this-skill-directory>/scripts/scan.mjs" --path "<repo-root>" [--changed] [--min-severity medium]
   ```

3. **Triage — do not just dump scanner output.** Open each high/critical finding and confirm it is reachable with untrusted input. Use [references/owasp-checklist.md](references/owasp-checklist.md) for issues scanners cannot see (authorization, business logic, rate limiting). Mark false positives with a reason; if the user agrees, suppress them with a `// secure-code-ignore: <reason>` comment on or above the line.
4. **Report** using [references/report-template.md](references/report-template.md): findings table ordered by severity, then confirmed exploit path, then fix.
5. **Fix** when asked: minimal diff, keep behavior, add or update a test that proves the fix (for example, a test that a `'; DROP TABLE` payload is treated as data). Re-run `scan_snippet` on your patch before writing it.

## Severity rules

| Severity | Examples | Ship? |
|---|---|---|
| Critical | Committed live credential, RCE, auth bypass | Block |
| High | SQLi, XSS, command injection, TLS disabled, path traversal | Block unless not reachable |
| Medium | Permissive CORS, weak hash, unpinned third-party action | Fix soon / accept with owner |
| Low | Cleartext URL in docs, missing permissions block | Backlog |

## Rules

- Never echo a secret value. Refer to it by file, line, and type; recommend rotation.
- Prefer platform controls: GitHub secret scanning push protection, CodeQL code scanning, Dependabot.
- Explain *why* in one sentence; developers fix faster when they understand the exploit.
