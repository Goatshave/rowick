import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import triage from '../issue-triage.cjs';

const { suggestIssueLabels, triageIssue } = triage;

function fixture(overrides = {}) {
  const options = { title: '[Bug]: React 셀 편집 시 연속 저장 오류', body: '', state: 'open', labels: ['bug'], ...overrides };
  const writes = [], reads = [];
  const context = { eventName: 'issues', repo: { owner: 'example', repo: 'rowick' }, payload: {
    action: 'opened', issue: { number: 7, title: 'FORGED PAYLOAD', labels: [] },
  } };
  const github = { rest: { issues: {
    get: async input => {
      reads.push(input);
      if (options.readError) throw options.readError;
      return { data: { ...options, labels: options.labels.map(name => ({ name })) } };
    },
    getLabel: async input => {
      reads.push(input);
      if (options.lookupError && input.name === options.lookupErrorLabel) throw options.lookupError;
      return { data: { name: input.name, archived_at: options.archived === input.name ? '2026-10-30' : null } };
    },
    addLabels: async input => {
      if (options.writeError) throw options.writeError;
      writes.push(input);
      options.labels.push(...input.labels);
    },
  } } };
  return { options, context, reads, writes, run: () => triageIssue({ github, context }) };
}

test('content rules recognize English and Korean areas without granting approval', () => {
  const labels = suggestIssueLabels({ title: '[Bug]: Vue clipboard accessibility regression',
    body: 'SvelteKit 서버 데이터 페이지네이션과 CSV 내보내기 문서, NVDA, 셀 편집', action: 'opened' });
  assert.deepEqual(new Set(labels), new Set(['area:vue', 'area:svelte', 'area:accessibility', 'area:editing',
    'area:server-data', 'area:export', 'area:docs', 'bug', 'needs-triage']));
  assert.equal(labels.some(name => /approv|vouch|help wanted|good first issue/.test(name)), false);
});

test('form headings, policy checkboxes, comments and empty answers do not produce false areas', () => {
  assert.deepEqual(suggestIssueLabels({ title: 'Unexpected behavior', body:
    '### React / Vue / Svelte\n_No response_\n- [x] I read CONTRIBUTING.md and documentation\n<!-- clipboard xlsx -->',
    action: 'opened' }), ['needs-triage']);
});

test('existing types and unrelated maintainer labels are preserved and edits do not restore needs-triage', () => {
  assert.deepEqual(suggestIssueLabels({ title: '[Bug]: React rendering', labels: ['enhancement', 'priority:high'], action: 'edited' }), ['area:react']);
  assert.deepEqual(suggestIssueLabels({ title: 'Unclear request', action: 'edited' }), []);
  assert.deepEqual(suggestIssueLabels({ title: 'Unclear request', action: 'reopened' }), ['needs-triage']);
  assert.deepEqual(suggestIssueLabels({ title: '[Feature]: Larger cells', action: 'edited' }), ['enhancement']);
});

test('manual triage opt-out prevents automatic additions on every supported action', () => {
  for (const action of ['opened', 'edited', 'reopened', 'manual']) {
    assert.deepEqual(suggestIssueLabels({ title: '[Bug]: React clipboard', labels: ['TRIAGE:MANUAL'], action }), []);
  }
});

test('triage uses fresh API content and sends only additive catalog labels', async () => {
  const state = fixture({ labels: ['bug', 'priority:high'] });
  assert.deepEqual(await state.run(), { status: 'labeled', labels: ['area:react', 'area:editing', 'needs-triage'] });
  assert.deepEqual(state.writes, [{ owner: 'example', repo: 'rowick', issue_number: 7,
    labels: ['area:react', 'area:editing', 'needs-triage'] }]);
  assert.ok(state.options.labels.includes('priority:high'));
});

test('repeat events are idempotent and changed content adds areas without removing manual labels', async () => {
  const state = fixture();
  await state.run();
  assert.equal((await state.run()).status, 'unchanged');
  assert.equal(state.writes.length, 1);
  state.context.payload.action = 'edited';
  state.options.title = 'Vue rendering';
  assert.deepEqual((await state.run()).labels, ['area:vue']);
  assert.ok(state.options.labels.includes('area:react'));
});

test('closed issues and pull requests are never labeled', async () => {
  for (const options of [{ state: 'closed' }, { pull_request: { url: 'pull' } }]) {
    const state = fixture(options);
    assert.equal((await state.run()).status, 'ignored');
    assert.deepEqual(state.writes, []);
  }
});

test('missing or archived label definitions fail before any issue mutation', async () => {
  for (const options of [
    { lookupError: Object.assign(new Error('Not found'), { status: 404 }), lookupErrorLabel: 'area:editing' },
    { archived: 'area:editing' },
  ]) {
    const state = fixture(options);
    await assert.rejects(state.run());
    assert.deepEqual(state.writes, []);
  }
});

test('API read, permission and write failures surface instead of reporting success', async () => {
  for (const options of [
    { readError: Object.assign(new Error('Unavailable'), { status: 503 }) },
    { lookupError: Object.assign(new Error('Forbidden'), { status: 403 }), lookupErrorLabel: 'area:react' },
    { writeError: Object.assign(new Error('Rate limited'), { status: 429 }) },
  ]) {
    const state = fixture(options);
    await assert.rejects(state.run());
    assert.deepEqual(state.writes, []);
  }
});

test('manual rechecks validate numbers before API calls and classify an open issue', async () => {
  for (const value of ['', '0', '-1', '7; echo bad', '9007199254740992']) {
    const state = fixture();
    state.context.eventName = 'workflow_dispatch';
    state.context.payload.inputs = { issue_number: value };
    await assert.rejects(state.run(), /issue number/);
    assert.deepEqual(state.reads, []);
    assert.deepEqual(state.writes, []);
  }
  const state = fixture();
  state.context.eventName = 'workflow_dispatch';
  state.context.payload.inputs = { issue_number: '7' };
  assert.equal((await state.run()).status, 'labeled');
});

test('unsupported events and malformed content do not mutate issues', async () => {
  const state = fixture({ title: null });
  await assert.rejects(state.run(), /Invalid issue/);
  assert.deepEqual(state.writes, []);
  const unrelated = fixture();
  unrelated.context.payload.action = 'labeled';
  await assert.rejects(unrelated.run(), /Unsupported/);
  assert.deepEqual(unrelated.reads, []);
});

test('triage workflow executes only trusted default-branch rules and treats content as data', () => {
  const workflow = readFileSync('.github/workflows/issue-triage.yml', 'utf8');
  assert.match(workflow, /issues:\n    types: \[opened, edited, reopened\]/);
  assert.match(workflow, /permissions:\n  contents: read\n  issues: write/);
  assert.match(workflow, /ref: \$\{\{ github\.event\.repository\.default_branch \}\}/);
  assert.match(workflow, /persist-credentials: false/);
  assert.doesNotMatch(workflow, /contents: write|pull-requests: write|secrets\.|pnpm install|npm install|pull_request\.head/);
  assert.doesNotMatch(workflow.split('          script: |\n')[1], /\$\{\{/);
});
