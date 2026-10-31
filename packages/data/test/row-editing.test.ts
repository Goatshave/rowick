import { afterEach, describe, expect, it, vi } from "vitest";
import { createRowEditingController, type RowEditContext, type RowEditingOptions, type RowValidationResult } from "../src/row-editing";

interface Item { id: string; name: string; amount: number; revision: number; }
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (reason: unknown) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}
const controllers: Array<{ dispose(): void }> = [];
afterEach(() => { for (const controller of controllers.splice(0)) controller.dispose(); vi.useRealTimers(); });
function fixture(overrides: Partial<RowEditingOptions<Item>> = {}) {
  const rows = new Map(["a", "b", "c"].map((id) => [id, { id, name: id.toUpperCase(), amount: 1, revision: 1 }]));
  const accept = vi.fn((id: string, row: Item) => { rows.set(id, row); });
  const options: RowEditingOptions<Item> = {
    getRow: (id) => rows.get(id), getRowId: (row) => row.id,
    getValue: (row, id) => row[id as keyof Item], applyValues: (row, values) => ({ ...row, ...values }),
    getVersion: (row) => row.revision, accept, ...overrides,
  };
  const editor = createRowEditingController(options); controllers.push(editor);
  return { rows, editor, accept, options };
}
const flush = async () => { for (let index = 0; index < 15; index++) await Promise.resolve(); };

describe("row and batch editing", () => {
  it("projects drafts separately, preserves snapshot identity until a change, and cancels", () => {
    const { rows, editor } = fixture(), initial = editor.getState();
    expect(editor.getState()).toBe(initial);
    expect(editor.setValue("a", "name", "A")).toBe(false);
    expect(editor.getState()).toBe(initial);
    editor.setValue("a", "name", "draft");
    expect(rows.get("a")?.name).toBe("A");
    expect(editor.project("a", rows.get("a")!).name).toBe("draft");
    expect(editor.getState()).toMatchObject({ dirtyRowCount: 1, pendingCount: 0, canUndo: true });
    editor.cancel("a"); expect(editor.getState().rows).toEqual([]);
    expect(editor.project("a", rows.get("a")!)).toBe(rows.get("a"));
  });

  it("saves a complete row, accepts synchronously and removes settled drafts", async () => {
    const { rows, editor, accept } = fixture(); editor.setValues([{ rowId: "a", columnId: "name", value: "new" }, { rowId: "a", columnId: "amount", value: 3 }]);
    expect(await editor.commit("a")).toMatchObject({ status: "success", current: true });
    expect(rows.get("a")).toMatchObject({ name: "new", amount: 3 });
    expect(accept).toHaveBeenCalledTimes(1); expect(editor.getState().rows).toEqual([]);
    expect(await editor.commit("a")).toEqual({ status: "unchanged", rowId: "a" });
  });

  it("deduplicates repeated submission of the same draft", async () => {
    const work = deferred<Item>(), save = vi.fn(() => work.promise), { editor } = fixture({ save });
    editor.setValue("a", "name", "one"); const first = editor.commit("a"), second = editor.commit("a");
    expect(second).toBe(first); await flush(); expect(save).toHaveBeenCalledTimes(1);
    work.resolve({ id: "a", name: "one", amount: 1, revision: 2 }); await first;
  });

  it("keeps newer input when the first acknowledgement arrives", async () => {
    const work = deferred<Item>(), { editor, rows } = fixture({ save: () => work.promise });
    editor.setValue("a", "name", "one"); const first = editor.commit("a"); await flush();
    editor.setValue("a", "name", "two");
    work.resolve({ id: "a", name: "ONE", amount: 1, revision: 2 });
    expect(await first).toMatchObject({ status: "success", current: false });
    expect(rows.get("a")?.name).toBe("ONE");
    expect(editor.getState().rows[0]?.values).toEqual({ name: "two" });
    expect(editor.project("a", rows.get("a")!).name).toBe("two");
  });

  it("serializes validation and writes and retains server-normalized predecessor fields", async () => {
    const first = deferred<Item>(), calls: RowEditContext<Item>[] = [];
    const { editor, rows } = fixture({ save: (request) => {
      calls.push(request); return calls.length === 1 ? first.promise : { ...request.candidate, revision: 3 };
    } });
    editor.setValue("a", "name", "normalize me"); const one = editor.commit("a"); await flush();
    editor.setValue("a", "amount", 5); const two = editor.commit("a"); await flush(); expect(calls).toHaveLength(1);
    first.resolve({ id: "a", name: "NORMALIZED", amount: 1, revision: 2 });
    await Promise.all([one, two]);
    expect(calls[1]?.values).toEqual({ amount: 5 }); expect(calls[1]?.version).toBe(2);
    expect(rows.get("a")).toMatchObject({ name: "NORMALIZED", amount: 5, revision: 3 });
    expect(editor.getState().rows).toEqual([]);
  });

  it("retains a deliberately re-edited predecessor field in the next save", async () => {
    const first = deferred<Item>(), calls: RowEditContext<Item>[] = [];
    const { editor, rows } = fixture({ save: (request) => { calls.push(request); return calls.length === 1 ? first.promise : { ...request.candidate, revision: 3 }; } });
    editor.setValue("a", "name", "one"); const one = editor.commit("a"); await flush();
    editor.setValue("a", "name", "two"); const two = editor.commit("a");
    first.resolve({ id: "a", name: "ONE", amount: 1, revision: 2 }); await Promise.all([one, two]);
    expect(calls[1]?.values).toEqual({ name: "two" }); expect(rows.get("a")?.name).toBe("two");
  });

  it("does not let an older validation failure overwrite newer draft errors or text", async () => {
    const validation = deferred<RowValidationResult>(), save = vi.fn((request: RowEditContext<Item>) => request.candidate);
    const { editor } = fixture({ validate: () => validation.promise, save });
    editor.setValue("a", "name", "bad"); const work = editor.commit("a"); await flush();
    editor.setValue("a", "name", "corrected"); validation.resolve({ valid: false, errors: { name: "Invalid" } });
    expect(await work).toMatchObject({ status: "validation-error" });
    expect(editor.getState().rows[0]).toMatchObject({ values: { name: "corrected" }, errors: {} });
    expect(save).not.toHaveBeenCalled();
  });

  it("places validation errors on their fields and clears an edited field error", async () => {
    const { editor } = fixture({ validate: () => ({ valid: false, errors: { name: "Required" }, message: "Review row" }) });
    editor.setValue("a", "name", ""); expect(await editor.commit("a")).toMatchObject({ status: "validation-error", errors: { name: "Required" } });
    expect(editor.getState().rows[0]).toMatchObject({ status: "validation-error", message: "Review row", errors: { name: "Required" } });
    editor.setValue("a", "name", "okay"); expect(editor.getState().rows[0]?.errors).toEqual({});
  });

  it("bounds draft rows and pending saves without discarding existing input", async () => {
    const save = deferred<Item>(), { editor } = fixture({ maxDraftRows: 1, maxQueuedPerRow: 1, save: () => save.promise });
    editor.setValue("a", "name", "one"); expect(() => editor.setValue("b", "name", "two")).toThrow(/limit/);
    const first = editor.commit("a"); await flush(); editor.setValue("a", "name", "two");
    await expect(editor.commit("a")).rejects.toThrow(/limit/); expect(editor.getState().rows[0]?.values).toEqual({ name: "two" });
    editor.cancelAll(); await first;
  });

  it("has one undo boundary for a multi-row paste and supports redo", () => {
    const { editor } = fixture(); editor.setValues([{ rowId: "a", columnId: "name", value: "one" }, { rowId: "b", columnId: "amount", value: 9 }]);
    expect(editor.getState().dirtyRowCount).toBe(2); expect(editor.undo()).toBe(true); expect(editor.getState().rows).toEqual([]);
    expect(editor.redo()).toBe(true); expect(editor.getState().dirtyRowCount).toBe(2);
  });

  it("rejects a batch with an unknown row atomically", () => {
    const { editor } = fixture(), before = editor.getState();
    expect(() => editor.setValues([{ rowId: "a", columnId: "name", value: "changed" }, { rowId: "missing", columnId: "name", value: "bad" }])).toThrow(/loaded/);
    expect(editor.getState()).toBe(before);
  });

  it("rejects a batch containing a denied field atomically and blocks individual edits", () => {
    const { editor } = fixture({ canEdit: (_row, column) => column !== "amount" }), before = editor.getState();
    expect(editor.setValue("a", "amount", 4)).toBe(false); expect(editor.getState()).toBe(before);
    expect(() => editor.setValues([{ rowId: "a", columnId: "name", value: "one" }, { rowId: "b", columnId: "amount", value: 5 }])).toThrow(/read-only/);
    expect(editor.getState()).toBe(before);
  });

  it("rechecks permissions after asynchronous validation before writing", async () => {
    let allowed = true; const validation = deferred<RowValidationResult>(), save = vi.fn((request: RowEditContext<Item>) => request.candidate);
    const { editor } = fixture({ canEdit: () => allowed, validate: () => validation.promise, save });
    editor.setValue("a", "name", "change"); const work = editor.commit("a"); await flush();
    allowed = false; validation.resolve({ valid: true }); expect(await work).toMatchObject({ status: "validation-error", errors: { name: "Read-only field" } });
    expect(save).not.toHaveBeenCalled();
  });

  it("rejects a stale row before saving and can explicitly rebase the draft", async () => {
    const save = vi.fn((request: RowEditContext<Item>) => ({ ...request.candidate, revision: request.candidate.revision + 1 }));
    const { editor, rows } = fixture({ save }); editor.setValue("a", "name", "mine"); rows.set("a", { ...rows.get("a")!, amount: 5, revision: 2 });
    editor.reconcile(); expect(editor.getState().rows[0]?.status).toBe("conflict");
    expect(await editor.commit("a")).toMatchObject({ status: "conflict" }); expect(save).not.toHaveBeenCalled();
    editor.rebase("a"); expect(await editor.commit("a")).toMatchObject({ status: "success" });
    expect(rows.get("a")).toMatchObject({ name: "mine", amount: 5, revision: 3 });
  });

  it("detects authoritative changes during validation", async () => {
    const validation = deferred<RowValidationResult>(), save = vi.fn((request: RowEditContext<Item>) => request.candidate);
    const { editor, rows } = fixture({ validate: () => validation.promise, save }); editor.setValue("a", "name", "mine"); const work = editor.commit("a"); await flush();
    rows.set("a", { ...rows.get("a")!, revision: 2 }); validation.resolve({ valid: true });
    expect(await work).toMatchObject({ status: "conflict" }); expect(save).not.toHaveBeenCalled();
  });

  it("discards an acknowledgement when the authoritative version changed during transport", async () => {
    const save = deferred<Item>(), { editor, rows, accept } = fixture({ save: () => save.promise });
    editor.setValue("a", "name", "mine"); const work = editor.commit("a"); await flush();
    rows.set("a", { ...rows.get("a")!, name: "other writer", revision: 9 }); save.resolve({ id: "a", name: "mine", amount: 1, revision: 2 });
    expect(await work).toMatchObject({ status: "stale" }); expect(accept).not.toHaveBeenCalled(); expect(rows.get("a")?.name).toBe("other writer");
  });

  it("does not apply acknowledgements from a previous query", async () => {
    let query = "one"; const save = deferred<Item>(), { editor, accept } = fixture({ getContextKey: () => query, save: () => save.promise });
    editor.setValue("a", "name", "mine"); const work = editor.commit("a"); await flush(); query = "two";
    save.resolve({ id: "a", name: "mine", amount: 1, revision: 2 });
    expect(await work).toMatchObject({ status: "cancelled" }); expect(accept).not.toHaveBeenCalled(); editor.reconcile();
    expect(editor.getState().rows[0]?.status).toBe("conflict");
  });

  it("aborts cancelled work and preserves a reopened draft against late results", async () => {
    const save = deferred<Item>(); let signal!: AbortSignal;
    const { editor, accept } = fixture({ save: (request) => { signal = request.signal; return save.promise; } });
    editor.setValue("a", "name", "old"); const work = editor.commit("a"); await flush();
    editor.cancel("a"); editor.setValue("a", "name", "new"); expect(signal.aborted).toBe(true);
    expect(await work).toMatchObject({ status: "cancelled" }); save.resolve({ id: "a", name: "old", amount: 1, revision: 2 }); await flush();
    expect(accept).not.toHaveBeenCalled(); expect(editor.getState().rows[0]?.values).toEqual({ name: "new" });
  });

  it("retries transport failures with the same operation ID", async () => {
    const calls: string[] = []; let attempts = 0;
    const { editor } = fixture({ save: (request) => { calls.push(request.operationId); if (++attempts === 1) throw new Error("Lost response"); return request.candidate; } });
    editor.setValue("a", "name", "mine"); expect(await editor.commit("a")).toMatchObject({ status: "error" });
    expect(await editor.retry("a")).toMatchObject({ status: "success" }); expect(calls).toHaveLength(2); expect(calls[1]).toBe(calls[0]);
  });

  it("does not resend an acknowledged write when applying its result failed", async () => {
    let rejectApply = true; const save = vi.fn((request: RowEditContext<Item>) => request.candidate);
    const { editor, rows } = fixture({ save, accept: (id, row) => { if (rejectApply) throw new Error("Owner failed"); rows.set(id, row); } });
    editor.setValue("a", "name", "mine"); expect(await editor.commit("a")).toMatchObject({ status: "apply-error" });
    rejectApply = false; expect(await editor.retry("a")).toMatchObject({ status: "success" }); expect(save).toHaveBeenCalledTimes(1);
  });

  it("requires a new submission after editing a failed draft", async () => {
    const { editor } = fixture({ save: () => { throw new Error("offline"); } }); editor.setValue("a", "name", "first"); await editor.commit("a");
    editor.setValue("a", "name", "second"); expect(() => editor.retry("a")).toThrow(/changed/);
  });

  it("reports partial batch success independently and retains failed rows", async () => {
    const { editor, rows } = fixture({ validate: (request) => request.rowId === "b" ? { valid: false, errors: { amount: "Too much" } } : { valid: true } });
    editor.setValues([{ rowId: "a", columnId: "amount", value: 3 }, { rowId: "b", columnId: "amount", value: 9 }]);
    expect((await editor.commitAll()).map((result) => result.status)).toEqual(["success", "validation-error"]);
    expect(rows.get("a")?.amount).toBe(3); expect(rows.get("b")?.amount).toBe(1); expect(editor.getState().rows.map((row) => row.rowId)).toEqual(["b"]);
  });

  it("bounds work across rows and removes cancelled jobs waiting for a slot", async () => {
    const first = deferred<Item>(), calls: string[] = [];
    const { editor } = fixture({ concurrency: 1, save: (request) => { calls.push(request.rowId); return request.rowId === "a" ? first.promise : request.candidate; } });
    editor.setValues(["a", "b", "c"].map((rowId) => ({ rowId, columnId: "name", value: "changed" })));
    const a = editor.commit("a"), b = editor.commit("b"), c = editor.commit("c"); await flush(); expect(calls).toEqual(["a"]);
    editor.cancel("b"); expect(await b).toMatchObject({ status: "cancelled" });
    first.resolve({ id: "a", name: "changed", amount: 1, revision: 2 }); await Promise.all([a, c]); expect(calls).toEqual(["a", "c"]);
  });

  it("times out a non-cooperative provider and ignores its late response", async () => {
    vi.useFakeTimers(); const save = deferred<Item>(), { editor, accept } = fixture({ timeoutMs: 20, save: () => save.promise });
    editor.setValue("a", "name", "mine"); const work = editor.commit("a"); await flush(); await vi.advanceTimersByTimeAsync(21);
    expect(await work).toMatchObject({ status: "cancelled" }); expect(editor.getState().pendingCount).toBe(0);
    save.resolve({ id: "a", name: "late", amount: 1, revision: 2 }); await flush(); expect(accept).not.toHaveBeenCalled();
  });

  it("disposes idempotently without late reads, notifications or application", async () => {
    const save = deferred<Item>(), source = fixture({ save: () => save.promise });
    const listener = vi.fn(); source.editor.subscribe(listener); source.editor.setValue("a", "name", "mine"); const work = source.editor.commit("a"); await flush();
    const reader = vi.spyOn(source.options, "getRow"), context = vi.fn(() => "unused"); source.options.getContextKey = context;
    source.editor.dispose(); source.editor.dispose(); reader.mockClear(); listener.mockClear();
    save.resolve({ id: "a", name: "late", amount: 1, revision: 2 }); await work; await flush();
    expect(reader).not.toHaveBeenCalled(); expect(context).not.toHaveBeenCalled(); expect(listener).not.toHaveBeenCalled(); expect(source.accept).not.toHaveBeenCalled();
    expect(source.editor.getState().rows).toEqual([]); expect(() => source.editor.setValue("a", "name", "no")).toThrow(/disposed/);
  });

  it("rejects changed identities in save responses", async () => {
    const { editor, accept } = fixture({ save: (request) => ({ ...request.candidate, id: "other" }) }); editor.setValue("a", "name", "mine");
    expect(await editor.commit("a")).toMatchObject({ status: "error" }); expect(accept).not.toHaveBeenCalled();
  });

  it("rejects draft identity changes before transport and bounds sparse field input", async () => {
    const save = vi.fn((request: RowEditContext<Item>) => request.candidate), { editor } = fixture({ save, maxFieldsPerRow: 1 });
    editor.setValue("a", "id", "different"); expect(await editor.commit("a")).toMatchObject({ status: "error" }); expect(save).not.toHaveBeenCalled();
    expect(() => editor.setValue("a", "name", "two")).toThrow(/field limit/); expect(editor.getState().rows[0]?.values).toEqual({ id: "different" });
  });

  it("returns own-only errors for special column names and rejects malformed validator errors", async () => {
    const { editor } = fixture({ validate: () => ({ valid: false, errors: JSON.parse('{"__proto__":"Denied"}') }) });
    editor.setValue("a", "name", "mine"); await editor.commit("a");
    expect(Object.getPrototypeOf(editor.getState().rows[0]?.errors)).toBeNull(); expect(editor.getState().rows[0]?.errors["__proto__"]).toBe("Denied");
    const malformed = fixture({ validate: () => ({ valid: false, errors: { name: {} } as never }) });
    malformed.editor.setValue("a", "name", "mine"); expect(await malformed.editor.commit("a")).toMatchObject({ status: "error" });
  });

  it("clears local draft history on acknowledgement and does not undo server writes", async () => {
    const { editor, rows } = fixture(); editor.setValue("a", "name", "mine"); await editor.commit("a");
    expect(editor.undo()).toBe(false); expect(rows.get("a")?.name).toBe("mine");
  });

  it("blocks undo during pending work and rejects history after external row changes", async () => {
    const work = deferred<Item>(), { editor, rows } = fixture({ save: () => work.promise }); editor.setValue("a", "name", "mine"); const pending = editor.commit("a"); await flush();
    expect(editor.undo()).toBe(false); editor.cancelAll(); await pending;
    editor.setValue("a", "name", "first"); editor.setValue("a", "name", "second"); rows.set("a", { ...rows.get("a")!, revision: 2 });
    expect(() => editor.undo()).toThrow(/changed/);
  });

  it("does not leave pending counters behind when operation-ID creation fails", async () => {
    const { editor } = fixture({ createOperationId: () => "" }); editor.setValue("a", "name", "mine");
    await expect(editor.commit("a")).rejects.toThrow(/operation ID/); expect(editor.getState().pendingCount).toBe(0);
  });

  it("supports listener unsubscription and reentrant edits without duplicate submission", async () => {
    const work = deferred<Item>(), save = vi.fn(() => work.promise), { editor } = fixture({ save });
    editor.setValue("a", "name", "mine"); let repeated: Promise<unknown> | undefined;
    const stop = editor.subscribe(() => { if (editor.getState().pendingCount && !repeated) repeated = editor.commit("a"); });
    const first = editor.commit("a"); await flush(); expect(repeated).toBe(first); expect(save).toHaveBeenCalledTimes(1);
    stop(); work.resolve({ id: "a", name: "mine", amount: 1, revision: 2 }); await first;
  });

  it.each([{ maxDraftRows: 0 }, { maxQueuedPerRow: 101 }, { concurrency: 1.5 }, { timeoutMs: Infinity }])("rejects invalid limits %#", (options) => {
    expect(() => fixture(options)).toThrow(/limit/);
  });
});
