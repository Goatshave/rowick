import type { Grid, CellEditEvent } from '@rowick/core';

// #region data
export type Person = {
  id: string;
  name: string;
  team: string;
  status: string;
  score: number;
};
export const people: Person[] = [
  { id: 'p1', name: 'Mina Park', team: 'Design', status: 'Active', score: 82 },
  { id: 'p2', name: 'Alex Chen', team: 'Engineering', status: 'Active', score: 95 },
  { id: 'p3', name: 'Sofia Rossi', team: 'Design', status: 'Away', score: 74 },
  { id: 'p4', name: 'Joon Kim', team: 'Engineering', status: 'Active', score: 88 },
  { id: 'p5', name: 'Ara Lee', team: 'Product', status: 'Active', score: 91 },
  { id: 'p6', name: 'Theo Martin', team: 'Product', status: 'Away', score: 67 },
  { id: 'p7', name: 'Emma Wilson', team: 'Design', status: 'Active', score: 93 },
  { id: 'p8', name: 'Noah Patel', team: 'Engineering', status: 'Away', score: 79 },
];
// #endregion data

// #region sorting
export function sortByScore(grid: Grid<Person>) {
  grid.setSorting([{ id: 'score', desc: true }]);
}
export function sortByTeamAndScore(grid: Grid<Person>) {
  grid.setSorting([
    { id: 'team', desc: false },
    { id: 'score', desc: true },
  ]);
}
// #endregion sorting

// #region filtering
export function filterPeople(
  grid: Grid<Person>,
  search: string,
  team: string,
  minimum: number | null,
) {
  grid.setGlobalFilter(search);
  grid.setColumnFilters([
    ...(team ? [{ id: 'team', value: { type: 'set' as const, values: [team] } }] : []),
    ...(minimum !== null
      ? [{ id: 'score', value: { type: 'number-range' as const, min: minimum } }]
      : []),
  ]);
}
// #endregion filtering

// #region selection
export function selectPage(grid: Grid<Person>, checked: boolean) {
  grid.toggleAllPageRowsSelected(checked);
}
export function selectedIds(grid: Grid<Person>) {
  return grid.getSelectedRowModel().rows.map((row) => row.id);
}
// #endregion selection

// #region pagination
export function changePageSize(grid: Grid<Person>, pageSize: number) {
  grid.setPageSize(pageSize);
}
export function nextPage(grid: Grid<Person>) {
  if (grid.getCanNextPage()) grid.nextPage();
}
// #endregion pagination

// #region editing
export const editableName = {
  enableEditing: true,
  validateEditValue: (value: unknown) =>
    String(value).trim().length >= 2 || 'Enter at least two characters.',
};
export const editableTeam = {
  enableEditing: true,
  editOptions: ['Design', 'Engineering', 'Product'].map((value) => ({
    value,
    label: value,
  })),
  validateEditValue: (value: unknown) =>
    ['Design', 'Engineering', 'Product'].includes(String(value)) || 'Choose a team.',
};
export const editableStatus = {
  enableEditing: true,
  editOptions: ['Active', 'Away'].map((value) => ({ value, label: value })),
  validateEditValue: (value: unknown) =>
    ['Active', 'Away'].includes(String(value)) || 'Choose a status.',
};
export const editableScore = {
  enableEditing: true,
  editValueParser: (text: string) => (text.trim() === '' ? NaN : Number(text)),
  validateEditValue: (value: unknown) =>
    (typeof value === 'number' &&
      Number.isFinite(value) &&
      value >= 0 &&
      value <= 100) ||
    'Enter a score from 0 to 100.',
};
export function acceptPersonEdit(
  rows: Person[],
  event: CellEditEvent<Person>,
): Person[] {
  if (
    event.phase !== 'commit' ||
    event.validation?.valid === false ||
    event.defaultPrevented
  )
    return rows;
  const id = event.column.id;
  const rules = {
    name: editableName,
    team: editableTeam,
    status: editableStatus,
    score: editableScore,
  };
  if (!Object.hasOwn(rules, id)) return rows;
  const key = id as keyof typeof rules;
  const value = key === 'score' ? event.value : String(event.value).trim();
  if (rules[key].validateEditValue(value) !== true) return rows;
  return rows.map((row) =>
    row.id === event.row.id ? ({ ...row, [key]: value } as Person) : row,
  );
}
// #endregion editing

// #region columns
export function showScore(grid: Grid<Person>, visible: boolean) {
  grid.toggleColumnVisibility('score', visible);
}
export function pinName(grid: Grid<Person>, pinned: boolean) {
  grid.pinColumn('name', pinned ? 'left' : false);
}
// #endregion columns

// #region export
export function exportCsv(grid: Grid<Person>) {
  return grid.getExportText({
    format: 'csv',
    rowScope: 'filtered',
    includeHeaders: true,
  });
}
// #endregion export
