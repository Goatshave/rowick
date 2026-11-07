# Documentation website

The website uses the Markdown files in `../docs` as its source. VitePress
configuration, the theme, and interactive components live in `.vitepress`.
The example build copies brand assets from `../assets/brand` into the ignored
`website/.generated/public` directory.
Instrument Sans is self-hosted through the pinned `@fontsource-variable/instrument-sans`
package under the SIL Open Font License; the site does not request a remote font CDN.

The site builds the user guides directly under `../docs`. Its `srcExclude`
setting excludes `docs/maintainers/**` and the repository-only `docs/README.md`
from both pages and local search. Public maintenance, verification, release and
dependency-security procedures remain available through the GitHub repository's
[maintainer index](../docs/maintainers/README.md). User-facing release coverage and
limitations remain in `docs/0.1.1-validation.md`.

From the repository root:

```bash
pnpm install --frozen-lockfile
pnpm docs:dev
pnpm docs:build
pnpm docs:check
pnpm docs:preview
```

Open `http://127.0.0.1:4290/rowick/`. Both preview commands bind to loopback.
The `/rowick/` base matches the GitHub Pages project path at
<https://goatshave.github.io/rowick/>.

## Deployment

`.github/workflows/docs-pages.yml` builds and deploys after a successful push CI
run on `main`. It verifies the current main commit, checks out that exact SHA,
and checks it again immediately before publishing. Outdated commits are skipped.
Manual dispatch from `main` also requires a successful push CI for that SHA.
Pull request runs never publish the site.

Enable GitHub Pages with **GitHub Actions** as the source, and restrict the
`github-pages` environment to the `main` branch. The build job has read-only
repository access. Only the deploy job receives Pages write and OIDC permissions;
no deployment token is stored as a secret.

`pnpm docs:check` validates the generated pages and local assets under `/rowick/`
and rejects maintainer routes or maintainer titles in the local search index.
Both general CI and the deployment workflow run it before publication.

The React, Vue and Svelte previews deliberately install the public `0.1.1`
runtime packages from npm. Their CSS comes from the repository's current shared
theme and grid styles, so the website can preview the next stylesheet changes.
The private website version and all five runtime dependency pins track the
currently published release documented in README, independently of a pending
workspace release candidate. Update them only after npm publication succeeds.
Public runtime APIs remain aligned with that release.
The examples' data and edits stay in memory; reset restores rows and grid state.

## Feature previews and source viewer

`pnpm docs:dev` and `pnpm docs:build` first run
`scripts/build-doc-examples.mjs`. It assembles all seven examples for each
framework from `.vitepress/theme/examples/`, formats their sources with two-space
indentation, and builds 21 native framework apps. The source viewer reads the
same formatted files through the generated, deduplicated catalog. Generated
sources, catalog and built previews stay under the ignored `.generated` folder.

Behavior lives in `example-model.ts`, with shared inline-edit keyboard handling
in `inline-editor.ts`. Framework templates own mounting and rendering; shared
styles keep controls, editors and light/dark themes consistent. The development
watcher rebuilds previews and reloads the page when those inputs change.

Run `pnpm test:docs` for the shared behavior and editing regressions. Before
publishing, exercise each feature in all three frameworks and both themes,
including actual CSV downloads and edit validation/keyboard navigation.

VitePress is pinned to `2.0.0-alpha.21` for its current Vite 8 toolchain. Its
`1.6.4` stable line depends on Vite 5, whose accepted minimum-version exceptions
in this repository are restricted to compatibility fixtures. Do not copy those
exceptions to the website. Reassess the prerelease pin when a stable release uses
the current toolchain. Run `pnpm security:audit` after dependency updates.

Before public deployment, run a production build, check internal links and
search, exercise the live grid, and review light/dark and mobile layouts.
