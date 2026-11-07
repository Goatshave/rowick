import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { validateReleaseException } from '../ui-smoke-release-exception.mjs';

function reportFixture() {
  const report = JSON.parse(execFileSync(process.execPath, ['scripts/ui-smoke-preview.mjs', '--report', '--json'], { encoding: 'utf8' }));
  const date = new Date().toLocaleDateString('sv-SE');
  report.reviewEnvironment = { reviewer: 'unit test fixture', date, operatingSystem: 'test fixture', browser: 'test fixture',
    browserZoom: 'not-tested', viewport: 'not-tested', screenReader: 'not-tested', forcedColorsOrHighContrast: 'not-tested' };
  report.patchReleaseException = { version: '0.1.1', approvedBy: 'fabric0de', approvedOn: date,
    reason: 'Unit test fixture for the owner-approved initial release policy', policy: 'docs/0.1.1-validation.md',
    policySha256: createHash('sha256').update(readFileSync('docs/0.1.1-validation.md')).digest('hex') };
  report.observations = [{ scope: 'unit test fixture', evidence: 'Only test data; no manual review is claimed.' }];
  for (const target of report.targets) {
    target.result = 'not-tested'; target.evidence = 'Unit test: full target not manually reviewed.';
    for (const item of [...target.manualChecks, ...target.accessibilityChecks]) {
      item.result = 'not-tested'; item.evidence = 'Unit test: unperformed manual check remains explicit.';
    }
  }
  return report;
}

function check(report, { optIn = true, version = '0.1.1', tag = 'latest', repository = 'git+https://github.com/Goatshave/rowick.git', allowDirty = true } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'rowick-patch-exception-test-'));
  try {
    const path = join(dir, 'report.json'); writeFileSync(path, JSON.stringify(report));
    const args = ['scripts/ui-smoke-report-check.mjs', '--file', path, '--json', '--version', version, '--tag', tag, '--repository-url', repository];
    if (allowDirty) args.push('--allow-dirty');
    if (optIn) args.push('--allow-patch-release-exceptions');
    const run = spawnSync(process.execPath, args, { env: { ...process.env, ROWICK_PATCH_RELEASE_EXCEPTIONS: '' }, encoding: 'utf8' });
    assert.equal(run.stderr, '', run.stderr);
    return { status: run.status, ...JSON.parse(run.stdout) };
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

test('0.1.1 exception remains confined to the approved patch workspace version', () => {
  const result = check(reportFixture());
  const version = JSON.parse(readFileSync("package.json", "utf8")).version;
  if (version !== "0.1.1") {
    assert.equal(result.status, 1);
    assert.ok(result.failures.some(f => f.includes("canonical 0.1.1/latest")));
    return;
  }
  assert.equal(result.status, 0, JSON.stringify(result.failures));
  assert.equal(result.patchReleaseExceptionApplied, true);
  assert.equal(result.notTestedCheckCount, 72);
  assert.equal(result.functionalCheckCount, 45);
  assert.equal(result.accessibilityCheckCount, 27);
});

test('exception requires opt-in and rejects other versions, tags, and repositories', () => {
  for (const options of [{ optIn: false }, { version: '0.1.2' }, { tag: 'next' }, { repository: 'git+https://github.com/someone/fork.git' }]) {
    const result = check(reportFixture(), options);
    assert.equal(result.status, 1);
    assert.ok(result.failures.some(f => f.includes('explicit opt-in and canonical 0.1.1')));
  }
});

test('exception rejects missing approval, changed public policy, stale source and blank evidence', () => {
  const mutations = [
    r => { r.patchReleaseException.approvedBy = ''; },
    r => { r.patchReleaseException.approvedOn = '2000-01-01'; },
    r => { r.patchReleaseException.policySha256 = 'changed'; },
    r => { r.patchReleaseException.reason = ''; },
    r => { r.source.fingerprint = 'stale'; },
    r => { r.observations = []; },
    r => { r.targets[0].manualChecks[0].evidence = ''; },
  ];
  for (const mutate of mutations) {
    const report = reportFixture(); mutate(report);
    assert.equal(check(report).status, 1);
  }
});

test('exception does not accept missing checks, incomplete templates, or false aggregate passes', () => {
  for (const mutate of [
    r => { r.targets[0].manualChecks.pop(); },
    r => { r.targets[0].manualChecks[0].result = 'todo'; },
    r => { r.targets[0].result = 'pass'; },
    r => { r.targets[0].manualChecks[0].check = 'different contract'; },
  ]) {
    const report = reportFixture(); mutate(report);
    assert.equal(check(report).status, 1);
  }
  const dirty = reportFixture(); dirty.source.dirty = true;
  assert.equal(check(dirty, { allowDirty: false }).status, 1);
});

test('Windows smoke remains required in CI and before publishing without weakening approval', () => {
  const windows = readFileSync('.github/workflows/windows-smoke.yml', 'utf8');
  const publish = readFileSync('.github/workflows/release-publish.yml', 'utf8');
  assert.match(windows, /runs-on: windows-2025/);
  for (const cmd of ['pnpm install --frozen-lockfile', 'pnpm check', 'pnpm e2e:smoke', 'pnpm e2e:server-data']) assert.ok(windows.includes(`run: ${cmd}\n`));
  assert.doesNotMatch(windows, /continue-on-error|pass-with-no-tests/);
  assert.match(publish, /needs: windows-smoke/);
  assert.match(publish, /environment: npm/);
  assert.match(publish, /patch_release_exceptions:[\s\S]*?default: false/);
  assert.match(publish, /ROWICK_PATCH_RELEASE_EXCEPTIONS: \$\{\{ github.event.inputs.patch_release_exceptions \}\}/);
  assert.doesNotMatch(publish, /--allow-dirty/);
});

test('patch policy rejects simultaneous exceptions and cannot reuse initial opt-in', () => {
  const report = reportFixture();
  report.initialReleaseException = { ...report.patchReleaseException, version: '0.1.0' };
  assert.ok(check(report).failures.some(f => f.includes('only one release validation exception')));
});

test('both version-scoped policies retain positive coverage independently of the current release', () => {
  for (const version of ['0.1.0', '0.1.1']) {
    const report = reportFixture();
    const initial = version === '0.1.0';
    const field = initial ? 'initialReleaseException' : 'patchReleaseException';
    const policy = initial ? 'docs/initial-release-validation.md' : 'docs/0.1.1-validation.md';
    const exception = { ...report.patchReleaseException, version, policy,
      policySha256: createHash('sha256').update(readFileSync(policy)).digest('hex') };
    delete report.patchReleaseException;
    report[field] = exception;
    const options = { allowInitialReleaseExceptions: initial, allowPatchReleaseExceptions: !initial,
      releaseContext: { version, tag: 'latest', repositoryUrl: 'git+https://github.com/Goatshave/rowick.git' } };
    const failures = [];
    assert.equal(validateReleaseException(report, { workspaceVersion: version }, options, failures), true);
    assert.deepEqual(failures, []);
    assert.equal(validateReleaseException(report, { workspaceVersion: '0.1.2' }, options, []), false);
    assert.equal(validateReleaseException(report, { workspaceVersion: version }, { ...options,
      allowInitialReleaseExceptions: !initial, allowPatchReleaseExceptions: initial }, []), false);
  }
});
