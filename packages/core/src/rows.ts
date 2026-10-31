import type { Column, ColumnId, Row, RowId, RowModel } from "./types";
import { validateRowIds } from "./id-validation";

const returnFalse = () => false;

export function createCoreRowModel<TData>(
  data: readonly TData[],
  leafColumns: readonly Column<TData, unknown>[],
  getRowId?: (row: TData, index: number, parentRow?: Row<TData>) => RowId,
  getSubRows?: (row: TData, index: number) => readonly TData[] | undefined,
  getRowCanExpand?: (row: TData, index: number, parentRow?: Row<TData>) => boolean,
): RowModel<TData> {
  const columnById = new Map(leafColumns.map((column) => [column.id, column]));
  const ancestors = getSubRows ? new Map<TData, Set<number>>() : undefined;
  let hasNestedRows = false;
  const createRows = (
    rowsData: readonly TData[],
    parentRow: Row<TData> | undefined,
    parentPath: string | null,
    depth: number,
  ): Row<TData>[] =>
    rowsData.map<Row<TData>>((original, index) => {
      if (ancestors?.get(original)?.has(index)) throw new TypeError("Rowick: cyclic row hierarchy");
      const path = getRowId ? null : parentPath === null ? String(index) : `${parentPath}.${index}`;
      const id = getRowId ? getRowId(original, index, parentRow) : path!;
      const row: Row<TData> = {
        id,
        index,
        original,
        depth,
        parentId: parentRow?.id ?? null,
        subRows: [],
        leafRows: [],
        getValue: <TValue = unknown>(columnId: ColumnId): TValue | undefined => {
          const column = columnById.get(columnId);
          return column?.getValue(original, index) as TValue | undefined;
        },
        getIsGrouped: returnFalse,
        getIsGroupFooter: returnFalse,
        getCanExpand: !getSubRows && !getRowCanExpand
          ? returnFalse
          : () => row.subRows.length > 0 || getRowCanExpand?.(original, index, parentRow) === true,
      };
      const subRows = getSubRows?.(original, index);

      if (subRows && subRows.length > 0) {
        hasNestedRows = true;
        const positions = ancestors!.get(original) ?? new Set<number>();
        positions.add(index); ancestors!.set(original, positions);
        try {
          row.subRows = createRows(subRows, row, path, depth + 1);
        } finally {
          positions.delete(index);
          if (positions.size === 0) ancestors!.delete(original);
        }
        row.leafRows = row.subRows.flatMap((subRow) => subRow.leafRows);
      } else {
        row.leafRows = [row];
      }

      return row;
    });

  const rows = createRows(data, undefined, null, 0);
  const model = createRowModel(rows, {
    includeSubRows: hasNestedRows,
    lazyRowsById: true,
  });
  if (getRowId) validateRowIds(model.flatRows);
  return model;
}

export function createRowModel<TData>(
  rows: Row<TData>[],
  options: { includeSubRows?: boolean; lazyRowsById?: boolean } = {},
): RowModel<TData> {
  const includeSubRows = options.includeSubRows ?? true;

  if (options.lazyRowsById) {
    const flatRows: Row<TData>[] = includeSubRows ? [] : rows;
    if (includeSubRows) {
      const visit = (row: Row<TData>) => {
        flatRows.push(row);
        for (const subRow of row.subRows) visit(subRow);
      };
      for (const row of rows) visit(row);
    }
    let lazyRowsById: Record<RowId, Row<TData>> | undefined;
    return {
      rows,
      flatRows,
      get rowsById() {
        lazyRowsById ??= indexRowsById(flatRows);
        return lazyRowsById;
      },
    };
  }

  const rowsById: Record<RowId, Row<TData>> = Object.create(null);
  const flatRows: Row<TData>[] = includeSubRows ? [] : rows;

  const visit = (row: Row<TData>) => {
    rowsById[row.id] = row;

    if (!includeSubRows) {
      return;
    }

    flatRows.push(row);

    for (const subRow of row.subRows) {
      visit(subRow);
    }
  };

  for (const row of rows) {
    visit(row);
  }

  return {
    rows,
    flatRows,
    rowsById,
  };
}

function indexRowsById<TData>(rows: readonly Row<TData>[]): Record<RowId, Row<TData>> {
  const rowsById: Record<RowId, Row<TData>> = Object.create(null);
  for (const row of rows) rowsById[row.id] = row;
  return rowsById;
}
