import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

function reportFixture() {
  const report = JSON.parse(execFileSync(process.execPath, ['scripts/ui-smoke-preview.mjs', '--report', '--json'], { encoding: 'utf8' }));
  const date = new Date().toLocaleDateString('sv-SE');
  report.reviewEnvironment = { reviewer: 'unit test fixture', date, operatingSystem: 'test fixture', browser: 'test fixture',
    browserZoom: 'not-tested', viewport: 'not-tested', screenReader: 'not-tested', forcedColorsOrHighContrast: 'not-tested' };
  report.initialReleaseException = { version: '0.1.0', approvedBy: 'fabric0de', approvedOn: date,
    reason: 'Unit test fixture for the owner-approved initial release policy', policy: 'docs/initial-release-validation.md',
    policySha256: createHash('sha256').update(readFileSync('docs/initial-release-validation.md')).digest('hex') };
  report.observations = [{ scope: 'unit test fixture', evidence: 'Only test data; no manual review is claimed.' }];
  for (const target of report.targets) {
    target.result = 'not-tested'; target.evidence = 'Unit test: full target not manually reviewed.';
    for (const item of [...target.manualChecks, ...target.accessibilityChecks]) {
      item.result = 'not-tested'; item.evidence = 'Unit test: unperformed manual check remains explicit.';
    }
  }
  return report;
}

function check(report, { optIn = true, version = '0.1.0', tag = 'latest', repository = 'git+https://github.com/Goatshave/rowick.git', allowDirty = true } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'rowick-initial-exception-test-'));
  try {
    const path = join(dir, 'report.json'); writeFileSync(path, JSON.stringify(report));
    const args = ['scripts/ui-smoke-report-check.mjs', '--file', path, '--json', '--version', version, '--tag', tag, '--repository-url', repository];
    if (allowDirty) args.push('--allow-dirty');
    if (optIn) args.push('--allow-initial-release-exceptions');
    const run = spawnSync(process.execPath, args, { env: { ...process.env, ROWICK_INITIAL_RELEASE_EXCEPTIONS: '' }, encoding: 'utf8' });
    assert.equal(run.stderr, '', run.stderr);
    return { status: run.status, ...JSON.parse(run.stdout) };
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

test('0.1.0 exception accepts explicit untested records without claiming they passed', () => {
  const result = check(reportFixture());
  assert.equal(result.status, 0, JSON.stringify(result.failures));
  assert.equal(result.initialReleaseExceptionApplied, true);
  assert.equal(result.notTestedCheckCount, 72);
  assert.equal(result.functionalCheckCount, 45);
  assert.equal(result.accessibilityCheckCount, 27);
});

test('exception requires opt-in and rejects other versions, tags, and repositories', () => {
  for (const options of [{ optIn: false }, { version: '0.1.1' }, { tag: 'next' }, { repository: 'git+https://github.com/someone/fork.git' }]) {
    const result = check(reportFixture(), options);
    assert.equal(result.status, 1);
    assert.ok(result.failures.some(f => f.includes('explicit opt-in and canonical 0.1.0')));
  }
});

test('exception rejects missing approval, changed public policy, stale source and blank evidence', () => {
  const mutations = [
    r => { r.initialReleaseException.approvedBy = ''; },
    r => { r.initialReleaseException.approvedOn = '2000-01-01'; },
    r => { r.initialReleaseException.policySha256 = 'changed'; },
    r => { r.initialReleaseException.reason = ''; },
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
  assert.match(publish, /initial_release_exceptions:[\s\S]*?default: false/);
  assert.match(publish, /ROWICK_INITIAL_RELEASE_EXCEPTIONS: \$\{\{ github.event.inputs.initial_release_exceptions \}\}/);
  assert.doesNotMatch(publish, /--allow-dirty/);
});
