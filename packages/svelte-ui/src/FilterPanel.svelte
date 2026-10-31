<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import { getFilterOperators, type FilterOperator } from "@rowick/core";
  import { defaultFilterPanelLabels, describeActiveFilters, type FilterDraftGroup, type FilterPanelController, type FilterPanelLabels, type FilterPanelSection, type FilterPanelState } from "@rowick/data/filtering";
  export let controller: FilterPanelController;
  export let idPrefix: string;
  export let labels: Partial<FilterPanelLabels> = {};
  export let sections: readonly FilterPanelSection[] = ["filters", "columns", "facets", "views"];
  export let node: FilterDraftGroup | undefined = undefined;
  export let path = "1";
  export let parentId: string | undefined = undefined;
  export let stateOverride: FilterPanelState | undefined = undefined;
  let source = controller.getState(), mounted = false, columnQuery = "", widths = new Map<string, string>();
  let stop = () => {};
  onMount(() => { mounted = true; });
  $: if (mounted && !node) { stop(); source = controller.getState(); stop = controller.subscribe(() => {
    const next = controller.getState(), values = new Map(widths);
    for (const column of next.allColumns) if (source.allColumns.find((previous) => previous.id === column.id)?.size !== column.size) values.delete(column.id);
    widths = values; source = next;
  }); }
  onDestroy(() => stop());
  $: state = stateOverride ?? source;
  $: text = { ...defaultFilterPanelLabels, ...labels };
  $: columns = state.allColumns.filter((column) => column.label.toLowerCase().includes(columnQuery.toLowerCase()));
  $: result = state.facetSearch?.columnId === state.facetColumnId ? state.facetSearch : undefined;
  function run(operation: () => unknown) { try { void Promise.resolve(operation()).catch(() => {}); } catch { /* Controller publishes the error. */ } }
  function input(event: Event) { return (event.target as HTMLInputElement).value; }
  function remove(id: string, parent?: string) { controller.remove(id); requestAnimationFrame(() => document.getElementById(`${idPrefix}-${parent}-add`)?.focus()); }
  function update(id: string, patch: Parameters<FilterPanelController["updateCondition"]>[1]) { run(() => controller.updateCondition(id, patch)); }
  function groupOperator(event: Event) { run(() => { if (node) controller.setGroupOperator(node.id, input(event) as "and" | "or"); }); }
  function conditionOperator(id: string, event: Event) { update(id, { operator: input(event) as FilterOperator }); }
  function pin(id: string, event: Event) { run(() => controller.setColumnPinned(id, input(event) === "none" ? false : input(event) as "left" | "right")); }
  function setWidth(id: string, event: Event) { widths = new Map(widths).set(id, input(event)); }
  function resetWidth(id: string) { const next = new Map(widths); next.delete(id); widths = next; }
  function applyWidth(id: string, size: number) { run(() => { try { controller.setColumnSize(id, Number(widths.get(id) ?? size)); } finally { resetWidth(id); } }); }
</script>

{#if node}
  {@const id = `${idPrefix}-${node.id}`}
  <fieldset>
    <legend>{text.group(path)}</legend>
    <label for={`${id}-match`}>{text.groupOperator}</label>
    <select id={`${id}-match`} value={node.operator} on:change={groupOperator}>
      <option value="and">{text.all}</option><option value="or">{text.any}</option>
    </select>
    {#each node.children as child, index (child.id)}
      {#if child.kind === "group"}
        <svelte:self {controller} {idPrefix} {labels} node={child} path={`${path}.${index + 1}`} parentId={node.id} stateOverride={state} />
      {:else}
        {@const childId = `${idPrefix}-${child.id}`}
        {@const childPath = `${path}.${index + 1}`}
        {@const policy = state.columns.find((column) => column.id === child.columnId)}
        {@const operators = policy?.operators ?? (policy ? getFilterOperators(policy.type) : [])}
        {@const error = state.errors[child.id]}
        {@const list = child.operator === "in" || child.operator === "not-in"}
        <fieldset>
          <legend>{text.condition(childPath)}</legend>
          <label for={`${childId}-column`}>{text.column}</label>
          <select id={`${childId}-column`} value={child.columnId} on:change={(event) => update(child.id, { columnId: input(event) })}>
            {#if !policy}<option value={child.columnId} disabled>{child.columnId}</option>{/if}
            {#each state.columns as column (column.id)}<option value={column.id}>{column.label}</option>{/each}
          </select>
          <label for={`${childId}-operator`}>{text.operator}</label>
          <select id={`${childId}-operator`} value={child.operator} on:change={(event) => conditionOperator(child.id, event)}>
            {#each operators as operator}<option value={operator}>{text.describeOperator(operator)}</option>{/each}
          </select>
          {#if child.operator !== "is-empty" && child.operator !== "is-not-empty"}
            <label for={`${childId}-value`}>{text.value}</label>
            {#if policy?.type === "boolean" && !list}
              <select id={`${childId}-value`} disabled={child.nullValue} value={child.input} aria-invalid={Boolean(error)} aria-describedby={error ? `${childId}-error` : undefined}
                on:change={(event) => update(child.id, { input: input(event) })}><option value="true">true</option><option value="false">false</option></select>
            {:else}
              <input id={`${childId}-value`} type={policy?.type === "date" && !list ? "date" : "text"} disabled={child.nullValue} value={child.input} aria-invalid={Boolean(error)} aria-describedby={error ? `${childId}-error` : list ? `${childId}-hint` : undefined}
                on:input={(event) => update(child.id, { input: input(event) })} />
            {/if}
            {#if child.operator === "between"}<label for={`${childId}-upper`}>{text.upperValue}</label><input id={`${childId}-upper`} type={policy?.type === "date" ? "date" : "text"} value={child.secondInput} aria-invalid={Boolean(error)} aria-describedby={error ? `${childId}-error` : undefined}
              on:input={(event) => update(child.id, { secondInput: input(event) })} />{/if}
            {#if child.operator === "eq" || child.operator === "neq"}<label><input type="checkbox" checked={child.nullValue} on:change={(event) => update(child.id, { nullValue: event.currentTarget.checked })} />{text.missing}</label>{/if}
            {#if list}<p id={`${childId}-hint`}>{text.listHint}</p>{/if}
          {/if}
          {#if policy?.type === "text"}<label><input type="checkbox" checked={child.caseSensitive} on:change={(event) => update(child.id, { caseSensitive: event.currentTarget.checked })} />{text.caseSensitive}</label>{/if}
          {#if error}<p id={`${childId}-error`} role="alert">{error}</p>{/if}
          <button type="button" on:click={() => run(() => remove(child.id, node?.id))}>{text.remove} {text.condition(childPath)}</button>
        </fieldset>
      {/if}
    {/each}
    <div role="group" aria-label={text.group(path)}>
      <button id={`${id}-add`} type="button" on:click={() => run(() => controller.addCondition(node?.id ?? ""))}>{text.addCondition}</button>
      <button type="button" on:click={() => run(() => controller.addGroup(node?.id ?? ""))}>{text.addGroup}</button>
      {#if parentId}<button type="button" on:click={() => run(() => remove(node?.id ?? "", parentId))}>{text.remove} {text.group(path)}</button>{/if}
    </div>
  </fieldset>
{:else}
  <section class="rowick-filter-panel" aria-label={text.panel}>
    {#if state.error ?? state.message}<p role={state.error ? "alert" : "status"}>{state.error ?? state.message}</p>{/if}
    {#if sections.includes("filters")}
      <section aria-label={text.filters}><h2>{text.filters}</h2>
        <div role="group" aria-label={text.filters}><button type="button" on:click={() => run(controller.apply)}>{text.apply}</button><button type="button" on:click={() => run(controller.reset)}>{text.reset}</button><button type="button" on:click={() => run(controller.reload)}>{text.reload}</button></div>
        <p role="status">{text.active(state.activeConditionCount)}</p><p>{describeActiveFilters(state, text)}</p>
        {#if state.stale}<p role="alert">{text.stale}</p>{/if}
        <svelte:self {controller} {idPrefix} {labels} node={state.draft} path="1" stateOverride={state} />
      </section>
    {/if}
    {#if sections.includes("columns")}
      <section aria-label={text.columns}><h2>{text.columns}</h2>
        <label for={`${idPrefix}-column-search`}>{text.columnSearch}</label><input id={`${idPrefix}-column-search`} type="search" value={columnQuery} on:input={(event) => { columnQuery = input(event); }} />
        {#if columns.length > 100}<p role="status">{text.limitedColumns(100, columns.length)}</p>{/if}
        {#each columns.slice(0, 100) as column (column.id)}
          <fieldset><legend>{column.label}</legend>
            <label><input type="checkbox" checked={column.visible} disabled={!column.configurable} on:change={(event) => run(() => controller.setColumnVisible(column.id, event.currentTarget.checked))} />{column.label} {text.visible}</label>
            <label for={`${idPrefix}-${column.id}-pin`}>{column.label} {text.pin}</label><select id={`${idPrefix}-${column.id}-pin`} disabled={!column.configurable} value={column.pinned || "none"} on:change={(event) => pin(column.id, event)}><option value="none">{text.unpinned}</option><option value="left">{text.left}</option><option value="right">{text.right}</option></select>
            <label for={`${idPrefix}-${column.id}-width`}>{column.label} {text.width}</label><input id={`${idPrefix}-${column.id}-width`} type="number" min={1} disabled={!column.configurable} value={widths.get(column.id) ?? String(column.size)} on:input={(event) => setWidth(column.id, event)} on:blur={() => applyWidth(column.id, column.size)} on:keydown={(event) => { if (event.key === "Enter") applyWidth(column.id, column.size); if (event.key === "Escape") resetWidth(column.id); }} />
            <button type="button" disabled={!column.configurable || state.allColumns[0]?.id === column.id} on:click={() => run(() => controller.moveColumn(column.id, "before"))}>{text.moveBefore} {column.label}</button><button type="button" disabled={!column.configurable || state.allColumns.at(-1)?.id === column.id} on:click={() => run(() => controller.moveColumn(column.id, "after"))}>{text.moveAfter} {column.label}</button>
          </fieldset>
        {/each}
      </section>
    {/if}
    {#if sections.includes("facets")}
      <section aria-label={text.facets}><h2>{text.facets}</h2>
        <label for={`${idPrefix}-facet-column`}>{text.facetColumn}</label><select id={`${idPrefix}-facet-column`} value={state.facetColumnId ?? ""} on:change={(event) => run(() => controller.setFacetColumn(input(event)))}><option value="" disabled>{text.column}</option>{#each state.columns as column (column.id)}<option value={column.id}>{column.label}</option>{/each}</select>
        <label for={`${idPrefix}-facet-search`}>{text.facetSearch}</label><input id={`${idPrefix}-facet-search`} type="search" disabled={!state.facetColumnId} value={state.facetQuery} on:input={(event) => run(() => controller.searchFacets(input(event)))} />
        <p>{text.facetScope(state.facetScope)}</p>{#if result?.loading}<p role="status">{text.loading}</p>{/if}
        {#if result?.error}<div role="alert">{result.error}<button type="button" on:click={() => run(controller.retryFacets)}>{text.retry}</button></div>{/if}
        {#if result?.truncated ?? state.facets?.truncated}<p role="status">{text.truncated}</p>{/if}
        {#if state.facets?.rowsTruncated}<p role="status">{text.partialCounts}</p>{/if}
        {#if state.facets?.minimum !== undefined}<p>{text.range(String(state.facets.minimum), String(state.facets.maximum))}</p>{/if}
        <ul>{#each result?.values ?? state.facets?.values ?? [] as facet (JSON.stringify(facet.value))}<li><button type="button" on:click={() => run(() => controller.useFacet(facet.value))}>{text.facetCount(facet.value === null ? text.missingValue : String(facet.value), facet.count)}</button></li>{/each}</ul>
      </section>
    {/if}
    {#if sections.includes("views")}
      <section aria-label={text.views}><h2>{text.views}</h2>
        <label for={`${idPrefix}-view-name`}>{text.viewName}</label><input id={`${idPrefix}-view-name`} value={state.viewName} on:input={(event) => run(() => controller.setViewName(input(event)))} />
        <label for={`${idPrefix}-view-select`}>{text.chooseView}</label><select id={`${idPrefix}-view-select`} value={state.selectedViewId} on:change={(event) => run(() => controller.selectView(input(event)))}><option value="">{text.chooseView}</option>{#each state.views as view (view.id)}<option value={view.id}>{view.name}</option>{/each}</select>
        <div role="group" aria-label={text.views}><button type="button" on:click={() => run(controller.saveView)}>{text.saveView}</button><button type="button" disabled={!state.selectedViewId} on:click={() => run(controller.restoreView)}>{text.restoreView}</button><button type="button" disabled={!state.selectedViewId} on:click={() => run(controller.deleteView)}>{text.deleteView}</button><button type="button" on:click={() => run(controller.clearViews)}>{text.clearViews}</button><button type="button" on:click={() => run(controller.exportView)}>{text.exportView}</button></div>
        <label for={`${idPrefix}-view-json`}>{text.viewJSON}</label><textarea id={`${idPrefix}-view-json`} rows={5} value={state.viewJSON} on:input={(event) => run(() => controller.setViewJSON(input(event)))}></textarea><button type="button" on:click={() => run(controller.importView)}>{text.importView}</button>
      </section>
    {/if}
  </section>
{/if}
