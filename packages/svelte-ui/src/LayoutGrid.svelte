<script lang="ts">
  import { onMount } from "svelte";
  import RenderValue from "./RenderValue.svelte";
  import { createLayoutInteractions, defaultLayoutGridLabels, getIsLayoutInteractiveTarget, getLayoutCellContext, getLayoutCellId, getLayoutCellStyle, getLayoutCellStyleText, getLayoutFocusTarget, getLayoutRowOffset, LAYOUT_CLIPBOARD_MIME,
    type GridLayoutController, type GridLayoutState, type GridLayoutView, type LayoutCellContext, type LayoutClipboardContent, type LayoutDetailContext, type LayoutGridLabels, type LayoutInteractions, type LayoutRenderItem } from "@rowick/data/layout";
  import type { CellCoordinate, Column } from "@rowick/core";
  export let controller: GridLayoutController<unknown>;
  export let idPrefix: string;
  export let height = 440;
  export let labels: Partial<LayoutGridLabels> = {};
  export let renderCell: ((context: LayoutCellContext<unknown>) => unknown) | undefined = undefined;
  export let renderDetail: ((context: LayoutDetailContext<unknown>) => unknown) | undefined = undefined;
  let state = controller.getState(), viewport = { scrollTop: 0, height, width: 800, headerHeight: 40 }, notice: { text: string; error: boolean } | undefined, fill = "";
  let host: HTMLDivElement | undefined, header: HTMLTableSectionElement | undefined, mounted = false, stop = () => {}, subscribed: GridLayoutController<unknown> | undefined;
  let observer: ResizeObserver | undefined, animation: number | undefined, interaction: LayoutInteractions | undefined, composingToken: number | undefined;
  const rows = new Map<string, HTMLTableRowElement>();
  $: text = { ...defaultLayoutGridLabels, ...labels };
  function readView(owner: GridLayoutController<unknown>, range: typeof viewport, _revision: number) {
    try { return { view: owner.getView({ scrollTop: range.scrollTop, height: Math.max(1, range.height - range.headerHeight), overscan: 3 }), error: undefined }; }
    catch (error) { return { view: undefined, error: text.error(error) }; }
  }
  $: result = readView(controller, viewport, state.revision);
  $: view = result.view;
  $: pageNumber = (state.revision, controller.grid.getState().pagination.pageIndex + 1);
  // Svelte cannot observe mutations hidden behind a stable controller or Column.
  // Every render snapshot explicitly depends on the controller publication revision.
  function readCell(owner: GridLayoutController<unknown>, item: LayoutRenderItem<unknown>, column: Column<unknown, unknown>, index: number, _revision: number) {
    return { span: owner.getCellSpan(item.row.id, column.id), editable: owner.getCanEdit(item.row.id, column.id), selected: owner.getIsCellSelected(item.row.id, column.id), pinned: column.getIsPinned(), label: typeof column.columnDef.header === "string" ? column.columnDef.header : column.id, context: getLayoutCellContext(owner, item, column, index) };
  }
  function readHeader(column: Column<unknown, unknown>, _revision: number) {
    return { size: column.getSize(), pinned: column.getIsPinned(), label: typeof column.columnDef.header === "string" ? column.columnDef.header : column.id };
  }
  function readDetail(owner: GridLayoutController<unknown>, item: LayoutRenderItem<unknown>, _revision: number) {
    return { controller: owner, row: item.row, rowIndex: item.rowIndex, position: item.position };
  }
  function readDetailText(owner: GridLayoutController<unknown>, rowId: string, _revision: number) { return owner.getDetailText(rowId); }
  $: target = view ? getLayoutFocusTarget(controller, view, state.focusedCell) : { coordinate: null, mounted: false };
  $: selected = state.focusedCell?.rowId;
  $: pinned = selected ? [...state.topPins, ...state.bottomPins].includes(selected) : false;
  $: canReorder = (state.revision, controller.getCanReorder() && !pinned && !state.editing);
  type RenderEntry = LayoutRenderItem<unknown> | { kind: "spacer"; key: string; height: number };
  $: items = view ? [...view.top, ...(view.beforeHeight > 0 ? [{ kind: "spacer" as const, key: "before", height: view.beforeHeight }] : []), ...view.center, ...(view.afterHeight > 0 ? [{ kind: "spacer" as const, key: "after", height: view.afterHeight }] : []), ...view.bottom] as RenderEntry[] : [];
  function run(operation: () => unknown) { interaction?.run(operation); }
  function reveal(coordinate: CellCoordinate, offset?: number | null) {
    const element = host, owner = controller, expected = owner.getState().editing?.token, prefix = idPrefix; if (!element || !mounted) return;
    const initialFocus = document.activeElement;
    if (offset !== undefined && offset !== null) element.scrollTop = Math.max(0, offset);
    viewport = { ...viewport, scrollTop: element.scrollTop };
    requestAnimationFrame(() => {
      if (!mounted || controller !== owner) return; const current = owner.getState(), editing = current.editing;
      if (editing?.token !== expected || (editing ? editing.coordinate.rowId !== coordinate.rowId || editing.coordinate.columnId !== coordinate.columnId : current.focusedCell?.rowId !== coordinate.rowId || current.focusedCell.columnId !== coordinate.columnId)) return;
      const id = editing ? `${prefix}-editor-${editing.token}` : getLayoutCellId(prefix, coordinate), node = document.getElementById(id); if (!node || !element.contains(node)) return;
      const currentFocus = document.activeElement;
      if (currentFocus !== initialFocus && currentFocus !== node && getIsLayoutInteractiveTarget(currentFocus)) return;
      node.focus({ preventScroll: true }); const rectangle = node.getBoundingClientRect(), bounds = element.getBoundingClientRect(); if (rectangle.left < bounds.left) element.scrollLeft -= bounds.left - rectangle.left; else if (rectangle.right > bounds.right) element.scrollLeft += rectangle.right - bounds.right;
    });
  }
  async function writeClipboard(content: LayoutClipboardContent) {
    if (!navigator.clipboard?.write || typeof ClipboardItem === "undefined") throw new Error("Rich clipboard access is unavailable. Use the native Copy or Cut shortcut.");
    await navigator.clipboard.write([new ClipboardItem({ "text/plain": new Blob([content.text], { type: "text/plain" }), "text/html": new Blob([content.html], { type: "text/html" }) })]);
  }
  async function readClipboard() {
    if (!navigator.clipboard) throw new Error("Clipboard access is unavailable. Use the native Paste shortcut.");
    if (!navigator.clipboard.read) return { text: await navigator.clipboard.readText() };
    const clipboardItems = await navigator.clipboard.read(); let plain = "", html: string | undefined, payload: string | undefined;
    const item = clipboardItems.find((item) => item.types.includes("text/plain") || item.types.includes("text/html"));
    if (item) for (const type of ["text/plain", "text/html", LAYOUT_CLIPBOARD_MIME]) if (item.types.includes(type)) { const blob = await item.getType(type); if (blob.size > 4_000_000) throw new RangeError("Clipboard item is too large"); const value = await blob.text(); if (type === "text/plain") plain = value; else if (type === "text/html") html = value; else payload = value; }
    return { text: plain, ...(html !== undefined ? { html } : {}), ...(payload !== undefined ? { payload } : {}) };
  }
  function subscribe(owner: GridLayoutController<unknown>) {
    stop(); interaction?.dispose(); subscribed = owner; composingToken = undefined; state = owner.getState();
    interaction = createLayoutInteractions(owner, { reveal, report: (value, error = false) => { notice = value ? { text: value, error } : undefined; }, getLabels: () => text, writeClipboard, readClipboard });
    stop = owner.subscribe(() => { const previous = state.editing?.token; state = owner.getState(); if (state.editing && state.editing.token !== previous) reveal(state.editing.coordinate, owner.getScrollOffset(state.editing.coordinate.rowId)); });
    if (state.editing) reveal(state.editing.coordinate, owner.getScrollOffset(state.editing.coordinate.rowId));
  }
  $: if (mounted && subscribed !== controller) subscribe(controller);
  function measure() {
    animation = undefined; if (!mounted || !host) return;
    const next = { ...viewport, height: host.clientHeight, width: host.clientWidth, headerHeight: header?.getBoundingClientRect().height ?? 40 };
    if (["height", "width", "headerHeight"].some((key) => Math.abs(next[key as keyof typeof next] - viewport[key as keyof typeof next]) >= .5)) viewport = next;
    try { controller.measureMany([...rows].map(([key, node]) => ({ key, height: node.getBoundingClientRect().height })).filter((entry) => entry.height >= 1)); } catch (error) { notice = { text: text.error(error), error: true }; }
  }
  function schedule() { if (animation === undefined) animation = requestAnimationFrame(measure); }
  function measureRow(node: HTMLTableRowElement, key: string) {
    let current = key;
    const attach = () => { const previous = rows.get(current); if (previous && previous !== node) observer?.unobserve(previous); rows.set(current, node); observer?.observe(node); };
    const remove = () => { if (rows.get(current) === node) { observer?.unobserve(node); rows.delete(current); } }; attach();
    return { update(next: string) { if (current !== next) { remove(); current = next; attach(); } }, destroy: remove };
  }
  onMount(() => {
    mounted = true;
    if (typeof ResizeObserver !== "undefined") { observer = new ResizeObserver(schedule); if (host) observer.observe(host); if (header) observer.observe(header); for (const row of rows.values()) observer.observe(row); }
    const finish = () => interaction?.pointerEnd(); window.addEventListener("resize", schedule); window.addEventListener("pointerup", finish); window.addEventListener("pointercancel", finish); schedule();
    return () => { mounted = false; stop(); interaction?.dispose(); observer?.disconnect(); if (animation !== undefined) cancelAnimationFrame(animation); rows.clear(); window.removeEventListener("resize", schedule); window.removeEventListener("pointerup", finish); window.removeEventListener("pointercancel", finish); };
  });
  function rowStyle(item: LayoutRenderItem<unknown>, current: GridLayoutView<unknown>) { const offset = getLayoutRowOffset(current, item); return `${item.kind === "row" ? `height:${item.estimatedHeight}px;` : ""}${item.position !== "center" ? `position:sticky;z-index:20;${item.position === "top" ? `top:${viewport.headerHeight + offset}px;` : `bottom:${offset}px;`}` : ""}`; }
  function focusCell(event: FocusEvent, coordinate: CellCoordinate) { const focused = controller.getState().focusedCell; if (event.target === event.currentTarget && (focused?.rowId !== coordinate.rowId || focused.columnId !== coordinate.columnId)) interaction?.focus(coordinate); }
  function dragStart(event: DragEvent, rowId: string) { if (!interaction?.dragStart(rowId, event.dataTransfer)) event.preventDefault(); }
  function dragOver(event: DragEvent) { if (interaction?.getIsDragging()) { event.preventDefault(); if (event.dataTransfer) event.dataTransfer.dropEffect = "move"; } }
  function drop(event: DragEvent, rowId: string) { if (!interaction?.getIsDragging()) return; event.preventDefault(); const bounds = (event.currentTarget as HTMLElement).getBoundingClientRect(); interaction.drop(rowId, event.clientY > bounds.top + bounds.height / 2 ? "after" : "before"); }
  function composing(token: number, value: boolean, event?: CompositionEvent) { if (controller.getState().editing?.token !== token) return; if (event) interaction?.setEditInput(token, (event.target as HTMLInputElement).value); interaction?.setComposing(token, value); composingToken = value ? token : undefined; }
  function setInput(event: Event, token: number) { interaction?.setEditInput(token, (event.target as HTMLInputElement).value); }
  function editAction(key: "Enter" | "Escape") { if (state.editing) interaction?.editorKey({ key, preventDefault() {}, stopPropagation() {} }, state.editing.token); }
  function editSelected() { if (state.focusedCell) interaction?.startEdit(state.focusedCell); }
  function pinSelected(position: "top" | "bottom" | false) { if (selected) controller.pin(selected, position); }
  function moveSelected(direction: -1 | 1) { if (selected) controller.moveRow(selected, direction); }
  function toggleSelectedDetail() { if (selected) controller.toggleDetail(selected); }
  function tableFocus(event: FocusEvent) { if (event.target === event.currentTarget && target.coordinate) reveal(target.coordinate, controller.getScrollOffset(target.coordinate.rowId)); }
</script>

<section class="rowick-layout" dir={view?.direction ?? "ltr"} aria-label={text.panel} style={`--rowick-layout-viewport-width:${viewport.width}px;`}>
  <p id={`${idPrefix}-help`}>{text.instructions}</p><p id={`${idPrefix}-readonly`}>{text.readOnly}</p>
  <div role="group" aria-label={text.panel} class="rowick-layout__toolbar">
    <button type="button" disabled={!view || !state.focusedCell || Boolean(state.editing) || !controller.getCanEdit(state.focusedCell.rowId, state.focusedCell.columnId)} on:click={() => run(editSelected)}>{text.editSelected}</button>
    {#if state.editing}<button type="button" disabled={composingToken === state.editing.token} on:click={() => run(() => editAction("Enter"))}>{text.commitEdit}</button><button type="button" disabled={composingToken === state.editing.token} on:click={() => run(() => editAction("Escape"))}>{text.cancelEdit}</button>{/if}
    <button type="button" disabled={!selected} on:click={() => run(() => pinSelected("top"))}>{text.pinTop}</button><button type="button" disabled={!selected} on:click={() => run(() => pinSelected("bottom"))}>{text.pinBottom}</button><button type="button" disabled={!selected || !pinned} on:click={() => run(() => pinSelected(false))}>{text.unpin}</button><button type="button" disabled={!selected} on:click={() => run(toggleSelectedDetail)}>{text.details}</button>
    <button type="button" disabled={!selected || !canReorder} on:click={() => run(() => moveSelected(-1))}>{text.moveUp}</button><button type="button" disabled={!selected || !canReorder} on:click={() => run(() => moveSelected(1))}>{text.moveDown}</button>
    <button type="button" on:click={() => run(() => controller.setSpans([]))}>{text.clearMerges}</button><button type="button" on:click={() => run(controller.clearPins)}>{text.unpinAll}</button><button type="button" on:click={() => run(controller.collapseDetails)}>{text.collapseDetails}</button><button type="button" on:click={() => run(controller.clearRanges)}>{text.clearRanges}</button>
    <button type="button" disabled={!state.canUndo} on:click={() => run(controller.undo)}>{text.undo}</button><button type="button" disabled={!state.canRedo} on:click={() => run(controller.redo)}>{text.redo}</button>
    <button type="button" disabled={!state.ranges.length || Boolean(state.editing)} on:click={() => { void interaction?.copyClipboard(); }}>{text.copy}</button><button type="button" disabled={!state.ranges.length || Boolean(state.editing)} on:click={() => { void interaction?.copyClipboard(true); }}>{text.cut}</button><button type="button" disabled={!state.ranges.length || Boolean(state.editing)} on:click={() => { void interaction?.pasteClipboard(); }}>{text.paste}</button>
    <label for={`${idPrefix}-fill`}>{text.fillValue}</label><input id={`${idPrefix}-fill`} bind:value={fill} /><button type="button" disabled={!state.ranges.length || Boolean(state.editing)} on:click={() => run(() => controller.fill(fill))}>{text.fill}</button>
  </div>
  <p>{selected ? text.selected(selected) : "\u00a0"}</p><p>{text.reorderUnavailable}</p>
  <p role="status">{view ? text.counts(view.recordCount, view.rowCount) : ""}</p>
  {#if notice?.text ?? state.message}<p role={notice?.error ? "alert" : "status"}>{notice?.text ?? state.message}</p>{/if}
  {#if result.error}<p role="alert">{text.unavailable} {result.error}</p>{/if}
  <div bind:this={host} class="rowick-layout__viewport" style={`height:${height}px;`} on:scroll={() => { if (host && host.scrollTop !== viewport.scrollTop) viewport = { ...viewport, scrollTop: host.scrollTop }; }}>
    {#if view && view.columns.length}
      <table role="grid" aria-label={text.grid(pageNumber)} aria-describedby={`${idPrefix}-help`} aria-rowcount={view.rowCount + 1} aria-colcount={view.columns.length} aria-multiselectable="true" dir="ltr" tabindex={target.mounted ? undefined : 0}
        style={`width:${view.columns.reduce((total, column) => total + column.getSize(), 0)}px;`} on:focus={tableFocus} on:keydown={(event) => interaction?.key(event)} on:copy={(event) => interaction?.copy(event)} on:cut={(event) => interaction?.copy(event, true)} on:paste={(event) => interaction?.paste(event)}>
        <colgroup>{#each view.columns as column (column.id)}<col style={`width:${readHeader(column, state.revision).size}px;`} />{/each}</colgroup>
        <thead bind:this={header}><tr aria-rowindex={1}>{#each view.columns as column, index (column.id)}{@const heading = readHeader(column, state.revision)}<th role="columnheader" scope="col" aria-colindex={index + 1} dir={view.direction} style={getLayoutCellStyleText(getLayoutCellStyle(view, index)) + `position:sticky;top:0;z-index:${heading.pinned ? 44 : 40};`}>{heading.label}</th>{/each}</tr></thead>
        <tbody>
          {#each items as entry (entry.key)}
            {#if entry.kind === "spacer"}<tr aria-hidden="true" class="rowick-layout__spacer"><td colspan={Math.max(1, view.columns.length)} style={`height:${entry.height}px;padding:0;border:0;`}></td></tr>
            {:else}
              {@const item = entry}
              <tr use:measureRow={item.key} aria-rowindex={item.rowIndex + 2} data-row-id={item.kind === "row" ? item.row.id : undefined} data-layout-position={item.position} style={rowStyle(item, view)} on:dragover={dragOver} on:drop={(event) => { if (item.kind === "row") drop(event, item.row.id); }}>
                {#if item.kind === "detail"}
                  {@const detail = readDetail(controller, item, state.revision)}
                  <td role="gridcell" colspan={Math.max(1, view.columns.length)} aria-colindex={1} aria-colspan={view.columns.length} data-layout-detail="true"><div class="rowick-layout__detail" dir={view.direction} aria-label={text.detail(item.row.id)}>
                    <slot name="detail" context={detail}><RenderValue value={renderDetail?.(detail) ?? readDetailText(controller, item.row.id, state.revision)} /></slot>
                  </div></td>
                {:else}
                  {#each view.columns as column, index (column.id)}
                    {@const cell = readCell(controller, item, column, index, state.revision)}
                    {@const span = cell.span}
                    {#if !span?.covered}
                      {@const coordinate = { rowId: item.row.id, columnId: column.id }}
                      {@const editing = state.editing?.coordinate.rowId === item.row.id && state.editing.coordinate.columnId === column.id ? state.editing : null}
                      {@const editable = cell.editable}
                      {@const context = cell.context}
                      {@const label = cell.label}
                      <td id={getLayoutCellId(idPrefix, coordinate)} role="gridcell" aria-colindex={index + 1} aria-selected={cell.selected} aria-readonly={!editable} aria-describedby={!editable ? `${idPrefix}-readonly` : undefined} rowspan={span?.rowSpan ?? 1} colspan={span?.columnSpan ?? 1} aria-rowspan={span?.rowSpan} aria-colspan={span?.columnSpan}
                        data-column-id={column.id} data-layout-cell="true" data-layout-pinned={cell.pinned || undefined} tabindex={target.coordinate?.rowId === item.row.id && target.coordinate.columnId === column.id ? 0 : -1} style={getLayoutCellStyleText(getLayoutCellStyle(view, index, span?.columnSpan ?? 1))} dir={view.direction}
                        on:focus={(event) => focusCell(event, coordinate)} on:keydown={(event) => interaction?.key(event)} on:pointerdown={(event) => interaction?.pointerStart(coordinate, event)} on:pointerenter={(event) => interaction?.pointerEnter(coordinate, event.buttons)} on:dblclick={(event) => { if (!getIsLayoutInteractiveTarget(event.target)) interaction?.startEdit(coordinate); }}>
                        {#if index === 0}<button type="button" tabindex={-1} class="rowick-layout__drag" aria-label={text.drag(item.row.id)} disabled={!controller.getCanReorder() || [...state.topPins, ...state.bottomPins].includes(item.row.id) || Boolean(state.editing)} draggable={controller.getCanReorder() && ![...state.topPins, ...state.bottomPins].includes(item.row.id) && !state.editing} on:dragstart={(event) => dragStart(event, item.row.id)} on:dragend={() => interaction?.dragEnd()}>↕</button>{/if}
                        {#if editing}<input id={`${idPrefix}-editor-${editing.token}`} aria-label={text.edit(label)} class="rowick-layout__editor" value={editing.value} aria-invalid={Boolean(editing.error)} aria-describedby={editing.error ? `${idPrefix}-edit-error` : undefined} on:input={(event) => setInput(event, editing.token)} on:compositionstart={() => composing(editing.token, true)} on:compositionend={(event) => composing(editing.token, false, event)} on:keydown={(event) => interaction?.editorKey(event, editing.token)} />{#if editing.error}<p id={`${idPrefix}-edit-error`} role="alert">{editing.error}</p>{/if}
                        {:else}<slot name="cell" {context}><RenderValue value={renderCell ? renderCell(context) : String(context.value ?? "")} /></slot>{/if}
                      </td>
                    {/if}
                  {/each}
                {/if}
              </tr>
            {/if}
          {/each}
        </tbody>
      </table>
      {#if !view.rowCount}<p>{text.empty}</p>{/if}
    {:else if view}<p>{text.noColumns}</p>{/if}
  </div>
</section>
