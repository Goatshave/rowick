import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { readBootstrapPackages, requireUnpublishedPackages, validateBootstrapTarget } from '../release-bootstrap-auth.mjs';

const env = { BOOTSTRAP_FIRST_PUBLISH: 'true', RELEASE_VERSION: '0.1.0', NPM_TAG: 'latest',
  GITHUB_REF: 'refs/heads/main', GITHUB_REPOSITORY: 'Goatshave/rowick',
  REPOSITORY_URL: 'git+https://github.com/Goatshave/rowick.git' };

test('bootstrap is opt-in and rejects other versions, repositories and branches', () => {
  assert.equal(validateBootstrapTarget({}), false);
  assert.equal(validateBootstrapTarget({ BOOTSTRAP_FIRST_PUBLISH: 'false' }), false);
  assert.equal(validateBootstrapTarget(env), true);
  for (const [key, value] of Object.entries({ BOOTSTRAP_FIRST_PUBLISH: 'TRUE', RELEASE_VERSION: '0.1.1',
    NPM_TAG: 'next', GITHUB_REF: 'refs/heads/feature', GITHUB_REPOSITORY: 'someone/fork',
    REPOSITORY_URL: 'git+https://github.com/someone/fork.git' })) {
    assert.throws(() => validateBootstrapTarget({ ...env, [key]: value }), key);
  }
});

test('bootstrap reads the complete real public package set', () => {
  assert.equal(readBootstrapPackages(process.cwd()).length, 12);
});

test('bootstrap refuses an incomplete or mismatched package set', () => {
  const root = mkdtempSync(join(tmpdir(), 'rowick-bootstrap-packages-'));
  try {
    writeFileSync(join(root, 'package.json'), JSON.stringify({ version: '0.1.0' }));
    mkdirSync(join(root, 'packages'));
    assert.throws(() => readBootstrapPackages(root), /twelve/);
    for (let index = 0; index < 12; index++) {
      const dir = join(root, 'packages', `p${index}`); mkdirSync(dir);
      writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: `@rowick/p${index}`, version: '0.1.0', publishConfig: { access: 'public' } }));
    }
    assert.equal(readBootstrapPackages(root).length, 12);
    writeFileSync(join(root, 'packages/p0/package.json'), JSON.stringify({ name: '@other/p0', version: '0.1.0', publishConfig: { access: 'public' } }));
    assert.throws(() => readBootstrapPackages(root), /unique public/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('only explicit registry 404 permits first publication; existing packages and errors stop it', async () => {
  const requests = [];
  await requireUnpublishedPackages(['@rowick/core', '@rowick/data'], async (url, options) => {
    requests.push(url);
    assert.equal(options.redirect, 'error');
    assert.ok(options.signal instanceof AbortSignal);
    return new Response(null, { status: 404 });
  });
  assert.deepEqual(requests, ['https://registry.npmjs.org/%40rowick%2Fcore', 'https://registry.npmjs.org/%40rowick%2Fdata']);
  for (const status of [200, 401, 403, 429, 500]) {
    let calls = 0;
    await assert.rejects(requireUnpublishedPackages(['@rowick/core', '@rowick/data'], async () => {
      calls++; return new Response(null, { status });
    }), new RegExp(`received ${status}`));
    assert.equal(calls, 1);
  }
  await assert.rejects(requireUnpublishedPackages(['@rowick/core'], async () => { throw new Error('network unavailable'); }), /network unavailable/);
});

test('publish step isolates the token and removes temporary auth configuration on success and failure', () => {
  const workflow = readFileSync('.github/workflows/release-publish.yml', 'utf8');
  const step = workflow.split('      - name: Publish to npm\n')[1];
  assert.ok(step.includes("inputs.bootstrap_first_publish && secrets.NPM_BOOTSTRAP_TOKEN || ''"));
  assert.equal(workflow.split('secrets.NPM_BOOTSTRAP_TOKEN').length - 1, 1);
  const script = step.split('        run: |\n')[1].replace(/^          /gm, '');
  const root = mkdtempSync(join(tmpdir(), 'rowick-bootstrap-auth-'));
  try {
    const prefix = 'node() { return 0; }; pnpm() { cp -p "$NPM_CONFIG_USERCONFIG" "$RUNNER_TEMP/observed-config"; return "$PUBLISH_EXIT"; };\n';
    for (const exit of ['0', '7']) {
      const run = spawnSync('bash', ['-e', '-o', 'pipefail', '-c', prefix + script], {
        env: { ...process.env, ...env, NODE_AUTH_TOKEN: 'test-only-token', RUNNER_TEMP: root, PUBLISH_EXIT: exit }, encoding: 'utf8',
      });
      assert.equal(run.status, Number(exit), run.stderr);
      assert.equal(statSync(join(root, 'observed-config')).mode & 0o777, 0o600);
      assert.equal(readFileSync(join(root, 'observed-config'), 'utf8'), '//registry.npmjs.org/:_authToken=${NODE_AUTH_TOKEN}\n');
      assert.equal(run.stdout.includes('test-only-token'), false);
      assert.equal(run.stderr.includes('test-only-token'), false);
      assert.deepEqual(readdirSync(root), ['observed-config']);
    }
    const missing = spawnSync('bash', ['-e', '-o', 'pipefail', '-c', prefix + script], {
      env: { ...process.env, ...env, NODE_AUTH_TOKEN: '', RUNNER_TEMP: root, PUBLISH_EXIT: '0' }, encoding: 'utf8',
    });
    assert.notEqual(missing.status, 0);
    assert.match(missing.stderr, /NPM_BOOTSTRAP_TOKEN is required/);
    const standard = spawnSync('bash', ['-e', '-o', 'pipefail', '-c',
      'pnpm() { test -z "$NODE_AUTH_TOKEN"; test -z "$NPM_CONFIG_USERCONFIG"; };\n' + script], {
      env: { ...process.env, ...env, BOOTSTRAP_FIRST_PUBLISH: 'false', NODE_AUTH_TOKEN: '', NPM_CONFIG_USERCONFIG: '' }, encoding: 'utf8',
    });
    assert.equal(standard.status, 0, standard.stderr);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
