import { describe, expect, it, vi } from 'vitest';
import { createGrid } from '@rowick/core';
import { createExampleModel } from './example-model';
import { createInlineEditor } from './inline-editor';
import { editableScore } from './people';
function setup(feature: Parameters<typeof createExampleModel>[0]) {
  const model = createExampleModel(feature);
  const grid = createGrid({
    data: model.getSnapshot().rows,
    columns: model.columns,
    getRowId: (row) => row.id,
    initialState: model.initialState,
    onCellEdit: model.onCellEdit,
  });
  model.attach(grid, null);
  return { model, grid };
}
describe('shared framework example behavior', () => {
  it('preserves individual row selection and page selection, including partial pages', () => {
    const { model, grid } = setup('selection');
    grid.toggleRowSelected('p1', true);
    expect(model.getSnapshot()).toMatchObject({
      all: false,
      some: true,
      selected: ['p1'],
    });
    model.selectPage(true);
    model.next();
    expect(model.getSnapshot()).toMatchObject({
      page: 1,
      all: false,
      some: false,
      selected: ['p1', 'p2', 'p3', 'p4'],
    });
    model.clearSelection();
    expect(model.getSnapshot().selected).toEqual([]);
  });
  it('resets query inputs, row data, density-independent view state and CSV output consistently', () => {
    const { model } = setup('export');
    model.filter('team', 'Design');
    model.previewCsv();
    expect(model.getSnapshot().csv).toContain('Emma Wilson');
    expect(model.getSnapshot()).toMatchObject({ count: 3, csvRequested: true });
    model.filter('search', 'missing');
    expect(model.getSnapshot()).toMatchObject({ count: 0, csvRequested: false });
    model.previewCsv();
    expect(model.getSnapshot()).toMatchObject({ csv: '', csvRequested: true });
    model.reset();
    expect(model.getSnapshot()).toMatchObject({
      count: 8,
      search: '',
      team: '',
      minimum: '',
      generation: 1,
      csvRequested: false,
      csv: '',
      editError: '',
    });
  });
  it('fits columns after the parent element is bound, including child-first mounting', async () => {
    const model = createExampleModel('selection');
    const grid = createGrid({
      data: model.getSnapshot().rows,
      columns: model.columns,
      getRowId: (row) => row.id,
      initialState: model.initialState,
    });
    let frame: HTMLElement | null = null;
    model.attach(grid, () => frame);
    frame = { clientWidth: 902 } as HTMLElement;
    await Promise.resolve();
    expect(
      Object.values(grid.getState().columnSizing).reduce(
        (total, size) => total + size,
        0,
      ),
    ).toBeCloseTo(900, 1);
  });
  it('opens the next editor only after committed row data reaches the adapter', () => {
    const { model, grid } = setup('editing');
    grid.startCellEdit('p1', 'name');
    const row = grid.getRowModel().rows[0]!;
    const column = grid.getVisibleLeafColumns().find((item) => item.id === 'name')!;
    const pending: FrameRequestCallback[] = [];
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      pending.push(callback);
      return 1;
    });
    try {
      const editor = createInlineEditor(
        {
          grid,
          row,
          column,
          value: 'Mina Park',
          validationMessage: null,
          isActive: () => grid.getState().editingCell?.columnId === 'name',
          commit: (value, event) => grid.commitCellEdit(value, event),
          cancel: (event) => grid.cancelCellEdit(event),
        },
        () => {},
      );
      editor.keydown(
        {
          key: 'Tab',
          shiftKey: false,
          isComposing: false,
          preventDefault() {},
          stopPropagation() {},
        } as KeyboardEvent,
        'Mina Updated',
      );
      expect(grid.getState().editingCell).toBeNull();
      expect(pending).toHaveLength(1);
      grid.setOptions((previous) => ({ ...previous, data: model.getSnapshot().rows }));
      pending[0]!(0);
      expect(grid.getState().editingCell).toEqual({ rowId: 'p1', columnId: 'team' });
      expect(grid.getRowModel().rows[0]!.original?.name).toBe('Mina Updated');
    } finally {
      vi.unstubAllGlobals();
    }
  });
  it('keeps invalid edits open, blocks Tab and does not overwrite stored rows', async () => {
    const { model, grid } = setup('editing');
    grid.startCellEdit('p1', 'score');
    const row = grid.getRowModel().rows[0]!;
    const column = grid.getVisibleLeafColumns().find((item) => item.id === 'score')!;
    let error = '';
    const editor = createInlineEditor(
      {
        grid,
        row,
        column,
        value: 82,
        validationMessage: null,
        isActive: () =>
          grid.getState().editingCell?.rowId === 'p1' &&
          grid.getState().editingCell?.columnId === 'score',
        commit: (value, event) =>
          grid.commitCellEdit(
            typeof value === 'string' ? editableScore.editValueParser(value) : value,
            event,
          ),
        cancel: (event) => grid.cancelCellEdit(event),
      },
      (message) => {
        error = message;
      },
    );
    const event = {
      key: 'Tab',
      shiftKey: false,
      isComposing: false,
      preventDefault() {},
      stopPropagation() {},
    } as KeyboardEvent;
    editor.keydown(event, '101');
    await Promise.resolve();
    expect(error).toBe('Enter a score from 0 to 100.');
    expect(model.getSnapshot().rows[0]!.score).toBe(82);
    expect(grid.getState().editingCell).toMatchObject({
      rowId: 'p1',
      columnId: 'score',
    });
    editor.compositionStart();
    expect(editor.save('99')).toBe(false);
    editor.compositionEnd();
    expect(editor.save('99')).toBe(true);
    expect(model.getSnapshot().rows[0]!.score).toBe(99);
  });
});
