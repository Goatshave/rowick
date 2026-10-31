import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import approval from '../contributor-approval.cjs';

const { parseApprovedContributors, checkContributorApproval } = approval;

function fixture(overrides = {}) {
  const options = { author: 'new-person', type: 'User', roster: 'fabric0de\n', branch: 'main', state: 'open', permission: null, comments: [], ...overrides };
  const calls = [], writes = [];
  const repo = { owner: 'example', repo: 'rowick' };
  const github = { rest: {
    pulls: {
      get: async input => {
        calls.push(['pull', input]);
        return { data: { user: { login: options.author, type: options.type }, state: options.state, draft: true,
          base: { repo: { full_name: options.target ?? 'example/rowick' } },
          head: { sha: 'untrusted-sha', repo: { full_name: 'attacker/fork' } } } };
      },
      update: async input => { writes.push(['close', input]); },
    },
    repos: {
      get: async input => { calls.push(['repository', input]); return { data: { default_branch: options.branch } }; },
      getContent: async input => {
        calls.push(['roster', input]);
        assert.equal(input.ref, options.branch);
        assert.equal(input.path, '.github/VOUCHED.td');
        if (options.rosterError) throw options.rosterError;
        return { data: { type: 'file', encoding: options.encoding ?? 'base64', content: Buffer.from(options.roster).toString('base64') } };
      },
      getCollaboratorPermissionLevel: async input => {
        calls.push(['permission', input]);
        if (options.permissionError) throw options.permissionError;
        if (!options.permission) throw Object.assign(new Error('Not a collaborator'), { status: 404 });
        return { data: options.permission };
      },
    },
    issues: {
      listComments() {},
      createComment: async input => { writes.push(['comment', input]); },
    },
  }, paginate: async (endpoint, input) => {
    assert.equal(endpoint, github.rest.issues.listComments);
    assert.equal(input.issue_number, 12);
    if (options.commentError) throw options.commentError;
    return options.comments;
  } };
  const context = { repo, eventName: 'pull_request_target', payload: {
    pull_request: { number: 12, user: { login: 'forged-payload-name' }, head: { ref: 'main', repo: { full_name: 'attacker/fork' } } },
  } };
  return { options, writes, calls, context, run: () => checkContributorApproval({ github, context }) };
}

test('approval roster accepts Vouch-compatible names, prefixes and full-line comments', () => {
  assert.deepEqual([...parseApprovedContributors('# Approved people\r\nfabric0de\r\n\r\ngithub:Alice\n')], ['fabric0de', 'alice']);
  assert.ok(parseApprovedContributors(readFileSync('.github/VOUCHED.td', 'utf8')).has('fabric0de'));
});

test('malformed or empty approval rosters are rejected', () => {
  for (const input of ['', '# no accounts', 'alice\nALICE', '@alice', '-alice', 'gitlab:alice', 'alice bob', 'a'.repeat(40), 'x'.repeat(65537)]) {
    assert.throws(() => parseApprovedContributors(input), /approval|entry/);
  }
});

test('approved authors can submit routine draft PRs without new issue approval', async () => {
  const state = fixture({ author: 'Alice', roster: 'fabric0de\ngithub:alice\n' });
  assert.equal((await state.run()).status, 'approved');
  assert.deepEqual(state.writes, []);
  assert.equal(state.calls.some(([operation]) => operation === 'permission'), false);
});

test('the gate reads the current default branch and cannot use a fork self-approval', async () => {
  const state = fixture({ branch: 'trunk' });
  assert.equal((await state.run()).status, 'closed');
  const rosterCall = state.calls.find(([operation]) => operation === 'roster')[1];
  assert.deepEqual(rosterCall, { owner: 'example', repo: 'rowick', path: '.github/VOUCHED.td', ref: 'trunk' });
  assert.equal(state.calls[0][1].pull_number, 12);
});

test('existing repository maintainers do not need a bootstrap approval', async () => {
  for (const permission of [{ permission: 'admin' }, { role_name: 'maintain', permission: 'write' }, { role_name: 'custom-role', permission: 'write' }]) {
    const state = fixture({ permission });
    assert.equal((await state.run()).status, 'maintainer');
    assert.deepEqual(state.writes, []);
  }
});

test('configured Dependabot is allowed but other bot accounts are checked', async () => {
  const allowed = fixture({ author: 'dependabot[bot]', type: 'Bot' });
  assert.equal((await allowed.run()).status, 'automation');
  assert.deepEqual(allowed.writes, []);
  const other = fixture({ author: 'unknown-app[bot]', type: 'Bot' });
  assert.equal((await other.run()).status, 'closed');
  const spoofed = fixture({ author: 'dependabot[bot]', type: 'User' });
  assert.equal((await spoofed.run()).status, 'closed');
});

test('unapproved PRs receive an explanation and are closed, including drafts', async () => {
  const state = fixture();
  assert.deepEqual(await state.run(), { status: 'closed', author: 'new-person' });
  assert.deepEqual(state.writes.map(([operation]) => operation), ['comment', 'close']);
  assert.match(state.writes[0][1].body, /First-time contributors/);
  assert.match(state.writes[0][1].body, /default branch/);
  assert.deepEqual(state.writes[1][1], { owner: 'example', repo: 'rowick', pull_number: 12, state: 'closed' });
});

test('rechecks do not repeat the bot explanation, and user comments cannot suppress it', async () => {
  const marker = '<!-- rowick-contributor-approval -->';
  const state = fixture({ comments: [{ user: { login: 'github-actions[bot]' }, body: marker }] });
  await state.run();
  assert.deepEqual(state.writes.map(([operation]) => operation), ['close']);
  const forged = fixture({ comments: [{ user: { login: 'new-person' }, body: marker }] });
  await forged.run();
  assert.deepEqual(forged.writes.map(([operation]) => operation), ['comment', 'close']);
});

test('API read failures never become a denial comment or closure', async () => {
  for (const overrides of [
    { rosterError: Object.assign(new Error('Service unavailable'), { status: 503 }) },
    { permissionError: Object.assign(new Error('Forbidden'), { status: 403 }) },
    { commentError: Object.assign(new Error('Rate limited'), { status: 429 }) },
  ]) {
    const state = fixture(overrides);
    await assert.rejects(state.run());
    assert.deepEqual(state.writes, []);
  }
});

test('invalid list data fails before modifying a PR', async () => {
  for (const overrides of [{ roster: '' }, { roster: 'alice\nalice\n' }, { encoding: 'none' }]) {
    const state = fixture(overrides);
    await assert.rejects(state.run());
    assert.deepEqual(state.writes, []);
  }
});

test('approval and revocation are read fresh from the default branch', async () => {
  const state = fixture({ author: 'alice', roster: 'fabric0de\nalice\n' });
  assert.equal((await state.run()).status, 'approved');
  state.options.roster = 'fabric0de\n';
  assert.equal((await state.run()).status, 'closed');
});

test('closed PRs are ignored and PRs targeting another repository are rejected', async () => {
  const closed = fixture({ state: 'closed' });
  assert.equal((await closed.run()).status, 'ignored');
  assert.equal(closed.calls.length, 1);
  assert.deepEqual(closed.writes, []);
  const wrong = fixture({ target: 'another/project' });
  await assert.rejects(wrong.run(), /does not target/);
  assert.deepEqual(wrong.writes, []);
});

test('manual rechecks validate their PR number before reading or writing GitHub', async () => {
  for (const number of ['', '0', '-1', '12; echo bad', '9007199254740992']) {
    const state = fixture();
    state.context.eventName = 'workflow_dispatch';
    state.context.payload.inputs = { pr_number: number };
    await assert.rejects(state.run(), /PR number/);
    assert.deepEqual(state.calls, []);
  }
  const state = fixture({ author: 'fabric0de' });
  state.context.eventName = 'workflow_dispatch';
  state.context.payload.inputs = { pr_number: '12' };
  assert.equal((await state.run()).status, 'approved');
});

test('the privileged gate only executes default-branch policy with minimal permissions', () => {
  const workflow = readFileSync('.github/workflows/contributor-approval.yml', 'utf8');
  assert.match(workflow, /pull_request_target:\n    types: \[opened, reopened, synchronize, ready_for_review\]/);
  assert.match(workflow, /permissions:\n  contents: read\n  pull-requests: write/);
  assert.match(workflow, /ref: \$\{\{ github\.event\.repository\.default_branch \}\}/);
  assert.match(workflow, /persist-credentials: false/);
  assert.doesNotMatch(workflow, /contents: write|secrets\.|pull_request\.head|refs\/pull|npm install|pnpm install|gh pr checkout/);
  assert.match(workflow, /result\.status === 'closed'[\s\S]*core\.setFailed/);
});
