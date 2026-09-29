#!/usr/bin/env node
// vuln-scout — read-only, offline MCP server for security scanning (secure-code plugin).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ToolError, createServer } from './lib/mcp-stdio.mjs';
import { resolveWorkspace } from './lib/workspace.mjs';
import { auditDependencies } from './dependency-audit.mjs';
import { scanInsecurePatterns, scanSecrets } from './scanner.mjs';
import { findCodeIssues, findSecrets } from './security-rules.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const CWE = JSON.parse(fs.readFileSync(path.join(here, 'data', 'cwe.json'), 'utf8'));

const scope = {
  path: { type: 'string', description: 'Absolute path to the repository. Defaults to the current workspace.' },
  files: { type: 'array', items: { type: 'string' }, description: 'Optional repository-relative files to scan.' },
  changedOnly: { type: 'boolean', default: false, description: 'Scan only uncommitted (modified + untracked) files.' },
};
const readOnly = { readOnlyHint: true, destructiveHint: false, openWorldHint: false };

const server = createServer({
  name: 'vuln-scout',
  version: '1.0.0',
  instructions:
    'Offline security scanners. Secret values are always redacted in results. ' +
    'Pass the absolute workspace path in "path". Use changedOnly=true for fast inner-loop checks.',
  tools: [
    {
      name: 'scan_secrets',
      description: 'Scan files for hard-coded credentials (cloud keys, tokens, private keys, connection strings). Values are redacted.',
      inputSchema: { type: 'object', properties: { ...scope, maxFindings: { type: 'integer', minimum: 1, maximum: 1000, default: 200 } }, additionalProperties: false },
      annotations: { title: 'Scan for secrets', ...readOnly },
      handler: async (args, ctx) => scanSecrets(await resolveWorkspace(args.path, ctx), args),
    },
    {
      name: 'scan_insecure_patterns',
      description: 'Scan source files for OWASP Top 10 / CWE-mapped insecure patterns (SQL injection, XSS, command injection, weak crypto, TLS bypass, permissive CORS, and more) with fix guidance.',
      inputSchema: {
        type: 'object',
        properties: { ...scope, minSeverity: { type: 'string', enum: ['low', 'medium', 'high', 'critical'], default: 'low' } },
        additionalProperties: false,
      },
      annotations: { title: 'Scan for insecure code patterns', ...readOnly },
      handler: async (args, ctx) => scanInsecurePatterns(await resolveWorkspace(args.path, ctx), args),
    },
    {
      name: 'audit_dependencies',
      description: 'Audit dependency manifests (package.json, requirements*.txt) and GitHub Actions workflows for supply-chain risks: unpinned versions, missing lockfiles, known-compromised packages, unpinned actions, and workflow injection.',
      inputSchema: { type: 'object', properties: { path: scope.path }, additionalProperties: false },
      annotations: { title: 'Audit dependencies and workflows', ...readOnly },
      handler: async (args, ctx) => auditDependencies(await resolveWorkspace(args.path, ctx)),
    },
    {
      name: 'scan_snippet',
      description: 'Scan a code snippet or diff (not yet written to disk) for secrets and insecure patterns. Use before proposing code.',
      inputSchema: {
        type: 'object',
        properties: {
          code: { type: 'string', description: 'Code or diff text to scan.' },
          filename: { type: 'string', description: 'Filename used to select language rules, e.g. "routes/user.ts".', default: 'snippet.ts' },
        },
        required: ['code'],
        additionalProperties: false,
      },
      annotations: { title: 'Scan snippet', ...readOnly },
      handler: async ({ code, filename = 'snippet.ts' }) => {
        if (typeof code !== 'string') throw new ToolError('"code" must be a string');
        return {
          secrets: findSecrets(code).map(({ index, ...f }) => f),
          issues: findCodeIssues(code, filename),
        };
      },
    },
    {
      name: 'explain_cwe',
      description: 'Explain a CWE weakness (name, OWASP Top 10 category, impact, and recommended fix).',
      inputSchema: {
        type: 'object',
        properties: { id: { type: 'string', description: 'CWE identifier, e.g. "CWE-89" or "89".' } },
        required: ['id'],
        additionalProperties: false,
      },
      annotations: { title: 'Explain CWE', ...readOnly },
      handler: async ({ id }) => {
        const key = `CWE-${String(id).replace(/^cwe-?/i, '')}`;
        const entry = CWE[key];
        if (!entry) {
          return { id: key, known: false, reference: `https://cwe.mitre.org/data/definitions/${key.slice(4)}.html`, available: Object.keys(CWE) };
        }
        return { id: key, known: true, ...entry, reference: `https://cwe.mitre.org/data/definitions/${key.slice(4)}.html` };
      },
    },
  ],
});

server.start();
