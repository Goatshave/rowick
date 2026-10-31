import { DefineComponent } from 'vue';
import { RowEditingForm, EditingLabels } from '@rowick/data/editing';

interface RowEditingPanelProps<TData> {
    form: RowEditingForm<TData>;
    idPrefix: string;
    labels?: Partial<EditingLabels>;
}
/** Factory preserves product data types in Vue templates and render functions. */
declare function createRowEditingPanel<TData>(): DefineComponent<RowEditingPanelProps<TData>>;
declare const RowEditingPanel: DefineComponent<RowEditingPanelProps<unknown>>;

export { RowEditingPanel, type RowEditingPanelProps, createRowEditingPanel };
