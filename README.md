# Rowick

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="assets/brand/logo-dark.svg" />
  <img src="assets/brand/logo.svg" alt="Rowick — a selected apricot cell above three charcoal cells" width="438" height="128" />
</picture>

[![CI](https://github.com/Goatshave/rowick/actions/workflows/ci.yml/badge.svg)](https://github.com/Goatshave/rowick/actions/workflows/ci.yml)
[![Docs](https://img.shields.io/badge/docs-source-087f5b)](docs/README.md)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Typed data grids for React, Vue, and Svelte. Use the styled UI for your framework,
or build a custom renderer with the shared headless engine.

> Check [GitHub Releases](https://github.com/Goatshave/rowick/releases) for release
> availability. The install commands below apply to published `@rowick/*` packages.
>
> Review the [initial 0.1.0 validation scope](docs/initial-release-validation.md),
> including the explicitly deferred manual platform and assistive-technology checks.
> Try the local examples to explore the current source.

## Install

```bash
# React 18.2 or 19
npm install @rowick/react-ui @rowick/theme react react-dom

# Vue 3.4 or later Vue 3
npm install @rowick/vue-ui @rowick/theme vue

# Svelte 4.2.20 or 5
npm install @rowick/svelte-ui @rowick/theme svelte
```

Packages use ESM and include TypeScript declarations. Keep all `@rowick/*`
packages on the same version. See [compatibility](docs/getting-started.md#compatibility)
for supported versions and [package selection](docs/packages.md) for headless adapters.

## Quick start

A minimal React grid:

```tsx
import "@rowick/theme/css";
import "@rowick/react-ui/css";
import { createColumnHelper, DataGrid } from "@rowick/react-ui";

type Person = { id: string; name: string; age: number };
const column = createColumnHelper<Person>();
const columns = [
  column.accessor("name", { header: "Name" }),
  column.accessor("age", { header: "Age" }),
];
const people: Person[] = [
  { id: "p1", name: "Mira", age: 28 },
  { id: "p2", name: "Jun", age: 34 },
];

export function PeopleGrid() {
  return <DataGrid data={people} columns={columns} getRowId={(person) => person.id} />;
}
```

Continue with the [React](docs/react-ui.md), [Vue](docs/vue-ui.md), or
[Svelte](docs/svelte-ui.md) guide for editing, state, virtualization, and customization.

## Features

- Typed columns, sorting, filters, grouping, tree data, pagination, and selection.
- Cell and row editing, validation, clipboard operations, and undo/redo.
- Row and column virtualization, pinning, resizing, reordering, and advanced layouts.
- Server data with cancellation, retry, bounded caching, and SSR hydration.
- Optional advanced filters, saved views, pivot tables, and CSV/TSV/XLSX export.
- Keyboard navigation, localization, theme tokens, and framework-native rendering hooks.

Features have explicit ownership and limits. See [feature boundaries](docs/feature-boundaries.md)
and [the documentation](docs/README.md). The public documentation website will be
published separately; all guides are available in this repository.

## Try the examples

Use Node.js 22.12+ in the 22.x line or Node.js 24+, with pnpm 9.15.0:

```bash
pnpm install --frozen-lockfile
pnpm build
pnpm dev:react
```

Open the URL printed by Vite. Use `pnpm dev:vue` or `pnpm dev:svelte` for the other
renderers. Each basic example includes editing, filtering, server data, layout,
analytics, and locale feature pages.

## Documentation

- [Getting started](docs/getting-started.md) and [packages](docs/packages.md)
- [Custom rendering](docs/custom-rendering.md) and [themes](packages/theme/README.md)
- [Server data](docs/server-data.md) and [datasource](docs/datasource.md)
- [State and lifecycle](docs/state-lifecycle.md) and [persisted preferences](docs/preferences.md)
- [API stability](docs/api-stability.md) and [changelog](CHANGELOG.md)

## Contributing

Bug reports and focused proposals are welcome. **First-time contributors need
maintainer approval before opening a PR.** Once approved, routine PRs need no
repeat permission; large features and API changes need prior discussion.
See [CONTRIBUTING.md](CONTRIBUTING.md).

Report vulnerabilities privately through [SECURITY.md](SECURITY.md). Participation
follows the [code of conduct](CODE_OF_CONDUCT.md). Maintainers can find validation
and release procedures in the [maintenance guide](docs/maintaining.md).

## License

[MIT](LICENSE).
