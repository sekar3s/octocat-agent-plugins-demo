// Cross-client hook I/O helpers.
// Source of truth: shared/hooks/lib/hook-io.mjs — copied into each plugin by scripts/sync-shared.mjs.
//
// One hook script must work in every Copilot client:
//   * Copilot CLI / Copilot app (Copilot SDK):  camelCase payload  { toolName, toolArgs, cwd, ... }
//   * VS Code Local harness:                    snake_case payload { hook_event_name, tool_name, tool_input, cwd, ... }
// Outputs include both the Copilot fields (top level) and the VS Code `hookSpecificOutput` object,
// so whichever client runs the hook finds the fields it understands.
//
// Hooks MUST never crash: a crashing preToolUse command hook is fail-closed in Copilot CLI
// (it would deny every tool call). runHook() catches everything and fails open.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PASCAL = {
  sessionStart: 'SessionStart',
  userPromptSubmitted: 'UserPromptSubmit',
  preToolUse: 'PreToolUse',
  postToolUse: 'PostToolUse',
  agentStop: 'Stop',
};

function readStdin() {
  try {
    return fs.readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

function parseMaybeJson(value) {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

export function normalize(raw, event) {
  const input = raw && typeof raw === 'object' ? raw : {};
  return {
    event,
    client: 'hook_event_name' in input ? 'vscode' : 'copilot',
    cwd: typeof input.cwd === 'string' && input.cwd ? input.cwd : undefined,
    toolName: String(input.toolName ?? input.tool_name ?? ''),
    toolArgs: parseMaybeJson(input.toolArgs ?? input.tool_input ?? {}) ?? {},
    prompt: typeof input.prompt === 'string' ? input.prompt : '',
    source: input.source,
    raw: input,
  };
}

export function withContext(event, text) {
  if (!text) return {};
  return {
    additionalContext: text,
    hookSpecificOutput: { hookEventName: PASCAL[event] ?? event, additionalContext: text },
  };
}

export function permission(decision, reason) {
  return {
    permissionDecision: decision,
    permissionDecisionReason: reason,
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: decision,
      permissionDecisionReason: reason,
    },
  };
}

const SHELL_TOOL = /(^|[-_/.])(bash|shell|powershell|pwsh|terminal|execute|run_in_terminal|runcommand|runinterminal)$/i;

export function isShellTool(toolName) {
  return SHELL_TOOL.test(toolName) || /^(bash|powershell|run_in_terminal)$/i.test(toolName);
}

export function shellCommand(toolArgs) {
  if (typeof toolArgs === 'string') return toolArgs;
  const cmd = toolArgs?.command ?? toolArgs?.cmd ?? toolArgs?.script ?? '';
  return typeof cmd === 'string' ? cmd : '';
}

const CONTENT_KEYS = new Set([
  'file_text', 'content', 'contents', 'new_str', 'new_string', 'newString', 'code', 'text', 'patch', 'input', 'newText',
]);
const PATH_KEYS = new Set(['path', 'file_path', 'filePath', 'filepath', 'file', 'target_file']);

const PATCH_SHAPE = /^\*\*\* Begin Patch|^@@ |^diff --git |^--- /m;

/** For unified/apply_patch diffs keep only added lines, so removing or touching existing text isn't treated as writing it. */
export function addedText(value) {
  if (!PATCH_SHAPE.test(value)) return value;
  return value
    .split('\n')
    .filter((line) => line.startsWith('+') && !line.startsWith('+++'))
    .map((line) => line.slice(1))
    .join('\n');
}

/** Collect text that a tool call would write, from any client's edit/create/patch argument shape. */
export function writtenContent(toolArgs) {
  const out = [];
  const visit = (node, depth) => {
    if (!node || depth > 5) return;
    if (Array.isArray(node)) return node.forEach((n) => visit(n, depth + 1));
    if (typeof node !== 'object') return;
    for (const [key, value] of Object.entries(node)) {
      if (typeof value === 'string' && CONTENT_KEYS.has(key)) out.push(addedText(value));
      else if (typeof value === 'object') visit(value, depth + 1);
    }
  };
  visit(toolArgs, 0);
  return out;
}

export function targetPaths(toolArgs) {
  const out = [];
  const visit = (node, depth) => {
    if (!node || depth > 5) return;
    if (Array.isArray(node)) return node.forEach((n) => visit(n, depth + 1));
    if (typeof node !== 'object') return;
    for (const [key, value] of Object.entries(node)) {
      if (typeof value === 'string' && PATH_KEYS.has(key)) out.push(value);
      else if (typeof value === 'object') visit(value, depth + 1);
    }
  };
  visit(toolArgs, 0);
  return [...new Set(out)];
}

/** Opt-in, local-only JSONL audit log. Enabled when OCTOCAT_PLUGINS_AUDIT_DIR is set. */
export function audit(plugin, record) {
  const dir = process.env.OCTOCAT_PLUGINS_AUDIT_DIR;
  if (!dir) return;
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(
      path.join(dir, `${plugin}.jsonl`),
      `${JSON.stringify({ ts: new Date().toISOString(), plugin, ...record })}\n`,
    );
  } catch {
    // Auditing must never break the agent loop.
  }
}

/** True when the module at `metaUrl` is the entry point (robust to symlinks and Windows drive-letter casing). */
export function isMain(metaUrl) {
  if (!process.argv[1]) return false;
  const real = (p) => {
    try {
      return fs.realpathSync(p);
    } catch {
      return path.resolve(p);
    }
  };
  const a = real(fileURLToPath(metaUrl));
  const b = real(process.argv[1]);
  return process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b;
}

/**
 * Run a hook handler with fail-open semantics.
 * The event name is passed as the first CLI argument by hooks.json.
 */
export async function runHook(handler) {
  const event = process.argv[2] ?? 'unknown';
  let output = {};
  try {
    const raw = readStdin();
    const ctx = normalize(raw ? JSON.parse(raw) : {}, event);
    output = (await handler(ctx)) ?? {};
  } catch (err) {
    process.stderr.write(`hook error (${event}): ${err?.message ?? err}\n`);
    output = {};
  }
  process.stdout.write(JSON.stringify(output));
  process.exitCode = 0;
}
