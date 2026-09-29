---
name: release-readiness
description: Assess whether a repository is ready to release and produce a Go/No-Go report with a suggested semantic version and draft changelog. Use when the user asks "are we ready to ship/release?", wants a release checklist, a version bump recommendation, release notes, or a changelog before tagging or publishing.
license: MIT
metadata:
  plugin: ship-ready
  version: 1.0.0
---

# Release readiness

Produce an evidence-based **Go / Go with caution / No-Go** decision for the current repository and hand the user everything they need to cut the release.

## When to use

- "Are we ready to ship?", "run the release checklist", "what version should this be?"
- Drafting release notes or a CHANGELOG entry
- Before running `git tag`, `npm publish`, `gh release create`, or pushing to a release branch

## Workflow

1. **Identify the repository.** Use the absolute path of the current workspace (repository root).
2. **Collect evidence** — prefer the `release-radar` MCP tools, always passing `path`:
   - `check_release_artifacts` → checklist results and verdict
   - `suggest_semver_bump` → current → next version with rationale
   - `commits_since_last_tag` → what changed
   - `draft_changelog` → release notes markdown

   If the MCP tools are unavailable, run the bundled script instead (it produces the same data):

   ```bash
   node "<this-skill-directory>/scripts/readiness-report.mjs" --path "<repo-root>"
   ```

3. **Go beyond automation.** Read [references/release-checklist.md](references/release-checklist.md) and check the items the tools cannot verify (for example: feature flags, rollback plan, on-call awareness, docs updated for user-facing changes). Use the repository's build/test commands if the user allows running them.
4. **Report** using [references/go-no-go-template.md](references/go-no-go-template.md). Lead with the verdict, then blockers, then warnings, then the suggested version and draft changelog.
5. **Offer next steps**, but do not tag, publish, or push without explicit user confirmation. The ship-ready guard hook asks for confirmation on those commands.

## Rules

- A `fail` result is a blocker → verdict is **No-Go** until it is fixed or explicitly waived by the user.
- Never invent test results. If tests were not run, say so.
- Keep the report concise: one table, then bullets.
- Treat database migrations as needing a written rollback plan.
