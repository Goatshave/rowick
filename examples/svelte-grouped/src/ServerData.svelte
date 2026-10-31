<script lang="ts">
  import { onMount } from "svelte";
  import { ServerDataPanel } from "@rowick/svelte-ui/server-data";
  import { createDatasourceExample, datasourceColumns, getDatasourceChildScope, getDatasourceEvidence, getDatasourceExampleActions, type DatasourceExample } from "@rowick/example-shared-server/datasource-client";
  let example: DatasourceExample | undefined, revision = 0;
  onMount(() => { const session = createDatasourceExample({ download: true }), stop = session.subscribe(() => { revision++; }); example = session; void session.start(); return () => { stop(); session.dispose(); }; });
  $: evidence = (revision, example ? getDatasourceEvidence(example) : "");
  $: message = (revision, example?.getMessage() ?? "Ready");
</script>
<main style="padding: 24px; overflow-wrap: anywhere"><h1>Server datasource</h1><p>Ten million logical records with bounded blocks, query selection and persistent HTTP recovery.</p>
  {#if example}
    <div role="group" aria-label="Datasource scenarios">{#each getDatasourceExampleActions(example) as [label, action]}<button type="button" on:click={() => { void action(); }}>{label}</button>{/each}</div>
    <p role="status" aria-label="Datasource scenario result">{message}</p><output aria-label="Datasource evidence">{evidence}</output>
    <ServerDataPanel controller={example.source} columns={datasourceColumns} actions={example.actions} getChildScope={getDatasourceChildScope} getRowLabel={(row) => row.name} />
  {/if}
</main>
