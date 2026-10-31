import type { CellCoordinate, Column, Row } from "@rowick/core";
export interface LayoutCellSpan { readonly rowIds: readonly string[]; readonly columnIds: readonly string[]; }
export interface ResolvedLayoutSpan {
  readonly anchor: CellCoordinate;
  readonly rowIds: readonly string[];
  readonly columnIds: readonly string[];
  readonly rowSpan: number;
  readonly columnSpan: number;
  readonly startRow: number;
  readonly endRow: number;
}
export interface LayoutSpanModel {
  readonly spans: readonly ResolvedLayoutSpan[];
  readonly cells: ReadonlyMap<string, ReadonlyMap<string, ResolvedLayoutSpan>>;
}
/** Stable ID rectangles fail when sorting/filtering/pinning makes them noncontiguous. */
export function resolveLayoutSpans<TData>(rows: readonly Row<TData>[], columns: readonly Column<TData, unknown>[], spans: readonly LayoutCellSpan[],
  getPosition: (id: string) => "top" | "center" | "bottom", details: ReadonlySet<string>): LayoutSpanModel {
  if (spans.length > 128) throw new RangeError("Too many cell merges");
  const rowIndex = new Map(rows.map((row, index) => [row.id, index])), columnIndex = new Map(columns.map((column, index) => [column.id, index]));
  const cells = new Map<string, Map<string, ResolvedLayoutSpan>>(), resolved: ResolvedLayoutSpan[] = []; let total = 0;
  for (const span of spans) {
    if (!Array.isArray(span.rowIds) || !Array.isArray(span.columnIds) || !span.rowIds.length || !span.columnIds.length || span.rowIds.length > 64 || span.columnIds.length > 64 ||
      new Set(span.rowIds).size !== span.rowIds.length || new Set(span.columnIds).size !== span.columnIds.length || [...span.rowIds, ...span.columnIds].some((id) => typeof id !== "string" || !id.length)) throw new TypeError("Invalid merge IDs");
    if ((total += span.rowIds.length * span.columnIds.length) > 4_096) throw new RangeError("Merged cell budget exceeded");
    const indices = span.rowIds.map((id) => rowIndex.get(id));
    // A fully filtered/collapsed/off-page merge is inactive, never remapped to other rows.
    if (indices.every((index) => index === undefined)) continue;
    const first = indices[0], firstColumn = columnIndex.get(span.columnIds[0]!);
    if (first === undefined || firstColumn === undefined || indices.some((index, offset) => index !== first + offset) || span.columnIds.some((id, offset) => columnIndex.get(id) !== firstColumn + offset)) throw new TypeError("Merged rows/columns must remain available and contiguous");
    const position = getPosition(span.rowIds[0]!), pin = columns[firstColumn]!.getIsPinned();
    if (span.rowIds.some((id) => getPosition(id) !== position) || span.columnIds.some((id) => columns[columnIndex.get(id)!]!.getIsPinned() !== pin)) throw new TypeError("A merge cannot cross a pinned boundary");
    if (span.rowIds.some((id) => rows[rowIndex.get(id)!]!.getIsGrouped() || rows[rowIndex.get(id)!]!.getIsGroupFooter())) throw new TypeError("Synthetic group/footer cells cannot be merged");
    if (span.rowIds.length > 1 && span.rowIds.some((id) => details.has(id))) throw new TypeError("Collapse detail rows before applying a vertical merge");
    const item: ResolvedLayoutSpan = Object.freeze({ anchor: Object.freeze({ rowId: span.rowIds[0]!, columnId: span.columnIds[0]! }), rowIds: Object.freeze([...span.rowIds]), columnIds: Object.freeze([...span.columnIds]),
      rowSpan: span.rowIds.length, columnSpan: span.columnIds.length, startRow: first, endRow: first + span.rowIds.length - 1 });
    for (const id of span.rowIds) {
      const rowCells = cells.get(id) ?? new Map<string, ResolvedLayoutSpan>(); cells.set(id, rowCells);
      for (const columnId of span.columnIds) { if (rowCells.has(columnId)) throw new TypeError("Cell merges must not overlap"); rowCells.set(columnId, item); }
    }
    resolved.push(item);
  }
  // Overlapping row intervals can pull other anchors into the viewport. Bound that closure.
  let start = -1, end = -1;
  for (const span of [...resolved].sort((a, b) => a.startRow - b.startRow)) {
    if (span.startRow > end) { start = span.startRow; end = span.endRow; } else end = Math.max(end, span.endRow);
    if (end - start + 1 > 64) throw new RangeError("Merged viewport closure exceeds 64 rows");
  }
  return { spans: Object.freeze(resolved), cells };
}
