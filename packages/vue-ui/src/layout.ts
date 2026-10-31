import { computed, defineComponent, h, onBeforeUnmount, onMounted, shallowRef, watch, type DefineComponent, type PropType, type VNode, type VNodeChild } from "vue";
import { createLayoutInteractions, defaultLayoutGridLabels, getIsLayoutInteractiveTarget, getLayoutCellContext, getLayoutCellId, getLayoutCellStyleText, getLayoutCellStyle, getLayoutFocusTarget, getLayoutRowOffset, LAYOUT_CLIPBOARD_MIME,
  type GridLayoutController, type LayoutCellContext, type LayoutClipboardContent, type LayoutDetailContext, type LayoutGridLabels, type LayoutInteractions, type LayoutRenderItem } from "@rowick/data/layout";
import type { CellCoordinate } from "@rowick/core";
export interface LayoutGridProps<TData> {
  controller: GridLayoutController<TData>; idPrefix: string; height?: number; labels?: Partial<LayoutGridLabels>;
  renderCell?: (context: LayoutCellContext<TData>) => VNodeChild; renderDetail?: (context: LayoutDetailContext<TData>) => VNodeChild;
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
export function createLayoutGrid<TData>(): DefineComponent<LayoutGridProps<TData>> {
  return defineComponent({
    props: { controller: { type: Object as PropType<GridLayoutController<TData>>, required: true }, idPrefix: { type: String, required: true }, height: { type: Number, default: 440 }, labels: { type: Object as PropType<Partial<LayoutGridLabels>>, default: undefined },
      renderCell: { type: Function as PropType<(context: LayoutCellContext<TData>) => VNodeChild>, default: undefined }, renderDetail: { type: Function as PropType<(context: LayoutDetailContext<TData>) => VNodeChild>, default: undefined } },
    setup(props) {
      const state = shallowRef(props.controller.getState()), viewport = shallowRef({ scrollTop: 0, height: props.height, width: 800, headerHeight: 40 }), notice = shallowRef<{ text: string; error: boolean }>(), fill = shallowRef(""), composingToken = shallowRef<number>();
      const labels = computed(() => ({ ...defaultLayoutGridLabels, ...props.labels }));
      const view = computed(() => { state.value.revision; try { return { value: props.controller.getView({ scrollTop: viewport.value.scrollTop, height: Math.max(1, viewport.value.height - viewport.value.headerHeight), overscan: 3 }), error: undefined }; } catch (error) { return { value: undefined, error: labels.value.error(error) }; } });
      let host: HTMLDivElement | null = null, header: HTMLTableSectionElement | null = null, mounted = false, stop = () => {}, interaction: LayoutInteractions | undefined, observer: ResizeObserver | undefined, animation: number | undefined;
      const rows = new Map<string, HTMLTableRowElement>();
      const reveal = (coordinate: CellCoordinate, offset?: number | null) => {
        const element = host, owner = props.controller, expected = owner.getState().editing?.token; if (!element || !mounted) return;
        const initialFocus = document.activeElement;
        if (offset !== undefined && offset !== null) element.scrollTop = Math.max(0, offset);
        viewport.value = { ...viewport.value, scrollTop: element.scrollTop };
        requestAnimationFrame(() => {
          if (!mounted || props.controller !== owner) return; const current = owner.getState(), editing = current.editing;
          if (editing?.token !== expected || (editing ? editing.coordinate.rowId !== coordinate.rowId || editing.coordinate.columnId !== coordinate.columnId : current.focusedCell?.rowId !== coordinate.rowId || current.focusedCell.columnId !== coordinate.columnId)) return;
          const id = editing ? `${props.idPrefix}-editor-${editing.token}` : getLayoutCellId(props.idPrefix, coordinate), target = document.getElementById(id); if (!target || !element.contains(target)) return;
          const currentFocus = document.activeElement;
          if (currentFocus !== initialFocus && currentFocus !== target && getIsLayoutInteractiveTarget(currentFocus)) return;
          target.focus({ preventScroll: true }); const rectangle = target.getBoundingClientRect(), bounds = element.getBoundingClientRect(); if (rectangle.left < bounds.left) element.scrollLeft -= bounds.left - rectangle.left; else if (rectangle.right > bounds.right) element.scrollLeft += rectangle.right - bounds.right;
        });
      };
      const register = (key: string, node: HTMLTableRowElement) => { const previous = rows.get(key); if (previous === node) return; if (previous) observer?.unobserve(previous); rows.set(key, node); observer?.observe(node); };
      const unregister = (key: string, node: HTMLTableRowElement) => { if (rows.get(key) === node) { observer?.unobserve(node); rows.delete(key); } };
      const measure = () => {
        animation = undefined; if (!mounted || !host) return; const next = { ...viewport.value, height: host.clientHeight, width: host.clientWidth, headerHeight: header?.getBoundingClientRect().height ?? 40 };
        if (["height", "width", "headerHeight"].some((key) => Math.abs(next[key as keyof typeof next] - viewport.value[key as keyof typeof next]) >= .5)) viewport.value = next;
        try { props.controller.measureMany([...rows].map(([key, node]) => ({ key, height: node.getBoundingClientRect().height })).filter((entry) => entry.height >= 1)); } catch (error) { notice.value = { text: labels.value.error(error), error: true }; }
      };
      const schedule = () => { if (animation === undefined) animation = requestAnimationFrame(measure); };
      const finish = () => interaction?.pointerEnd();
      onMounted(() => {
        mounted = true;
        watch(() => props.controller, (controller) => { stop(); interaction?.dispose(); composingToken.value = undefined; state.value = controller.getState(); interaction = createLayoutInteractions(controller, { reveal, getLabels: () => labels.value, report: (text, error = false) => { notice.value = text ? { text, error } : undefined; }, writeClipboard, readClipboard });
          stop = controller.subscribe(() => { const previousToken = state.value.editing?.token; state.value = controller.getState(); if (state.value.editing && state.value.editing.token !== previousToken) reveal(state.value.editing.coordinate, controller.getScrollOffset(state.value.editing.coordinate.rowId)); });
          if (state.value.editing) reveal(state.value.editing.coordinate, controller.getScrollOffset(state.value.editing.coordinate.rowId));
        }, { immediate: true });
        if (typeof ResizeObserver !== "undefined") { observer = new ResizeObserver(schedule); if (host) observer.observe(host); if (header) observer.observe(header); for (const row of rows.values()) observer.observe(row); }
        window.addEventListener("resize", schedule); window.addEventListener("pointerup", finish); window.addEventListener("pointercancel", finish); schedule();
      });
      onBeforeUnmount(() => { mounted = false; stop(); interaction?.dispose(); observer?.disconnect(); if (animation !== undefined) cancelAnimationFrame(animation); rows.clear(); window.removeEventListener("resize", schedule); window.removeEventListener("pointerup", finish); window.removeEventListener("pointercancel", finish); });
      return () => {
        const controller = props.controller, snapshot = state.value, visible = view.value.value, text = labels.value, prefix = props.idPrefix, selected = snapshot.focusedCell?.rowId;
        const target = visible ? getLayoutFocusTarget(controller, visible, snapshot.focusedCell) : { coordinate: null, mounted: false }, tabCell = target.coordinate, focusedMounted = target.mounted;
        const pinned = selected ? [...snapshot.topPins, ...snapshot.bottomPins].includes(selected) : false, canReorder = controller.getCanReorder() && !pinned && !snapshot.editing;
        const run = (action: () => unknown) => interaction?.run(action), button = (label: string, action: () => unknown, disabled = false) => h("button", { type: "button", disabled, onClick: () => run(action) }, label);
        const hooks = (item: LayoutRenderItem<TData>) => ({ onVnodeMounted: (vnode: VNode) => { if (vnode.el instanceof HTMLTableRowElement) register(item.key, vnode.el); }, onVnodeUpdated: (vnode: VNode) => { if (vnode.el instanceof HTMLTableRowElement) register(item.key, vnode.el); }, onVnodeBeforeUnmount: (vnode: VNode) => { if (vnode.el instanceof HTMLTableRowElement) unregister(item.key, vnode.el); } });
        const row = (item: LayoutRenderItem<TData>): VNodeChild => {
          if (!visible) return null;
          const offset = getLayoutRowOffset(visible, item), style = `${item.kind === "row" ? `height:${item.estimatedHeight}px;` : ""}${item.position !== "center" ? `position:sticky;z-index:20;${item.position === "top" ? `top:${viewport.value.headerHeight + offset}px;` : `bottom:${offset}px;`}` : ""}`;
          if (item.kind === "detail") return h("tr", { key: item.key, ...hooks(item), role: "row", "aria-rowindex": item.rowIndex + 2, "data-layout-position": item.position, style }, [h("td", { role: "gridcell", colspan: Math.max(1, visible.columns.length), "aria-colspan": visible.columns.length, "aria-colindex": 1, "data-layout-detail": "true" }, [h("div", { class: "rowick-layout__detail", dir: visible.direction, "aria-label": text.detail(item.row.id) }, props.renderDetail?.({ controller, row: item.row, rowIndex: item.rowIndex, position: item.position }) ?? controller.getDetailText(item.row.id))])]);
          const pinnedRow = [...snapshot.topPins, ...snapshot.bottomPins].includes(item.row.id);
          return h("tr", { key: item.key, ...hooks(item), role: "row", "aria-rowindex": item.rowIndex + 2, "data-row-id": item.row.id, "data-layout-position": item.position, style,
            onDragover: (event: DragEvent) => { if (interaction?.getIsDragging()) { event.preventDefault(); if (event.dataTransfer) event.dataTransfer.dropEffect = "move"; } },
            onDrop: (event: DragEvent) => { if (!interaction?.getIsDragging()) return; event.preventDefault(); const bounds = (event.currentTarget as HTMLElement).getBoundingClientRect(); interaction.drop(item.row.id, event.clientY > bounds.top + bounds.height / 2 ? "after" : "before"); },
          }, visible.columns.flatMap((column, index) => {
            const span = controller.getCellSpan(item.row.id, column.id); if (span?.covered) return [];
            const coordinate = { rowId: item.row.id, columnId: column.id }, editing = snapshot.editing?.coordinate.rowId === item.row.id && snapshot.editing.coordinate.columnId === column.id ? snapshot.editing : null, editable = controller.getCanEdit(item.row.id, column.id), context = getLayoutCellContext(controller, item, column, index), label = typeof column.columnDef.header === "string" ? column.columnDef.header : column.id;
            return [h("td", { key: column.id, id: getLayoutCellId(prefix, coordinate), role: "gridcell", "aria-colindex": index + 1, "aria-selected": controller.getIsCellSelected(item.row.id, column.id), "aria-readonly": !editable, "aria-describedby": !editable ? `${prefix}-readonly` : undefined,
              rowspan: span?.rowSpan ?? 1, colspan: span?.columnSpan ?? 1, "aria-rowspan": span?.rowSpan, "aria-colspan": span?.columnSpan, "data-column-id": column.id, "data-layout-cell": "true", "data-layout-pinned": column.getIsPinned() || undefined,
              tabindex: tabCell?.rowId === item.row.id && tabCell.columnId === column.id ? 0 : -1, style: getLayoutCellStyleText(getLayoutCellStyle(visible, index, span?.columnSpan ?? 1)), dir: visible.direction,
              onFocus: (event: FocusEvent) => { const focused = controller.getState().focusedCell; if (event.target === event.currentTarget && (focused?.rowId !== item.row.id || focused.columnId !== column.id)) interaction?.focus(coordinate); },
              onPointerdown: (event: PointerEvent) => interaction?.pointerStart(coordinate, event), onPointerenter: (event: PointerEvent) => interaction?.pointerEnter(coordinate, event.buttons), onDblclick: (event: MouseEvent) => { if (!getIsLayoutInteractiveTarget(event.target)) interaction?.startEdit(coordinate); },
            }, [index === 0 && h("button", { type: "button", tabindex: -1, class: "rowick-layout__drag", "aria-label": text.drag(item.row.id), disabled: !controller.getCanReorder() || pinnedRow || Boolean(snapshot.editing), draggable: controller.getCanReorder() && !pinnedRow && !snapshot.editing,
              onDragstart: (event: DragEvent) => { if (!interaction?.dragStart(item.row.id, event.dataTransfer)) event.preventDefault(); }, onDragend: () => interaction?.dragEnd() }, "↕"),
            editing ? [h("input", { id: `${prefix}-editor-${editing.token}`, "aria-label": text.edit(label), class: "rowick-layout__editor", value: editing.value, "aria-invalid": Boolean(editing.error), "aria-describedby": editing.error ? `${prefix}-edit-error` : undefined,
              onInput: (event: Event) => interaction?.setEditInput(editing.token, (event.target as HTMLInputElement).value),
              onCompositionstart: () => { if (controller.getState().editing?.token === editing.token) { interaction?.setComposing(editing.token, true); composingToken.value = editing.token; } },
              onCompositionend: (event: CompositionEvent) => { if (controller.getState().editing?.token === editing.token) { interaction?.setEditInput(editing.token, (event.target as HTMLInputElement).value); interaction?.setComposing(editing.token, false); composingToken.value = undefined; } },
              onKeydown: (event: KeyboardEvent) => interaction?.editorKey(event, editing.token) }), editing.error && h("p", { id: `${prefix}-edit-error`, role: "alert" }, editing.error)] : props.renderCell?.(context) ?? String(context.value ?? ""),
            ])];
          }));
        };
        const spacer = (size: number) => size > 0 ? h("tr", { role: "presentation", "aria-hidden": "true", class: "rowick-layout__spacer" }, [h("td", { role: "presentation", colspan: Math.max(1, visible?.columns.length ?? 1), style: `height:${size}px;padding:0;border:0;` })]) : null;
        return h("section", { class: "rowick-layout", dir: visible?.direction ?? "ltr", "aria-label": text.panel, style: { "--rowick-layout-viewport-width": `${viewport.value.width}px` } }, [
          h("p", { id: `${prefix}-help` }, text.instructions), h("p", { id: `${prefix}-readonly` }, text.readOnly),
          h("div", { role: "group", "aria-label": text.panel, class: "rowick-layout__toolbar" }, [
            button(text.editSelected, () => interaction?.startEdit(snapshot.focusedCell!), !visible || !snapshot.focusedCell || Boolean(snapshot.editing) || !controller.getCanEdit(snapshot.focusedCell.rowId, snapshot.focusedCell.columnId)),
            snapshot.editing && button(text.commitEdit, () => interaction?.editorKey({ key: "Enter", preventDefault() {}, stopPropagation() {} }, snapshot.editing!.token), composingToken.value === snapshot.editing.token),
            snapshot.editing && button(text.cancelEdit, () => interaction?.editorKey({ key: "Escape", preventDefault() {}, stopPropagation() {} }, snapshot.editing!.token), composingToken.value === snapshot.editing.token),
            button(text.pinTop, () => controller.pin(selected!, "top"), !selected), button(text.pinBottom, () => controller.pin(selected!, "bottom"), !selected), button(text.unpin, () => controller.pin(selected!, false), !selected || !pinned), button(text.details, () => controller.toggleDetail(selected!), !selected),
            button(text.moveUp, () => controller.moveRow(selected!, -1), !selected || !canReorder), button(text.moveDown, () => controller.moveRow(selected!, 1), !selected || !canReorder), button(text.clearMerges, () => controller.setSpans([])), button(text.unpinAll, controller.clearPins), button(text.collapseDetails, controller.collapseDetails), button(text.clearRanges, controller.clearRanges), button(text.undo, controller.undo, !snapshot.canUndo), button(text.redo, controller.redo, !snapshot.canRedo),
            button(text.copy, () => { void interaction?.copyClipboard(); }, !snapshot.ranges.length || Boolean(snapshot.editing)), button(text.cut, () => { void interaction?.copyClipboard(true); }, !snapshot.ranges.length || Boolean(snapshot.editing)), button(text.paste, () => { void interaction?.pasteClipboard(); }, !snapshot.ranges.length || Boolean(snapshot.editing)),
            h("label", { for: `${prefix}-fill` }, text.fillValue), h("input", { id: `${prefix}-fill`, value: fill.value, onInput: (event: Event) => { fill.value = (event.target as HTMLInputElement).value; } }), button(text.fill, () => controller.fill(fill.value), !snapshot.ranges.length || Boolean(snapshot.editing)),
          ]), h("p", selected ? text.selected(selected) : "\u00a0"), h("p", text.reorderUnavailable), h("p", { role: "status" }, visible && text.counts(visible.recordCount, visible.rowCount)),
          (notice.value?.text ?? snapshot.message) && h("p", { role: notice.value?.error ? "alert" : "status" }, notice.value?.text ?? snapshot.message), view.value.error && h("p", { role: "alert" }, `${text.unavailable} ${view.value.error}`),
          h("div", { ref: (element) => { host = element as HTMLDivElement | null; }, class: "rowick-layout__viewport", style: { height: `${props.height}px` }, onScroll: (event: Event) => { const scrollTop = (event.target as HTMLElement).scrollTop; if (scrollTop !== viewport.value.scrollTop) viewport.value = { ...viewport.value, scrollTop }; } }, [visible && visible.columns.length > 0 && h("table", { role: "grid", "aria-label": text.grid(controller.grid.getState().pagination.pageIndex + 1), "aria-describedby": `${prefix}-help`, "aria-rowcount": visible.rowCount + 1, "aria-colcount": visible.columns.length, "aria-multiselectable": "true", dir: "ltr", tabindex: focusedMounted ? undefined : 0,
            style: { width: `${visible.columns.reduce((total, column) => total + column.getSize(), 0)}px` }, onFocus: (event: FocusEvent) => { if (event.target === event.currentTarget && tabCell) reveal(tabCell, controller.getScrollOffset(tabCell.rowId)); }, onKeydown: (event: KeyboardEvent) => interaction?.key(event), onCopy: (event: ClipboardEvent) => interaction?.copy(event), onCut: (event: ClipboardEvent) => interaction?.copy(event, true), onPaste: (event: ClipboardEvent) => interaction?.paste(event),
          }, [h("colgroup", visible.columns.map((column) => h("col", { key: column.id, style: { width: `${column.getSize()}px` } }))), h("thead", { ref: (element) => { header = element as HTMLTableSectionElement | null; } }, [h("tr", { role: "row", "aria-rowindex": 1 }, visible.columns.map((column, index) => h("th", { key: column.id, role: "columnheader", scope: "col", "aria-colindex": index + 1, dir: visible.direction, style: getLayoutCellStyleText(getLayoutCellStyle(visible, index)) + `position:sticky;top:0;z-index:${column.getIsPinned() ? 44 : 40};` }, typeof column.columnDef.header === "string" ? column.columnDef.header : column.id)))]), h("tbody", visible.top.map(row)), h("tbody", [spacer(visible.beforeHeight), ...visible.center.map(row), spacer(visible.afterHeight)]), h("tbody", visible.bottom.map(row))]), visible && !visible.columns.length && h("p", text.noColumns), visible && !visible.rowCount && h("p", text.empty)]),
        ]);
      };
    },
  }) as unknown as DefineComponent<LayoutGridProps<TData>>;
}
export const LayoutGrid = createLayoutGrid<unknown>();
