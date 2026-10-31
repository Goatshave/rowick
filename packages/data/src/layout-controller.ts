import type { CellCoordinate, CellRange, Column, ColumnLayout, FocusDirection, Grid, Row } from "@rowick/core";
import type { RowEditingController } from "./row-editing";
import { LayoutHeightIndex } from "./layout-height";
import { resolveLayoutSpans, type LayoutCellSpan, type LayoutSpanModel } from "./layout-spans";
import { layoutClipboardText, parseLayoutClipboardPayload, parseLayoutClipboardText, type LayoutClipboardPayload } from "./layout-clipboard";

export interface GridLayoutOptions<TData> {
  readonly direction?: "ltr" | "rtl";
  readonly editing?: RowEditingController<TData>;
  readonly spans?: readonly LayoutCellSpan[];
  readonly getRowHeight?: (row: Row<TData>) => number;
  readonly getDetailText?: (row: Row<TData>) => string;
  readonly estimatedDetailHeight?: number;
  readonly maxPinnedRows?: number;
  readonly maxRenderedItems?: number;
  readonly maxClipboardCells?: number;
  readonly initialTopPins?: readonly string[];
  readonly initialBottomPins?: readonly string[];
  /** A local immutable reorder proposal; the owner accepts it synchronously. */
  readonly acceptReorder?: (data: readonly TData[]) => void;
}
export interface LayoutEditSession { readonly coordinate: CellCoordinate; readonly token: number; readonly value: string; readonly error: string | undefined; }
export interface GridLayoutState {
  readonly revision: number;
  readonly operationRevision: number;
  readonly draftRevision: number;
  readonly topPins: readonly string[];
  readonly bottomPins: readonly string[];
  readonly detailIds: readonly string[];
  readonly ranges: readonly CellRange[];
  readonly focusedCell: CellCoordinate | null;
  readonly editing: LayoutEditSession | null;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly message: string | undefined;
}
export interface LayoutRenderItem<TData> {
  readonly key: string;
  readonly kind: "row" | "detail";
  readonly row: Row<TData>;
  readonly rowIndex: number;
  readonly sourceRowIndex: number;
  readonly height: number;
  readonly estimatedHeight: number;
  readonly position: "top" | "center" | "bottom";
}
export interface GridLayoutView<TData> {
  readonly direction: "ltr" | "rtl";
  readonly top: readonly LayoutRenderItem<TData>[];
  readonly center: readonly LayoutRenderItem<TData>[];
  readonly bottom: readonly LayoutRenderItem<TData>[];
  readonly columns: readonly Column<TData, unknown>[];
  readonly columnLayout: readonly ColumnLayout[];
  readonly beforeHeight: number;
  readonly afterHeight: number;
  readonly totalHeight: number;
  readonly rowCount: number;
  readonly recordCount: number;
}
export interface LayoutClipboardResult {
  readonly attempted: number;
  readonly committed: number;
  readonly skipped: readonly { coordinate: CellCoordinate; reason: string }[];
  readonly blocked: boolean;
}
export interface LayoutExportSnapshot {
  readonly version: 1;
  readonly revision: number;
  readonly rowIds: readonly string[];
  readonly columnIds: readonly string[];
  readonly values: readonly (readonly unknown[])[];
  readonly spans: readonly { readonly start: CellCoordinate; readonly rowSpan: number; readonly columnSpan: number }[];
}
export interface GridLayoutController<TData> {
  readonly grid: Grid<TData>;
  getState: () => GridLayoutState;
  getView: (viewport: { scrollTop: number; height: number; overscan?: number }) => GridLayoutView<TData>;
  getCellSpan: (rowId: string, columnId: string) => { anchor: CellCoordinate; rowSpan: number; columnSpan: number; covered: boolean } | undefined;
  getCellValue: (rowId: string, columnId: string) => unknown;
  getCanEdit: (rowId: string, columnId: string) => boolean;
  getDetailText: (rowId: string) => string;
  measure: (key: string, height: number) => void;
  measureMany: (measurements: readonly { key: string; height: number }[]) => void;
  pin: (rowId: string, position: "top" | "bottom" | false) => void;
  clearPins: () => void;
  toggleDetail: (rowId: string) => void;
  collapseDetails: () => void;
  setSpans: (spans: readonly LayoutCellSpan[]) => void;
  select: (start: CellCoordinate, end?: CellCoordinate, additive?: boolean) => void;
  clearRanges: () => void;
  getIsCellSelected: (rowId: string, columnId: string) => boolean;
  focus: (coordinate: CellCoordinate, extend?: boolean, additive?: boolean) => void;
  moveFocus: (direction: FocusDirection, extend?: boolean) => number | null;
  getScrollOffset: (rowId: string) => number | null;
  beginEdit: (coordinate?: CellCoordinate) => void;
  setEditInput: (value: string) => void;
  commitEdit: (token?: number) => boolean;
  cancelEdit: () => void;
  copy: () => { text: string; payload: string };
  getExportSnapshot: (options?: { scope?: "page" | "range"; rangeIndex?: number; columnIds?: readonly string[]; maxCells?: number }) => LayoutExportSnapshot;
  paste: (text: string, payload?: string) => LayoutClipboardResult;
  cut: (write: (copy: { text: string; payload: string }) => unknown) => LayoutClipboardResult;
  fill: (value: string) => LayoutClipboardResult;
  undo: () => boolean;
  redo: () => boolean;
  getCanReorder: () => boolean;
  reorder: (rowId: string, targetId: string, position?: "before" | "after") => void;
  moveRow: (rowId: string, direction: -1 | 1) => void;
  reconcile: () => void;
  subscribe: (listener: () => void) => () => void;
  dispose: () => void;
}
interface LayoutModel<TData> {
  source: unknown[]; rows: Row<TData>[]; rowById: Map<string, Row<TData>>; rowIndex: Map<string, number>; columns: Column<TData, unknown>[];
  columnIndex: Map<string, number>; spans: LayoutSpanModel; top: LayoutRenderItem<TData>[]; center: LayoutRenderItem<TData>[]; bottom: LayoutRenderItem<TData>[];
  heights: LayoutHeightIndex; itemIndex: Map<string, number>; rowItemIndex: Map<string, number>;
}
interface Bounds { r0: number; r1: number; c0: number; c1: number; }
const equal = (a: CellCoordinate, b: CellCoordinate) => a.rowId === b.rowId && a.columnId === b.columnId;
const itemKey = (kind: string, id: string) => JSON.stringify([kind, id]);
function copySpans(spans: readonly LayoutCellSpan[]) {
  if (!Array.isArray(spans) || spans.length > 128) throw new TypeError("Invalid or excessive cell merges");
  return spans.map((span) => {
    if (!span || !Array.isArray(span.rowIds) || !Array.isArray(span.columnIds)) throw new TypeError("Invalid merge IDs");
    return Object.freeze({ rowIds: Object.freeze([...span.rowIds]), columnIds: Object.freeze([...span.columnIds]) });
  });
}
export function createGridLayoutController<TData>(grid: Grid<TData>, options: GridLayoutOptions<TData> = {}): GridLayoutController<TData> {
  const limit = (value: number | undefined, fallback: number, maximum: number) => {
    const result = value ?? fallback; if (!Number.isInteger(result) || result < 1 || result > maximum) throw new TypeError("Invalid grid layout limit"); return result;
  };
  const maxPins = limit(options.maxPinnedRows, 8, 50), maxRendered = limit(options.maxRenderedItems, 200, 512), maxCells = limit(options.maxClipboardCells, 10_000, 10_000);
  const direction = options.direction ?? "ltr";
  if (direction !== "ltr" && direction !== "rtl") throw new TypeError("Invalid layout direction");
  let topPins = [...(options.initialTopPins ?? [])], bottomPins = [...(options.initialBottomPins ?? [])], details = new Set<string>(), ranges: CellRange[] = [];
  let spans = copySpans(options.spans ?? []), editing: LayoutEditSession | null = null, token = 0, revision = 0, operationRevision = 0, draftRevision = 0, disposed = false, message: string | undefined;
  let model: LayoutModel<TData> | undefined, state: GridLayoutState, notifying = false, pending = false, viewportHeight = Number.POSITIVE_INFINITY;
  const listeners = new Set<() => void>(), measurements = new Map<string, number>();
  let boundsModel: LayoutModel<TData> | undefined, boundsRanges: readonly CellRange[] | undefined, cachedBounds: Bounds[] = [];
  const active = () => { if (disposed) throw new Error("Grid layout controller is disposed"); };
  const publish = (measurementOnly = false) => {
    if (disposed) return;
    const history = options.editing?.getState();
    if (!measurementOnly) operationRevision++;
    state = Object.freeze({ revision: ++revision, operationRevision, draftRevision, topPins: Object.freeze([...topPins]), bottomPins: Object.freeze([...bottomPins]), detailIds: Object.freeze([...details]),
      ranges: Object.freeze([...ranges]), focusedCell: grid.getState().focusedCell, editing, canUndo: history?.canUndo ?? false, canRedo: history?.canRedo ?? false, message });
    pending = true; if (notifying) return; notifying = true;
    try { while (pending && !disposed) { pending = false; for (const listener of [...listeners]) if (listeners.has(listener)) { try { listener(); } catch (error) { queueMicrotask(() => { throw error; }); } } } }
    finally { notifying = false; }
  };
  const getModel = (): LayoutModel<TData> => {
    active(); const page = grid.getRowModel(), pre = grid.getPrePaginationRowModel(), leafColumns = grid.getVisibleLeafColumns();
    const source = [page, pre, leafColumns, grid.getState().columnPinning, topPins, bottomPins, details, spans];
    if (model && source.every((value, index) => Object.is(value, model!.source[index]))) return model;
    const reverse = (items: Column<TData, unknown>[]) => direction === "rtl" ? items.reverse() : items;
    const columns = [...reverse(leafColumns.filter((column) => column.getIsPinned() === "left")), ...reverse(leafColumns.filter((column) => column.getIsPinned() === false)), ...reverse(leafColumns.filter((column) => column.getIsPinned() === "right"))];
    if (topPins.length > maxPins || bottomPins.length > maxPins || new Set([...topPins, ...bottomPins]).size !== topPins.length + bottomPins.length || [...topPins, ...bottomPins].some((id) => typeof id !== "string" || !id.length)) throw new TypeError("Invalid or excessive pinned rows");
    const available = new Map(pre.rows.map((row) => [row.id, row])), pinned = new Set([...topPins, ...bottomPins]);
    const topRows = topPins.flatMap((id) => available.get(id) ? [available.get(id)!] : []), bottomRows = bottomPins.flatMap((id) => available.get(id) ? [available.get(id)!] : []);
    const centerRows = page.rows.filter((row) => !pinned.has(row.id)), rows = [...topRows, ...centerRows, ...bottomRows];
    const position = (id: string) => topPins.includes(id) ? "top" as const : bottomPins.includes(id) ? "bottom" as const : "center" as const;
    const spanModel = resolveLayoutSpans(rows, columns, spans, position, details);
    const originalIndices = new Map(pre.rows.map((row, index) => [row.id, index]));
    const items = (rows: readonly Row<TData>[], position: "top" | "center" | "bottom") => rows.flatMap((row): LayoutRenderItem<TData>[] => {
      const make = (kind: "row" | "detail", estimate: number): LayoutRenderItem<TData> => {
        const key = itemKey(kind, row.id), height = measurements.get(key) ?? estimate;
        if (!Number.isFinite(height) || height < 1 || height > 10_000) throw new RangeError("Invalid layout item height");
        return { key, kind, row, rowIndex: 0, sourceRowIndex: originalIndices.get(row.id)!, height, estimatedHeight: estimate, position };
      };
      return [make("row", options.getRowHeight?.(row) ?? 44), ...(details.has(row.id) ? [make("detail", options.estimatedDetailHeight ?? 120)] : [])];
    });
    const top = items(topRows, "top"), center = items(centerRows, "center"), bottom = items(bottomRows, "bottom");
    [...top, ...center, ...bottom].forEach((item, index) => { (item as { rowIndex: number }).rowIndex = index; });
    const rowItemIndex = new Map<string, number>(); center.forEach((item, index) => { if (item.kind === "row") rowItemIndex.set(item.row.id, index); });
    model = { source, rows, rowById: new Map(rows.map((row) => [row.id, row])), rowIndex: new Map(rows.map((row, index) => [row.id, index])), columns,
      columnIndex: new Map(columns.map((column, index) => [column.id, index])), spans: spanModel, top, center, bottom, heights: new LayoutHeightIndex(center.map((item) => item.height)),
      itemIndex: new Map(center.map((item, index) => [item.key, index])), rowItemIndex };
    return model;
  };
  const anchor = (coordinate: CellCoordinate) => {
    const current = getModel(); if (!current.rowById.has(coordinate.rowId) || !current.columnIndex.has(coordinate.columnId)) throw new TypeError("Cell is not in the current layout");
    return current.spans.cells.get(coordinate.rowId)?.get(coordinate.columnId)?.anchor ?? coordinate;
  };
  const bounds = (): Bounds[] => {
    const current = getModel();
    if (current === boundsModel && ranges === boundsRanges) return cachedBounds;
    cachedBounds = ranges.flatMap((range) => {
      const a = current.rowIndex.get(range.start.rowId), b = current.rowIndex.get(range.end.rowId), c = current.columnIndex.get(range.start.columnId), d = current.columnIndex.get(range.end.columnId);
      if (a === undefined || b === undefined || c === undefined || d === undefined) return [];
      const result = { r0: Math.min(a, b), r1: Math.max(a, b), c0: Math.min(c, d), c1: Math.max(c, d) };
      let changed = true;
      while (changed) { changed = false; for (const span of current.spans.spans) {
        const column = current.columnIndex.get(span.anchor.columnId)!;
        if (span.startRow <= result.r1 && span.endRow >= result.r0 && column <= result.c1 && column + span.columnSpan - 1 >= result.c0) {
          const next = { r0: Math.min(result.r0, span.startRow), r1: Math.max(result.r1, span.endRow), c0: Math.min(result.c0, column), c1: Math.max(result.c1, column + span.columnSpan - 1) };
          if (Object.keys(next).some((key) => next[key as keyof Bounds] !== result[key as keyof Bounds])) { Object.assign(result, next); changed = true; }
        }
      } }
      return [result];
    });
    boundsModel = current; boundsRanges = ranges; return cachedBounds;
  };
  const selected = () => {
    const current = getModel(), result: CellCoordinate[] = [], seen = new Map<string, Set<string>>();
    for (const range of bounds()) {
      if ((range.r1 - range.r0 + 1) * (range.c1 - range.c0 + 1) > maxCells) throw new RangeError("Selection exceeds clipboard cell limit");
      for (let r = range.r0; r <= range.r1; r++) for (let c = range.c0; c <= range.c1; c++) {
        const coordinate = { rowId: current.rows[r]!.id, columnId: current.columns[c]!.id };
        const merged = current.spans.cells.get(coordinate.rowId)?.get(coordinate.columnId);
        if (merged && !equal(merged.anchor, coordinate)) continue;
        const ids = seen.get(coordinate.rowId) ?? new Set<string>(); seen.set(coordinate.rowId, ids);
        if (!ids.has(coordinate.columnId)) { ids.add(coordinate.columnId); result.push(coordinate); }
        if (result.length > maxCells) throw new RangeError("Selection exceeds clipboard cell limit");
      }
    }
    return result;
  };
  const apply = (cells: readonly { coordinate: CellCoordinate; raw: string }[], atomic: boolean): LayoutClipboardResult => {
    if (cells.length > maxCells) throw new RangeError("Clipboard cell limit exceeded");
    if (!options.editing) { message = "Editing is unavailable"; publish(); return { attempted: cells.length, committed: 0, skipped: cells.map(({ coordinate }) => ({ coordinate, reason: "Read-only layout" })), blocked: true }; }
    const current = getModel(), proposals: Array<{ rowId: string; columnId: string; value: unknown }> = [], skipped: Array<{ coordinate: CellCoordinate; reason: string }> = [];
    const sourceData = grid.getOptions().data, sourceOptions = grid.getOptions(), sourceState = grid.getState(), preparationRevision = operationRevision, seen = new Map<string, Set<string>>();
    for (const { coordinate, raw } of cells) {
      const row = current.rowById.get(coordinate.rowId), column = current.columns[current.columnIndex.get(coordinate.columnId) ?? -1], merged = current.spans.cells.get(coordinate.rowId)?.get(coordinate.columnId);
      if (merged && !equal(merged.anchor, coordinate)) { skipped.push({ coordinate, reason: "Covered merged cell" }); continue; }
      if (!row || !column || row.getIsGrouped() || row.getIsGroupFooter() || !column.getCanEdit() || !options.editing.getCanEdit(coordinate.rowId, coordinate.columnId)) { skipped.push({ coordinate, reason: "Read-only or unavailable cell" }); continue; }
      const ids = seen.get(row.id) ?? new Set<string>(); seen.set(row.id, ids); if (ids.has(column.id)) continue; ids.add(column.id);
      try {
        const previousValue = options.editing.getValue(row.id, column.id), context = { grid, row, column, previousValue };
        const value = column.columnDef.editValueParser ? column.columnDef.editValueParser(raw, context) : raw;
        const validation = column.columnDef.validateEditValue?.(value, { ...context, value });
        if (validation === false || typeof validation === "string" || (validation && typeof validation === "object" && !validation.valid)) {
          skipped.push({ coordinate, reason: typeof validation === "string" ? validation : typeof validation === "object" ? validation.message ?? "Invalid value" : "Invalid value" }); continue;
        }
        proposals.push({ rowId: row.id, columnId: column.id, value });
      } catch (error) { skipped.push({ coordinate, reason: error instanceof Error ? error.message : "Invalid input" }); }
    }
    const assertCurrent = () => { if (disposed || preparationRevision !== operationRevision || sourceData !== grid.getOptions().data || sourceOptions !== grid.getOptions() || sourceState !== grid.getState()) throw new Error("Data, schema or editing intent changed during clipboard preparation"); };
    assertCurrent();
    if (atomic && skipped.length) { message = skipped[0]!.reason; publish(); return { attempted: cells.length, committed: 0, skipped, blocked: true }; }
    for (const proposal of proposals) {
      const column = current.columns[current.columnIndex.get(proposal.columnId)!];
      if (!column?.getCanEdit() || !options.editing.getCanEdit(proposal.rowId, proposal.columnId)) throw new Error("Editing permission changed during clipboard preparation");
    }
    assertCurrent();
    try { if (proposals.length) options.editing.setValues(proposals); }
    catch (error) { message = error instanceof Error ? error.message : "Batch rejected"; publish(); return { attempted: cells.length, committed: 0, skipped: [...skipped, ...proposals.map((proposal) => ({ coordinate: { rowId: proposal.rowId, columnId: proposal.columnId }, reason: message! }))], blocked: true }; }
    message = skipped.length ? `${proposals.length} cells changed, ${skipped.length} skipped` : `${proposals.length} cells changed`; publish();
    return { attempted: cells.length, committed: proposals.length, skipped, blocked: false };
  };
  const mutateLayout = (action: () => void) => {
    active(); if (editing) throw new Error("Finish or cancel cell editing before changing layout");
    const previous = { topPins, bottomPins, details, spans, model };
    action(); model = undefined;
    try {
      const current = getModel();
      if ([...current.top, ...current.bottom].reduce((total, item) => total + item.height, 0) > viewportHeight * .7) throw new RangeError("Pinned content exceeds the viewport; unpin or collapse details");
    } catch (error) { ({ topPins, bottomPins, details, spans, model } = previous); throw error; }
    message = undefined; publish();
  };
  const controller: GridLayoutController<TData> = {
    grid, getState: () => state,
    getView: ({ scrollTop, height, overscan = 4 }) => {
      if (!Number.isFinite(scrollTop) || scrollTop < 0 || !Number.isFinite(height) || height < 1 || !Number.isInteger(overscan) || overscan < 0 || overscan > 32) throw new RangeError("Invalid layout viewport");
      const current = getModel(), pinnedHeight = [...current.top, ...current.bottom].reduce((total, item) => total + item.height, 0);
      viewportHeight = height;
      if (pinnedHeight > height * .7) throw new RangeError("Pinned content exceeds the viewport; unpin or collapse details");
      const centerHeight = Math.max(1, height - pinnedHeight);
      let start = Math.max(0, current.heights.find(scrollTop) - overscan), end = Math.min(current.center.length, current.heights.find(scrollTop + centerHeight) + overscan + 1), changed = true;
      while (changed) { changed = false; for (const span of current.spans.spans) {
        const a = current.rowItemIndex.get(span.rowIds[0]!), b = current.rowItemIndex.get(span.rowIds.at(-1)!);
        if (a !== undefined && b !== undefined && a < end && b >= start && (a < start || b >= end)) { start = Math.min(start, a); end = Math.max(end, b + 1); changed = true; }
      } }
      if (current.center[start]?.kind === "detail") start = Math.max(0, start - 1);
      if (current.center[end - 1]?.kind === "row" && current.center[end]?.kind === "detail") end++;
      if (end - start + current.top.length + current.bottom.length > maxRendered) throw new RangeError("Viewport exceeds rendered item budget");
      let startOffset = 0, leftOffset = 0, rightOffset = current.columns.filter((column) => column.getIsPinned() === "right").reduce((sum, column) => sum + column.getSize(), 0);
      const lastLeft = current.columns.filter((column) => column.getIsPinned() === "left").at(-1)?.id, firstRight = current.columns.find((column) => column.getIsPinned() === "right")?.id;
      const columnLayout = current.columns.map((column): ColumnLayout => {
        const size = column.getSize(), pinned = column.getIsPinned(), item: ColumnLayout = { id: column.id, size, start: startOffset, end: startOffset + size, pinned }; startOffset += size;
        if (pinned === "left") { item.pinnedStart = leftOffset; leftOffset += size; if (column.id === lastLeft) item.pinnedEdge = "left"; }
        if (pinned === "right") { rightOffset -= size; item.pinnedStart = rightOffset; if (column.id === firstRight) item.pinnedEdge = "right"; }
        return item;
      });
      return { direction, top: current.top, center: current.center.slice(start, end).map((item, offset) => ({ ...item, height: current.heights.size(start + offset) })), bottom: current.bottom, columns: current.columns,
        columnLayout, beforeHeight: current.heights.offset(start), afterHeight: current.heights.total - current.heights.offset(end), totalHeight: current.heights.total,
        rowCount: current.top.length + current.center.length + current.bottom.length, recordCount: grid.getRowCount() };
    },
    getCellSpan: (rowId, columnId) => { const span = getModel().spans.cells.get(rowId)?.get(columnId); return span ? { anchor: span.anchor, rowSpan: span.rowSpan, columnSpan: span.columnSpan, covered: !equal(span.anchor, { rowId, columnId }) } : undefined; },
    getCellValue: (rowId, columnId) => { const row = getModel().rowById.get(rowId); if (!row) return undefined;
      return options.editing && !row.getIsGrouped() && !row.getIsGroupFooter() ? options.editing.getValue(rowId, columnId) : row.getValue(columnId); },
    getCanEdit: (rowId, columnId) => {
      const current = getModel(), row = current.rowById.get(rowId), column = current.columns[current.columnIndex.get(columnId) ?? -1];
      return Boolean(row && column && options.editing && !row.getIsGrouped() && !row.getIsGroupFooter() && column.getCanEdit() && options.editing.getCanEdit(rowId, columnId));
    },
    getDetailText: (rowId) => { const row = getModel().rowById.get(rowId); return row ? options.getDetailText?.(row) ?? `Details for ${rowId}` : ""; },
    measure: (key, height) => controller.measureMany([{ key, height }]),
    measureMany: (updates) => {
      active(); if (updates.length > maxRendered || updates.some(({ height }) => !Number.isFinite(height) || height < 1 || height > 10_000)) throw new RangeError("Invalid measured heights or count");
      const current = getModel(); let changed = false;
      for (const { key, height } of updates) {
        const index = current.itemIndex.get(key), item = [...current.top, ...current.bottom].find((item) => item.key === key);
        if (index === undefined && !item) continue;
        if (Math.abs((measurements.get(key) ?? (index !== undefined ? current.heights.size(index) : item!.height)) - height) < .5) continue;
        measurements.delete(key); measurements.set(key, height); while (measurements.size > 5_000) measurements.delete(measurements.keys().next().value!);
        if (index !== undefined) current.heights.set(index, height); else model = undefined;
        changed = true;
      }
      if (changed) publish(true);
    },
    pin: (rowId, position) => mutateLayout(() => {
      if (!grid.getCoreRowModel().flatRows.some((row) => row.id === rowId && !row.getIsGrouped() && !row.getIsGroupFooter())) throw new TypeError("Only loaded data rows can be pinned");
      const moving = new Set([rowId]); let changed = true;
      while (changed) { changed = false; for (const span of spans) if (span.rowIds.some((id) => moving.has(id))) for (const id of span.rowIds) if (!moving.has(id)) { moving.add(id); changed = true; } }
      topPins = topPins.filter((id) => !moving.has(id)); bottomPins = bottomPins.filter((id) => !moving.has(id));
      const ordered = grid.getPrePaginationRowModel().rows.filter((row) => moving.has(row.id)).map((row) => row.id);
      if (position === "top") topPins.push(...ordered); else if (position === "bottom") bottomPins.push(...ordered);
    }),
    clearPins: () => mutateLayout(() => { topPins = []; bottomPins = []; }),
    toggleDetail: (rowId) => mutateLayout(() => {
      const row = getModel().rowById.get(rowId);
      if (!row || row.getIsGrouped() || row.getIsGroupFooter()) throw new TypeError("Detail row is not available");
      const next = new Set(details); if (next.has(rowId)) next.delete(rowId); else { if (next.size >= 100) throw new RangeError("Detail expansion limit reached"); next.add(rowId); } details = next;
    }),
    collapseDetails: () => mutateLayout(() => { details = new Set(); }),
    setSpans: (next) => mutateLayout(() => { spans = copySpans(next); }),
    select: (start, end = start, additive = false) => {
      active(); const next = Object.freeze({ start: Object.freeze({ ...anchor(start) }), end: Object.freeze({ ...anchor(end) }) });
      const existing = ranges.findIndex((range) => equal(range.start, next.start) && equal(range.end, next.end) || equal(range.end, next.start) && equal(range.start, next.end));
      if (additive && existing < 0 && ranges.length >= 32) throw new RangeError("Selection range limit reached");
      ranges = additive ? existing < 0 ? [...ranges, next] : ranges.filter((_, index) => index !== existing) : [next]; message = undefined; publish();
    },
    clearRanges: () => { active(); ranges = []; publish(); },
    getIsCellSelected: (rowId, columnId) => { const current = getModel(), r = current.rowIndex.get(rowId), c = current.columnIndex.get(columnId);
      return r !== undefined && c !== undefined && bounds().some((range) => r >= range.r0 && r <= range.r1 && c >= range.c0 && c <= range.c1); },
    focus: (coordinate, extend = false, additive = false) => {
      const next = anchor(coordinate), start = extend ? ranges.at(-1)?.start ?? grid.getState().focusedCell ?? next : next;
      if (extend && ranges.length) ranges = ranges.slice(0, -1);
      controller.select(start, next, additive || extend); grid.setFocusedCell(next);
    },
    moveFocus: (direction, extend = false) => {
      const current = getModel(); if (!current.rows.length || !current.columns.length) return null;
      const focused = grid.getState().focusedCell; let r = focused ? current.rowIndex.get(focused.rowId) ?? 0 : 0, c = focused ? current.columnIndex.get(focused.columnId) ?? 0 : 0;
      const span = focused ? current.spans.cells.get(focused.rowId)?.get(focused.columnId) : undefined;
      if (direction === "up") r--; else if (direction === "down") r += span?.rowSpan ?? 1;
      else if (direction === "left") c--; else if (direction === "right") c += span?.columnSpan ?? 1;
      else if (direction === "home") c = options.direction === "rtl" ? current.columns.length - 1 : 0; else if (direction === "end") c = options.direction === "rtl" ? 0 : current.columns.length - 1;
      else if (direction === "grid-start") { r = 0; c = options.direction === "rtl" ? current.columns.length - 1 : 0; } else if (direction === "grid-end") { r = current.rows.length - 1; c = options.direction === "rtl" ? 0 : current.columns.length - 1; }
      else if (direction === "page-up") r -= 10; else r += 10;
      r = Math.max(0, Math.min(current.rows.length - 1, r)); c = Math.max(0, Math.min(current.columns.length - 1, c));
      const next = { rowId: current.rows[r]!.id, columnId: current.columns[c]!.id }; controller.focus(next, extend); return controller.getScrollOffset(next.rowId);
    },
    getScrollOffset: (rowId) => { const current = getModel(), index = current.rowItemIndex.get(rowId); return index === undefined ? null : current.heights.offset(index); },
    beginEdit: (coordinate = grid.getState().focusedCell ?? undefined) => {
      active(); if (!coordinate || !options.editing) return; const cell = anchor(coordinate), current = getModel(), row = current.rowById.get(cell.rowId)!, column = current.columns[current.columnIndex.get(cell.columnId)!]!;
      if (row.getIsGrouped() || row.getIsGroupFooter() || !column.getCanEdit() || !options.editing.getCanEdit(cell.rowId, cell.columnId)) return;
      const intent = ++token;
      editing = Object.freeze({ coordinate: Object.freeze({ ...cell }), token: intent, value: String(controller.getCellValue(cell.rowId, cell.columnId) ?? ""), error: undefined });
      try { grid.setFocusedCell(cell); }
      catch (error) { if (editing?.token === intent && (!grid.getState().focusedCell || !equal(grid.getState().focusedCell!, cell))) { editing = null; token++; } publish(); throw error; }
      if (editing?.token !== intent) return;
      if (!grid.getState().focusedCell || !equal(grid.getState().focusedCell!, cell)) { editing = null; token++; }
      publish();
    },
    setEditInput: (value) => { active(); if (!editing) return; editing = Object.freeze({ ...editing, value, error: undefined }); publish(); },
    commitEdit: (expected = editing?.token) => {
      active(); if (!editing || expected !== editing.token) return false; const session = editing;
      const result = apply([{ coordinate: session.coordinate, raw: session.value }], true);
      if (editing !== session) return !result.blocked;
      if (!result.blocked && result.committed) editing = null; else editing = Object.freeze({ ...session, error: result.skipped[0]?.reason ?? "Edit rejected" });
      publish(); return !result.blocked && result.committed > 0;
    },
    cancelEdit: () => { active(); editing = null; token++; publish(); },
    copy: () => {
      const current = getModel(), copyRevision = operationRevision, sourceData = grid.getOptions().data, sourceOptions = grid.getOptions(), sourceState = grid.getState(); let count = 0;
      const blocks = bounds().map((range) => {
        const values: string[][] = [];
        for (let r = range.r0; r <= range.r1; r++) { const row: string[] = []; for (let c = range.c0; c <= range.c1; c++) {
          if (++count > maxCells) throw new RangeError("Clipboard cell limit exceeded");
          const id = current.rows[r]!.id, column = current.columns[c]!, merged = current.spans.cells.get(id)?.get(column.id);
          const context = { grid, row: current.rows[r]!, rowIndex: r, column, columnIndex: c, value: controller.getCellValue(id, column.id) };
          const value = grid.getOptions().getClipboardCellValue ? grid.getOptions().getClipboardCellValue!(context) : column.columnDef.clipboardValue ? column.columnDef.clipboardValue(context) : context.value;
          row.push(merged && !equal(merged.anchor, { rowId: id, columnId: column.id }) ? "" : String(value ?? ""));
        } values.push(row); }
        return { values };
      });
      if (!blocks.length) throw new Error("Select a cell range before copying");
      if (copyRevision !== operationRevision || sourceData !== grid.getOptions().data || sourceOptions !== grid.getOptions() || sourceState !== grid.getState()) throw new Error("Source changed while preparing clipboard data");
      const payload = JSON.stringify({ version: 1, blocks }); if (payload.length > 1_000_000) throw new RangeError("Clipboard payload is too large");
      return { text: layoutClipboardText(blocks), payload };
    },
    getExportSnapshot: (exportOptions = {}) => {
      const current = getModel(), maximum = exportOptions.maxCells ?? 100_000, snapshotRevision = operationRevision, sourceData = grid.getOptions().data, sourceOptions = grid.getOptions(), sourceState = grid.getState();
      if (!Number.isSafeInteger(maximum) || maximum < 1 || maximum > 1_000_000) throw new RangeError("Invalid layout export cell limit");
      const rangeBounds = bounds(); let selectedBounds: Bounds | undefined;
      if (exportOptions.scope === "range") {
        if (!rangeBounds.length || rangeBounds.length > 1 && exportOptions.rangeIndex === undefined) throw new TypeError("Choose one explicit range block for export");
        const index = exportOptions.rangeIndex ?? 0;
        if (!Number.isInteger(index) || index < 0 || index >= rangeBounds.length) throw new RangeError("Invalid export range index");
        selectedBounds = rangeBounds[index];
      } else if (exportOptions.scope !== undefined && exportOptions.scope !== "page" || exportOptions.rangeIndex !== undefined) throw new TypeError("Invalid layout export scope/range index");
      const rows = selectedBounds ? current.rows.slice(selectedBounds.r0, selectedBounds.r1 + 1) : current.rows;
      const candidateColumns = selectedBounds ? current.columns.slice(selectedBounds.c0, selectedBounds.c1 + 1) : current.columns;
      const allowed = (column: Column<TData, unknown>) => column.columnDef.meta?.exportable !== false && column.columnDef.meta?.sensitive !== true;
      let columns = candidateColumns.filter(allowed);
      if (exportOptions.columnIds) {
        if (exportOptions.columnIds.length > candidateColumns.length || new Set(exportOptions.columnIds).size !== exportOptions.columnIds.length || exportOptions.columnIds.some((id) => !candidateColumns.some((column) => column.id === id && allowed(column)))) throw new TypeError("Unknown or forbidden export column");
        // Projection follows the actual layout order, independently of allowlist order.
        const requested = new Set(exportOptions.columnIds); columns = columns.filter((column) => requested.has(column.id));
      }
      if (!columns.length) throw new TypeError("No exportable layout columns");
      if (rows.length * columns.length > maximum) throw new RangeError("Layout export cell limit reached; use a server exporter");
      const rowIds = rows.map((row) => row.id), columnIds = columns.map((column) => column.id), rowSet = new Set(rowIds), columnSet = new Set(columnIds);
      const projectedSpans: Array<{ start: CellCoordinate; rowSpan: number; columnSpan: number }> = [];
      for (const span of current.spans.spans) {
        const includedRows = span.rowIds.filter((id) => rowSet.has(id)), includedColumns = span.columnIds.filter((id) => columnSet.has(id));
        if (!includedRows.length || !includedColumns.length) continue;
        if (includedRows.length !== span.rowIds.length || includedColumns.length !== span.columnIds.length) throw new TypeError("Export scope must not split a merged rectangle");
        projectedSpans.push(Object.freeze({ start: span.anchor, rowSpan: span.rowSpan, columnSpan: span.columnSpan }));
      }
      const values = rows.map((row, rowIndex) => Object.freeze(columns.map((column, columnIndex) => {
        const span = current.spans.cells.get(row.id)?.get(column.id); if (span && !equal(span.anchor, { rowId: row.id, columnId: column.id })) return null;
        const context = { grid, row, rowIndex, column, columnIndex, value: controller.getCellValue(row.id, column.id) };
        const value = grid.getOptions().getExportCellValue ? grid.getOptions().getExportCellValue!(context) : column.columnDef.exportValue ? column.columnDef.exportValue(context) : context.value;
        if (value instanceof Date) return new Date(value.getTime());
        if (value !== null && typeof value === "object" || typeof value === "function" || typeof value === "symbol") throw new TypeError("Export object values require an explicit formatter");
        return value;
      })));
      if (snapshotRevision !== operationRevision || sourceData !== grid.getOptions().data || sourceOptions !== grid.getOptions() || sourceState !== grid.getState()) throw new Error("Source changed while preparing layout export");
      return Object.freeze({ version: 1, revision: snapshotRevision, rowIds: Object.freeze(rowIds), columnIds: Object.freeze(columnIds), values: Object.freeze(values), spans: Object.freeze(projectedSpans) });
    },
    paste: (text, serialized) => {
      const current = getModel(), payload: LayoutClipboardPayload = serialized ? parseLayoutClipboardPayload(serialized) : { version: 1, blocks: [parseLayoutClipboardText(text)] };
      const targets = bounds(); if (!targets.length) return { attempted: 0, committed: 0, skipped: [], blocked: true };
      if (payload.blocks.length > 1 && payload.blocks.length !== targets.length) throw new TypeError("Clipboard blocks and destination ranges must match");
      const cells: Array<{ coordinate: CellCoordinate; raw: string }> = [];
      targets.forEach((range, index) => {
        const block = payload.blocks[payload.blocks.length === 1 ? 0 : index]!;
        const fill = block.values.length === 1 && block.values[0]!.length === 1;
        const height = fill ? range.r1 - range.r0 + 1 : block.values.length, width = fill ? range.c1 - range.c0 + 1 : block.values[0]!.length;
        if (range.r0 + height > current.rows.length || range.c0 + width > current.columns.length) throw new RangeError("Clipboard would exceed the current row/column boundary");
        if (payload.blocks.length > 1 && (height !== range.r1 - range.r0 + 1 || width !== range.c1 - range.c0 + 1)) throw new TypeError("Clipboard block shape does not match its range");
        if (cells.length + height * width > maxCells) throw new RangeError("Clipboard cell limit exceeded");
        for (let r = 0; r < height; r++) for (let c = 0; c < width; c++) cells.push({ coordinate: { rowId: current.rows[range.r0 + r]!.id, columnId: current.columns[range.c0 + c]!.id }, raw: block.values[fill ? 0 : r]![fill ? 0 : c]! });
      });
      return apply(cells, false);
    },
    cut: (write) => { const copy = controller.copy(), cells = selected().map((coordinate) => ({ coordinate, raw: "" })), cutRevision = operationRevision, sourceData = grid.getOptions().data, sourceOptions = grid.getOptions(), sourceState = grid.getState();
      // Write errors leave data untouched. The editing owner supplies one atomic draft boundary.
      const written = write(copy);
      if (written && (typeof written === "object" || typeof written === "function") && typeof (written as { then?: unknown }).then === "function") {
        void Promise.resolve(written).catch(() => {});
        throw new TypeError("Cut requires a synchronous clipboard writer; await asynchronous clipboard acceptance before calling cut");
      }
      if (cutRevision !== operationRevision || sourceData !== grid.getOptions().data || sourceOptions !== grid.getOptions() || sourceState !== grid.getState()) {
        message = "Selection or data changed before clearing the cut source"; publish();
        return { attempted: cells.length, committed: 0, skipped: cells.map(({ coordinate }) => ({ coordinate, reason: message! })), blocked: true };
      }
      return apply(cells, true);
    },
    fill: (value) => apply(selected().map((coordinate) => ({ coordinate, raw: value })), false),
    undo: () => { active(); editing = null; const result = options.editing?.undo() ?? false; publish(); return result; },
    redo: () => { active(); editing = null; const result = options.editing?.redo() ?? false; publish(); return result; },
    getCanReorder: () => Boolean(!disposed && !editing && options.acceptReorder && !options.editing?.getState().dirtyRowCount && !options.editing?.getState().pendingCount && grid.getOptions().getRowId && !grid.getOptions().getSubRows && !grid.getOptions().manualPagination && !grid.getOptions().manualSorting && !grid.getOptions().manualFiltering && !grid.getOptions().manualGrouping &&
      !grid.getState().sorting.length && !grid.getState().grouping.length && !grid.getState().columnFilters.length && !grid.getState().globalFilter && !grid.getState().filterExpression),
    reorder: (rowId, targetId, position = "before") => {
      active(); if (!controller.getCanReorder()) throw new Error("Reordering requires an unfiltered, unsorted flat client model and an immutable data owner");
      if (rowId === targetId) return;
      const current = getModel();
      if (!current.rowById.has(rowId) || !current.rowById.has(targetId)) throw new TypeError("Reorder rows must be in the current layout page");
      const core = grid.getCoreRowModel(), source = grid.getOptions().data, sourceOptions = grid.getOptions(), sourceState = grid.getState(), reorderRevision = operationRevision,
        from = core.rows.findIndex((row) => row.id === rowId), to = core.rows.findIndex((row) => row.id === targetId);
      if (from < 0 || to < 0) throw new TypeError("Reorder rows must be loaded roots");
      if ([...topPins, ...bottomPins].includes(rowId) || [...topPins, ...bottomPins].includes(targetId)) throw new Error("Unpin rows before reordering them");
      const moving = new Set([rowId]); let changed = true;
      while (changed) { changed = false; for (const span of spans) if (span.rowIds.some((id) => moving.has(id))) for (const id of span.rowIds) if (!moving.has(id)) { moving.add(id); changed = true; } }
      if (moving.has(targetId)) return;
      const movingRows = core.rows.filter((row) => moving.has(row.id)), remaining = core.rows.filter((row) => !moving.has(row.id));
      const insert = remaining.findIndex((row) => row.id === targetId) + (position === "after" ? 1 : 0), proposed = [...remaining]; proposed.splice(insert, 0, ...movingRows);
      const next = proposed.map((row) => source[row.index]!);
      // Index-based identity functions are not stable enough for ordering proposals.
      const getId = grid.getOptions().getRowId!;
      const sourceIds = new Map(source.map((item, index) => [item, core.rows[index]!.id]));
      next.forEach((item, index) => { if (getId(item, index) !== sourceIds.get(item)) throw new TypeError("Reorder must preserve row identities"); });
      const assertCurrent = () => { if (disposed || source !== grid.getOptions().data || sourceOptions !== grid.getOptions() || sourceState !== grid.getState() || reorderRevision !== operationRevision) throw new Error("Source changed during reorder preparation"); };
      assertCurrent();
      const page = grid.getState().pagination, start = page.pageIndex * page.pageSize;
      const top = topPins.flatMap((id) => proposed.find((row) => row.id === id) ? [proposed.find((row) => row.id === id)!] : []);
      const bottom = bottomPins.flatMap((id) => proposed.find((row) => row.id === id) ? [proposed.find((row) => row.id === id)!] : []);
      resolveLayoutSpans([...top, ...proposed.slice(start, start + page.pageSize).filter((row) => !topPins.includes(row.id) && !bottomPins.includes(row.id)), ...bottom], current.columns, spans,
        (id) => topPins.includes(id) ? "top" : bottomPins.includes(id) ? "bottom" : "center", details);
      if (!controller.getCanReorder()) throw new Error("Reordering became unavailable during preparation"); assertCurrent();
      options.acceptReorder!(Object.freeze(next)); message = "Row order updated"; publish();
    },
    moveRow: (rowId, direction) => {
      active(); const current = getModel(), index = current.rows.findIndex((row) => row.id === rowId);
      if (index < 0) throw new TypeError("Reorder row must be in the current layout");
      const moving = new Set([rowId]); let changed = true;
      while (changed) { changed = false; for (const span of spans) if (span.rowIds.some((id) => moving.has(id))) for (const id of span.rowIds) if (!moving.has(id)) { moving.add(id); changed = true; } }
      let targetIndex = index + direction;
      while (targetIndex >= 0 && targetIndex < current.rows.length && moving.has(current.rows[targetIndex]!.id)) targetIndex += direction;
      const neighbor = current.rows[targetIndex];
      if (neighbor) {
        const adjacent = new Set([neighbor.id]); let changed = true;
        while (changed) { changed = false; for (const span of spans) if (span.rowIds.some((id) => adjacent.has(id))) for (const id of span.rowIds) if (!adjacent.has(id)) { adjacent.add(id); changed = true; } }
        while (current.rows[targetIndex + direction] && adjacent.has(current.rows[targetIndex + direction]!.id)) targetIndex += direction;
      }
      const target = current.rows[targetIndex];
      if (target) controller.reorder(rowId, target.id, direction < 0 ? "before" : "after");
    },
    reconcile: () => {
      const current = getModel(), retained = ranges.filter((range) => [range.start, range.end].every((cell) => current.rowById.has(cell.rowId) && current.columnIndex.has(cell.columnId)));
      if (retained.length !== ranges.length) ranges = retained;
      if (editing && (!current.rowById.has(editing.coordinate.rowId) || !current.columnIndex.has(editing.coordinate.columnId))) { editing = null; token++; }
      if (details.size) {
        const loaded = new Set(grid.getCoreRowModel().flatRows.map((row) => row.id));
        if ([...details].some((id) => !loaded.has(id))) { details = new Set([...details].filter((id) => loaded.has(id))); model = undefined; }
      }
      publish();
    },
    subscribe: (listener) => { active(); listeners.add(listener); return () => { listeners.delete(listener); }; },
    dispose: () => { if (disposed) return; disposed = true; stopGrid(); stopEditing?.(); listeners.clear(); measurements.clear(); model = undefined; boundsModel = undefined; boundsRanges = undefined; cachedBounds = []; ranges = []; topPins = []; bottomPins = []; details.clear(); spans = []; editing = null;
      state = Object.freeze({ revision: ++revision, operationRevision: ++operationRevision, draftRevision, topPins: Object.freeze([]), bottomPins: Object.freeze([]), detailIds: Object.freeze([]), ranges: Object.freeze([]), focusedCell: null, editing: null, canUndo: false, canRedo: false, message: undefined }); },
  };
  getModel();
  const stopGrid = grid.subscribe(() => {
    try { controller.reconcile(); }
    catch (error) { message = error instanceof Error ? error.message : "Layout is unavailable"; editing = null; token++; publish(); }
  });
  let stopEditing: (() => void) | undefined;
  try {
    stopEditing = options.editing?.subscribe(() => { draftRevision++; publish(); });
    publish(); return controller;
  } catch (error) { controller.dispose(); throw error; }
}
