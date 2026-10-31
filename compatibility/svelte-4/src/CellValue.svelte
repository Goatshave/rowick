<script lang="ts">
  import type { CellContext } from "@rowick/core";

  export let context: CellContext<unknown, unknown>;
</script>

<strong data-row-id={context.row.id}>{String(context.value)}</strong>
