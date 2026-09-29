---
description: Scan the current changes (or the whole repo) for secrets, OWASP Top 10 vulnerabilities, and supply-chain risks, with minimal fixes.
---

Run a security review of this repository using the `secure-code-review` skill.

1. Use the `vuln-scout` MCP tools (`scan_secrets`, `scan_insecure_patterns`, `audit_dependencies`) with the absolute repository root as `path`. Scan uncommitted changes first (`changedOnly: true`); if there are none, scan the whole repository.
2. Triage high and critical findings by reading the code and confirming they are reachable.
3. Reply with the skill's report template: result, findings table ordered by severity, and a minimal fix for each confirmed issue.
4. Do not modify files unless I ask.
