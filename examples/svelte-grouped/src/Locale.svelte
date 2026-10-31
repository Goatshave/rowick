<script lang="ts">
  import { onMount } from "svelte";
  import { DataGrid } from "@rowick/svelte-ui";
  import { RowEditingPanel } from "@rowick/svelte-ui/editing";
  import "@rowick/svelte-ui/editing.css";
  import { createLocaleExample, localeExampleLocales, type LocaleExample } from "@rowick/example-shared-server/locale-client";
  let example: LocaleExample | undefined, revision = 0;
  onMount(() => { const session = createLocaleExample(), stop = session.subscribe(() => { revision++; }); example = session; return () => { stop(); session.dispose(); }; });
  $: samples = (revision, example?.getSamples());
  $: options = (revision, { data: example?.getProjectedRows() ?? [], columns: example?.getColumns() ?? [], getRowId: (row: { id: string }) => row.id });
  $: accepted = (revision, JSON.stringify(example?.getRows() ?? []));
  $: direction = (revision, example?.getDirection() ?? "ltr");
  $: locale = (revision, example?.getLocale() ?? "en-US");
  $: message = (revision, example?.getMessage() ?? "Ready");
  $: form = (revision, example?.getForm());
  $: labels = (revision, example?.getLabels() ?? {});
</script>
<main dir={direction} style="padding: 24px; overflow-wrap: anywhere"><h1>Locale input</h1><p>Explicit locale parsing preserves exact canonical values. Composition events here are automated fixtures; real OS IME checks remain separate.</p>
  {#if example && samples && form}
    <label for="locale-picker">Locale</label><select id="locale-picker" value={locale} on:change={(event) => { example?.setLocale(event.currentTarget.value); event.currentTarget.value = example?.getLocale() ?? locale; }}>{#each localeExampleLocales as tag}<option value={tag}>{tag}</option>{/each}</select>
    <button type="button" on:click={example.edit}>Edit record</button><button type="button" on:click={() => example?.setLocale("zz-ZZ")}>Try unsupported locale</button>
    <p role="status" aria-label="Locale result">{message}</p>
    <output aria-label="Decimal sample">{samples.decimal}</output><output aria-label="Money sample">{samples.money}</output><output aria-label="Number sample">{samples.number}</output><output aria-label="Date sample">{samples.date}</output>
    <output aria-label="Large decimal sample">{samples.largeDecimal}</output><output aria-label="Large money sample">{samples.largeMoney}</output>
    <p>Calendar pattern: <bdi>{samples.datePattern}</bdi></p><p><bdi>{options.data[0]?.name}</bdi></p>
    <DataGrid ariaLabel="Locale records" {options} style={{ height: "200px" }} />
    <output aria-label="Canonical accepted values"><bdi dir="ltr">{accepted}</bdi></output>
    <RowEditingPanel {form} {labels} idPrefix="locale-editor" />
  {/if}
</main>
