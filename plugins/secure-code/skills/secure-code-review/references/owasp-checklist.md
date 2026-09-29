# OWASP Top 10 (2021) review checklist

Items marked 🤖 are partially covered by `vuln-scout`. The rest need a reviewer (human or agent) reading the code.

| # | Category | What to check |
|---|---|---|
| A01 | Broken Access Control | Every route enforces authN **and** authZ server-side; object IDs are checked against the caller (IDOR); 🤖 path traversal; 🤖 open redirects; CORS 🤖 |
| A02 | Cryptographic Failures | 🤖 weak hashes (MD5/SHA-1); passwords use bcrypt/scrypt/Argon2; 🤖 cleartext HTTP; secrets never in code 🤖 |
| A03 | Injection | 🤖 SQL built from strings; 🤖 shell commands with interpolation; 🤖 XSS sinks (`dangerouslySetInnerHTML`, `innerHTML`); 🤖 `eval` |
| A04 | Insecure Design | 🤖 client-side auth decisions; rate limits on login/OTP; abuse cases considered |
| A05 | Security Misconfiguration | 🤖 debug mode; 🤖 permissive CORS; security headers (helmet/CSP); verbose error messages |
| A06 | Vulnerable & Outdated Components | 🤖 unpinned/unknown dependencies; 🤖 known-compromised packages; Dependabot enabled |
| A07 | Identification & Authentication Failures | 🤖 hard-coded JWT secrets; session expiry; MFA for admin paths |
| A08 | Software & Data Integrity Failures | 🤖 unsafe deserialization; 🤖 unpinned GitHub Actions; 🤖 `pull_request_target` misuse; signed artifacts |
| A09 | Logging & Monitoring Failures | 🤖 secrets in logs; security events are logged and alerted |
| A10 | Server-Side Request Forgery | Outbound URLs built from user input are allow-listed; metadata endpoints blocked |

## Fast-fix patterns

- **SQL:** `db.all('SELECT * FROM t WHERE id = ?', [id])`; allow-list dynamic identifiers.
- **XSS (React):** render `{message}` instead of `dangerouslySetInnerHTML`.
- **Command injection (Node):** `execFile('notify', [partner])` + allow-list `partner`.
- **Secrets:** `process.env.X` / Key Vault / GitHub Actions secrets; rotate the leaked value.
- **CORS:** `cors({ origin: allowedOrigins })` from configuration.
