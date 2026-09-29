#!/usr/bin/env node
// onboarding-buddy hooks.
//   node welcome.mjs sessionStart         → inject a short repo orientation as context
//   node welcome.mjs userPromptSubmitted  → opt-in, local-only capture of onboarding questions (FAQ mining)
//
// ONBOARDING_BUDDY_CONTEXT=off disables the session-start orientation.
// Question capture requires BOTH OCTOCAT_PLUGINS_AUDIT_DIR and ONBOARDING_BUDDY_CAPTURE_QUESTIONS=1.
import { detectStack, findSetupSteps } from '../../servers/atlas-core.mjs';
import { gitTopLevel } from '../../servers/lib/workspace.mjs';
import { audit, isMain, runHook, withContext } from './lib/hook-io.mjs';

export function orientation(cwd) {
  const repo = cwd && gitTopLevel(cwd);
  if (!repo) return undefined;
  const stack = detectStack(repo);
  const setup = findSetupSteps(repo);
  const langs = stack.languages.slice(0, 3).map((l) => l.name).join(', ') || 'unknown';
  const lines = [
    '[onboarding-buddy] Orientation for this repository (use it when the user is new or asks "how do I…"):',
    `- Main languages: ${langs}`,
    `- Frameworks/tools: ${stack.frameworks.join(', ') || 'none detected'}`,
  ];
  if (setup.devcontainer) lines.push('- A dev container is available for zero-setup onboarding.');
  if (setup.install.length) lines.push(`- Install: ${setup.install.join(' ; ')}`);
  const dev = setup.run.filter((r) => /run (dev|start)$/.test(r.command)).map((r) => r.command);
  if (dev.length) lines.push(`- Run: ${dev.join(' ; ')}`);
  const tests = setup.run.filter((r) => /run test$/.test(r.command)).map((r) => r.command);
  if (tests.length) lines.push(`- Test: ${tests.join(' ; ')}`);
  lines.push('For new engineers, prefer the day-one-setup skill, the onboarding-buddy agent, and the repo-atlas MCP tools.');
  return lines.join('\n');
}

if (isMain(import.meta.url)) {
  await runHook(async (ctx) => {
    if (ctx.event === 'sessionStart') {
      if ((process.env.ONBOARDING_BUDDY_CONTEXT ?? '').toLowerCase() === 'off') return {};
      return withContext('sessionStart', orientation(ctx.cwd));
    }
    if (ctx.event === 'userPromptSubmitted') {
      if (process.env.ONBOARDING_BUDDY_CAPTURE_QUESTIONS === '1' && ctx.prompt) {
        audit('onboarding-buddy', { event: 'question', cwd: ctx.cwd, prompt: ctx.prompt.slice(0, 500) });
      }
      return {};
    }
    return {};
  });
}
