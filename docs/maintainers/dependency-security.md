# Dependency security

Run `pnpm security:audit` after dependency changes and before release. CI and the
protected publication workflow run the same check. A registry error, malformed
response, expired exception or unreviewed advisory at any severity fails the
check. Use `pnpm audit --json` for the complete raw report.

## Exception policy

`security/audit-exceptions.json` is the authoritative exception list. Each entry
names one advisory, package, exact installed version, exact dependency path or
path prefix, reason and expiry date. The same advisory outside its reviewed path
still fails. Review every exception before its expiry; do not add repository-wide
ignores, extend an expiry without reassessment or disable the check to pass CI.

A passing policy audit means there are no unreviewed dependency paths. It does
not mean that the raw audit is empty or every accepted dependency is fixed.

### Compatibility fixtures

`compatibility/svelte-4` retains the supported Svelte 4.2.20 / Vite 5 lower bound
for build checks. Its Vite configuration rejects development, middleware and
preview server commands. `compatibility/vue-3.4` checks the Vue 3.4 lower bound
through typechecking. Neither fixture is a deployment template or an SSR server.

Their exceptions are limited to those fixture paths and exact package versions.
Maintained examples use current runtimes. Changing a fixture to a newer framework
family would stop verifying its documented lower bound and requires a support
policy decision. Do not reuse accepted fixture dependencies in production apps.

## Version-scoped fixes

The root manifest and lockfile contain the exact overrides and patches. Keep
those resolutions scoped to the affected version ranges. Rebuild examples
and compatibility fixtures when changing build-tool overrides.

The `seroval@>=1.6.0 <1.6.11` override prevents older transitive resolutions;
the current Nuxt Vite builder uses `1.7.5`. Fixed versions include protections for
[typed-array constructor injection](https://github.com/advisories/GHSA-f86p-h4j2-7qgj)
and [RegExp script delimiters](https://github.com/advisories/GHSA-9wx9-5pv9-3349).
Installed-package regressions verify delimiter escaping, constructor spoofing and
normal RegExp/typed-array round trips. Seroval has no audit exception.

The `serialize-javascript@>=7.0.0 <7.1.3` override pins `7.1.3` for
[serialized function-body escaping](https://github.com/advisories/GHSA-m5mm-p8h7-m29v).

### Nuxt and filesystem tooling

The Nuxt example uses `4.6.3`, including fixes for development-server secret
disclosure, file access and
[dot-segment route bypass](https://github.com/nuxt/nuxt/security/advisories/GHSA-9v7c-q64q-vv33).
Its Node engine requirement is recorded separately in the example manifest.
`node-forge@<1.4.1` resolves to `1.4.1`; the previous local-certificate tooling
exception has been removed.

Two exact consumers, `@vercel/nft@1.11.0` and `archiver-utils@5.0.2`, resolve
`glob@14.0.2` for
[cancellation of filesystem traversal](https://github.com/isaacs/node-glob/releases/tag/v14.0.2).
`readdir-glob@1.1.3` resolves `minimatch@11.0.1` for
[bounded pattern preprocessing](https://github.com/isaacs/minimatch/releases/tag/v11.0.1).
These cross-major overrides are limited to the reviewed consumers. Installed
regressions cover their async/sync glob APIs, archive-reader filters, hidden files,
directory exclusions, in-flight cancellation and bounded pattern expansion.
Nuxt's production build additionally exercises its actual tracing and packaging.
Reassess these overrides when the parent tools adopt fixed versions themselves.

### Local deepmerge patch

`pnpm.patchedDependencies` applies `patches/deepmerge@4.3.1.patch` to the source
and CJS/UMD distributions for
[prototype poisoning of returned objects](https://github.com/advisories/GHSA-gcqx-w48m-w2h4).
The patch uses safe own-property writes for `__proto__`, preserves ordinary merge
behavior and keeps the returned object's prototype intact.

- pnpm lock patch hash: `djkursnltbasccsuuew3zwz2ya`.
- Patch SHA-256: `392bcd9626959e35d9c972eb84d95fbb9348e4d310eee19bf0b4b70f2d22de25`.
- Installed-package tests follow the reviewed Svelte/Nuxt dependency chains and
  exercise both CJS and UMD, nested merges, arrays, symbols, cloning and custom merge.

The installed upstream version is still `4.3.1`, so the audit policy records nine
exact-path exceptions for this local fix. They do not accept another workspace,
intermediate dependency, parent/package version or advisory. Remove the patch and
its exceptions together only after installing a verified upstream fix and passing
the same regressions.

## Verification and reporting

```bash
pnpm install --frozen-lockfile
node --test scripts/test/dependency-audit*.test.mjs scripts/test/dependency-glob-installed.test.mjs
pnpm security:audit
```

Complete the relevant [verification gates](verification.md) after dependency
changes. Report vulnerabilities through the private channel in
[SECURITY.md](https://github.com/Goatshave/rowick/blob/main/SECURITY.md).
Weekly dependency update groups are configured in `.github/dependabot.yml`.
Enable alerts and security updates when completing the
[repository setup](maintaining.md#new-repository-setup). Compatibility fixture
pins are excluded from automatic version updates and require explicit review.
The shared root lockfile can still be rewritten by security updates despite the
manifest exclusions. Run `pnpm compatibility:versions` after every lockfile change;
CI rejects resolutions that silently replace a reviewed minimum-version fixture.
Update maintained examples with workspace filters rather than applying a recursive
security upgrade to pinned compatibility fixtures.

### Pinned fixtures and security update failures

An automatic transitive update can fail with `NoChangeError` when its parent is
intentionally pinned, such as `@vue/server-renderer` under the typecheck-only
Vue 3.4 fixture. Do not raise the fixture's framework version to clear that job.
First run the policy audit and confirm that every finding for the alert's package
and advisory matches an unexpired exact-version fixture exception. A shared root
lockfile path alone is not enough evidence to dismiss an alert.

If the vulnerable code is unused in the reviewed fixture, a maintainer may dismiss
that individual GitHub alert as `not_used`, recording the advisory, exact version,
fixture path, usage restriction and exception expiry in its dismissal comment.
This triages the fixture alert; it does not install an upstream security fix or
turn a failed updater run into a successful one. The dated policy audit remains
mandatory, so a new dependency path or expiry still blocks CI. Reopen and reassess
the alert if usage changes or the exception expires. Do not add package-wide
ignores or dismiss unrelated findings in the shared lockfile.
