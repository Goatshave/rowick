# Getting started

> **First release in preparation**
>
> These pages describe the working source for Rowick `0.1.0`. The `@rowick/*`
> packages have not been published yet. Run the workspace examples locally until
> publication; installation commands below describe the intended public packages.

Rowick separates its framework-agnostic engine, framework adapters, styled UI renderers, virtualization primitives, and theme tokens. Most applications should start with the maintained UI package for their framework.

## Install

### React

```bash
npm install @rowick/react-ui @rowick/theme react react-dom
```

### Vue

```bash
npm install @rowick/vue-ui @rowick/theme vue
```

### Svelte

```bash
npm install @rowick/svelte-ui @rowick/theme svelte
```

## Choose a rendering layer

Use a unique stable `getRowId` for reorder, insertion, deletion, and remote data.
IDs are unique across the loaded tree; all group/leaf column IDs also share one
namespace. See [ID validation](api-stability.md#id-validation)
for repeated accessors, nested local IDs, validation errors, and the positional fallback.

- Use `@rowick/react-ui`, `@rowick/vue-ui`, or `@rowick/svelte-ui` for the maintained product-ready grid surface.
- Use `@rowick/react`, `@rowick/vue`, or `@rowick/svelte` with `@rowick/primitives` for a custom renderer.
- Use `@rowick/core` directly for framework-independent state and row-model workflows.

## Compatibility

Rowick is TypeScript-first and publishes ESM packages with bundled type
declarations. Modern JavaScript applications can use the same runtime APIs with
`import`, but CommonJS `require()`, UMD bundles, and a maintained vanilla-JavaScript
UI renderer are not part of the 0.1 support contract.

| Integration | Supported range | Release validation |
| --- | --- | --- |
| React | `>=18.2.0 <20` | React 18.3.1 and 19.2.8 |
| Vue | `>=3.4.0 <4` | Vue 3.4.38 and 3.5.41 |
| Svelte | `>=4.2.20 <6` | Svelte 4.2.20 and 5.56.8 |
| TypeScript | Type declarations included | TypeScript 5.7 and 5.9 workspace builds |
| JavaScript | Modern ESM | Same compiled runtime APIs without static typing |

`@rowick/core` and `@rowick/virtual` do not require React, Vue, or Svelte.
Use them directly from TypeScript or JavaScript when a product owns its rendering
layer. Framework adapters declare their host framework as a peer dependency, so the
application controls that framework version and Rowick does not bundle a second
copy.

## Add styles

The maintained UI packages require the shared theme and renderer styles.

### React styles

```ts
import "@rowick/theme/css";
import "@rowick/react-ui/css";
```

### Vue styles

```ts
import "@rowick/theme/css";
import "@rowick/vue-ui/css";
```

### Svelte styles

```ts
import "@rowick/theme/css";
import "@rowick/svelte-ui/css";
```

Continue with the [React](./react-ui.md), [Vue](./vue-ui.md), or [Svelte](./svelte-ui.md) guide for typed columns, controlled state, virtualization, editing, grouping, and server-owned workflows.
Use the [server data guide](./server-data.md) for exact server totals, derived page counts,
request cancellation, stale-response protection, and retry behavior shared across
framework integrations.
