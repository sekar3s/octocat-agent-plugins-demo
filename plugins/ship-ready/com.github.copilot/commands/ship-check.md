---
description: Run the ship-ready release checklist and return a Go/No-Go verdict with a suggested version and draft changelog.
---

Run a release-readiness review for the current repository using the `release-readiness` skill.

1. Call the `release-radar` tools `check_release_artifacts`, `suggest_semver_bump`, and `draft_changelog` with the absolute repository root as `path`. If the tools are unavailable, run the skill's `scripts/readiness-report.mjs --path <repo-root>` script.
2. Reply using the skill's Go/No-Go template: verdict, blockers, warnings, suggested version, draft release notes, and next steps.
3. Do not tag, publish, or push anything.
