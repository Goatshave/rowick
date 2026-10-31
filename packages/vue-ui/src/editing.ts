import { defineComponent, h, onBeforeUnmount, onMounted, shallowRef, watch, type DefineComponent, type PropType } from "vue";
import { defaultEditingLabels, type EditingLabels, type EditingFormField, type RowEditingForm } from "@rowick/data/editing";
export interface RowEditingPanelProps<TData> { form: RowEditingForm<TData>; idPrefix: string; labels?: Partial<EditingLabels>; }
/** Factory preserves product data types in Vue templates and render functions. */
export function createRowEditingPanel<TData>(): DefineComponent<RowEditingPanelProps<TData>> {
  return defineComponent({
    props: { form: { type: Object as PropType<RowEditingForm<TData>>, required: true }, idPrefix: { type: String, required: true }, labels: { type: Object as PropType<Partial<EditingLabels>>, default: undefined } },
    setup(props) {
      const state = shallowRef(props.form.getState()), error = shallowRef<string>(); let stop = () => {};
      onMounted(() => { watch(() => props.form, (form) => { stop(); state.value = form.getState(); stop = form.subscribe(() => { state.value = form.getState(); }); }, { immediate: true }); });
      onBeforeUnmount(() => stop());
      const composing = new Set<string>();
      const run = (action: () => unknown) => {
        error.value = undefined;
        try { void Promise.resolve(action()).catch((failure: unknown) => { error.value = failure instanceof Error ? failure.message : "Action failed"; }); }
        catch (failure) { error.value = failure instanceof Error ? failure.message : "Action failed"; }
      };
      return () => {
        const labels = { ...defaultEditingLabels, ...props.labels }, form = props.form;
        const button = (label: string, action: () => unknown, disabled = false) => h("button", { type: "button", disabled, onClick: () => run(action) }, label);
        const control = (rowId: string, field: EditingFormField) => {
          const definition = field.definition, key = JSON.stringify([rowId, definition.id]), text = typeof field.input === "string" ? field.input : "";
          const input = (event: Event, composingInput = composing.has(key)) => form.setInput(rowId, definition.id, (event.target as HTMLInputElement).value, composingInput);
          const id = `${props.idPrefix}-${encodeURIComponent(rowId)}-${encodeURIComponent(definition.id)}`;
          const common = { id, disabled: field.disabled, "aria-invalid": Boolean(field.error), "aria-describedby": field.error ? `${id}-error` : undefined };
          const textProps = { ...common, value: text, onInput: input,
            onCompositionstart: (event: Event) => { composing.add(key); input(event, true); }, onCompositionend: (event: Event) => { composing.delete(key); input(event, false); } };
          return h("div", { key: definition.id }, [
            definition.kind === "async-select" && h("div", [
              h("label", [labels.search + " " + definition.label, h("input", { type: "search", disabled: field.disabled, value: field.searchQuery,
                onInput: (event: Event) => run(() => form.search(rowId, definition.id, (event.target as HTMLInputElement).value)) })]),
              field.searchLoading && h("span", { role: "status" }, labels.loading),
              field.searchError && h("div", { role: "alert" }, [field.searchError, button(labels.retry, () => form.search(rowId, definition.id, field.searchQuery))]),
            ]),
            h("label", { for: id }, definition.label),
              definition.kind === "boolean" ? h("input", { ...common, type: "checkbox", checked: field.input === true,
                onChange: (event: Event) => form.setInput(rowId, definition.id, (event.target as HTMLInputElement).checked) })
                : definition.kind === "long-text" ? h("textarea", textProps)
                : definition.kind === "select" || definition.kind === "async-select" ? h("select", { ...common, value: text, onChange: input }, [
                  h("option", { value: "" }, labels.choose),
                  text && !field.choices.some((choice) => choice.value === text) && h("option", { value: text, disabled: true }, text),
                  ...field.choices.map((choice) => h("option", { value: choice.value, disabled: choice.disabled }, choice.label)),
                ]) : h("input", { ...textProps, type: definition.kind === "date" ? "date" : "text", inputmode: ["number", "decimal", "currency"].includes(definition.kind) ? "decimal" : undefined }),
            field.error && h("p", { id: `${id}-error`, role: "alert" }, field.error),
          ]);
        };
        return h("section", { class: "rowick-row-editor", "aria-label": labels.panel }, [
          h("div", { role: "group", "aria-label": labels.panel }, [
            button(labels.saveAll, form.saveAll, !state.value.dirtyRowCount && !state.value.invalidFieldCount), button(labels.cancelAll, () => form.cancel(), !state.value.rows.length),
            button(labels.undo, form.undo, !state.value.canUndo), button(labels.redo, form.redo, !state.value.canRedo),
          ]),
          h("p", { role: "status" }, labels.summary(state.value.dirtyRowCount, state.value.pendingCount, state.value.invalidFieldCount)),
          (error.value ?? state.value.message) && h("p", { role: "alert" }, error.value ?? state.value.message),
          !state.value.rows.length && h("p", labels.empty),
          ...state.value.rows.map((row) => h("fieldset", { key: row.rowId }, [h("legend", labels.row(row.rowId)), h("p", { role: "status" }, labels.status(row.status)),
            row.message && h("p", { role: "alert" }, row.message), ...row.fields.map((field) => control(row.rowId, field)),
            h("div", { role: "group", "aria-label": labels.row(row.rowId) }, [button(labels.save, () => form.save(row.rowId)), button(labels.cancel, () => form.cancel(row.rowId)),
              row.status === "error" && button(labels.retry, () => form.retry(row.rowId), row.pendingCount > 0),
              row.status === "conflict" && button(labels.rebase, () => form.rebase(row.rowId), row.pendingCount > 0)]),
          ])),
        ]);
      };
    },
  }) as unknown as DefineComponent<RowEditingPanelProps<TData>>;
}
export const RowEditingPanel = createRowEditingPanel<unknown>();
