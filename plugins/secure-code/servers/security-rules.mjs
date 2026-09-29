// Detection rules shared by the vuln-scout MCP server, the secure-code hooks, and the skill script.
// These are fast, offline, heuristic checks designed to catch high-signal issues early in the
// inner loop. They complement (not replace) CodeQL code scanning, Dependabot, and secret scanning.

export const SEVERITY_ORDER = { critical: 4, high: 3, medium: 2, low: 1 };

// ---------------------------------------------------------------------------------------------
// Secrets. `confidence: 'high'` rules are blocked by the preToolUse hook in enforce mode.
// ---------------------------------------------------------------------------------------------
export const SECRET_RULES = [
  { id: 'aws-access-key-id', title: 'AWS access key ID', confidence: 'high', re: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g },
  { id: 'github-token', title: 'GitHub token', confidence: 'high', re: /\bgh[pousr]_[A-Za-z0-9]{36,255}\b/g },
  { id: 'github-fine-grained-pat', title: 'GitHub fine-grained PAT', confidence: 'high', re: /\bgithub_pat_[A-Za-z0-9_]{50,255}\b/g },
  { id: 'slack-token', title: 'Slack token', confidence: 'high', re: /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/g },
  { id: 'stripe-live-key', title: 'Stripe live secret key', confidence: 'high', re: /\b[rs]k_live_[0-9A-Za-z]{24,}\b/g },
  { id: 'google-api-key', title: 'Google API key', confidence: 'high', re: /\bAIza[0-9A-Za-z_-]{35}\b/g },
  { id: 'private-key', title: 'Private key block', confidence: 'high', re: /-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP |ENCRYPTED )?PRIVATE KEY(?: BLOCK)?-----/g },
  { id: 'azure-storage-connection-string', title: 'Azure Storage connection string', confidence: 'high', re: /DefaultEndpointsProtocol=https?;AccountName=[^;\s]+;AccountKey=[A-Za-z0-9+/=]{40,}/g },
  { id: 'connection-string-password', title: 'Credentials in connection string', confidence: 'medium', re: /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis|amqp|mssql):\/\/[^:\s/'"]+:[^@\s'"]{4,}@[^\s'"]+/g },
  { id: 'jwt', title: 'JSON Web Token', confidence: 'medium', re: /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g },
  {
    id: 'generic-secret-assignment',
    title: 'Hard-coded secret assignment',
    confidence: 'medium',
    re: /\b(?:password|passwd|pwd|secret|api[_-]?key|access[_-]?token|auth[_-]?token|client[_-]?secret)["']?\s*[:=]\s*["']([^"'\s]{8,})["']/gi,
  },
];

const PLACEHOLDER = /^(?:x+|\*+|changeme|change[-_]?me|example|sample|dummy|test|password|secret|your[-_].*|<.*>|\$\{.*\}|\{\{.*\}\}|process\.env.*|os\.environ.*|todo|redacted|placeholder|null|undefined|none)$/i;

// Inline suppression: a finding is skipped when its line, or the line above it, contains
// "secure-code-ignore" (e.g. `// secure-code-ignore: reviewed test fixture`).
const SUPPRESS = /secure-code-ignore/;
function suppressed(text, index) {
  const start = text.lastIndexOf('\n', index) + 1;
  const end = text.indexOf('\n', index);
  const prevStart = start > 0 ? text.lastIndexOf('\n', start - 2) + 1 : start;
  return SUPPRESS.test(text.slice(prevStart, end === -1 ? undefined : end));
}

export function redact(value) {
  if (value.length <= 8) return '****';
  return `${value.slice(0, 4)}…${'*'.repeat(4)}(${value.length} chars)`;
}

export function findSecrets(text) {
  const findings = [];
  for (const rule of SECRET_RULES) {
    rule.re.lastIndex = 0;
    let m;
    while ((m = rule.re.exec(text))) {
      const value = m[1] ?? m[0];
      if (rule.id === 'generic-secret-assignment' && (PLACEHOLDER.test(value) || /^[a-z]+$/i.test(value))) continue;
      if (suppressed(text, m.index)) continue;
      findings.push({ rule: rule.id, title: rule.title, confidence: rule.confidence, index: m.index, preview: redact(value) });
      if (findings.length > 200) return findings;
    }
  }
  return findings;
}

// ---------------------------------------------------------------------------------------------
// Insecure code patterns (OWASP Top 10 / CWE mapped).
// ---------------------------------------------------------------------------------------------
const JS = /\.(?:[cm]?[jt]sx?)$/i;
const PY = /\.py$/i;
const ANY_CODE = /\.(?:[cm]?[jt]sx?|py|java|cs|go|rb|php|kt|scala|swift|rs)$/i;
const CONFIG = /\.(?:ya?ml|json|env|ini|toml|conf|properties|tf|sh|ps1|dockerfile)$|(^|\/)Dockerfile$/i;

export const CODE_RULES = [
  { id: 'sql-injection-template', cwe: 'CWE-89', severity: 'high', files: ANY_CODE, title: 'SQL built with string interpolation',
    re: /[`"'](?:\s*)(?:SELECT|INSERT|UPDATE|DELETE|MERGE|REPLACE)\b[^`"';]*?(?:\$\{|"\s*\+|'\s*\+|%s|\{\w*\}|" ?\. ?\$)/gi,
    fix: 'Use parameterized queries / prepared statements (e.g. db.all("... WHERE id = ?", [id])). Never interpolate user input into SQL. If identifiers (table/column names) must be dynamic, validate them against an allow-list.' },
  { id: 'xss-dangerously-set-inner-html', cwe: 'CWE-79', severity: 'high', files: JS, title: 'React dangerouslySetInnerHTML',
    re: /dangerouslySetInnerHTML\s*=\s*\{\{/g,
    fix: 'Render text as JSX children ({value}) so React escapes it, or sanitize trusted HTML with DOMPurify before rendering.' },
  { id: 'xss-inner-html', cwe: 'CWE-79', severity: 'medium', files: JS, title: 'Assignment to innerHTML/outerHTML or document.write',
    re: /\.(?:inner|outer)HTML\s*=(?!=)|document\.write(?:ln)?\s*\(/g,
    fix: 'Use textContent / createElement, or sanitize with DOMPurify.' },
  { id: 'code-injection-eval', cwe: 'CWE-95', severity: 'high', files: /\.(?:[cm]?[jt]sx?|py|rb|php)$/i, title: 'Dynamic code evaluation',
    re: /(?<![\w.])(?:eval|new\s+Function)\s*\(|\bexec\s*\(\s*(?:compile|input|request)/g,
    fix: 'Remove eval/new Function. Parse data with JSON.parse or use an explicit dispatch table.' },
  { id: 'command-injection-node', cwe: 'CWE-78', severity: 'high', files: JS, title: 'Shell command built from variables',
    re: /\b(?:exec|execSync)\s*\(\s*(?:`[^`]*\$\{|[^,)]*\+\s*\w)/g,
    fix: 'Use execFile/spawn with an argument array (no shell) and validate inputs against an allow-list.' },
  { id: 'command-injection-python', cwe: 'CWE-78', severity: 'high', files: PY, title: 'subprocess with shell=True or os.system',
    re: /\bsubprocess\.\w+\([^)]*shell\s*=\s*True|\bos\.(?:system|popen)\s*\(/g,
    fix: 'Call subprocess.run([...], shell=False) with an argument list.' },
  { id: 'insecure-deserialization', cwe: 'CWE-502', severity: 'high', files: PY, title: 'Unsafe deserialization',
    re: /\bpickle\.loads?\s*\(|\byaml\.load\s*\((?![^)]*SafeLoader)/g,
    fix: 'Use yaml.safe_load / json. Never unpickle untrusted data.' },
  { id: 'weak-hash', cwe: 'CWE-328', severity: 'medium', files: ANY_CODE, title: 'Weak hash algorithm (MD5/SHA-1)',
    re: /createHash\(\s*['"](?:md5|sha1)['"]\s*\)|hashlib\.(?:md5|sha1)\s*\(|MessageDigest\.getInstance\(\s*"(?:MD5|SHA-?1)"\s*\)/gi,
    fix: 'Use SHA-256+ for integrity; use bcrypt/scrypt/Argon2 for passwords.' },
  { id: 'insecure-random', cwe: 'CWE-338', severity: 'low', files: JS, title: 'Math.random() used for a security-sensitive value',
    re: /(?:token|secret|password|nonce|salt|otp|session)\w*\s*[:=][^;\n]*Math\.random\(\)/gi,
    fix: 'Use crypto.randomBytes / crypto.randomUUID.' },
  { id: 'tls-verification-disabled', cwe: 'CWE-295', severity: 'high', files: /./, title: 'TLS certificate verification disabled',
    // secure-code-ignore: detection pattern, not a TLS setting
    re: /rejectUnauthorized\s*:\s*false|NODE_TLS_REJECT_UNAUTHORIZED\s*=\s*['"]?0|verify\s*=\s*False|InsecureSkipVerify\s*:\s*true|ServerCertificateCustomValidationCallback\s*=.*=>\s*true/g,
    fix: 'Keep certificate verification on; trust a private CA via configuration instead.' },
  { id: 'cors-wildcard', cwe: 'CWE-942', severity: 'medium', files: /./, title: 'CORS allows any origin',
    re: /origin\s*:\s*(?:['"]\*['"]|true\b)|Access-Control-Allow-Origin['"]?\s*[:,]\s*['"]\*['"]|AllowAnyOrigin\(\)/g,
    fix: 'Restrict origins to an explicit allow-list loaded from configuration.' },
  { id: 'path-traversal', cwe: 'CWE-22', severity: 'high', files: JS, title: 'File path built from request input',
    re: /\b(?:sendFile|readFile(?:Sync)?|createReadStream|writeFile(?:Sync)?)\s*\([^)]*\breq\.(?:params|query|body)/g,
    fix: 'Resolve against a fixed base directory and verify the result stays inside it; prefer IDs over file names.' },
  { id: 'open-redirect', cwe: 'CWE-601', severity: 'medium', files: JS, title: 'Redirect to request-controlled URL',
    re: /\bredirect\s*\(\s*req\.(?:query|params|body)/g,
    fix: 'Redirect only to relative paths or an allow-list of hosts.' },
  { id: 'hardcoded-jwt-secret', cwe: 'CWE-798', severity: 'high', files: JS, title: 'JWT signed/verified with a literal secret',
    re: /\bjwt\.(?:sign|verify)\s*\([^,]+,\s*['"][^'"]{3,}['"]/g,
    fix: 'Load signing keys from a secret manager or environment variable; rotate the exposed key.' },
  { id: 'debug-enabled', cwe: 'CWE-489', severity: 'medium', files: PY, title: 'Debug mode enabled',
    re: /\.run\([^)]*debug\s*=\s*True|DEBUG\s*=\s*True/g,
    fix: 'Drive debug mode from environment configuration and default it to off.' },
  { id: 'cleartext-http', cwe: 'CWE-319', severity: 'low', files: /./, title: 'Cleartext HTTP URL',
    re: /['"]http:\/\/(?!localhost|host\.docker\.internal|127\.0\.0\.1|0\.0\.0\.0|\[::1\]|[\w.-]*\.local\b|schemas\.|www\.w3\.org|json-schema\.org|example\.(?:com|org))[^'"\s]+['"]/g,
    fix: 'Use HTTPS for all non-local endpoints.' },
  { id: 'sensitive-logging', cwe: 'CWE-532', severity: 'low', files: ANY_CODE, title: 'Sensitive value written to logs',
    re: /\b(?:console\.(?:log|info|debug)|logger\.\w+|print)\s*\([^)]*\b(?:password|passwd|secret|token|apiKey|api_key)\b/gi,
    fix: 'Remove secrets from logs or redact them before logging.' },
  { id: 'client-side-auth', cwe: 'CWE-602', severity: 'medium', files: /\.(?:jsx|tsx)$/i, title: 'Authentication decided in client-side code',
    re: /if\s*\(\s*email\s*&&\s*password\s*\)|localStorage\.setItem\(\s*['"](?:isAdmin|isLoggedIn|role)['"]/g,
    fix: 'Authenticate on the server and treat client state as untrusted.' },
];

export const CONFIG_FILES = CONFIG;

function lineOf(text, index) {
  let line = 1;
  for (let i = 0; i < index && i < text.length; i++) if (text.charCodeAt(i) === 10) line++;
  return line;
}

function snippet(text, index) {
  const start = text.lastIndexOf('\n', index) + 1;
  const end = text.indexOf('\n', index);
  return text.slice(start, end === -1 ? undefined : end).trim().slice(0, 200);
}

export function findCodeIssues(text, file = 'snippet.ts') {
  const findings = [];
  for (const rule of CODE_RULES) {
    if (!rule.files.test(file)) continue;
    rule.re.lastIndex = 0;
    let m;
    while ((m = rule.re.exec(text))) {
      if (suppressed(text, m.index)) continue;
      findings.push({
        rule: rule.id, cwe: rule.cwe, severity: rule.severity, title: rule.title,
        line: lineOf(text, m.index), snippet: snippet(text, m.index), fix: rule.fix,
      });
      if (findings.length > 200) return findings;
    }
  }
  return findings;
}

export function findSecretsWithLines(text) {
  return findSecrets(text).map(({ index, ...f }) => ({ ...f, line: lineOf(text, index) }));
}

// ---------------------------------------------------------------------------------------------
// Dangerous shell commands, evaluated by the preToolUse hook.
// ---------------------------------------------------------------------------------------------
export const SHELL_RULES = [
  { id: 'pipe-to-shell', level: 'deny', re: /\b(?:curl|wget|iwr|Invoke-WebRequest)\b[^|\n]*\|\s*(?:sudo\s+)?(?:ba|z|da)?sh\b|\biex\s*\(\s*(?:iwr|irm|New-Object)/i, reason: 'Piping a downloaded script straight into a shell executes unreviewed remote code (CWE-494).' },
  { id: 'recursive-delete-root', level: 'deny', re: /\brm\s+-(?=[a-z]{0,10}r)(?=[a-z]{0,10}f)[a-z]{1,12}\s+(?:--no-preserve-root\s+)?(?:\/|~|\$HOME|\*|\.\/?\*?)(?:\s|$)/i, reason: 'Recursive force-delete of a root, home, or wildcard path.' },
  { id: 'world-writable', level: 'deny', re: /\bchmod\s+(?:-R\s+)?0?777\b/, reason: 'chmod 777 makes files world-writable (CWE-732).' },
  { id: 'disk-wipe', level: 'deny', re: /\bmkfs(?:\.\w+)?\b|\bdd\b[^\n]*\bof=\/dev\/(?!null)/, reason: 'Command can overwrite a disk or partition.' },
  { id: 'fork-bomb', level: 'deny', re: /:\(\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;\s*:/, reason: 'Fork bomb.' },
  // secure-code-ignore: detection pattern, not a TLS setting
  { id: 'disable-tls', level: 'deny', re: /\b(?:npm|yarn|pnpm)\s+config\s+set\s+strict-ssl\s+false|git\s+config[^\n]*http\.sslVerify\s+false|NODE_TLS_REJECT_UNAUTHORIZED=0|pip[^\n]*--trusted-host/i, reason: 'Disables TLS verification for package or git traffic (CWE-295).' },
  { id: 'read-private-keys', level: 'deny', re: /\b(?:cat|type|less|more|head|tail|cp|scp|base64)\b[^\n|]*(?:\.ssh\/id_[a-z0-9]+(?!\.pub)\b|\.aws\/credentials|\.azure\/accessTokens|\.config\/gh\/hosts\.yml|\.docker\/config\.json)/i, reason: 'Reads local credential files; secrets must not enter the chat context.' },
  { id: 'env-exfiltration', level: 'deny', re: /(?:^|[;&|]\s*)(?:env|printenv)(?:\s+[^|\n;&]*)?\s*\|(?!\|)\s*(?:curl|wget|nc|ncat)\b/, reason: 'Sends environment variables over the network.' },
  { id: 'skip-git-hooks', level: 'ask', re: /\bgit\s+(?:commit|push)\b[^\n]*--no-verify\b/, reason: '--no-verify skips pre-commit/pre-push security checks.' },
  { id: 'read-dotenv', level: 'ask', re: /\b(?:cat|type|less|more|head|tail)\s+(?:[^\n|]*[\s/])?\.env(?:\.(?!example|sample|template)\w+)?(?:\s|$)/i, reason: 'Reading .env files can expose secrets to the model.' },
  { id: 'sudo', level: 'ask', re: /(?:^|[;&|]\s*)sudo\s+/, reason: 'Command requests elevated privileges.' },
];

export function evaluateShellCommand(command) {
  const matches = SHELL_RULES.filter((r) => r.re.test(command));
  const deny = matches.find((m) => m.level === 'deny');
  return deny ? { level: 'deny', rule: deny } : matches.length ? { level: 'ask', rule: matches[0] } : undefined;
}

export function isSensitiveTargetPath(p) {
  return /(^|[\\/])\.env(\.(?!example$|sample$|template$)[\w.-]+)?$/i.test(p) || /(^|[\\/])id_(rsa|ed25519|ecdsa)$/.test(p) || /\.(pem|p12|pfx|key)$/i.test(p);
}
