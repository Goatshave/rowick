import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

const publish = readFileSync('.github/workflows/release-publish.yml', 'utf8');
const verify = readFileSync('.github/workflows/release-verify.yml', 'utf8');

// Execute the actual named run blocks, so regression tests exercise shell
// interpretation as well as validation. No package install or publish is run.
function runBlock(workflow, name) {
  const step = workflow.split(`      - name: ${name}\n`)[1]?.split('\n      - name: ')[0];
  assert.ok(step, `Missing step: ${name}`);
  const block = step.split('        run: |\n')[1];
  return block ? block.replace(/^          /gm, '') : step.match(/        run: (.+)/)?.[1];
}

function fixture(callback) {
  const directory = mkdtempSync(join(tmpdir(), 'rowick-workflow-input-'));
  const file = join(directory, 'github-env');
  const sentinel = join(directory, 'executed');
  writeFileSync(join(directory, 'package.json'), '{"version":"0.1.0"}');
  writeFileSync(file, '');
  const env = { ...process.env, GITHUB_ENV: file, RELEASE_VERSION: '0.1.0', NPM_TAG: 'latest',
    REPOSITORY_URL: 'git+https://github.com/Goatshave/rowick.git', CONFIRM_PUBLISH: 'publish-rowick' };
  const run = (script, overrides = {}) => spawnSync('bash', ['--noprofile', '--norc', '-e', '-o', 'pipefail', '-c', script],
    { cwd: directory, env: { ...env, ...overrides }, encoding: 'utf8' });
  try { callback({ run, file, sentinel }); } finally { rmSync(directory, { recursive: true, force: true }); }
}

const guards = ['Require release version', 'Require npm dist-tag', 'Require publish confirmation', 'Require public repository URL']
  .map(name => runBlock(publish, name)).join('\n');

test('release inputs enter through env rather than generated shell source', () => {
  for (const workflow of [publish, verify]) {
    for (const step of workflow.split('      - name: ').slice(1)) {
      const script = step.split('        run: |\n')[1] ?? step.match(/        run: (.+)/)?.[1] ?? '';
      assert.doesNotMatch(script, /\$\{\{\s*github\.event\.inputs\./);
    }
  }
  for (const [variable, input] of [['RELEASE_VERSION', 'version'], ['NPM_TAG', 'npm_tag'],
    ['REPOSITORY_URL', 'repository_url'], ['CONFIRM_PUBLISH', 'confirm_publish']]) {
    assert.ok(publish.includes(variable + ': ${{ github.event.inputs.' + input + ' }}'));
  }
  assert.ok(verify.includes('REQUESTED_VERSION: ${{ github.event.inputs.version }}'));
});

test('publish accepts stable releases and documented prerelease channels', () => fixture(({ run }) => {
  assert.equal(run(guards).status, 0);
  for (const channel of ['alpha', 'beta', 'rc']) {
    assert.equal(run(guards, { RELEASE_VERSION: `0.2.0-${channel}.1`, NPM_TAG: 'next' }).status, 0);
    assert.notEqual(run(guards, { RELEASE_VERSION: `0.2.0-${channel}.1`, NPM_TAG: 'latest' }).status, 0);
  }
}));

test('publish rejects command substitution and environment-line injection in every input', () => fixture(({ run, file, sentinel }) => {
  for (const variable of ['RELEASE_VERSION', 'NPM_TAG', 'REPOSITORY_URL', 'CONFIRM_PUBLISH']) {
    for (const value of [`$(touch '${sentinel}')`, `\`touch '${sentinel}'\``, `"; touch '${sentinel}'; #`, '0.1.0\nNPM_CONFIG_REGISTRY=https://invalid.example', '0.1.0\rEXTRA=value']) {
      assert.notEqual(run(guards, { [variable]: value }).status, 0, variable);
      assert.equal(existsSync(sentinel), false);
      assert.equal(readFileSync(file, 'utf8'), '');
    }
  }
}));

test('publish rejects missing inputs, numeric dist-tags, unsupported prereleases and nonpublic repository URLs', () => fixture(({ run }) => {
  for (const variable of ['RELEASE_VERSION', 'NPM_TAG', 'REPOSITORY_URL', 'CONFIRM_PUBLISH']) {
    assert.notEqual(run(guards, { [variable]: '' }).status, 0);
  }
  for (const value of ['1', 'v1.0.0', 'latest tag']) assert.notEqual(run(guards, { NPM_TAG: value }).status, 0);
  assert.notEqual(run(guards, { RELEASE_VERSION: '0.2.0-preview.1', NPM_TAG: 'next' }).status, 0);
  for (const value of ['git+https://github.com/OWNER/REPO.git', 'git@github.com:Goatshave/rowick.git', 'https://other.example/rowick.git']) {
    assert.notEqual(run(guards, { REPOSITORY_URL: value }).status, 0);
  }
}));

test('verification resolves PR version from its manifest and validates manual versions', () => fixture(({ run, file }) => {
  const script = runBlock(verify, 'Resolve release version');
  assert.equal(run(script, { EVENT_NAME: 'pull_request', REQUESTED_VERSION: '' }).status, 0);
  assert.equal(readFileSync(file, 'utf8'), 'RELEASE_VERSION=0.1.0\n');
  writeFileSync(file, '');
  assert.equal(run(script, { EVENT_NAME: 'workflow_dispatch', REQUESTED_VERSION: '0.2.0-rc.1' }).status, 0);
  assert.equal(readFileSync(file, 'utf8'), 'RELEASE_VERSION=0.2.0-rc.1\n');
}));

test('verification rejects hostile or empty manual input before writing GITHUB_ENV', () => fixture(({ run, file, sentinel }) => {
  const script = runBlock(verify, 'Resolve release version');
  for (const value of ['', `$(touch '${sentinel}')`, `\`touch '${sentinel}'\``, '0.1.0\nEXTRA=bad', '0.1.0\rEXTRA=bad']) {
    assert.notEqual(run(script, { EVENT_NAME: 'workflow_dispatch', REQUESTED_VERSION: value }).status, 0);
    assert.equal(readFileSync(file, 'utf8'), '');
    assert.equal(existsSync(sentinel), false);
  }
}));
