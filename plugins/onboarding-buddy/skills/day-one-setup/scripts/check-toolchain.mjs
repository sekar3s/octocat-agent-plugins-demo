#!/usr/bin/env node
// Verifies a new engineer's toolchain against what the repository needs.
//   node check-toolchain.mjs [--path <repo>] [--json]
// Exit code: 0 = all required tools present, 1 = something required is missing.
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { findSetupSteps } from '../../../servers/atlas-core.mjs';
import { exists, gitTopLevel, readJson, readText } from '../../../servers/lib/workspace.mjs';

const argv = process.argv.slice(2);
const i = argv.indexOf('--path');
const target = path.resolve(i >= 0 ? argv[i + 1] : process.cwd());
const repo = gitTopLevel(target) ?? target;
const platform = os.platform();

function version(cmd, args = ['--version']) {
  try {
    const out = execFileSync(cmd, args, { encoding: 'utf8', timeout: 8000, stdio: ['ignore', 'pipe', 'pipe'], shell: platform === 'win32' });
    return out.trim().split('\n')[0];
  } catch {
    return undefined;
  }
}

const HINTS = {
  git: { darwin: 'xcode-select --install  (or: brew install git)', win32: 'winget install --id Git.Git', linux: 'sudo apt-get install git' },
  node: { darwin: 'brew install node@22  (or use nvm/fnm)', win32: 'winget install OpenJS.NodeJS.LTS', linux: 'Use nvm: https://github.com/nvm-sh/nvm' },
  npm: { darwin: 'Installed with Node.js', win32: 'Installed with Node.js', linux: 'Installed with Node.js' },
  gh: { darwin: 'brew install gh', win32: 'winget install --id GitHub.cli', linux: 'See https://github.com/cli/cli#installation' },
  docker: { darwin: 'Install Docker Desktop', win32: 'winget install Docker.DockerDesktop', linux: 'See https://docs.docker.com/engine/install/' },
  python3: { darwin: 'brew install python', win32: 'winget install Python.Python.3.12', linux: 'sudo apt-get install python3' },
  make: { darwin: 'xcode-select --install', win32: 'winget install GnuWin32.Make  (or use WSL)', linux: 'sudo apt-get install make' },
  copilot: { darwin: 'npm install -g @github/copilot  (see https://docs.github.com/copilot/how-tos/copilot-cli)', win32: 'npm install -g @github/copilot', linux: 'npm install -g @github/copilot' },
};

const setup = findSetupSteps(repo);
const needsNode = setup.install.length > 0;
const requiredNode = (readText(repo, '.nvmrc') ?? readJson(repo, 'package.json')?.engines?.node ?? '').trim();

const checks = [
  { tool: 'git', required: true },
  { tool: 'node', required: needsNode, want: requiredNode || undefined },
  { tool: 'npm', required: needsNode },
  { tool: 'gh', required: false },
  { tool: 'copilot', required: false },
  { tool: 'docker', required: false, relevant: exists(repo, 'Dockerfile') || exists(repo, 'docker-compose.yml') || exists(repo, 'api/Dockerfile') },
  { tool: platform === 'win32' ? 'python' : 'python3', hint: 'python3', required: exists(repo, 'requirements.txt') || exists(repo, 'pyproject.toml') },
  { tool: 'make', required: false, relevant: exists(repo, 'Makefile') },
].filter((c) => c.required || c.relevant !== false);

const results = checks.map((c) => {
  const v = version(c.tool);
  const hint = HINTS[c.hint ?? c.tool]?.[platform] ?? HINTS[c.hint ?? c.tool]?.linux;
  let status = v ? 'ok' : c.required ? 'missing' : 'optional-missing';
  let note = v ?? hint;
  if (v && c.tool === 'node') {
    const major = Number(/v?(\d+)/.exec(v)?.[1]);
    if (major < 18) {
      status = 'outdated';
      note = `${v} — Node.js 18+ required (plugins and most tooling). ${hint}`;
    } else if (c.want) note = `${v} (repo wants ${c.want})`;
  }
  return { tool: c.tool, required: Boolean(c.required), status, note };
});

const failed = results.some((r) => r.required && r.status !== 'ok');
if (argv.includes('--json')) {
  console.log(JSON.stringify({ repository: repo, platform, results, devcontainer: setup.devcontainer, install: setup.install }, null, 2));
} else {
  const icon = { ok: '✅', missing: '❌', outdated: '⚠️', 'optional-missing': '➖' };
  console.log(`# Toolchain check — ${path.basename(repo)} (${platform})\n`);
  console.log('| | Tool | Required | Details |\n|---|---|---|---|');
  for (const r of results) console.log(`| ${icon[r.status]} | ${r.tool} | ${r.required ? 'yes' : 'no'} | ${r.note ?? ''} |`);
  if (setup.devcontainer) console.log(`\n💡 ${setup.devcontainer}`);
  if (setup.install.length) console.log(`\nNext, from the repository root run each of:\n${setup.install.map((c) => `  (${c})`).join('\n')}`);
}
process.exitCode = failed ? 1 : 0;
