#!/usr/bin/env node
// Copies shared libraries into every plugin (plugins must be self-contained: the Agent Plugins spec
// forbids package paths that resolve outside the plugin root).
//   node scripts/sync-shared.mjs          # write copies
//   node scripts/sync-shared.mjs --check  # fail if any copy is out of date (CI)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pluginsDir = path.join(repoRoot, 'plugins');
const MAPPINGS = [
  ['shared/servers/lib', 'servers/lib'],
  ['shared/hooks/lib', 'scripts/hooks/lib'],
];
const checkOnly = process.argv.includes('--check');

const plugins = fs
  .readdirSync(pluginsDir, { withFileTypes: true })
  .filter((d) => d.isDirectory() && fs.existsSync(path.join(pluginsDir, d.name, 'plugin.json')))
  .map((d) => d.name);

let drift = 0;
for (const plugin of plugins) {
  for (const [from, to] of MAPPINGS) {
    const srcDir = path.join(repoRoot, from);
    const destDir = path.join(pluginsDir, plugin, to);
    for (const file of fs.readdirSync(srcDir)) {
      const src = fs.readFileSync(path.join(srcDir, file), 'utf8');
      const destFile = path.join(destDir, file);
      const current = fs.existsSync(destFile) ? fs.readFileSync(destFile, 'utf8') : undefined;
      if (current === src) continue;
      if (checkOnly) {
        drift++;
        console.error(`out of date: plugins/${plugin}/${to}/${file} (run: node scripts/sync-shared.mjs)`);
      } else {
        fs.mkdirSync(destDir, { recursive: true });
        fs.writeFileSync(destFile, src);
        console.log(`synced plugins/${plugin}/${to}/${file}`);
      }
    }
  }
}
if (drift) process.exit(1);
console.log(checkOnly ? 'shared libraries are in sync' : 'done');
