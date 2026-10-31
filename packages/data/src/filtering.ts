import { getFilterOperators, validateFilterExpression, type FilterColumnPolicy, type FilterCondition, type FilterExpression, type FilterGroup, type FilterNode, type FilterOperator, type FilterScalar, type Grid } from "@rowick/core";
import { calculateFacets, createFacetSearchController, excludeFacetColumn, type FacetResult, type FacetSearchController, type FacetSearchRequest, type FacetSearchState, type FacetValue } from "./filtering-facets";
import { applySavedGridView, createSavedGridView, getSavedViewSchema, importLayoutPreferencesView, parseSavedGridView, validateSavedGridView, type SavedGridView, type SavedViewMigration } from "./filtering-views";
export * from "./filtering-facets";
export * from "./filtering-views";
export * from "./filtering-labels";

export interface FilterDraftCondition {
  readonly kind: "condition"; readonly id: string; readonly columnId: string; readonly operator: FilterOperator;
  readonly input: string; readonly secondInput: string; readonly nullValue: boolean; readonly caseSensitive: boolean;
}
export interface FilterDraftGroup { readonly kind: "group"; readonly id: string; readonly operator: "and" | "or"; readonly children: readonly FilterDraftNode[]; }
export type FilterDraftNode = FilterDraftCondition | FilterDraftGroup;
export interface FilterPanelColumn extends FilterColumnPolicy {
  readonly label: string; readonly visible: boolean; readonly configurable: boolean;
  readonly pinned: "left" | "right" | false; readonly size: number;
}
export interface FilterPanelState {
  readonly draft: FilterDraftGroup; readonly dirty: boolean; readonly stale: boolean;
  readonly columns: readonly FilterPanelColumn[]; readonly allColumns: readonly Readonly<{ id: string; label: string; visible: boolean; configurable: boolean; pinned: "left" | "right" | false; size: number }>[];
  readonly errors: Readonly<Record<string, string>>; readonly error: string | undefined; readonly message: string | undefined;
  readonly activeConditionCount: number; readonly activeExpression: FilterExpression | null;
  readonly facetColumnId: string | undefined; readonly facetQuery: string; readonly facets: FacetResult | undefined; readonly facetSearch: FacetSearchState | undefined;
  readonly facetScope: "client" | "loaded" | "server";
  readonly views: readonly SavedGridView[]; readonly viewName: string; readonly selectedViewId: string; readonly viewJSON: string;
}
export interface FilterPanelStorage { getItem(key: string): string | null; setItem(key: string, value: string): void; removeItem(key: string): void; }
export interface FilterPanelOptions<TData> {
  readonly grid: Grid<TData>;
  readonly getColumnLabel?: (id: string) => string;
  readonly canConfigureColumn?: (id: string) => boolean;
  readonly getDensity?: () => SavedGridView["preferences"]["density"];
  readonly onDensityChange?: (density: SavedGridView["preferences"]["density"]) => void;
  readonly storage?: FilterPanelStorage;
  readonly storageKey?: string;
  readonly maxViews?: number;
  readonly viewMigrations?: readonly SavedViewMigration[];
  readonly facetSearch?: (request: FacetSearchRequest) => Promise<{ values: readonly FacetValue[]; truncated?: boolean }>;
  readonly getContextKey?: () => string;
  readonly maxFacetValues?: number;
  readonly maxFacetRows?: number;
  readonly onListenerError?: (error: unknown) => void;
}
export interface FilterPanelController {
  getState: () => FilterPanelState;
  addCondition: (groupId: string) => void;
  addGroup: (groupId: string) => void;
  remove: (nodeId: string) => void;
  setGroupOperator: (groupId: string, operator: "and" | "or") => void;
  updateCondition: (nodeId: string, patch: Partial<Pick<FilterDraftCondition, "columnId" | "operator" | "input" | "secondInput" | "nullValue" | "caseSensitive">>) => void;
  apply: () => boolean;
  reset: () => void;
  reload: () => void;
  refresh: () => void;
  setColumnVisible: (id: string, visible: boolean) => void;
  setColumnPinned: (id: string, position: "left" | "right" | false) => void;
  setColumnSize: (id: string, size: number) => void;
  moveColumn: (id: string, direction: "before" | "after") => void;
  setFacetColumn: (id: string) => void;
  searchFacets: (query: string) => Promise<void>;
  retryFacets: () => Promise<void> | null;
  useFacet: (value: FilterScalar) => void;
  setViewName: (name: string) => void;
  selectView: (id: string) => void;
  saveView: () => void;
  restoreView: () => void;
  deleteView: () => void;
  clearViews: () => void;
  setViewJSON: (json: string) => void;
  exportView: () => void;
  importView: () => void;
  subscribe: (listener: () => void) => () => void;
  dispose: () => void;
}
class FilterInputError extends Error { constructor(readonly nodeId: string, message: string) { super(message); } }
const freeze = <T>(value: T): T => { if (value && typeof value === "object") { for (const child of Object.values(value)) freeze(child); Object.freeze(value); } return value; };
const key = (expression: FilterExpression | null) => JSON.stringify(expression);
const conditionCount = (node: FilterNode | null): number => !node ? 0 : node.kind === "condition" ? 1 : node.children.reduce((total, child) => total + conditionCount(child), 0);

/** Shared draft, settings, facets and persistence model. The grid/data owner stays external. */
export function createFilterPanelController<TData>(options: FilterPanelOptions<TData>): FilterPanelController {
  const grid = options.grid, maximumViews = options.maxViews ?? 20;
  if (!Number.isSafeInteger(maximumViews) || maximumViews < 1 || maximumViews > 200) throw new TypeError("Invalid saved view limit");
  for (const [value, maximum] of [[options.maxFacetValues, 10_000], [options.maxFacetRows, 1_000_000]] as const) if (value !== undefined && (!Number.isSafeInteger(value) || value < 1 || value > maximum)) throw new TypeError("Invalid facet limit");
  const listeners = new Set<() => void>(); let disposed = false, sequence = 0, notifying = false, notificationPending = false;
  let error: string | undefined, message: string | undefined, errors: Record<string, string> = Object.create(null) as Record<string, string>;
  let views: readonly SavedGridView[] = [], selectedViewId = "", viewName = "", viewJSON = "";
  let facetColumnId: string | undefined, facetQuery = "", facets: FacetResult | undefined, facetSearch: FacetSearchController | undefined;
  let facetDependencies: readonly unknown[] | undefined;
  let facetSearchPolicyKey: string | undefined, lastFacetQueryDependencies: readonly unknown[] | undefined;
  let sourceKey = key(grid.getState().filterExpression), pendingExpressionKey: string | undefined;
  const policies = () => grid.getFilterColumnPolicies();
  const allowed = (policy: FilterColumnPolicy) => policy.operators ?? getFilterOperators(policy.type);
  const assertActive = () => { if (disposed) throw new Error("Filter panel is disposed"); };
  const report = (failure: unknown) => { if (options.onListenerError) { try { options.onListenerError(failure); return; } catch (error) { failure = error; } } queueMicrotask(() => { throw failure; }); };
  const blankCondition = (): FilterDraftCondition => {
    const policy = policies().find((column) => allowed(column).length > 0); if (!policy) throw new Error("No filterable columns are available");
    return { kind: "condition", id: `condition:${++sequence}`, columnId: policy.id, operator: allowed(policy).includes("eq") ? "eq" : allowed(policy)[0]!, input: policy.type === "boolean" ? "false" : "", secondInput: "", nullValue: false, caseSensitive: false };
  };
  const fromNode = (node: FilterNode): FilterDraftNode => {
    if (node.kind === "group") return { kind: "group", id: `group:${++sequence}`, operator: node.operator, children: node.children.map(fromNode) };
    const members = Array.isArray(node.value) ? node.value : undefined;
    return { kind: "condition", id: `condition:${++sequence}`, columnId: node.columnId, operator: node.operator,
      input: node.operator === "in" || node.operator === "not-in" ? JSON.stringify(node.value) : String(members ? members[0] ?? "" : node.value ?? ""),
      secondInput: members ? String(members[1] ?? "") : "", nullValue: node.value === null, caseSensitive: node.caseSensitive === true };
  };
  const fromExpression = (expression: FilterExpression | null): FilterDraftGroup => {
    const node = expression?.root ? fromNode(expression.root) : null;
    return freeze(node?.kind === "group" ? node : { kind: "group", id: `group:${++sequence}`, operator: "and", children: node ? [node] : [] });
  };
  let draft = fromExpression(grid.getState().filterExpression), baselineDraftKey = JSON.stringify(draft);
  let snapshot: FilterPanelState;
  const publish = () => {
    if (disposed) return;
    const state = grid.getState(), all = grid.getAllLeafColumns();
    const metadata = all.map((column) => Object.freeze({ id: column.id, label: options.getColumnLabel?.(column.id) ?? (typeof column.columnDef.header === "string" ? column.columnDef.header : column.id),
      visible: column.getIsVisible(), configurable: options.canConfigureColumn?.(column.id) !== false, pinned: column.getIsPinned(), size: column.getSize() }));
    snapshot = Object.freeze({ draft, dirty: JSON.stringify(draft) !== baselineDraftKey, stale: key(state.filterExpression) !== sourceKey,
      columns: Object.freeze(policies().map((policy) => Object.freeze({ ...policy, ...metadata.find((column) => column.id === policy.id)! }))), allColumns: Object.freeze(metadata),
      errors: Object.freeze({ ...errors }), error, message, activeConditionCount: conditionCount(state.filterExpression?.root ?? null), activeExpression: state.filterExpression,
      facetColumnId, facetQuery, facets, facetSearch: facetSearch?.getState(), facetScope: options.facetSearch ? "server" : grid.getOptions().manualFiltering ? "loaded" : "client", views, viewName, selectedViewId, viewJSON });
    notificationPending = true; if (notifying) return; notifying = true;
    try { while (notificationPending && !disposed) { notificationPending = false; for (const listener of [...listeners]) if (listeners.has(listener)) { try { listener(); } catch (failure) { report(failure); } } } }
    finally { notifying = false; }
  };
  const replace = (id: string, change: (node: FilterDraftNode) => FilterDraftNode | null) => {
    let found = false;
    const visit = (node: FilterDraftNode): FilterDraftNode | null => {
      if (node.id === id) { found = true; return change(node); }
      return node.kind === "group" ? { ...node, children: node.children.map(visit).filter((child): child is FilterDraftNode => child !== null) } : node;
    };
    const next = visit(draft); if (!found || next?.kind !== "group") throw new TypeError("Unknown filter draft node");
    let count = 0; const check = (node: FilterDraftNode, depth: number) => { if (++count > 200 || depth > 8) throw new RangeError("Filter builder limit reached"); if (node.kind === "group") node.children.forEach((child) => check(child, depth + 1)); }; check(next, 1);
    draft = freeze(next); error = undefined; message = undefined; errors = Object.create(null) as Record<string, string>; publish();
  };
  const parseValue = (input: string, policy: FilterColumnPolicy, nodeId: string): FilterScalar => {
    if (policy.type === "boolean") { if (input === "true" || input === "false") return input === "true"; throw new FilterInputError(nodeId, "Choose true or false"); }
    if (policy.type === "number") {
      if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(input) || !Number.isFinite(Number(input))) throw new FilterInputError(nodeId, "Enter a finite number using a dot decimal separator");
      return Number(input);
    }
    return input;
  };
  const toExpression = (): FilterExpression | null => {
    const byId = new Map(policies().map((policy) => [policy.id, policy]));
    const convert = (node: FilterDraftNode): FilterNode => {
      if (node.kind === "group") return { kind: "group", operator: node.operator, children: node.children.map(convert) };
      const policy = byId.get(node.columnId); if (!policy) throw new FilterInputError(node.id, "Column is no longer available");
      const base = { kind: "condition" as const, columnId: node.columnId, operator: node.operator, ...(policy.type === "text" ? { caseSensitive: node.caseSensitive } : {}) };
      let condition: FilterCondition;
      if (node.operator === "is-empty" || node.operator === "is-not-empty") condition = base;
      else if (node.operator === "in" || node.operator === "not-in") {
        let values: unknown; try { values = JSON.parse(node.input); } catch { throw new FilterInputError(node.id, "Enter a JSON array, for example [\"A\",\"B\"]"); }
        condition = { ...base, value: values as readonly FilterScalar[] };
      } else if (node.operator === "between") condition = { ...base, value: [parseValue(node.input, policy, node.id), parseValue(node.secondInput, policy, node.id)] };
      else condition = { ...base, value: node.nullValue ? null : parseValue(node.input, policy, node.id) };
      try { validateFilterExpression({ version: 1, root: condition }, [policy]); } catch (failure) { throw new FilterInputError(node.id, failure instanceof Error ? failure.message : "Invalid condition"); }
      return condition;
    };
    if (draft.operator === "and" && !draft.children.length) return null;
    return validateFilterExpression({ version: 1, root: convert(draft) }, policies());
  };
  const updateFacets = () => {
    if (!facetColumnId || options.facetSearch) return;
    const state = grid.getState(), gridOptions = grid.getOptions(), core = grid.getCoreRowModel();
    const dependencies = [core, gridOptions.columns, gridOptions.globalFilterFn, gridOptions.manualFiltering, state.filterExpression, state.columnFilters, state.globalFilter, facetColumnId, facetQuery];
    if (facetDependencies && dependencies.every((value, index) => Object.is(value, facetDependencies![index]))) return;
    const rows = grid.getFacetedRowModel(facetColumnId).flatRows;
    facets = calculateFacets(rows, policies(), facetColumnId, (row, id) => row.getValue(id), {
      query: facetQuery, ...(options.maxFacetValues ? { maxValues: options.maxFacetValues } : {}), ...(options.maxFacetRows ? { maxRows: options.maxFacetRows } : {}),
    });
    facetDependencies = dependencies;
  };
  const storageKey = options.storageKey ?? "rowick:saved-views:v1";
  const persist = (next: readonly SavedGridView[]) => {
    if (next.length > maximumViews) throw new RangeError("Saved view limit reached");
    const json = JSON.stringify({ version: 1, views: next }); if (json.length > 524_288) throw new RangeError("Saved view collection is too large");
    options.storage?.setItem(storageKey, json); views = Object.freeze([...next]);
  };
  const guarded = <T>(operation: () => T): T => {
    assertActive(); error = undefined; message = undefined;
    try { return operation(); } catch (failure) { error = failure instanceof Error ? failure.message : "Filter action failed"; publish(); throw failure; }
  };
  const configure = (id: string, operation: () => void) => guarded(() => {
    if (!grid.getAllLeafColumns().some((column) => column.id === id) || options.canConfigureColumn?.(id) === false) throw new TypeError("Column settings are unavailable"); operation(); publish();
  });
  const reload = () => { sourceKey = key(grid.getState().filterExpression); pendingExpressionKey = undefined; draft = fromExpression(grid.getState().filterExpression); baselineDraftKey = JSON.stringify(draft); errors = Object.create(null) as Record<string, string>; error = undefined; message = undefined; };
  const facetQueryDependencies = () => { const state = grid.getState(), currentOptions = grid.getOptions(); return [currentOptions.data, currentOptions.columns, currentOptions.globalFilterFn, state.filterExpression, state.columnFilters, state.globalFilter, options.getContextKey?.()]; };
  const stop = grid.subscribe(() => {
    const current = key(grid.getState().filterExpression);
    if (current !== sourceKey && (current === pendingExpressionKey || JSON.stringify(draft) === baselineDraftKey)) reload();
    if (facetColumnId) {
      const dependencies = facetQueryDependencies();
      if (!lastFacetQueryDependencies || dependencies.some((value, index) => !Object.is(value, lastFacetQueryDependencies![index]))) facetSearch?.invalidate();
      lastFacetQueryDependencies = dependencies;
    }
    if (facetColumnId && !policies().some((column) => column.id === facetColumnId)) { facetColumnId = undefined; facets = undefined; facetDependencies = undefined; facetSearch?.dispose(); facetSearch = undefined; }
    updateFacets(); publish();
  });
  const controller: FilterPanelController = {
    getState: () => snapshot,
    addCondition: (id) => guarded(() => replace(id, (node) => { if (node.kind !== "group") throw new TypeError("Choose a condition group"); return { ...node, children: [...node.children, blankCondition()] }; })),
    addGroup: (id) => guarded(() => replace(id, (node) => { if (node.kind !== "group") throw new TypeError("Choose a condition group"); return { ...node, children: [...node.children, { kind: "group", id: `group:${++sequence}`, operator: "and", children: [] }] }; })),
    remove: (id) => guarded(() => replace(id, () => null)),
    setGroupOperator: (id, operator) => guarded(() => { if (operator !== "and" && operator !== "or") throw new TypeError("Unknown group operator"); replace(id, (node) => { if (node.kind !== "group") throw new TypeError("Choose a condition group"); return { ...node, operator }; }); }),
    updateCondition: (id, patch) => guarded(() => replace(id, (node) => {
      if (node.kind !== "condition") throw new TypeError("Choose a condition");
      if (!patch || typeof patch !== "object" || Array.isArray(patch) || Reflect.ownKeys(patch).some((key) => typeof key !== "string" || !["columnId", "operator", "input", "secondInput", "nullValue", "caseSensitive"].includes(key)) || Object.values(Object.getOwnPropertyDescriptors(patch)).some((descriptor) => !Object.hasOwn(descriptor, "value"))) throw new TypeError("Invalid condition patch");
      let next = { ...node, ...patch };
      const policy = policies().find((column) => column.id === next.columnId); if (!policy || !allowed(policy).length) throw new TypeError("Unknown filter column");
      if (patch.columnId !== undefined && patch.columnId !== node.columnId) next = { ...next, operator: allowed(policy).includes("eq") ? "eq" : allowed(policy)[0]!, input: policy.type === "boolean" ? "false" : "", secondInput: "", nullValue: false, caseSensitive: false, ...patch };
      if (patch.operator !== undefined && patch.operator !== "eq" && patch.operator !== "neq") next.nullValue = false;
      if (!allowed(policy).includes(next.operator) || typeof next.input !== "string" || next.input.length > 16_384 || typeof next.secondInput !== "string" || next.secondInput.length > 1_000 || typeof next.nullValue !== "boolean" || typeof next.caseSensitive !== "boolean") throw new TypeError("Invalid condition input");
      return next;
    })),
    apply: () => {
      assertActive(); error = undefined; message = undefined; errors = Object.create(null) as Record<string, string>;
      try {
        if (key(grid.getState().filterExpression) !== sourceKey) throw new Error("Filters changed externally; reload before applying");
        const expression = toExpression(), requestedKey = key(expression); pendingExpressionKey = requestedKey; grid.setFilterExpression(expression);
        if (key(grid.getState().filterExpression) === requestedKey) reload(); else message = "Filter change proposed; waiting for the controlled owner";
        updateFacets(); publish(); return true;
      } catch (failure) { if (failure instanceof FilterInputError) { errors[failure.nodeId] = failure.message; error = "Review the highlighted condition"; } else error = failure instanceof Error ? failure.message : "Invalid filters"; publish(); return false; }
    },
    reset: () => guarded(() => { pendingExpressionKey = key(null); grid.setFilterExpression(null); if (grid.getState().filterExpression === null) reload(); else { draft = fromExpression(null); message = "Filter change proposed; waiting for the controlled owner"; } updateFacets(); publish(); }),
    reload: () => guarded(() => { reload(); publish(); }),
    refresh: () => guarded(() => { const current = key(grid.getState().filterExpression); if (current !== sourceKey && JSON.stringify(draft) === baselineDraftKey) reload(); updateFacets(); publish(); }),
    setColumnVisible: (id, visible) => configure(id, () => {
      if (typeof visible !== "boolean") throw new TypeError("Visibility must be a boolean");
      if (!visible && grid.getVisibleLeafColumns().length === 1 && grid.getIsColumnVisible(id)) throw new Error("Keep at least one visible column"); grid.toggleColumnVisibility(id, visible);
    }),
    setColumnPinned: (id, position) => configure(id, () => { if (!["left", "right", false].includes(position)) throw new TypeError("Invalid pin position"); grid.pinColumn(id, position); }),
    setColumnSize: (id, size) => configure(id, () => { if (!Number.isFinite(size) || size <= 0) throw new TypeError("Enter a positive width"); grid.setColumnSize(id, size); }),
    moveColumn: (id, direction) => configure(id, () => { if (direction !== "before" && direction !== "after") throw new TypeError("Unknown column move direction"); const columns = grid.getAllLeafColumns(), index = columns.findIndex((column) => column.id === id), target = columns[index + (direction === "before" ? -1 : 1)]; if (target) { if (options.canConfigureColumn?.(target.id) === false) throw new Error("Cannot move across a protected column"); grid.moveColumn(id, target.id, direction); } }),
    setFacetColumn: (id) => guarded(() => { if (!policies().some((column) => column.id === id)) throw new TypeError("Unknown facet column"); facetColumnId = id; facetQuery = ""; lastFacetQueryDependencies = facetQueryDependencies(); facetSearch?.invalidate(); updateFacets(); publish(); if (options.facetSearch) void controller.searchFacets("").catch((failure: unknown) => { if (!disposed) { error = failure instanceof Error ? failure.message : "Facet search failed"; publish(); } }); }),
    searchFacets: (query) => guarded(() => {
      if (!facetColumnId) throw new Error("Choose a facet column"); if (query.length > 1_000) throw new RangeError("Facet query is too long"); facetQuery = query;
      if (!options.facetSearch) { updateFacets(); publish(); return Promise.resolve(); }
      const policyKey = JSON.stringify(policies());
      if (!facetSearch || policyKey !== facetSearchPolicyKey) { facetSearch?.dispose(); facetSearchPolicyKey = policyKey; facetSearch = createFacetSearchController({ columns: policies(), search: options.facetSearch, ...(options.getContextKey ? { getContextKey: options.getContextKey } : {}), ...(options.maxFacetValues ? { maxValues: options.maxFacetValues } : {}) }); facetSearch.subscribe(publish); }
      return facetSearch.search(facetColumnId, query, excludeFacetColumn(grid.getState().filterExpression, facetColumnId));
    }),
    retryFacets: () => guarded(() => facetSearch?.retry() ?? null),
    useFacet: (value) => guarded(() => {
      if (!facetColumnId) throw new Error("Choose a facet column"); const policy = policies().find((column) => column.id === facetColumnId)!;
      if (!allowed(policy).includes("eq")) throw new Error("Equality filters are unavailable for this column");
      replace(draft.id, (node) => ({ ...(node as FilterDraftGroup), children: [...(node as FilterDraftGroup).children, { ...blankCondition(), columnId: policy.id, operator: "eq", input: String(value ?? ""), nullValue: value === null }] }));
    }),
    setViewName: (name) => guarded(() => { if (typeof name !== "string" || name.length > 128) throw new RangeError("View name is too long or invalid"); viewName = name; publish(); }),
    selectView: (id) => guarded(() => { if (typeof id !== "string" || id && !views.some((view) => view.id === id)) throw new TypeError("Unknown saved view"); selectedViewId = id; const view = views.find((view) => view.id === id); if (view) viewName = view.name; publish(); }),
    saveView: () => guarded(() => {
      const id = selectedViewId || globalThis.crypto.randomUUID(); const view = createSavedGridView(grid, { id, name: viewName, ...(options.getDensity ? { density: options.getDensity() } : {}) });
      persist([...views.filter((view) => view.id !== id), view]); selectedViewId = id; message = options.storage ? "View saved" : "View saved for this session"; publish();
    }),
    restoreView: () => guarded(() => {
      const view = views.find((view) => view.id === selectedViewId); if (!view) throw new Error("Choose a saved view");
      applySavedGridView(grid, view, { ...(options.viewMigrations ? { migrations: options.viewMigrations } : {}), ...(options.canConfigureColumn ? { canConfigureColumn: options.canConfigureColumn } : {}) });
      options.onDensityChange?.(view.preferences.density); reload(); updateFacets(); message = "View restored or proposed to its controlled owner"; publish();
    }),
    deleteView: () => guarded(() => { if (!selectedViewId) throw new Error("Choose a saved view"); persist(views.filter((view) => view.id !== selectedViewId)); selectedViewId = ""; message = "View deleted"; publish(); }),
    clearViews: () => guarded(() => { options.storage?.removeItem(storageKey); views = []; selectedViewId = ""; message = "Saved views cleared"; publish(); }),
    setViewJSON: (json) => guarded(() => { if (typeof json !== "string" || json.length > 262_144) throw new RangeError("View JSON is too large or invalid"); viewJSON = json; publish(); }),
    exportView: () => guarded(() => { const view = views.find((view) => view.id === selectedViewId) ?? createSavedGridView(grid, { id: globalThis.crypto.randomUUID(), name: viewName || "Current view" }); const pretty = JSON.stringify(view, null, 2); viewJSON = pretty.length <= 262_144 ? pretty : JSON.stringify(view); publish(); }),
    importView: () => guarded(() => {
      if (viewJSON.length > 262_144) throw new RangeError("View JSON is too large"); const input = JSON.parse(viewJSON) as Record<string, unknown>;
      const schema = { ...getSavedViewSchema(grid), ...(options.viewMigrations ? { migrations: options.viewMigrations } : {}) };
      const view = input && input.version === 1 && !Object.hasOwn(input, "preferences") && Object.hasOwn(input, "state") ? importLayoutPreferencesView(grid, input, globalThis.crypto.randomUUID(), viewName || "Imported layout") : parseSavedGridView(viewJSON, schema);
      persist([...views.filter((existing) => existing.id !== view.id), view]); selectedViewId = view.id; viewName = view.name; message = "View imported; choose Restore view to apply"; publish();
    }),
    subscribe: (listener) => { assertActive(); listeners.add(listener); return () => { listeners.delete(listener); }; },
    dispose: () => { if (disposed) return; disposed = true; stop(); facetSearch?.dispose(); listeners.clear(); },
  };
  try {
    const stored = options.storage?.getItem(storageKey);
    if (stored) {
      if (stored.length > 524_288) throw new RangeError("Saved view collection is too large"); const input = JSON.parse(stored) as { version?: unknown; views?: unknown };
      if (input.version !== 1 || !Array.isArray(input.views) || input.views.length > maximumViews) throw new TypeError("Invalid saved view collection");
      const schema = { ...getSavedViewSchema(grid), ...(options.viewMigrations ? { migrations: options.viewMigrations } : {}) };
      const loaded = input.views.map((view) => validateSavedGridView(view, schema)); if (new Set(loaded.map((view) => view.id)).size !== loaded.length) throw new TypeError("Duplicate saved view ID"); views = Object.freeze(loaded);
    }
  } catch (failure) { error = failure instanceof Error ? failure.message : "Saved views could not be loaded"; }
  publish(); return controller;
}
