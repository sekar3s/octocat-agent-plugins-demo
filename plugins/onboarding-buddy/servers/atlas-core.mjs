// Repository understanding used by the repo-atlas MCP server, onboarding hooks, and the day-one-setup skill.
import fs from 'node:fs';
import path from 'node:path';
import { exists, git, readJson, readText, toPosix, walkFiles } from './lib/workspace.mjs';

const LANGUAGES = {
  '.ts': 'TypeScript', '.tsx': 'TypeScript (React)', '.js': 'JavaScript', '.jsx': 'JavaScript (React)', '.mjs': 'JavaScript', '.cjs': 'JavaScript',
  '.py': 'Python', '.cs': 'C#', '.java': 'Java', '.kt': 'Kotlin', '.go': 'Go', '.rs': 'Rust', '.rb': 'Ruby', '.php': 'PHP',
  '.sql': 'SQL', '.bicep': 'Bicep', '.tf': 'Terraform', '.sh': 'Shell', '.ps1': 'PowerShell', '.css': 'CSS', '.scss': 'SCSS', '.html': 'HTML',
};

const FRAMEWORKS = {
  express: 'Express', fastify: 'Fastify', '@nestjs/core': 'NestJS', koa: 'Koa', next: 'Next.js', react: 'React', vue: 'Vue', svelte: 'Svelte',
  '@angular/core': 'Angular', vite: 'Vite', tailwindcss: 'Tailwind CSS', vitest: 'Vitest', jest: 'Jest', mocha: 'Mocha', '@playwright/test': 'Playwright',
  cypress: 'Cypress', sqlite3: 'SQLite', 'better-sqlite3': 'SQLite', prisma: 'Prisma', typeorm: 'TypeORM', mongoose: 'MongoDB (Mongoose)', pg: 'PostgreSQL',
  'swagger-ui-express': 'Swagger UI', typescript: 'TypeScript', '@cucumber/cucumber': 'Cucumber',
};

const DIR_PURPOSE = [
  [/^(api|server|backend|service|services)$/i, 'Backend / API service'],
  [/^(frontend|web|client|ui|app)$/i, 'Frontend application'],
  [/^(docs?|documentation)$/i, 'Documentation'],
  [/^(infra|infrastructure|deploy|deployment|terraform|bicep|k8s|helm|charts)$/i, 'Infrastructure as code / deployment'],
  [/^(tests?|e2e|spec|__tests__)$/i, 'Tests'],
  [/^(scripts|tools|bin)$/i, 'Developer scripts and tooling'],
  [/^\.github$/, 'GitHub configuration (workflows, Copilot customizations, templates)'],
  [/^\.devcontainer$/, 'Dev container definition (Codespaces / VS Code)'],
  [/^\.vscode$/, 'Shared VS Code settings'],
  [/^(database|db|migrations)$/i, 'Database schema and migrations'],
  [/^(demo|samples?|examples?)$/i, 'Demos and examples'],
  [/^(packages|libs|shared|common)$/i, 'Shared packages / libraries'],
];

function packageJsons(repo) {
  return [...walkFiles(repo, { include: (p) => path.basename(p) === 'package.json', maxFiles: 50000 })]
    .map((rel) => ({ rel: toPosix(rel), dir: toPosix(path.dirname(rel)), pkg: readJson(repo, rel) }))
    .filter((p) => p.pkg)
    .sort((a, b) => a.rel.split('/').length - b.rel.split('/').length);
}

export function detectStack(repo) {
  const languages = {};
  let total = 0;
  for (const rel of walkFiles(repo, { maxFiles: 20000 })) {
    const lang = LANGUAGES[path.extname(rel).toLowerCase()];
    if (!lang) continue;
    languages[lang] = (languages[lang] ?? 0) + 1;
    total++;
  }
  const frameworks = new Set();
  const packages = packageJsons(repo).map(({ dir, pkg }) => {
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    for (const name of Object.keys(deps)) if (FRAMEWORKS[name]) frameworks.add(FRAMEWORKS[name]);
    return { dir, name: pkg.name, scripts: Object.keys(pkg.scripts ?? {}) };
  });
  if (exists(repo, 'requirements.txt') || exists(repo, 'pyproject.toml')) frameworks.add('Python packaging');
  if (exists(repo, 'Dockerfile') || exists(repo, 'docker-compose.yml') || exists(repo, 'compose.yaml')) frameworks.add('Docker');
  const csproj = [...walkFiles(repo, { include: (p) => /\.(csproj|sln)$/.test(p), maxFiles: 5 })];
  if (csproj.length) frameworks.add('.NET');
  return {
    languages: Object.entries(languages)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([name, files]) => ({ name, files, share: `${Math.round((files / Math.max(total, 1)) * 100)}%` })),
    frameworks: [...frameworks].sort(),
    packages,
  };
}

export function mapRepository(repo) {
  const top = fs
    .readdirSync(repo, { withFileTypes: true })
    .filter((d) => !['.git', 'node_modules'].includes(d.name))
    .map((d) => {
      const purpose = d.isDirectory() ? DIR_PURPOSE.find(([re]) => re.test(d.name))?.[1] : undefined;
      return { name: d.isDirectory() ? `${d.name}/` : d.name, purpose };
    });
  const docs = [...walkFiles(repo, { include: (p) => /\.md$/i.test(p) && !/node_modules|CHANGELOG/i.test(p), maxFiles: 50000 })]
    .map(toPosix)
    .filter((p) => !p.startsWith('.github/') || /copilot-instructions|CONTRIBUTING|instructions\//.test(p))
    .slice(0, 40);
  const workflows = [...walkFiles(repo, { include: (p) => /^\.github[\\/]workflows[\\/][^\\/]+\.ya?ml$/.test(p) })].map(toPosix);
  const entryPoints = [];
  for (const { dir, pkg } of packageJsons(repo)) {
    if (pkg.main) entryPoints.push(`${dir}/${pkg.main}`.replace(/^\.\//, ''));
    for (const s of ['dev', 'start']) if (pkg.scripts?.[s]) entryPoints.push(`${dir}: npm run ${s} → ${pkg.scripts[s]}`);
  }
  const lastCommit = git(repo, ['log', '-1', '--format=%h %s (%ar)']);
  return {
    repository: repo,
    name: path.basename(repo),
    lastCommit,
    stack: detectStack(repo),
    topLevel: top,
    entryPoints,
    docs,
    ciWorkflows: workflows,
    copilotCustomizations: ['.github/copilot-instructions.md', '.github/instructions', '.github/agents', '.github/skills', '.github/prompts', '.github/hooks', 'AGENTS.md']
      .filter((p) => exists(repo, p)),
  };
}

function markdownSections(text, headingPattern) {
  const lines = text.split('\n');
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const m = /^(#{1,4})\s+(.*)$/.exec(lines[i]);
    if (!m || !headingPattern.test(m[2])) continue;
    const level = m[1].length;
    const body = [lines[i]];
    for (let j = i + 1; j < lines.length; j++) {
      const n = /^(#{1,4})\s/.exec(lines[j]);
      if (n && n[1].length <= level) break;
      body.push(lines[j]);
    }
    out.push(body.join('\n').trim().slice(0, 4000));
  }
  return out;
}

export function findSetupSteps(repo) {
  const prerequisites = [];
  const nvmrc = readText(repo, '.nvmrc') ?? readText(repo, '.node-version');
  if (nvmrc) prerequisites.push(`Node.js ${nvmrc.trim()} (from .nvmrc)`);
  const tools = readText(repo, '.tool-versions');
  if (tools) prerequisites.push(...tools.split('\n').filter(Boolean).map((l) => `${l.trim()} (from .tool-versions)`));
  const pkgs = packageJsons(repo);
  const engines = pkgs.find((p) => p.pkg.engines?.node);
  if (engines) prerequisites.push(`Node.js ${engines.pkg.engines.node} (engines in ${engines.rel})`);
  else if (pkgs.length && !nvmrc) prerequisites.push('Node.js (LTS recommended) and npm');
  if (exists(repo, 'requirements.txt') || exists(repo, 'pyproject.toml')) prerequisites.push('Python 3 (see pyproject.toml / requirements.txt)');
  if (exists(repo, 'docker-compose.yml') || exists(repo, 'compose.yaml') || exists(repo, 'Dockerfile')) prerequisites.push('Docker (optional, for containers)');
  if (exists(repo, 'Makefile')) prerequisites.push('make');
  prerequisites.push('git', 'GitHub CLI `gh` (recommended)');

  const install = [];
  const run = [];
  for (const { dir, pkg } of pkgs) {
    if (dir.includes('node_modules')) continue;
    const where = dir === '.' ? '' : `cd ${dir} && `;
    const hasLock = exists(repo, path.join(dir, 'package-lock.json')) || exists(repo, 'package-lock.json');
    install.push(`${where}${hasLock ? 'npm ci' : 'npm install'}`);
    for (const s of ['dev', 'start', 'build', 'test', 'lint']) {
      if (pkg.scripts?.[s]) run.push({ where: dir, command: `${where}npm run ${s}`, script: pkg.scripts[s] });
    }
  }
  const makeTargets = (readText(repo, 'Makefile') ?? '')
    .split('\n')
    .map((l) => /^([a-zA-Z][\w-]*):(?!=)/.exec(l)?.[1])
    .filter(Boolean)
    .slice(0, 20);

  const readme = readText(repo, 'README.md') ?? '';
  const guide = markdownSections(readme, /(getting started|quick ?start|setup|set up|install|running|run locally|development|prerequisites)/i);
  const contributing = ['CONTRIBUTING.md', '.github/CONTRIBUTING.md', 'docs/CONTRIBUTING.md'].find((f) => exists(repo, f));
  return {
    repository: repo,
    devcontainer: exists(repo, '.devcontainer') ? 'Available — open in a Codespace or "Dev Containers: Reopen in Container" for a zero-setup environment.' : null,
    prerequisites: [...new Set(prerequisites)],
    install,
    run,
    makeTargets,
    readmeGuidance: guide,
    contributingGuide: contributing ?? null,
  };
}

// CODEOWNERS: last matching pattern wins (gitignore-style subset).
function codeownersPatternToRegex(pattern) {
  let p = pattern.trim();
  const anchored = p.startsWith('/');
  if (anchored) p = p.slice(1);
  const dirOnly = p.endsWith('/');
  if (dirOnly) p = p.slice(0, -1);
  const body = p
    .split('/')
    .map((seg) => (seg === '**' ? '(?:.*/)?' : `${seg.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*').replace(/\?/g, '[^/]')}/`))
    .join('')
    .replace(/\(\?:\.\*\/\)\?$/, '.*')
    .replace(/\/$/, '');
  const prefix = anchored || p.includes('/') ? '^' : '(?:^|.*/)';
  return new RegExp(`${prefix}${body}(?:/.*)?$`);
}

export function whoOwns(repo, file) {
  const rel = toPosix(path.relative(repo, path.resolve(repo, file)));
  const location = ['.github/CODEOWNERS', 'CODEOWNERS', 'docs/CODEOWNERS'].find((f) => exists(repo, f));
  let owners = [];
  let rule = null;
  if (location) {
    for (const line of (readText(repo, location) ?? '').split('\n')) {
      const clean = line.replace(/#.*/, '').trim();
      if (!clean) continue;
      const [pattern, ...who] = clean.split(/\s+/);
      if (pattern === '*' || codeownersPatternToRegex(pattern).test(rel)) {
        owners = who;
        rule = pattern;
      }
    }
  }
  const log = git(repo, ['log', '--format=%an', '-n', '200', '--', rel]) ?? '';
  const counts = {};
  for (const name of log.split('\n').filter(Boolean)) counts[name] = (counts[name] ?? 0) + 1;
  const recentContributors = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([name, commits]) => ({ name, commits }));
  return {
    file: rel,
    codeownersFile: location ?? null,
    matchedRule: rule,
    owners,
    recentContributors,
    tip: owners.length
      ? 'Code owners are auto-requested for review on pull requests touching this path.'
      : 'No CODEOWNERS rule matches. Ask recent contributors, or propose a CODEOWNERS entry.',
  };
}

export function loadGlossary(repo, bundledPath) {
  const entries = {};
  const add = (term, definition, source) => {
    if (term && definition) entries[term.toLowerCase()] = { term, definition: definition.trim(), source };
  };
  if (bundledPath && fs.existsSync(bundledPath)) {
    for (const [term, definition] of Object.entries(JSON.parse(fs.readFileSync(bundledPath, 'utf8')))) add(term, definition, 'onboarding-buddy');
  }
  for (const rel of ['.github/onboarding/glossary.json', 'docs/glossary.json']) {
    const data = readJson(repo, rel);
    if (data) for (const [term, definition] of Object.entries(data)) add(term, String(definition), rel);
  }
  for (const rel of ['GLOSSARY.md', 'docs/GLOSSARY.md', 'docs/glossary.md']) {
    const text = readText(repo, rel);
    if (!text) continue;
    for (const line of text.split('\n')) {
      const m = /^\s*[-*]\s+\*\*(.+?)\*\*\s*[:—-]\s*(.+)$/.exec(line) ?? /^\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|/.exec(line);
      if (m && !/^-+$/.test(m[1]) && m[1].toLowerCase() !== 'term') add(m[1], m[2], rel);
    }
  }
  return entries;
}

export function suggestFirstTasks(repo) {
  const suggestions = [];
  const markers = [];
  for (const rel of walkFiles(repo, { include: (p) => /\.(?:[cm]?[jt]sx?|py|cs|go|java)$/.test(p), maxFiles: 5000 })) {
    const text = readText(repo, rel);
    if (!text) continue;
    text.split('\n').forEach((line, i) => {
      const m = /\b(TODO|FIXME)\b[:\s]*(.*)/.exec(line);
      if (m && markers.length < 10) markers.push({ file: toPosix(rel), line: i + 1, note: m[2].trim().slice(0, 120) });
    });
  }
  if (markers.length) suggestions.push({ kind: 'todo', title: 'Resolve a TODO/FIXME left in the code', items: markers });

  const sources = [...walkFiles(repo, { include: (p) => /[\\/](routes|controllers|services|repositories)[\\/][^\\/]+\.[jt]s$/.test(p) && !/\.(test|spec)\./.test(p) })].map(toPosix);
  const untested = sources.filter((f) => !/\.d\.ts$/.test(f) && !exists(repo, f.replace(/\.([jt]s)$/, '.test.$1')) && !exists(repo, f.replace(/\.([jt]s)$/, '.spec.$1')));
  if (untested.length) suggestions.push({ kind: 'tests', title: 'Add unit tests for a module without tests (great way to learn the code)', items: untested.slice(0, 10) });

  const readme = readText(repo, 'README.md') ?? '';
  const missing = ['Getting started', 'Architecture', 'Contributing', 'Troubleshooting'].filter((s) => !new RegExp(s, 'i').test(readme));
  if (missing.length) suggestions.push({ kind: 'docs', title: 'Improve onboarding docs while the experience is fresh', items: missing.map((s) => `README is missing a "${s}" section`) });

  suggestions.push({ kind: 'issues', title: 'Pick a labeled starter issue', items: ['gh issue list --label "good first issue" --state open', 'gh issue list --label "help wanted" --state open'] });
  return { repository: repo, suggestions };
}
