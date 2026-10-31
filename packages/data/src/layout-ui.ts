import type { CellContext, CellCoordinate, Column, FocusDirection, Row } from "@rowick/core";
import type { GridLayoutController, GridLayoutView, LayoutClipboardResult, LayoutRenderItem } from "./layout-controller";
import { LAYOUT_CLIPBOARD_MIME, parseLayoutClipboardPayload } from "./layout-clipboard";

export interface LayoutGridLabels {
  panel: string; grid: (page: number) => string; instructions: string; readOnly: string;
  counts: (records: number, logicalRows: number) => string; selected: (id: string) => string;
  pinTop: string; pinBottom: string; unpin: string; details: string; moveUp: string; moveDown: string;
  editSelected: string; commitEdit: string; cancelEdit: string;
  reorderUnavailable: string; clearMerges: string; unpinAll: string; collapseDetails: string; clearRanges: string;
  undo: string; redo: string; fillValue: string; fill: string; copy: string; cut: string; paste: string;
  drag: (id: string) => string; edit: (label: string) => string; detail: (id: string) => string;
  empty: string; noColumns: string; unavailable: string; copied: string; cutDone: string;
  clipboard: (result: LayoutClipboardResult) => string;
  error: (error: unknown) => string;
}
export const defaultLayoutGridLabels: LayoutGridLabels = Object.freeze({
  panel: "Advanced grid layout", grid: (page: number) => `Current page ${page} grid layout`,
  instructions: "Use arrow keys to move, Shift to extend a range, and Control or Command to add ranges. F2 or Enter edits a cell. Escape cancels editing. Copy, cut and paste use the selected ranges. Detail controls keep their normal keyboard behavior.",
  readOnly: "This cell is read-only. Read-only or invalid cells are skipped by paste; cut requires every selected cell to accept clearing.",
  counts: (records: number, logicalRows: number) => `${records} total records; ${logicalRows} logical rows in this page layout`, selected: (id: string) => `Selected row ${id}`,
  pinTop: "Pin selected top", pinBottom: "Pin selected bottom", unpin: "Unpin selected", details: "Toggle selected details", moveUp: "Move selected up", moveDown: "Move selected down",
  editSelected: "Edit selected cell", commitEdit: "Commit cell", cancelEdit: "Cancel cell",
  reorderUnavailable: "Reordering requires an unsorted, unfiltered flat client view, an immutable data owner and no dirty or pending drafts. Unpin the selected row before moving it.",
  clearMerges: "Clear merges", unpinAll: "Unpin all", collapseDetails: "Collapse details", clearRanges: "Clear ranges", undo: "Undo drafts", redo: "Redo drafts",
  fillValue: "Fill value", fill: "Fill selection", copy: "Copy selection", cut: "Cut selection", paste: "Paste selection",
  drag: (id: string) => `Drag row ${id}`, edit: (label: string) => `Edit ${label}`, detail: (id: string) => `Details for ${id}`,
  empty: "No rows in the current layout", noColumns: "No visible columns. Show a column to use the grid.", unavailable: "This layout combination is unavailable. Clear merges, unpin rows or collapse details to recover.", copied: "Selection copied", cutDone: "Selection copied and cleared",
  clipboard: (result: LayoutClipboardResult) => `${result.committed} cells changed; ${result.skipped.length} skipped${result.blocked ? "; change blocked" : ""}`,
  error: (error: unknown) => error instanceof Error ? error.message : "Layout action failed",
});
export interface LayoutCellContext<TData> extends CellContext<TData, unknown> {
  readonly controller: GridLayoutController<TData>; readonly rowIndex: number; readonly columnIndex: number;
  readonly position: "top" | "center" | "bottom"; readonly rowSpan: number; readonly columnSpan: number;
}
export interface LayoutDetailContext<TData> { readonly controller: GridLayoutController<TData>; readonly row: Row<TData>; readonly rowIndex: number; readonly position: "top" | "center" | "bottom"; }
export interface LayoutCellStyle { width: number; minWidth: number; position?: "sticky"; left?: number; right?: number; zIndex?: number; }
export function getLayoutCellId(prefix: string, coordinate: CellCoordinate): string { return `${prefix}-cell-${encodeURIComponent(JSON.stringify([coordinate.rowId, coordinate.columnId]))}`; }
export function getLayoutCellStyle<TData>(view: GridLayoutView<TData>, columnIndex: number, columnSpan = 1): LayoutCellStyle {
  const columns = view.columns.slice(columnIndex, columnIndex + columnSpan), layout = view.columnLayout.find((item) => item.id === columns[0]?.id);
  const width = columns.reduce((total, column) => total + column.getSize(), 0);
  if (!layout?.pinned) return { width, minWidth: width };
  const last = view.columnLayout.find((item) => item.id === columns.at(-1)?.id);
  return { width, minWidth: width, position: "sticky", ...(layout.pinned === "left" ? { left: layout.pinnedStart ?? 0 } : { right: last?.pinnedStart ?? 0 }), zIndex: 4 };
}
export function getLayoutCellStyleText(style: LayoutCellStyle): string {
  return `width:${style.width}px;min-width:${style.minWidth}px;${style.position ? `position:${style.position};` : ""}${style.left !== undefined ? `left:${style.left}px;` : ""}${style.right !== undefined ? `right:${style.right}px;` : ""}${style.zIndex !== undefined ? `z-index:${style.zIndex};` : ""}`;
}
export function getLayoutRowOffset<TData>(view: GridLayoutView<TData>, item: LayoutRenderItem<TData>): number {
  const source = item.position === "top" ? view.top : view.bottom, index = source.findIndex((entry) => entry.key === item.key);
  return (item.position === "top" ? source.slice(0, index) : source.slice(index + 1)).reduce((total, entry) => total + entry.height, 0);
}
export function getLayoutFocusTarget<TData>(controller: GridLayoutController<TData>, view: GridLayoutView<TData>, focused: CellCoordinate | null): { coordinate: CellCoordinate | null; mounted: boolean } {
  const items = [...view.top, ...view.center, ...view.bottom], first = items.find((item) => item.kind === "row"), column = view.direction === "rtl" ? view.columns.at(-1) : view.columns[0];
  let coordinate = focused && view.columns.some((column) => column.id === focused.columnId) ? focused : first && column ? { rowId: first.row.id, columnId: column.id } : null;
  if (coordinate) coordinate = controller.getCellSpan(coordinate.rowId, coordinate.columnId)?.anchor ?? coordinate;
  return { coordinate, mounted: Boolean(coordinate && items.some((item) => item.kind === "row" && item.row.id === coordinate!.rowId)) };
}
export function getLayoutCellContext<TData>(controller: GridLayoutController<TData>, item: LayoutRenderItem<TData>, column: Column<TData, unknown>, columnIndex: number): LayoutCellContext<TData> {
  const span = controller.getCellSpan(item.row.id, column.id);
  return { controller, grid: controller.grid, row: item.row, column, value: controller.getCellValue(item.row.id, column.id), rowIndex: item.rowIndex, columnIndex,
    position: item.position, rowSpan: span?.rowSpan ?? 1, columnSpan: span?.columnSpan ?? 1 };
}
export interface LayoutKeyboardEventLike { key: string; ctrlKey?: boolean; metaKey?: boolean; altKey?: boolean; shiftKey?: boolean; isComposing?: boolean; keyCode?: number; nativeEvent?: { isComposing?: boolean; keyCode?: number }; }
export function getIsLayoutComposing(event: LayoutKeyboardEventLike): boolean { return event.isComposing === true || event.keyCode === 229 || event.nativeEvent?.isComposing === true || event.nativeEvent?.keyCode === 229; }
export function getLayoutNavigation(event: LayoutKeyboardEventLike): FocusDirection | null {
  if (getIsLayoutComposing(event) || event.altKey) return null;
  const control = event.ctrlKey || event.metaKey;
  if (event.key === "Home") return control ? "grid-start" : "home";
  if (event.key === "End") return control ? "grid-end" : "end";
  const keys: Record<string, FocusDirection> = { ArrowLeft: "left", ArrowRight: "right", ArrowUp: "up", ArrowDown: "down", PageUp: "page-up", PageDown: "page-down" };
  return Object.hasOwn(keys, event.key) ? keys[event.key]! : null;
}
export function getIsLayoutInteractiveTarget(target: unknown): boolean {
  const candidate = target as { closest?: (selector: string) => unknown } | null;
  return Boolean(candidate?.closest?.('input,textarea,select,button,a[href],[contenteditable]:not([contenteditable="false"]),[role="textbox"],[role="combobox"],[data-layout-detail]'));
}
export interface LayoutClipboardContent { readonly text: string; readonly payload: string; readonly html: string; }
export function createLayoutClipboardContent(copy: { text: string; payload: string }): LayoutClipboardContent {
  const payload = parseLayoutClipboardPayload(copy.payload), escape = (value: string) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
  const html = payload.blocks.map((block, index) => `<table${index === 0 ? ` data-rowick-ranges="${encodeURIComponent(copy.payload)}"` : ""}><tbody>${block.values.map((row) => `<tr>${row.map((value) => `<td>${escape(/^[=+\-@\t\r]/.test(value) ? `'${value}` : value)}</td>`).join("")}</tr>`).join("")}</tbody></table>`).join("");
  if (html.length > 4_000_000) throw new RangeError("Clipboard HTML is too large; reduce the selected range");
  return Object.freeze({ ...copy, html });
}
export function getLayoutHTMLPayload(html: string): string | undefined {
  if (html.length > 4_000_000) throw new RangeError("Clipboard HTML is too large");
  const marker = 'data-rowick-ranges="', start = html.indexOf(marker); if (start < 0) return undefined;
  const end = html.indexOf('"', start + marker.length); if (end < 0) throw new TypeError("Invalid clipboard range metadata");
  const serialized = decodeURIComponent(html.slice(start + marker.length, end)); parseLayoutClipboardPayload(serialized); return serialized;
}
export interface LayoutTransferLike { readonly types: readonly string[]; getData: (type: string) => string; setData: (type: string, value: string) => void; }
export interface LayoutInteractionPorts {
  readonly reveal: (coordinate: CellCoordinate, scrollOffset?: number | null) => void;
  readonly report: (message: string | undefined, error?: boolean) => void;
  readonly getLabels?: () => LayoutGridLabels;
  /** Resolves only after the clipboard accepted plain text and HTML range metadata. */
  readonly writeClipboard: (content: LayoutClipboardContent) => Promise<void>;
  readonly readClipboard: () => Promise<{ text: string; payload?: string; html?: string }>;
}
export interface LayoutInteractions {
  run: (operation: () => unknown) => boolean;
  focus: (coordinate: CellCoordinate) => void;
  startEdit: (coordinate: CellCoordinate) => void;
  setComposing: (token: number, composing: boolean) => void;
  setEditInput: (token: number, value: string) => void;
  key: (event: LayoutKeyboardEventLike & { defaultPrevented?: boolean; target?: unknown; preventDefault(): void }) => void;
  pointerStart: (coordinate: CellCoordinate, event: { button: number; shiftKey: boolean; ctrlKey: boolean; metaKey: boolean; pointerType?: string; target?: unknown; preventDefault(): void; stopPropagation?(): void }) => void;
  pointerEnter: (coordinate: CellCoordinate, buttons: number) => void;
  pointerEnd: () => void;
  editorKey: (event: LayoutKeyboardEventLike & { preventDefault(): void; stopPropagation(): void }, token: number) => void;
  copy: (event: { target?: unknown; defaultPrevented?: boolean; clipboardData: LayoutTransferLike | null; preventDefault(): void }, cut?: boolean) => void;
  paste: (event: { target?: unknown; defaultPrevented?: boolean; clipboardData: LayoutTransferLike | null; preventDefault(): void }) => void;
  copyClipboard: (cut?: boolean) => Promise<void>;
  pasteClipboard: () => Promise<void>;
  dragStart: (rowId: string, transfer?: { setData(type: string, value: string): void; effectAllowed: string } | null) => boolean;
  getIsDragging: () => boolean;
  drop: (targetId: string, position: "before" | "after") => void;
  dragEnd: () => void;
  dispose: () => void;
}
/** UI event adapter. DOM rendering, measurement and focus scheduling belong to the host. */
export function createLayoutInteractions<TData>(controller: GridLayoutController<TData>, ports: LayoutInteractionPorts): LayoutInteractions {
  let disposed = false, pointer = false, dragged: string | undefined, composingToken: number | undefined;
  const labels = () => ports.getLabels?.() ?? defaultLayoutGridLabels;
  const run = (operation: () => unknown): boolean => {
    if (disposed) return false; ports.report(undefined);
    try { operation(); return true; } catch (error) { ports.report(labels().error(error), true); return false; }
  };
  const reveal = () => { const focused = controller.getState().focusedCell; if (focused) ports.reveal(focused, controller.getScrollOffset(focused.rowId)); };
  const leaveEditor = (coordinate: CellCoordinate): boolean => {
    const editing = controller.getState().editing;
    if (!editing || editing.coordinate.rowId === coordinate.rowId && editing.coordinate.columnId === coordinate.columnId) return true;
    if (editing.token === composingToken) { ports.reveal(editing.coordinate, controller.getScrollOffset(editing.coordinate.rowId)); return false; }
    if (!controller.commitEdit(editing.token)) { ports.reveal(editing.coordinate, controller.getScrollOffset(editing.coordinate.rowId)); return false; }
    return controller.getState().editing === null;
  };
  const writeNative = (transfer: LayoutTransferLike, content: LayoutClipboardContent) => {
    transfer.setData("text/plain", content.text); transfer.setData("text/html", content.html);
    if (!["text/plain", "text/html"].every((type) => Array.from(transfer.types).includes(type))) throw new Error("Clipboard rejected the required text/HTML formats; cells were not cleared");
    // Standard HTML also retains the validated range payload when custom MIME is restricted.
    try { transfer.setData(LAYOUT_CLIPBOARD_MIME, content.payload); } catch { /* HTML metadata is the interoperable fallback. */ }
  };
  const fromTransfer = (transfer: LayoutTransferLike) => {
    const hasPayload = Array.from(transfer.types).includes(LAYOUT_CLIPBOARD_MIME), payload = hasPayload ? transfer.getData(LAYOUT_CLIPBOARD_MIME) : getLayoutHTMLPayload(transfer.getData("text/html"));
    if (hasPayload && !payload) throw new TypeError("Empty clipboard range payload");
    return { text: transfer.getData("text/plain"), payload };
  };
  const interactions: LayoutInteractions = {
    run,
    focus: (coordinate) => { run(() => { if (!leaveEditor(coordinate)) return; controller.focus(coordinate); ports.reveal(coordinate); }); },
    startEdit: (coordinate) => { run(() => { if (!leaveEditor(coordinate)) return; if (controller.getState().editing) { ports.reveal(coordinate, controller.getScrollOffset(coordinate.rowId)); return; } if (!controller.getCanEdit(coordinate.rowId, coordinate.columnId)) throw new Error(labels().readOnly); controller.focus(coordinate); controller.beginEdit(coordinate); }); },
    setComposing: (token, composing) => { if (!disposed && controller.getState().editing?.token === token) composingToken = composing ? token : undefined; },
    setEditInput: (token, value) => { if (!disposed && controller.getState().editing?.token === token) controller.setEditInput(value); },
    key: (event) => {
      if (disposed || event.defaultPrevented || getIsLayoutComposing(event) || getIsLayoutInteractiveTarget(event.target)) return;
      const navigation = getLayoutNavigation(event);
      if (navigation) { event.preventDefault(); run(() => { const offset = controller.moveFocus(navigation, event.shiftKey === true), focused = controller.getState().focusedCell; if (focused) ports.reveal(focused, offset); }); return; }
      const control = event.ctrlKey || event.metaKey;
      if (control && ["z", "y"].includes(event.key.toLowerCase())) { event.preventDefault(); run(() => { if (event.key.toLowerCase() === "y" || event.shiftKey) controller.redo(); else controller.undo(); reveal(); }); return; }
      if (event.key === "Escape") { event.preventDefault(); run(controller.clearRanges); return; }
      if (event.key === "F2" || event.key === "Enter" || (!control && !event.altKey && event.key.length === 1)) {
        const cell = controller.getState().focusedCell; if (!cell) return; event.preventDefault();
        run(() => { if (!leaveEditor(cell)) return; if (controller.getState().editing) { ports.reveal(cell, controller.getScrollOffset(cell.rowId)); return; } if (!controller.getCanEdit(cell.rowId, cell.columnId)) throw new Error(labels().readOnly); controller.beginEdit(cell); if (event.key.length === 1) controller.setEditInput(event.key); });
      }
    },
    pointerStart: (coordinate, event) => {
      if (disposed || event.button !== 0 || getIsLayoutInteractiveTarget(event.target)) return;
      // Preserve compatibility mouse/double-click and native touch scrolling.
      // Host cells disable text selection while pointer ranges are active.
      event.stopPropagation?.();
      run(() => { if (!leaveEditor(coordinate)) return; controller.focus(coordinate, event.shiftKey, event.ctrlKey || event.metaKey); const state = controller.getState(); pointer = event.pointerType !== "touch" && state.ranges.some((range) => range.end.rowId === coordinate.rowId && range.end.columnId === coordinate.columnId); ports.reveal(state.focusedCell ?? coordinate); });
    },
    pointerEnter: (coordinate, buttons) => { if (!disposed && pointer && (buttons & 1)) run(() => controller.focus(coordinate, true)); },
    pointerEnd: () => { pointer = false; },
    editorKey: (event, token) => {
      event.stopPropagation(); if (disposed || getIsLayoutComposing(event) || composingToken === token || controller.getState().editing?.token !== token) return;
      if (event.key === "Enter" || event.key === "Tab") { event.preventDefault(); run(() => { if (controller.commitEdit(token) && controller.getState().editing === null) { if (event.key === "Tab") controller.moveFocus(event.shiftKey ? "left" : "right"); reveal(); } else if (controller.getState().editing?.token === token) reveal(); }); }
      else if (event.key === "Escape") { event.preventDefault(); run(() => { controller.cancelEdit(); if (controller.getState().editing === null) reveal(); }); }
    },
    copy: (event, cut = false) => {
      if (disposed || event.defaultPrevented || getIsLayoutInteractiveTarget(event.target) || !event.clipboardData) return;
      event.preventDefault(); run(() => {
        if (controller.getState().editing) throw new Error("Finish or cancel cell editing before copying ranges");
        if (cut) { const result = controller.cut((copy) => writeNative(event.clipboardData!, createLayoutClipboardContent(copy))); ports.report(labels().clipboard(result)); }
        else { writeNative(event.clipboardData!, createLayoutClipboardContent(controller.copy())); ports.report(labels().copied); }
      });
    },
    paste: (event) => {
      if (disposed || event.defaultPrevented || getIsLayoutInteractiveTarget(event.target) || !event.clipboardData) return;
      event.preventDefault(); run(() => { if (controller.getState().editing) throw new Error("Finish or cancel cell editing before pasting ranges"); const content = fromTransfer(event.clipboardData!), result = controller.paste(content.text, content.payload); ports.report(labels().clipboard(result)); reveal(); });
    },
    copyClipboard: async (cut = false) => {
      if (disposed) return; ports.report(undefined); const state = controller.getState(), source = controller.grid.getOptions().data;
      try {
        if (state.editing) throw new Error("Finish or cancel cell editing before copying ranges");
        const content = createLayoutClipboardContent(controller.copy()); await ports.writeClipboard(content);
        if (disposed) return;
        if (cut) {
          if (controller.getState().operationRevision !== state.operationRevision || controller.grid.getOptions().data !== source) throw new Error("Selection or data changed while copying; cells were not cleared");
          const result = controller.cut((copy) => { if (copy.payload !== content.payload) throw new Error("Selection changed; cells were not cleared"); }); ports.report(labels().clipboard(result));
        } else ports.report(labels().copied);
      } catch (error) { if (!disposed) ports.report(labels().error(error), true); }
    },
    pasteClipboard: async () => {
      if (disposed) return; ports.report(undefined); const state = controller.getState(), source = controller.grid.getOptions().data;
      try {
        if (state.editing) throw new Error("Finish or cancel cell editing before pasting ranges");
        const content = await ports.readClipboard(); if (disposed) return;
        if (controller.getState().operationRevision !== state.operationRevision || controller.grid.getOptions().data !== source) throw new Error("Selection or data changed while reading the clipboard; paste again");
        if (content.payload !== undefined && !content.payload) throw new TypeError("Empty clipboard range payload");
        const result = controller.paste(content.text, content.payload ?? (content.html ? getLayoutHTMLPayload(content.html) : undefined)); ports.report(labels().clipboard(result)); reveal();
      } catch (error) { if (!disposed) ports.report(labels().error(error), true); }
    },
    dragStart: (rowId, transfer) => {
      let accepted = false; run(() => { if (!controller.getCanReorder() || [...controller.getState().topPins, ...controller.getState().bottomPins].includes(rowId)) throw new Error(labels().reorderUnavailable);
        dragged = rowId; pointer = false; transfer?.setData("text/plain", rowId); if (transfer) transfer.effectAllowed = "move"; accepted = true; }); return accepted;
    },
    getIsDragging: () => !disposed && dragged !== undefined,
    drop: (targetId, position) => { if (!dragged || disposed) return; const source = dragged; dragged = undefined; run(() => controller.reorder(source, targetId, position)); },
    dragEnd: () => { dragged = undefined; },
    dispose: () => { disposed = true; pointer = false; dragged = undefined; composingToken = undefined; },
  };
  return interactions;
}
