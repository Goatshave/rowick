import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { copyBuildAssets } from '../copy-build-assets.mjs';

function exportTargets(value) {
  if (typeof value === 'string') return [value];
  if (!value || typeof value !== 'object') return [];
  return Object.values(value).flatMap(exportTargets);
}

test('asset copying handles existing dist, spaces and every exported stylesheet/component', () => {
  const root = mkdtempSync(join(tmpdir(), 'rowick build assets '));
  try {
    for (const name of ['theme', 'react-ui', 'vue-ui', 'svelte-ui']) {
      cpSync(join('packages', name, 'src'), join(root, name, 'src'), { recursive: true });
      mkdirSync(join(root, name, 'dist'));
      writeFileSync(join(root, name, 'dist', 'compiled.js'), 'preserved compiled output');
    }
    for (const name of ['theme', 'react-ui', 'vue-ui', 'svelte-ui']) {
      const manifest = JSON.parse(readFileSync(join('packages', name, 'package.json'), 'utf8'));
      assert.doesNotMatch(manifest.scripts.build, /mkdir -p|\bcp /);
      copyBuildAssets(name, root); copyBuildAssets(name, root);
      assert.equal(readFileSync(join(root, name, 'dist', 'compiled.js'), 'utf8'), 'preserved compiled output');
      for (const target of exportTargets(manifest.exports).filter(p => p.endsWith('.css') || p.endsWith('.svelte') || p.endsWith('.svelte.d.ts'))) {
        const filename = basename(target);
        const sourcePackage = target.endsWith('.css') && ['vue-ui', 'svelte-ui'].includes(name) ? 'react-ui' : name;
        assert.deepEqual(readFileSync(join(root, name, target)), readFileSync(join(root, sourcePackage, 'src', filename)), name + ': ' + target);
      }
    }
    for (const internal of ['RenderValue.svelte', 'ColumnFilter.svelte']) assert.ok(existsSync(join(root, 'svelte-ui', 'dist', internal)));
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('unknown asset sets are rejected before touching the filesystem', () => {
  const root = mkdtempSync(join(tmpdir(), 'rowick-no-assets-'));
  try {
    assert.throws(() => copyBuildAssets('../unexpected', root), /Unknown package/);
    assert.equal(existsSync(join(root, 'unexpected')), false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('recursive package filters use cross-platform quoting and fail on empty selections', () => {
  const manifest = JSON.parse(readFileSync('package.json', 'utf8'));
  for (const name of ['build', 'check', 'test', 'lint', 'build:examples', 'compatibility:check']) {
    assert.ok(manifest.scripts[name].includes('--fail-if-no-match'), name);
    assert.doesNotMatch(manifest.scripts[name], /'\.\//, name);
    assert.match(manifest.scripts[name], /--filter "\.\/(packages|examples|compatibility)\/\*"/, name);
  }
  const command = process.env.npm_execpath;
  const args = ['-r', '--fail-if-no-match', '--filter', '@rowick/nonexistent-build-selection', 'list', '--depth', '-1'];
  const run = command
    ? spawnSync(process.execPath, [command, ...args], { encoding: 'utf8' })
    : spawnSync('pnpm', args, { encoding: 'utf8', shell: process.platform === 'win32' });
  assert.equal(run.error, undefined);
  assert.notEqual(run.status, 0);
  assert.match(run.stdout + run.stderr, /No projects matched/);
});
