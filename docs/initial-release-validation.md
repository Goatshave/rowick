# Initial 0.1.0 validation scope

The release owner approved a limited validation scope for the first public
`0.1.0` release. This exception applies only to `0.1.0` with npm tag `latest`.
It does not approve later releases or claim that unperformed manual tests passed.

## Automated requirements

All existing unit, type, public API, security-policy, package-boundary,
external-consumer, independent XLSX, example and browser gates remain required.
Windows Server 2025 Chromium smoke tests cover React, Vue and Svelte UI,
keyboard/reflow/automated accessibility, remote editing and recovery. Windows
smoke is required by the main CI gate and reruns before the publish job.
Linux Chromium, Firefox and WebKit checks also remain required.

These automated Windows checks do not establish Windows 11 desktop, NVDA,
actual Korean/Japanese IME, physical touch or pen compatibility.

## Manual coverage and deferred work

The source-bound release report retains all 45 functional and 27 accessibility
check descriptions. A complete check may be marked `pass` only with observed
evidence for that check. Unperformed or partially performed composite checks
are marked **`not-tested`**, with reasons; observations of smaller flows are
recorded separately. A target with untested checks must not be marked `pass`.

No complete manual cross-framework/platform matrix is claimed for this release.
Deferred manual coverage includes:

- Windows NVDA, Korean/Japanese OS IMEs and desktop high contrast.
- Full macOS Safari/VoiceOver and Korean/Japanese IME coverage on all optional
  routes for the final source. Earlier informal VoiceOver checks do not approve
  this complete matrix.
- Physical touch and pen hardware.
- Actual 200% browser zoom and 390 CSS px manual inspection on every route.
- Full Excel/Numbers rich clipboard exchange, workbook formats and summaries.
- Remaining filtering, server recovery, layout, analytics and locale subcases
  that have automated coverage but have not completed the full manual checklist.

Observed local checks include React consecutive delayed saves preserving the
newest draft and exact decimal value, and opening an exported workbook in
Microsoft Excel 16.114 without a repair warning. Excel showed the exact large
decimal text, leading-zero owner ID, date and numeric value. These observations
do not complete the full export or clipboard matrix. Numbers review remains
not tested. The release report records observations and their reviewed source.

## Exception controls

The protected publish workflow requires an explicit `initial_release_exceptions`
input. The report must identify the release owner (`fabric0de`), approval date,
reason, this public policy and its SHA-256 hash. Normal clean-source identity,
freshness, target/check contract and workflow input-size checks still apply.
Missing checks, blank reasons, stale source, incomplete templates and a false
aggregate pass are rejected. The final automated gates must pass on the released
source, including the Windows run.

The standard full manual approval policy remains the default. For versions after
`0.1.0`, this exception is rejected even when explicitly requested. Establish
actual platform/assistive-technology and device coverage before claiming it.
