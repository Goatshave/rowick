const rosterPath = '.github/VOUCHED.td';
const commentMarker = '<!-- rowick-contributor-approval -->';
const usernamePattern = /^[a-z0-9](?:[a-z0-9-]{0,37}[a-z0-9])?$/i;

// A deliberately small Vouch-compatible format: GitHub usernames, optional
// github: prefixes, blank lines and full-line comments. Other trust sources or
// denouncements are not accepted; revoke approval by removing the username.
function parseApprovedContributors(source) {
  if (typeof source !== 'string' || source.length > 64 * 1024) {
    throw new Error('The contributor approval list must be text no larger than 64 KiB.');
  }
  const approved = new Set();
  for (const [index, line] of source.split(/\r?\n/).entries()) {
    const value = line.trim();
    if (!value || value.startsWith('#')) continue;
    const username = value.replace(/^github:/i, '').toLowerCase();
    if (!usernamePattern.test(username) || username.includes('--') || approved.has(username)) {
      throw new Error(`Invalid or duplicate contributor entry at line ${index + 1}.`);
    }
    approved.add(username);
  }
  if (approved.size === 0) throw new Error('The contributor approval list must not be empty.');
  return approved;
}

async function checkContributorApproval({ github, context }) {
  const numberValue = context.eventName === 'workflow_dispatch'
    ? context.payload.inputs?.pr_number
    : context.payload.pull_request?.number;
  if (!/^[1-9]\d*$/.test(String(numberValue))) throw new Error('A positive PR number is required.');
  const pull_number = Number(numberValue);
  if (!Number.isSafeInteger(pull_number)) throw new Error('PR number exceeds the safe integer range.');
  const { owner, repo } = context.repo;
  const repository = `${owner}/${repo}`;
  const { data: pr } = await github.rest.pulls.get({ owner, repo, pull_number });
  if (pr.base.repo.full_name.toLowerCase() !== repository.toLowerCase()) {
    throw new Error('The PR does not target this repository.');
  }
  if (pr.state !== 'open') return { status: 'ignored' };
  const author = pr.user.login;
  if (typeof author !== 'string' || !author) throw new Error('The PR author is missing.');

  // Resolve the policy from GitHub's current default branch, never the PR head.
  // API read errors and malformed policy fail before any comment/closure.
  const { data: metadata } = await github.rest.repos.get({ owner, repo });
  const ref = metadata.default_branch;
  if (typeof ref !== 'string' || !ref) throw new Error('The default branch is missing.');
  const { data: file } = await github.rest.repos.getContent({ owner, repo, path: rosterPath, ref });
  if (Array.isArray(file) || file.type !== 'file' || file.encoding !== 'base64' || typeof file.content !== 'string') {
    throw new Error('The contributor approval list is not a readable file.');
  }
  const approved = parseApprovedContributors(Buffer.from(file.content, 'base64').toString('utf8'));
  if (approved.has(author.toLowerCase())) return { status: 'approved', author };

  // The repository's configured dependency automation and maintainers may open
  // policy/release PRs. Other bot identities need an explicit policy decision.
  if (pr.user.type === 'Bot' && author.toLowerCase() === 'dependabot[bot]') {
    return { status: 'automation', author };
  }
  try {
    const { data: permission } = await github.rest.repos.getCollaboratorPermissionLevel({ owner, repo, username: author });
    if (['admin', 'maintain', 'write'].some(role => role === permission.role_name || role === permission.permission)) {
      return { status: 'maintainer', author };
    }
  } catch (error) {
    if (error.status !== 404) throw error;
  }

  const comments = await github.paginate(github.rest.issues.listComments, {
    owner, repo, issue_number: pull_number, per_page: 100,
  });
  const alreadyExplained = comments.some(comment =>
    comment.user?.login === 'github-actions[bot]' && comment.body?.includes(commentMarker));
  if (!alreadyExplained) {
    const guide = `https://github.com/${repository}/blob/${encodeURIComponent(ref)}/CONTRIBUTING.md`;
    await github.rest.issues.createComment({
      owner, repo, issue_number: pull_number,
      body: `${commentMarker}\nFirst-time contributors need maintainer approval before opening a PR, including drafts.\n\nPlease open an issue or join an existing one and explain what you would like to change. Once a maintainer adds your account to the approved contributor list on the default branch, you can reopen this PR and submit future PRs without repeating contributor approval. Large features and API changes still need prior discussion.\n\nSee the [contribution guide](${guide}).`,
    });
  }
  await github.rest.pulls.update({ owner, repo, pull_number, state: 'closed' });
  return { status: 'closed', author };
}

module.exports = { parseApprovedContributors, checkContributorApproval };
