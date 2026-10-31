import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from "react";

const useBrowserLayoutEffect = typeof document === "undefined" ? useEffect : useLayoutEffect;
import { createLayoutInteractions, defaultLayoutGridLabels, getIsLayoutInteractiveTarget, getLayoutCellContext, getLayoutCellId, getLayoutCellStyle, getLayoutFocusTarget, getLayoutRowOffset, LAYOUT_CLIPBOARD_MIME,
  type GridLayoutController, type GridLayoutState, type GridLayoutView, type LayoutCellContext, type LayoutClipboardContent, type LayoutDetailContext, type LayoutGridLabels, type LayoutInteractions, type LayoutRenderItem } from "@rowick/data/layout";
import type { CellCoordinate } from "@rowick/core";

export interface LayoutGridProps<TData> {
  controller: GridLayoutController<TData>; idPrefix?: string; height?: number; labels?: Partial<LayoutGridLabels>;
  renderCell?: (context: LayoutCellContext<TData>) => ReactNode;
  renderDetail?: (context: LayoutDetailContext<TData>) => ReactNode;
}
async function writeClipboard(content: LayoutClipboardContent) {
  if (!navigator.clipboard?.write || typeof ClipboardItem === "undefined") throw new Error("Rich clipboard access is unavailable. Use the native Copy or Cut shortcut.");
  await navigator.clipboard.write([new ClipboardItem({ "text/plain": new Blob([content.text], { type: "text/plain" }), "text/html": new Blob([content.html], { type: "text/html" }) })]);
}
async function readClipboard() {
  if (!navigator.clipboard) throw new Error("Clipboard access is unavailable. Use the native Paste shortcut.");
  if (!navigator.clipboard.read) return { text: await navigator.clipboard.readText() };
  const items = await navigator.clipboard.read(); let text = "", html: string | undefined, payload: string | undefined;
  const item = items.find((item) => item.types.includes("text/plain") || item.types.includes("text/html"));
  if (item) for (const type of ["text/plain", "text/html", LAYOUT_CLIPBOARD_MIME]) if (item.types.includes(type)) {
    const blob = await item.getType(type); if (blob.size > 4_000_000) throw new RangeError("Clipboard item is too large");
    const value = await blob.text(); if (type === "text/plain") text = value; else if (type === "text/html") html = value; else payload = value;
  }
  return { text, ...(html !== undefined ? { html } : {}), ...(payload !== undefined ? { payload } : {}) };
}
export function LayoutGrid<TData>({ controller, idPrefix, height = 440, labels: overrides, renderCell, renderDetail }: LayoutGridProps<TData>) {
  const generated = useId(), prefix = idPrefix ?? generated, state = useSyncExternalStore(controller.subscribe, controller.getState, controller.getState);
  const labels = { ...defaultLayoutGridLabels, ...overrides }, labelsRef = useRef(labels); labelsRef.current = labels;
  const host = useRef<HTMLDivElement>(null), header = useRef<HTMLTableSectionElement>(null), rowNodes = useRef(new Map<string, HTMLTableRowElement>()), observer = useRef<ResizeObserver | undefined>(undefined);
  const interaction = useRef<LayoutInteractions | undefined>(undefined), animation = useRef<number | undefined>(undefined), mounted = useRef(false), ownerRef = useRef(controller); ownerRef.current = controller;
  const [viewport, setViewport] = useState({ scrollTop: 0, height, width: 800, headerHeight: 40 }), [notice, setNotice] = useState<{ text: string; error: boolean }>(), [fill, setFill] = useState("");
  const [composingToken, setComposingToken] = useState<number>();
  let view: GridLayoutView<TData> | undefined, viewError: string | undefined;
  try { view = controller.getView({ scrollTop: viewport.scrollTop, height: Math.max(1, viewport.height - viewport.headerHeight), overscan: 3 }); } catch (error) { viewError = labels.error(error); }
  const reveal = useCallback((coordinate: CellCoordinate, offset?: number | null) => {
    const element = host.current; if (!element || !mounted.current) return;
    const expectedEditing = controller.getState().editing?.token, initialFocus = document.activeElement;
    if (offset !== undefined && offset !== null) element.scrollTop = Math.max(0, offset);
    setViewport((previous) => ({ ...previous, scrollTop: element.scrollTop }));
    requestAnimationFrame(() => {
      if (!mounted.current || ownerRef.current !== controller) return;
      const current = controller.getState(), editing = current.editing;
      if (editing?.token !== expectedEditing || (editing ? editing.coordinate.rowId !== coordinate.rowId || editing.coordinate.columnId !== coordinate.columnId : current.focusedCell?.rowId !== coordinate.rowId || current.focusedCell.columnId !== coordinate.columnId)) return;
      const targetId = editing ? `${prefix}-editor-${editing.token}` : getLayoutCellId(prefix, coordinate);
      const target = document.getElementById(targetId); if (!target || !element.contains(target)) return;
      const currentFocus = document.activeElement;
      if (currentFocus !== initialFocus && currentFocus !== target && getIsLayoutInteractiveTarget(currentFocus)) return;
      target.focus({ preventScroll: true }); const rectangle = target.getBoundingClientRect(), bounds = element.getBoundingClientRect();
      if (rectangle.left < bounds.left) element.scrollLeft -= bounds.left - rectangle.left; else if (rectangle.right > bounds.right) element.scrollLeft += rectangle.right - bounds.right;
    });
  }, [controller, prefix]);
  useBrowserLayoutEffect(() => {
    mounted.current = true; setComposingToken(undefined); interaction.current = createLayoutInteractions(controller, { reveal, report: (text, error = false) => setNotice(text ? { text, error } : undefined), getLabels: () => labelsRef.current, writeClipboard, readClipboard });
    const finish = () => interaction.current?.pointerEnd(); window.addEventListener("pointerup", finish); window.addEventListener("pointercancel", finish);
    const measure = () => {
      animation.current = undefined; if (!mounted.current || !host.current) return;
      const element = host.current, headerHeight = header.current?.getBoundingClientRect().height ?? 40;
      setViewport((previous) => Math.abs(previous.height - element.clientHeight) < .5 && Math.abs(previous.width - element.clientWidth) < .5 && Math.abs(previous.headerHeight - headerHeight) < .5 ? previous : { ...previous, height: element.clientHeight, width: element.clientWidth, headerHeight });
      const values = [...rowNodes.current].map(([key, node]) => ({ key, height: node.getBoundingClientRect().height })).filter((value) => value.height >= 1);
      try { controller.measureMany(values); } catch (error) { setNotice({ text: labelsRef.current.error(error), error: true }); }
    };
    const schedule = () => { if (animation.current === undefined) animation.current = requestAnimationFrame(measure); };
    if (typeof ResizeObserver !== "undefined") { observer.current = new ResizeObserver(schedule); if (host.current) observer.current.observe(host.current); if (header.current) observer.current.observe(header.current); for (const node of rowNodes.current.values()) observer.current.observe(node); }
    window.addEventListener("resize", schedule); schedule();
    return () => { mounted.current = false; interaction.current?.dispose(); interaction.current = undefined; observer.current?.disconnect(); observer.current = undefined; if (animation.current !== undefined) cancelAnimationFrame(animation.current); animation.current = undefined; window.removeEventListener("resize", schedule); window.removeEventListener("pointerup", finish); window.removeEventListener("pointercancel", finish); };
  }, [controller, reveal]);
  useEffect(() => { if (state.editing) reveal(state.editing.coordinate, controller.getScrollOffset(state.editing.coordinate.rowId)); }, [controller, reveal, state.editing?.token]);
  const register = useCallback((key: string, node: HTMLTableRowElement) => {
    const previous = rowNodes.current.get(key); if (previous && previous !== node) observer.current?.unobserve(previous); rowNodes.current.set(key, node); observer.current?.observe(node);
    return () => { if (rowNodes.current.get(key) === node) { observer.current?.unobserve(node); rowNodes.current.delete(key); } };
  }, []);
  const run = (operation: () => unknown) => interaction.current?.run(operation), selected = state.focusedCell?.rowId;
  const pinned = selected ? [...state.topPins, ...state.bottomPins].includes(selected) : false, canReorder = controller.getCanReorder() && !pinned && !state.editing;
  const target = view ? getLayoutFocusTarget(controller, view, state.focusedCell) : { coordinate: null, mounted: false }, tabCell = target.coordinate, focusedMounted = target.mounted;
  const button = (label: string, action: () => unknown, disabled = false) => <button type="button" disabled={disabled} onClick={() => run(action)}>{label}</button>;
  const spacer = (size: number, key: string) => size > 0 ? <tr key={key} role="presentation" aria-hidden="true" className="rowick-layout__spacer"><td role="presentation" colSpan={Math.max(1, view?.columns.length ?? 1)} style={{ height: size, padding: 0, border: 0 }} /></tr> : null;
  const setComposing = (token: number, composing: boolean) => { if (controller.getState().editing?.token !== token) return; interaction.current?.setComposing(token, composing); setComposingToken(composing ? token : undefined); };
  const row = (item: LayoutRenderItem<TData>) => view && <LayoutRow key={item.key} item={item} view={view} state={state} controller={controller} prefix={prefix} labels={labels} interaction={interaction} register={register} headerHeight={viewport.headerHeight} tabCell={tabCell} renderCell={renderCell} renderDetail={renderDetail} setComposing={setComposing} />;
  return <section className="rowick-layout" dir={view?.direction ?? "ltr"} aria-label={labels.panel} style={{ "--rowick-layout-viewport-width": `${viewport.width}px` } as CSSProperties}>
    <p id={`${prefix}-help`}>{labels.instructions}</p><p id={`${prefix}-readonly`}>{labels.readOnly}</p>
    <div role="group" aria-label={labels.panel} className="rowick-layout__toolbar">
      {button(labels.editSelected, () => interaction.current?.startEdit(state.focusedCell!), !view || !state.focusedCell || Boolean(state.editing) || !controller.getCanEdit(state.focusedCell.rowId, state.focusedCell.columnId))}
      {state.editing && <>{button(labels.commitEdit, () => interaction.current?.editorKey({ key: "Enter", preventDefault() {}, stopPropagation() {} }, state.editing!.token), composingToken === state.editing.token)}{button(labels.cancelEdit, () => interaction.current?.editorKey({ key: "Escape", preventDefault() {}, stopPropagation() {} }, state.editing!.token), composingToken === state.editing.token)}</>}
      {button(labels.pinTop, () => controller.pin(selected!, "top"), !selected)}{button(labels.pinBottom, () => controller.pin(selected!, "bottom"), !selected)}{button(labels.unpin, () => controller.pin(selected!, false), !selected || !pinned)}{button(labels.details, () => controller.toggleDetail(selected!), !selected)}
      {button(labels.moveUp, () => controller.moveRow(selected!, -1), !selected || !canReorder)}{button(labels.moveDown, () => controller.moveRow(selected!, 1), !selected || !canReorder)}
      {button(labels.clearMerges, () => controller.setSpans([]))}{button(labels.unpinAll, controller.clearPins)}{button(labels.collapseDetails, controller.collapseDetails)}{button(labels.clearRanges, controller.clearRanges)}
      {button(labels.undo, controller.undo, !state.canUndo)}{button(labels.redo, controller.redo, !state.canRedo)}
      {button(labels.copy, () => { void interaction.current?.copyClipboard(); }, !state.ranges.length || Boolean(state.editing))}{button(labels.cut, () => { void interaction.current?.copyClipboard(true); }, !state.ranges.length || Boolean(state.editing))}{button(labels.paste, () => { void interaction.current?.pasteClipboard(); }, !state.ranges.length || Boolean(state.editing))}
      <label htmlFor={`${prefix}-fill`}>{labels.fillValue}</label><input id={`${prefix}-fill`} value={fill} onChange={(event) => setFill(event.currentTarget.value)} />{button(labels.fill, () => controller.fill(fill), !state.ranges.length || Boolean(state.editing))}
    </div>
    <p>{selected ? labels.selected(selected) : "\u00a0"}</p><p>{labels.reorderUnavailable}</p>
    <p role="status">{view && labels.counts(view.recordCount, view.rowCount)}</p>
    {(notice?.text ?? state.message) && <p role={notice?.error ? "alert" : "status"}>{notice?.text ?? state.message}</p>}
    {viewError && <p role="alert">{labels.unavailable} {viewError}</p>}
    <div ref={host} className="rowick-layout__viewport" style={{ height }} onScroll={(event) => { const scrollTop = event.currentTarget.scrollTop; setViewport((previous) => previous.scrollTop === scrollTop ? previous : { ...previous, scrollTop }); }}>
      {view && view.columns.length > 0 && <table role="grid" aria-label={labels.grid(controller.grid.getState().pagination.pageIndex + 1)} aria-describedby={`${prefix}-help`} aria-rowcount={view.rowCount + 1} aria-colcount={view.columns.length} aria-multiselectable="true" dir="ltr" tabIndex={focusedMounted ? undefined : 0}
        style={{ width: view.columns.reduce((total, column) => total + column.getSize(), 0) }} onFocus={(event) => { if (event.target === event.currentTarget && tabCell) reveal(tabCell, controller.getScrollOffset(tabCell.rowId)); }}
        onKeyDown={(event) => interaction.current?.key(event)} onCopy={(event) => interaction.current?.copy(event)} onCut={(event) => interaction.current?.copy(event, true)} onPaste={(event) => interaction.current?.paste(event)}>
        <colgroup>{view.columns.map((column) => <col key={column.id} style={{ width: column.getSize() }} />)}</colgroup>
        <thead ref={header}><tr role="row" aria-rowindex={1}>{view.columns.map((column, index) => <th key={column.id} role="columnheader" scope="col" aria-colindex={index + 1} style={{ ...getLayoutCellStyle(view!, index), top: 0, position: "sticky", zIndex: column.getIsPinned() ? 44 : 40 }} dir={view!.direction}>{typeof column.columnDef.header === "string" ? column.columnDef.header : column.id}</th>)}</tr></thead>
        <tbody>{view.top.map(row)}</tbody><tbody>{spacer(view.beforeHeight, "before")}{view.center.map(row)}{spacer(view.afterHeight, "after")}</tbody><tbody>{view.bottom.map(row)}</tbody>
      </table>}
      {view && !view.columns.length && <p>{labels.noColumns}</p>}
      {view && !view.rowCount && <p>{labels.empty}</p>}
    </div>
  </section>;
}
function LayoutRow<TData>({ item, view, state, controller, prefix, labels, interaction, register, headerHeight, tabCell, renderCell, renderDetail, setComposing }: {
  item: LayoutRenderItem<TData>; view: GridLayoutView<TData>; state: GridLayoutState; controller: GridLayoutController<TData>; prefix: string; labels: LayoutGridLabels;
  interaction: { current: LayoutInteractions | undefined }; register: (key: string, node: HTMLTableRowElement) => () => void; headerHeight: number; tabCell: CellCoordinate | null;
  renderCell: LayoutGridProps<TData>["renderCell"]; renderDetail: LayoutGridProps<TData>["renderDetail"];
  setComposing: (token: number, composing: boolean) => void;
}) {
  const element = useRef<HTMLTableRowElement>(null); useEffect(() => element.current ? register(item.key, element.current) : undefined, [item.key, register]);
  const offset = getLayoutRowOffset(view, item), rowStyle: CSSProperties = { ...(item.kind === "row" ? { height: item.estimatedHeight } : {}), ...(item.position !== "center" ? { position: "sticky", zIndex: 20, ...(item.position === "top" ? { top: headerHeight + offset } : { bottom: offset }) } : {}) };
  if (item.kind === "detail") return <tr ref={element} role="row" aria-rowindex={item.rowIndex + 2} style={rowStyle} data-layout-position={item.position}>
    <td role="gridcell" colSpan={Math.max(1, view.columns.length)} aria-colindex={1} aria-colspan={view.columns.length} data-layout-detail="true"><div className="rowick-layout__detail" dir={view.direction} aria-label={labels.detail(item.row.id)}>
      {renderDetail ? renderDetail({ controller, row: item.row, rowIndex: item.rowIndex, position: item.position }) : controller.getDetailText(item.row.id)}
    </div></td></tr>;
  const pinned = [...state.topPins, ...state.bottomPins].includes(item.row.id);
  return <tr ref={element} role="row" aria-rowindex={item.rowIndex + 2} data-row-id={item.row.id} data-layout-position={item.position} style={rowStyle}
    onDragOver={(event) => { if (interaction.current?.getIsDragging()) { event.preventDefault(); event.dataTransfer.dropEffect = "move"; } }}
    onDrop={(event) => { if (!interaction.current?.getIsDragging()) return; event.preventDefault(); const bounds = event.currentTarget.getBoundingClientRect(); interaction.current.drop(item.row.id, event.clientY > bounds.top + bounds.height / 2 ? "after" : "before"); }}>
    {view.columns.map((column, index) => {
      const span = controller.getCellSpan(item.row.id, column.id); if (span?.covered) return null;
      const coordinate = { rowId: item.row.id, columnId: column.id }, editing = state.editing?.coordinate.rowId === item.row.id && state.editing.coordinate.columnId === column.id ? state.editing : null, editable = controller.getCanEdit(item.row.id, column.id), context = getLayoutCellContext(controller, item, column, index);
      const label = typeof column.columnDef.header === "string" ? column.columnDef.header : column.id;
      return <td key={column.id} id={getLayoutCellId(prefix, coordinate)} role="gridcell" aria-colindex={index + 1} aria-selected={controller.getIsCellSelected(item.row.id, column.id)} aria-readonly={!editable} aria-describedby={!editable ? `${prefix}-readonly` : undefined}
        rowSpan={span?.rowSpan ?? 1} colSpan={span?.columnSpan ?? 1} aria-rowspan={span?.rowSpan} aria-colspan={span?.columnSpan} data-column-id={column.id} data-layout-cell="true" data-layout-pinned={column.getIsPinned() || undefined}
        tabIndex={tabCell?.rowId === item.row.id && tabCell.columnId === column.id ? 0 : -1} style={getLayoutCellStyle(view, index, span?.columnSpan ?? 1)} dir={view.direction}
        onFocus={(event) => { const focused = controller.getState().focusedCell; if (event.target === event.currentTarget && (focused?.rowId !== item.row.id || focused.columnId !== column.id)) interaction.current?.focus(coordinate); }}
        onPointerDown={(event) => interaction.current?.pointerStart(coordinate, event)} onPointerEnter={(event) => interaction.current?.pointerEnter(coordinate, event.buttons)} onDoubleClick={(event) => { if (!getIsLayoutInteractiveTarget(event.target)) interaction.current?.startEdit(coordinate); }}>
        {index === 0 && <button type="button" tabIndex={-1} className="rowick-layout__drag" aria-label={labels.drag(item.row.id)} disabled={!controller.getCanReorder() || pinned || Boolean(state.editing)} draggable={controller.getCanReorder() && !pinned && !state.editing}
          onDragStart={(event) => { if (!interaction.current?.dragStart(item.row.id, event.dataTransfer)) event.preventDefault(); }} onDragEnd={() => interaction.current?.dragEnd()}>↕</button>}
        {editing ? <><input id={`${prefix}-editor-${editing.token}`} aria-label={labels.edit(label)} className="rowick-layout__editor" value={editing.value} aria-invalid={Boolean(editing.error)} aria-describedby={editing.error ? `${prefix}-edit-error` : undefined}
          onChange={(event) => interaction.current?.setEditInput(editing.token, event.currentTarget.value)} onCompositionStart={() => setComposing(editing.token, true)} onCompositionEnd={(event) => { interaction.current?.setEditInput(editing.token, event.currentTarget.value); setComposing(editing.token, false); }} onKeyDown={(event) => interaction.current?.editorKey(event, editing.token)} />{editing.error && <p id={`${prefix}-edit-error`} role="alert">{editing.error}</p>}</>
          : renderCell ? renderCell(context) : String(context.value ?? "")}
      </td>;
    })}
  </tr>;
}
