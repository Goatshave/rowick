# @rowick/virtual

Framework-agnostic virtualization primitives for Rowick.

Use this package for row and column virtualization calculations shared by React, Vue, Svelte, and custom renderers.

## Install

```bash
npm install @rowick/virtual
```

## Usage

```ts
import { getVirtualRange } from "@rowick/virtual";

const range = getVirtualRange({
  count: 10_000,
  viewportSize: 480,
  scrollOffset: 2_400,
  estimateSize: 40,
  overscan: 4,
});
```

It also includes shared initial scroll frames, row virtual range helpers, sized column layout helpers, measured column layout cache helpers, measured layout signature/cache sync helpers, render item helpers, render item key helpers, focused-cell render-window checks, and spacer item type guards for virtualized rows, center-column windows, spacers, and grouped header clipping so framework renderers can keep header/body alignment consistent.

Most applications should use virtualization through a framework UI package. Use this package directly when building a custom renderer.
