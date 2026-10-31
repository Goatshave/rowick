import type { ServerSelection } from "@rowick/core";
export type ExportCellType = "text" | "number" | "boolean" | "decimal" | "date" | "datetime";
export type AnalyticsExportValue = string | number | boolean | null;
export interface AnalyticsExportCell { readonly value: AnalyticsExportValue; readonly type: ExportCellType; readonly format?: string; }
export interface AnalyticsExportColumn<TData> {
  readonly id: string; readonly label: string; readonly headers?: readonly string[]; readonly type?: ExportCellType; readonly format?: string;
  readonly sensitive?: boolean; readonly exportable?: boolean; readonly getValue: (row: TData) => unknown;
}
export interface ExportMerge { readonly startRow: number; readonly startColumn: number; readonly rowSpan: number; readonly columnSpan: number; }
export type AnalyticsExportScope = "all" | "filtered" | "page" | "selection" | "pivot";
export interface AnalyticsExportDocument {
  readonly title: string; readonly scope: AnalyticsExportScope;
  readonly columns: readonly { readonly id: string; readonly label: string; readonly headers: readonly string[] }[];
  readonly headers: readonly (readonly string[])[];
  readonly rows: readonly (readonly AnalyticsExportCell[])[];
  readonly merges: readonly ExportMerge[];
}
export interface AnalyticsExportArtifact { readonly filename: string; readonly mimeType: string; readonly bytes: Uint8Array; }
export interface AnalyticsExporterContext { readonly signal: AbortSignal; readonly progress: (fraction: number) => void; }
export type AnalyticsExporter = (document: AnalyticsExportDocument, context: AnalyticsExporterContext) => AnalyticsExportArtifact | Promise<AnalyticsExportArtifact>;
export interface AnalyticsExportSource<TData> {
  readonly rows: Iterable<TData> | AsyncIterable<TData>;
  readonly columns: readonly AnalyticsExportColumn<TData>[];
  readonly scope: AnalyticsExportScope;
  readonly totalRows?: number;
  readonly revision?: string;
  readonly getCurrentRevision?: () => string;
  /** Merges use final exported column coordinates and include the header offset. */
  readonly merges?: readonly ExportMerge[];
}
export interface AnalyticsExportOptions<TData> {
  readonly exporter: AnalyticsExporter;
  readonly title?: string;
  readonly maxRows?: number; readonly maxColumns?: number; readonly maxCells?: number; readonly maxTextCharacters?: number;
  readonly maxArtifactBytes?: number;
  readonly includeSensitive?: boolean;
  readonly authorizeColumn?: (column: AnalyticsExportColumn<TData>) => boolean;
  readonly authorizeRow?: (row: TData) => boolean;
  readonly onListenerError?: (error: unknown) => void;
}
export interface AnalyticsExportState { readonly status: "idle" | "collecting" | "encoding" | "success" | "cancelled" | "error"; readonly rowsProcessed: number; readonly totalRows: number | undefined; readonly progress: number | undefined; readonly error: string | undefined; }
export interface AnalyticsExportJob {
  getState: () => AnalyticsExportState;
  start: () => Promise<AnalyticsExportArtifact>;
  cancel: () => void;
  subscribe: (listener: () => void) => () => void;
  dispose: () => void;
}
function abortable<T>(operation: PromiseLike<T> | T, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(interrupted());
  return new Promise<T>((resolve, reject) => {
    const cancel = () => { signal.removeEventListener("abort", cancel); reject(interrupted()); };
    signal.addEventListener("abort", cancel, { once: true });
    Promise.resolve(operation).then((value) => { signal.removeEventListener("abort", cancel); resolve(value); }, (error) => { signal.removeEventListener("abort", cancel); reject(error); });
  });
}
const interrupted = () => new DOMException("Export cancelled", "AbortError");
export function assertExportText(value: string): void {
  if (value.length > 32_767) throw new RangeError("Export cell text exceeds 32,767 characters");
  for (const character of value) {
    const code = character.codePointAt(0)!;
    if (code < 32 && ![9, 10, 13].includes(code) || code >= 0xD800 && code <= 0xDFFF || code === 0xFFFE || code === 0xFFFF) throw new TypeError("Export text contains illegal XML characters");
  }
}
function calendar(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const year = Number(value.slice(0, 4)), month = Number(value.slice(5, 7)), day = Number(value.slice(8)), leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return year >= 1900 && month >= 1 && month <= 12 && day >= 1 && day <= days[month - 1]!;
}
function normalizeCell(value: unknown, type: ExportCellType | undefined, format: string | undefined): AnalyticsExportCell {
  const inferred = type ?? (typeof value === "number" ? "number" : typeof value === "boolean" ? "boolean" : "text");
  if (!["text", "number", "boolean", "decimal", "date", "datetime"].includes(inferred)) throw new TypeError("Unsupported export cell type");
  if (format !== undefined) { if (typeof format !== "string" || format.length > 255) throw new TypeError("Invalid export number format"); assertExportText(format); }
  if (value == null) return Object.freeze({ value: null, type: inferred, ...(format !== undefined ? { format } : {}) });
  if (inferred === "datetime" && value instanceof Date && Number.isFinite(value.getTime())) value = value.toISOString();
  if (inferred === "number" && (typeof value !== "number" || !Number.isFinite(value) || Number.isInteger(value) && !Number.isSafeInteger(value))) throw new TypeError("Export number must be finite and preserve safe integer precision");
  if (inferred === "boolean" && typeof value !== "boolean") throw new TypeError("Export boolean must remain a boolean");
  if (inferred === "decimal" && (typeof value !== "string" || !/^[+-]?\d+(?:\.\d+)?$/.test(value))) throw new TypeError("Exact decimal exports require decimal strings");
  if (inferred === "date" && !calendar(value)) throw new TypeError("Export date requires a valid YYYY-MM-DD calendar date in 1900–9999");
  if (inferred === "datetime" && (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value) || !calendar(value.slice(0, 10)) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().replace(".000Z", "Z") !== value.replace(".000Z", "Z"))) throw new TypeError("Export datetime requires an explicit UTC ISO timestamp");
  if (inferred === "text" && !["string", "number", "boolean", "bigint"].includes(typeof value)) throw new TypeError("Export text requires an explicit scalar value");
  const normalized = inferred === "text" ? String(value) : value as AnalyticsExportValue;
  if (typeof normalized === "string") assertExportText(normalized);
  return Object.freeze({ value: normalized, type: inferred, ...(format !== undefined ? { format } : {}) });
}
/** Numeric coordinates are zero-based and cover header + data rows. */
export function validateExportMerges(merges: readonly ExportMerge[], rowCount: number, columnCount: number, headerRows = 0): readonly ExportMerge[] {
  if (!Number.isSafeInteger(headerRows) || headerRows < 0 || headerRows > rowCount) throw new TypeError("Invalid export header boundary");
  if (!Array.isArray(merges) || merges.length > 10_000) throw new RangeError("Too many export merges");
  const occupied = new Set<number>(), result: ExportMerge[] = [];
  for (const merge of merges) {
    if (!merge || [merge.startRow, merge.startColumn, merge.rowSpan, merge.columnSpan].some((value) => !Number.isSafeInteger(value)) || merge.startRow < 0 || merge.startColumn < 0 || merge.rowSpan < 1 || merge.columnSpan < 1 || merge.startRow + merge.rowSpan > rowCount || merge.startColumn + merge.columnSpan > columnCount) throw new TypeError("Export merge is outside its document");
    if (merge.startRow < headerRows && merge.startRow + merge.rowSpan > headerRows) throw new TypeError("Export merge crosses the header/data boundary");
    if (merge.rowSpan * merge.columnSpan > 1_000_000) throw new RangeError("Export merge area is too large");
    for (let row = merge.startRow; row < merge.startRow + merge.rowSpan; row++) for (let column = merge.startColumn; column < merge.startColumn + merge.columnSpan; column++) {
      const key = row * columnCount + column; if (occupied.has(key)) throw new TypeError("Export merges overlap"); occupied.add(key);
      if (occupied.size > 1_000_000) throw new RangeError("Export merge area limit reached");
    }
    result.push(Object.freeze({ startRow: merge.startRow, startColumn: merge.startColumn, rowSpan: merge.rowSpan, columnSpan: merge.columnSpan }));
  }
  return Object.freeze(result);
}
/** Reject partial/noncontiguous spans when selection, filtering or sensitive columns split a merge. */
export function resolveExportMerges(
  spans: readonly { readonly start: { readonly rowId: string; readonly columnId: string }; readonly rowSpan: number; readonly columnSpan: number }[],
  sourceRowIds: readonly string[], sourceColumnIds: readonly string[], exportedRowIds: readonly string[], exportedColumnIds: readonly string[], headerRows = 1,
): readonly ExportMerge[] {
  if (!Array.isArray(spans) || spans.length > 10_000 || sourceRowIds.length > 1_000_000 || exportedRowIds.length > 1_000_000 || sourceColumnIds.length > 16_384 || exportedColumnIds.length > 16_384) throw new RangeError("Export span metadata limit reached");
  const index = (values: readonly string[]) => { if (values.some((id) => typeof id !== "string" || !id.length)) throw new TypeError("Export identities must be non-empty strings"); const map = new Map(values.map((id, position) => [id, position])); if (map.size !== values.length) throw new TypeError("Export identities must be unique"); return map; };
  const sourceRows = index(sourceRowIds), sourceColumns = index(sourceColumnIds), targetRows = index(exportedRowIds), targetColumns = index(exportedColumnIds);
  if (!Number.isSafeInteger(headerRows) || headerRows < 0 || headerRows > 16) throw new TypeError("Invalid export header depth");
  const merges: ExportMerge[] = []; let resolutionWork = 0;
  for (const span of spans) {
    const row = sourceRows.get(span.start.rowId), column = sourceColumns.get(span.start.columnId);
    if (row === undefined || column === undefined || !Number.isSafeInteger(span.rowSpan) || !Number.isSafeInteger(span.columnSpan) || span.rowSpan < 1 || span.columnSpan < 1 || row + span.rowSpan > sourceRowIds.length || column + span.columnSpan > sourceColumnIds.length) throw new TypeError("Invalid source export span");
    if ((resolutionWork += span.rowSpan + span.columnSpan) > 1_000_000) throw new RangeError("Export span resolution budget reached");
    const rows = sourceRowIds.slice(row, row + span.rowSpan).map((id) => targetRows.get(id)), columns = sourceColumnIds.slice(column, column + span.columnSpan).map((id) => targetColumns.get(id));
    if (rows.every((id) => id === undefined) || columns.every((id) => id === undefined)) continue;
    if (rows.some((id, position) => id === undefined || id !== rows[0]! + position) || columns.some((id, position) => id === undefined || id !== columns[0]! + position)) throw new TypeError("Export scope splits or reorders a merged range");
    merges.push({ startRow: rows[0]! + headerRows, startColumn: columns[0]!, rowSpan: rows.length, columnSpan: columns.length });
  }
  return validateExportMerges(merges, exportedRowIds.length + headerRows, exportedColumnIds.length);
}
function headerRows(columns: readonly { headers: readonly string[] }[]) {
  const depth = Math.max(1, ...columns.map((column) => column.headers.length));
  const rows = Array.from({ length: depth }, () => Array<string>(columns.length).fill("")), merges: ExportMerge[] = [];
  columns.forEach((column, index) => column.headers.forEach((text, row) => { rows[row]![index] = text; }));
  for (let row = 0; row < depth; row++) for (let column = 0; column < columns.length; column++) {
    const path = columns[column]!.headers;
    if (path.length <= row) continue;
    if (path.length === row + 1) { if (depth - row > 1) merges.push({ startRow: row, startColumn: column, rowSpan: depth - row, columnSpan: 1 }); continue; }
    let end = column + 1;
    while (end < columns.length && columns[end]!.headers.length > row + 1 && path.slice(0, row + 1).every((value, index) => columns[end]!.headers[index] === value)) end++;
    if (end - column > 1) { merges.push({ startRow: row, startColumn: column, rowSpan: 1, columnSpan: end - column }); for (let covered = column + 1; covered < end; covered++) rows[row]![covered] = ""; }
    column = end - 1;
  }
  return { headers: Object.freeze(rows.map((row) => Object.freeze(row))), merges };
}
export function createAnalyticsExportJob<TData>(source: AnalyticsExportSource<TData>, options: AnalyticsExportOptions<TData>): AnalyticsExportJob {
  const bounded = (input: number | undefined, fallback: number, maximum: number) => { const value = input ?? fallback; if (!Number.isSafeInteger(value) || value < 1 || value > maximum) throw new TypeError("Invalid export limit"); return value; };
  const maxRows = bounded(options.maxRows, 100_000, 1_000_000), maxColumns = bounded(options.maxColumns, 1_000, 16_384), maxCells = bounded(options.maxCells, 1_000_000, 5_000_000), maxText = bounded(options.maxTextCharacters, 16_000_000, 64_000_000);
  const maxArtifact = bounded(options.maxArtifactBytes, 64_000_000, 512_000_000);
  if (!["all", "filtered", "page", "selection", "pivot"].includes(source.scope) || typeof options.exporter !== "function" || source.totalRows !== undefined && (!Number.isSafeInteger(source.totalRows) || source.totalRows < 0)) throw new TypeError("Invalid export source");
  if (source.totalRows !== undefined && source.totalRows > maxRows) throw new RangeError("Export row limit reached; use a server export");
  let dataSource: AnalyticsExportSource<TData> | undefined = source, exporter: AnalyticsExporter | undefined = options.exporter;
  const listeners = new Set<() => void>(), abort = new AbortController(); let disposed = false, promise: Promise<AnalyticsExportArtifact> | undefined;
  let state: AnalyticsExportState = Object.freeze({ status: "idle", rowsProcessed: 0, totalRows: source.totalRows, progress: source.totalRows === undefined ? undefined : 0, error: undefined });
  const publish = (next: AnalyticsExportState) => {
    if (disposed) return; state = Object.freeze(next);
    for (const listener of [...listeners]) if (listeners.has(listener)) try { listener(); } catch (error) { if (options.onListenerError) { try { options.onListenerError(error); } catch (failure) { queueMicrotask(() => { throw failure; }); } } else queueMicrotask(() => { throw error; }); }
  };
  const check = () => { if (disposed || abort.signal.aborted) throw interrupted(); if (dataSource?.revision !== undefined && dataSource.getCurrentRevision && dataSource.getCurrentRevision() !== dataSource.revision) throw new Error("Export source revision changed; retry from a current snapshot"); };
  const job: AnalyticsExportJob = {
    getState: () => state,
    start: () => {
      if (disposed) throw new Error("Export job is disposed"); if (promise) return promise;
      promise = Promise.resolve().then(async () => {
        const current = dataSource!; check(); const seen = new Set<string>();
        const selected = current.columns.filter((column) => {
          if (!column || typeof column.id !== "string" || !column.id.length || seen.has(column.id) || typeof column.getValue !== "function") throw new TypeError("Invalid or duplicate export column");
          seen.add(column.id);
          const authorized = options.authorizeColumn?.(column);
          return column.exportable !== false && (!column.sensitive || options.includeSensitive === true && authorized === true) && authorized !== false;
        });
        if (!selected.length || selected.length > maxColumns) throw new RangeError("Export has no allowed columns or exceeds its column limit");
        const columns = Object.freeze(selected.map((column) => {
          const headers = column.headers?.length ? [...column.headers] : [column.label];
          if (headers.length > 16 || headers.some((text) => typeof text !== "string" || text.length > 1_000)) throw new TypeError("Invalid export headers");
          headers.forEach(assertExportText); assertExportText(column.label);
          return Object.freeze({ id: column.id, label: column.label, headers: Object.freeze(headers) });
        }));
        const header = headerRows(columns), rows: AnalyticsExportCell[][] = []; let textCharacters = header.headers.flat().reduce((total, value) => total + value.length, 0);
        if (header.headers.length * columns.length > maxCells || textCharacters > maxText) throw new RangeError("Export header cell/text limit reached; use server processing");
        publish({ ...state, status: "collecting" });
        const iterable = current.rows as AsyncIterable<TData> & Iterable<TData>;
        const iterator = iterable[Symbol.asyncIterator]?.() ?? iterable[Symbol.iterator]?.();
        if (!iterator) throw new TypeError("Export source must be iterable");
        let completed = false;
        try { while (true) {
          check();
          const next = await abortable(iterator.next(), abort.signal); check(); if (next.done) { completed = true; break; } const row = next.value;
          if (options.authorizeRow?.(row) === false) throw new Error("Export row authorization changed");
          if (rows.length >= maxRows || (rows.length + 1 + header.headers.length) * columns.length > maxCells || textCharacters > maxText) throw new RangeError("Export row/cell/text limit reached; use server processing");
          const cells = selected.map((column) => {
            if (column.exportable === false || column.sensitive && !(options.includeSensitive === true && options.authorizeColumn?.(column) === true) || options.authorizeColumn?.(column) === false) throw new Error("Export column authorization changed");
            const cell = normalizeCell(column.getValue(row), column.type, column.format);
            if (typeof cell.value === "string" && (textCharacters += cell.value.length) > maxText) throw new RangeError("Export text budget reached");
            return cell;
          });
          rows.push(cells);
          if (rows.length % 200 === 0) { publish({ ...state, rowsProcessed: rows.length, progress: current.totalRows ? Math.min(.8, rows.length / current.totalRows * .8) : undefined }); await new Promise<void>((resolve) => setTimeout(resolve, 0)); }
        } } finally { if (!completed && iterator.return) { try { void Promise.resolve(iterator.return()).catch(() => {}); } catch { /* Preserve the original error/cancellation. */ } } }
        check();
        for (const column of selected) if (column.exportable === false || column.sensitive && !(options.includeSensitive === true && options.authorizeColumn?.(column) === true) || options.authorizeColumn?.(column) === false) throw new Error("Export column authorization changed");
        if (current.merges?.some((merge) => merge.startRow < header.headers.length)) throw new TypeError("Source body merges must follow the export headers");
        const merges = validateExportMerges([...header.merges, ...(current.merges ?? [])], rows.length + header.headers.length, columns.length, header.headers.length);
        // Covered values are not visible in the grid and must not leak via an unmerged exporter.
        for (const merge of merges) for (let row = Math.max(header.headers.length, merge.startRow); row < merge.startRow + merge.rowSpan; row++) for (let column = merge.startColumn; column < merge.startColumn + merge.columnSpan; column++) {
          if (row !== merge.startRow || column !== merge.startColumn) rows[row - header.headers.length]![column] = Object.freeze({ type: "text", value: null });
        }
        const document: AnalyticsExportDocument = Object.freeze({ title: options.title ?? "Rowick export", scope: current.scope, columns, headers: header.headers,
          rows: Object.freeze(rows.map((row) => Object.freeze(row))), merges });
        assertExportText(document.title); const encodeDocument = exporter!; publish({ ...state, status: "encoding", rowsProcessed: rows.length, progress: .8 }); check();
        const result = await abortable(encodeDocument(document, { signal: abort.signal, progress: (fraction) => { check(); if (!Number.isFinite(fraction) || fraction < 0 || fraction > 1 || .8 + .2 * fraction < (state.progress ?? 0)) throw new TypeError("Invalid export progress"); publish({ ...state, progress: .8 + .2 * fraction }); } }), abort.signal);
        check(); if (!result || !(result.bytes instanceof Uint8Array) || !result.filename || !result.mimeType) throw new TypeError("Invalid exporter result");
        if (result.bytes.length > maxArtifact) throw new RangeError("Export artifact byte budget reached");
        publish({ ...state, status: "success", progress: 1 }); return result;
      }).catch((error: unknown) => {
        publish({ ...state, status: abort.signal.aborted || disposed ? "cancelled" : "error", error: error instanceof Error ? error.message : "Export failed" }); throw error;
      });
      return promise;
    },
    cancel: () => { if (["idle", "collecting", "encoding"].includes(state.status)) { abort.abort(); publish({ ...state, status: "cancelled", error: "Export cancelled" }); } },
    subscribe: (listener) => { if (disposed) throw new Error("Export job is disposed"); listeners.add(listener); return () => { listeners.delete(listener); }; },
    dispose: () => { if (disposed) return; job.cancel(); disposed = true; abort.abort(); listeners.clear(); dataSource = undefined; exporter = undefined; promise = undefined; },
  };
  return job;
}
const xml = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
export function createDelimitedExporter(options: { readonly delimiter?: "," | "\t"; readonly filename?: string; readonly protectFormulaText?: boolean } = {}): AnalyticsExporter {
  const delimiter = options.delimiter ?? ",";
  if (delimiter !== "," && delimiter !== "\t") throw new TypeError("Unsupported export delimiter");
  return async (document, context) => {
    const quote = (value: AnalyticsExportValue, type: ExportCellType = "text") => {
      let text = value === null ? "" : String(value);
      if (type !== "number" && type !== "boolean" && options.protectFormulaText !== false && /^\s*[=+\-@]/.test(text)) text = "'" + text;
      return /["\r\n]/.test(text) || text.includes(delimiter) ? '"' + text.replace(/"/g, '""') + '"' : text;
    };
    const lines = document.headers.map((row) => row.map((value) => quote(value)).join(delimiter));
    for (let index = 0; index < document.rows.length; index++) { const row = document.rows[index]!; if (context.signal.aborted) throw interrupted(); lines.push(row.map((cell) => quote(cell.value, cell.type)).join(delimiter)); if (index % 200 === 0) { context.progress(index / Math.max(1, document.rows.length)); await new Promise<void>((resolve) => setTimeout(resolve, 0)); } }
    context.progress(1); return { filename: sanitizeExportFilename(options.filename ?? "rowick-export", delimiter === "," ? "csv" : "tsv"), mimeType: delimiter === "," ? "text/csv;charset=utf-8" : "text/tab-separated-values;charset=utf-8", bytes: new TextEncoder().encode("\uFEFF" + lines.join("\r\n")) };
  };
}
export function sanitizeExportFilename(name: string, extension: string): string {
  if (!/^[a-zA-Z0-9]{1,12}$/.test(extension)) throw new TypeError("Invalid export file extension");
  const basename = name.trim().replace(/[<>:"/\\|?*\x00-\x1f]+/g, "-").replace(/\.+$/g, "").slice(0, 180) || "rowick-export";
  return basename.toLowerCase().endsWith(`.${extension}`) ? basename : `${basename}.${extension}`;
}
/** Standalone HTML can be downloaded/opened and printed without popup permissions. */
export const createPrintExporter = (options: { readonly filename?: string; readonly orientation?: "portrait" | "landscape" } = {}): AnalyticsExporter => async (document, context) => {
  const occupied = new Map<string, ExportMerge>(), hidden = new Set<string>();
  for (const merge of validateExportMerges(document.merges, document.headers.length + document.rows.length, document.columns.length, document.headers.length)) {
    occupied.set(`${merge.startRow}:${merge.startColumn}`, merge);
    for (let row = merge.startRow; row < merge.startRow + merge.rowSpan; row++) for (let column = merge.startColumn; column < merge.startColumn + merge.columnSpan; column++) if (row !== merge.startRow || column !== merge.startColumn) hidden.add(`${row}:${column}`);
  }
  const renderRow = (values: readonly string[], row: number, header: boolean) => `<tr>${values.map((value, column) => {
    if (hidden.has(`${row}:${column}`)) return ""; const merge = occupied.get(`${row}:${column}`), tag = header ? "th" : "td";
    return `<${tag}${header ? ' scope="col"' : ""}${merge ? ` rowspan="${merge.rowSpan}" colspan="${merge.columnSpan}"` : ""}>${xml(value)}</${tag}>`;
  }).join("")}</tr>`;
  const headers = document.headers.map((row, index) => renderRow(row, index, true));
  const body: string[] = [];
  for (let index = 0; index < document.rows.length; index++) { const row = document.rows[index]!; if (context.signal.aborted) throw interrupted(); body.push(renderRow(row.map((cell) => cell.value === null ? "" : String(cell.value)), index + document.headers.length, false)); if (index % 200 === 0) { context.progress(index / Math.max(1, document.rows.length)); await new Promise<void>((resolve) => setTimeout(resolve, 0)); } }
  context.progress(1);
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${xml(document.title)}</title><style>@page{size:A4 ${options.orientation === "landscape" ? "landscape" : "portrait"};margin:12mm}body{font:12px system-ui;color:#111}table{border-collapse:collapse;width:100%}th,td{border:1px solid #888;padding:5px;text-align:start;white-space:pre-wrap}thead{display:table-header-group}tr{break-inside:avoid}@media print{button{display:none}}</style></head><body><h1>${xml(document.title)}</h1><p>${xml(document.scope)}: ${document.rows.length} rows</p><table><thead>${headers.join("")}</thead><tbody>${body.join("")}</tbody></table></body></html>`;
  return { filename: sanitizeExportFilename(options.filename ?? "rowick-print", "html"), mimeType: "text/html;charset=utf-8", bytes: new TextEncoder().encode(html) };
};

export interface ServerAnalyticsExportRequest<TQuery> { readonly version: 1; readonly queryKey: string; readonly query: Readonly<TQuery>; readonly selection: ServerSelection<TQuery> | null; readonly columns: readonly string[]; readonly format: "csv" | "tsv" | "xlsx"; readonly maxRows: number; }
/** Captures a bounded immutable request. The endpoint must independently authorize and resolve live data. */
export function createServerAnalyticsExportRequest<TQuery>(options: { queryKey: string; query: TQuery; selection?: ServerSelection<TQuery>; columns: readonly string[]; allowedColumns: readonly string[]; format: "csv" | "tsv" | "xlsx"; maxRows?: number }): ServerAnalyticsExportRequest<TQuery> {
  if (typeof options.queryKey !== "string" || !options.queryKey.length || options.queryKey.length > 2_000 || !["csv", "tsv", "xlsx"].includes(options.format) || !options.columns.length || options.columns.length > 1_000 || new Set(options.columns).size !== options.columns.length || options.columns.some((id) => typeof id !== "string" || !id.length || !options.allowedColumns.includes(id))) throw new TypeError("Invalid server export request");
  const selection = options.selection ?? null;
  if (selection) {
    const ids = selection.mode === "explicit" ? selection.ids : selection.mode === "all-matching" ? selection.excludedIds : undefined;
    if (!Array.isArray(ids) || ids.length > 10_000 || new Set(ids).size !== ids.length || ids.some((id) => typeof id !== "string" || !id.length) || selection.queryKey !== options.queryKey || JSON.stringify(selection.query) !== JSON.stringify(options.query)) throw new TypeError("Export selection does not match its query");
  }
  const maxRows = options.maxRows ?? 100_000; if (!Number.isSafeInteger(maxRows) || maxRows < 1 || maxRows > 1_000_000) throw new TypeError("Invalid server export row limit");
  const ancestors = new Set<object>(); let nodes = 0;
  const validate = (value: unknown, depth: number) => {
    if (++nodes > 50_000 || depth > 16) throw new RangeError("Server export request is too large");
    if (value === null || typeof value === "string" || typeof value === "boolean" || typeof value === "number" && Number.isFinite(value)) return;
    if (!value || typeof value !== "object" || ancestors.has(value) || !Array.isArray(value) && ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw new TypeError("Server export requests require finite JSON values");
    ancestors.add(value); for (const child of Object.values(value)) validate(child, depth + 1); ancestors.delete(value);
  };
  const request = { version: 1, queryKey: options.queryKey, query: options.query, selection, columns: [...options.columns], format: options.format, maxRows };
  validate(request, 0); const json = JSON.stringify(request); if (json.length > 262_144) throw new RangeError("Server export request is too large");
  const captured = JSON.parse(json) as ServerAnalyticsExportRequest<TQuery>;
  const freeze = (value: unknown): void => { if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); } }; freeze(captured); return captured;
}
