#!/usr/bin/env node
// Security scan report for a repository. Fallback when the vuln-scout MCP server is unavailable.
//   node scan.mjs [--path <repo>] [--changed] [--min-severity low|medium|high|critical] [--include-tests] [--json]
// Suppress a reviewed finding with an inline comment containing "secure-code-ignore".
// Exit code: 0 = no high/critical findings, 1 = high/critical findings present, 2 = usage error.
import path from 'node:path';
import { auditDependencies } from '../../../servers/dependency-audit.mjs';
import { gitTopLevel } from '../../../servers/lib/workspace.mjs';
import { scanInsecurePatterns, scanSecrets } from '../../../servers/scanner.mjs';

const argv = process.argv.slice(2);
const flag = (name) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
};
const target = path.resolve(flag('--path') ?? process.cwd());
const repo = gitTopLevel(target) ?? target;
const options = { changedOnly: argv.includes('--changed'), minSeverity: flag('--min-severity') ?? 'low' };

const secrets = scanSecrets(repo, options);
const code = scanInsecurePatterns(repo, options);
const deps = auditDependencies(repo);

// Findings in test files are reported but don't block unless --include-tests is passed.
const counts = (f) => argv.includes('--include-tests') || !f.test;
const blocking =
  secrets.findings.filter((f) => f.confidence === 'high' && counts(f)).length +
  code.findings.filter((f) => ['critical', 'high'].includes(f.severity) && counts(f)).length +
  deps.summary.critical + deps.summary.high;

const esc = (s) => String(s).replace(/\|/g, '\\|');
const markdown = () => [
  `# Security scan: ${path.basename(repo)}${options.changedOnly ? ' (changed files)' : ''}`,
  '',
  `**Blocking findings:** ${blocking} · Secrets: ${secrets.findings.length} · Code: ${JSON.stringify(code.summary)} · Supply chain: ${JSON.stringify(deps.summary)}`,
  '',
  '## Secrets',
  secrets.findings.length ? '| File | Line | Type | Confidence | Preview |\n|---|---|---|---|---|' : '_None found._',
  ...secrets.findings.map((f) => `| ${f.file} | ${f.line} | ${f.title} | ${f.confidence} | \`${f.preview}\` |`),
  '',
  '## Insecure code patterns',
  code.findings.length ? '| Severity | CWE | File:Line | Issue | Fix |\n|---|---|---|---|---|' : '_None found._',
  ...code.findings.map((f) => `| ${f.severity}${f.test ? ' (test)' : ''} | ${f.cwe} | ${f.file}:${f.line} | ${esc(f.title)} | ${esc(f.fix)} |`),
  '',
  '## Dependencies & workflows',
  deps.findings.length ? '| Severity | Category | Location | Item |\n|---|---|---|---|' : '_None found._',
  ...deps.findings.map((f) => `| ${f.severity} | ${f.category} | ${f.file} | ${esc(f.title)} |`),
  '',
  `> ${deps.note}`,
].join('\n');

console.log(argv.includes('--json') ? JSON.stringify({ repository: repo, blocking, secrets, code, dependencies: deps }, null, 2) : markdown());
// exitCode (not process.exit) so large piped output is fully flushed.
process.exitCode = blocking ? 1 : 0;
