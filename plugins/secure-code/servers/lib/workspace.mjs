// Read-only workspace helpers shared by the plugin MCP servers.
// Source of truth: shared/servers/lib/workspace.mjs — copied into each plugin by scripts/sync-shared.mjs.

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { ToolError } from './mcp-stdio.mjs';

const IGNORED_DIRS = new Set([
  '.git', 'node_modules', 'dist', 'build', 'out', 'coverage', '.next', '.nuxt', 'vendor',
  '.venv', 'venv', '__pycache__', 'target', 'bin', 'obj', '.turbo', '.cache', '.playwright-mcp',
]);
const MAX_FILE_BYTES = 512 * 1024;

const pluginRoot = process.env.PLUGIN_ROOT ? path.resolve(process.env.PLUGIN_ROOT) : undefined;

function isDirectory(p) {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

/**
 * Resolve the workspace the user is working in, in priority order:
 * explicit `path` argument → MCP roots from the client → WORKSPACE_ROOT/PWD env → process.cwd().
 * The plugin install directory is never treated as the workspace.
 */
export async function resolveWorkspace(requestedPath, ctx) {
  if (requestedPath) {
    const explicit = path.resolve(String(requestedPath));
    if (!isDirectory(explicit)) throw new ToolError(`Path not found or not a directory: ${requestedPath}`);
    return gitTopLevel(explicit) ?? explicit;
  }
  const candidates = [];
  for (const root of (await ctx?.getRoots?.()) ?? []) candidates.push(root);
  for (const env of [process.env.WORKSPACE_ROOT, process.env.INIT_CWD, process.env.PWD]) {
    if (env) candidates.push(path.resolve(env));
  }
  candidates.push(process.cwd());

  for (const candidate of candidates) {
    if (!isDirectory(candidate)) continue;
    if (pluginRoot && isInside(pluginRoot, candidate)) continue;
    return gitTopLevel(candidate) ?? candidate;
  }
  throw new ToolError('Could not determine the workspace. Pass the absolute repository path in the "path" argument.');
}

export function git(cwd, args, { timeout = 10_000 } = {}) {
  try {
    return execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      timeout,
      stdio: ['ignore', 'pipe', 'ignore'],
      maxBuffer: 8 * 1024 * 1024,
    }).trim();
  } catch {
    return undefined;
  }
}

export function gitTopLevel(cwd) {
  const top = git(cwd, ['rev-parse', '--show-toplevel']);
  // git prints forward slashes on Windows; normalize to the platform format.
  return top ? path.resolve(top) : undefined;
}

/** True when `abs` is `root` or inside it (separator- and platform-safe). */
export function isInside(root, abs) {
  const rel = path.relative(root, abs);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

/** Yields workspace-relative file paths, skipping vendored/generated directories. */
export function* walkFiles(root, { maxFiles = 5000, include } = {}) {
  let count = 0;
  const stack = [''];
  while (stack.length) {
    const rel = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(path.join(root, rel), { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const childRel = rel ? path.join(rel, entry.name) : entry.name;
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        if (!IGNORED_DIRS.has(entry.name)) stack.push(childRel);
        continue;
      }
      if (!entry.isFile()) continue;
      if (include && !include(childRel)) continue;
      yield childRel;
      if (++count >= maxFiles) return;
    }
  }
}

export function readText(root, rel) {
  const abs = path.resolve(root, rel);
  if (!isInside(path.resolve(root), abs)) return undefined;
  try {
    const stat = fs.statSync(abs);
    if (!stat.isFile() || stat.size > MAX_FILE_BYTES) return undefined;
    const buf = fs.readFileSync(abs);
    if (buf.includes(0)) return undefined; // binary
    return buf.toString('utf8');
  } catch {
    return undefined;
  }
}

export function readJson(root, rel) {
  const text = readText(root, rel);
  if (text === undefined) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

export function exists(root, rel) {
  return fs.existsSync(path.join(root, rel));
}

export function toPosix(p) {
  return p.split(path.sep).join('/');
}
