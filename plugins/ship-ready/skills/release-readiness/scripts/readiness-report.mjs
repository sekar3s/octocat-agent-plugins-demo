#!/usr/bin/env node
// Prints a release-readiness report for a repository. Fallback for clients where the
// release-radar MCP server is unavailable.
//   node readiness-report.mjs [--path <repo>] [--json]
import path from 'node:path';
import { checkReleaseArtifacts, draftChangelog, suggestSemverBump } from '../../../servers/release-radar-core.mjs';
import { gitTopLevel } from '../../../servers/lib/workspace.mjs';

const argv = process.argv.slice(2);
const flag = (name) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
};
const target = path.resolve(flag('--path') ?? process.cwd());
const repo = gitTopLevel(target);
if (!repo) {
  console.error(`Not a git repository: ${target}`);
  process.exit(2);
}

const readiness = checkReleaseArtifacts(repo);
const semver = suggestSemverBump(repo);
const changelog = draftChangelog(repo, { version: semver.next });


const icon = { pass: '✅', warn: '⚠️', fail: '❌' };
const lines = [
  `# Release readiness: ${path.basename(repo)}`,
  '',
  `**Verdict:** ${readiness.verdict}  (${readiness.summary.pass} pass · ${readiness.summary.warn} warn · ${readiness.summary.fail} fail)`,
  `**Branch:** ${readiness.branch} · **Last tag:** ${readiness.lastTag ?? 'none'} · **Suggested version:** ${semver.current} → ${semver.next} (${semver.bump})`,
  '',
  '| | Check | Detail |',
  '|---|---|---|',
  ...readiness.checks.map((c) => `| ${icon[c.status]} | ${c.title} | ${c.detail.replace(/\|/g, '\\|')} |`),
  '',
  '## Semver rationale',
  ...semver.rationale.map((r) => `- ${r}`),
  '',
  '## Draft changelog',
  '',
  changelog.markdown,
];
console.log(argv.includes('--json') ? JSON.stringify({ readiness, semver, changelog }, null, 2) : lines.join('\n'));
