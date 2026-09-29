# Release checklist

Automated checks (verified by `check_release_artifacts`) are marked 🤖. Everything else needs a human or agent judgement call.

## Code & quality
- 🤖 Working tree is clean and the release is cut from `main`, `release/*`, or `hotfix/*`
- 🤖 Automated tests exist; CI workflows are configured
- CI is green on the release commit (check the latest workflow run)
- No new TODO/FIXME markers in shipped code paths 🤖
- Code-scanning, Dependabot, and secret-scanning alerts reviewed (pair with the **secure-code** plugin)

## Versioning & notes
- 🤖 Version bump matches the change set (breaking → major, feature → minor, fix → patch)
- 🤖 CHANGELOG updated (or drafted with `draft_changelog`)
- 🤖 Package versions are consistent across the monorepo
- User-facing docs and API reference (e.g. Swagger/OpenAPI) updated

## Data & operations
- 🤖 Database migrations identified; each has a tested rollback plan
- Feature flags default to a safe state
- Dashboards/alerts exist for new endpoints or jobs
- On-call and support are aware of the release window

## Supply chain & compliance
- 🤖 Lockfiles are committed
- 🤖 LICENSE and SECURITY.md present
- Third-party license changes reviewed
- Release artifacts are signed/attested where required
