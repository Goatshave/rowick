import type { EditingLabels, RowEditingForm } from "@rowick/data/editing";
import type { SvelteComponentTyped } from "svelte";
export interface RowEditingPanelProps<TData = unknown> { form: RowEditingForm<TData>; idPrefix: string; labels?: Partial<EditingLabels>; }
export default class RowEditingPanel<TData = unknown> extends SvelteComponentTyped<RowEditingPanelProps<TData>> {}
