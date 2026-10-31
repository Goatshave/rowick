import { describe, expect, it, vi } from "vitest";
import { assertExportText, createAnalyticsExportJob, createDelimitedExporter, createPrintExporter, createServerAnalyticsExportRequest, resolveExportMerges, validateExportMerges,
  type AnalyticsExportColumn, type AnalyticsExporter } from "../src/analytics-export";
interface RecordRow { name: string; amount: number; secret?: string; }
const columns: readonly AnalyticsExportColumn<RecordRow>[] = [{ id: "name", label: "Name", getValue: (row) => row.name }, { id: "amount", label: "Amount", type: "number", getValue: (row) => row.amount }, { id: "secret", label: "Secret", sensitive: true, getValue: (row) => row.secret }];
const rows = [{ name: "한글", amount: 2, secret: "private" }, { name: '=HYPERLINK("https://example.invalid")', amount: -3, secret: "private" }];
const text = (artifact: { bytes: Uint8Array }) => new TextDecoder().decode(artifact.bytes);
const artifact = { filename: "custom.txt", mimeType: "text/plain", bytes: new Uint8Array([1]) };
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>((done) => { resolve = done; }); return { promise, resolve }; }
describe("bounded export jobs", () => {
  it("protects formula-like text, keeps numeric negatives numeric and excludes sensitive fields", async () => {
    const job = createAnalyticsExportJob({ rows, columns, scope: "filtered", totalRows: rows.length }, { exporter: createDelimitedExporter() });
    const result = await job.start(); expect(text(result)).toContain("한글,2"); expect(text(result)).toContain("'" + '=HYPERLINK'); expect(text(result)).toContain(",-3"); expect(text(result)).not.toContain("private");
    expect(job.getState()).toMatchObject({ status: "success", progress: 1, rowsProcessed: 2 }); expect(job.start()).toBe(job.start()); job.dispose();
  });
  it("requires an explicit authorization result before including sensitive columns", async () => {
    const excluded = createAnalyticsExportJob({ rows, columns, scope: "all" }, { exporter: createDelimitedExporter(), includeSensitive: true });
    expect(text(await excluded.start())).not.toContain("private");
    const permitted = createAnalyticsExportJob({ rows, columns, scope: "all" }, { exporter: createDelimitedExporter(), includeSensitive: true, authorizeColumn: () => true });
    expect(text(await permitted.start())).toContain("private"); excluded.dispose(); permitted.dispose();
  });
  it("rechecks changing authorization before accessing a column and aborts atomically", async () => {
    let allowed = true; const getter = vi.fn((row: RecordRow) => row.name);
    async function* source() { yield rows[0]!; allowed = false; yield rows[1]!; }
    const job = createAnalyticsExportJob({ rows: source(), columns: [{ id: "name", label: "Name", getValue: getter }], scope: "all" }, { exporter: createDelimitedExporter(), authorizeColumn: () => allowed });
    await expect(job.start()).rejects.toThrow(/authorization/); expect(getter).toHaveBeenCalledTimes(1); expect(job.getState().status).toBe("error"); job.dispose();
  });
  it("yields progress and supports an asynchronous server-backed source", async () => {
    const progress: number[] = []; async function* source() { for (let index = 0; index < 450; index++) yield { name: String(index), amount: index }; }
    const job = createAnalyticsExportJob({ rows: source(), columns, scope: "all", totalRows: 450 }, { exporter: createDelimitedExporter() }); job.subscribe(() => { const value = job.getState().progress; if (value !== undefined) progress.push(value); });
    await job.start(); expect(progress.length).toBeGreaterThan(5); expect(progress.every((value, index) => index === 0 || value >= progress[index - 1]!)).toBe(true); job.dispose();
  });
  it("cancels an uncooperative pending row read without waiting for the provider", async () => {
    const pending = deferred<IteratorResult<RecordRow>>(), close = vi.fn(() => Promise.resolve({ done: true as const, value: undefined }));
    const source = { [Symbol.asyncIterator]: () => ({ next: () => pending.promise, return: close }) };
    const job = createAnalyticsExportJob({ rows: source, columns, scope: "all" }, { exporter: createDelimitedExporter() }), work = job.start(); await Promise.resolve(); job.cancel();
    await expect(work).rejects.toMatchObject({ name: "AbortError" }); expect(close).toHaveBeenCalledTimes(1); pending.resolve({ done: false, value: rows[0]! }); job.dispose();
  });
  it("cancels an uncooperative encoder and ignores its late artifact", async () => {
    const pending = deferred<typeof artifact>(), entered = deferred<void>(), job = createAnalyticsExportJob({ rows: [], columns, scope: "all" }, { exporter: () => { entered.resolve(); return pending.promise; } });
    const work = job.start(); await entered.promise; job.cancel(); await expect(work).rejects.toMatchObject({ name: "AbortError" }); pending.resolve(artifact); expect(job.getState().status).toBe("cancelled"); job.dispose();
  });
  it("fences a source revision change and stops before emitting a result", async () => {
    let revision = "one"; async function* source() { yield rows[0]!; revision = "two"; yield rows[1]!; }
    const encoder = vi.fn(() => artifact), job = createAnalyticsExportJob({ rows: source(), columns, scope: "all", revision: "one", getCurrentRevision: () => revision }, { exporter: encoder });
    await expect(job.start()).rejects.toThrow(/revision changed/); expect(encoder).not.toHaveBeenCalled(); job.dispose();
  });
  it.each([{ maxRows: 1 }, { maxCells: 2 }, { maxTextCharacters: 2 }, { maxArtifactBytes: 1 }])("rejects explicit row/cell/text/byte overflow %#", async (limit) => {
    const job = createAnalyticsExportJob({ rows, columns, scope: "all" }, { exporter: createDelimitedExporter(), ...limit }); await expect(job.start()).rejects.toThrow(/limit|budget/); job.dispose();
  });
  it.each([{ maxCells: 1 }, { maxTextCharacters: 1 }])("enforces header budgets for empty exports before reading or encoding %#", async (limit) => {
    const next = vi.fn(() => ({ done: true as const, value: undefined }));
    const exporter = vi.fn<AnalyticsExporter>(() => artifact);
    const job = createAnalyticsExportJob({ rows: { [Symbol.iterator]: () => ({ next }) }, columns: columns.slice(0, 2), scope: "all" }, { ...limit, exporter });
    await expect(job.start()).rejects.toThrow(/limit|budget/);
    expect(next).not.toHaveBeenCalled(); expect(exporter).not.toHaveBeenCalled();
    expect(job.getState()).toMatchObject({ status: "error", rowsProcessed: 0 }); job.dispose();
  });
  it("allows an empty export exactly at the header cell and text budgets", async () => {
    const job = createAnalyticsExportJob({ rows: [], columns: columns.slice(0, 2), scope: "all" },
      { maxCells: 2, maxTextCharacters: "NameAmount".length, exporter: createDelimitedExporter() });
    expect(text(await job.start())).toBe("Name,Amount"); expect(job.getState().status).toBe("success"); job.dispose();
  });
  it("counts the complete rectangular header and text content of grouped empty exports", async () => {
    const grouped = [
      { ...columns[0]!, headers: ["Identity"] },
      { ...columns[1]!, headers: ["Sales", "Amount"] },
    ];
    const job = createAnalyticsExportJob({ rows: [], columns: grouped, scope: "all" }, { maxCells: 3, exporter: createDelimitedExporter() });
    await expect(job.start()).rejects.toThrow(/limit|budget/); job.dispose();
    const exact = createAnalyticsExportJob({ rows: [], columns: grouped, scope: "all" },
      { maxCells: 4, maxTextCharacters: "IdentitySalesAmount".length, exporter: createDelimitedExporter() });
    expect(text(await exact.start())).toBe("Identity,Sales\r\n,Amount"); exact.dispose();
  });
  it("builds merged hierarchical headers and masks covered body values for every exporter", async () => {
    const inspect = vi.fn<AnalyticsExporter>((document) => {
      expect(document.headers).toEqual([["Identity", "Sales", ""], ["", "Count", "Amount"]]); expect(document.merges).toHaveLength(3);
      expect(document.rows[0]?.[1]?.value).toBeNull(); return artifact;
    });
    const job = createAnalyticsExportJob({ rows: [rows[0]!], scope: "all", columns: [columns[0]!, { ...columns[1]!, id: "count", headers: ["Sales", "Count"] }, { ...columns[1]!, headers: ["Sales", "Amount"] }].map((column, index) => index ? column : { ...column, label: "Identity" }), merges: [{ startRow: 2, startColumn: 0, rowSpan: 1, columnSpan: 2 }] }, { exporter: inspect });
    await job.start(); expect(inspect).toHaveBeenCalledTimes(1); job.dispose();
  });
  it("preserves quoted/newline TSV text and exact decimal strings", async () => {
    const job = createAnalyticsExportJob({ rows: [{ value: '한글\n"quoted"\tvalue', decimal: "9007199254740993.123" }], scope: "page", columns: [{ id: "value", label: "Value", getValue: (row) => row.value }, { id: "decimal", label: "Decimal", type: "decimal", getValue: (row) => row.decimal }] }, { exporter: createDelimitedExporter({ delimiter: "\t" }) });
    const result = await job.start(); expect(text(result)).toContain('"한글\n""quoted""\tvalue"'); expect(text(result)).toContain("9007199254740993.123"); job.dispose();
  });
  it("produces standalone printable escaped HTML without scripts or popup assumptions", async () => {
    const job = createAnalyticsExportJob({ rows: [{ name: "<script>alert(1)</script>", amount: 3 }], columns, scope: "selection" }, { exporter: createPrintExporter({ orientation: "landscape" }), title: 'Orders & "quotes"' });
    const output = text(await job.start()); expect(output).toContain("&lt;script&gt;"); expect(output).not.toContain("<script>"); expect(output).toContain("thead{display:table-header-group}"); expect(output).toContain("size:A4 landscape"); job.dispose();
  });
  it("rejects unsafe numeric/date/text cells and illegal XML characters", async () => {
    for (const [type, value] of [["number", 9007199254740992], ["date", "1900-02-29"], ["datetime", "2024-01-01T00:00:00+09:00"], ["boolean", "true"], ["text", {}]] as const) {
      const job = createAnalyticsExportJob({ rows: [value], scope: "all", columns: [{ id: "v", label: "V", type, getValue: (row) => row }] }, { exporter: createDelimitedExporter() }); await expect(job.start()).rejects.toThrow(); job.dispose();
    }
    for (const value of ["\u0000", "\uD800", "\uFFFF", "a".repeat(32768)]) expect(() => assertExportText(value)).toThrow();
    expect(() => assertExportText("한글\n\t\r😀")).not.toThrow();
  });
  it("does not notify disposed listeners after cancellation or accept regressing exporter progress", async () => {
    const pending = deferred<typeof artifact>(), ready = deferred<void>(), job = createAnalyticsExportJob({ rows: [], columns, scope: "all" }, { exporter: () => { ready.resolve(); return pending.promise; } });
    const listener = vi.fn(); job.subscribe(listener); const work = job.start(); await ready.promise; job.dispose(); listener.mockClear(); await expect(work).rejects.toThrow(); pending.resolve(artifact); expect(listener).not.toHaveBeenCalled();
    const regression = createAnalyticsExportJob({ rows: [], columns, scope: "all" }, { exporter: (_document, context) => { context.progress(.8); context.progress(.1); return artifact; } });
    await expect(regression.start()).rejects.toThrow(/progress/); regression.dispose();
  });
});
describe("export merge and server selection contracts", () => {
  it("maps stable-ID spans to scoped numeric ranges and rejects partial/reordered scope", () => {
    const spans = [{ start: { rowId: "a", columnId: "name" }, rowSpan: 2, columnSpan: 1 }];
    expect(resolveExportMerges(spans, ["a", "b", "c"], ["name", "amount"], ["a", "b"], ["name", "amount"], 2)).toEqual([{ startRow: 2, startColumn: 0, rowSpan: 2, columnSpan: 1 }]);
    expect(() => resolveExportMerges(spans, ["a", "b"], ["name"], ["a"], ["name"])).toThrow(/splits/);
    expect(() => resolveExportMerges(spans, ["a", "b"], ["name"], ["b", "a"], ["name"])).toThrow(/reorders/);
    expect(() => validateExportMerges([{ startRow: 0, startColumn: 0, rowSpan: 2, columnSpan: 1 }, { startRow: 1, startColumn: 0, rowSpan: 1, columnSpan: 1 }], 2, 1)).toThrow(/overlap/);
    expect(() => validateExportMerges([{ startRow: 0, startColumn: 0, rowSpan: 2, columnSpan: 1 }], 2, 1, 1)).toThrow(/header\/data/);
  });
  it("captures immutable whole-query exclusions and enforces the allowed column/query scope", () => {
    const query = { status: "Open" }, exclusions = ["deleted"], selection = { mode: "all-matching" as const, queryKey: "open", query, excludedIds: exclusions };
    const result = createServerAnalyticsExportRequest({ queryKey: "open", query, selection, columns: ["name"], allowedColumns: ["name"], format: "xlsx" });
    query.status = "Closed"; exclusions.push("later"); expect(result.query.status).toBe("Open"); expect(result.selection?.mode === "all-matching" && result.selection.excludedIds).toEqual(["deleted"]);
    expect(() => createServerAnalyticsExportRequest({ queryKey: "closed", query, selection, columns: ["name"], allowedColumns: ["name"], format: "xlsx" })).toThrow(/selection/);
    expect(() => createServerAnalyticsExportRequest({ queryKey: "open", query, columns: ["secret"], allowedColumns: ["name"], format: "xlsx" })).toThrow(/request/);
  });
});
