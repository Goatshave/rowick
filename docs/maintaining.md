# Maintenance and support

Maintainers use the [verification guide](verification.md) for local checks and
manual UI evidence, and the [release process](release.md) for staging, publication
and recovery. Contributors follow [CONTRIBUTING.md](https://github.com/Goatshave/rowick/blob/main/CONTRIBUTING.md).

The supported framework families are React 18/19, Vue 3.4+ and Svelte 4.2.20/5.
Minimum-peer fixtures and staged external consumers retain the lower bounds;
maintained application examples use current runtimes. Repository tooling requires
Node 22.12+ in the 22.x line or Node 24+, with pnpm 9.15.0. Individual full-stack
example requirements are recorded in their manifests.

Svelte 4 remains supported for the initial Rowick release. Removing a framework family or
raising its documented lower bound is a compatibility change and requires the
version policy in [API stability](api-stability.md), migration guidance and a
release note. A private example dependency update does not silently alter public
peer support.

## Issue labels

Issue forms apply labels when an issue is created:

| Form | Automatic labels |
| --- | --- |
| Bug report | `bug`, `needs-triage` |
| Feature request | `enhancement`, `needs-triage` |
| Contribution proposal | `contribution`, `needs-triage` |

The catalog lives in `.github/labels.json`. The **Issue Labels / Sync labels**
workflow creates missing catalog labels and updates their colors/descriptions on
the default `main` branch. It runs after catalog/workflow changes are pushed to
`main`, or manually from Actions. It preserves labels outside the catalog and
does not remove existing labels from issues.

On a new repository, wait for that workflow to succeed before using the forms:
GitHub [only applies form labels that already exist](https://docs.github.com/en/communities/using-templates-to-encourage-useful-issues-and-pull-requests/syntax-for-issue-forms#top-level-syntax).
Forms opened through this process receive their defaults. **Issue Triage /
Classify issue content** separately reads issue titles and descriptions after
creation, editing and reopening, including issues created through the API. It
adds matching area labels using the rules in `scripts/issue-triage.cjs`:

| Labels | Example content |
| --- | --- |
| `area:react`, `area:vue`, `area:svelte` | Framework names and package references |
| `area:accessibility` | Accessibility, ARIA, VoiceOver, NVDA, 접근성 |
| `area:editing` | Editing, clipboard, undo, 셀 편집, 연속 저장 |
| `area:server-data` | Datasource, server-side, pagination, 서버 데이터 |
| `area:export` | Export, CSV, XLSX, 내보내기 |
| `area:docs` | Documentation, README, 문서 |

The rules add suggestions rather than making approval or priority decisions.
Form headings, policy checkboxes and HTML comments do not influence classification.
Existing type labels are preserved; a missing type is inferred only from an
explicit `[Bug]`, `[Feature]` or `[Contribution]` title prefix. An unclear issue
keeps `needs-triage` for human review. Opening or reopening adds `needs-triage`;
editing alone does not restore it after assessment. No labels are removed, so an
edit can add a new area while an old area remains for a maintainer to correct.

Add `triage:manual` to stop all automatic additions on an issue, including manual
workflow rechecks. Use it when correcting a false match. Recheck an existing open
issue through Actions using the `issue_number` input. The triage workflow needs
the catalog labels to exist and be active; missing/archived labels fail visibly
before any issue labels are changed. It does not create comments, close issues or
grant PR approval, repository access or permission to publish. Remove
`needs-triage` after assessment and keep the appropriate type/area labels.

## Contribution approval

Approve people once, then review their changes through normal PRs. Issues remain
open to everyone. Returning approved contributors can submit routine fixes,
documentation and tests directly; large features, refactors and significant API
or support changes still need prior discussion of scope and approach.

For a first-time contributor:

1. Discuss the intended contribution in a new or existing issue. Anyone can report
   a problem without volunteering to implement it.
2. Record explicit contributor approval in a maintainer comment, naming the GitHub
   account. For example: `Contributor approval granted to @username. I will add
   your account to the approved contributor list; wait for that change to merge.`
3. Add the username to `.github/VOUCHED.td` through a normal maintainer PR and link
   the approval discussion. Keep names unique and sorted; use one username per
   line without `@`. The file also accepts `github:username` and full-line comments.
4. Review and merge the list change after the required checks pass. Tell the
   contributor that approval is active and they can open or reopen their PR.

The list uses a [Vouch-compatible](https://github.com/mitchellh/vouch) GitHub username
format. The repository's Node-based gate implements this policy without installing
the upstream Nushell actions. Imported trust sources and denouncement records are
not supported; remove a username to revoke approval. No workflow updates or merges
the list automatically, and no repository write permission is granted by listing
someone. Only maintainers should approve list changes.

### Automatic PR handling

`Contributor Approval / Contributor approval` reads the current PR author and
`.github/VOUCHED.td` from the repository's default branch. It allows listed accounts,
existing write/maintain/admin collaborators and configured `dependabot[bot]`
maintenance PRs. Other unapproved authors, including other bots, receive an
explanation and their PR is closed. The same rule covers drafts. Reopening or
updating a PR rechecks approval; this is not a check of whether every PR has its
own new approval comment.

The privileged workflow executes only the default branch's policy code, never
checks out PR code and has no contents-write permission. API read errors or an invalid
list fail the check before posting a comment or closing the PR. Do not treat a
failed, skipped or blocked workflow as approval. Final code review, required CI
and release gates remain separate from contributor approval.

To revoke approval, remove the account in a reviewed list PR. After merging,
recheck any open PRs by running the Contributor Approval workflow from Actions with
its `pr_number` input, or close those PRs manually. A new PR, reopen or new commit
also triggers a recheck. Revocation does not automatically reprocess all existing
PRs. Existing write/maintain/admin collaborators remain trusted through their
repository role; revoke that role separately if that is also intended.

### New repository setup

Keep Issues and Pull requests enabled and PR creation set to **Everyone**
(`pull_request_creation_policy: all`). **Collaborators only** would prevent listed
external contributors without write access from submitting a PR before the gate
can run. See GitHub's [PR creation settings](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/enabling-features-for-your-repository/disabling-pull-requests).

Install the list, policy code and workflow on the default `main` branch together.
Keep normal branch protections and maintainers' review of list changes. Check the
repository/organization Actions event policy explicitly allows this metadata-only
`pull_request_target` workflow. GitHub's default policy is currently evaluated and
is scheduled for enforcement on affected public repositories on December 2, 2026;
see [GitHub's event policy guidance](https://docs.github.com/en/actions/reference/security/securely-using-pull_request_target#default-policy-for-pull_request_target).
Limit any exception to this trusted workflow rather than permitting untrusted PR
code to run with a write token.

Before opening contributions, verify the live workflow with approved and unapproved
PR authors. Repository settings and actual GitHub delivery cannot be validated by
local fixtures alone. CI approval for workflows from forks is also separate from
contributor approval; see [fork workflow settings](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/enabling-features-for-your-repository/managing-github-actions-settings-for-a-repository).

PR closure does not prevent independently triggered `pull_request` CI from
starting. Keep fork workflow approval enabled. For strict control of CI spending,
require approval for all outside collaborators; this also requires separate CI
approval for roster-approved external contributors. Do not enable write tokens
or repository secrets for fork workflows. The roster controls PR acceptance, not
GitHub's workflow execution approval.

After the first push, complete this activation checklist:

1. Wait for **Issue Labels / Sync labels** and the main CI to pass. Protect `main`
   with **Required Gate**, **Release Gate** on PRs and required maintainer review;
   disallow force pushes and deletion. Protect the `npm` environment so package
   publication runs only from `main`.
2. Enable private vulnerability reporting and Dependabot alerts/security updates.
   Confirm that the private reporting link in `SECURITY.md` works.
3. With a consenting external account absent from `.github/VOUCHED.td`, open a
   harmless fork PR. Check that one explanation is posted and the PR is closed,
   including when opened as a draft. Verify no PR-head code runs in the privileged
   approval workflow. An owner-authored PR cannot exercise this denial path.
4. Approve that account through an issue and merge the roster change. Reopen the
   same PR; confirm it stays open and the approval job succeeds. Push another
   harmless commit and check again. Remove the test account through review and
   manually recheck an open test PR to confirm revocation closes it.
5. Open one issue through each form and one without a form. Check label defaults
   and content triage, then edit and reopen a test issue. Keep workflow run links
   with the launch evidence and close the test issues/PRs after verification.
6. Confirm ownership of the npm scope and configure publishing for all twelve
   public packages. Complete the manual UI evidence and protected release gates
   in the [release process](release.md) before running an actual publication.

These steps require the new repository, its settings and the relevant accounts.
Passing local automation tests is not a substitute for this live verification.

Privately coordinated security work follows
[SECURITY.md](https://github.com/Goatshave/rowick/blob/main/SECURITY.md).

## Repository documentation

The initial repository contains README files and Markdown guides. It excludes
website source, site-generator dependencies and website deployment workflows.
Documentation links are checked by `pnpm test:release`, which also runs within
`pnpm test`. A public website can be added later as a separate reviewed change.

## Triage and fixes

Reproduce a report against the latest supported release and the development
branch. Record framework/browser versions, stable IDs, controlled-state ownership,
query/revision behavior and a minimal reproduction without private data. Classify
data loss, unauthorized disclosure, invalid writes and blocked keyboard access as
release blockers. Preserve failing cases as regression tests before fixing them.

Compatible regressions are fixed in a patch of the current supported line.
Maintain older lines only when a security notice or explicit release note names
them; no long-term-support period or response-time SLA is promised. When a
backport is needed, run the relevant line's package, browser and release gates.
Publish the affected/fixed versions and a practical workaround in its release
notes. Do not treat a successful retry as proof that a lost write was rolled back.

Public API changes update declarations, transitive contract snapshots, examples,
guides and the changelog together. Read-only source review and actual automatic
test results are distinguished from manual approval. A failing required gate
blocks release; support-policy changes require review and a release note.

## Security, conduct and dependency review

Vulnerabilities use the private reporting channel in
[SECURITY.md](https://github.com/Goatshave/rowick/blob/main/SECURITY.md).
Conduct concerns use the separate private contact in
[CODE_OF_CONDUCT.md](https://github.com/Goatshave/rowick/blob/main/CODE_OF_CONDUCT.md).
General questions and reproducible non-sensitive bugs use the issue templates.

Run the [dependency audit](dependency-security.md) after dependency changes and
before release. Review every dated path-specific exception before expiry. Lower
bound fixtures are build/type checks; they are not deployment templates. Never
convert accepted compatibility-tooling exceptions into production runtime usage.
New dependencies require license, security and reachable-bundle-cost review.
The XLSX writer adds no third-party runtime dependency; its independent Python
test reader is hash-pinned tooling and is excluded from npm packages.

## Publication and recovery

Use the protected [release process](release.md). Keep all package versions
aligned, stage into a fresh directory and inspect the exact tarballs. Verify the
source-bound review report, both required GitHub gates, npm permissions/trusted
publisher settings, provenance and post-publish package metadata. New package
names require their own publishing setup even when existing names already work.

If publication stops after some packages succeed, inspect registry versions and
integrities before continuing. Reuse the exact reviewed source and staged bytes;
do not rebuild different bytes under an already published version. Do not unpublish
or replace package history as a routine recovery. Correct a released regression
with a new version and update dist-tags only through the reviewed recovery plan.
The existing release status/preflight tools distinguish already published packages,
missing packages and setup failures; preserve their reports for the release record.

## Package verification and resource ownership

Before publication, install the staged tarballs in a clean consumer outside the
workspace. Verify the current and minimum supported peers, ESM imports, strict
types, source maps, framework client/SSR rendering and optional feature entries.
The [release process](release.md) and [verification guide](verification.md)
describe the consumer checks and source-bound UI review. Automatic fixtures do
not replace actual OS input, assistive technology or spreadsheet-app review.

Applications own the lifetime of imperative grid, editing, layout and datasource
controllers. Dispose them when their owner is removed, abort obsolete requests
and unsubscribe product listeners. Bound datasource caches and retained edit
history for the application's workload; virtualization bounds mounted cells,
not the entire loaded dataset. See [state and lifecycle](state-lifecycle.md),
[transactions](transactions.md#cost), [layout](layout.md) and
[server datasource](datasource.md) for the corresponding contracts.
