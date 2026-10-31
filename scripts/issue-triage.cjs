const { readFileSync } = require('node:fs');

const areaRules = [
  ['area:react', /\breact\b|\bjsx\b|\btsx\b/i],
  ['area:vue', /\bvue(?:js)?\b/i],
  ['area:svelte', /\bsvelte(?:kit)?\b/i],
  ['area:accessibility', /\ba11y\b|\baccessibility\b|\b(?:screen reader|voiceover|nvda|aria)\b|접근성|스크린\s*리더|보이스\s*오버/i],
  ['area:editing', /\b(?:editing|editable|editor|clipboard|paste|undo|redo)\b|셀\s*편집|연속\s*저장|붙여넣기|실행\s*취소/i],
  ['area:server-data', /\b(?:datasource|server[- ]side|server data|pagination|cursor)\b|서버\s*(?:데이터|사이드)|페이지네이션/i],
  ['area:export', /\b(?:export|xlsx|csv|spreadsheet)\b|내보내기|엑셀/i],
  ['area:docs', /\b(?:docs|documentation|readme|contributing|tutorial)\b|문서|가이드/i],
];
const typeRules = [
  ['bug', /^(?:\[bug\]|bug\s*:)/i],
  ['enhancement', /^(?:\[feature\]|feature(?: request)?\s*:)/i],
  ['contribution', /^(?:\[contribution\]|contribution\s*:)/i],
];

function suggestIssueLabels({ title, body = '', labels = [], action }) {
  if (typeof title !== 'string' || typeof body !== 'string' || !Array.isArray(labels) ||
      labels.some(label => typeof label !== 'string')) throw new Error('Invalid issue content or labels.');
  const existing = new Set(labels.map(label => label.toLowerCase()));
  if (existing.has('triage:manual')) return [];
  // Discard form headings, policy checkboxes, comments and empty answers. These
  // are template text rather than the reporter's description of the problem.
  const description = body.replace(/<!--[\s\S]*?-->/g, '').split(/\r?\n/)
    .filter(line => !/^\s*(?:#{1,6}\s|[-*]\s+\[[ xX]\]|_No response_\s*$)/.test(line)).join('\n');
  const content = `${title}\n${description}`;
  const proposed = areaRules.filter(([, pattern]) => pattern.test(content)).map(([label]) => label);
  if (!['bug', 'enhancement', 'contribution'].some(type => existing.has(type))) {
    const type = typeRules.find(([, pattern]) => pattern.test(title.trim()));
    if (type) proposed.push(type[0]);
  }
  if (['opened', 'reopened', 'manual'].includes(action)) proposed.push('needs-triage');
  return proposed.filter(label => !existing.has(label));
}

async function triageIssue({ github, context }) {
  const manual = context.eventName === 'workflow_dispatch';
  if (!manual && (context.eventName !== 'issues' || !['opened', 'edited', 'reopened'].includes(context.payload.action))) {
    throw new Error('Unsupported issue triage event.');
  }
  const value = manual ? context.payload.inputs?.issue_number : context.payload.issue?.number;
  if (!/^[1-9]\d*$/.test(String(value)) || !Number.isSafeInteger(Number(value))) throw new Error('A positive safe issue number is required.');
  const { owner, repo } = context.repo;
  const issue_number = Number(value);
  const { data: issue } = await github.rest.issues.get({ owner, repo, issue_number });
  if (issue.pull_request || issue.state !== 'open') return { status: 'ignored', labels: [] };
  const labels = suggestIssueLabels({ title: issue.title, body: issue.body ?? '',
    labels: issue.labels.map(label => typeof label === 'string' ? label : label.name),
    action: manual ? 'manual' : context.payload.action });
  if (!labels.length) return { status: 'unchanged', labels };
  const catalog = JSON.parse(readFileSync('.github/labels.json', 'utf8'));
  for (const name of labels) {
    if (!catalog.some(label => label.name === name)) throw new Error(`Unmanaged triage label: ${name}`);
    // Fail before any mutation if setup is incomplete; only the label-sync
    // workflow creates/updates definitions. Permission and network errors surface.
    const { data: label } = await github.rest.issues.getLabel({ owner, repo, name });
    if (label.archived_at) throw new Error(`Restore the archived triage label: ${name}`);
  }
  await github.rest.issues.addLabels({ owner, repo, issue_number, labels });
  return { status: 'labeled', labels };
}

module.exports = { suggestIssueLabels, triageIssue };
