<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import { defaultEditingLabels, type EditingLabels, type RowEditingForm } from "@rowick/data/editing";
  export let form: RowEditingForm<unknown>;
  export let idPrefix: string;
  export let labels: Partial<EditingLabels> = {};
  let state = form.getState(), error: string | undefined;
  let stop = () => {}, mounted = false;
  onMount(() => { mounted = true; });
  $: if (mounted) { stop(); state = form.getState(); stop = form.subscribe(() => { state = form.getState(); }); }
  $: text = { ...defaultEditingLabels, ...labels };
  onDestroy(() => stop());
  const composing = new Set<string>();
  const key = (rowId: string, fieldId: string) => `${idPrefix}-${encodeURIComponent(rowId)}-${encodeURIComponent(fieldId)}`;
  function run(action: () => unknown) {
    error = undefined;
    try { void Promise.resolve(action()).catch((failure: unknown) => { error = failure instanceof Error ? failure.message : "Action failed"; }); }
    catch (failure) { error = failure instanceof Error ? failure.message : "Action failed"; }
  }
  function input(rowId: string, fieldId: string, event: Event) {
    form.setInput(rowId, fieldId, (event.target as HTMLInputElement).value, composing.has(key(rowId, fieldId)));
  }
</script>

<section class="rowick-row-editor" aria-label={text.panel}>
  <div role="group" aria-label={text.panel}>
    <button type="button" disabled={!state.dirtyRowCount && !state.invalidFieldCount} on:click={() => run(form.saveAll)}>{text.saveAll}</button>
    <button type="button" disabled={!state.rows.length} on:click={() => run(() => form.cancel())}>{text.cancelAll}</button>
    <button type="button" disabled={!state.canUndo} on:click={() => run(form.undo)}>{text.undo}</button>
    <button type="button" disabled={!state.canRedo} on:click={() => run(form.redo)}>{text.redo}</button>
  </div>
  <p role="status">{text.summary(state.dirtyRowCount, state.pendingCount, state.invalidFieldCount)}</p>
  {#if error ?? state.message}<p role="alert">{error ?? state.message}</p>{/if}
  {#if !state.rows.length}<p>{text.empty}</p>{/if}
  {#each state.rows as row (row.rowId)}
    <fieldset>
      <legend>{text.row(row.rowId)}</legend>
      <p role="status">{text.status(row.status)}</p>
      {#if row.message}<p role="alert">{row.message}</p>{/if}
      {#each row.fields as field (field.definition.id)}
        {@const id = key(row.rowId, field.definition.id)}
        <div>
          <label for={id}>{field.definition.label}</label>
          {#if field.definition.kind === "async-select"}
            <div>
              <label for={`${id}-search`}>{text.search} {field.definition.label}</label>
              <input id={`${id}-search`} type="search" disabled={field.disabled} value={field.searchQuery}
                on:input={(event) => run(() => form.search(row.rowId, field.definition.id, event.currentTarget.value))} />
              {#if field.searchLoading}<span role="status">{text.loading}</span>{/if}
              {#if field.searchError}<div role="alert">{field.searchError}<button type="button" on:click={() => run(() => form.search(row.rowId, field.definition.id, field.searchQuery))}>{text.retry}</button></div>{/if}
            </div>
          {/if}
          {#if field.definition.kind === "boolean"}
            <input {id} type="checkbox" disabled={field.disabled} checked={field.input === true} aria-invalid={Boolean(field.error)} aria-describedby={field.error ? `${id}-error` : undefined}
              on:change={(event) => form.setInput(row.rowId, field.definition.id, event.currentTarget.checked)} />
          {:else if field.definition.kind === "long-text"}
            <textarea {id} disabled={field.disabled} value={String(field.input)} aria-invalid={Boolean(field.error)} aria-describedby={field.error ? `${id}-error` : undefined}
              on:input={(event) => input(row.rowId, field.definition.id, event)}
              on:compositionstart={(event) => { composing.add(id); input(row.rowId, field.definition.id, event); }} on:compositionend={(event) => { composing.delete(id); input(row.rowId, field.definition.id, event); }}></textarea>
          {:else if field.definition.kind === "select" || field.definition.kind === "async-select"}
            <select {id} disabled={field.disabled} value={String(field.input)} aria-invalid={Boolean(field.error)} aria-describedby={field.error ? `${id}-error` : undefined}
              on:change={(event) => form.setInput(row.rowId, field.definition.id, event.currentTarget.value)}>
              <option value="">{text.choose}</option>
              {#if field.input && !field.choices.some((choice) => choice.value === field.input)}<option value={String(field.input)} disabled>{field.input}</option>{/if}
              {#each field.choices as choice (choice.value)}<option value={choice.value} disabled={choice.disabled}>{choice.label}</option>{/each}
            </select>
          {:else}
            <input {id} type={field.definition.kind === "date" ? "date" : "text"} disabled={field.disabled} value={String(field.input)}
              inputmode={["number", "decimal", "currency"].includes(field.definition.kind) ? "decimal" : undefined}
              aria-invalid={Boolean(field.error)} aria-describedby={field.error ? `${id}-error` : undefined}
              on:input={(event) => input(row.rowId, field.definition.id, event)}
              on:compositionstart={(event) => { composing.add(id); input(row.rowId, field.definition.id, event); }} on:compositionend={(event) => { composing.delete(id); input(row.rowId, field.definition.id, event); }} />
          {/if}
          {#if field.error}<p id={`${id}-error`} role="alert">{field.error}</p>{/if}
        </div>
      {/each}
      <div role="group" aria-label={text.row(row.rowId)}>
        <button type="button" on:click={() => run(() => form.save(row.rowId))}>{text.save}</button>
        <button type="button" on:click={() => run(() => form.cancel(row.rowId))}>{text.cancel}</button>
        {#if row.status === "error"}<button type="button" disabled={row.pendingCount > 0} on:click={() => run(() => form.retry(row.rowId))}>{text.retry}</button>{/if}
        {#if row.status === "conflict"}<button type="button" disabled={row.pendingCount > 0} on:click={() => run(() => form.rebase(row.rowId))}>{text.rebase}</button>{/if}
      </div>
    </fieldset>
  {/each}
</section>
