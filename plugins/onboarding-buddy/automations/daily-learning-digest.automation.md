---
version: 1
id: daily-learning-digest
name: Daily learning digest
description: Each morning, summarize what changed in the repository and suggest one thing for a new engineer to learn.
schedule:
  kind: cron
  expression: "0 9 * * *"
  timeZone: local
---
Act as my onboarding buddy for this workspace.

1. Summarize the commits from the last 24 hours in plain language (what changed and why it matters), grouped by area.
2. Pick one concept, file, or domain term from those changes and teach it in five sentences or fewer, with links to the relevant files. Use the `repo-atlas` `glossary_lookup` tool for terminology.
3. Suggest one small, low-risk task I could do today using the `repo-atlas` `suggest_first_tasks` tool.

Do not modify files. Report only.
