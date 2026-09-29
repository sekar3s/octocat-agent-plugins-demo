// Offline dependency & CI supply-chain audit for vuln-scout.
// Heuristic only — pair with Dependabot / `npm audit` / GitHub Advisory Database for CVE coverage.
import path from 'node:path';
import { exists, readJson, readText, toPosix, walkFiles } from './lib/workspace.mjs';

// Packages involved in well-known npm supply-chain incidents or deprecated for security reasons.
const RISKY_NPM = {
  'event-stream': { versions: ['3.3.6'], note: 'Compromised release (flatmap-stream backdoor, 2018).' },
  'flatmap-stream': { versions: ['*'], note: 'Malicious package from the event-stream incident.' },
  'ua-parser-js': { versions: ['0.7.29', '0.8.0', '1.0.0'], note: 'Hijacked releases shipped malware (2021).' },
  coa: { versions: ['2.0.3', '2.0.4', '2.1.1', '2.1.3', '3.0.1', '3.1.3'], note: 'Hijacked releases shipped malware (2021).' },
  rc: { versions: ['1.2.9', '1.3.9', '2.3.9'], note: 'Hijacked releases shipped malware (2021).' },
  'node-ipc': { versions: ['10.1.1', '10.1.2', '10.1.3'], note: 'Protestware releases that overwrote files (2022).' },
  colors: { versions: ['1.4.1', '1.4.2', '1.4.44-liberty-2'], note: 'Sabotaged releases (2022).' },
  faker: { versions: ['6.6.6'], note: 'Sabotaged release (2022); use @faker-js/faker.' },
  request: { versions: ['*'], note: 'Deprecated and unmaintained since 2020; no security fixes.' },
  crypto: { versions: ['*'], note: 'Deprecated npm shim; use the built-in node:crypto module.' },
};

const finding = (severity, category, file, title, detail, fix) => ({ severity, category, file, title, detail, fix });

function auditPackageJson(repo, rel, out) {
  const pkg = readJson(repo, rel);
  if (!pkg) return;
  const dir = path.dirname(rel);
  const lock = ['package-lock.json', 'npm-shrinkwrap.json', 'pnpm-lock.yaml', 'yarn.lock'].some(
    (l) => exists(repo, path.join(dir, l)) || exists(repo, l),
  );
  const hasDeps = ['dependencies', 'devDependencies', 'optionalDependencies'].some((k) => Object.keys(pkg[k] ?? {}).length);
  if (!lock && hasDeps) out.push(finding('medium', 'reproducibility', rel, 'No lockfile', 'Builds can resolve different (possibly compromised) versions.', 'Commit package-lock.json (or pnpm/yarn lockfile) and use `npm ci` in CI.'));

  for (const section of ['dependencies', 'devDependencies', 'optionalDependencies']) {
    for (const [name, spec] of Object.entries(pkg[section] ?? {})) {
      const s = String(spec);
      const risky = RISKY_NPM[name];
      if (risky && (risky.versions.includes('*') || risky.versions.some((v) => s.replace(/^[\^~=]/, '') === v))) {
        out.push(finding(risky.versions.includes('*') ? 'medium' : 'critical', 'known-risky-package', rel, `${name}@${s}`, risky.note, `Remove or replace ${name}.`));
      }
      if (s === '*' || s === 'latest' || s === '' || /^>=?\s*\d/.test(s)) {
        out.push(finding('high', 'unpinned', rel, `${name}@"${s}" (${section})`, 'Unbounded version range accepts any future release.', 'Pin to a caret/tilde range or exact version.'));
      } else if (/^(git\+|git:|github:|https?:|file:|link:)/.test(s) || /^[\w-]+\/[\w.-]+(#.*)?$/.test(s)) {
        out.push(finding('medium', 'non-registry-source', rel, `${name}@${s}`, 'Dependency is fetched outside the registry (no integrity/advisory coverage).', 'Publish to your private registry or pin to an immutable commit SHA.'));
      }
    }
  }
  for (const [hook, cmd] of Object.entries(pkg.scripts ?? {})) {
    if (/^(pre|post)?install$/.test(hook) && /\b(curl|wget|node\s+-e|bash\s+-c)\b/.test(String(cmd))) {
      out.push(finding('high', 'install-script', rel, `scripts.${hook}`, `Install script runs: ${String(cmd).slice(0, 120)}`, 'Avoid network or inline code execution in install scripts.'));
    }
  }
}

function auditRequirements(repo, rel, out) {
  const text = readText(repo, rel) ?? '';
  for (const [i, raw] of text.split('\n').entries()) {
    const line = raw.replace(/#.*/, '').trim();
    if (!line || line.startsWith('-')) continue;
    if (!/==|===|@\s*\S+#sha|--hash/.test(line)) {
      out.push(finding('low', 'unpinned', `${rel}:${i + 1}`, line, 'Requirement is not pinned to an exact version.', 'Pin with == (and ideally --hash) or use a lock tool such as pip-tools/uv/poetry.'));
    }
  }
}

function auditWorkflow(repo, rel, out) {
  const text = readText(repo, rel) ?? '';
  const lines = text.split('\n');
  lines.forEach((line, i) => {
    const m = /^\s*-?\s*uses:\s*([^\s#]+)/.exec(line);
    if (m && !m[1].startsWith('./') && !m[1].startsWith('docker://')) {
      const ref = m[1].split('@')[1] ?? '';
      if (!/^[0-9a-f]{40}$/.test(ref)) {
        const firstParty = /^(actions|github)\//.test(m[1]);
        out.push(finding(firstParty ? 'low' : 'medium', 'unpinned-action', `${rel}:${i + 1}`, m[1], 'Action is referenced by a mutable tag/branch.', 'Pin third-party actions to a full commit SHA (keep the tag in a comment) and let Dependabot update it.'));
      }
    }
  });
  if (/\bpull_request_target\b/.test(text) && /ref:\s*\$\{\{\s*github\.event\.pull_request\.head\.(sha|ref)/.test(text)) {
    out.push(finding('critical', 'workflow-injection', rel, 'pull_request_target checks out untrusted PR code', 'Untrusted code runs with a write token and secrets.', 'Use pull_request, or never check out/execute PR head code in pull_request_target jobs.'));
  }
  if (/\$\{\{\s*github\.event\.(issue|pull_request|comment|review)\.(title|body)[^}]*\}\}/.test(text) && /\brun:/.test(text)) {
    out.push(finding('high', 'workflow-injection', rel, 'Untrusted event text interpolated into a run step', 'Issue/PR titles or bodies can inject shell commands (CWE-78).', 'Pass the value through an env variable and quote it in the script.'));
  }
  if (/permissions:\s*write-all/.test(text)) {
    out.push(finding('medium', 'excessive-permissions', rel, 'permissions: write-all', 'GITHUB_TOKEN has write access to everything.', 'Declare least-privilege permissions per job.'));
  } else if (!/^\s*permissions:/m.test(text)) {
    out.push(finding('low', 'excessive-permissions', rel, 'No explicit permissions block', 'Token permissions fall back to the repository/organization default.', 'Add a top-level `permissions: contents: read` and elevate per job.'));
  }
}

export function auditDependencies(repo) {
  const out = [];
  const manifests = [];
  for (const rel of walkFiles(repo, { maxFiles: 20000 })) {
    const base = path.basename(rel);
    const posix = toPosix(rel);
    if (base === 'package.json') { manifests.push(posix); auditPackageJson(repo, rel, out); }
    else if (/^requirements.*\.txt$/.test(base)) { manifests.push(posix); auditRequirements(repo, rel, out); }
    else if (/^\.github\/workflows\/[^/]+\.ya?ml$/.test(posix)) { manifests.push(posix); auditWorkflow(repo, rel, out); }
  }
  const bySeverity = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const f of out) bySeverity[f.severity] += 1;
  return {
    repository: repo,
    scanned: manifests,
    summary: bySeverity,
    findings: out.map((f) => ({ ...f, file: toPosix(f.file) })),
    note: 'Offline heuristics. For CVE coverage enable Dependabot alerts and run `npm audit` / `pip-audit` in CI.',
  };
}
