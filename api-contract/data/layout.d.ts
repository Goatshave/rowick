import { CellCoordinate, Grid, CellRange, Row, Column, ColumnLayout, FocusDirection, CellContext } from '@rowick/core';
import { c as RowEditingController } from './row-editing-Br6I_8ib.js';

interface LayoutCellSpan {
    readonly rowIds: readonly string[];
    readonly columnIds: readonly string[];
}
interface ResolvedLayoutSpan {
    readonly anchor: CellCoordinate;
    readonly rowIds: readonly string[];
    readonly columnIds: readonly string[];
    readonly rowSpan: number;
    readonly columnSpan: number;
    readonly startRow: number;
    readonly endRow: number;
}

interface GridLayoutOptions<TData> {
    readonly direction?: "ltr" | "rtl";
    readonly editing?: RowEditingController<TData>;
    readonly spans?: readonly LayoutCellSpan[];
    readonly getRowHeight?: (row: Row<TData>) => number;
    readonly getDetailText?: (row: Row<TData>) => string;
    readonly estimatedDetailHeight?: number;
    readonly maxPinnedRows?: number;
    readonly maxRenderedItems?: number;
    readonly maxClipboardCells?: number;
    readonly initialTopPins?: readonly string[];
    readonly initialBottomPins?: readonly string[];
    /** A local immutable reorder proposal; the owner accepts it synchronously. */
    readonly acceptReorder?: (data: readonly TData[]) => void;
}
interface LayoutEditSession {
    readonly coordinate: CellCoordinate;
    readonly token: number;
    readonly value: string;
    readonly error: string | undefined;
}
interface GridLayoutState {
    readonly revision: number;
    readonly operationRevision: number;
    readonly draftRevision: number;
    readonly topPins: readonly string[];
    readonly bottomPins: readonly string[];
    readonly detailIds: readonly string[];
    readonly ranges: readonly CellRange[];
    readonly focusedCell: CellCoordinate | null;
    readonly editing: LayoutEditSession | null;
    readonly canUndo: boolean;
    readonly canRedo: boolean;
    readonly message: string | undefined;
}
interface LayoutRenderItem<TData> {
    readonly key: string;
    readonly kind: "row" | "detail";
    readonly row: Row<TData>;
    readonly rowIndex: number;
    readonly sourceRowIndex: number;
    readonly height: number;
    readonly estimatedHeight: number;
    readonly position: "top" | "center" | "bottom";
}
interface GridLayoutView<TData> {
    readonly direction: "ltr" | "rtl";
    readonly top: readonly LayoutRenderItem<TData>[];
    readonly center: readonly LayoutRenderItem<TData>[];
    readonly bottom: readonly LayoutRenderItem<TData>[];
    readonly columns: readonly Column<TData, unknown>[];
    readonly columnLayout: readonly ColumnLayout[];
    readonly beforeHeight: number;
    readonly afterHeight: number;
    readonly totalHeight: number;
    readonly rowCount: number;
    readonly recordCount: number;
}
interface LayoutClipboardResult {
    readonly attempted: number;
    readonly committed: number;
    readonly skipped: readonly {
        coordinate: CellCoordinate;
        reason: string;
    }[];
    readonly blocked: boolean;
}
interface LayoutExportSnapshot {
    readonly version: 1;
    readonly revision: number;
    readonly rowIds: readonly string[];
    readonly columnIds: readonly string[];
    readonly values: readonly (readonly unknown[])[];
    readonly spans: readonly {
        readonly start: CellCoordinate;
        readonly rowSpan: number;
        readonly columnSpan: number;
    }[];
}
interface GridLayoutController<TData> {
    readonly grid: Grid<TData>;
    getState: () => GridLayoutState;
    getView: (viewport: {
        scrollTop: number;
        height: number;
        overscan?: number;
    }) => GridLayoutView<TData>;
    getCellSpan: (rowId: string, columnId: string) => {
        anchor: CellCoordinate;
        rowSpan: number;
        columnSpan: number;
        covered: boolean;
    } | undefined;
    getCellValue: (rowId: string, columnId: string) => unknown;
    getCanEdit: (rowId: string, columnId: string) => boolean;
    getDetailText: (rowId: string) => string;
    measure: (key: string, height: number) => void;
    measureMany: (measurements: readonly {
        key: string;
        height: number;
    }[]) => void;
    pin: (rowId: string, position: "top" | "bottom" | false) => void;
    clearPins: () => void;
    toggleDetail: (rowId: string) => void;
    collapseDetails: () => void;
    setSpans: (spans: readonly LayoutCellSpan[]) => void;
    select: (start: CellCoordinate, end?: CellCoordinate, additive?: boolean) => void;
    clearRanges: () => void;
    getIsCellSelected: (rowId: string, columnId: string) => boolean;
    focus: (coordinate: CellCoordinate, extend?: boolean, additive?: boolean) => void;
    moveFocus: (direction: FocusDirection, extend?: boolean) => number | null;
    getScrollOffset: (rowId: string) => number | null;
    beginEdit: (coordinate?: CellCoordinate) => void;
    setEditInput: (value: string) => void;
    commitEdit: (token?: number) => boolean;
    cancelEdit: () => void;
    copy: () => {
        text: string;
        payload: string;
    };
    getExportSnapshot: (options?: {
        scope?: "page" | "range";
        rangeIndex?: number;
        columnIds?: readonly string[];
        maxCells?: number;
    }) => LayoutExportSnapshot;
    paste: (text: string, payload?: string) => LayoutClipboardResult;
    cut: (write: (copy: {
        text: string;
        payload: string;
    }) => unknown) => LayoutClipboardResult;
    fill: (value: string) => LayoutClipboardResult;
    undo: () => boolean;
    redo: () => boolean;
    getCanReorder: () => boolean;
    reorder: (rowId: string, targetId: string, position?: "before" | "after") => void;
    moveRow: (rowId: string, direction: -1 | 1) => void;
    reconcile: () => void;
    subscribe: (listener: () => void) => () => void;
    dispose: () => void;
}
declare function createGridLayoutController<TData>(grid: Grid<TData>, options?: GridLayoutOptions<TData>): GridLayoutController<TData>;

declare const LAYOUT_CLIPBOARD_MIME = "application/x-rowick-ranges+json";
interface LayoutClipboardBlock {
    readonly values: readonly (readonly string[])[];
}
interface LayoutClipboardPayload {
    readonly version: 1;
    readonly blocks: readonly LayoutClipboardBlock[];
}
declare function parseLayoutClipboardPayload(serialized: string): LayoutClipboardPayload;
declare function layoutClipboardText(blocks: readonly LayoutClipboardBlock[], escapeFormulas?: boolean): string;
/** Strict quoted TSV, including empty cells and embedded CR/LF. */
declare function parseLayoutClipboardText(text: string): LayoutClipboardBlock;

interface LayoutGridLabels {
    panel: string;
    grid: (page: number) => string;
    instructions: string;
    readOnly: string;
    counts: (records: number, logicalRows: number) => string;
    selected: (id: string) => string;
    pinTop: string;
    pinBottom: string;
    unpin: string;
    details: string;
    moveUp: string;
    moveDown: string;
    editSelected: string;
    commitEdit: string;
    cancelEdit: string;
    reorderUnavailable: string;
    clearMerges: string;
    unpinAll: string;
    collapseDetails: string;
    clearRanges: string;
    undo: string;
    redo: string;
    fillValue: string;
    fill: string;
    copy: string;
    cut: string;
    paste: string;
    drag: (id: string) => string;
    edit: (label: string) => string;
    detail: (id: string) => string;
    empty: string;
    noColumns: string;
    unavailable: string;
    copied: string;
    cutDone: string;
    clipboard: (result: LayoutClipboardResult) => string;
    error: (error: unknown) => string;
}
declare const defaultLayoutGridLabels: LayoutGridLabels;
interface LayoutCellContext<TData> extends CellContext<TData, unknown> {
    readonly controller: GridLayoutController<TData>;
    readonly rowIndex: number;
    readonly columnIndex: number;
    readonly position: "top" | "center" | "bottom";
    readonly rowSpan: number;
    readonly columnSpan: number;
}
interface LayoutDetailContext<TData> {
    readonly controller: GridLayoutController<TData>;
    readonly row: Row<TData>;
    readonly rowIndex: number;
    readonly position: "top" | "center" | "bottom";
}
interface LayoutCellStyle {
    width: number;
    minWidth: number;
    position?: "sticky";
    left?: number;
    right?: number;
    zIndex?: number;
}
declare function getLayoutCellId(prefix: string, coordinate: CellCoordinate): string;
declare function getLayoutCellStyle<TData>(view: GridLayoutView<TData>, columnIndex: number, columnSpan?: number): LayoutCellStyle;
declare function getLayoutCellStyleText(style: LayoutCellStyle): string;
declare function getLayoutRowOffset<TData>(view: GridLayoutView<TData>, item: LayoutRenderItem<TData>): number;
declare function getLayoutFocusTarget<TData>(controller: GridLayoutController<TData>, view: GridLayoutView<TData>, focused: CellCoordinate | null): {
    coordinate: CellCoordinate | null;
    mounted: boolean;
};
declare function getLayoutCellContext<TData>(controller: GridLayoutController<TData>, item: LayoutRenderItem<TData>, column: Column<TData, unknown>, columnIndex: number): LayoutCellContext<TData>;
interface LayoutKeyboardEventLike {
    key: string;
    ctrlKey?: boolean;
    metaKey?: boolean;
    altKey?: boolean;
    shiftKey?: boolean;
    isComposing?: boolean;
    keyCode?: number;
    nativeEvent?: {
        isComposing?: boolean;
        keyCode?: number;
    };
}
declare function getIsLayoutComposing(event: LayoutKeyboardEventLike): boolean;
declare function getLayoutNavigation(event: LayoutKeyboardEventLike): FocusDirection | null;
declare function getIsLayoutInteractiveTarget(target: unknown): boolean;
interface LayoutClipboardContent {
    readonly text: string;
    readonly payload: string;
    readonly html: string;
}
declare function createLayoutClipboardContent(copy: {
    text: string;
    payload: string;
}): LayoutClipboardContent;
declare function getLayoutHTMLPayload(html: string): string | undefined;
interface LayoutTransferLike {
    readonly types: readonly string[];
    getData: (type: string) => string;
    setData: (type: string, value: string) => void;
}
interface LayoutInteractionPorts {
    readonly reveal: (coordinate: CellCoordinate, scrollOffset?: number | null) => void;
    readonly report: (message: string | undefined, error?: boolean) => void;
    readonly getLabels?: () => LayoutGridLabels;
    /** Resolves only after the clipboard accepted plain text and HTML range metadata. */
    readonly writeClipboard: (content: LayoutClipboardContent) => Promise<void>;
    readonly readClipboard: () => Promise<{
        text: string;
        payload?: string;
        html?: string;
    }>;
}
interface LayoutInteractions {
    run: (operation: () => unknown) => boolean;
    focus: (coordinate: CellCoordinate) => void;
    startEdit: (coordinate: CellCoordinate) => void;
    setComposing: (token: number, composing: boolean) => void;
    setEditInput: (token: number, value: string) => void;
    key: (event: LayoutKeyboardEventLike & {
        defaultPrevented?: boolean;
        target?: unknown;
        preventDefault(): void;
    }) => void;
    pointerStart: (coordinate: CellCoordinate, event: {
        button: number;
        shiftKey: boolean;
        ctrlKey: boolean;
        metaKey: boolean;
        pointerType?: string;
        target?: unknown;
        preventDefault(): void;
        stopPropagation?(): void;
    }) => void;
    pointerEnter: (coordinate: CellCoordinate, buttons: number) => void;
    pointerEnd: () => void;
    editorKey: (event: LayoutKeyboardEventLike & {
        preventDefault(): void;
        stopPropagation(): void;
    }, token: number) => void;
    copy: (event: {
        target?: unknown;
        defaultPrevented?: boolean;
        clipboardData: LayoutTransferLike | null;
        preventDefault(): void;
    }, cut?: boolean) => void;
    paste: (event: {
        target?: unknown;
        defaultPrevented?: boolean;
        clipboardData: LayoutTransferLike | null;
        preventDefault(): void;
    }) => void;
    copyClipboard: (cut?: boolean) => Promise<void>;
    pasteClipboard: () => Promise<void>;
    dragStart: (rowId: string, transfer?: {
        setData(type: string, value: string): void;
        effectAllowed: string;
    } | null) => boolean;
    getIsDragging: () => boolean;
    drop: (targetId: string, position: "before" | "after") => void;
    dragEnd: () => void;
    dispose: () => void;
}
/** UI event adapter. DOM rendering, measurement and focus scheduling belong to the host. */
declare function createLayoutInteractions<TData>(controller: GridLayoutController<TData>, ports: LayoutInteractionPorts): LayoutInteractions;

export { type GridLayoutController, type GridLayoutOptions, type GridLayoutState, type GridLayoutView, LAYOUT_CLIPBOARD_MIME, type LayoutCellContext, type LayoutCellSpan, type LayoutCellStyle, type LayoutClipboardBlock, type LayoutClipboardContent, type LayoutClipboardPayload, type LayoutClipboardResult, type LayoutDetailContext, type LayoutEditSession, type LayoutExportSnapshot, type LayoutGridLabels, type LayoutInteractionPorts, type LayoutInteractions, type LayoutKeyboardEventLike, type LayoutRenderItem, type LayoutTransferLike, type ResolvedLayoutSpan, createGridLayoutController, createLayoutClipboardContent, createLayoutInteractions, defaultLayoutGridLabels, getIsLayoutComposing, getIsLayoutInteractiveTarget, getLayoutCellContext, getLayoutCellId, getLayoutCellStyle, getLayoutCellStyleText, getLayoutFocusTarget, getLayoutHTMLPayload, getLayoutNavigation, getLayoutRowOffset, layoutClipboardText, parseLayoutClipboardPayload, parseLayoutClipboardText };
