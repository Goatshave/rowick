<script lang="ts">
  import { onMount } from "svelte";
  import { AnalyticsPanel } from "@rowick/svelte-ui/analytics";
  import "@rowick/svelte-ui/analytics.css";
  import { createAnalyticsExample, downloadAnalyticsArtifact, type AnalyticsExample } from "@rowick/example-shared-server/analytics-client";
  let example: AnalyticsExample | undefined;
  onMount(() => { const source = createAnalyticsExample({ onArtifact: downloadAnalyticsArtifact, loadView: () => localStorage.getItem("rowick-analytics"), saveView: (value) => localStorage.setItem("rowick-analytics", value) }); example = source; return source.dispose; });
  $: actions = example ? [["Filter KR", example.filterKR], ["Show all records", example.showAll], ["Try column limit", example.overflow], ["Fail view storage", example.failStorage], ["Corrupt saved view", example.corruptView], ["Fail next custom export", example.failNextExport]] as const : [];
</script>
<main style="padding: 24px"><h1>Pivot and export</h1><p>Bounded analytical results, typed files, printing and recoverable export jobs.</p>
  {#if example}<div role="group" aria-label="Analytics scenarios">{#each actions as [label, action]}<button type="button" on:click={action}>{label}</button>{/each}</div><AnalyticsPanel controller={example.controller} />{/if}
</main>
