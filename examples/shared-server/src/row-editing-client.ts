import { createRowEditingController, createRowEditingForm, type EditorField } from "@rowick/data/editing";

export interface EditableRecord { id: string; name: string; amount: number; money: string; date: string; active: boolean; notes: string; owner: string; revision: number; }
export const editingColumns = ["name", "amount", "money", "date", "active", "owner"].map((accessorKey) => ({ accessorKey: accessorKey as keyof EditableRecord }));
const choices = [{ value: "001", label: "Kim" }, { value: "002", label: "Lee" }, { value: "003", label: "Park" }];
export const editingFields: readonly EditorField[] = [
  { id: "name", label: "Name", kind: "text", required: true, maxLength: 80 },
  { id: "amount", label: "Amount", kind: "number", integer: true, min: 0, max: 10_000, required: true },
  { id: "money", label: "Money", kind: "currency", scale: 2, required: true },
  { id: "date", label: "Date", kind: "date", required: true },
  { id: "active", label: "Active", kind: "boolean" },
  { id: "notes", label: "Notes", kind: "long-text", maxLength: 2_000 },
  { id: "owner", label: "Owner", kind: "async-select", search: async (query, signal) => {
    await wait(30, signal); return choices.filter((choice) => choice.label.toLowerCase().includes(query.toLowerCase()));
  } },
];
function wait(delay: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) { reject(new DOMException("Cancelled", "AbortError")); return; }
    const cancel = () => { clearTimeout(timer); signal.removeEventListener("abort", cancel); reject(new DOMException("Cancelled", "AbortError")); };
    const timer = setTimeout(() => { signal.removeEventListener("abort", cancel); resolve(); }, delay);
    signal.addEventListener("abort", cancel, { once: true });
  });
}
export function createRowEditingExample() {
  let rows: readonly EditableRecord[] = ["a", "b"].map((id) => ({ id, name: id === "a" ? "Alpha" : "Beta", amount: 1,
    money: "9007199254740993.12", date: "2026-10-25", active: true, notes: "", owner: "001", revision: 1 }));
  const server = new Map(rows.map((row) => [row.id, row]));
  const listeners = new Set<() => void>(), held = new Set<() => void>();
  let holding = false, failNext = false, query = "one";
  const publish = () => { for (const listener of listeners) listener(); };
  const editor = createRowEditingController<EditableRecord>({
    getRow: (id) => rows.find((row) => row.id === id), getRowId: (row) => row.id, getValue: (row, id) => row[id as keyof EditableRecord],
    getVersion: (row) => row.revision, getContextKey: () => query, canEdit: (id, column) => !(id === "b" && column === "money"),
    applyValues: (row, values) => ({ ...row, ...values }),
    accept: (id, row) => { rows = rows.map((source) => source.id === id ? row : source); publish(); },
    validate: async (request) => {
      await wait(20, request.signal);
      return request.candidate.name.toLowerCase() === "invalid" ? { valid: false, errors: { name: "Name is unavailable" } } : { valid: true };
    },
    save: async (request) => {
      if (holding) await new Promise<void>((resolve, reject) => {
        const release = () => { request.signal.removeEventListener("abort", cancel); held.delete(release); resolve(); };
        const cancel = () => { held.delete(release); request.signal.removeEventListener("abort", cancel); reject(new DOMException("Cancelled", "AbortError")); };
        request.signal.addEventListener("abort", cancel, { once: true }); held.add(release);
      });
      await wait(60, request.signal);
      if (failNext && request.rowId === "b") { failNext = false; throw new Error("Temporary save failure"); }
      if (server.get(request.rowId)?.revision !== request.version) { const error = new Error("Revision conflict"); error.name = "ConflictError"; throw error; }
      const row = { ...request.candidate, name: request.candidate.name.trim(), revision: request.candidate.revision + 1 };
      server.set(request.rowId, row); return row;
    },
    classifyError: (error) => error instanceof Error && error.name === "ConflictError" ? "conflict" : "error",
  });
  const form = createRowEditingForm(editor, editingFields);
  const stop = editor.subscribe(publish);
  return {
    editor, form, getRows: () => rows, getProjectedRows: () => rows.map((row) => editor.project(row.id, row)),
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    begin: (id: string) => editor.begin(id),
    hold: () => { holding = true; }, release: () => { holding = false; for (const release of [...held]) release(); },
    failNext: () => { failNext = true; },
    externalUpdate: () => {
      const current = server.get("a")!, next = { ...current, amount: current.amount + 10, revision: current.revision + 1 };
      server.set("a", next); rows = rows.map((row) => row.id === "a" ? next : row); editor.reconcile(); publish();
    },
    changeQuery: () => { query = query === "one" ? "two" : "one"; editor.reconcile(); publish(); },
    paste: () => editor.setValues([{ rowId: "a", columnId: "name", value: "Pasted Alpha" }, { rowId: "b", columnId: "name", value: "Pasted Beta" }]),
    fill: () => editor.setValues(["a", "b"].map((rowId) => ({ rowId, columnId: "amount", value: 5 }))),
    dispose: () => { form.dispose(); stop(); editor.dispose(); listeners.clear(); held.clear(); },
  };
}
export type RowEditingExample = ReturnType<typeof createRowEditingExample>;
