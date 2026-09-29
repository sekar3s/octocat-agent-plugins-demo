#!/usr/bin/env node
// repo-atlas — read-only MCP server that helps new engineers understand a repository (onboarding-buddy plugin).
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ToolError, createServer } from './lib/mcp-stdio.mjs';
import { resolveWorkspace } from './lib/workspace.mjs';
import { findSetupSteps, loadGlossary, mapRepository, suggestFirstTasks, whoOwns } from './atlas-core.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const glossaryPath = process.env.REPO_ATLAS_GLOSSARY || path.join(here, 'data', 'glossary.json');

const pathArg = { path: { type: 'string', description: 'Absolute path to the repository. Defaults to the current workspace.' } };
const readOnly = { readOnlyHint: true, destructiveHint: false, openWorldHint: false };

const server = createServer({
  name: 'repo-atlas',
  version: '1.0.0',
  instructions:
    'Tools that help new engineers understand a repository: structure, setup steps, code owners, glossary, and starter tasks. ' +
    'All tools are read-only. Pass the absolute workspace path in "path".',
  tools: [
    {
      name: 'map_repository',
      description: 'Map the repository: languages, frameworks, top-level folders with their purpose, entry points, docs, CI workflows, and Copilot customizations.',
      inputSchema: { type: 'object', properties: { ...pathArg }, additionalProperties: false },
      annotations: { title: 'Map repository', ...readOnly },
      handler: async (args, ctx) => mapRepository(await resolveWorkspace(args.path, ctx)),
    },
    {
      name: 'find_setup_steps',
      description: 'Find how to set up, run, build, and test the project: prerequisites, install commands, npm scripts, Makefile targets, dev container, and README setup sections.',
      inputSchema: { type: 'object', properties: { ...pathArg }, additionalProperties: false },
      annotations: { title: 'Find setup steps', ...readOnly },
      handler: async (args, ctx) => findSetupSteps(await resolveWorkspace(args.path, ctx)),
    },
    {
      name: 'who_owns',
      description: 'Find the code owners (CODEOWNERS) and most frequent recent contributors for a file or folder, so a new engineer knows who to ask.',
      inputSchema: {
        type: 'object',
        properties: { ...pathArg, file: { type: 'string', description: 'Repository-relative file or folder, e.g. "api/src/routes/order.ts".' } },
        required: ['file'],
        additionalProperties: false,
      },
      annotations: { title: 'Who owns this?', ...readOnly },
      handler: async (args, ctx) => {
        if (!args.file) throw new ToolError('"file" is required');
        return whoOwns(await resolveWorkspace(args.path, ctx), args.file);
      },
    },
    {
      name: 'glossary_lookup',
      description: 'Look up team and domain terminology. Merges the bundled glossary with repository glossaries (GLOSSARY.md, docs/glossary.md, .github/onboarding/glossary.json). Omit "term" to list all terms.',
      inputSchema: {
        type: 'object',
        properties: { ...pathArg, term: { type: 'string', description: 'Term or acronym to explain.' } },
        additionalProperties: false,
      },
      annotations: { title: 'Glossary lookup', ...readOnly },
      handler: async (args, ctx) => {
        const entries = loadGlossary(await resolveWorkspace(args.path, ctx), glossaryPath);
        if (!args.term) return { count: Object.keys(entries).length, terms: Object.values(entries).map((e) => e.term).sort() };
        const q = String(args.term).toLowerCase();
        const exact = entries[q];
        const related = Object.values(entries).filter((e) => e !== exact && (e.term.toLowerCase().includes(q) || e.definition.toLowerCase().includes(q))).slice(0, 5);
        return { term: args.term, match: exact ?? null, related, hint: exact || related.length ? undefined : 'Not in the glossary — search the codebase and docs, then consider adding it to docs/glossary.md.' };
      },
    },
    {
      name: 'suggest_first_tasks',
      description: 'Suggest good first tasks for a new engineer: TODO/FIXME items, modules without tests, onboarding doc gaps, and labeled starter issues.',
      inputSchema: { type: 'object', properties: { ...pathArg }, additionalProperties: false },
      annotations: { title: 'Suggest first tasks', ...readOnly },
      handler: async (args, ctx) => suggestFirstTasks(await resolveWorkspace(args.path, ctx)),
    },
  ],
});

server.start();
