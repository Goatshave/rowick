<script lang="ts">
  import { onDestroy } from "svelte";
  import { DataGrid } from "@rowick/svelte-ui";
  import { FilterPanel } from "@rowick/svelte-ui/filtering";
  import "@rowick/svelte-ui/filtering.css";
  import type { Grid } from "@rowick/core";
  import { createFilteringExample, filterRecords, filteringColumns, type FilterRecord } from "@rowick/example-shared-server/filtering-client";
  let grid: Grid<FilterRecord> | undefined, session: ReturnType<typeof createFilteringExample> | undefined, revision = 0, stop = () => {};
  const options = { data: filterRecords, columns: filteringColumns, getRowId: (row: FilterRecord) => row.id };
  function ready(value: Grid<FilterRecord>) {
    if (value === grid) return; stop(); session?.dispose(); grid = value;
    session = createFilteringExample(value, { remoteCandidates: new URLSearchParams(location.search).has("remote") }); stop = value.subscribe(() => { revision++; });
  }
  $: matching = (revision, grid?.getFilteredRowModel().rows.map((row) => String(row.getValue("name") ?? "")).join(", "));
  onDestroy(() => { stop(); session?.dispose(); });
</script>
<main style="padding: 24px"><h1>Advanced filtering</h1><p>Build typed conditions, inspect candidates and save a view.</p>
  <DataGrid ariaLabel="Filter records" {options} onGridReady={ready} paginationControls style={{ height: "300px" }} />
  <output aria-label="Matching rows">{matching ?? ""}</output>
  {#if session}<div role="group" aria-label="Settings failure scenarios"><button type="button" on:click={session.failStorage}>Simulate storage failure</button><button type="button" on:click={session.restoreStorage}>Restore storage</button><button type="button" on:click={session.failCandidates}>Fail next candidate search</button></div><FilterPanel controller={session.controller} idPrefix="example-filter" />{/if}
</main>
