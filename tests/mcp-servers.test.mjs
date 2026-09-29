import assert from 'node:assert/strict';
import path from 'node:path';
import { after, before, describe, test } from 'node:test';
import { createFixtureRepo, pluginDir, removeDir, startMcp } from './helpers.mjs';

let repo;
before(() => {
  repo = createFixtureRepo();
});
after(() => removeDir(repo));

async function withServer(plugin, file, fn) {
  const server = startMcp(path.join(pluginDir(plugin), 'servers', file));
  try {
    const init = await server.initialize();
    assert.equal(init.result.protocolVersion, '2025-06-18');
    return await fn(server);
  } finally {
    server.close();
  }
}

describe('MCP protocol basics', () => {
  test('negotiates older protocol versions and rejects unknown methods', async () => {
    const server = startMcp(path.join(pluginDir('ship-ready'), 'servers', 'release-radar.mjs'));
    try {
      const init = await server.request('initialize', { protocolVersion: '2024-11-05', capabilities: {} });
      assert.equal(init.result.protocolVersion, '2024-11-05');
      assert.equal(init.result.serverInfo.name, 'release-radar');
      const ping = await server.request('ping', {});
      assert.deepEqual(ping.result, {});
      const unknown = await server.request('does/not/exist', {});
      assert.equal(unknown.error.code, -32601);
      const badTool = await server.request('tools/call', { name: 'nope', arguments: {} });
      assert.equal(badTool.error.code, -32602);
    } finally {
      server.close();
    }
  });

  test('every tool is read-only and has a JSON schema', async () => {
    for (const [plugin, file] of [['ship-ready', 'release-radar.mjs'], ['secure-code', 'vuln-scout.mjs'], ['onboarding-buddy', 'repo-atlas.mjs']]) {
      await withServer(plugin, file, async (server) => {
        const { result } = await server.request('tools/list', {});
        assert.ok(result.tools.length >= 4, `${file} exposes tools`);
        for (const tool of result.tools) {
          assert.equal(tool.inputSchema.type, 'object', `${tool.name} schema`);
          assert.equal(tool.annotations?.readOnlyHint, true, `${tool.name} is read-only`);
        }
      });
    }
  });
});

describe('release-radar', () => {
  test('commits, semver, changelog, and readiness', async () => {
    await withServer('ship-ready', 'release-radar.mjs', async (s) => {
      const commits = await s.call('commits_since_last_tag', { path: repo });
      assert.equal(commits.data.lastTag, 'v1.2.3');
      assert.equal(commits.data.commitCount, 2);
      assert.deepEqual(commits.data.commits.map((c) => c.type).sort(), ['feat', 'fix']);

      const semver = await s.call('suggest_semver_bump', { path: repo });
      assert.equal(semver.data.current, '1.2.3');
      assert.equal(semver.data.bump, 'minor');
      assert.equal(semver.data.next, '1.3.0');

      const changelog = await s.call('draft_changelog', { path: repo });
      assert.match(changelog.data.markdown, /## \[1\.3\.0\]/);
      assert.match(changelog.data.markdown, /\*\*api:\*\* add users route/);

      const readiness = await s.call('check_release_artifacts', { path: repo });
      assert.equal(readiness.data.verdict, 'NO-GO'); // no CHANGELOG.md in the fixture
      assert.equal(readiness.data.checks.find((c) => c.id === 'changelog').status, 'fail');
      assert.equal(readiness.data.checks.find((c) => c.id === 'tests').status, 'pass');
    });
  });

  test('reports a clear error for a bad path', async () => {
    await withServer('ship-ready', 'release-radar.mjs', async (s) => {
      const res = await s.call('check_release_artifacts', { path: '/definitely/not/here' });
      assert.equal(res.isError, true);
      assert.match(res.data, /not found/);
    });
  });
});

describe('vuln-scout', () => {
  test('finds and redacts secrets', async () => {
    await withServer('secure-code', 'vuln-scout.mjs', async (s) => {
      const res = await s.call('scan_secrets', { path: repo });
      const aws = res.data.findings.find((f) => f.rule === 'aws-access-key-id');
      assert.ok(aws, 'AWS key detected');
      assert.equal(aws.file, 'api/routes/users.js');
      assert.doesNotMatch(JSON.stringify(res.data), /Z{16}/, 'secret value is redacted');
    });
  });

  test('finds OWASP patterns with CWE mapping', async () => {
    await withServer('secure-code', 'vuln-scout.mjs', async (s) => {
      const res = await s.call('scan_insecure_patterns', { path: repo, minSeverity: 'medium' });
      const rules = new Set(res.data.findings.map((f) => f.rule));
      for (const r of ['sql-injection-template', 'command-injection-node', 'cors-wildcard']) assert.ok(rules.has(r), `${r} detected`);
      assert.ok(res.data.findings.every((f) => /^CWE-\d+$/.test(f.cwe) && f.fix));
    });
  });

  test('audits dependencies and workflows', async () => {
    await withServer('secure-code', 'vuln-scout.mjs', async (s) => {
      const res = await s.call('audit_dependencies', { path: repo });
      const cats = new Set(res.data.findings.map((f) => f.category));
      assert.ok(cats.has('unpinned'), 'wildcard dependency flagged');
      assert.ok(cats.has('reproducibility'), 'missing lockfile flagged');
      assert.ok(cats.has('unpinned-action'), 'unpinned action flagged');
    });
  });

  test('scan_snippet and explain_cwe', async () => {
    await withServer('secure-code', 'vuln-scout.mjs', async (s) => {
      const snip = await s.call('scan_snippet', { code: 'el.innerHTML = userInput;', filename: 'a.js' });
      assert.equal(snip.data.issues[0].cwe, 'CWE-79');
      const cwe = await s.call('explain_cwe', { id: '89' });
      assert.equal(cwe.data.name, 'SQL Injection');
      const unknown = await s.call('explain_cwe', { id: 'CWE-99999' });
      assert.equal(unknown.data.known, false);
    });
  });
});

describe('repo-atlas', () => {
  test('maps repository and setup steps', async () => {
    await withServer('onboarding-buddy', 'repo-atlas.mjs', async (s) => {
      const map = await s.call('map_repository', { path: repo });
      assert.ok(map.data.stack.frameworks.includes('Express'));
      assert.ok(map.data.topLevel.some((t) => t.name === 'api/' && /Backend/.test(t.purpose)));
      const setup = await s.call('find_setup_steps', { path: repo });
      assert.ok(setup.data.install.includes('npm install'));
      assert.ok(setup.data.run.some((r) => r.command === 'npm run dev'));
      assert.match(setup.data.readmeGuidance[0], /Getting started/);
    });
  });

  test('who_owns applies last-matching CODEOWNERS rule', async () => {
    await withServer('onboarding-buddy', 'repo-atlas.mjs', async (s) => {
      assert.deepEqual((await s.call('who_owns', { path: repo, file: 'api/routes/users.js' })).data.owners, ['@octo-org/api-team']);
      assert.deepEqual((await s.call('who_owns', { path: repo, file: 'api/README.md' })).data.owners, ['@octo-org/docs']);
      assert.deepEqual((await s.call('who_owns', { path: repo, file: 'package.json' })).data.owners, ['@octo-org/everyone']);
    });
  });

  test('glossary merges bundled and repository terms', async () => {
    await withServer('onboarding-buddy', 'repo-atlas.mjs', async (s) => {
      const widget = await s.call('glossary_lookup', { path: repo, term: 'widget' });
      assert.equal(widget.data.match.source, 'docs/glossary.md');
      const mcp = await s.call('glossary_lookup', { path: repo, term: 'MCP' });
      assert.equal(mcp.data.match.source, 'onboarding-buddy');
    });
  });

  test('suggests first tasks', async () => {
    await withServer('onboarding-buddy', 'repo-atlas.mjs', async (s) => {
      const res = await s.call('suggest_first_tasks', { path: repo });
      const kinds = res.data.suggestions.map((x) => x.kind);
      assert.ok(kinds.includes('todo'));
      assert.ok(kinds.includes('issues'));
    });
  });
});
