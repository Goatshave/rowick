import {
  createColumnHelper,
  fitColumnsToWidth,
  type CellEditEvent,
  type Grid,
} from '@rowick/core';
import {
  people,
  editableName,
  editableTeam,
  editableStatus,
  editableScore,
  acceptPersonEdit,
  type Person,
} from './people';
export type Feature =
  | 'sorting'
  | 'filtering'
  | 'selection'
  | 'pagination'
  | 'editing'
  | 'columns'
  | 'export';
export type Density = 'compact' | 'standard' | 'comfortable';
export const errorId = 'rowick-cell-error';
export function createExampleModel(feature: Feature) {
  const pageSize =
    feature === 'export' ? 2 : ['selection', 'pagination'].includes(feature) ? 4 : 8;
  let rows = people.map((row) => ({ ...row }));
  let grid: Grid<Person> | null = null;
  let generation = 0,
    search = '',
    team = '',
    minimum = '',
    csv = '',
    editError = '',
    announcement = '';
  let csvRequested = false;
  let density: Density = 'comfortable';
  const listeners = new Set<(state: ReturnType<typeof getSnapshot>) => void>();
  const column = createColumnHelper<Person>();
  const columns = [
    column.accessor('id', {
      header: 'ID',
      size: 78,
      minSize: 78,
      enableSorting: feature === 'sorting',
    }),
    column.accessor('name', {
      header: 'Name',
      size: 190,
      minSize: 160,
      enableSorting: feature === 'sorting',
      ...(feature === 'editing' ? editableName : {}),
    }),
    column.accessor('team', {
      header: 'Team',
      size: 155,
      minSize: 130,
      enableSorting: feature === 'sorting',
      ...(feature === 'editing' ? editableTeam : {}),
    }),
    column.accessor('status', {
      header: 'Status',
      size: 130,
      minSize: 120,
      enableSorting: feature === 'sorting',
      ...(feature === 'editing' ? editableStatus : {}),
    }),
    column.accessor('score', {
      header: 'Score',
      size: 150,
      minSize: 140,
      enableSorting: feature === 'sorting',
      ...(feature === 'editing' ? editableScore : {}),
    }),
  ];
  function getSnapshot() {
    const state = grid?.getState();
    const count = grid?.getPrePaginationRowModel().rows.length ?? rows.length;
    const selected = grid?.getSelectedRowModel().rows.map((row) => row.id) ?? [];
    const sorting = state?.sorting ?? [];
    const sortPreset =
      sorting.length === 1 && sorting[0]?.id === 'score' && sorting[0].desc
        ? 'score'
        : sorting.length === 2 &&
            sorting[0]?.id === 'team' &&
            !sorting[0].desc &&
            sorting[1]?.id === 'score' &&
            sorting[1].desc
          ? 'team'
          : '';
    const output =
      feature === 'editing'
        ? { rows }
        : feature === 'selection'
          ? { rowSelection: state?.rowSelection ?? {}, selectedIds: selected }
          : feature === 'sorting'
            ? { sorting }
            : feature === 'filtering'
              ? {
                  globalFilter: state?.globalFilter,
                  columnFilters: state?.columnFilters,
                  matchingRows: count,
                }
              : feature === 'columns'
                ? {
                    columnVisibility: state?.columnVisibility,
                    columnPinning: state?.columnPinning,
                  }
                : feature === 'pagination'
                  ? {
                      pagination: state?.pagination,
                      pageCount:
                        grid?.getPageCount() ?? Math.ceil(rows.length / pageSize),
                    }
                  : {
                      rowScope: 'filtered',
                      matchingRows: count,
                      currentPageRows: grid?.getRowModel().rows.length ?? pageSize,
                    };
    return {
      rows,
      generation,
      density,
      search,
      team,
      minimum,
      csv,
      csvRequested,
      editError,
      announcement,
      count,
      selected,
      sortPreset,
      page: state?.pagination.pageIndex ?? 0,
      pages: grid?.getPageCount() ?? Math.ceil(rows.length / pageSize),
      size: state?.pagination.pageSize ?? pageSize,
      previous: grid?.getCanPreviousPage() ?? false,
      next: grid?.getCanNextPage() ?? rows.length > pageSize,
      all: grid?.getIsAllPageRowsSelected() ?? false,
      some: grid?.getIsSomePageRowsSelected() ?? false,
      scoreVisible: grid?.getIsColumnVisible('score') ?? true,
      namePinned: state?.columnPinning.left.includes('name') ?? false,
      stateText: JSON.stringify(output, null, 2),
    };
  }
  function publish() {
    const state = getSnapshot();
    listeners.forEach((listener) => listener(state));
  }
  function attach(
    instance: Grid<Person>,
    frame: HTMLElement | null | (() => HTMLElement | null),
  ) {
    grid = instance;
    const unsubscribe = instance.subscribe(publish);
    let lastWidth = -1;
    let disposed = false;
    let observer: ResizeObserver | null = null;
    // Svelte binds a parent element after the child grid's mount callback.
    // Resolve the element after mounting in every framework.
    queueMicrotask(() => {
      const element = typeof frame === 'function' ? frame() : frame;
      if (disposed || grid !== instance || !element) return;
      const fit = () => {
        if (!element.clientWidth) return;
        const width = Math.max(635, Math.floor(element.clientWidth) - 2);
        if (width === lastWidth) return;
        lastWidth = width;
        fitColumnsToWidth(instance, width);
      };
      if (typeof ResizeObserver !== 'undefined') {
        observer = new ResizeObserver(fit);
        observer.observe(element);
      }
      fit();
    });
    publish();
    return () => {
      disposed = true;
      unsubscribe();
      observer?.disconnect();
      if (grid === instance) grid = null;
    };
  }
  function reset() {
    grid = null;
    rows = people.map((row) => ({ ...row }));
    generation++;
    density = 'comfortable';
    search = '';
    team = '';
    minimum = '';
    csv = '';
    csvRequested = false;
    editError = '';
    announcement = 'Example reset.';
    publish();
  }
  function filter(field: 'search' | 'team' | 'minimum', value: string) {
    if (field === 'search') search = value;
    else if (field === 'team') team = value;
    else minimum = value;
    csv = '';
    csvRequested = false;
    announcement = '';
    grid?.setGlobalFilter(search);
    grid?.setColumnFilters([
      ...(team ? [{ id: 'team', value: { type: 'set', values: [team] } }] : []),
      ...(minimum !== ''
        ? [{ id: 'score', value: { type: 'number-range', min: Number(minimum) } }]
        : []),
    ]);
    publish();
  }
  function onCellEdit(event: CellEditEvent<Person>) {
    const accepted = acceptPersonEdit(rows, event);
    if (accepted === rows) return;
    rows = accepted;
    editError = '';
    announcement = `Saved ${String(event.column.columnDef.header ?? event.column.id)} for ${event.row.original?.name ?? event.row.id}.`;
    publish();
  }
  function previewCsv() {
    if (!grid) return;
    csv = grid.getExportText({
      format: 'csv',
      rowScope: 'filtered',
      includeHeaders: true,
    });
    csvRequested = true;
    announcement = getSnapshot().count
      ? `Generated CSV for ${getSnapshot().count} matching records across all pages.`
      : 'No matching rows to export. Clear the filters to include data.';
    publish();
  }
  function download() {
    if (!getSnapshot().count) return;
    previewCsv();
    const url = URL.createObjectURL(
      new Blob([csv], { type: 'text/csv;charset=utf-8' }),
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = 'rowick-example.csv';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return {
    feature,
    columns,
    initialState: { pagination: { pageIndex: 0, pageSize } },
    onCellEdit,
    getSnapshot,
    attach,
    reset,
    filter,
    previewCsv,
    download,
    subscribe(listener: (state: ReturnType<typeof getSnapshot>) => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    setDensity(value: Density) {
      density = value;
      publish();
    },
    sort(preset: 'score' | 'team' | '') {
      grid?.setSorting(
        preset === 'score'
          ? [{ id: 'score', desc: true }]
          : preset === 'team'
            ? [
                { id: 'team', desc: false },
                { id: 'score', desc: true },
              ]
            : [],
      );
    },
    selectPage(value: boolean) {
      grid?.toggleAllPageRowsSelected(value);
    },
    clearSelection() {
      grid?.resetRowSelection();
    },
    pageSize(value: number) {
      grid?.setPageSize(value);
    },
    previous() {
      grid?.previousPage();
    },
    next() {
      grid?.nextPage();
    },
    showScore(value: boolean) {
      grid?.toggleColumnVisibility('score', value);
    },
    pinName(value: boolean) {
      grid?.pinColumn('name', value ? 'left' : false);
    },
    editFirst() {
      grid?.startCellEdit('p1', 'name');
    },
    setError(message: string) {
      if (editError === message) return;
      editError = message;
      if (message) announcement = '';
      publish();
    },
    cellClass({ column }: { column: { id: string } }) {
      return feature === 'editing'
        ? column.id === 'id'
          ? 'rowick-grid__cell--readonly'
          : 'rowick-grid__cell--editable'
        : undefined;
    },
  };
}
