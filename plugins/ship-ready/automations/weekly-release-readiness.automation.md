---
version: 1
id: weekly-release-readiness
name: Weekly release readiness
description: Every Friday, review release readiness and draft release notes for the week's changes.
schedule:
  kind: cron
  expression: "30 10 * * 5"
  timeZone: local
---
Run the ship-ready release checklist for this workspace using the `release-readiness` skill and the `release-radar` MCP tools.

Summarize:
1. The Go / Go with caution / No-Go verdict and any blockers.
2. The suggested next version and why.
3. A draft changelog for everything merged since the last tag.

Do not tag, publish, push, or modify files. Report only.
