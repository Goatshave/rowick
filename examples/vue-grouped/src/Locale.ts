import { defineComponent, h, onBeforeUnmount, shallowRef } from "vue";
import { createDataGrid } from "@rowick/vue-ui";
import { createRowEditingPanel } from "@rowick/vue-ui/editing";
import "@rowick/vue-ui/editing.css";
import { createLocaleExample, localeExampleLocales, type LocaleRecord } from "@rowick/example-shared-server/locale-client";
const Grid = createDataGrid<LocaleRecord>(), Panel = createRowEditingPanel<LocaleRecord>();
export default defineComponent({ setup() {
  const example = createLocaleExample(), revision = shallowRef(0), stop = example.subscribe(() => { revision.value++; }); onBeforeUnmount(() => { stop(); example.dispose(); });
  return () => { revision.value; const samples = example.getSamples(); return h("main", { dir: example.getDirection(), style: { padding: "24px", overflowWrap: "anywhere" } }, [h("h1", "Locale input"), h("p", "Explicit locale parsing preserves exact canonical values. Composition events here are automated fixtures; real OS IME checks remain separate."),
    h("label", { for: "locale-picker" }, "Locale"), h("select", { id: "locale-picker", value: example.getLocale(), onChange: (event: Event) => { const select = event.target as HTMLSelectElement; example.setLocale(select.value); select.value = example.getLocale(); } }, localeExampleLocales.map((locale) => h("option", { value: locale }, locale))),
    h("button", { type: "button", onClick: example.edit }, "Edit record"), h("button", { type: "button", onClick: () => example.setLocale("zz-ZZ") }, "Try unsupported locale"),
    h("p", { role: "status", "aria-label": "Locale result" }, example.getMessage()),
    ...(["decimal", "money", "number", "date"] as const).map((name) => h("output", { "aria-label": name[0]!.toUpperCase() + name.slice(1) + " sample" }, samples[name])),
    h("output", { "aria-label": "Large decimal sample" }, samples.largeDecimal), h("output", { "aria-label": "Large money sample" }, samples.largeMoney),
    h("p", ["Calendar pattern: ", h("bdi", samples.datePattern)]), h("p", [h("bdi", example.getProjectedRows()[0]?.name)]),
    h(Grid, { ariaLabel: "Locale records", options: { data: example.getProjectedRows(), columns: example.getColumns(), getRowId: (row) => row.id }, style: { height: "200px" } }),
    h("output", { "aria-label": "Canonical accepted values" }, [h("bdi", { dir: "ltr" }, JSON.stringify(example.getRows()))]), h(Panel, { form: example.getForm(), labels: example.getLabels(), idPrefix: "locale-editor" }),
  ]); };
} });
