#!/usr/bin/env node
// ship-ready hooks: release context at session start + confirmation guard for risky release commands.
//   node release-guard.mjs sessionStart | preToolUse
// Set SHIP_READY_GUARD=off to disable the preToolUse guard.
import { git, gitTopLevel } from '../../servers/lib/workspace.mjs';
import { audit, isMain, isShellTool, permission, runHook, shellCommand, withContext } from './lib/hook-io.mjs';

const RISKY = [
  [/\bgit\s+push\b[^|;&]*\s(--force(?!-with-lease)|-f\b|\+\S)/, 'Force-push rewrites shared history'],
  [/\bgit\s+push\b[^|;&]*\s--force-with-lease\b/, 'Force-push (with lease) rewrites shared history'],
  [/\bgit\s+push\b[^|;&]*\s(origin|upstream)\s+(HEAD:)?(main|master|release\/\S+)\b/, 'Pushing directly to a release branch bypasses pull-request review'],
  [/\bgit\s+push\b[^|;&]*\s--tags\b/, 'Pushing tags publishes release markers'],
  [/\bgit\s+tag\s+(-a\s+|-s\s+)?v?\d/, 'Creating a version tag starts a release'],
  [/\b(npm|pnpm|yarn)\s+publish\b/, 'Publishing a package to a registry is irreversible for that version'],
  [/\bgh\s+release\s+(create|delete|edit)\b/, 'This changes a GitHub release'],
  [/\b(docker|podman)\s+push\b/, 'Pushing a container image can trigger deployments'],
  [/\bnpm\s+version\s+(major|minor|patch|\d)/, 'npm version bumps the version and creates a tag'],
];

export function classifyReleaseCommand(command) {
  for (const [pattern, reason] of RISKY) if (pattern.test(command)) return reason;
  return undefined;
}

function sessionContext(cwd) {
  const repo = cwd && gitTopLevel(cwd);
  if (!repo) return undefined;
  const branch = git(repo, ['rev-parse', '--abbrev-ref', 'HEAD']);
  const tag = git(repo, ['describe', '--tags', '--abbrev=0']);
  const unreleased = git(repo, ['rev-list', '--count', tag ? `${tag}..HEAD` : 'HEAD']);
  const dirty = (git(repo, ['status', '--porcelain']) ?? '').split('\n').filter(Boolean).length;
  return [
    '[ship-ready] Release context for this repository:',
    `- Branch: ${branch ?? 'unknown'}`,
    `- Last release tag: ${tag ?? 'none (no tags yet)'}`,
    `- Unreleased commits: ${unreleased ?? 'unknown'}`,
    `- Uncommitted changes: ${dirty}`,
    'Use the release-readiness skill or the release-radar MCP tools before tagging or publishing a release.',
  ].join('\n');
}

if (isMain(import.meta.url)) {
  await runHook(async (ctx) => {
    if (ctx.event === 'sessionStart') return withContext('sessionStart', sessionContext(ctx.cwd));

    if (ctx.event === 'preToolUse') {
      if ((process.env.SHIP_READY_GUARD ?? '').toLowerCase() === 'off') return {};
      if (!isShellTool(ctx.toolName)) return {};
      const command = shellCommand(ctx.toolArgs);
      const reason = classifyReleaseCommand(command);
      if (!reason) return {};
      audit('ship-ready', { event: 'preToolUse', decision: 'ask', reason, command: command.slice(0, 300) });
      return permission('ask', `ship-ready: ${reason}. Confirm the release checklist passed (run /ship-check) before continuing.`);
    }
    return {};
  });
}
