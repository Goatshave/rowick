import { describe, expect, it, vi } from "vitest";
import { createServerAnalyticsExportHandler, type ServerAnalyticsExportHandlerOptions } from "../src/analytics-server";
interface Query { region: string; }
interface Row { id: string; region: string; value: string; secret: string; }
const records: Row[] = [{ id: "a", region: "KR", value: "한글", secret: "private" }, { id: "b", region: "KR", value: "=SUM(1,2)", secret: "private" }, { id: "c", region: "JP", value: "Tokyo", secret: "private" }];
const payload = { version: 1, queryKey: "KR", query: { region: "KR" }, columns: ["value"], selection: null, format: "csv", maxRows: 100 };
const request = (body: unknown = payload, headers: Record<string, string> = {}, signal?: AbortSignal) => new Request("http://localhost/export", { method: "POST", headers: { "content-type": "application/json", authorization: "authorized", ...headers }, body: JSON.stringify(body), ...(signal ? { signal } : {}) });
function handler(overrides: Partial<ServerAnalyticsExportHandlerOptions<Query, Row>> = {}) {
  const getRows = vi.fn((query: Readonly<Query>) => records.filter((row) => row.region === query.region));
  const options: ServerAnalyticsExportHandlerOptions<Query, Row> = { columns: [{ id: "value", label: "Value", getValue: (row) => row.value }, { id: "secret", label: "Secret", sensitive: true, getValue: (row) => row.secret }],
    validateQuery: (input) => { if (!input || typeof input !== "object" || Object.keys(input).length !== 1 || !["KR", "JP"].includes((input as Query).region)) throw new TypeError("Query"); return { region: (input as Query).region }; },
    getQueryKey: (query) => query.region, getRows, getRowId: (row) => row.id, authorize: (request) => request.headers.get("authorization") === "authorized", authorizeColumn: () => true, authorizeRow: () => true, ...overrides };
  return { fetch: createServerAnalyticsExportHandler(options), getRows, options };
}
describe("server-side analytics export endpoint", () => {
  it("reauthorizes, filters current query data, protects text and supplies download/privacy headers", async () => {
    const { fetch } = handler(), response = await fetch(request()); expect(response.status).toBe(200);
    const text = await response.text(); expect(text).toContain("한글"); expect(text).toContain("'=SUM"); expect(text).not.toContain("Tokyo"); expect(text).not.toContain("private");
    expect(response.headers.get("cache-control")).toBe("private, no-store"); expect(response.headers.get("content-disposition")).toContain("attachment;"); expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  });
  it("rejects unauthenticated requests before parsing data or calling the provider", async () => {
    const { fetch, getRows } = handler(), response = await fetch(request(payload, { authorization: "bad" })); expect(response.status).toBe(403); expect(getRows).not.toHaveBeenCalled();
  });
  it.each([{ ...payload, version: 99 }, { ...payload, columns: ["secret"] }, { ...payload, columns: ["missing"] }, { ...payload, queryKey: "JP" }, { ...payload, query: { region: "invalid" } }, { ...payload, format: "exe" }, { ...payload, extra: true }])("rejects untrusted schemas/columns/query/format %#", async (body) => expect((await handler().fetch(request(body))).status).toBe(400));
  it("keeps explicit selection scoped to current data and ignores deleted IDs", async () => {
    const { fetch } = handler(), response = await fetch(request({ ...payload, selection: { mode: "explicit", queryKey: "KR", query: { region: "KR" }, ids: ["a", "c", "deleted"] } }));
    const text = await response.text(); expect(text).toContain("한글"); expect(text).not.toContain("SUM"); expect(text).not.toContain("Tokyo");
  });
  it("resolves all-matching exclusions and passes the captured selection to backend query planning", async () => {
    const getRows = vi.fn<ServerAnalyticsExportHandlerOptions<Query, Row>["getRows"]>(() => records), { fetch } = handler({ getRows }), response = await fetch(request({ ...payload, query: { region: "JP" }, queryKey: "JP", selection: { mode: "all-matching", queryKey: "JP", query: { region: "JP" }, excludedIds: ["a", "b"] } }));
    const text = await response.text(); expect(text).toContain("Tokyo"); expect(text).not.toContain("한글"); expect(getRows.mock.calls[0]?.[3]).toMatchObject({ mode: "all-matching", excludedIds: ["a", "b"] });
  });
  it("does not query the provider for an explicitly empty selection", async () => {
    const { fetch, getRows } = handler(); expect((await fetch(request({ ...payload, selection: { mode: "explicit", queryKey: "KR", query: { region: "KR" }, ids: [] } }))).status).toBe(200); expect(getRows).not.toHaveBeenCalled();
  });
  it("rechecks row permissions and does not send a partial file when a row is denied", async () => {
    const { fetch } = handler({ authorizeRow: (row) => row.id !== "b" }), response = await fetch(request()); expect(response.status).toBe(403); expect(await response.text()).not.toContain("한글");
  });
  it("enforces body, result, scan and server-owned row limits", async () => {
    expect((await handler().fetch(request(payload, { "content-length": "262145" }))).status).toBe(413);
    expect((await handler({ maxRows: 1 }).fetch(request())).status).toBe(413);
    expect((await handler({ maxBytes: 1 }).fetch(request())).status).toBe(413);
    expect((await handler({ maxScanRows: 1 }).fetch(request())).status).toBe(413);
  });
  it("returns cancelled status for an uncooperative pending provider", async () => {
    let resolve!: (value: Row[]) => void, entered!: () => void; const ready = new Promise<void>((done) => { entered = done; }), pending = new Promise<Row[]>((done) => { resolve = done; });
    const { fetch } = handler({ getRows: () => { entered(); return pending; } }), abort = new AbortController(), response = fetch(request(payload, {}, abort.signal));
    await ready; abort.abort(); expect((await response).status).toBe(499); resolve(records);
  });
  it("keeps internal failures private and reports source revision conflicts", async () => {
    const bad = handler({ getRows: () => { throw new Error("secret-database-connection"); } }), response = await bad.fetch(request()); expect(response.status).toBe(500); expect(await response.text()).not.toContain("secret-database");
    let revision = "one"; const source = async function* () { yield records[0]!; revision = "two"; yield records[1]!; };
    expect((await handler({ getRows: () => source(), getRevision: () => revision }).fetch(request())).status).toBe(409);
  });
});
