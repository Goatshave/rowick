import { afterEach, describe, expect, it, vi } from "vitest";
import { createEditorSearchController, formatEditorValue, parseEditorValue, type EditorChoice, type EditorField } from "../src/editors";
import { createRowEditingController } from "../src/row-editing";
import { createRowEditingForm } from "../src/editing-form";
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>((done) => { resolve = done; }); return { promise, resolve }; }
const cleanup: Array<() => void> = [];
afterEach(() => { for (const stop of cleanup.splice(0)) stop(); vi.useRealTimers(); });
const field = (kind: EditorField["kind"]): EditorField => ({ id: "value", label: "Value", kind }) as EditorField;

describe("explicit typed editor parsing", () => {
  it.each(["90071992547409931234567890.123456789", "0001.20", "-0.00", "+123.45"])("preserves decimal spelling and precision: %s", (input) => {
    expect(parseEditorValue(field("decimal"), input)).toEqual({ valid: true, value: input });
    expect(parseEditorValue(field("currency"), input)).toEqual({ valid: true, value: input });
  });
  it.each(["NaN", "Infinity", "0x10", "1,23", " ", "1_000", "12px", "9007199254740992"])("rejects unsafe or implicit numeric syntax: %s", (input) => {
    expect(parseEditorValue(field("number"), input).valid).toBe(false);
  });
  it("parses explicit binary64 values, integer constraints, bounds and currency scale", () => {
    expect(parseEditorValue(field("number"), "1.25e2")).toEqual({ valid: true, value: 125 });
    expect(parseEditorValue({ ...field("number"), kind: "number", integer: true }, "1.5").valid).toBe(false);
    expect(parseEditorValue({ id: "n", label: "N", kind: "number", min: 1, max: 3 }, "4").valid).toBe(false);
    expect(parseEditorValue({ id: "n", label: "N", kind: "currency", scale: 2 }, "1.234").valid).toBe(false);
  });
  it.each(["2024-02-29", "2000-02-29", "2026-10-25", "0001-01-01"])("keeps valid calendar dates as strings: %s", (input) => {
    expect(parseEditorValue(field("date"), input)).toEqual({ valid: true, value: input });
  });
  it.each(["2025-02-29", "1900-02-29", "2024-04-31", "2026-13-01", "0000-01-01", "2024-1-1", "2026-10-25T00:00:00Z"])("rejects invalid or timezone-bearing date input: %s", (input) => {
    expect(parseEditorValue(field("date"), input).valid).toBe(false);
  });
  it("does not coerce booleans, empty numeric input, or string option IDs", () => {
    expect(parseEditorValue(field("boolean"), "false").valid).toBe(false);
    expect(parseEditorValue(field("boolean"), false)).toEqual({ valid: true, value: false });
    expect(parseEditorValue(field("number"), "")).toEqual({ valid: true, value: "" });
    expect(parseEditorValue({ ...field("number"), required: true }, "").valid).toBe(false);
    const select: EditorField = { id: "id", label: "ID", kind: "select", choices: [{ value: "001", label: "First" }, { value: "off", label: "Disabled", disabled: true }] };
    expect(parseEditorValue(select, "001")).toEqual({ valid: true, value: "001" });
    expect(parseEditorValue(select, "off").valid).toBe(false); expect(parseEditorValue(select, "unknown").valid).toBe(false);
  });
  it("preserves multiline text and separates formatting from parsing", () => {
    expect(parseEditorValue(field("long-text"), "한글\nquoted \"value\"")).toEqual({ valid: true, value: "한글\nquoted \"value\"" });
    expect(parseEditorValue({ id: "t", label: "Text", kind: "text", maxLength: 2 }, "long").valid).toBe(false);
    expect(formatEditorValue({ ...field("currency"), format: () => "$1.20" }, "1.20")).toBe("$1.20");
    expect(parseEditorValue(field("currency"), "$1.20").valid).toBe(false);
  });
});

describe("asynchronous editor search", () => {
  it("aborts older queries and ignores responses arriving out of order", async () => {
    const old = deferred<readonly EditorChoice[]>(), fresh = deferred<readonly EditorChoice[]>(), signals: AbortSignal[] = [];
    const search = createEditorSearchController((query, signal) => { signals.push(signal); return query === "old" ? old.promise : fresh.promise; }); cleanup.push(search.dispose);
    const first = search.search("old"); await Promise.resolve(); const second = search.search("new");
    expect(signals[0]?.aborted).toBe(true); fresh.resolve([{ value: "new", label: "New" }]); await second;
    old.resolve([{ value: "old", label: "Old" }]); await first;
    expect(search.getState()).toMatchObject({ query: "new", choices: [{ value: "new" }], loading: false });
  });
  it("retains only a bounded result, rejects duplicate IDs and retries the latest query", async () => {
    let attempts = 0; const search = createEditorSearchController(async () => ++attempts === 1 ? [{ value: "a", label: "A" }, { value: "b", label: "B" }] : [{ value: "a", label: "A" }], { maxChoices: 1 }); cleanup.push(search.dispose);
    await search.search("query"); expect(search.getState().error).toMatch(/Too many/); expect(search.getState().choices).toEqual([]);
    await search.retry(); expect(search.getState().choices).toHaveLength(1);
    const duplicate = createEditorSearchController(async () => [{ value: "a", label: "A" }, { value: "a", label: "Again" }]); cleanup.push(duplicate.dispose);
    await duplicate.search(""); expect(duplicate.getState().error).toMatch(/Invalid/);
  });
  it("timeouts and disposal do not publish a late result", async () => {
    vi.useFakeTimers(); const work = deferred<readonly EditorChoice[]>(), search = createEditorSearchController(() => work.promise, { timeoutMs: 10 }); cleanup.push(search.dispose);
    const listener = vi.fn(); search.subscribe(listener); const pending = search.search(""); await vi.advanceTimersByTimeAsync(11); await pending;
    expect(search.getState().loading).toBe(false); expect(search.getState().error).toBeTruthy(); search.dispose(); listener.mockClear();
    work.resolve([{ value: "a", label: "A" }]); await Promise.resolve(); expect(listener).not.toHaveBeenCalled(); expect(search.getState().choices).toEqual([]);
  });
});

function formFixture(fields: readonly EditorField[] = [{ id: "name", label: "Name", kind: "text", required: true }, { id: "amount", label: "Amount", kind: "number", integer: true }]) {
  const rows = new Map(["a", "b"].map((id) => [id, { id, name: id, amount: 1, choice: "001" }]));
  const save = vi.fn((context) => context.candidate);
  const editor = createRowEditingController({ getRow: (id) => rows.get(id), getRowId: (row) => row.id, getValue: (row, id) => row[id as keyof typeof row],
    applyValues: (row, values) => ({ ...row, ...values }), accept: (id, row) => { rows.set(id, row); }, save });
  const form = createRowEditingForm(editor, fields); cleanup.push(() => { form.dispose(); editor.dispose(); });
  editor.begin("a"); return { rows, editor, form, save };
}
describe("shared row editing form", () => {
  it("retains invalid raw input, links its field error and blocks saving", async () => {
    const { form, rows, save } = formFixture(); form.setInput("a", "amount", "9007199254740992");
    expect(form.getState()).toMatchObject({ invalidFieldCount: 1 }); expect(form.getState().rows[0]?.fields[1]).toMatchObject({ input: "9007199254740992", error: expect.any(String) });
    expect(await form.save("a")).toEqual({ status: "invalid-input", rowId: "a" }); expect(save).not.toHaveBeenCalled(); expect(rows.get("a")?.amount).toBe(1);
    form.setInput("a", "amount", "12"); expect(await form.save("a")).toMatchObject({ status: "success" }); expect(rows.get("a")?.amount).toBe(12);
  });
  it("validates untouched required fields before submitting other changed values", async () => {
    const { editor, form, rows, save } = formFixture(); rows.set("a", { ...rows.get("a")!, name: "" }); editor.cancel("a"); editor.begin("a");
    form.setInput("a", "amount", "3"); expect(await form.save("a")).toMatchObject({ status: "invalid-input" }); expect(save).not.toHaveBeenCalled();
    expect(form.getState().rows[0]?.fields[0]?.error).toBe("Required");
  });
  it("does not parse or submit a partial IME composition", async () => {
    const { form, rows, save } = formFixture(); form.setInput("a", "name", "ㅎ", true);
    expect(await form.save("a")).toMatchObject({ status: "invalid-input" }); expect(save).not.toHaveBeenCalled(); expect(rows.get("a")?.name).toBe("a");
    form.setInput("a", "name", "한글", false); expect(await form.save("a")).toMatchObject({ status: "success" }); expect(rows.get("a")?.name).toBe("한글");
  });
  it("cancels invalid raw buffers and resets them on undo and redo", () => {
    const { editor, form } = formFixture(); form.setInput("a", "name", "changed"); form.setInput("a", "amount", "bad");
    expect(form.undo()).toBe(true); expect(form.getState().invalidFieldCount).toBe(0); expect(form.getState().rows[0]?.fields[0]?.input).toBe("a");
    expect(form.redo()).toBe(true); expect(form.getState().rows[0]?.fields[0]?.input).toBe("changed");
    form.cancel("a"); editor.begin("a"); expect(form.getState().rows[0]?.fields[0]?.input).toBe("a");
  });
  it("saves valid rows independently when a different row has invalid raw input", async () => {
    const { editor, form, rows } = formFixture(); editor.begin("b"); form.setInput("a", "amount", "bad"); form.setInput("b", "amount", "3");
    expect((await form.saveAll()).map((result) => result.status)).toEqual(["invalid-input", "success"]);
    expect(rows.get("b")?.amount).toBe(3); expect(form.getState().rows.map((row) => row.rowId)).toEqual(["a"]);
  });
  it("searches choices per row and cancels search when that row closes", async () => {
    const work = deferred<readonly EditorChoice[]>(); let signal!: AbortSignal;
    const { form, editor } = formFixture([{ id: "choice", label: "Choice", kind: "async-select", search: (_query, abort) => { signal = abort; return work.promise; } }]);
    const pending = form.search("a", "choice", "first"); await Promise.resolve(); editor.cancel("a"); expect(signal.aborted).toBe(true); await pending;
    work.resolve([{ value: "002", label: "Second" }]); expect(form.getState().rows).toEqual([]);
  });
  it("does not let disposed form subscriptions affect the data owner", () => {
    const { form, editor } = formFixture(), listener = vi.fn(); form.subscribe(listener); form.dispose(); editor.setValue("a", "name", "still usable");
    expect(listener).not.toHaveBeenCalled(); expect(() => form.setInput("a", "name", "no")).toThrow(/disposed/);
  });
});
