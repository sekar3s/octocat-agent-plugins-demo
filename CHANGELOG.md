# Changelog

Repository-level changes (marketplace, docs, tooling). Each plugin keeps its own changelog in `plugins/<name>/CHANGELOG.md`.

## [1.0.0] - 2026-09-29

### Added
- Marketplace `octocat-agent-plugins` with three Agent Plugins 1.0 plugins: **ship-ready**, **secure-code**, and **onboarding-buddy**.
- Zero-dependency stdio MCP servers (`release-radar`, `vuln-scout`, `repo-atlas`) and cross-client hook runtime.
- Installation, uninstall, enterprise deployment, compatibility, security model, troubleshooting, and architecture docs.
- Demo script with setup/cleanup automation (bash and PowerShell) targeting OctoCAT Supply.
- Spec validator, `node --test` suites, and a GitHub Actions matrix (Linux/macOS/Windows × Node 18/22).
