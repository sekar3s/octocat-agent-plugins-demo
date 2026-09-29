#!/usr/bin/env node
// release-radar — read-only MCP server for release readiness (ship-ready plugin).
import { createServer } from './lib/mcp-stdio.mjs';
import { resolveWorkspace } from './lib/workspace.mjs';
import { checkReleaseArtifacts, commitsSinceLastTag, draftChangelog, suggestSemverBump } from './release-radar-core.mjs';

const pathArg = {
  path: {
    type: 'string',
    description: 'Absolute path to the repository to analyze. Defaults to the current workspace.',
  },
};
const readOnly = { readOnlyHint: true, destructiveHint: false, openWorldHint: false };

const server = createServer({
  name: 'release-radar',
  version: '1.0.0',
  instructions:
    'Release-readiness tools for the current git repository. All tools are read-only. ' +
    'Always pass the absolute workspace path in "path" when you know it.',
  tools: [
    {
      name: 'commits_since_last_tag',
      description: 'List commits since the most recent git tag, classified by Conventional Commit type (with heuristics for non-conventional messages).',
      inputSchema: {
        type: 'object',
        properties: { ...pathArg, maxCommits: { type: 'integer', minimum: 1, maximum: 1000, default: 200 } },
        additionalProperties: false,
      },
      annotations: { title: 'Commits since last tag', ...readOnly },
      handler: async (args, ctx) => commitsSinceLastTag(await resolveWorkspace(args.path, ctx), args),
    },
    {
      name: 'suggest_semver_bump',
      description: 'Suggest the next semantic version (major/minor/patch) from the commits since the last tag.',
      inputSchema: {
        type: 'object',
        properties: { ...pathArg, current: { type: 'string', description: 'Override the current version (e.g. 1.4.2).' } },
        additionalProperties: false,
      },
      annotations: { title: 'Suggest semver bump', ...readOnly },
      handler: async (args, ctx) => suggestSemverBump(await resolveWorkspace(args.path, ctx), args),
    },
    {
      name: 'draft_changelog',
      description: 'Draft a Keep-a-Changelog style markdown section for the next release, grouped by change type.',
      inputSchema: {
        type: 'object',
        properties: { ...pathArg, version: { type: 'string', description: 'Version heading to use. Defaults to the suggested next version.' } },
        additionalProperties: false,
      },
      annotations: { title: 'Draft changelog', ...readOnly },
      handler: async (args, ctx) => draftChangelog(await resolveWorkspace(args.path, ctx), args),
    },
    {
      name: 'check_release_artifacts',
      description: 'Run the release-readiness checklist (changelog, clean tree, branch, CI, tests, lockfiles, versions, migrations, policies, TODO markers) and return a GO / GO WITH CAUTION / NO-GO verdict.',
      inputSchema: { type: 'object', properties: { ...pathArg }, additionalProperties: false },
      annotations: { title: 'Check release artifacts', ...readOnly },
      handler: async (args, ctx) => checkReleaseArtifacts(await resolveWorkspace(args.path, ctx)),
    },
  ],
});

server.start();
