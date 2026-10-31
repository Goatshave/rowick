import { createPivot, parsePivotConfiguration, serializePivotConfiguration, validatePivotConfiguration, type PivotConfiguration, type PivotColumn, type PivotField, type PivotLimits, type PivotMetric, type PivotResult, type PivotRow } from "./analytics-pivot";
import { createAnalyticsExportJob, createDelimitedExporter, createPrintExporter, type AnalyticsExportArtifact, type AnalyticsExportColumn, type AnalyticsExporter, type AnalyticsExportJob, type AnalyticsExportSource, type AnalyticsExportState } from "./analytics-export";
export interface AnalyticsControllerState {
  readonly draft: PivotConfiguration; readonly result: PivotResult; readonly pageIndex: number; readonly pageCount: number; readonly pageRows: readonly PivotRow[];
  readonly columnPageIndex: number; readonly columnPageCount: number; readonly pageColumns: readonly PivotColumn[];
  readonly error: string | undefined; readonly message: string | undefined; readonly exportState: AnalyticsExportState | undefined; readonly formats: readonly string[];
}
export interface AnalyticsController<TData> {
  readonly fields: readonly Pick<PivotField<TData>, "id" | "label">[];
  getState: () => AnalyticsControllerState;
  setAxes: (axis: "rows" | "columns", ids: readonly string[]) => boolean;
  setMetrics: (metrics: readonly PivotMetric[]) => boolean;
  setTotals: (subtotals: boolean, rowTotals: boolean) => boolean;
  setSorting: (sort: NonNullable<PivotConfiguration["sort"]>) => boolean;
  apply: () => boolean; reset: () => boolean; refresh: () => boolean;
  saveView: () => boolean; restoreView: () => boolean;
  setPage: (index: number) => void;
  setColumnPage: (index: number) => void;
  export: (format: string, source?: "pivot" | "records") => Promise<AnalyticsExportArtifact>;
  cancelExport: () => void;
  subscribe: (listener: () => void) => () => void;
  dispose: () => void;
}
export interface AnalyticsControllerOptions<TData> {
  readonly fields: readonly PivotField<TData>[];
  /** Return filtered immutable rows. Server datasets must aggregate/export on their server. */
  readonly getRows: () => Iterable<TData>;
  readonly configuration: PivotConfiguration;
  readonly limits?: PivotLimits;
  readonly pageSize?: number;
  readonly columnPageSize?: number;
  readonly exportColumns?: readonly AnalyticsExportColumn<TData>[];
  readonly exporters?: Readonly<Record<string, AnalyticsExporter>>;
  readonly getRevision?: () => string;
  readonly title?: string;
  readonly loadView?: () => string | null;
  readonly saveView?: (serialized: string) => void;
  readonly onArtifact?: (artifact: AnalyticsExportArtifact) => void;
  readonly onListenerError?: (error: unknown) => void;
}
export function createPivotExportSource<TData>(result: PivotResult, fields: readonly Pick<PivotField<TData>, "id" | "label">[]): AnalyticsExportSource<PivotRow> {
  const labels = new Map(fields.map((field) => [field.id, field.label]));
  const columns: AnalyticsExportColumn<PivotRow>[] = result.configuration.rowAxes.map((id, index) => ({ id: `axis:${id}`, label: labels.get(id) ?? id, type: "text", getValue: (row) =>
    row.kind === "grand-total" ? index === 0 ? "Grand total" : null : index >= row.values.length ? null : row.kind === "subtotal" && index === row.values.length - 1 ? `${String(row.values[index] ?? "(empty)")} subtotal` : row.values[index] ?? "(empty)" }));
  if (!columns.length) columns.push({ id: "pivot-label", label: "Rows", type: "text", getValue: (row) => row.kind === "grand-total" ? "Grand total" : row.kind });
  for (const column of result.columns) columns.push({ id: column.id, label: column.headers.join(" / "), headers: column.headers, type: "number", getValue: (row) => row.cells[column.id] });
  return { rows: result.rows, columns, scope: "pivot", totalRows: result.rows.length };
}
/** Framework-neutral configuration, pagination, saved view and export lifecycle for the optional panel. */
export function createAnalyticsController<TData>(options: AnalyticsControllerOptions<TData>): AnalyticsController<TData> {
  const initial = validatePivotConfiguration(options.configuration, options.fields), pageSize = options.pageSize ?? 50, columnPageSize = options.columnPageSize ?? 12;
  if (!Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 100 || !Number.isSafeInteger(columnPageSize) || columnPageSize < 1 || columnPageSize > 50 || options.fields.length > 500) throw new TypeError("Invalid analytics preview limits");
  const formats: Record<string, AnalyticsExporter> = { csv: createDelimitedExporter(), tsv: createDelimitedExporter({ delimiter: "\t" }), print: createPrintExporter(), ...options.exporters };
  if (Object.keys(formats).length > 16 || Object.entries(formats).some(([name, exporter]) => !/^[a-z][a-z0-9-]{0,24}$/.test(name) || typeof exporter !== "function")) throw new TypeError("Invalid analytics exporter registry");
  const listeners = new Set<() => void>(); let disposed = false, draft = initial, resultRevision = options.getRevision?.(), result = createPivot(options.getRows(), options.fields, initial, options.limits), pageIndex = 0, columnPageIndex = 0;
  if (options.getRevision?.() !== resultRevision) throw new Error("Pivot source changed during calculation");
  let error: string | undefined, message: string | undefined, exportState: AnalyticsExportState | undefined, job: AnalyticsExportJob | undefined, stopExport = () => {}, generation = 0;
  let saved = serializePivotConfiguration(initial, options.fields), snapshot: AnalyticsControllerState;
  const active = () => { if (disposed) throw new Error("Analytics controller is disposed"); };
  const report = (failure: unknown) => { if (options.onListenerError) { try { options.onListenerError(failure); return; } catch (error) { failure = error; } } queueMicrotask(() => { throw failure; }); };
  const publish = () => {
    if (disposed) return;
    const pageCount = Math.max(1, Math.ceil(result.rows.length / pageSize)); pageIndex = Math.min(pageIndex, pageCount - 1);
    const columnPageCount = Math.max(1, Math.ceil(result.columns.length / columnPageSize)); columnPageIndex = Math.min(columnPageIndex, columnPageCount - 1);
    snapshot = Object.freeze({ draft, result, pageIndex, pageCount, pageRows: Object.freeze(result.rows.slice(pageIndex * pageSize, (pageIndex + 1) * pageSize)), columnPageIndex, columnPageCount,
      pageColumns: Object.freeze(result.columns.slice(columnPageIndex * columnPageSize, (columnPageIndex + 1) * columnPageSize)), error, message, exportState, formats: Object.freeze(Object.keys(formats)) });
    for (const listener of [...listeners]) if (listeners.has(listener)) try { listener(); } catch (failure) { report(failure); }
  };
  const fail = (failure: unknown) => { error = failure instanceof Error ? failure.message : "Analytics operation failed"; message = undefined; publish(); return false; };
  const setDraft = (next: PivotConfiguration) => { active(); try { draft = validatePivotConfiguration(next, options.fields); error = undefined; message = undefined; publish(); return true; } catch (failure) { return fail(failure); } };
  const releaseJob = () => { stopExport(); stopExport = () => {}; if (job) { job.cancel(); exportState = job.getState(); job.dispose(); job = undefined; } };
  const compute = (configuration: PivotConfiguration, preserveDraft = false) => { const revision = options.getRevision?.(), next = createPivot(options.getRows(), options.fields, configuration, options.limits); if (options.getRevision?.() !== revision) throw new Error("Pivot source changed during calculation"); generation++; releaseJob(); result = next; resultRevision = revision; if (!preserveDraft) draft = configuration; pageIndex = 0; columnPageIndex = 0; error = undefined; message = "Pivot applied"; publish(); return true; };
  const controller: AnalyticsController<TData> = {
    fields: Object.freeze(options.fields.map(({ id, label }) => Object.freeze({ id, label }))),
    getState: () => snapshot,
    setAxes: (axis, ids) => { if (axis !== "rows" && axis !== "columns") throw new TypeError("Invalid pivot axis"); return setDraft({ ...draft, [axis === "rows" ? "rowAxes" : "columnAxes"]: [...ids], sort: [] }); },
    setMetrics: (metrics) => setDraft({ ...draft, metrics }),
    setTotals: (subtotals, rowTotals) => setDraft({ ...draft, subtotals, rowTotals }),
    setSorting: (sort) => setDraft({ ...draft, sort }),
    apply: () => { active(); try { return compute(draft); } catch (failure) { return fail(failure); } },
    reset: () => { active(); try { return compute(initial); } catch (failure) { return fail(failure); } },
    refresh: () => { active(); try { return compute(result.configuration, true); } catch (failure) { return fail(failure); } },
    saveView: () => { active(); try { if (JSON.stringify(draft) !== JSON.stringify(result.configuration)) throw new Error("Apply pivot changes before saving a view"); const serialized = serializePivotConfiguration(result.configuration, options.fields); options.saveView?.(serialized); saved = serialized; message = "Pivot view saved"; error = undefined; publish(); return true; } catch (failure) { return fail(failure); } },
    restoreView: () => { active(); try { const serialized = options.loadView ? options.loadView() : saved; if (serialized === null) throw new Error("No saved pivot view"); const configuration = parsePivotConfiguration(serialized, options.fields); compute(configuration); message = "Pivot view restored"; publish(); return true; } catch (failure) { return fail(failure); } },
    setPage: (index) => { active(); if (!Number.isSafeInteger(index) || index < 0 || index >= snapshot.pageCount) throw new RangeError("Invalid analytics preview page"); pageIndex = index; publish(); },
    setColumnPage: (index) => { active(); if (!Number.isSafeInteger(index) || index < 0 || index >= snapshot.columnPageCount) throw new RangeError("Invalid analytics column preview page"); columnPageIndex = index; publish(); },
    export: async (format, source = "pivot") => {
      active(); const exporter = Object.hasOwn(formats, format) ? formats[format] : undefined; if (!exporter) throw new TypeError("Unknown analytics exporter");
      if (source !== "pivot" && source !== "records") throw new TypeError("Invalid analytics export source");
      if (source === "pivot" && options.getRevision?.() !== resultRevision) throw new Error("Pivot source changed; refresh before exporting");
      if (job && ["collecting", "encoding", "idle"].includes(job.getState().status)) throw new Error("An export is already running");
      const exportGeneration = ++generation; error = undefined; message = undefined; stopExport(); job?.dispose();
      const revision = options.getRevision?.(), extra = revision === undefined ? {} : { revision, getCurrentRevision: options.getRevision! };
      const create = <TRow>(input: AnalyticsExportSource<TRow>) => createAnalyticsExportJob({ ...input, ...extra }, { exporter, ...(options.title ? { title: options.title } : {}) });
      job = source === "pivot" ? create(createPivotExportSource(result, controller.fields)) : create({ rows: options.getRows(), columns: options.exportColumns ?? options.fields.map((field) => ({ ...field, getValue: field.getValue })), scope: "filtered" });
      const owned = job; exportState = owned.getState(); stopExport = owned.subscribe(() => { if (job === owned && !disposed) { exportState = owned.getState(); publish(); } }); publish();
      try { const artifact = await owned.start(); if (disposed || job !== owned || generation !== exportGeneration) throw new DOMException("Export interrupted", "AbortError"); options.onArtifact?.(artifact); return artifact; }
      catch (failure) { if (!disposed && job === owned && generation === exportGeneration) fail(failure); throw failure; }
    },
    cancelExport: () => { active(); generation++; releaseJob(); publish(); },
    subscribe: (listener) => { active(); listeners.add(listener); return () => { listeners.delete(listener); }; },
    dispose: () => { if (disposed) return; disposed = true; stopExport(); job?.dispose(); job = undefined; listeners.clear(); },
  };
  publish(); return controller;
}
