import { getOrderableLeafColumns, orderLeafColumns, validateFilterExpression, type FilterColumnPolicy, type FilterExpression, type Grid, type GridState } from "@rowick/core";

export interface SavedViewLayout {
  readonly columnVisibility: Readonly<GridState["columnVisibility"]>;
  readonly columnSizing: Readonly<GridState["columnSizing"]>;
  readonly columnOrder: readonly string[];
  readonly columnPinning: { readonly left: readonly string[]; readonly right: readonly string[] };
}
export interface SavedViewQuery {
  readonly sorting: readonly Readonly<GridState["sorting"][number]>[];
  readonly columnFilters: readonly Readonly<GridState["columnFilters"][number]>[];
  readonly globalFilter: string;
  readonly grouping: readonly string[];
  readonly filterExpression: FilterExpression | null;
}
export interface SavedGridView {
  readonly version: 1;
  readonly id: string;
  readonly name: string;
  readonly preferences: {
    readonly version: 1;
    readonly density: "compact" | "standard" | "comfortable";
    readonly state: SavedViewLayout;
  };
  readonly query: SavedViewQuery;
  readonly pageSize: number;
}
export interface SavedViewMigration { readonly fromVersion: number; readonly toVersion: number; readonly migrate: (input: Readonly<Record<string, unknown>>) => unknown; }
export interface SavedViewSchema {
  readonly columnIds: readonly string[];
  readonly filterColumns: readonly FilterColumnPolicy[];
  readonly sortableColumnIds?: readonly string[];
  readonly groupableColumnIds?: readonly string[];
  readonly migrations?: readonly SavedViewMigration[];
}
function record(input: unknown, allowed?: readonly string[]): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input) || ![null, Object.prototype].includes(Object.getPrototypeOf(input)) ||
    Reflect.ownKeys(input).some((key) => typeof key !== "string" || (allowed && !allowed.includes(key))) ||
    Object.values(Object.getOwnPropertyDescriptors(input)).some((descriptor) => !Object.hasOwn(descriptor, "value"))) throw new TypeError("Invalid saved view object");
  return input as Record<string, unknown>;
}
const own = (input: object, id: string) => Object.hasOwn(input, id);
const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
function array(input: unknown, maximum: number): unknown[] {
  if (!Array.isArray(input) || Object.getPrototypeOf(input) !== Array.prototype || input.length > maximum || Reflect.ownKeys(input).some((key) => key !== "length" && (typeof key !== "string" || !/^(0|[1-9]\d*)$/.test(key)))) throw new TypeError("Invalid saved view array");
  for (let index = 0; index < input.length; index++) if (!Object.hasOwn(input, index) || !Object.hasOwn(Object.getOwnPropertyDescriptor(input, index)!, "value")) throw new TypeError("Sparse or accessor saved view array");
  return input;
}
function jsonValue(value: unknown, depth = 0): unknown {
  if (depth > 8) throw new RangeError("Saved filter value is too deep");
  if (value === null || typeof value === "boolean" || typeof value === "string" || typeof value === "number" && Number.isFinite(value)) return value;
  if (Array.isArray(value)) {
    return array(value, 1_000).map((item) => jsonValue(item, depth + 1));
  }
  const source = record(value); if (Object.keys(source).length > 200) throw new RangeError("Saved filter object is too large");
  return Object.fromEntries(Object.entries(source).map(([id, item]) => [id, jsonValue(item, depth + 1)]));
}
function list(input: unknown, validIds: ReadonlySet<string>): string[] {
  const result = array(input, 1_000).map((id) => { if (typeof id !== "string" || !validIds.has(id)) throw new TypeError("Saved view references an unavailable column"); return id; });
  if (new Set(result).size !== result.length) throw new TypeError("Duplicate saved column");
  return result;
}
function freeze<T>(value: T): T { if (value && typeof value === "object") { for (const item of Object.values(value)) freeze(item); Object.freeze(value); } return value; }
export function getSavedViewSchema<TData>(grid: Grid<TData>): SavedViewSchema {
  const columns = grid.getAllLeafColumns();
  return { columnIds: columns.map((column) => column.id), filterColumns: grid.getFilterColumnPolicies(),
    sortableColumnIds: columns.filter((column) => column.getCanSort()).map((column) => column.id), groupableColumnIds: columns.filter((column) => column.getCanGroup()).map((column) => column.id) };
}
/** Strict schema validation: a removed filter column rejects the whole restore. */
export function validateSavedGridView(input: unknown, schema: SavedViewSchema): SavedGridView {
  let source = record(input), attempts = 0;
  while (source.version !== 1) {
    const migration = schema.migrations?.find((migration) => migration.fromVersion === source.version);
    if (!migration || ++attempts > 8 || migration.toVersion <= migration.fromVersion) throw new TypeError("Unsupported saved view version");
    source = record(migration.migrate(freeze(jsonValue(source) as Record<string, unknown>)));
    if (source.version !== migration.toVersion) throw new TypeError("Saved view migration returned the wrong version");
  }
  record(source, ["version", "id", "name", "preferences", "query", "pageSize"]);
  if (typeof source.id !== "string" || !source.id.trim() || source.id.length > 128 || typeof source.name !== "string" || !source.name.trim() || source.name.length > 128) throw new TypeError("Saved view needs an ID and name");
  const validIds = new Set(schema.columnIds), filterIds = new Set(schema.filterColumns.map((column) => column.id));
  if (validIds.size !== schema.columnIds.length || [...validIds].some((id) => typeof id !== "string" || !id.length)) throw new TypeError("Invalid saved view schema");
  const preferences = record(source.preferences, ["version", "density", "state"]), state = record(preferences.state, ["columnVisibility", "columnSizing", "columnOrder", "columnPinning"]);
  if (preferences.version !== 1 || !["compact", "standard", "comfortable"].includes(preferences.density as string)) throw new TypeError("Invalid layout preferences version or density");
  const visibility = record(state.columnVisibility), sizing = record(state.columnSizing), pinning = record(state.columnPinning, ["left", "right"]);
  for (const [id, value] of Object.entries(visibility)) if (!validIds.has(id) || typeof value !== "boolean") throw new TypeError("Invalid saved visibility");
  for (const [id, value] of Object.entries(sizing)) if (!validIds.has(id) || typeof value !== "number" || !Number.isFinite(value) || value <= 0 || value > 100_000) throw new TypeError("Invalid saved width");
  if (schema.columnIds.length && schema.columnIds.every((id) => own(visibility, id) && visibility[id] === false)) throw new TypeError("Saved view must leave a visible column");
  const left = list(pinning.left, validIds), right = list(pinning.right, validIds);
  if (right.some((id) => left.includes(id))) throw new TypeError("Saved view pins a column twice");
  const query = record(source.query, ["sorting", "columnFilters", "globalFilter", "grouping", "filterExpression"]);
  if (typeof query.globalFilter !== "string" || query.globalFilter.length > 1_000) throw new TypeError("Invalid saved query");
  const sortingIds = new Set(schema.sortableColumnIds ?? schema.columnIds), seenSort = new Set<string>();
  const sorting = array(query.sorting, 100).map((rule) => { const item = record(rule, ["id", "desc"]); if (typeof item.id !== "string" || !sortingIds.has(item.id) || seenSort.has(item.id) || (item.desc !== undefined && typeof item.desc !== "boolean")) throw new TypeError("Invalid saved sorting"); seenSort.add(item.id); return { id: item.id, desc: item.desc === true }; });
  const seenFilter = new Set<string>();
  const columnFilters = array(query.columnFilters, 200).map((filter) => { const item = record(filter, ["id", "value"]); if (typeof item.id !== "string" || !filterIds.has(item.id) || seenFilter.has(item.id) || !own(item, "value")) throw new TypeError("Invalid saved column filter"); seenFilter.add(item.id); return { id: item.id, value: jsonValue(item.value) }; });
  const filterExpression = query.filterExpression === null ? null : validateFilterExpression(query.filterExpression, schema.filterColumns);
  if (typeof source.pageSize !== "number" || !Number.isSafeInteger(source.pageSize) || source.pageSize < 1 || source.pageSize > 100_000) throw new TypeError("Invalid saved page size");
  const result: SavedGridView = { version: 1, id: source.id, name: source.name,
    preferences: { version: 1, density: preferences.density as SavedGridView["preferences"]["density"], state: { columnVisibility: copy(visibility) as GridState["columnVisibility"], columnSizing: copy(sizing) as GridState["columnSizing"], columnOrder: list(state.columnOrder, validIds), columnPinning: { left, right } } },
    query: { sorting, columnFilters, globalFilter: query.globalFilter, grouping: list(query.grouping, new Set(schema.groupableColumnIds ?? schema.columnIds)), filterExpression }, pageSize: source.pageSize };
  if (JSON.stringify(result).length > 262_144) throw new RangeError("Saved view is too large");
  return freeze(result);
}
export function createSavedGridView<TData>(grid: Grid<TData>, options: { id: string; name: string; density?: SavedGridView["preferences"]["density"] }): SavedGridView {
  const state = grid.getState();
  return validateSavedGridView({ version: 1, id: options.id, name: options.name,
    preferences: { version: 1, density: options.density ?? "standard", state: { columnVisibility: state.columnVisibility, columnSizing: state.columnSizing, columnOrder: state.columnOrder, columnPinning: state.columnPinning } },
    query: { sorting: state.sorting, columnFilters: state.columnFilters, globalFilter: state.globalFilter, grouping: state.grouping, filterExpression: state.filterExpression }, pageSize: state.pagination.pageSize }, getSavedViewSchema(grid));
}
export function applySavedGridView<TData>(grid: Grid<TData>, input: unknown, options: { migrations?: readonly SavedViewMigration[]; canConfigureColumn?: (id: string) => boolean } = {}): SavedGridView {
  const schema = getSavedViewSchema(grid), view = validateSavedGridView(input, { ...schema, ...(options.migrations ? { migrations: options.migrations } : {}) });
  const previous = grid.getState(), target = view.preferences.state;
  // Partial orders append omitted columns in definition order, not the current
  // displayed order. Compare their resolved positions, including hidden leaves.
  const columns = getOrderableLeafColumns(grid.getAllColumns());
  const positions = (order: readonly string[]) => new Map(orderLeafColumns(columns, order).map((column, index) => [column.id, index]));
  const previousPositions = positions(previous.columnOrder), targetPositions = positions(target.columnOrder);
  for (const id of schema.columnIds) if (options.canConfigureColumn?.(id) === false && (
    (previous.columnVisibility[id] !== false) !== (target.columnVisibility[id] !== false) || previous.columnSizing[id] !== target.columnSizing[id] ||
    previousPositions.get(id) !== targetPositions.get(id) || previous.columnPinning.left.includes(id) !== target.columnPinning.left.includes(id) || previous.columnPinning.right.includes(id) !== target.columnPinning.right.includes(id))) throw new TypeError("Saved view changes a protected column");
  grid.setState((state) => ({ ...state,
    columnVisibility: { ...target.columnVisibility }, columnSizing: { ...target.columnSizing }, columnOrder: [...target.columnOrder], columnPinning: { left: [...target.columnPinning.left], right: [...target.columnPinning.right] },
    sorting: view.query.sorting.map((rule) => ({ ...rule })), columnFilters: view.query.columnFilters.map((filter) => ({ ...filter, value: copy(filter.value) })),
    globalFilter: view.query.globalFilter, grouping: [...view.query.grouping], filterExpression: view.query.filterExpression, pagination: { pageIndex: 0, pageSize: view.pageSize } }));
  return view;
}
export function serializeSavedGridView(view: unknown, schema: SavedViewSchema): string { return JSON.stringify(validateSavedGridView(view, schema)); }
export function parseSavedGridView(value: string, schema: SavedViewSchema): SavedGridView {
  if (typeof value !== "string" || value.length > 262_144) throw new RangeError("Saved view JSON is too large");
  return validateSavedGridView(JSON.parse(value), schema);
}
/** Imports the existing primitive preferences v1 without changing the current query. */
export function importLayoutPreferencesView<TData>(grid: Grid<TData>, preferences: unknown, id: string, name: string): SavedGridView {
  const current = createSavedGridView(grid, { id, name });
  return validateSavedGridView({ ...current, preferences }, getSavedViewSchema(grid));
}
