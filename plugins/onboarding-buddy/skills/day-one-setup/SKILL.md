---
name: day-one-setup
description: Get a new engineer productive on day one — verify their toolchain, set up and run the project, explain the architecture in plain language, find who owns what, and pick a safe first task. Use when someone is new to the repository or team, asks "how do I get started / set up / run this?", "where is X?", "who owns Y?", or "what should I work on first?".
license: MIT
metadata:
  plugin: onboarding-buddy
  version: 1.0.0
---

# Day-one setup

Take a new engineer from "just cloned" to "first pull request" with as little friction as possible.

## Workflow

1. **Welcome and orient** — call `map_repository` (repo-atlas MCP, pass the absolute repository root as `path`). Summarize in 5 bullets: what the product does, main components, languages/frameworks, where docs live, and which Copilot customizations exist.
2. **Check the toolchain** — run the bundled script and share the table:

   ```bash
   node "<this-skill-directory>/scripts/check-toolchain.mjs" --path "<repo-root>"
   ```

   For anything missing, give the one-line install command for the user's OS. If a dev container exists, offer it as the zero-setup path.
3. **Set up and run** — call `find_setup_steps`. Walk through install → run → test one step at a time. Ask before running commands that install packages or start servers. When something fails, explain the error in plain language and fix the root cause.
4. **Explain the architecture** — follow a single request end to end (for example UI → API route → repository → database). Use `glossary_lookup` for domain terms and link to the actual files.
5. **Who to ask** — use `who_owns` for the areas they will touch.
6. **First task** — call `suggest_first_tasks` and recommend one small, low-risk task with a clear definition of done (a missing unit test is ideal). Offer to pair on it.
7. **Wrap up** — share [references/first-week-checklist.md](references/first-week-checklist.md) and record what they completed.

## Style

- Encouraging, concise, no jargon without a definition. New engineers should never feel judged for asking.
- One step at a time; confirm success before moving on.
- Prefer showing the real file (with a link) over describing it.
- Never paste secrets or ask the user for credentials; point to the team's secret manager or `.env.example`.
