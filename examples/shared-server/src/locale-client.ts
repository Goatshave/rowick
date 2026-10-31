import { createLocaleDateCodec, createLocaleNumberCodec } from "@rowick/data/locale";
import { createRowEditingController, createRowEditingForm, type EditingLabels, type EditorField, type RowEditingForm } from "@rowick/data/editing";
import type { AnyColumnDef } from "@rowick/core";
export const localeExampleLocales = ["en-US", "de-DE", "fr-FR", "ko-KR", "ja-JP", "hi-IN", "ar-EG"] as const;
export interface LocaleRecord { id: string; reference: string; name: string; decimal: string; money: string; number: number; date: string; revision: number; }
const initial: LocaleRecord = { id: "a", reference: "00123", name: "김정현 / 日本語 / مرحبا", decimal: "9007199254740993.123400", money: "-9007199254740993.12", number: 1234.5, date: "2024-02-29", revision: 1 };
function profile(locale: string) {
  const decimal = createLocaleNumberCodec({ locale }), money = createLocaleNumberCodec({ locale, style: "currency", currency: "USD", currencyDisplay: "code", currencySign: "accounting", currencyInput: "optional", maximumFractionDigits: 2 });
  const number = createLocaleNumberCodec({ locale, valueType: "number", maximumFractionDigits: 10 }), date = createLocaleDateCodec({ locale });
  const fields: readonly EditorField[] = [
    { id: "reference", label: "Reference ID", kind: "text", required: true, maxLength: 100 },
    { id: "name", label: "Name", kind: "long-text", required: true, maxLength: 1000 },
    { id: "decimal", label: "Exact decimal", kind: "decimal", required: true, parse: decimal.parse, format: (value) => decimal.format(value as string) },
    { id: "money", label: "Money", kind: "currency", scale: 2, required: true, parse: money.parse, format: (value) => money.format(value as string) },
    { id: "number", label: "Number", kind: "number", required: true, parse: number.parse, format: (value) => number.format(value as number) },
    // HTML date input values are ISO regardless of displayed locale. This is an
    // explicit text editor with a localized parser, not a changed native input.
    { id: "date", label: "Calendar", kind: "text", required: true, maxLength: 128, parse: date.parse, format: (value) => date.format(value as string) },
  ];
  const columns: readonly AnyColumnDef<LocaleRecord>[] = [
    { accessorKey: "reference", header: "Reference ID" }, { accessorKey: "name", header: "Name", size: 260 },
    { accessorKey: "decimal", header: "Exact decimal", size: 260, cell: ({ value }) => decimal.format(value as string) },
    { accessorKey: "money", header: "Money", size: 260, cell: ({ value }) => money.format(value as string) },
    { accessorKey: "date", header: "Calendar", cell: ({ value }) => date.format(value as string) },
  ];
  return { locale: decimal.locale, decimal, money, number, date, fields, columns };
}
function translatedLabels(locale: string): Partial<EditingLabels> {
  if (locale.startsWith("ko")) return { panel: "행 편집", save: "행 저장", saveAll: "모두 저장", cancel: "행 취소", cancelAll: "모두 취소", undo: "초안 실행 취소", redo: "초안 다시 실행", row: (id) => `행 ${id}`,
    summary: (dirty, pending, invalid) => `초안 ${dirty}개, 저장 ${pending}개, 잘못된 입력 ${invalid}개` };
  if (locale.startsWith("ja")) return { panel: "行の編集", save: "行を保存", saveAll: "すべて保存", cancel: "行を取消", cancelAll: "すべて取消", undo: "下書きを元に戻す", redo: "下書きをやり直す", row: (id) => `行 ${id}`,
    summary: (dirty, pending, invalid) => `下書き ${dirty}件、保存中 ${pending}件、入力エラー ${invalid}件` };
  if (locale.startsWith("ar")) return { panel: "تحرير الصف", save: "حفظ الصف", saveAll: "حفظ الكل", cancel: "إلغاء الصف", cancelAll: "إلغاء الكل", undo: "تراجع عن المسودة", redo: "إعادة المسودة", row: (id) => `الصف ${id}`,
    summary: (dirty, pending, invalid) => `${dirty} مسودات، ${pending} قيد الحفظ، ${invalid} حقول غير صالحة` };
  return {};
}
export function createLocaleExample(initialLocale = "en-US") {
  let current = profile(initialLocale), rows: readonly LocaleRecord[] = [{ ...initial }], message = "Ready", disposed = false;
  const listeners = new Set<() => void>(), publish = () => { if (!disposed) for (const listener of listeners) listener(); };
  const editor = createRowEditingController<LocaleRecord>({ getRow: (id) => rows.find((row) => row.id === id), getRowId: (row) => row.id, getVersion: (row) => row.revision,
    getValue: (row, id) => row[id as keyof LocaleRecord], applyValues: (row, values) => ({ ...row, ...values }),
    accept: (id, row) => { rows = rows.map((record) => record.id === id ? row : record); publish(); },
    save: async (request) => {
      await new Promise<void>((resolve, reject) => {
        const cancel = () => { clearTimeout(timer); request.signal.removeEventListener("abort", cancel); reject(new DOMException("Cancelled", "AbortError")); };
        const timer = setTimeout(() => { request.signal.removeEventListener("abort", cancel); resolve(); }, 30); request.signal.addEventListener("abort", cancel, { once: true });
      });
      return { ...request.candidate, revision: request.candidate.revision + 1 };
    },
  });
  let form: RowEditingForm<LocaleRecord> = createRowEditingForm(editor, current.fields); editor.begin("a");
  let stopForm = form.subscribe(publish); const stopEditor = editor.subscribe(publish);
  return {
    editor, getForm: () => form, getLocale: () => current.locale, getDirection: () => current.locale.startsWith("ar") ? "rtl" as const : "ltr" as const,
    getRows: () => rows, getProjectedRows: () => rows.map((row) => editor.project(row.id, row)), getColumns: () => current.columns,
    getLabels: () => translatedLabels(current.locale), getMessage: () => message,
    getSamples: () => ({ decimal: current.decimal.format("1234567.89"), money: current.money.format("-1234567.89"), number: current.number.format(1234.5), date: current.date.format("2024-02-29"), datePattern: current.date.pattern,
      largeDecimal: current.decimal.format("999999999999999999999.123400"), largeMoney: current.money.format("-999999999999999999999.12") }),
    setLocale: (locale: string) => {
      if (disposed) throw new Error("Locale example is disposed");
      if (form.getState().invalidFieldCount) { message = "Finish composition or correct invalid raw input before changing locale"; publish(); return false; }
      try {
        const next = profile(locale), nextForm = createRowEditingForm(editor, next.fields); stopForm(); form.dispose(); current = next; form = nextForm; stopForm = form.subscribe(publish);
        message = "Locale changed; canonical drafts preserved"; publish(); return true;
      } catch (error) { message = error instanceof Error ? error.message : "Unsupported locale"; publish(); return false; }
    },
    edit: () => editor.begin("a"),
    subscribe: (listener: () => void) => { if (disposed) throw new Error("Locale example is disposed"); listeners.add(listener); return () => { listeners.delete(listener); }; },
    dispose: () => { if (disposed) return; disposed = true; stopForm(); stopEditor(); form.dispose(); editor.dispose(); listeners.clear(); },
  };
}
export type LocaleExample = ReturnType<typeof createLocaleExample>;
