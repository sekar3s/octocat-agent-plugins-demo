# Enterprise deployment

This guide is for GitHub Enterprise admins, AI managers, and platform teams rolling these plugins out to many developers.

- [Rollout options at a glance](#rollout-options-at-a-glance)
- [1. Fork or mirror the marketplace](#1-fork-or-mirror-the-marketplace)
- [2. Distribute with enterprise-managed settings](#2-distribute-with-enterprise-managed-settings)
- [3. Restrict marketplaces and MCP servers](#3-restrict-marketplaces-and-mcp-servers)
- [Pin to a release](#pin-to-a-release)
- [Hooks and policy](#hooks-and-policy)
- [Observability](#observability)
- [Phased rollout checklist](#phased-rollout-checklist)
- [Offboarding](#offboarding)

## Rollout options at a glance

| Option | Scope | Who controls it | Users can opt out? |
|---|---|---|---|
| Self-service install ([installation guide](installation.md)) | One user | User | Yes |
| Repository recommendations (`.github/copilot/settings.json`) | Everyone in a repository | Repository maintainers | Yes (VS Code/CLI); applied in cloud agent |
| **Enterprise-managed settings** (`managed-settings.json`) | Everyone licensed through the enterprise | Enterprise admins | No, for managed entries |
| MDM or file-based managed settings | Managed devices | IT | No |

## 1. Fork or mirror the marketplace

For production use, host your own copy so that changes go through your review process:

1. Fork or import this repository into your organization, for example `octo-org/copilot-plugins`. Internal or private visibility works; clients authenticate with the user's GitHub credentials.
2. Protect `main` (required reviews, required `Validate plugins` check, CODEOWNERS review for `plugins/**`).
3. Replace the `sekar3s/octocat-agent-plugins-demo` URLs in `plugins/*/plugin.json` and `.github/plugin/marketplace.json`, and set `owner` in the marketplace manifest.
4. Tag releases (for example `v1.0.0`) after CI passes.

## 2. Distribute with enterprise-managed settings

Create or update `copilot/managed-settings.json` in your enterprise's `.github-private` repository (see [Getting started with enterprise-managed settings](https://docs.github.com/en/copilot/how-tos/administer-copilot/manage-for-enterprise/use-managed-settings/get-started)):

```json
{
  "extraKnownMarketplaces": {
    "octocat-agent-plugins": {
      "source": {
        "source": "github",
        "repo": "octo-org/copilot-plugins",
        "ref": "v1.0.0"
      },
      "autoUpdate": true
    }
  },
  "enabledPlugins": {
    "secure-code@octocat-agent-plugins": true,
    "onboarding-buddy@octocat-agent-plugins": true,
    "ship-ready@octocat-agent-plugins": true
  }
}
```

- `extraKnownMarketplaces` makes the marketplace available in every supported client (Copilot CLI, VS Code, the Copilot app, and cloud agent).
- `enabledPlugins` with `true` installs and **force-enables** a plugin for all users. Use `false` to force-disable one.
- The **marketplace name** key (`octocat-agent-plugins`) must match `name` in [`.github/plugin/marketplace.json`](../.github/plugin/marketplace.json).
- Clients pick up server-managed settings within about an hour, or immediately after a restart or sign-in.

### Different plugins for different teams

`enabledPlugins` applies to everyone licensed through the enterprise. To target plugins more narrowly:

- **Force-enable broadly useful plugins** (`secure-code`, `onboarding-buddy`) in `managed-settings.json`.
- **Scope specialist plugins to repositories.** Commit `.github/copilot/settings.json` with `"enabledPlugins": { "ship-ready@octocat-agent-plugins": true }` to your release-managed repositories. See [Recommend plugins for a repository](installation.md#recommend-plugins-for-a-repository).
- **Scope marketplaces to teams.** `extraKnownMarketplaces` and `strictKnownMarketplaces` support `overridable` team files (`copilot/team-mappings.json` + `copilot/teams/*.json`).

```text
.github-private/copilot/
├── managed-settings.json   # { "extraKnownMarketplaces": { "overridable": { …default map… } } }
├── team-mappings.json      # { "platform.json": ["platform-engineering"] }
└── teams/platform.json     # { "extraKnownMarketplaces": { …default map + experimental marketplace… } }
```

Check which keys are overridable in the [enterprise managed settings reference](https://docs.github.com/en/copilot/reference/enterprise-administrators/enterprise-managed-settings), and look for validation errors under **Enterprise → AI controls → Agents → Copilot settings validation**.

## 3. Restrict marketplaces and MCP servers

**Allow only approved marketplaces:**

```json
{
  "strictKnownMarketplaces": [
    { "source": "github", "repo": "octo-org/copilot-plugins" }
  ]
}
```

An empty array (`[]`) blocks every marketplace.

**MCP allowlists:** if you use `allowedMcpServers`, add the plugin servers. `serverCommand` matches the exact command and arguments, and the plugin path is different on every machine, so match the server names instead:

```json
{
  "allowedMcpServers": [
    { "serverName": "release-radar" },
    { "serverName": "vuln-scout" },
    { "serverName": "repo-atlas" }
  ]
}
```

> [!NOTE]
> `serverName` matches a label and doesn't verify identity. Pair it with `strictKnownMarketplaces` so that only your reviewed marketplace can supply servers with those names.

## Pin to a release

| Where | How |
|---|---|
| Managed settings / repository settings | `"ref": "v1.0.0"` (tag, branch, or SHA) on the marketplace `source` |
| CLI marketplace | `copilot plugin marketplace add octo-org/copilot-plugins#v1.0.0` |
| Marketplace entry for an external plugin source | `"source": { "source": "github", "repo": "…", "sha": "<40-char SHA>", "path": "plugins/secure-code" }` for immutable installs |

Update by bumping the ref after the new tag passes review. Every plugin's `version` must change on each release (CI enforces that `plugin.json` and `marketplace.json` agree) so that clients detect updates.

## Hooks and policy

- Plugin hooks run **in addition to** user, repository, and admin policy hooks. For `preToolUse`, the most restrictive decision wins (`deny` beats `ask`, which beats `allow`).
- **VS Code:** when managed settings set `allowManagedHooksOnly: true`, plugin hooks run only if the plugin is force-enabled through `enabledPlugins["plugin@marketplace"]: true`. Force-enable `secure-code` if you rely on its hooks. See [Deploy hooks through managed plugins](https://code.visualstudio.com/docs/enterprise/ai-settings#_deploy-hooks-through-managed-plugins).
- **Copilot CLI:** command `preToolUse` hooks fail closed when they crash, and time out open. These scripts catch every error and return "no decision", so a broken hook never blocks developers. Explicit denials are deliberate.
- **Must-not-bypass controls:** plugin hooks are a developer guardrail. For controls that must not be bypassed, also use [policy hooks](https://docs.github.com/en/copilot/reference/hooks-reference#policy-hooks) (`/etc/github-copilot/policy.d/*.json`) or managed `permissions` rules, plus server-side controls such as push protection and rulesets.
- **Tuning:** you can set `SECURE_CODE_MODE=warn` fleet-wide during a pilot to measure impact before you enforce.

## Observability

- Set `OCTOCAT_PLUGINS_AUDIT_DIR` (for example through MDM or a login script) to write local JSONL decision logs: `ship-ready.jsonl`, `secure-code.jsonl`, and `onboarding-buddy.jsonl`. Secret values are never logged.
- `ONBOARDING_BUDDY_CAPTURE_QUESTIONS=1` also records onboarding questions for FAQ mining. Treat the log as user content: tell users before you enable it and follow your data-retention policy.
- Pair with Copilot usage metrics and the managed `telemetry` settings (OpenTelemetry) for fleet-level adoption data.

## Phased rollout checklist

1. **Security review:** read [security-model.md](security-model.md) and review `plugins/*/scripts/hooks` and `plugins/*/servers`. There are no dependencies and no network calls.
2. **Pilot (1–2 teams):** enable the plugins through `.github/copilot/settings.json` in the pilot repositories, run with `SECURE_CODE_MODE=warn`, and collect feedback and audit logs for two weeks.
3. **Tune:** adjust rules in `plugins/secure-code/servers/security-rules.mjs` and add your glossary to your repositories. Release `1.1.0`.
4. **General availability:** add the plugins to enterprise `enabledPlugins`, switch to `enforce`, and pin `ref` to the release tag.
5. **Operate:** watch the `Validate plugins` workflow, review Dependabot updates for GitHub Actions, and release on a regular cadence.

## Offboarding

Set the plugin to `false` in `enabledPlugins` so clients disable it everywhere, wait for clients to sync (about an hour), then remove the entries. See [uninstall](uninstall.md#remove-repository-and-enterprise-configuration).
