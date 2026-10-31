import type { AnalyticsController } from "./analytics-controller";
import type { PivotMetric, PivotRow } from "./analytics-pivot";
export interface AnalyticsLabels {
  panel: string; rowAxes: string; columnAxes: string; metrics: string; operation: string; valueField: string; countRows: string;
  addMetric: string; removeMetric: string; apply: string; reset: string; saveView: string; restoreView: string;
  subtotals: string; rowTotals: string; descendingRows: string; descendingColumns: string;
  results: string; row: string; previousRows: string; nextRows: string; previousColumns: string; nextColumns: string;
  exportScope: string; pivotScope: string; recordScope: string; cancelExport: string; progress: string;
  export: (format: string) => string; summary: (rows: number, columns: number) => string; page: (rowPage: number, rowPages: number, columnPage: number, columnPages: number) => string;
  axisOrder: (label: string) => string; moveAxis: (axis: "rows" | "columns", label: string, direction: "up" | "down") => string;
  rowLabel: (row: PivotRow) => string; exportStatus: (status: string, rows: number) => string;
}
export const defaultAnalyticsLabels: AnalyticsLabels = Object.freeze({
  panel: "Pivot and export", rowAxes: "Row axes", columnAxes: "Column axes", metrics: "Metrics", operation: "Operation", valueField: "Value field", countRows: "Rows (count only)",
  addMetric: "Add metric", removeMetric: "Remove metric", apply: "Apply pivot", reset: "Reset pivot", saveView: "Save pivot view", restoreView: "Restore pivot view",
  subtotals: "Subtotals", rowTotals: "Row totals", descendingRows: "Descending rows", descendingColumns: "Descending columns",
  results: "Pivot results", row: "Rows", previousRows: "Previous rows", nextRows: "Next rows", previousColumns: "Previous columns", nextColumns: "Next columns",
  exportScope: "Export scope", pivotScope: "Pivot result", recordScope: "Filtered records", cancelExport: "Cancel export", progress: "Export progress",
  export: (format: string) => format === "print" ? "Print layout" : `Export ${format.toUpperCase()}`,
  axisOrder: (label: string) => `${label} order`, moveAxis: (axis: "rows" | "columns", label: string, direction: "up" | "down") => `Move ${axis === "rows" ? "row" : "column"} axis ${label} ${direction}`,
  summary: (rows: number, columns: number) => `${rows} pivot rows, ${columns} result columns`,
  page: (rowPage: number, rowPages: number, columnPage: number, columnPages: number) => `Rows page ${rowPage} of ${rowPages}; columns page ${columnPage} of ${columnPages}`,
  rowLabel: (row: PivotRow) => row.kind === "grand-total" ? "Grand total" : row.values.map((value) => value === null ? "(empty)" : String(value)).join(" / ") + (row.kind === "subtotal" ? " subtotal" : ""),
  exportStatus: (status: string, rows: number) => `Export ${status}: ${rows} rows`,
});
export const analyticsOperations = Object.freeze(["sum", "avg", "min", "max", "count", "distinct-count"] as const);
export function updateAnalyticsMetric<TData>(controller: AnalyticsController<TData>, index: number, change: Partial<PivotMetric>): boolean {
  const metrics = controller.getState().draft.metrics;
  if (!Number.isSafeInteger(index) || index < 0 || index >= metrics.length) throw new RangeError("Invalid metric index");
  return controller.setMetrics(metrics.map((metric, position) => index === position ? { ...metric, ...change } : metric));
}
export function addAnalyticsMetric<TData>(controller: AnalyticsController<TData>): boolean {
  const metrics = controller.getState().draft.metrics; let sequence = metrics.length + 1;
  while (metrics.some((metric) => metric.id === `metric:${sequence}`)) sequence++;
  return controller.setMetrics([...metrics, { id: `metric:${sequence}`, label: `Count ${sequence}`, operation: "count" }]);
}
export function setAnalyticsAxisSelection<TData>(controller: AnalyticsController<TData>, axis: "rows" | "columns", selected: readonly string[]): boolean {
  const draft = controller.getState().draft, previous = axis === "rows" ? draft.rowAxes : draft.columnAxes;
  return controller.setAxes(axis, [...previous.filter((id) => selected.includes(id)), ...selected.filter((id) => !previous.includes(id))]);
}
export function moveAnalyticsAxis<TData>(controller: AnalyticsController<TData>, axis: "rows" | "columns", index: number, direction: "up" | "down"): boolean {
  const draft = controller.getState().draft, values = [...(axis === "rows" ? draft.rowAxes : draft.columnAxes)], target = index + (direction === "up" ? -1 : 1);
  if (!Number.isSafeInteger(index) || index < 0 || index >= values.length || !["up", "down"].includes(direction)) throw new RangeError("Invalid axis reorder");
  if (target < 0 || target >= values.length) return false;
  [values[index], values[target]] = [values[target]!, values[index]!]; return controller.setAxes(axis, values);
}
