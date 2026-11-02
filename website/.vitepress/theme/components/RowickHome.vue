<script setup lang="ts">
import { withBase } from "vitepress";
import RowickDemo from "./RowickDemo.vue";
import QuickStart from "./QuickStart.vue";

const features = [
  { tag: "EDIT", title: "Edits that fit your workflow.", text: "Cell and row editing, validation, and product-owned save flows.", href: "/row-editing", icon: "M4 20h4L20 8l-4-4L4 16v4Zm10-14 4 4" },
  { tag: "CONNECT", title: "Keep your server in control.", text: "Remote data, exact totals, cancellation, retry, and recovery.", href: "/server-data", icon: "M4 5h16v6H4zM4 15h16v5H4zM7 8h.01M7 17.5h.01" },
  { tag: "ORGANIZE", title: "Find the view that matters.", text: "Typed filters, grouped data, saved views, and preferences.", href: "/filtering", icon: "M4 6h16M7 12h10M10 18h4M8 4v4M16 10v4M12 16v4" },
  { tag: "ARRANGE", title: "Make every column count.", text: "Pinning, ranges, clipboard, and advanced grid layouts.", href: "/layout", icon: "M4 4h16v16H4zM4 10h16M10 4v16" },
  { tag: "EXPORT", title: "Take the data with you.", text: "Pivot tables, typed XLSX files, and configurable exports.", href: "/analytics-export", icon: "M12 3v12m-4-4 4 4 4-4M5 15v5h14v-5" },
  { tag: "COMPOSE", title: "Build something of your own.", text: "A headless engine and rendering hooks for your interface.", href: "/custom-rendering", icon: "m8 6-6 6 6 6m8-12 6 6-6 6M14 3l-4 18" },
];
</script>

<template>
  <main class="rowick-home">
    <section class="home-hero" aria-labelledby="home-title">
      <div class="hero-grid" aria-hidden="true"></div>
      <a class="release-note" href="https://github.com/Goatshave/rowick/releases/tag/rowick-v0.1.0">
        <span class="release-version">0.1.0</span> A new home for your data <span aria-hidden="true">↗</span>
      </a>
      <h1 id="home-title">Make your data<br /><span>feel at home.</span></h1>
      <p class="hero-description">A typed data grid for React, Vue, and Svelte.<br class="desktop-break" /> One shared engine. The freedom to make it yours.</p>
      <div class="hero-actions">
        <a class="home-button primary" :href="withBase('/getting-started')">Start building <span aria-hidden="true">↗</span></a>
        <a class="home-button text-button" href="#try-the-grid"><svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="m7 4 7 6-7 6V4Z" stroke="currentColor" stroke-width="1.4" /></svg>Try the grid</a>
      </div>
      <div class="framework-strip" aria-label="Supported frameworks">
        <span>YOUR FRAMEWORK, YOUR WAY</span>
        <a :href="withBase('/react-ui')">React</a><span class="framework-divider" aria-hidden="true">/</span>
        <a :href="withBase('/vue-ui')">Vue</a><span class="framework-divider" aria-hidden="true">/</span>
        <a :href="withBase('/svelte-ui')">Svelte</a>
      </div>
    </section>

    <section id="try-the-grid" class="home-demo-section" aria-labelledby="demo-title">
      <div class="demo-section-caption"><h2 id="demo-title">A real grid. Ready to explore.</h2><a :href="withBase('/examples')">Open the example <span aria-hidden="true">↗</span></a></div>
      <div class="demo-stage">
        <ClientOnly>
          <RowickDemo />
          <template #fallback><div class="demo-placeholder" aria-busy="true">Preparing your workspace…</div></template>
        </ClientOnly>
      </div>
      <div class="demo-hints"><span><kbd>↕</kbd> Click a header to sort</span><span><kbd>⌕</kbd> Search across your rows</span><span><kbd>↵</kbd> Double-click a name to edit</span></div>
    </section>

    <section class="home-quickstart" aria-labelledby="quickstart-title">
      <div class="quickstart-copy">
        <p class="eyebrow">A FAMILIAR STARTING POINT</p>
        <h2 id="quickstart-title">Your first grid.<br />Your next idea.</h2>
        <p>Bring the data. Define your columns. Let Rowick take care of the grid, while you focus on what your application does.</p>
        <ul class="quickstart-benefits"><li>Typed columns and bundled declarations</li><li>Framework-native components</li><li>A styled UI, or your own renderer</li></ul>
        <a class="inline-link" :href="withBase('/getting-started')">Follow the quick start <span aria-hidden="true">↗</span></a>
        <div class="package-note"><span class="package-mark" aria-hidden="true">MIT</span><span>Open source. ESM packages.<br />Use the pieces your application needs.</span></div>
      </div>
      <QuickStart />
    </section>

    <section class="home-features" aria-labelledby="features-title">
      <div class="feature-section-heading"><div><p class="eyebrow">THERE'S MORE ROOM TO BUILD</p><h2 id="features-title">For the work around your data.</h2></div><a class="inline-link" :href="withBase('/packages')">Explore the packages <span aria-hidden="true">↗</span></a></div>
      <div class="feature-index"><a v-for="feature in features" :key="feature.tag" :href="withBase(feature.href)" class="feature-item"><div class="feature-icon-row"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path :d="feature.icon" /></svg><span>{{ feature.tag }}</span><span class="feature-arrow" aria-hidden="true">↗</span></div><h3>{{ feature.title }}</h3><p>{{ feature.text }}</p></a></div>
    </section>

    <section class="home-closing" aria-labelledby="closing-title">
      <img :src="withBase('/symbol.svg')" width="88" height="88" alt="" />
      <p class="eyebrow">BUILT TO FIT. OPEN TO POSSIBILITY.</p>
      <h2 id="closing-title">Make room for your next idea.</h2>
      <p>Start with the grid. Build the interface you have in mind.</p>
      <div class="hero-actions"><a class="home-button primary" :href="withBase('/getting-started')">Read the docs <span aria-hidden="true">↗</span></a><a class="home-button text-button" href="https://github.com/Goatshave/rowick">View on GitHub <span aria-hidden="true">↗</span></a></div>
      <a class="validation-link" :href="withBase('/initial-release-validation')">0.1.0 support and validation scope <span aria-hidden="true">↗</span></a>
    </section>
  </main>
</template>
