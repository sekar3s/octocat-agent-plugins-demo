// Workspace scanning shared by the vuln-scout MCP server and the secure-code-review skill script.
import path from 'node:path';
import { git, readText, toPosix, walkFiles } from './lib/workspace.mjs';
import { SEVERITY_ORDER, findCodeIssues, findSecretsWithLines } from './security-rules.mjs';

const SKIP_FILE = /(^|[\\/])(package-lock\.json|pnpm-lock\.yaml|yarn\.lock|.*\.min\.[cm]?js|.*\.map|.*\.(png|jpe?g|gif|ico|svg|woff2?|ttf|pdf|zip|gz|db|sqlite))$/i;
const TEST_FILE = /(^|[\\/])(tests?|__tests__|spec|fixtures?)[\\/]|[._-](test|spec)\.[cm]?[jt]sx?$/i;

/** Files to scan: explicit list, changed files only, or the whole repository. */
export function selectFiles(repo, { files, changedOnly } = {}) {
  if (Array.isArray(files) && files.length) {
    return files.map((f) => path.relative(repo, path.resolve(repo, String(f)))).filter((f) => f && !f.startsWith('..'));
  }
  if (changedOnly) {
    const tracked = git(repo, ['diff', '--name-only', 'HEAD']) ?? '';
    const untracked = git(repo, ['ls-files', '--others', '--exclude-standard']) ?? '';
    return [...new Set(`${tracked}\n${untracked}`.split('\n').filter(Boolean))];
  }
  return [...walkFiles(repo, { maxFiles: 10000 })];
}

export function scanSecrets(repo, options = {}) {
  const findings = [];
  const files = selectFiles(repo, options).filter((f) => !SKIP_FILE.test(f));
  for (const rel of files) {
    const text = readText(repo, rel);
    if (!text) continue;
    for (const f of findSecretsWithLines(text)) findings.push({ file: toPosix(rel), test: TEST_FILE.test(rel), ...f });
    if (findings.length >= (options.maxFindings ?? 200)) break;
  }
  return {
    repository: repo,
    filesScanned: files.length,
    findings,
    guidance: findings.length
      ? 'Rotate any real credential that was committed, move secrets to a secret manager or environment variables, and enable GitHub secret scanning push protection.'
      : 'No secrets detected by the offline rules.',
  };
}

export function scanInsecurePatterns(repo, options = {}) {
  const min = SEVERITY_ORDER[options.minSeverity ?? 'low'] ?? 1;
  const findings = [];
  const files = selectFiles(repo, options).filter((f) => !SKIP_FILE.test(f));
  for (const rel of files) {
    const text = readText(repo, rel);
    if (!text) continue;
    for (const f of findCodeIssues(text, toPosix(rel))) {
      if (SEVERITY_ORDER[f.severity] >= min) findings.push({ file: toPosix(rel), test: TEST_FILE.test(rel), ...f });
    }
    if (findings.length >= (options.maxFindings ?? 300)) break;
  }
  findings.sort((a, b) => SEVERITY_ORDER[b.severity] - SEVERITY_ORDER[a.severity] || a.file.localeCompare(b.file));
  const summary = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const f of findings) summary[f.severity] += 1;
  return { repository: repo, filesScanned: files.length, summary, findings };
}
