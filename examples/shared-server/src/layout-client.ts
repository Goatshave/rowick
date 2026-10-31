import { createGrid, isISOCalendarDate, type AnyColumnDef } from "@rowick/core";
import { createGridLayoutController } from "@rowick/data/layout";
import { createRowEditingController, createRowEditingForm, type EditorField } from "@rowick/data/editing";
import { createAnalyticsExportJob, createDelimitedExporter, resolveExportMerges, type AnalyticsExportArtifact, type ExportCellType } from "@rowick/data/analytics";
import { createXlsxExporter } from "@rowick/export-xlsx";
export interface LayoutRecord { id: string; name: string; amount: number | ""; notes: string; money: string; date: string; active: boolean; [key: string]: unknown; }
export const layoutColumnIds = ["name", "amount", "notes", "money", "date", "active", ...Array.from({ length: 14 }, (_, index) => `c${index}`)];
const labels: Record<string, string> = { name: "Name", amount: "Amount", notes: "Notes", money: "Money", date: "Date", active: "Active" };
export const layoutColumns: AnyColumnDef<LayoutRecord>[] = layoutColumnIds.map((id) => ({ id, accessorKey: id, header: labels[id] ?? `Column ${id.slice(1)}`, size: id === "name" ? 200 : id === "notes" ? 240 : id === "money" ? 220 : 130,
  enableEditing: !["active", "c13"].includes(id), ...(id === "c13" ? { meta: { sensitive: true } } : {}),
  ...(id === "amount" ? { editValueParser: (text: string) => text === "" ? "" : Number(text), validateEditValue: (value: unknown) => value === "" || typeof value === "number" && Number.isFinite(value) && value >= 0 && (!Number.isInteger(value) || Number.isSafeInteger(value)) || "Amount must be a non-negative safe number" } : {}),
  ...(id === "money" ? { validateEditValue: (value: unknown) => typeof value === "string" && (value === "" || /^\d+(?:\.\d{1,2})?$/.test(value)) || "Money requires an exact decimal string" } : {}),
  ...(id === "date" ? { validateEditValue: (value: unknown) => typeof value === "string" && (value === "" || isISOCalendarDate(value) && Number(value.slice(0, 4)) > 0) || "Use a valid YYYY-MM-DD date" } : {}),
}));
const fields: readonly EditorField[] = [{ id: "name", label: "Name", kind: "text" }, { id: "amount", label: "Amount", kind: "number", min: 0 }, { id: "notes", label: "Notes", kind: "long-text" }, { id: "money", label: "Money", kind: "currency", scale: 2 }, { id: "date", label: "Date", kind: "date" }];
export function createLayoutExample(direction: "ltr" | "rtl" = "ltr") {
  let rows: readonly LayoutRecord[] = Array.from({ length: 10_000 }, (_, index) => ({ id: `row-${String(index + 1).padStart(5, "0")}`, name: `Row ${String(index + 1).padStart(5, "0")}`, amount: index + 1,
    notes: `Note ${index + 1}`, money: `${9007199254740993n + BigInt(index)}.12`, date: "2026-10-25", active: index % 2 === 0,
    ...Object.fromEntries(Array.from({ length: 14 }, (_, column) => [`c${column}`, column === 13 ? "authorized-private-value" : `${index + 1}:${column}`])) }));
  const byId = new Map(rows.map((row) => [row.id, row])), expanded = new Set<string>(), listeners = new Set<() => void>();
  const publish = () => { for (const listener of [...listeners]) listener(); };
  const grid = createGrid<LayoutRecord>({ data: rows, columns: layoutColumns, getRowId: (row) => row.id, initialState: { pagination: { pageIndex: 0, pageSize: 10_000 }, columnPinning: { left: ["name"], right: ["c13"] } } });
  const updateRows = (next: readonly LayoutRecord[]) => { rows = next; byId.clear(); for (const row of rows) byId.set(row.id, row); grid.setOptions((previous) => ({ ...previous, data: rows })); };
  const editor = createRowEditingController<LayoutRecord>({ getRow: (id) => byId.get(id), getRowId: (row) => row.id, getValue: (row, id) => row[id], applyValues: (row, values) => ({ ...row, ...values }),
    canEdit: (id, column) => !["active", "c13"].includes(column) && !(id === "row-00002" && column === "amount"),
    accept: (id, row) => updateRows(rows.map((source) => source.id === id ? row : source)), maxDraftRows: 1000, maxFieldsPerRow: 20,
    validate: ({ candidate }) => candidate.name === "invalid" ? { valid: false, errors: { name: "Name is unavailable" } } : { valid: true },
  });
  const form = createRowEditingForm(editor, fields), layout = createGridLayoutController(grid, { direction, editing: editor, acceptReorder: updateRows,
    getRowHeight: (row) => 44 + Number(row.id.slice(-5)) % 3 * 12, getDetailText: (row) => `Notes for ${row.id}`, maxClipboardCells: 10_000 });
  const stop = layout.subscribe(publish); let sourceRevision = 0;
  const actions = [
    ["Apply sample merges", () => layout.setSpans([{ rowIds: ["row-00001", "row-00002"], columnIds: ["name"] }, { rowIds: ["row-00003"], columnIds: direction === "rtl" ? ["c1", "c0"] : ["c0", "c1"] }])],
    ["Select first block", () => layout.select({ rowId: "row-00001", columnId: "name" }, { rowId: "row-00002", columnId: "name" })],
    ["Add second range", () => layout.select({ rowId: "row-00004", columnId: "name" }, undefined, true)],
    ["Sort names descending", () => grid.setSorting([{ id: "name", desc: true }])], ["Filter first row", () => grid.setGlobalFilter("Row 00001")],
    ["Reset query", () => { grid.setSorting([]); grid.setGlobalFilter(""); }], ["Save all drafts", () => editor.commitAll()], ["Discard all drafts", () => editor.cancelAll()],
    ["Open typed row panel", () => editor.begin(layout.getState().focusedCell?.rowId ?? "row-00001")],
  ] as const;
  const jobs = new Set<ReturnType<typeof createAnalyticsExportJob>>();
  return { grid, editor, form, layout, actions, direction,
    getRows: () => rows, getSummary: () => rows.slice(0, 5).map((row) => ({ id: row.id, name: editor.getValue(row.id, "name"), amount: editor.getValue(row.id, "amount"), notes: editor.getValue(row.id, "notes") })),
    getNote: (id: string) => String(editor.getValue(id, "notes") ?? ""), setNote: (id: string, text: string) => editor.setValue(id, "notes", text),
    getExpanded: (id: string) => expanded.has(id), toggleExpanded: (id: string) => { if (expanded.has(id)) expanded.delete(id); else { if (expanded.size >= 100) throw new RangeError("Too many expanded details"); expanded.add(id); } publish(); },
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    updateFirstRowNotes: () => { sourceRevision++; updateRows(rows.map((row, index) => index === 0 ? { ...row, notes: `Source update ${sourceRevision}` } : row)); },
    export: async (format: "csv" | "xlsx", scope: "range" | "page" = "range"): Promise<AnalyticsExportArtifact> => {
      const snapshot = layout.getExportSnapshot({ scope, ...(scope === "range" ? { rangeIndex: 0 } : {}), maxCells: 250_000 });
      const columns = snapshot.columnIds.map((id, index) => { const type: ExportCellType = id === "amount" ? "number" : id === "money" ? "decimal" : id === "date" ? "date" : id === "active" ? "boolean" : "text"; return { id, label: labels[id] ?? `Column ${id.slice(1)}`, type, getValue: (row: readonly unknown[]) => row[index] === "" && type !== "text" ? null : row[index] }; });
      const job = createAnalyticsExportJob({ rows: snapshot.values, columns, scope: scope === "range" ? "selection" : "page", totalRows: snapshot.rowIds.length, revision: String(snapshot.revision), getCurrentRevision: () => String(layout.getState().operationRevision), merges: resolveExportMerges(snapshot.spans, snapshot.rowIds, snapshot.columnIds, snapshot.rowIds, snapshot.columnIds, 1) },
        { exporter: format === "xlsx" ? createXlsxExporter({ filename: "layout-selection", maxCells: 250_000 }) : createDelimitedExporter({ filename: "layout-selection.csv" }), maxCells: 250_000, maxRows: 10_000, maxColumns: 20, title: "Current layout" });
      jobs.add(job); try { return await job.start(); } finally { jobs.delete(job); job.dispose(); }
    },
    dispose: () => { for (const job of jobs) job.dispose(); jobs.clear(); stop(); layout.dispose(); form.dispose(); editor.dispose(); listeners.clear(); },
  };
}
export type LayoutExample = ReturnType<typeof createLayoutExample>;
export function downloadLayoutArtifact(artifact: AnalyticsExportArtifact) { const blob = new Blob([new Uint8Array(artifact.bytes)], { type: artifact.mimeType }), url = URL.createObjectURL(blob), link = document.createElement("a"); link.href = url; link.download = artifact.filename; document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 0); }
export interface LayoutTestBridge { setVisible: (visible: boolean) => void; updateFirstRowNotes: () => void; }
/** Example-only opt-in hooks for immutable source updates and renderer remount regressions. */
export function installLayoutTestBridge(source: LayoutExample, setVisible: (visible: boolean) => void): () => void {
  if (new URLSearchParams(location.search).get("test") !== "1") return () => {};
  const target = window as unknown as { __ROWICK_LAYOUT_TEST__?: LayoutTestBridge };
  const bridge: LayoutTestBridge = { setVisible, updateFirstRowNotes: source.updateFirstRowNotes };
  target.__ROWICK_LAYOUT_TEST__ = bridge; return () => { if (target.__ROWICK_LAYOUT_TEST__ === bridge) delete target.__ROWICK_LAYOUT_TEST__; };
}
