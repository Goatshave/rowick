# Changelog

Notable Rowick changes are recorded here before tagging or publication.

## Unreleased

## 0.1.1 - 2026-11-07

- Refresh selector subscriptions after external Vue/Svelte option changes without repeated notifications for equivalent render options.
- Refine shared grid colors, headers, cell interactions, focus states, native checkboxes and pinned-column separators in all styled framework packages.
- Add consistent interactive React, Vue and Svelte documentation examples with formatted source files, native live previews and a file explorer.
- Record the owner-approved 0.1.1 manual validation limits explicitly; automated gates remain required.
- Publish the official documentation website with user guides and framework examples while excluding maintainer procedures from public pages and search.

## 0.1.0 - 2026-11-01

First public release.

- Provide twelve aligned `@rowick/*` packages: a framework-independent grid engine,
  virtualization, primitives, themes, React/Vue/Svelte adapters and UI renderers,
  optional data controllers and an XLSX exporter.
- Include typed filters and saved views, row transactions and batch editing,
  server data, layout and selection ranges, pivot/export and locale codecs.
- Supply guides, framework examples, declaration contracts, package-consumption
  checks, browser tests and independent XLSX verification.
- Define contribution approval, issue classification, private security reporting
  and protected release procedures.

- Require Windows Chromium UI and remote-editing smoke tests in CI and before
  publication. Document the owner-approved first-release manual validation scope,
  preserving untested checks explicitly without approving later releases.
- Copy package CSS and Svelte assets with Node filesystem APIs so repeated
  builds do not depend on Unix shell commands on Windows.
- Use cross-platform workspace-filter quoting and fail empty package selections
  instead of silently skipping build or check commands on Windows.

- Verify minimum-version compatibility fixtures against reviewed manifest,
  lockfile and installed dependency versions before compatibility and release checks.
- Update maintained example tooling to Svelte 5.57.3 and Vite 8.3.5 while
  retaining the reviewed React 18, Vue 3.4 and Svelte 4 compatibility fixtures.
- Release outgoing React locale forms after the replacement commits, preventing
  a late subscription to an already disposed form during a fast locale change.

- Preserve protected column positions when restoring partial or equivalent saved
  orders, and enforce export header budgets when the data set is empty.
- Supply Rowick favicons for the maintained framework examples.
- Keep the React analytics example's loading and initialized layout consistent
  to prevent intermittent heading overflow in WebKit on narrow screens.
- Ship repository Markdown guides and GitHub documentation links. Website source,
  generator dependencies and deployment configuration are excluded from the initial repository.
