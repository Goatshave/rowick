import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createSSRApp, h } from "vue";
import { renderToString } from "vue/server-renderer";
import { FilterPanel as ReactFilter } from "@rowick/react-ui/filtering";
import { LayoutGrid as ReactLayout } from "@rowick/react-ui/layout";
import { ServerDataPanel as ReactRemote } from "@rowick/react-ui/server-data";
import { AnalyticsPanel as ReactAnalytics } from "@rowick/react-ui/analytics";
import { FilterPanel as VueFilter } from "@rowick/vue-ui/filtering";
import { createLayoutGrid } from "@rowick/vue-ui/layout";
import { createServerDataPanel } from "@rowick/vue-ui/server-data";
import { createAnalyticsPanel } from "@rowick/vue-ui/analytics";
import { createLocaleNumberCodec, createLocaleDateCodec } from "@rowick/data/locale";
import { createAnalyticsExportJob } from "@rowick/data/analytics";
import { createXlsxExporter } from "@rowick/export-xlsx";
import { createFeatureModel } from "./feature-model.mjs";
import { createDataSourceController } from "@rowick/data/server-data";
const model = createFeatureModel();
const warnings = [], originalConsoleError = console.error;
console.error = (...values) => { warnings.push(values.map(String).join(" ")); originalConsoleError(...values); };
try {
  await model.remote.load({ mode: "page", pageIndex: 0, limit: 10 });
  const initialData = JSON.parse(JSON.stringify(model.remote.dehydrate()));
  const { default: SvelteSSR } = await import("../ssr-dist/SSR.js");
  const renderSvelte = process.argv[2] === "minimum" ? () => SvelteSSR.render({ initialData }).html : async () => {
    const { render } = await import("svelte/server"); const result = render(SvelteSSR, { props: { initialData } }); return result.body ?? result.html;
  };
  const svelteFirst = await renderSvelte(), svelteSecond = await renderSvelte();
  assert.ok(svelteFirst.includes("Installed optional")); assert.ok(svelteFirst.includes("Server data"));
  assert.equal(svelteSecond, svelteFirst, "Independent Svelte SSR requests must preserve the initial markup");
  const hydrated = createDataSourceController({ query: { status: "all" }, getRowId: (row) => row.id, initialData,
    source: { getRows: () => { throw new Error("SSR hydration must not fetch"); } } });
  try {
    assert.deepEqual(hydrated.getState().rows, model.rows); assert.equal(hydrated.getState().status, "ready");
    assert.notEqual(hydrated.getState().queryId, model.remote.getState().queryId);
    const before = renderToStaticMarkup(createElement(ReactRemote, { controller: model.remote, columns: model.columns }));
    const after = renderToStaticMarkup(createElement(ReactRemote, { controller: hydrated, columns: model.columns }));
    assert.equal(after, before, "Hydration must preserve the first React SSR markup");
    const Panel = createServerDataPanel();
    const vueBefore = await renderToString(createSSRApp({ render: () => h(Panel, { controller: model.remote, columns: model.columns }) }));
    const vueAfter = await renderToString(createSSRApp({ render: () => h(Panel, { controller: hydrated, columns: model.columns }) }));
    assert.equal(vueAfter, vueBefore, "Hydration must preserve the first Vue SSR markup");
  } finally { hydrated.dispose(); }
  for (const [component, props, expected] of [
    [ReactFilter, { controller: model.filter }, "Advanced filters"],
    [ReactLayout, { controller: model.layout }, "Installed optional"],
    [ReactRemote, { controller: model.remote, columns: model.columns }, "Installed optional"],
    [ReactAnalytics, { controller: model.analytics }, "Installed optional"],
  ]) assert.ok(renderToStaticMarkup(createElement(component, props)).includes(expected), `React ${expected} SSR`);
  for (const [component, props, expected] of [
    [VueFilter, { controller: model.filter, idPrefix: "external-filter" }, "Advanced filters"],
    [createLayoutGrid(), { controller: model.layout, idPrefix: "external-layout" }, "Installed optional"],
    [createServerDataPanel(), { controller: model.remote, columns: model.columns }, "Installed optional"],
    [createAnalyticsPanel(), { controller: model.analytics }, "Installed optional"],
  ]) assert.ok((await renderToString(createSSRApp({ render: () => h(component, props) }))).includes(expected), `Vue ${expected} SSR`);
  const decimal = createLocaleNumberCodec({ locale: "de-DE", valueType: "decimal" });
  assert.deepEqual(decimal.parse(decimal.format("9007199254740993.12")), { valid: true, value: "9007199254740993.12" });
  const date = createLocaleDateCodec({ locale: "ko-KR" }); assert.deepEqual(date.parse(date.format("2026-10-25")), { valid: true, value: "2026-10-25" });
  const job = createAnalyticsExportJob({ rows: model.rows, scope: "all", columns: [{ id: "name", label: "Name", type: "text", getValue: (row) => row.name }] }, { exporter: createXlsxExporter() });
  try { const artifact = await job.start(); assert.equal(artifact.bytes[0], 0x50); assert.equal(artifact.bytes[1], 0x4b); assert.ok(artifact.filename.endsWith(".xlsx")); } finally { job.dispose(); }
} finally { model.dispose(); console.error = originalConsoleError; }
assert.deepEqual(warnings, [], "Installed feature SSR must not emit hydration/layout warnings");
