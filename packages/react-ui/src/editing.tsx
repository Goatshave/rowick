import { useId, useRef, useState, useSyncExternalStore } from "react";
import { defaultEditingLabels, type EditingLabels, type EditingFormField, type RowEditingForm } from "@rowick/data/editing";

export interface RowEditingPanelProps<TData> { form: RowEditingForm<TData>; labels?: Partial<EditingLabels>; }
export function RowEditingPanel<TData>({ form, labels: overrides }: RowEditingPanelProps<TData>) {
  const state = useSyncExternalStore(form.subscribe, form.getState, form.getState), prefix = useId();
  const labels = { ...defaultEditingLabels, ...overrides }, [error, setError] = useState<string>();
  const run = (action: () => unknown) => {
    setError(undefined);
    try { void Promise.resolve(action()).catch((failure: unknown) => setError(failure instanceof Error ? failure.message : "Action failed")); }
    catch (failure) { setError(failure instanceof Error ? failure.message : "Action failed"); }
  };
  return <section className="rowick-row-editor" aria-label={labels.panel}>
    <div role="group" aria-label={labels.panel}>
      <button type="button" disabled={!state.dirtyRowCount && !state.invalidFieldCount} onClick={() => run(form.saveAll)}>{labels.saveAll}</button>
      <button type="button" disabled={!state.rows.length} onClick={() => run(() => form.cancel())}>{labels.cancelAll}</button>
      <button type="button" disabled={!state.canUndo} onClick={() => run(form.undo)}>{labels.undo}</button>
      <button type="button" disabled={!state.canRedo} onClick={() => run(form.redo)}>{labels.redo}</button>
    </div>
    <p role="status">{labels.summary(state.dirtyRowCount, state.pendingCount, state.invalidFieldCount)}</p>
    {(error ?? state.message) && <p role="alert">{error ?? state.message}</p>}
    {!state.rows.length && <p>{labels.empty}</p>}
    {state.rows.map((row) => <fieldset key={row.rowId}>
      <legend>{labels.row(row.rowId)}</legend>
      <p role="status">{labels.status(row.status)}</p>
      {row.message && <p role="alert">{row.message}</p>}
      {row.fields.map((field) => <Field key={field.definition.id} form={form} rowId={row.rowId} field={field} labels={labels}
        id={`${prefix}-${encodeURIComponent(row.rowId)}-${encodeURIComponent(field.definition.id)}`} run={run} />)}
      <div role="group" aria-label={labels.row(row.rowId)}>
        <button type="button" onClick={() => run(() => form.save(row.rowId))}>{labels.save}</button>
        <button type="button" onClick={() => run(() => form.cancel(row.rowId))}>{labels.cancel}</button>
        {row.status === "error" && <button type="button" disabled={row.pendingCount > 0} onClick={() => run(() => form.retry(row.rowId))}>{labels.retry}</button>}
        {row.status === "conflict" && <button type="button" disabled={row.pendingCount > 0} onClick={() => run(() => form.rebase(row.rowId))}>{labels.rebase}</button>}
      </div>
    </fieldset>)}
  </section>;
}
function Field<TData>({ form, rowId, field, labels, id, run }: {
  form: RowEditingForm<TData>; rowId: string; field: EditingFormField; labels: EditingLabels; id: string; run: (action: () => unknown) => void;
}) {
  const composing = useRef(false), definition = field.definition;
  const props = { id, disabled: field.disabled, "aria-invalid": Boolean(field.error), "aria-describedby": field.error ? `${id}-error` : undefined };
  const text = typeof field.input === "string" ? field.input : "";
  const textProps = { ...props, value: text,
    onCompositionStart: (event: React.CompositionEvent<HTMLInputElement | HTMLTextAreaElement>) => { composing.current = true; form.setInput(rowId, definition.id, event.currentTarget.value, true); },
    onCompositionEnd: (event: React.CompositionEvent<HTMLInputElement | HTMLTextAreaElement>) => { composing.current = false; form.setInput(rowId, definition.id, event.currentTarget.value); },
    onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => form.setInput(rowId, definition.id, event.currentTarget.value, composing.current),
  };
  return <div>
    <label htmlFor={id}>{definition.label}</label>
    {definition.kind === "async-select" && <div>
      <label htmlFor={`${id}-search`}>{labels.search} {definition.label}</label>
      <input id={`${id}-search`} type="search" disabled={field.disabled} value={field.searchQuery}
        onChange={(event) => run(() => form.search(rowId, definition.id, event.currentTarget.value))} />
      {field.searchLoading && <span role="status">{labels.loading}</span>}
      {field.searchError && <div role="alert">{field.searchError}<button type="button" onClick={() => run(() => form.search(rowId, definition.id, field.searchQuery))}>{labels.retry}</button></div>}
    </div>}
    {definition.kind === "boolean" ? <input {...props} type="checkbox" checked={field.input === true} onChange={(event) => form.setInput(rowId, definition.id, event.currentTarget.checked)} />
      : definition.kind === "long-text" ? <textarea {...textProps} />
      : definition.kind === "select" || definition.kind === "async-select" ? <select {...props} value={text} onChange={(event) => form.setInput(rowId, definition.id, event.currentTarget.value)}>
        <option value="">{labels.choose}</option>
        {text && !field.choices.some((choice) => choice.value === text) && <option value={text} disabled>{text}</option>}
        {field.choices.map((choice) => <option key={choice.value} value={choice.value} disabled={choice.disabled}>{choice.label}</option>)}
      </select>
      : <input {...textProps} type={definition.kind === "date" ? "date" : "text"} inputMode={["number", "decimal", "currency"].includes(definition.kind) ? "decimal" : undefined} />}
    {field.error && <p id={`${id}-error`} role="alert">{field.error}</p>}
  </div>;
}
