// Release-readiness analysis used by the release-radar MCP server and the release-readiness skill script.
import path from 'node:path';
import { exists, git, readJson, readText, toPosix, walkFiles } from './lib/workspace.mjs';

const CONVENTIONAL = /^(?<type>[a-z]+)(?:\((?<scope>[^)]*)\))?(?<bang>!)?:\s*(?<subject>.+)$/i;
const SEMVER = /v?(\d+)\.(\d+)\.(\d+)(?:-[0-9A-Za-z.-]+)?/;
const LOCKFILES = ['package-lock.json', 'pnpm-lock.yaml', 'yarn.lock', 'npm-shrinkwrap.json'];

export function lastTag(repo) {
  const tag = git(repo, ['describe', '--tags', '--abbrev=0']);
  if (!tag) return undefined;
  return { name: tag, date: git(repo, ['log', '-1', '--format=%aI', tag]) };
}

export function classifyCommit(subject, body = '') {
  const m = CONVENTIONAL.exec(subject);
  const breakingBody = /BREAKING[ -]CHANGE/.test(body);
  if (m) {
    return {
      type: m.groups.type.toLowerCase(),
      scope: m.groups.scope || undefined,
      breaking: Boolean(m.groups.bang) || breakingBody,
      conventional: true,
    };
  }
  // Heuristics for repositories that don't use Conventional Commits.
  const s = subject.toLowerCase();
  let type = 'chore';
  if (/\brevert/.test(s)) type = 'revert';
  else if (/\b(fix|fixed|fixes|bug|hotfix|resolve[sd]?|patch)\b/.test(s)) type = 'fix';
  else if (/\b(add|added|adds|new|introduce[sd]?|implement(ed|s)?|feature|support)\b/.test(s)) type = 'feat';
  else if (/\b(doc|docs|readme|documentation)\b/.test(s)) type = 'docs';
  else if (/\b(perf|performance|optimi[sz]e[sd]?|faster)\b/.test(s)) type = 'perf';
  else if (/\b(test|tests|spec)\b/.test(s)) type = 'test';
  return { type, breaking: breakingBody, conventional: false };
}

export function commitsSinceLastTag(repo, { maxCommits = 200 } = {}) {
  const tag = lastTag(repo);
  const range = tag ? [`${tag.name}..HEAD`] : ['HEAD'];
  const limit = Math.max(1, Math.min(Number(maxCommits) || 200, 1000));
  const raw = git(repo, ['log', ...range, `--max-count=${limit}`, '--no-merges', '--format=%H%x1f%s%x1f%an%x1f%aI%x1f%b%x1e']);
  const commits = (raw ?? '')
    .split('\x1e')
    .map((r) => r.trim())
    .filter(Boolean)
    .map((r) => {
      const [sha, subject = '', author, date, body] = r.split('\x1f');
      return { sha: sha.slice(0, 10), subject, author, date, ...classifyCommit(subject, body) };
    });
  const total = Number(git(repo, ['rev-list', '--count', '--no-merges', ...range]) ?? commits.length);
  return {
    repository: repo,
    branch: git(repo, ['rev-parse', '--abbrev-ref', 'HEAD']) ?? null,
    lastTag: tag?.name ?? null,
    lastTagDate: tag?.date ?? null,
    commitCount: total,
    truncated: total > commits.length,
    commits,
  };
}

function packageVersions(repo) {
  const out = [];
  for (const rel of walkFiles(repo, { include: (p) => path.basename(p) === 'package.json', maxFiles: 200 })) {
    const pkg = readJson(repo, rel);
    if (pkg?.version) out.push({ file: toPosix(rel), name: pkg.name, version: pkg.version });
  }
  return out.sort((a, b) => a.file.split('/').length - b.file.split('/').length);
}

export function currentVersion(repo) {
  const tag = lastTag(repo);
  const fromTag = tag && SEMVER.exec(tag.name);
  if (fromTag) return { version: `${fromTag[1]}.${fromTag[2]}.${fromTag[3]}`, source: `git tag ${tag.name}` };
  const cmp = (a, b) => {
    const [x, y] = [SEMVER.exec(a.version), SEMVER.exec(b.version)];
    if (!x || !y) return 0;
    return Number(y[1]) - Number(x[1]) || Number(y[2]) - Number(x[2]) || Number(y[3]) - Number(x[3]);
  };
  const pkg = packageVersions(repo).sort(cmp)[0];
  if (pkg) return { version: pkg.version, source: pkg.file };
  return { version: '0.0.0', source: 'default (no tags or package versions found)' };
}

export function suggestSemverBump(repo, { current } = {}) {
  const { commits, commitCount, lastTag: tag } = commitsSinceLastTag(repo);
  const cur = current ? { version: String(current), source: 'argument' } : currentVersion(repo);
  const m = SEMVER.exec(cur.version) ?? [null, '0', '0', '0'];
  let [major, minor, patch] = [Number(m[1]), Number(m[2]), Number(m[3])];

  const breaking = commits.filter((c) => c.breaking);
  const feats = commits.filter((c) => c.type === 'feat');
  const fixes = commits.filter((c) => ['fix', 'perf', 'revert'].includes(c.type));

  let bump = 'patch';
  if (commitCount === 0) bump = 'none';
  else if (breaking.length) bump = major === 0 ? 'minor' : 'major'; // pre-1.0: breaking changes bump minor
  else if (feats.length) bump = 'minor';

  if (bump === 'major') [major, minor, patch] = [major + 1, 0, 0];
  else if (bump === 'minor') [minor, patch] = [minor + 1, 0];
  else if (bump === 'patch') patch += 1;

  const inferred = commits.filter((c) => !c.conventional).length;
  return {
    current: cur.version,
    currentSource: cur.source,
    since: tag ?? null,
    bump,
    next: bump === 'none' ? cur.version : `${major}.${minor}.${patch}`,
    rationale: [
      `${commitCount} commit(s) since ${tag ?? 'the first commit'}`,
      `${breaking.length} breaking, ${feats.length} feature, ${fixes.length} fix/perf/revert`,
      ...(inferred ? [`${inferred} commit(s) are not Conventional Commits; their type was inferred from the subject line`] : []),
    ],
    breakingChanges: breaking.map((c) => `${c.sha} ${c.subject}`),
  };
}

const SECTIONS = [
  ['breaking', '⚠️ Breaking changes'],
  ['feat', '✨ Features'],
  ['fix', '🐛 Fixes'],
  ['perf', '⚡ Performance'],
  ['docs', '📝 Documentation'],
  ['other', '🧹 Maintenance'],
];

export function draftChangelog(repo, { version } = {}) {
  const data = commitsSinceLastTag(repo);
  const next = version ? String(version) : suggestSemverBump(repo).next;
  const groups = Object.fromEntries(SECTIONS.map(([k]) => [k, []]));
  for (const c of data.commits) {
    const key = c.breaking ? 'breaking' : groups[c.type] && c.type !== 'other' ? c.type : 'other';
    const text = c.conventional ? CONVENTIONAL.exec(c.subject).groups.subject : c.subject;
    groups[key].push(`- ${c.scope ? `**${c.scope}:** ` : ''}${text} (${c.sha.slice(0, 7)})`);
  }
  const lines = [`## [${next}] - ${new Date().toISOString().slice(0, 10)}`, ''];
  for (const [key, title] of SECTIONS) {
    if (groups[key].length) lines.push(`### ${title}`, '', ...groups[key], '');
  }
  if (!data.commits.length) lines.push('_No changes since the last release._', '');
  if (data.truncated) lines.push(`_Showing the latest ${data.commits.length} of ${data.commitCount} commits._`, '');
  return { version: next, since: data.lastTag, commitCount: data.commitCount, markdown: lines.join('\n') };
}

const check = (id, title, status, detail) => ({ id, title, status, detail });

function changedFilesSince(repo, tag) {
  const out = tag ? git(repo, ['diff', '--name-only', `${tag.name}..HEAD`]) : git(repo, ['ls-files']);
  return (out ?? '').split('\n').filter(Boolean);
}

export function checkReleaseArtifacts(repo) {
  const checks = [];
  const tag = lastTag(repo);
  const since = tag?.name ?? 'the first commit';
  const changed = changedFilesSince(repo, tag);

  const changelog = ['CHANGELOG.md', 'CHANGELOG', 'docs/CHANGELOG.md'].find((f) => exists(repo, f));
  if (!changelog) {
    checks.push(check('changelog', 'CHANGELOG present and updated', 'fail', 'No CHANGELOG.md found. Use draft_changelog to create one.'));
  } else {
    const updated = tag ? changed.includes(changelog) : true;
    const hasUnreleased = /##\s*\[?unreleased/i.test(readText(repo, changelog) ?? '');
    checks.push(check('changelog', 'CHANGELOG present and updated', updated || hasUnreleased ? 'pass' : 'warn',
      updated ? `${changelog} changed since ${since}` : `${changelog} has not changed since ${since}`));
  }

  const dirty = (git(repo, ['status', '--porcelain']) ?? '').split('\n').filter(Boolean).length;
  checks.push(check('clean-tree', 'Working tree clean', dirty ? 'warn' : 'pass', dirty ? `${dirty} uncommitted change(s)` : 'No uncommitted changes'));

  const branch = git(repo, ['rev-parse', '--abbrev-ref', 'HEAD']) ?? 'unknown';
  checks.push(check('branch', 'Release-eligible branch', /^(main|master|release\/.+|hotfix\/.+)$/.test(branch) ? 'pass' : 'warn', `Current branch: ${branch}`));

  const workflows = [...walkFiles(repo, { include: (p) => /^\.github[\\/]workflows[\\/][^\\/]+\.ya?ml$/.test(p), maxFiles: 200 })].map(toPosix);
  checks.push(check('ci', 'CI workflows configured', workflows.length ? 'pass' : 'warn', workflows.length ? `${workflows.length} workflow(s): ${workflows.slice(0, 8).join(', ')}` : 'No .github/workflows found'));

  const tests = [...walkFiles(repo, { include: (p) => /[._-](test|spec)\.[cm]?[jt]sx?$|(^|[\\/])test_[^\\/]*\.py$|Tests?\.cs$|_test\.go$/.test(p) })];
  checks.push(check('tests', 'Automated tests present', tests.length ? 'pass' : 'fail', `${tests.length} test file(s) found`));

  const pkgs = packageVersions(repo);
  if (pkgs.length) {
    const missing = pkgs
      .filter((p) => !LOCKFILES.some((l) => exists(repo, path.join(path.dirname(p.file), l)) || exists(repo, l)))
      .map((p) => p.file);
    checks.push(check('lockfiles', 'Dependency lockfiles committed', missing.length ? 'warn' : 'pass',
      missing.length ? `Missing lockfile for: ${missing.join(', ')}` : `${pkgs.length} package(s) have lockfiles`));
  }
  if (pkgs.length > 1) {
    const versions = new Set(pkgs.map((p) => p.version));
    checks.push(check('version-consistency', 'Package versions consistent', versions.size === 1 ? 'pass' : 'warn',
      pkgs.map((p) => `${p.file}@${p.version}`).join(', ')));
  }

  const migrations = changed.filter((f) => /(^|\/)(migrations?|db\/migrate)\//i.test(f));
  checks.push(check('migrations', 'Database migrations reviewed', migrations.length ? 'warn' : 'pass',
    migrations.length ? `${migrations.length} migration file(s) changed since ${since} — confirm rollback plan: ${migrations.slice(0, 10).join(', ')}` : `No migration changes since ${since}`));

  for (const [id, file, title] of [['readme', 'README.md', 'README present'], ['license', 'LICENSE', 'LICENSE present'], ['security-policy', 'SECURITY.md', 'Security policy present']]) {
    const found = [file, `.github/${file}`, `docs/${file}`, `${file}.md`].some((f) => exists(repo, f));
    checks.push(check(id, title, found ? 'pass' : 'warn', found ? `${file} found` : `${file} not found`));
  }

  let markers = 0;
  for (const f of changed.slice(0, 500)) {
    const text = readText(repo, f);
    if (text) markers += (text.match(/\b(TODO|FIXME|XXX)\b/g) ?? []).length;
  }
  checks.push(check('todo-markers', 'No TODO/FIXME markers in changed files', markers ? 'warn' : 'pass', `${markers} marker(s) across ${changed.length} changed file(s)`));

  const summary = { pass: 0, warn: 0, fail: 0 };
  for (const c of checks) summary[c.status] += 1;
  const verdict = summary.fail ? 'NO-GO' : summary.warn ? 'GO WITH CAUTION' : 'GO';
  return { repository: repo, branch, lastTag: tag?.name ?? null, verdict, summary, checks };
}
