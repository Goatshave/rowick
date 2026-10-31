<script lang="ts">
  import { onMount } from "svelte";
  import { DataGrid } from "@rowick/svelte-ui";
  import { RowEditingPanel } from "@rowick/svelte-ui/editing";
  import "@rowick/svelte-ui/editing.css";
  import { createRowEditingExample, editingColumns, type RowEditingExample } from "@rowick/example-shared-server/row-editing-client";
  let session: RowEditingExample | undefined, revision = 0;
  onMount(() => { const source = createRowEditingExample(); session = source; const stop = source.subscribe(() => { revision++; }); return () => { stop(); source.dispose(); }; });
  $: options = (revision, { data: session?.getProjectedRows() ?? [], columns: editingColumns, getRowId: (row: { id: string }) => row.id });
  $: accepted = (revision, JSON.stringify(session?.getRows() ?? []));
  $: actions = session ? [["Edit a", () => session?.begin("a")], ["Edit b", () => session?.begin("b")], ["Hold saves", session.hold], ["Release saves", session.release],
    ["Fail next save for b", session.failNext], ["External update a", session.externalUpdate], ["Change query", session.changeQuery], ["Paste two rows", session.paste], ["Fill amounts", session.fill]] as const : [];
</script>
<main style="padding: 24px; overflow-wrap: anywhere"><h1>Row editing</h1><p>Drafts, asynchronous validation, serialized saves and recovery.</p>
  {#if session}
    <div role="group" aria-label="Editing scenarios">{#each actions as [label, action]}<button type="button" on:click={action}>{label}</button>{/each}</div>
    <DataGrid ariaLabel="Draft records" {options} style={{ height: "240px" }} />
    <output aria-label="Accepted data">{accepted}</output>
    <RowEditingPanel form={session.form} idPrefix="example-row-edit" />
  {/if}
</main>
