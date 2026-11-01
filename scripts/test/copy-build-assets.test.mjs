import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import test from 'node:test';
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
