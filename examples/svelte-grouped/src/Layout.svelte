<script lang="ts">
  import { onMount } from "svelte";
  import { LayoutGrid } from "@rowick/svelte-ui/layout";
  import { RowEditingPanel } from "@rowick/svelte-ui/editing";
  import "@rowick/svelte-ui/layout.css";
  import "@rowick/svelte-ui/editing.css";
  import { createLayoutExample, downloadLayoutArtifact, installLayoutTestBridge, type LayoutExample } from "@rowick/example-shared-server/layout-client";
  let source: LayoutExample | undefined, visible = true, revision = 0, error: string | undefined;
  onMount(() => { const session = createLayoutExample(new URLSearchParams(location.search).get("dir") === "rtl" ? "rtl" : "ltr"); source = session; const stop = session.subscribe(() => { revision++; source = session; }), cleanup = installLayoutTestBridge(session, (value) => { visible = value; }); return () => { cleanup(); stop(); session.dispose(); }; });
  async function exportLayout(format: "csv" | "xlsx", scope: "range" | "page" = "range") { if (source) downloadLayoutArtifact(await source.export(format, scope)); }
  async function run(action: () => unknown) { error = undefined; try { await action(); } catch (failure) { error = failure instanceof Error ? failure.message : "Action failed"; } }
</script>
<main style="padding:24px"><h1>Advanced layout</h1>{#if source}<p>10,000 records × 20 columns. Stable IDs, variable heights, interactive details, pinned rows and columns, native merges and draft history. Direction: {source.direction}.</p>
  <div role="group" aria-label="Layout scenarios">{#each source.actions as [label, action]}<button type="button" on:click={() => run(action)}>{label}</button>{/each}<button on:click={() => run(() => exportLayout("csv"))}>Export selected CSV</button><button on:click={() => run(() => exportLayout("xlsx"))}>Export selected XLSX</button><button on:click={() => run(() => exportLayout("csv", "page"))}>Export page CSV</button></div>
  {#if error}<p role="alert">{error}</p>{/if}{#if visible}<LayoutGrid controller={source.layout} idPrefix="example-layout" height={440}><svelte:fragment slot="detail" let:context><fieldset><legend>Details for {context.row.id}</legend><label>Detail note {context.row.id}<input aria-label={`Detail note ${context.row.id}`} value={source.getNote(context.row.id)} on:input={(event) => source?.setNote(context.row.id, event.currentTarget.value)} /></label><button on:click={() => source?.toggleExpanded(context.row.id)}>{source.getExpanded(context.row.id) ? "Shrink detail" : "Grow detail"}</button><p>{#each Array.from({ length: source.getExpanded(context.row.id) ? 14 : 1 }) as _, index}<span style="display:block">Interactive detail line {index + 1}</span>{/each}</p></fieldset></svelte:fragment></LayoutGrid>{/if}
  <output aria-label="Draft first rows" data-revision={revision}>{JSON.stringify(source.getSummary())}</output><output aria-label="Accepted row order">{source.getRows().slice(0, 5).map((row) => row.id).join(",")}</output><RowEditingPanel form={source.form} idPrefix="layout-row-form" />{/if}</main>
