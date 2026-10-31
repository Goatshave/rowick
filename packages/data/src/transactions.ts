import { createGrid, type Grid, type GridOptions, type Row, type RowId } from "@rowick/core";

export interface RowAddition<TData> {
  data: TData;
  /** Existing loaded parent; omission/null means a root row. */
  parentId?: RowId | null;
  /** Index after removals, processed in addition order; omission appends. */
  index?: number;
}
export interface RowUpdate<TData> { id: RowId; data: TData; }
export interface RowTransaction<TData> {
  add?: readonly RowAddition<TData>[];
  update?: readonly RowUpdate<TData>[];
  remove?: readonly RowId[];
}
export interface RowTransactionOptions<TData> {
  /** Pure writer for structural tree changes. Never mutate the supplied row. */
  setSubRows?: (row: TData, children: readonly TData[]) => TData;
}
type Source<TData> = Pick<GridOptions<TData>, "data" | "columns" | "getRowId" | "getSubRows" | "getRowCanExpand">;
export interface PreparedRowTransaction<TData> {
  readonly source: Readonly<Source<TData>>;
  readonly data: readonly TData[];
  readonly addedIds: readonly RowId[];
  readonly updatedIds: readonly RowId[];
  /** Includes descendants removed with their parent, in original preorder. */
  readonly removedIds: readonly RowId[];
  readonly changed: boolean;
}
interface Node<TData> { data: TData; id: RowId | undefined; children: Node<TData>[]; }

/** Prepare a complete validated snapshot without changing any grid state. */
export function prepareRowTransaction<TData>(
  grid: Grid<TData>, transaction: RowTransaction<TData>, options: RowTransactionOptions<TData> = {},
): PreparedRowTransaction<TData> {
  const source = grid.getOptions();
  if (!source.getRowId) throw new TypeError("Rowick: transactions require a stable getRowId");
  const model = grid.getCoreRowModel();
  const byId = new Map<RowId, Row<TData>>(model.flatRows.map((row) => [row.id, row]));
  const removals = new Set<RowId>();
  const updates = new Map<RowId, TData>();
  const additions = new Map<RowId | null, RowAddition<TData>[]>();
  const target = (id: RowId, operation: string) => {
    if (typeof id !== "string" || !byId.has(id)) throw new TypeError(`Rowick: unknown transaction ${operation} target`);
  };
  for (const id of transaction.remove ?? []) {
    target(id, "remove");
    if (removals.has(id)) throw new TypeError("Rowick: duplicate transaction remove target");
    removals.add(id);
  }
  for (const update of transaction.update ?? []) {
    target(update.id, "update");
    if (updates.has(update.id) || removals.has(update.id)) throw new TypeError("Rowick: overlapping transaction target");
    updates.set(update.id, update.data);
  }
  const removedIds: RowId[] = [];
  const removedDescendants = new Set<RowId>();
  const collectRemoved = (row: Row<TData>, parentRemoved = false) => {
    if (parentRemoved && removals.has(row.id)) throw new TypeError("Rowick: transaction target has a removed ancestor");
    const removed = parentRemoved || removals.has(row.id);
    if (removed) { removedIds.push(row.id); removedDescendants.add(row.id); }
    for (const child of row.subRows) collectRemoved(child, removed);
  };
  if (removals.size > 0) for (const root of model.rows) collectRemoved(root);
  for (const id of updates.keys()) {
    if (removedDescendants.has(id)) throw new TypeError("Rowick: transaction target has a removed ancestor");
  }
  for (const addition of transaction.add ?? []) {
    const parent = addition.parentId ?? null;
    if (parent !== null) {
      target(parent, "parent");
      if (removedDescendants.has(parent)) throw new TypeError("Rowick: transaction parent is removed");
      if (!source.getSubRows) throw new TypeError("Rowick: tree additions require getSubRows");
    }
    if (addition.index !== undefined && (!Number.isInteger(addition.index) || addition.index < 0)) {
      throw new TypeError("Rowick: invalid transaction insertion index");
    }
    const siblings = additions.get(parent) ?? [];
    siblings.push(addition); additions.set(parent, siblings);
  }

  const fromRow = (row: Row<TData>): Node<TData> => ({ data: row.original as TData, id: row.id, children: row.subRows.map(fromRow) });
  const newAncestors = new Map<TData, Set<number>>();
  const fromNew = (data: TData, index: number): Node<TData> => {
    if (newAncestors.get(data)?.has(index)) throw new TypeError("Rowick: cyclic transaction subtree");
    const positions = newAncestors.get(data) ?? new Set<number>();
    positions.add(index); newAncestors.set(data, positions);
    try {
      return { data, id: undefined, children: (source.getSubRows?.(data, index) ?? []).map(fromNew) };
    } finally {
      positions.delete(index);
      if (positions.size === 0) newAncestors.delete(data);
    }
  };
  const rewrite = (nodes: Node<TData>[], parent: RowId | null): Node<TData>[] => {
    const next = nodes.filter((node) => !removals.has(node.id!));
    for (const addition of additions.get(parent) ?? []) {
      const index = addition.index ?? next.length;
      if (index > next.length) throw new TypeError("Rowick: transaction insertion index exceeds sibling count");
      // New subtrees are resolved after insertion determines their final index.
      next.splice(index, 0, { data: addition.data, id: undefined, children: [] });
    }
    return next.map((node, index) => {
      if (node.id === undefined) return fromNew(node.data, index);
      const data = updates.has(node.id) ? updates.get(node.id)! : node.data;
      const children = rewrite(node.children, node.id);
      const childData = children.map((child) => child.data);
      const supplied = source.getSubRows?.(data, index) ?? [];
      const matches = supplied.length === childData.length && supplied.every((child, position) => Object.is(child, childData[position]));
      if (!matches && !options.setSubRows) throw new TypeError("Rowick: tree changes require setSubRows");
      return { id: node.id, data: matches ? data : options.setSubRows!(data, childData), children };
    });
  };
  const roots = rewrite(model.rows.map(fromRow), null);
  const proposedData = roots.map((node) => node.data);
  const data = proposedData.length === source.data.length && proposedData.every((row, index) => Object.is(row, source.data[index]))
    ? source.data : proposedData;
  const candidate = data === source.data ? model : createGrid({ ...source, data }).getCoreRowModel();
  const expected: Node<TData>[] = [];
  const visit = (node: Node<TData>) => { expected.push(node); node.children.forEach(visit); };
  roots.forEach(visit);
  if (expected.length !== candidate.flatRows.length) throw new TypeError("Rowick: inconsistent transaction child writer");
  const addedIds: RowId[] = [];
  candidate.flatRows.forEach((row, index) => {
    const node = expected[index]!;
    if (!Object.is(node.data, row.original) || (node.id !== undefined && node.id !== row.id)) {
      throw new TypeError("Rowick: transaction must preserve existing row identities and child structure");
    }
    if (node.id === undefined) {
      if (byId.has(row.id)) throw new TypeError("Rowick: additions must use new identities; use update for existing rows");
      addedIds.push(row.id);
    }
  });
  return Object.freeze({ source: Object.freeze({ data: source.data, columns: source.columns,
    ...(source.getRowId ? { getRowId: source.getRowId } : {}),
    ...(source.getSubRows ? { getSubRows: source.getSubRows } : {}),
    ...(source.getRowCanExpand ? { getRowCanExpand: source.getRowCanExpand } : {}) }),
    data, addedIds: Object.freeze(addedIds), updatedIds: Object.freeze([...updates.keys()]),
    removedIds: Object.freeze(removedIds), changed: data !== source.data });
}

/** Imperative owner only; framework products should accept data in their own state. */
export function commitRowTransaction<TData>(grid: Grid<TData>, transaction: PreparedRowTransaction<TData>): void {
  const current = grid.getOptions(), source = transaction.source;
  if (current.data !== source.data || current.columns !== source.columns || current.getRowId !== source.getRowId
    || current.getSubRows !== source.getSubRows || current.getRowCanExpand !== source.getRowCanExpand) {
    throw new TypeError("Rowick: stale transaction source; prepare against current options");
  }
  if (transaction.changed) grid.setOptions((previous) => ({ ...previous, data: transaction.data }));
}
