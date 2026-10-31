import { abortFailure, interruptible } from "./async-work";

export interface EditorChoice { readonly value: string; readonly label: string; readonly disabled?: boolean; }
interface EditorFieldBase {
  readonly id: string;
  readonly label: string;
  readonly readOnly?: boolean;
  readonly required?: boolean;
  readonly format?: (value: unknown) => string;
  /** Explicit opt-in parser. Successful results still satisfy the field schema. */
  readonly parse?: (input: string | boolean) => EditorParseResult;
}
/** Decimal/currency and calendar dates remain strings. Number is explicitly binary64. */
export type EditorField = EditorFieldBase & (
  | { readonly kind: "text" | "long-text"; readonly maxLength?: number }
  | { readonly kind: "number"; readonly integer?: boolean; readonly min?: number; readonly max?: number }
  | { readonly kind: "decimal" | "currency"; readonly scale?: number }
  | { readonly kind: "date" }
  | { readonly kind: "boolean" }
  | { readonly kind: "select"; readonly choices: readonly EditorChoice[] }
  | { readonly kind: "async-select"; readonly search: (query: string, signal: AbortSignal) => Promise<readonly EditorChoice[]> }
);
export type EditorParseResult = { readonly valid: true; readonly value: unknown } | { readonly valid: false; readonly message: string };
export function formatEditorValue(field: EditorField, value: unknown): string {
  return field.format?.(value) ?? (value == null ? "" : String(value));
}
export function parseEditorValue(field: EditorField, input: string | boolean, choices?: readonly EditorChoice[]): EditorParseResult {
  const invalid = (message: string): EditorParseResult => ({ valid: false, message });
  if (field.parse) {
    if (typeof input === "string" && !input.length) return field.required ? invalid("Required") : { valid: true, value: "" };
    try {
      const result = field.parse(input);
      if (!result || typeof result !== "object" || typeof result.valid !== "boolean") return invalid("Editor parser must return a validation result");
      if (!result.valid) return invalid(typeof result.message === "string" ? result.message : "Input was rejected by the editor parser");
      const { parse: _parse, ...schema } = field;
      if (field.kind === "boolean" ? typeof result.value !== "boolean" : field.kind === "number" ? typeof result.value !== "number" : typeof result.value !== "string") return invalid("Parsed value does not match the declared field type");
      const checked = parseEditorValue(schema, typeof result.value === "number" ? String(result.value) : result.value as string | boolean, choices);
      // Keep the explicit value (including -0); the built-in pass validates its
      // type/range/required/choices without reinterpreting the locale input.
      return checked.valid ? { valid: true, value: result.value } : checked;
    } catch (error) { return invalid(error instanceof Error ? error.message : "Editor parsing failed"); }
  }
  if (field.kind === "boolean") return typeof input === "boolean" ? { valid: true, value: input } : invalid("Choose true or false");
  if (typeof input !== "string") return invalid("Enter text");
  if (!input.length) return field.required ? invalid("Required") : { valid: true, value: "" };
  switch (field.kind) {
    case "text": case "long-text":
      if (field.maxLength !== undefined && input.length > field.maxLength) return invalid("Text is too long");
      return { valid: true, value: input };
    case "number": {
      if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(input)) return invalid("Enter a number using a dot as the decimal separator");
      const value = Number(input);
      if (!Number.isFinite(value) || Math.abs(value) > Number.MAX_SAFE_INTEGER || (field.integer && !Number.isSafeInteger(value))) return invalid("Number is outside its supported range");
      if ((field.min !== undefined && value < field.min) || (field.max !== undefined && value > field.max)) return invalid("Number is outside its allowed range");
      return { valid: true, value };
    }
    case "decimal": case "currency": {
      if (!/^[+-]?\d+(?:\.\d+)?$/.test(input)) return invalid("Enter a decimal using a dot as the separator");
      if (field.scale !== undefined && (input.split(".")[1]?.length ?? 0) > field.scale) return invalid("Too many decimal places");
      return { valid: true, value: input };
    }
    case "date": {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(input)) return invalid("Use YYYY-MM-DD");
      const [year, month, day] = input.split("-").map(Number) as [number, number, number];
      const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
      const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
      if (year < 1 || month < 1 || month > 12 || day < 1 || day > days[month - 1]!) return invalid("Enter a valid calendar date");
      return { valid: true, value: input };
    }
    case "select": case "async-select": {
      const choice = (field.kind === "select" ? field.choices : choices)?.find((option) => option.value === input);
      return choice && !choice.disabled ? { valid: true, value: choice.value } : invalid("Choose an available option");
    }
  }
}

export interface EditorSearchState {
  readonly query: string;
  readonly loading: boolean;
  readonly choices: readonly EditorChoice[];
  readonly error: string | undefined;
}
export interface EditorSearchController {
  getState: () => EditorSearchState;
  search: (query: string) => Promise<void>;
  retry: () => Promise<void>;
  subscribe: (listener: () => void) => () => void;
  dispose: () => void;
}
/** Keeps at most one result set. Obsolete, timed-out and disposed responses cannot publish. */
export function createEditorSearchController(
  search: (query: string, signal: AbortSignal) => Promise<readonly EditorChoice[]>,
  options: { maxChoices?: number; timeoutMs?: number } = {},
): EditorSearchController {
  const maximum = options.maxChoices ?? 200, timeout = options.timeoutMs ?? 30_000;
  if (!Number.isInteger(maximum) || maximum < 1 || maximum > 10_000 || !Number.isInteger(timeout) || timeout < 1 || timeout > 300_000) throw new TypeError("Invalid editor search limit");
  const listeners = new Set<() => void>(); let sequence = 0, disposed = false, active: AbortController | undefined;
  let state: EditorSearchState = Object.freeze({ query: "", loading: false, choices: Object.freeze([]), error: undefined });
  const publish = (next: EditorSearchState) => {
    state = Object.freeze(next);
    for (const listener of [...listeners]) if (listeners.has(listener)) {
      try { listener(); } catch (error) { queueMicrotask(() => { throw error; }); }
    }
  };
  const controller: EditorSearchController = {
    getState: () => state,
    search: async (query) => {
      if (disposed) throw new Error("Editor search is disposed");
      if (query.length > 1_000) throw new RangeError("Search query is too long");
      const generation = ++sequence; active?.abort(); active = new AbortController(); const request = active;
      publish({ query, loading: true, choices: Object.freeze([]), error: undefined });
      try {
        const result = await interruptible(() => search(query, request.signal), request, timeout);
        if (disposed || sequence !== generation || request.signal.aborted) throw abortFailure();
        if (!Array.isArray(result) || result.length > maximum) throw new TypeError("Too many editor choices");
        const ids = new Set<string>();
        const choices = result.map((choice) => {
          if (!choice || typeof choice.value !== "string" || !choice.value.length || typeof choice.label !== "string" || ids.has(choice.value)) throw new TypeError("Invalid editor choices");
          ids.add(choice.value); return Object.freeze({ value: choice.value, label: choice.label, ...(choice.disabled ? { disabled: true } : {}) });
        });
        publish({ query, loading: false, choices: Object.freeze(choices), error: undefined });
      } catch (error) {
        if (!disposed && sequence === generation) publish({ query, loading: false, choices: Object.freeze([]), error: error instanceof Error ? error.message : "Search failed" });
      } finally { if (sequence === generation) active = undefined; }
    },
    retry: () => controller.search(state.query),
    subscribe: (listener) => { if (disposed) throw new Error("Editor search is disposed"); listeners.add(listener); return () => { listeners.delete(listener); }; },
    dispose: () => { if (disposed) return; disposed = true; sequence++; active?.abort(); active = undefined; listeners.clear();
      state = Object.freeze({ query: "", loading: false, choices: Object.freeze([]), error: undefined }); },
  };
  return controller;
}
