#!/usr/bin/env node
// Validates every plugin in this marketplace against the Agent Plugins 1.0 spec and the
// Copilot client-extension conventions used in this repository. Zero dependencies.
//   node scripts/validate-plugins.mjs
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PLUGIN_SCHEMA = 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json';
const MCP_SCHEMA = 'https://agent-plugins.org/schemas/1.0.0/mcp.schema.json';
const MANIFEST_FIELDS = new Set(['$schema', 'name', 'version', 'description', 'author', 'homepage', 'repository', 'license', 'keywords', 'extensions']);
const HOOK_EVENTS = new Set(['sessionStart', 'sessionEnd', 'userPromptSubmitted', 'preToolUse', 'postToolUse', 'postToolUseFailure', 'agentStop', 'subagentStart', 'subagentStop', 'preCompact', 'errorOccurred', 'notification', 'permissionRequest']);
const SKILL_FIELDS = new Set(['name', 'description', 'license', 'compatibility', 'metadata', 'allowed-tools']);

const errors = [];
const warnings = [];
const err = (where, msg) => errors.push(`${where}: ${msg}`);
const warn = (where, msg) => warnings.push(`${where}: ${msg}`);
const rel = (p) => path.relative(repoRoot, p).split(path.sep).join('/');

export function validPluginName(name) {
  return typeof name === 'string' && name.length >= 1 && name.length <= 64 && /^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/.test(name) && !name.includes('--') && !name.includes('..');
}

export function validSkillName(name) {
  return typeof name === 'string' && name.length <= 64 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name);
}

/** Minimal YAML front-matter parser for the subset used by skills, agents, commands, and automations. */
export function parseFrontmatter(text) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text);
  if (!m) return undefined;
  const root = {};
  const stack = [{ indent: -1, obj: root }];
  for (const raw of m[1].split(/\r?\n/)) {
    if (!raw.trim() || raw.trim().startsWith('#')) continue;
    const indent = raw.length - raw.trimStart().length;
    const kv = /^([\w$-]+):\s*(.*)$/.exec(raw.trim());
    if (!kv) continue;
    while (stack.length > 1 && indent <= stack[stack.length - 1].indent) stack.pop();
    const parent = stack[stack.length - 1].obj;
    const [, key, value] = kv;
    if (value === '') {
      parent[key] = {};
      stack.push({ indent, obj: parent[key] });
    } else if (/^\[.*\]$/.test(value)) {
      parent[key] = JSON.parse(value.replace(/'/g, '"'));
    } else if (/^".*"$/.test(value) || /^'.*'$/.test(value)) {
      parent[key] = value.slice(1, -1);
    } else if (/^-?\d+$/.test(value)) {
      parent[key] = Number(value);
    } else if (value === 'true' || value === 'false') {
      parent[key] = value === 'true';
    } else {
      parent[key] = value;
    }
  }
  return { data: root, body: text.slice(m[0].length) };
}

function readJson(file, where) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    err(where, `invalid JSON (${e.message})`);
    return undefined;
  }
}

function assertInside(root, target, where) {
  const real = fs.existsSync(target) ? fs.realpathSync(target) : path.resolve(target);
  const realRoot = fs.realpathSync(root);
  if (real !== realRoot && !real.startsWith(realRoot + path.sep)) err(where, `path escapes plugin root: ${target}`);
}

function checkPlaceholderPaths(root, values, where) {
  for (const v of values) {
    for (const m of String(v).matchAll(/\$\{PLUGIN_ROOT\}\/([^\s"']+)/g)) {
      const target = path.join(root, m[1]);
      if (!fs.existsSync(target)) err(where, `references missing file \${PLUGIN_ROOT}/${m[1]}`);
      else assertInside(root, target, where);
    }
    for (const m of String(v).matchAll(/\$env:PLUGIN_ROOT\/([^\s"']+)/g)) {
      if (!fs.existsSync(path.join(root, m[1]))) err(where, `references missing file $env:PLUGIN_ROOT/${m[1]}`);
    }
  }
}

function validateManifest(root) {
  const where = rel(path.join(root, 'plugin.json'));
  const manifest = readJson(path.join(root, 'plugin.json'), where);
  if (!manifest) return undefined;
  for (const key of Object.keys(manifest)) if (!MANIFEST_FIELDS.has(key)) err(where, `unknown top-level field "${key}" (Agent Plugins 1.0 manifest is closed)`);
  if (manifest.$schema !== PLUGIN_SCHEMA) err(where, `$schema must be ${PLUGIN_SCHEMA}`);
  if (!validPluginName(manifest.name)) err(where, `invalid name "${manifest.name}"`);
  if (manifest.name !== path.basename(root)) warn(where, `name "${manifest.name}" differs from directory "${path.basename(root)}"`);
  for (const f of ['version', 'description', 'homepage', 'repository', 'license']) {
    if (manifest[f] !== undefined && typeof manifest[f] !== 'string') err(where, `"${f}" must be a string`);
  }
  if (!/^\d+\.\d+\.\d+(?:-[\w.]+)?$/.test(manifest.version ?? '')) err(where, 'version should be semver (required by this repository)');
  if (!manifest.description) err(where, 'description is required by this repository');
  if (manifest.author !== undefined) {
    if (typeof manifest.author !== 'object' || Array.isArray(manifest.author)) err(where, 'author must be an object');
    else for (const [k, v] of Object.entries(manifest.author)) {
      if (!['name', 'email', 'url'].includes(k)) err(where, `author.${k} is not allowed`);
      if (typeof v !== 'string') err(where, `author.${k} must be a string`);
    }
  }
  if (manifest.keywords !== undefined && (!Array.isArray(manifest.keywords) || manifest.keywords.some((k) => typeof k !== 'string'))) err(where, 'keywords must be a string array');
  if (manifest.extensions !== undefined && (typeof manifest.extensions !== 'object' || Array.isArray(manifest.extensions))) err(where, 'extensions must be an object');
  return manifest;
}

function validateMcp(root) {
  const file = path.join(root, 'mcp.json');
  if (!fs.existsSync(file)) return;
  const where = rel(file);
  const cfg = readJson(file, where);
  if (!cfg) return;
  for (const key of Object.keys(cfg)) if (!['$schema', 'mcpServers'].includes(key)) err(where, `unknown top-level field "${key}"`);
  if (cfg.$schema !== MCP_SCHEMA) err(where, `$schema must be ${MCP_SCHEMA}`);
  for (const [name, server] of Object.entries(cfg.mcpServers ?? {})) {
    const w = `${where} > ${name}`;
    if (server.type === 'stdio') {
      for (const k of Object.keys(server)) if (!['type', 'command', 'args', 'env', 'cwd'].includes(k)) err(w, `field "${k}" not allowed for stdio`);
      if (typeof server.command !== 'string' || /\s/.test(server.command) || server.command.includes('${')) err(w, 'command must be a single executable token without placeholders');
      if (server.command.includes('/') && !server.command.startsWith('./')) err(w, 'command paths must be plugin-relative (./)');
      if (server.cwd && !/^(\.\/|\$\{PLUGIN_ROOT\}(\/|$)|\$\{PLUGIN_DATA\}(\/|$))/.test(server.cwd)) err(w, 'cwd must start with ./, ${PLUGIN_ROOT}, or ${PLUGIN_DATA}');
      if (server.env && ('PLUGIN_ROOT' in server.env || 'PLUGIN_DATA' in server.env)) err(w, 'env must not set PLUGIN_ROOT or PLUGIN_DATA');
      for (const v of Object.values(server.env ?? {})) if (/(token|secret|password|key)=/i.test(v)) err(w, 'env values must not contain secrets');
      checkPlaceholderPaths(root, [...(server.args ?? []), ...Object.values(server.env ?? {})], w);
    } else if (server.type === 'streamable-http' || server.type === 'sse') {
      for (const k of Object.keys(server)) if (!['type', 'url', 'headers'].includes(k)) err(w, `field "${k}" not allowed for ${server.type}`);
      if (!/^https:\/\/|^http:\/\/(localhost|127\.)/.test(server.url ?? '')) err(w, 'url must be https (or loopback http)');
    } else err(w, `unknown type "${server.type}"`);
  }
}

function checkMarkdownLinks(file, body) {
  for (const m of body.matchAll(/\]\((?!https?:|#|mailto:)([^)\s]+)\)/g)) {
    const target = path.resolve(path.dirname(file), decodeURIComponent(m[1].split('#')[0]));
    if (!fs.existsSync(target)) err(rel(file), `broken link ${m[1]}`);
  }
}

function validateSkills(root) {
  const dir = path.join(root, 'skills');
  if (!fs.existsSync(dir)) return 0;
  let count = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const file = path.join(dir, entry.name, 'SKILL.md');
    const where = rel(file);
    if (!fs.existsSync(file)) { err(rel(path.join(dir, entry.name)), 'missing SKILL.md'); continue; }
    count++;
    const fm = parseFrontmatter(fs.readFileSync(file, 'utf8'));
    if (!fm) { err(where, 'missing YAML front matter'); continue; }
    for (const k of Object.keys(fm.data)) if (!SKILL_FIELDS.has(k)) err(where, `front matter field "${k}" is not part of the Agent Skills spec`);
    if (!validSkillName(fm.data.name)) err(where, `invalid skill name "${fm.data.name}"`);
    if (fm.data.name !== entry.name) err(where, `name "${fm.data.name}" must match directory "${entry.name}"`);
    if (typeof fm.data.description !== 'string' || !fm.data.description.length || fm.data.description.length > 1024) err(where, 'description must be 1-1024 characters');
    if (fm.data.metadata && Object.values(fm.data.metadata).some((v) => typeof v !== 'string')) err(where, 'metadata values must be strings');
    checkMarkdownLinks(file, fm.body);
  }
  return count;
}

function validateMarkdownComponents(root, sub, suffix, required) {
  const dir = path.join(root, sub);
  if (!fs.existsSync(dir)) return 0;
  let count = 0;
  for (const name of fs.readdirSync(dir)) {
    if (!name.endsWith(suffix)) continue;
    count++;
    const file = path.join(dir, name);
    const fm = parseFrontmatter(fs.readFileSync(file, 'utf8'));
    if (!fm) { err(rel(file), 'missing YAML front matter'); continue; }
    for (const k of required) if (fm.data[k] === undefined || fm.data[k] === '') err(rel(file), `front matter "${k}" is required`);
    if (sub.endsWith('agents')) {
      if (fm.data.name && fm.data.name !== name.replace(/\.agent\.md$/, '')) warn(rel(file), 'agent name differs from file name');
      if (fm.data.tools !== undefined && !Array.isArray(fm.data.tools)) err(rel(file), 'tools must be an array');
    }
    if (!fm.body.trim()) err(rel(file), 'body (instructions/prompt) is empty');
  }
  return count;
}

function validateHooks(root) {
  const file = path.join(root, 'com.github.copilot', 'hooks', 'hooks.json');
  if (!fs.existsSync(file)) return 0;
  const where = rel(file);
  const cfg = readJson(file, where);
  if (!cfg) return 0;
  if (cfg.version !== 1) err(where, 'version must be 1 (Copilot hook format)');
  let count = 0;
  for (const [event, entries] of Object.entries(cfg.hooks ?? {})) {
    if (!HOOK_EVENTS.has(event)) err(where, `unknown or non-camelCase event "${event}" (mixing PascalCase events causes double execution in Copilot CLI)`);
    if (!Array.isArray(entries)) { err(where, `${event} must be an array`); continue; }
    for (const [i, h] of entries.entries()) {
      count++;
      const w = `${where} > ${event}[${i}]`;
      if ((h.type ?? 'command') !== 'command') continue;
      if (!h.bash || !h.powershell) err(w, 'provide both "bash" and "powershell" commands for cross-platform support');
      if (!h.timeoutSec) warn(w, 'set timeoutSec explicitly');
      checkPlaceholderPaths(root, [h.bash ?? '', h.powershell ?? ''], w);
    }
  }
  return count;
}

function validateAutomations(root) {
  const dir = path.join(root, 'automations');
  if (!fs.existsSync(dir)) return 0;
  let count = 0;
  for (const name of fs.readdirSync(dir)) {
    const file = path.join(dir, name);
    if (!name.endsWith('.automation.md')) { err(rel(file), 'automation templates must use the .automation.md suffix'); continue; }
    count++;
    const fm = parseFrontmatter(fs.readFileSync(file, 'utf8'));
    const where = rel(file);
    if (!fm) { err(where, 'missing front matter'); continue; }
    const d = fm.data;
    if (d.version !== 1) err(where, 'version must be 1');
    if (!/^[a-z0-9.-]{1,64}$/.test(d.id ?? '')) err(where, 'id must be lowercase letters, numbers, periods, or hyphens (max 64)');
    if (!d.name) err(where, 'name is required');
    const kind = d.schedule?.kind;
    if (!['manual', 'hourly', 'cron'].includes(kind)) err(where, 'schedule.kind must be manual, hourly, or cron');
    if (kind === 'cron') {
      const fields = String(d.schedule.expression ?? '').split(/\s+/);
      if (fields.length !== 5) err(where, 'cron expression must have 5 fields');
      if (fields[2] !== '*' || fields[3] !== '*' || !/^(\*|\d)$/.test(fields[4] ?? '')) err(where, 'only daily or weekly cron schedules are supported');
      if (d.schedule.timeZone !== 'local') err(where, 'schedule.timeZone must be "local"');
    }
    if (!fm.body.trim()) err(where, 'prompt body is empty');
  }
  return count;
}

function validateMarketplace(manifests) {
  const file = path.join(repoRoot, '.github', 'plugin', 'marketplace.json');
  const where = rel(file);
  const mk = readJson(file, where);
  if (!mk) return;
  if (!validPluginName(mk.name)) err(where, `invalid marketplace name "${mk.name}"`);
  if (!mk.owner?.name) err(where, 'owner.name is required');
  const listed = new Set();
  for (const entry of mk.plugins ?? []) {
    const w = `${where} > ${entry.name}`;
    listed.add(entry.name);
    const src = path.resolve(repoRoot, entry.source ?? '');
    if (!fs.existsSync(path.join(src, 'plugin.json'))) { err(w, `source ${entry.source} has no plugin.json`); continue; }
    const m = manifests.get(src);
    if (!m) continue;
    if (m.name !== entry.name) err(w, `name differs from plugin.json (${m.name})`);
    if (m.version !== entry.version) err(w, `version ${entry.version} differs from plugin.json (${m.version}) — bump both`);
    if (m.description !== entry.description) warn(w, 'description differs from plugin.json');
  }
  for (const m of manifests.values()) if (!listed.has(m.name)) err(where, `plugin "${m.name}" is not listed`);
}

function main() {
  const pluginsDir = path.join(repoRoot, 'plugins');
  const manifests = new Map();
  const summary = [];
  for (const name of fs.readdirSync(pluginsDir).sort()) {
    const root = path.join(pluginsDir, name);
    if (!fs.statSync(root).isDirectory()) continue;
    if (!fs.existsSync(path.join(root, 'plugin.json'))) { err(rel(root), 'missing plugin.json'); continue; }
    const manifest = validateManifest(root);
    if (manifest) manifests.set(root, manifest);
    validateMcp(root);
    const skills = validateSkills(root);
    const agents = validateMarkdownComponents(root, 'com.github.copilot/agents', '.agent.md', ['name', 'description']);
    const commands = validateMarkdownComponents(root, 'com.github.copilot/commands', '.md', ['description']);
    const hooks = validateHooks(root);
    const automations = validateAutomations(root);
    for (const doc of ['README.md', 'CHANGELOG.md']) if (!fs.existsSync(path.join(root, doc))) err(rel(root), `missing ${doc}`);
    if (fs.existsSync(path.join(root, 'README.md'))) checkMarkdownLinks(path.join(root, 'README.md'), fs.readFileSync(path.join(root, 'README.md'), 'utf8'));
    summary.push({ plugin: manifest?.name ?? name, version: manifest?.version, skills, agents, commands, hooks, automations, mcp: fs.existsSync(path.join(root, 'mcp.json')) });
  }
  validateMarketplace(manifests);

  try {
    execFileSync(process.execPath, [path.join(repoRoot, 'scripts', 'sync-shared.mjs'), '--check'], { stdio: 'pipe' });
  } catch (e) {
    err('shared libraries', String(e.stderr || e.stdout).trim());
  }

  console.table(summary);
  for (const w of warnings) console.warn(`warning: ${w}`);
  if (errors.length) {
    for (const e of errors) console.error(`error: ${e}`);
    console.error(`\n✗ ${errors.length} error(s)`);
    process.exit(1);
  }
  console.log(`\n✓ ${summary.length} plugin(s) valid`);
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url))) main();
