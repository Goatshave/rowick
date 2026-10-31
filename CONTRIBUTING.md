# Contributing to Rowick

Bug reports, focused proposals and approved contributions are welcome. Read the
[code of conduct](CODE_OF_CONDUCT.md) before participating. Security reports use
[SECURITY.md](SECURITY.md), not a public issue.

## First-time contributor approval

**Before your first PR, including a draft, get maintainer approval and wait until
your GitHub username appears in the [approved contributor list](.github/VOUCHED.td)
on the default branch.**
Anyone can report bugs, ask questions or propose work without being approved.

1. Search existing issues. Open a relevant issue or join an existing one and
   describe what you want to change, why and how you would check it.
2. A maintainer reviews the proposal and explicitly approves you as a contributor.
3. The maintainer adds your account to the approved list through a normal reviewed
   PR. Approval becomes active when that list change is merged to the default branch.
4. You can then open or reopen your PR. Once listed, you do not need a new
   contributor approval for every subsequent PR.

An issue, label, assignment, reaction or approval comment alone does not activate
approval. Wait for the list update to merge. Do not add yourself to the list in
your first PR: the check reads the default branch's list, not your branch.

PRs from unapproved contributors, including drafts, are automatically closed with
an explanation after the approval workflow runs. After approval is active, reopen
the PR to run the check again. Approval grants no repository write, merge or
publish permission and does not guarantee that a proposed change will be accepted.
Maintainers can revoke contributor approval by removing an account from the list.

## Discuss larger changes first

Approved contributors can submit focused bug fixes, documentation improvements
and tests directly. New features, large refactors, dependency/support-policy
changes and breaking or significant public API changes still need discussion and
agreement on the approach before implementation. This is work-scope discussion,
not another account approval. Keep each PR focused and reference relevant issues.

Privately coordinated security fixes follow [SECURITY.md](SECURITY.md); do not
publish vulnerability details to request approval. Maintainers and configured
Dependabot maintenance follow the [maintenance process](docs/maintaining.md#contribution-approval).

## Local development

Use Node.js 22.12+ in the 22.x line or Node.js 24+, with pnpm 9.15.0:

```bash
pnpm install --frozen-lockfile
pnpm build
pnpm check
pnpm test
```

Run `pnpm dev:react`, `pnpm dev:vue` or `pnpm dev:svelte` to inspect a maintained
example. See the [verification guide](docs/verification.md) for browser tests,
compatibility checks and the full validation commands.

## Prepare a PR

Use `<type>/<short-kebab-case>` branch names, such as `feat/row-editing`,
`fix/row-identity-index` or `docs/filtering`. Supported types include `feat`, `fix`,
`docs`, `refactor`, `perf`, `test` and `chore`. Use the corresponding conventional
type in commit and PR titles.

- Link relevant issues and any prior design discussion in the PR template.
- Keep one focused change per PR. Avoid unrelated formatting and generated artifacts.
- Add regression coverage for changed behavior and run the relevant checks.
- Update user documentation and add an `Unreleased` changelog entry for user-visible
  changes. Intentional public API changes also update reviewed API contracts.
- Include representative reproduction details for large-data behavior.
- Keep credentials, private datasets and local validation reports out of the PR.

The contributor approval workflow checks your account; the maintainer reviews
the change and any required design discussion. Both `CI / Required Gate`
and `Release Verification / Release Gate` must pass when applicable. Passing checks
do not replace maintainer review.

## Dependencies

Discuss dependency changes in the issue before implementation. Run
`pnpm security:audit` after changes and follow the dated, path-scoped policy in
[Dependency security](docs/dependency-security.md). Compatibility fixtures pin the
supported framework lower bounds; do not upgrade them just to suppress a finding.
