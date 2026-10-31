# Verification guide for maintainers

Use this guide to validate an approved contribution or prepare a release. The
[release process](release.md) covers package staging, publication and recovery;
the [maintenance guide](maintaining.md) covers contribution approval and triage.
Keep generated reports, traces and tarballs in ignored directories or outside the
repository. Do not commit local review records.

## Set up a clean checkout

Use the Node and pnpm versions declared in `package.json`. Build packages before
running examples or checks that consume their exported `dist` entries.

```bash
pnpm install --frozen-lockfile
pnpm build
pnpm check
pnpm test
pnpm api:check
pnpm compatibility:check
pnpm build:examples
pnpm security:audit
pnpm release:check -- --json
```

Repository documentation and Markdown link checks run in `pnpm test:release`,
which is included in `pnpm test`.

Choose checks appropriate to an approved change. Public API changes also require
reviewed declaration snapshots, migration guidance and a changelog entry; use
`pnpm api:update` only after reviewing the intended change. Release candidates
must pass the full release gate set in [Release Gates](release.md#release-gates).
Inspect failures before rerunning; a successful retry does not explain a failure.

To inspect full-stack server-export examples locally, run `pnpm dev:nextjs`,
`pnpm dev:nuxt` or `pnpm dev:sveltekit` after building the packages. Their manifests
record any additional runtime requirements; the [server data guide](server-data.md)
describes their query, route and export contracts.

## Browser checks

Install the configured browsers once, then run the relevant suite:

```bash
pnpm exec playwright install chromium firefox webkit
pnpm e2e:renderers
pnpm e2e:smoke
pnpm e2e:server-data
pnpm e2e:integration
pnpm e2e
```

`e2e:renderers` targets the three renderer examples. `e2e:smoke` covers reference
UI workflows and automated accessibility. `e2e:server-data` checks remote reads,
edits and recovery; `e2e:integration` runs cross-framework features in Chromium,
Firefox and WebKit. `e2e` includes the full framework/server-export suite. Each
command rebuilds public packages so examples cannot use stale library output.

CI runs smoke and server-data checks separately from integration checks. The
shared `browser-integration.yml` workflow runs each integration browser in two
shards, preserving the complete suite without enabling parallel tests within a
file. Both required gates require every browser shard to succeed. To reproduce
one shard locally:

```bash
pnpm e2e:integration --project firefox --shard 1/2
```

The full suite uses ports 4173–4187 and smoke uses 4193–4195. To avoid another
local workspace, apply the same validated offset to servers and test URLs:

```bash
ROWICK_E2E_PORT_OFFSET=100 pnpm e2e
ROWICK_E2E_PORT_OFFSET=100 pnpm e2e:renderers
ROWICK_E2E_PORT_OFFSET=100 pnpm e2e:smoke
```

The offset must be a non-negative integer that keeps configured ports below
65536. Manual preview/report URLs remain fixed at 4193–4195. Release CI leaves
the offset unset. Failed browser diagnostics are retained by the CI workflow.

## Independent XLSX verification

Install the hash-pinned reader into an isolated Python environment and select its
interpreter through `ROWICK_XLSX_READER_PYTHON`:

```bash
python3 -m venv /tmp/rowick-xlsx-reader
/tmp/rowick-xlsx-reader/bin/python -m pip install --require-hashes --only-binary=:all: -r packages/export-xlsx/test/requirements.txt
ROWICK_XLSX_READER_PYTHON=/tmp/rowick-xlsx-reader/bin/python pnpm test:xlsx:independent
```

Reader round-trips verify exported values and formats. Opening the generated
workbook in both Excel and Numbers remains a separate manual release check.

## Manual UI review

Generate evidence only after the final source commit. Reports are bound to the
source fingerprint, revision and exact smoke contract. Changed source requires a
fresh report; older reviews do not approve a new release candidate.

```bash
pnpm preview:smoke-ui -- --report --json --out-file .release/ui-smoke-report.json
pnpm preview:smoke-ui -- --open
# In another terminal, while inspecting the actual targets:
pnpm review:smoke-ui
pnpm review:smoke-ui -- --status
pnpm release:ui-smoke-report-check
```

Use `--framework React|Vue|Svelte` to inspect one renderer or resume its review.
`preview:smoke-ui -- --list`, `--markdown` and `--json` expose the target contract
without starting servers. `--wait-timeout-ms 45000` changes preview readiness
waiting; it does not approve a check. Markdown notes may be generated separately
with `preview:smoke-ui -- --report --out-file .release/ui-smoke-report.md`.

The current report requires 45 functional and 27 accessibility checks across the
three renderers, including all six optional feature routes. Record observed
results and evidence per item. A template, partial review or automated result is
not manual approval. `--allow-dirty` is limited to development of the review tools
and is not release approval.

The report must match clean source, current target URLs and check text, actual
200% browser zoom, 390 CSS px reflow, and a non-future review date no more than
seven days old. `--max-age-days` can make freshness stricter. The checker also
validates the complete workflow input size before dispatch.

Record real Korean/Japanese OS IME behavior, VoiceOver/NVDA, physical touch/pen,
clipboard exchange, platform high contrast and Excel/Numbers opening as specified
in [Prepublish Notes](release.md#prepublish-notes). Synthetic composition, pointer
or viewport emulation, axe and parser round-trips do not replace those checks.
Leave unperformed items pending.

## Release handoff

After validation, use [Release Plan](release.md#release-plan),
[External Consumer Smoke](release.md#external-consumer-smoke) and
[Trusted Publishing Plan](release.md#trusted-publishing-plan). Those procedures
cover dependency rewrites, tarball inspection, minimum/current peers, repository
metadata, GitHub push preflight, npm setup and the protected publish workflow.
Approval of a contribution is separate from manual release approval, repository
write access and authorization to publish.
