export interface EditingLabels {
  panel: string; saveAll: string; cancelAll: string; undo: string; redo: string;
  save: string; cancel: string; retry: string; rebase: string; search: string;
  loading: string; choose: string; empty: string;
  summary: (dirty: number, pending: number, invalid: number) => string;
  row: (id: string) => string;
  status: (status: string) => string;
}
export const defaultEditingLabels: EditingLabels = Object.freeze({
  panel: "Row editing", saveAll: "Save all", cancelAll: "Cancel all", undo: "Undo drafts", redo: "Redo drafts",
  save: "Save row", cancel: "Cancel row", retry: "Retry save", rebase: "Rebase draft", search: "Search",
  loading: "Loading choices", choose: "Choose an option", empty: "Choose a row to edit",
  summary: (dirty: number, pending: number, invalid: number) => `${dirty} dirty rows, ${pending} pending saves, ${invalid} invalid fields`,
  row: (id: string) => `Row ${id}`, status: (status: string) => status,
});
