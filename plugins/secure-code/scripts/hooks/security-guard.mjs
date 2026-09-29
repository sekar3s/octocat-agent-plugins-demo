#!/usr/bin/env node
// secure-code hooks — shift-left guardrails that run in every Copilot client.
//   node security-guard.mjs sessionStart | preToolUse | postToolUse
//
// SECURE_CODE_MODE:
//   enforce (default)  deny high-confidence secrets & destructive commands, ask for risky ones
//   warn               never deny; ask instead
//   off                disable all secure-code hooks
import { evaluateShellCommand, findCodeIssues, findSecrets, isSensitiveTargetPath } from '../../servers/security-rules.mjs';
import { audit, isMain, isShellTool, permission, runHook, shellCommand, targetPaths, withContext, writtenContent } from './lib/hook-io.mjs';

export function mode() {
  const m = (process.env.SECURE_CODE_MODE ?? 'enforce').toLowerCase();
  return ['enforce', 'warn', 'off'].includes(m) ? m : 'enforce';
}

const escalate = (level) => (mode() === 'warn' && level === 'deny' ? 'ask' : level);

export function evaluatePreToolUse(ctx) {
  if (isShellTool(ctx.toolName)) {
    const command = shellCommand(ctx.toolArgs);
    const verdict = command && evaluateShellCommand(command);
    if (verdict) {
      return { decision: escalate(verdict.level), rule: verdict.rule.id, reason: `secure-code: ${verdict.rule.reason}`, command };
    }
    return undefined;
  }

  const content = writtenContent(ctx.toolArgs);
  const paths = targetPaths(ctx.toolArgs);
  if (content.length) {
    const secrets = content.flatMap((c) => findSecrets(c));
    const high = secrets.filter((s) => s.confidence === 'high');
    if (high.length) {
      const kinds = [...new Set(high.map((s) => s.title))].join(', ');
      return {
        decision: escalate('deny'),
        rule: 'secret-in-write',
        reason: `secure-code: blocked writing a hard-coded secret (${kinds}) to ${paths[0] ?? 'a file'}. Read it from an environment variable or secret manager instead (CWE-798).`,
      };
    }
    if (secrets.length) {
      return {
        decision: 'ask',
        rule: 'possible-secret-in-write',
        reason: `secure-code: the change may contain a hard-coded credential (${secrets[0].title}, ${secrets[0].preview}). Confirm it is not a real secret.`,
      };
    }
  }
  const sensitive = paths.find(isSensitiveTargetPath);
  if (sensitive && content.length) {
    return { decision: 'ask', rule: 'sensitive-file', reason: `secure-code: ${sensitive} usually holds secrets. Confirm this edit and make sure the file is git-ignored.` };
  }
  if (sensitive && /(^|[-_])(view|read|read_file|open)$/i.test(ctx.toolName)) {
    return { decision: 'ask', rule: 'read-sensitive-file', reason: `secure-code: reading ${sensitive} would expose its secrets to the model. Confirm this is necessary.` };
  }
  return undefined;
}

export function evaluatePostToolUse(ctx) {
  if (isShellTool(ctx.toolName)) return undefined;
  const content = writtenContent(ctx.toolArgs);
  if (!content.length) return undefined;
  const file = targetPaths(ctx.toolArgs)[0] ?? 'snippet.ts';
  const issues = content.flatMap((c) => findCodeIssues(c, file)).filter((i) => i.severity !== 'low');
  if (!issues.length) return undefined;
  const lines = issues.slice(0, 5).map((i) => `- ${i.severity.toUpperCase()} ${i.cwe} ${i.title}: \`${i.snippet}\` → ${i.fix}`);
  return [
    `[secure-code] The code just written to ${file} contains ${issues.length} potential security issue(s):`,
    ...lines,
    'Fix these before continuing, or explain to the user why they are safe. Use the vuln-scout MCP tools or the secure-code-review skill for details.',
  ].join('\n');
}

if (isMain(import.meta.url)) {
  await runHook(async (ctx) => {
    if (mode() === 'off') return {};

    if (ctx.event === 'sessionStart') {
      return withContext('sessionStart',
        `[secure-code] Security guardian is active (mode: ${mode()}). Hard-coded secrets and destructive shell commands are blocked; ` +
        'new code is scanned for OWASP Top 10 patterns. Prefer parameterized queries, output encoding, least privilege, and secrets from environment/secret managers.');
    }

    if (ctx.event === 'preToolUse') {
      const result = evaluatePreToolUse(ctx);
      if (!result) return {};
      audit('secure-code', { event: 'preToolUse', tool: ctx.toolName, decision: result.decision, rule: result.rule, command: result.command?.slice(0, 300) });
      return permission(result.decision, result.reason);
    }

    if (ctx.event === 'postToolUse') {
      const context = evaluatePostToolUse(ctx);
      if (!context) return {};
      audit('secure-code', { event: 'postToolUse', tool: ctx.toolName, rule: 'insecure-pattern' });
      return withContext('postToolUse', context);
    }
    return {};
  });
}
