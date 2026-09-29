# Security review report template

```markdown
## 🛡️ Security review — <repo or change>

**Result:** 🔴 Block | 🟡 Ship with follow-ups | 🟢 Clear
**Scope:** <changed files | full repository> · **Scanned:** <n> files

| # | Severity | CWE | Location | Issue | Exploitable? |
|---|---|---|---|---|---|
| 1 | 🔴 High | CWE-78 | api/src/routes/x.ts:42 | Shell command built from request data | Yes — `partner` comes from req.body |

### 1. <Issue title>
**Why it matters:** <one sentence exploit story>
**Fix (minimal):**
<small diff>
**Test:** <test that proves the fix>

### Supply chain
<audit_dependencies highlights>

### False positives / accepted risks
- <finding> — <reason>, owner: <name>

### Next steps
1. <ordered actions>
```
