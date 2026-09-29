import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const pluginDir = (name) => path.join(repoRoot, 'plugins', name);

// Credential-shaped values are assembled at runtime so this repository never contains
// strings that secret scanners (or push protection) would flag.
export const fakeSecrets = {
  aws: ['AK', 'IA', 'Z'.repeat(16)].join(''),
  github: ['gh', 'p_', 'a1B2c3D4'.repeat(5)].join(''),
  privateKey: ['-----BEGIN ', 'RSA PRIVATE', ' KEY-----'].join(''),
};

function sh(cwd, cmd, args) {
  execFileSync(cmd, args, { cwd, stdio: 'ignore', env: { ...process.env, GIT_CONFIG_NOSYSTEM: '1' } });
}

/** Creates a throwaway git repository that exercises every plugin feature. */
export function createFixtureRepo() {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'octocat-plugins-')));
  const write = (rel, content) => {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), content);
  };
  const commit = (msg) => {
    sh(dir, 'git', ['add', '-A']);
    sh(dir, 'git', ['-c', 'user.name=Mona Lisa', '-c', 'user.email=mona@example.com', '-c', 'commit.gpgsign=false', 'commit', '-q', '-m', msg]);
  };
  sh(dir, 'git', ['init', '-q', '-b', 'main']);
  write('README.md', '# Fixture\n\n## Getting started\n\nRun `npm ci` then `npm run dev`.\n');
  write('package.json', JSON.stringify({ name: 'fixture', version: '1.2.3', scripts: { dev: 'node server.js', test: 'node --test' }, dependencies: { express: '^4.19.0', 'left-pad': '*' } }, null, 2));
  write('.github/CODEOWNERS', '* @octo-org/everyone\n/api/ @octo-org/api-team\n*.md @octo-org/docs\n');
  write('docs/glossary.md', '# Glossary\n\n- **Widget** — the thing we sell.\n');
  commit('chore: initial commit');
  sh(dir, 'git', ['tag', 'v1.2.3']);
  write('api/routes/users.js', [
    "const { exec } = require('child_process');",
    'app.get("/users/:id", (req, res) => db.get(`SELECT * FROM users WHERE id = ${req.params.id}`));',
    'app.post("/notify", (req, res) => exec(`notify ${req.body.partner}`));',
    `const awsKey = '${fakeSecrets.aws}';`,
    "app.use(cors({ origin: '*' }));",
    '// TODO: add validation',
  ].join('\n'));
  write('api/routes/users.test.js', "test('x', () => {});\n");
  write('.github/workflows/ci.yml', 'on: push\njobs:\n  build:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - uses: some-org/some-action@main\n');
  commit('feat(api): add users route');
  write('api/routes/orders.js', 'module.exports = {};\n');
  commit('fix: handle empty orders');
  return dir;
}

export function removeDir(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

/** Starts an MCP stdio server and returns a tiny JSON-RPC client. */
export function startMcp(serverPath, { env = {}, cwd } = {}) {
  const child = spawn(process.execPath, [serverPath], {
    cwd: cwd ?? path.dirname(path.dirname(serverPath)),
    env: { ...process.env, PLUGIN_ROOT: path.dirname(path.dirname(serverPath)), ...env },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  let buffer = '';
  let nextId = 1;
  const waiting = new Map();
  child.stdout.on('data', (chunk) => {
    buffer += chunk;
    let idx;
    while ((idx = buffer.indexOf('\n')) >= 0) {
      const msg = JSON.parse(buffer.slice(0, idx));
      buffer = buffer.slice(idx + 1);
      waiting.get(msg.id)?.(msg);
      waiting.delete(msg.id);
    }
  });
  const request = (method, params) =>
    new Promise((resolve, reject) => {
      const id = nextId++;
      const timer = setTimeout(() => reject(new Error(`${method} timed out`)), 15000);
      waiting.set(id, (msg) => {
        clearTimeout(timer);
        resolve(msg);
      });
      child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
    });
  return {
    async initialize() {
      const res = await request('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '0' } });
      child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n`);
      return res;
    },
    request,
    async call(name, args) {
      const res = await request('tools/call', { name, arguments: args });
      const text = res.result?.content?.[0]?.text;
      let data;
      try {
        data = JSON.parse(text);
      } catch {
        data = text;
      }
      return { isError: Boolean(res.result?.isError), data, raw: res };
    },
    close() {
      child.kill();
    },
  };
}

/** Runs a hook script the way Copilot clients do: JSON on stdin, event name as argv. */
export function runHook(plugin, script, event, payload, env = {}) {
  const root = pluginDir(plugin);
  const out = execFileSync(process.execPath, [path.join(root, 'scripts', 'hooks', script), event], {
    cwd: root,
    input: typeof payload === 'string' ? payload : JSON.stringify(payload),
    env: { ...process.env, PLUGIN_ROOT: root, ...env },
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  return JSON.parse(out || '{}');
}
