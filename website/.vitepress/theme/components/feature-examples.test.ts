import { describe, expect, it } from 'vitest';
import { createGrid } from '../../../../packages/core/src/index';
import { people, sortByScore, sortByTeamAndScore, filterPeople, selectPage, selectedIds, nextPage, changePageSize, editableName, editableTeam, editableStatus, editableScore, acceptPersonEdit, showScore, pinName, exportCsv } from '../examples/people';

function example() {
  return createGrid({ data: people.map(row => ({ ...row })), getRowId: row => row.id,
    columns: [{ accessorKey: 'id' }, { accessorKey: 'name', ...editableName }, { accessorKey: 'team', ...editableTeam }, { accessorKey: 'status', ...editableStatus }, { accessorKey: 'score', ...editableScore }],
    initialState: { pagination: { pageIndex: 0, pageSize: 4 } },
  });
}
describe('documented feature functions', () => {
  it('sorts numerically and applies the second sort rule within teams', () => {
    const grid = example(); sortByScore(grid);
    expect(grid.getRowModel().rows[0]!.id).toBe('p2');
    sortByTeamAndScore(grid);
    expect(grid.getSortedRowModel().rows.slice(0, 3).map(row => row.id)).toEqual(['p7', 'p1', 'p3']);
  });
  it('combines global, exact-set and numeric filters, then clears them', () => {
    const grid = example(); filterPeople(grid, '', 'Design', 80);
    expect(grid.getFilteredRowModel().rows.map(row => row.id)).toEqual(['p1', 'p7']);
    filterPeople(grid, 'Emma', 'Design', 80);
    expect(grid.getFilteredRowModel().rows.map(row => row.id)).toEqual(['p7']);
    filterPeople(grid, '', '', null);
    expect(grid.getFilteredRowModel().rows).toHaveLength(8);
  });
  it('keeps page selection scoped while preserving selected IDs on another page', () => {
    const grid = example(); selectPage(grid, true); nextPage(grid); grid.toggleRowSelected('p5', true);
    expect(selectedIds(grid)).toEqual(['p1', 'p2', 'p3', 'p4', 'p5']);
    selectPage(grid, false);
    expect(selectedIds(grid)).toEqual(['p1', 'p2', 'p3', 'p4']);
  });
  it('stops at the last page and updates page count with page size', () => {
    const grid = example(); nextPage(grid); nextPage(grid);
    expect(grid.getState().pagination.pageIndex).toBe(1);
    changePageSize(grid, 2); expect(grid.getPageCount()).toBe(4);
  });
  it('accepts only a valid committed name into new application data', () => {
    const grid = example(); grid.startCellEdit('p1', 'name');
    expect(editableName.validateEditValue('X')).toBe('Enter at least two characters.');
    const invalid = grid.commitCellEdit('X')!;
    expect(invalid.validation?.valid).toBe(false);
    expect(acceptPersonEdit(people, invalid)).toBe(people);
    expect(editableName.validateEditValue('Mina Updated')).toBe(true);
    const committed = grid.commitCellEdit('Mina Updated')!;
    const updated = acceptPersonEdit(people, committed);
    expect(updated[0]!.name).toBe('Mina Updated');
    expect(people[0]!.name).toBe('Mina Park');
  });
  it('accepts team, status and numeric edits and rejects invalid scores and readonly IDs', () => {
    const grid = example();
    for (const [column, value] of [['team', 'Product'], ['status', 'Away'], ['score', 99]] as const) {
      grid.startCellEdit('p1', column);
      const event = grid.commitCellEdit(value)!;
      const updated = acceptPersonEdit(people, event);
      expect(updated[0]![column]).toBe(value);
    }
    grid.startCellEdit('p1', 'score');
    const invalid = grid.commitCellEdit(101)!;
    expect(acceptPersonEdit(people, invalid)).toBe(people);
    expect(editableScore.editValueParser('')).toBeNaN();
    expect(grid.startCellEdit('p1', 'id')).toBeNull();
  });
  it('changes visibility independently from column pinning', () => {
    const grid = example(); showScore(grid, false); pinName(grid, true);
    expect(grid.getVisibleLeafColumns().some(column => column.id === 'score')).toBe(false);
    expect(grid.getState().columnPinning.left).toEqual(['name']);
    showScore(grid, true); expect(grid.getIsColumnVisible('score')).toBe(true);
  });
  it('exports filtered rows across pages instead of just the visible page', () => {
    const grid = example(); changePageSize(grid, 2); filterPeople(grid, '', 'Design', null);
    expect(grid.getRowModel().rows).toHaveLength(2);
    const csv = exportCsv(grid);
    expect(csv).toContain('Emma Wilson');
    expect(csv).not.toContain('Alex Chen');
    expect(csv.trim().split(/\r?\n/)).toHaveLength(4);
  });
});
