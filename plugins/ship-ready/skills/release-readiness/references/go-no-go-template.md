# Go / No-Go template

```markdown
## 🚦 Release readiness — <repo> <current> → <next>

**Verdict:** GO | GO WITH CAUTION | NO-GO
**Branch:** <branch> · **Last tag:** <tag or none> · **Commits since:** <n>

### Blockers (must fix)
- ❌ <check> — <why it matters> → <fix>

### Warnings (fix or accept the risk)
- ⚠️ <check> — <detail> → <recommendation>

### Passed
✅ <check>, ✅ <check>, …

### Suggested version
<current> → **<next>** (<bump>) — <one-line rationale>

### Draft release notes
<draft_changelog markdown>

### Next steps
1. <ordered, concrete actions — e.g. "Add CHANGELOG.md with the draft above">
2. When all blockers are resolved: `git tag v<next> && git push origin v<next>` (requires confirmation)
```
