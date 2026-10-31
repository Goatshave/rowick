import { GridOptions, RowId, Grid } from '@rowick/core';

interface RowAddition<TData> {
    data: TData;
    /** Existing loaded parent; omission/null means a root row. */
    parentId?: RowId | null;
    /** Index after removals, processed in addition order; omission appends. */
    index?: number;
}
interface RowUpdate<TData> {
    id: RowId;
    data: TData;
}
interface RowTransaction<TData> {
    add?: readonly RowAddition<TData>[];
    update?: readonly RowUpdate<TData>[];
    remove?: readonly RowId[];
}
interface RowTransactionOptions<TData> {
    /** Pure writer for structural tree changes. Never mutate the supplied row. */
    setSubRows?: (row: TData, children: readonly TData[]) => TData;
}
type Source<TData> = Pick<GridOptions<TData>, "data" | "columns" | "getRowId" | "getSubRows" | "getRowCanExpand">;
interface PreparedRowTransaction<TData> {
    readonly source: Readonly<Source<TData>>;
    readonly data: readonly TData[];
    readonly addedIds: readonly RowId[];
    readonly updatedIds: readonly RowId[];
    /** Includes descendants removed with their parent, in original preorder. */
    readonly removedIds: readonly RowId[];
    readonly changed: boolean;
}
/** Prepare a complete validated snapshot without changing any grid state. */
declare function prepareRowTransaction<TData>(grid: Grid<TData>, transaction: RowTransaction<TData>, options?: RowTransactionOptions<TData>): PreparedRowTransaction<TData>;
/** Imperative owner only; framework products should accept data in their own state. */
declare function commitRowTransaction<TData>(grid: Grid<TData>, transaction: PreparedRowTransaction<TData>): void;

export { type PreparedRowTransaction, type RowAddition, type RowTransaction, type RowTransactionOptions, type RowUpdate, commitRowTransaction, prepareRowTransaction };
