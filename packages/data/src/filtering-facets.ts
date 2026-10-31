import { compileFilterExpression, isISOCalendarDate, validateFilterExpression, type FilterColumnPolicy, type FilterExpression, type FilterNode, type FilterScalar, type FilterValueType } from "@rowick/core";
import { interruptible } from "./async-work";

export interface FacetValue { readonly value: FilterScalar; readonly count: number; }
export interface FacetResult {
  readonly values: readonly FacetValue[];
  readonly matchedRowCount: number;
  readonly scannedRowCount: number;
  readonly invalidValueCount: number;
  readonly distinctCountAtLeast: number;
  readonly truncated: boolean;
  readonly rowsTruncated: boolean;
  readonly valuesTruncated: boolean;
  readonly minimum: FilterScalar | undefined;
  readonly maximum: FilterScalar | undefined;
}
/** Removes target conditions, pruning empty groups. The remaining tree keeps its operators. */
export function excludeFacetColumn(expression: FilterExpression | null, columnId: string): FilterExpression {
  let visited = 0;
  const prune = (node: FilterNode, depth = 0): FilterNode | null => {
    if (++visited > 1_000 || depth > 16) throw new RangeError("Facet expression is too large");
    if (node.kind === "condition") return node.columnId === columnId ? null : node;
    const children = node.children.map((child) => prune(child, depth + 1)).filter((child): child is FilterNode => child !== null);
    return children.length ? { ...node, children } : null;
  };
  return { version: 1, root: expression?.root ? prune(expression.root) : null };
}
function validFacetValue(value: unknown, type: FilterValueType): value is FilterScalar {
  if (value === null) return true;
  if (type === "number") return typeof value === "number" && Number.isFinite(value);
  if (type === "boolean") return typeof value === "boolean";
  if (typeof value !== "string" || value.length > 1_000) return false;
  return type === "date" ? isISOCalendarDate(value) && Number(value.slice(0, 4)) > 0 : type === "decimal" ? /^[+-]?\d+(?:\.\d+)?$/.test(value) : true;
}
function compareFacetValue(left: FilterScalar, right: FilterScalar, type: FilterValueType): number {
  if (type === "decimal") {
    const parts = (value: string) => { const [integer = "0", fraction = ""] = value.replace(/^[+-]/, "").split("."); const whole = integer.replace(/^0+/, "") || "0", tail = fraction.replace(/0+$/, ""); return { whole, tail, negative: value.startsWith("-") && (whole !== "0" || tail.length > 0) }; };
    const a = parts(left as string), b = parts(right as string); if (a.negative !== b.negative) return a.negative ? -1 : 1;
    const length = Math.max(a.tail.length, b.tail.length), af = a.tail.padEnd(length, "0"), bf = b.tail.padEnd(length, "0");
    const result = a.whole.length !== b.whole.length ? a.whole.length - b.whole.length : a.whole !== b.whole ? a.whole < b.whole ? -1 : 1 : af === bf ? 0 : af < bf ? -1 : 1;
    return a.negative ? -result : result;
  }
  const a = type === "text" ? (left as string).toLowerCase() : left as string | number, b = type === "text" ? (right as string).toLowerCase() : right as string | number;
  return a === b ? 0 : a < b ? -1 : 1;
}
function facetKey(value: FilterScalar, type: FilterValueType): FilterScalar {
  if (value === null) return null;
  if (type === "text") return (value as string).toLowerCase();
  if (type === "decimal") {
    const text = value as string, [integer = "0", fraction = ""] = text.replace(/^[+-]/, "").split(".");
    const whole = integer.replace(/^0+/, "") || "0", tail = fraction.replace(/0+$/, "");
    return `${text.startsWith("-") && (whole !== "0" || tail.length) ? "-" : ""}${whole}${tail ? "." + tail : ""}`;
  }
  return value;
}
function bounded(value: number | undefined, fallback: number, maximum: number): number {
  const result = value ?? fallback;
  if (!Number.isSafeInteger(result) || result < 1 || result > maximum) throw new TypeError("Invalid facet limit");
  return result;
}
export function calculateFacets<TData>(rows: readonly TData[], columns: readonly FilterColumnPolicy[], columnId: string,
  getValue: (row: TData, columnId: string) => unknown,
  options: { expression?: FilterExpression | null; excludeOwnConditions?: boolean; maxValues?: number; maxRows?: number; query?: string } = {},
): FacetResult {
  const policy = columns.find((column) => column.id === columnId); if (!policy) throw new TypeError("Unknown facet column");
  const maximum = bounded(options.maxValues, 200, 10_000), maximumRows = bounded(options.maxRows, 100_000, 1_000_000);
  if (options.query !== undefined && (typeof options.query !== "string" || options.query.length > 1_000)) throw new TypeError("Invalid facet query");
  const query = options.query?.toLowerCase() ?? "";
  const expression = options.expression ? validateFilterExpression(options.expression, columns) : { version: 1 as const, root: null };
  const matches = compileFilterExpression(options.excludeOwnConditions === false ? expression : excludeFacetColumn(expression, columnId), columns);
  const values = new Map<FilterScalar, { value: FilterScalar; count: number }>(); let matched = 0, invalid = 0, extraDistinct = false;
  let minimum: FilterScalar | undefined, maximumValue: FilterScalar | undefined;
  const scanned = Math.min(rows.length, maximumRows);
  for (let index = 0; index < scanned; index++) {
    const row = rows[index]!; if (!matches((id) => getValue(row, id))) continue;
    matched++;
    const source = getValue(row, columnId), value = source == null ? null : source;
    if (!validFacetValue(value, policy.type)) { invalid++; continue; }
    if (value !== null && policy.type !== "boolean") {
      if (minimum === undefined || compareFacetValue(value, minimum, policy.type) < 0) minimum = value;
      if (maximumValue === undefined || compareFacetValue(value, maximumValue, policy.type) > 0) maximumValue = value;
    }
    if (query && !String(value ?? "").toLowerCase().includes(query)) continue;
    const id = facetKey(value, policy.type), existing = values.get(id);
    if (existing) existing.count++;
    else if (values.size < maximum) values.set(id, { value, count: 1 });
    else extraDistinct = true;
  }
  return Object.freeze({ values: Object.freeze([...values.values()].map((value) => Object.freeze(value))), matchedRowCount: matched, scannedRowCount: scanned,
    invalidValueCount: invalid, distinctCountAtLeast: values.size + (extraDistinct ? 1 : 0), truncated: extraDistinct || rows.length > maximumRows,
    rowsTruncated: rows.length > maximumRows, valuesTruncated: extraDistinct, minimum, maximum: maximumValue });
}
export interface FacetSearchRequest {
  readonly columnId: string; readonly query: string; readonly expression: FilterExpression;
  readonly limit: number; readonly signal: AbortSignal; readonly contextKey: string;
}
export interface FacetSearchState {
  readonly columnId: string | undefined; readonly query: string; readonly loading: boolean;
  readonly values: readonly FacetValue[]; readonly truncated: boolean; readonly error: string | undefined;
}
export interface FacetSearchController {
  getState: () => FacetSearchState;
  search: (columnId: string, query: string, expression: FilterExpression | null) => Promise<void>;
  retry: () => Promise<void> | null;
  invalidate: () => void;
  subscribe: (listener: () => void) => () => void;
  dispose: () => void;
}
/** One active result set/request, same-query dedupe, abort, timeout and context fences. */
export function createFacetSearchController(options: {
  columns: readonly FilterColumnPolicy[];
  search: (request: FacetSearchRequest) => Promise<{ values: readonly FacetValue[]; truncated?: boolean }>;
  getContextKey?: () => string;
  maxValues?: number;
  timeoutMs?: number;
}): FacetSearchController {
  const maximum = bounded(options.maxValues, 200, 10_000), timeout = bounded(options.timeoutMs, 30_000, 300_000);
  const listeners = new Set<() => void>(); let disposed = false, sequence = 0;
  let active: { key: string; controller: AbortController; promise: Promise<void> } | undefined;
  let last: { columnId: string; query: string; expression: FilterExpression } | undefined;
  let state: FacetSearchState = Object.freeze({ columnId: undefined, query: "", loading: false, values: Object.freeze([]), truncated: false, error: undefined });
  const publish = (next: FacetSearchState) => {
    if (disposed) return; state = Object.freeze(next);
    for (const listener of [...listeners]) if (listeners.has(listener)) { try { listener(); } catch (error) { queueMicrotask(() => { throw error; }); } }
  };
  const controller: FacetSearchController = {
    getState: () => state,
    search: (columnId, query, expression) => {
      if (disposed) throw new Error("Facet search is disposed");
      if (typeof query !== "string" || query.length > 1_000 || !options.columns.some((column) => column.id === columnId)) throw new TypeError("Invalid facet search");
      const validated = validateFilterExpression(expression ?? { version: 1, root: null }, options.columns);
      const scope = options.getContextKey?.() ?? "default", key = JSON.stringify([scope, columnId, query, validated]);
      if (active?.key === key) return active.promise;
      active?.controller.abort(); const request = new AbortController(), generation = ++sequence;
      last = { columnId, query, expression: validated };
      const promise = Promise.resolve().then(async () => {
        if (disposed || generation !== sequence) return;
        publish({ columnId, query, loading: true, values: Object.freeze([]), truncated: false, error: undefined });
        try {
          const result = await interruptible(() => options.search({ columnId, query, expression: validated, limit: maximum, signal: request.signal, contextKey: scope }), request, timeout);
          if (disposed || generation !== sequence || request.signal.aborted) return;
          if ((options.getContextKey?.() ?? "default") !== scope) { publish({ ...state, loading: false, values: Object.freeze([]), error: "Facet query changed; search again" }); return; }
          if (!Array.isArray(result?.values) || result.values.length > maximum) throw new TypeError("Too many facet values");
          const policy = options.columns.find((column) => column.id === columnId)!, seen = new Set<string>();
          const values = result.values.map((facet) => {
            validateFilterExpression({ version: 1, root: { kind: "condition", columnId, operator: "eq", value: facet.value } }, [{ id: policy.id, type: policy.type }]);
            const valueKey = JSON.stringify(facetKey(facet.value, policy.type));
            if (seen.has(valueKey) || !Number.isSafeInteger(facet.count) || facet.count < 0) throw new TypeError("Invalid facet value/count");
            seen.add(valueKey); return Object.freeze({ value: facet.value, count: facet.count });
          });
          publish({ columnId, query, loading: false, values: Object.freeze(values), truncated: result.truncated === true, error: undefined });
        } catch (error) {
          if (!disposed && generation === sequence) publish({ columnId, query, loading: false, values: Object.freeze([]), truncated: false, error: error instanceof Error ? error.message : "Facet search failed" });
        } finally { if (generation === sequence) active = undefined; }
      });
      active = { key, controller: request, promise }; return promise;
    },
    retry: () => last ? controller.search(last.columnId, last.query, last.expression) : null,
    invalidate: () => { if (disposed) return; sequence++; active?.controller.abort(); active = undefined; last = undefined;
      publish({ columnId: undefined, query: "", loading: false, values: Object.freeze([]), truncated: false, error: undefined }); },
    subscribe: (listener) => { if (disposed) throw new Error("Facet search is disposed"); listeners.add(listener); return () => { listeners.delete(listener); }; },
    dispose: () => { if (disposed) return; disposed = true; sequence++; active?.controller.abort(); active = undefined; last = undefined; listeners.clear();
      state = Object.freeze({ columnId: undefined, query: "", loading: false, values: Object.freeze([]), truncated: false, error: undefined }); },
  };
  return controller;
}
