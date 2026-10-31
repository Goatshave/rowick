<script>
  import { onDestroy } from "svelte";
  import { FilterPanel } from "@rowick/svelte-ui/filtering";
  import { LayoutGrid } from "@rowick/svelte-ui/layout";
  import { ServerDataPanel } from "@rowick/svelte-ui/server-data";
  import { AnalyticsPanel } from "@rowick/svelte-ui/analytics";
  import "@rowick/svelte-ui/filtering.css";
  import "@rowick/svelte-ui/layout.css";
  import "@rowick/svelte-ui/analytics.css";
  import { createFeatureModel } from "./feature-model.mjs";
  export let initialData = undefined;
  const model = createFeatureModel({ initialData });
  onDestroy(model.dispose);
</script>
<FilterPanel controller={model.filter} idPrefix="external-filter" />
<LayoutGrid controller={model.layout} idPrefix="external-layout" />
<ServerDataPanel controller={model.remote} columns={model.columns} />
<AnalyticsPanel controller={model.analytics} />
