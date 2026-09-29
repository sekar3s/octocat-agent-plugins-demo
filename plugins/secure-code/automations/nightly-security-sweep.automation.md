---
version: 1
id: nightly-security-sweep
name: Nightly security sweep
description: Every night, scan the workspace for secrets, insecure code patterns, and supply-chain risks.
schedule:
  kind: cron
  expression: "0 2 * * *"
  timeZone: local
---
Run a full-repository security review using the `secure-code-review` skill and the `vuln-scout` MCP tools.

Report:
1. New critical and high findings, with file, line, CWE, and a one-line fix.
2. Supply-chain risks in dependency manifests and GitHub Actions workflows.
3. A Block / Ship with follow-ups / Clear result.

Never print secret values. Do not modify files. Report only.
