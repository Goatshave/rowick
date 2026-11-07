import type { CellEditorContext } from '@rowick/core';
import type { Person } from './people';
export function focusEditor(element: HTMLInputElement | HTMLSelectElement) {
  element.focus();
  if (element instanceof HTMLInputElement) element.select();
}
export function createInlineEditor(
  context: CellEditorContext<Person>,
  report: (message: string) => void,
) {
  let composing = false;
  function save(draft: string, event?: Event) {
    if (!context.isActive() || composing) return false;
    const result = context.commit(draft, event);
    const error =
      result?.validation?.valid === false
        ? (result.validation.message ?? 'Check this value.')
        : '';
    report(error);
    return result !== null && !error;
  }
  function keydown(event: KeyboardEvent, draft: string) {
    if (event.isComposing || composing) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      if (context.isActive()) context.cancel(event);
    } else if (event.key === 'Enter' || event.key === 'Tab') {
      event.preventDefault();
      event.stopPropagation();
      const { grid, row, column } = context;
      const columns = grid
        .getVisibleLeafColumns()
        .filter((item) => ['name', 'team', 'status', 'score'].includes(item.id));
      const rows = grid.getRowModel().rows;
      const position =
        rows.findIndex((item) => item.id === row.id) * columns.length +
        columns.findIndex((item) => item.id === column.id);
      const next = position + (event.shiftKey ? -1 : 1);
      if (
        save(draft, event) &&
        event.key === 'Tab' &&
        next >= 0 &&
        next < rows.length * columns.length
      ) {
        const target = {
          rowId: rows[Math.floor(next / columns.length)]!.id,
          columnId: columns[next % columns.length]!.id,
        };
        // Let each adapter finish applying the committed row data first.
        // Svelte can apply child options in a later microtask than the owner.
        const navigate = () => {
          if (grid.getState().editingCell) return;
          grid.setFocusedCell(target);
          grid.startCellEdit(target.rowId, target.columnId);
        };
        if (typeof requestAnimationFrame === 'function')
          requestAnimationFrame(navigate);
        else queueMicrotask(navigate);
      }
    }
  }
  return {
    save,
    keydown,
    clear: () => report(''),
    compositionStart: () => {
      composing = true;
    },
    compositionEnd: () => {
      composing = false;
    },
  };
}
