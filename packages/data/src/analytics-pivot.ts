export type PivotScalar = string | number | boolean | null;
export type PivotOperation = "sum" | "avg" | "min" | "max" | "count" | "distinct-count";
export interface PivotField<TData> { readonly id: string; readonly label: string; readonly getValue: (row: TData) => unknown; }
export interface PivotMetric { readonly id: string; readonly label: string; readonly columnId?: string; readonly operation: PivotOperation; }
export interface PivotConfiguration {
  readonly version: 1;
  readonly rowAxes: readonly string[];
  readonly columnAxes: readonly string[];
  readonly metrics: readonly PivotMetric[];
  readonly subtotals?: boolean;
  readonly rowTotals?: boolean;
  readonly sort?: readonly { readonly axis: "rows" | "columns"; readonly index: number; readonly desc?: boolean }[];
}
export interface PivotLimits { readonly maxInputRows?: number; readonly maxRows?: number; readonly maxColumns?: number; readonly maxCells?: number; readonly maxGroups?: number; readonly maxDistinctPerCell?: number; readonly maxDistinctValues?: number; readonly maxKeyCharacters?: number; }
export interface PivotColumn { readonly id: string; readonly values: readonly PivotScalar[]; readonly metric: PivotMetric; readonly headers: readonly string[]; readonly total: boolean; }
export interface PivotRow { readonly id: string; readonly values: readonly PivotScalar[]; readonly kind: "data" | "subtotal" | "grand-total"; readonly depth: number; readonly cells: Readonly<Record<string, PivotScalar>>; }
export interface PivotResult { readonly configuration: PivotConfiguration; readonly columns: readonly PivotColumn[]; readonly rows: readonly PivotRow[]; readonly grandTotal: PivotRow; readonly inputRows: number; readonly groupCount: number; readonly cellCount: number; }
const operations: readonly PivotOperation[] = ["sum", "avg", "min", "max", "count", "distinct-count"];
const object = (input: unknown): input is Record<string, unknown> => !!input && typeof input === "object" && !Array.isArray(input) && [Object.prototype, null].includes(Object.getPrototypeOf(input)) && Object.values(Object.getOwnPropertyDescriptors(input)).every((descriptor) => Object.hasOwn(descriptor, "value"));
const dense = (input: unknown): input is unknown[] => Array.isArray(input) && Object.getPrototypeOf(input) === Array.prototype && Object.keys(input).length === input.length &&
  Object.keys(input).every((key) => /^(0|[1-9]\d*)$/.test(key) && Object.hasOwn(Object.getOwnPropertyDescriptor(input, key)!, "value"));
const scalar = (input: unknown): PivotScalar => {
  if (input == null) return null;
  if (typeof input === "string" && input.length <= 10_000 || typeof input === "boolean" || typeof input === "number" && Number.isFinite(input)) return input;
  throw new TypeError("Pivot values must be finite JSON scalars; provide an explicit accessor for dates/objects");
};
const label = (value: PivotScalar) => value === null ? "(empty)" : String(value);
const compare = (left: PivotScalar, right: PivotScalar): number => {
  if (left === right) return 0;
  if (left === null) return -1; if (right === null) return 1;
  const rank = (value: PivotScalar) => typeof value === "boolean" ? 0 : typeof value === "number" ? 1 : 2;
  if (rank(left) !== rank(right)) return rank(left) - rank(right);
  return left < right ? -1 : 1;
};
function fieldsById<TData>(fields: readonly PivotField<TData>[]) {
  const result = new Map<string, PivotField<TData>>();
  for (const field of fields) {
    if (!field || typeof field.id !== "string" || !field.id.length || field.id.length > 1_000 || typeof field.label !== "string" || !field.label.length || field.label.length > 1_000 || typeof field.getValue !== "function" || result.has(field.id)) throw new TypeError("Invalid pivot field definition");
    result.set(field.id, field);
  }
  return result;
}
/** Produces an immutable, schema-checked saved pivot configuration. */
export function validatePivotConfiguration<TData>(input: unknown, fields: readonly PivotField<TData>[]): PivotConfiguration {
  const available = fieldsById(fields);
  if (!object(input) || input.version !== 1 || Object.keys(input).some((key) => !["version", "rowAxes", "columnAxes", "metrics", "subtotals", "rowTotals", "sort"].includes(key))) throw new TypeError("Unsupported pivot configuration");
  const axes = (value: unknown): readonly string[] => {
    if (!dense(value) || value.length > 8 || new Set(value).size !== value.length || value.some((id) => typeof id !== "string" || !available.has(id))) throw new TypeError("Unknown or duplicate pivot axis");
    return Object.freeze([...value]) as readonly string[];
  };
  const rowAxes = axes(input.rowAxes), columnAxes = axes(input.columnAxes);
  if (rowAxes.some((id) => columnAxes.includes(id))) throw new TypeError("A pivot field cannot be on both axes");
  if (!dense(input.metrics) || !input.metrics.length || input.metrics.length > 16) throw new TypeError("Pivot requires 1–16 metrics");
  const ids = new Set<string>();
  const metrics: PivotMetric[] = input.metrics.map((metric: unknown) => {
    if (!object(metric) || Object.keys(metric).some((key) => !["id", "label", "columnId", "operation"].includes(key)) || typeof metric.id !== "string" || !metric.id.length || metric.id.length > 1_000 || ids.has(metric.id) || typeof metric.label !== "string" || !metric.label.length || metric.label.length > 1_000 || !operations.includes(metric.operation as PivotOperation) ||
      (metric.operation !== "count" && (typeof metric.columnId !== "string" || !available.has(metric.columnId))) || (metric.columnId !== undefined && (typeof metric.columnId !== "string" || !available.has(metric.columnId)))) throw new TypeError("Invalid pivot metric");
    ids.add(metric.id); return Object.freeze({ id: metric.id, label: metric.label, operation: metric.operation as PivotOperation, ...(metric.columnId !== undefined ? { columnId: metric.columnId as string } : {}) });
  });
  for (const property of ["subtotals", "rowTotals"]) if (input[property] !== undefined && typeof input[property] !== "boolean") throw new TypeError("Invalid pivot total option");
  if (input.sort !== undefined && (!dense(input.sort) || input.sort.length > 16)) throw new TypeError("Invalid pivot sorting");
  const sort = (input.sort as unknown[] | undefined)?.map((rule) => {
    if (!object(rule) || Object.keys(rule).some((key) => !["axis", "index", "desc"].includes(key)) || rule.axis !== "rows" && rule.axis !== "columns" || !Number.isInteger(rule.index) || Number(rule.index) < 0 || Number(rule.index) >= (rule.axis === "rows" ? rowAxes : columnAxes).length || rule.desc !== undefined && typeof rule.desc !== "boolean") throw new TypeError("Invalid pivot sort rule");
    return Object.freeze({ axis: rule.axis, index: rule.index as number, ...(rule.desc !== undefined ? { desc: rule.desc as boolean } : {}) }) as { axis: "rows" | "columns"; index: number; desc?: boolean };
  });
  const configuration: PivotConfiguration = Object.freeze({ version: 1, rowAxes, columnAxes, metrics: Object.freeze(metrics), ...(input.subtotals !== undefined ? { subtotals: input.subtotals as boolean } : {}),
    ...(input.rowTotals !== undefined ? { rowTotals: input.rowTotals as boolean } : {}), ...(sort ? { sort: Object.freeze(sort) } : {}) });
  if (JSON.stringify(configuration).length > 65_536) throw new RangeError("Pivot configuration is too large");
  return configuration;
}
export function serializePivotConfiguration<TData>(configuration: unknown, fields: readonly PivotField<TData>[]): string { return JSON.stringify(validatePivotConfiguration(configuration, fields)); }
export function parsePivotConfiguration<TData>(serialized: string, fields: readonly PivotField<TData>[]): PivotConfiguration {
  if (typeof serialized !== "string" || serialized.length > 65_536) throw new RangeError("Pivot configuration is too large");
  return validatePivotConfiguration(JSON.parse(serialized), fields);
}
interface Accumulator { count: number; sum: number; correction: number; min: number | null; max: number | null; distinct: Set<string> | undefined; }
interface Group { values: readonly PivotScalar[]; buckets: Map<string, Accumulator[]>; total: Accumulator[]; }
/** Bounded client pivot. Supply filtered rows; no backing row data is retained. */
export function createPivot<TData>(rows: Iterable<TData>, fields: readonly PivotField<TData>[], configuration: unknown, limits: PivotLimits = {}): PivotResult {
  const config = validatePivotConfiguration(configuration, fields), available = fieldsById(fields);
  const bounded = (value: number | undefined, fallback: number, max: number) => { const result = value ?? fallback; if (!Number.isSafeInteger(result) || result < 1 || result > max) throw new TypeError("Invalid pivot limit"); return result; };
  const maxInputRows = bounded(limits.maxInputRows, 100_000, 1_000_000), maxRows = bounded(limits.maxRows, 10_000, 100_000), maxColumns = bounded(limits.maxColumns, 200, 2_000);
  const maxCells = bounded(limits.maxCells, 1_000_000, 5_000_000), maxGroups = bounded(limits.maxGroups, 20_000, 100_000), maxDistinct = bounded(limits.maxDistinctPerCell, 10_000, 100_000);
  const maxDistinctValues = bounded(limits.maxDistinctValues, 100_000, 1_000_000), maxKeyCharacters = bounded(limits.maxKeyCharacters, 8_000_000, 64_000_000);
  const tuples = new Map<string, readonly PivotScalar[]>(), groups = new Map<string, Group>(); let inputRows = 0, accumulatorCount = 0, distinctValues = 0, keyCharacters = 0;
  const claimKey = (key: string) => { if ((keyCharacters += key.length) > maxKeyCharacters) throw new RangeError("Pivot key-character budget reached"); };
  const allocate = () => {
    if ((accumulatorCount += config.metrics.length) > maxCells) throw new RangeError("Pivot cell limit reached");
    return config.metrics.map((metric): Accumulator => ({ count: 0, sum: 0, correction: 0, min: null, max: null, distinct: metric.operation === "distinct-count" ? new Set() : undefined }));
  };
  const group = (values: readonly PivotScalar[]) => {
    const key = JSON.stringify(values); let result = groups.get(key);
    if (!result) { if (groups.size >= maxGroups) throw new RangeError("Pivot group limit reached"); claimKey(key); result = { values: Object.freeze([...values]), buckets: new Map(), total: allocate() }; groups.set(key, result); }
    return result;
  };
  const grand = group([]);
  const update = (cells: Accumulator[], values: readonly PivotScalar[]) => {
    config.metrics.forEach((metric, index) => {
      const cell = cells[index]!, value = values[index]!;
      if (metric.operation === "count") { cell.count++; return; }
      if (value === null) return;
      if (metric.operation === "distinct-count") {
        const key = JSON.stringify(value); if (!cell.distinct!.has(key)) { if (++distinctValues > maxDistinctValues) throw new RangeError("Pivot total distinct-value limit reached"); claimKey(key); cell.distinct!.add(key); } if (cell.distinct!.size > maxDistinct) throw new RangeError("Pivot distinct-value limit reached"); return;
      }
      if (typeof value !== "number") throw new TypeError("Numeric pivot aggregation requires finite numbers");
      cell.count++; const adjusted = value - cell.correction, sum = cell.sum + adjusted; cell.correction = (sum - cell.sum) - adjusted; cell.sum = sum;
      if (!Number.isFinite(cell.sum)) throw new RangeError("Pivot aggregate exceeds the finite numeric range");
      cell.min = cell.min === null ? value : Math.min(cell.min, value); cell.max = cell.max === null ? value : Math.max(cell.max, value);
    });
  };
  for (const row of rows) {
    if (++inputRows > maxInputRows) throw new RangeError("Pivot input row limit reached; use server aggregation");
    const rowValues = config.rowAxes.map((id) => scalar(available.get(id)!.getValue(row))), columnValues = config.columnAxes.map((id) => scalar(available.get(id)!.getValue(row)));
    const columnKey = JSON.stringify(columnValues);
    if (!tuples.has(columnKey)) {
      if ((tuples.size + 1 + (config.rowTotals && config.columnAxes.length ? 1 : 0)) * config.metrics.length > maxColumns) throw new RangeError("Pivot result column limit reached");
      claimKey(columnKey);
      tuples.set(columnKey, Object.freeze(columnValues));
    }
    const values = config.metrics.map((metric) => metric.columnId ? scalar(available.get(metric.columnId)!.getValue(row)) : null);
    const targets = [grand];
    if (rowValues.length) {
      if (config.subtotals) for (let size = 1; size < rowValues.length; size++) targets.push(group(rowValues.slice(0, size)));
      targets.push(group(rowValues));
    }
    for (const target of targets) {
      let bucket = target.buckets.get(columnKey); if (!bucket) { bucket = allocate(); target.buckets.set(columnKey, bucket); }
      update(bucket, values); update(target.total, values);
    }
  }
  if (!tuples.size && !config.columnAxes.length) tuples.set("[]", Object.freeze([]));
  const compareTuple = (axis: "rows" | "columns", left: readonly PivotScalar[], right: readonly PivotScalar[]) => {
    const explicit = config.sort?.filter((rule) => rule.axis === axis) ?? [];
    for (const rule of explicit) { const order = compare(left[rule.index] ?? null, right[rule.index] ?? null); if (order) return rule.desc ? -order : order; }
    for (let index = 0; index < Math.min(left.length, right.length); index++) { const order = compare(left[index]!, right[index]!); if (order) return order; }
    return left.length - right.length;
  };
  const columns: PivotColumn[] = [...tuples.values()].sort((a, b) => compareTuple("columns", a, b)).flatMap((values) => config.metrics.map((metric) => Object.freeze({
    id: `pivot:${JSON.stringify([values, metric.id])}`, values, metric, headers: Object.freeze([...values.map(label), metric.label]), total: false,
  })));
  if (config.rowTotals && config.columnAxes.length) for (const metric of config.metrics) columns.push(Object.freeze({ id: `pivot-total:${JSON.stringify(metric.id)}`, values: Object.freeze([]), metric, headers: Object.freeze(["Total", metric.label]), total: true }));
  if (columns.length > maxColumns) throw new RangeError("Pivot result column limit reached");
  const finalize = (cell: Accumulator | undefined, metric: PivotMetric): PivotScalar => {
    if (metric.operation === "count") return cell?.count ?? 0;
    if (metric.operation === "distinct-count") return cell?.distinct?.size ?? 0;
    if (!cell?.count) return null;
    return metric.operation === "sum" ? cell.sum : metric.operation === "avg" ? cell.sum / cell.count : metric.operation === "min" ? cell.min : cell.max;
  };
  const finish = (source: Group, kind: PivotRow["kind"]): PivotRow => {
    const cells = Object.create(null) as Record<string, PivotScalar>;
    for (const column of columns) {
      const index = config.metrics.indexOf(column.metric), bucket = column.total ? source.total : source.buckets.get(JSON.stringify(column.values));
      cells[column.id] = finalize(bucket?.[index], column.metric);
    }
    return Object.freeze({ id: `pivot-row:${JSON.stringify(source.values)}`, values: source.values, kind, depth: source.values.length, cells: Object.freeze(cells) });
  };
  interface Branch { values: readonly PivotScalar[]; children: Map<string, Branch>; source?: Group; }
  const root: Branch = { values: [], children: new Map() }; let branches = 1;
  for (const entry of groups.values()) {
    if (entry === grand || entry.values.length !== config.rowAxes.length) continue;
    let branch = root;
    for (let depth = 0; depth < entry.values.length; depth++) {
      const key = JSON.stringify(entry.values[depth]); let child = branch.children.get(key);
      if (!child) { if (++branches > maxGroups) throw new RangeError("Pivot group limit reached"); child = { values: entry.values.slice(0, depth + 1), children: new Map() }; branch.children.set(key, child); }
      branch = child;
    }
    branch.source = entry;
  }
  const output: PivotRow[] = [];
  const walk = (branch: Branch) => {
    for (const child of [...branch.children.values()].sort((a, b) => compareTuple("rows", a.values, b.values))) walk(child);
    if (branch.source) output.push(finish(branch.source, "data"));
    else if (config.subtotals && branch !== root) { const subtotal = groups.get(JSON.stringify(branch.values)); if (subtotal) output.push(finish(subtotal, "subtotal")); }
    if (output.length + 1 > maxRows) throw new RangeError("Pivot result row limit reached");
  };
  walk(root);
  const grandTotal = finish(grand, "grand-total"); output.push(grandTotal);
  if (output.length > maxRows || output.length * columns.length > maxCells) throw new RangeError("Pivot result size limit reached");
  return Object.freeze({ configuration: config, columns: Object.freeze(columns), rows: Object.freeze(output), grandTotal, inputRows, groupCount: groups.size, cellCount: output.length * columns.length });
}
